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
};

type MediaApi = MediaState & {
  indexDirectory: (dir: DirectoryHandleLike | null) => Promise<number>;
  searchLocalMusic: (query: string, folderPath?: string) => Track[];
  playTrack: (track: AnyTrack, queue?: AnyTrack[]) => Promise<void>;
  playLocalByQuery: (query: string) => Promise<string>;
  streamWebMusic: (track: string, artist?: string) => Promise<string>;
  mediaControl: (action: "play" | "pause" | "stop" | "skip") => string;
  setVolume: (v: number) => void;
  seek: (seconds: number) => void;
  setLastResults: (r: AnyTrack[]) => void;
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
  });

  const patch = useCallback((p: Partial<MediaState>) => setState((s) => ({ ...s, ...p })), []);

  const getAudio = useCallback(() => {
    if (!audioRef.current && typeof window !== "undefined") {
      const el = new Audio();
      el.volume = 0.8;
      el.addEventListener("timeupdate", () =>
        patch({ progress: el.currentTime, duration: el.duration || 0 }),
      );
      el.addEventListener("ended", () => skipRef.current());
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
      patch({
        current: track,
        queue: queueRef.current,
        status: `${track.source === "local" ? "Local" : "Web stream"} · ${track.title}`,
      });
      await el.play().catch(() => patch({ status: "Playback blocked — press play once to enable audio" }));
    },
    [getAudio, patch],
  );

  const skipRef = useRef<() => void>(() => {});
  skipRef.current = () => {
    const q = queueRef.current;
    const cur = state.current;
    const i = cur ? q.findIndex((t) => t.id === cur.id) : -1;
    const next = q[i + 1];
    if (next) void playTrack(next);
    else {
      audioRef.current?.pause();
      patch({ playing: false, status: "Queue complete" });
    }
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

  const streamWebMusic = useCallback(
    async (track: string, artist?: string) => {
      const query = [track, artist].filter(Boolean).join(" ");
      patch({ status: `Searching the web for "${query}"…` });
      try {
        const { results } = await search({ data: { query } });
        if (!results.length) return `I couldn't find "${query}" online, Felix.`;
        const webTracks: WebTrack[] = results.map((r) => ({ ...r, source: "web" as const, album: r.album }));
        patch({ lastResults: webTracks });
        await playTrack(webTracks[0], webTracks);
        return `Streaming ${webTracks[0].title} by ${webTracks[0].artist} from the web, Felix.`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Web streaming failed";
        patch({ status: msg });
        return msg;
      }
    },
    [patch, playTrack, search],
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
          skipRef.current();
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
      mediaControl,
      setVolume,
      seek,
      setLastResults: (r) => patch({ lastResults: r }),
    }),
    [
      state,
      indexDirectory,
      searchLocalMusic,
      playTrack,
      playLocalByQuery,
      streamWebMusic,
      mediaControl,
      setVolume,
      seek,
      patch,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
