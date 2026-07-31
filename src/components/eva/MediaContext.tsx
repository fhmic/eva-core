import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  indexAudio,
  searchLocal,
  trackObjectUrl,
  type AnyTrack,
  type Track,
  type WebTrack,
} from "@/lib/media";
import type { DirectoryHandleLike } from "@/lib/workspace";
import { webMusicSearch } from "@/lib/media.functions";

export type RepeatMode = "off" | "all" | "one";

type MediaState = {
  index: Track[];
  indexing: boolean;
  current: AnyTrack | null;
  playing: boolean;
  volume: number;
  progress: number;
  duration: number;
  queue: AnyTrack[];
  lastResults: AnyTrack[];
  status: string;
  repeat: RepeatMode;
  shuffle: boolean;
  searching: boolean;
};

type MediaApi = MediaState & {
  indexDirectory: (dir: DirectoryHandleLike | null) => Promise<number>;
  searchLocalMusic: (query: string, folderPath?: string) => Track[];
  playTrack: (track: AnyTrack, queue?: AnyTrack[]) => Promise<void>;
  playLocalByQuery: (query: string) => Promise<string>;
  streamWebMusic: (track: string, artist?: string) => Promise<string>;
  searchWeb: (query: string) => Promise<WebTrack[]>;
  mediaControl: (action: "play" | "pause" | "stop" | "skip") => string;
  setVolume: (v: number) => void;
  seek: (seconds: number) => void;
  setLastResults: (r: AnyTrack[]) => void;
  /** Load the whole indexed local library as the active queue. */
  playLibrary: () => Promise<string>;
  next: () => void;
  previous: () => void;
  jumpTo: (index: number) => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  enqueue: (track: AnyTrack) => void;
};

const Ctx = createContext<MediaApi | null>(null);

export function useMedia() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMedia must be used inside <MediaProvider>");
  return ctx;
}

export function MediaProvider({ children }: { children: ReactNode }) {
  const search = useServerFn(webMusicSearch);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const queueRef = useRef<AnyTrack[]>([]);
  const indexRef = useRef<Track[]>([]);
  const currentRef = useRef<AnyTrack | null>(null);
  const modeRef = useRef<{ repeat: RepeatMode; shuffle: boolean }>({
    repeat: "off",
    shuffle: false,
  });

  const [state, setState] = useState<MediaState>({
    index: [],
    indexing: false,
    current: null,
    playing: false,
    volume: 0.8,
    progress: 0,
    duration: 0,
    queue: [],
    lastResults: [],
    status: "Media engine idle",
    repeat: "off",
    shuffle: false,
    searching: false,
  });

  const patch = useCallback((p: Partial<MediaState>) => setState((s) => ({ ...s, ...p })), []);

  const advanceRef = useRef<(dir: 1 | -1, auto?: boolean) => void>(() => {});

  const getAudio = useCallback(() => {
    if (!audioRef.current && typeof window !== "undefined") {
      const el = new Audio();
      el.volume = 0.8;
      el.addEventListener("timeupdate", () =>
        patch({ progress: el.currentTime, duration: el.duration || 0 }),
      );
      el.addEventListener("ended", () => advanceRef.current(1, true));
      el.addEventListener("play", () => patch({ playing: true }));
      el.addEventListener("pause", () => patch({ playing: false }));
      audioRef.current = el;
    }
    return audioRef.current!;
  }, [patch]);

  const playTrack = useCallback(
    async (track: AnyTrack, queue?: AnyTrack[]) => {
      const el = getAudio();
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      let src: string;
      if (track.source === "local") {
        src = await trackObjectUrl(track as Track);
        urlRef.current = src;
      } else {
        src = (track as WebTrack).streamUrl;
      }
      el.src = src;
      if (queue) queueRef.current = queue;
      if (!queueRef.current.some((t) => t.id === track.id)) {
        queueRef.current = [...queueRef.current, track];
      }
      currentRef.current = track;
      patch({
        current: track,
        queue: queueRef.current,
        status: `${track.source === "local" ? "Local" : "Online"} · ${track.title}`,
      });
      await el
        .play()
        .catch(() => patch({ status: "Playback blocked — press play once to enable audio" }));
    },
    [getAudio, patch],
  );

  /** Queue navigation honouring shuffle and repeat modes. */
  advanceRef.current = (dir, auto = false) => {
    const q = queueRef.current;
    if (!q.length) return;
    const { repeat, shuffle } = modeRef.current;
    const cur = currentRef.current;

    if (auto && repeat === "one" && cur) {
      void playTrack(cur);
      return;
    }

    const i = cur ? q.findIndex((t) => t.id === cur.id) : -1;
    let nextIndex: number;
    if (shuffle && q.length > 1) {
      do {
        nextIndex = Math.floor(Math.random() * q.length);
      } while (nextIndex === i);
    } else {
      nextIndex = i + dir;
    }

    if (nextIndex >= q.length) {
      if (repeat === "all") nextIndex = 0;
      else {
        audioRef.current?.pause();
        patch({ playing: false, status: "Queue complete" });
        return;
      }
    }
    if (nextIndex < 0) nextIndex = repeat === "all" ? q.length - 1 : 0;

    void playTrack(q[nextIndex]);
  };

  const indexDirectory = useCallback(
    async (dir: DirectoryHandleLike | null) => {
      if (!dir) {
        indexRef.current = [];
        patch({ index: [], status: "Media engine idle" });
        return 0;
      }
      patch({ indexing: true, status: "Indexing audio…" });
      try {
        const tracks = await indexAudio(dir);
        indexRef.current = tracks;
        patch({
          index: tracks,
          indexing: false,
          status: `${tracks.length} local track${tracks.length === 1 ? "" : "s"} indexed`,
        });
        return tracks.length;
      } catch {
        patch({ indexing: false, status: "Indexing failed" });
        return 0;
      }
    },
    [patch],
  );

  const searchLocalMusic = useCallback(
    (query: string, folderPath?: string) => searchLocal(indexRef.current, query, folderPath),
    [],
  );

  const searchWeb = useCallback(
    async (query: string) => {
      patch({ searching: true, status: `Searching online for "${query}"…` });
      try {
        const { results } = await search({ data: { query } });
        const webTracks: WebTrack[] = results.map((r) => ({ ...r, source: "web" as const }));
        patch({
          searching: false,
          lastResults: webTracks,
          status: `${webTracks.length} online result${webTracks.length === 1 ? "" : "s"}`,
        });
        return webTracks;
      } catch (err) {
        patch({ searching: false, status: err instanceof Error ? err.message : "Search failed" });
        return [];
      }
    },
    [patch, search],
  );

  const streamWebMusic = useCallback(
    async (track: string, artist?: string) => {
      const query = [track, artist].filter(Boolean).join(" ");
      const webTracks = await searchWeb(query);
      if (!webTracks.length) return `I couldn't find "${query}" online, Felix.`;
      await playTrack(webTracks[0], webTracks);
      return `Streaming ${webTracks[0].title} by ${webTracks[0].artist} online, Felix.`;
    },
    [playTrack, searchWeb],
  );

  const playLocalByQuery = useCallback(
    async (query: string) => {
      const hits = searchLocalMusic(query);
      if (hits.length) {
        patch({ lastResults: hits });
        await playTrack(hits[0], hits);
        return `Playing ${hits[0].title} by ${hits[0].artist} from your local library, Felix.`;
      }
      return streamWebMusic(query);
    },
    [patch, playTrack, searchLocalMusic, streamWebMusic],
  );

  const playLibrary = useCallback(async () => {
    const lib = indexRef.current;
    if (!lib.length) return "No local tracks are indexed yet, Felix. Grant a folder first.";
    await playTrack(lib[0], lib);
    return `Loaded ${lib.length} local tracks into the queue, Felix.`;
  }, [playTrack]);

  const mediaControl = useCallback(
    (action: "play" | "pause" | "stop" | "skip") => {
      const el = getAudio();
      switch (action) {
        case "play":
          void el.play().catch(() => {});
          return "Resuming playback, Felix.";
        case "pause":
          el.pause();
          return "Playback paused.";
        case "stop":
          el.pause();
          el.currentTime = 0;
          patch({ playing: false, status: "Playback stopped" });
          return "Playback stopped.";
        case "skip":
          advanceRef.current(1);
          return "Skipping to the next track.";
      }
    },
    [getAudio, patch],
  );

  const setVolume = useCallback(
    (v: number) => {
      const vol = Math.max(0, Math.min(1, v));
      getAudio().volume = vol;
      patch({ volume: vol });
    },
    [getAudio, patch],
  );

  const seek = useCallback(
    (seconds: number) => {
      getAudio().currentTime = seconds;
    },
    [getAudio],
  );

  const cycleRepeat = useCallback(() => {
    const order: RepeatMode[] = ["off", "all", "one"];
    const nextMode = order[(order.indexOf(modeRef.current.repeat) + 1) % order.length];
    modeRef.current.repeat = nextMode;
    patch({ repeat: nextMode });
  }, [patch]);

  const toggleShuffle = useCallback(() => {
    modeRef.current.shuffle = !modeRef.current.shuffle;
    patch({ shuffle: modeRef.current.shuffle });
  }, [patch]);

  const enqueue = useCallback(
    (track: AnyTrack) => {
      if (queueRef.current.some((t) => t.id === track.id)) return;
      queueRef.current = [...queueRef.current, track];
      patch({ queue: queueRef.current });
    },
    [patch],
  );

  const jumpTo = useCallback((i: number) => {
    const track = queueRef.current[i];
    if (track) void playTrack(track);
  }, [playTrack]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const value = useMemo<MediaApi>(
    () => ({
      ...state,
      indexDirectory,
      searchLocalMusic,
      playTrack,
      playLocalByQuery,
      streamWebMusic,
      searchWeb,
      mediaControl,
      setVolume,
      seek,
      setLastResults: (r) => patch({ lastResults: r }),
      playLibrary,
      next: () => advanceRef.current(1),
      previous: () => advanceRef.current(-1),
      jumpTo,
      cycleRepeat,
      toggleShuffle,
      enqueue,
    }),
    [
      state,
      indexDirectory,
      searchLocalMusic,
      playTrack,
      playLocalByQuery,
      streamWebMusic,
      searchWeb,
      mediaControl,
      setVolume,
      seek,
      playLibrary,
      jumpTo,
      cycleRepeat,
      toggleShuffle,
      enqueue,
      patch,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
