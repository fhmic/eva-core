import { useState } from "react";
import {
  Disc3,
  ListMusic,
  Music4,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { HoloPanel } from "./HoloPanel";
import { useMedia } from "./MediaContext";
import type { AnyTrack, WebTrack } from "@/lib/media";

const fmt = (s: number) =>
  Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00";

export function MediaPanel({ delay }: { delay?: number }) {
  const m = useMedia();
  const [tab, setTab] = useState<"local" | "online" | "queue">("local");
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState<WebTrack[]>([]);
  const [localHits, setLocalHits] = useState<AnyTrack[] | null>(null);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    if (tab === "online") setOnline(await m.searchWeb(q));
    else setLocalHits(m.searchLocalMusic(q));
  };

  const localList = localHits ?? m.index;
  const artwork = m.current && m.current.source === "web" ? (m.current as WebTrack).artwork : undefined;
  const pct = m.duration ? (m.progress / m.duration) * 100 : 0;

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`rounded-full px-2.5 py-1 text-[11px] tracking-widest uppercase transition ${
        tab === id ? "border border-accent/60 text-accent" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <HoloPanel
      title="Media Engine"
      icon={<Music4 size={14} />}
      delay={delay}
      action={<span className="truncate text-[11px] text-muted-foreground">{m.status}</span>}
    >
      {/* Now playing */}
      <div className="flex items-center gap-3">
        <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-primary/30 bg-secondary">
          {artwork ? (
            <img src={artwork} alt="" className="size-full object-cover" />
          ) : (
            <Disc3 size={20} className={`text-accent ${m.playing ? "animate-spin-slow" : ""}`} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {m.current?.title ?? "Nothing queued"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {m.current ? `${m.current.artist} · ${m.current.source === "local" ? "Local" : "Online"}` : "Standby"}
          </p>
        </div>
      </div>

      {/* Scrubber */}
      <div className="mt-3">
        <input
          type="range"
          min={0}
          max={m.duration || 0}
          step={0.5}
          value={m.progress}
          onChange={(e) => m.seek(Number(e.target.value))}
          aria-label="Seek"
          className="h-1 w-full cursor-pointer appearance-none rounded-full"
          style={{
            background: `linear-gradient(90deg, var(--cyan) ${pct}%, oklch(0.3 0.05 245 / 0.6) ${pct}%)`,
            boxShadow: pct > 0 ? "0 0 12px oklch(0.87 0.16 195 / 0.45)" : undefined,
          }}
        />
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{fmt(m.progress)}</span>
          <span>{fmt(m.duration)}</span>
        </div>
      </div>

      {/* Transport */}
      <div className="mt-2 flex items-center justify-center gap-4 text-primary">
        <button
          onClick={m.toggleShuffle}
          aria-label="Shuffle"
          aria-pressed={m.shuffle}
          className={`transition ${m.shuffle ? "text-accent" : "text-muted-foreground hover:text-foreground"}`}
          style={m.shuffle ? { filter: "drop-shadow(0 0 6px var(--cyan))" } : undefined}
        >
          <Shuffle size={15} />
        </button>
        <button onClick={m.previous} aria-label="Previous track" className="transition hover:text-accent">
          <SkipBack size={16} />
        </button>
        <button
          onClick={() => m.mediaControl(m.playing ? "pause" : "play")}
          aria-label={m.playing ? "Pause" : "Play"}
          className="grid size-10 place-items-center rounded-full border border-accent/50 bg-secondary text-accent transition hover:scale-105"
          style={{ boxShadow: "var(--shadow-glow)" }}
        >
          {m.playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button onClick={m.next} aria-label="Next track" className="transition hover:text-accent">
          <SkipForward size={16} />
        </button>
        <button
          onClick={m.cycleRepeat}
          aria-label={`Repeat ${m.repeat}`}
          className={`transition ${m.repeat !== "off" ? "text-accent" : "text-muted-foreground hover:text-foreground"}`}
          style={m.repeat !== "off" ? { filter: "drop-shadow(0 0 6px var(--cyan))" } : undefined}
        >
          {m.repeat === "one" ? <Repeat1 size={15} /> : <Repeat size={15} />}
        </button>
      </div>

      {/* Volume */}
      <div className="mt-3 flex items-center gap-2">
        <Volume2 size={13} className="text-muted-foreground" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={m.volume}
          onChange={(e) => m.setVolume(Number(e.target.value))}
          aria-label="Volume"
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
          style={{
            background: `linear-gradient(90deg, var(--violet) ${m.volume * 100}%, oklch(0.3 0.05 245 / 0.6) ${m.volume * 100}%)`,
          }}
        />
      </div>

      {/* Sources */}
      <div className="mt-3 flex items-center gap-1 border-t border-border/60 pt-3">
        {tabBtn("local", `Local ${m.index.length ? `(${m.index.length})` : ""}`)}
        {tabBtn("online", "Online")}
        {tabBtn("queue", `Queue ${m.queue.length ? `(${m.queue.length})` : ""}`)}
      </div>

      {tab !== "queue" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
          className="mt-2 flex gap-2"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "online" ? "Search online for a song…" : "Filter local library…"}
            aria-label="Search music"
            className="h-8 flex-1 rounded-full border border-border bg-secondary/50 px-3 text-xs outline-none focus:border-accent/60"
          />
          <button
            type="submit"
            aria-label="Search"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-accent/50 text-accent transition hover:scale-105"
          >
            <Search size={13} />
          </button>
        </form>
      )}

      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1 text-sm">
        {tab === "local" &&
          (localList.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No local tracks indexed. Grant a folder in the Local Workspace panel.
            </p>
          ) : (
            <>
              <button
                onClick={() => void m.playLibrary()}
                className="mb-1 flex w-full items-center gap-1.5 text-[11px] tracking-widest text-accent uppercase"
              >
                <ListMusic size={12} /> Load all as queue
              </button>
              {localList.slice(0, 40).map((t) => (
                <TrackRow key={t.id} track={t} tag="Local" onPlay={() => void m.playTrack(t, localList)} onQueue={() => m.enqueue(t)} active={m.current?.id === t.id} />
              ))}
            </>
          ))}

        {tab === "online" &&
          (m.searching ? (
            <p className="text-xs text-accent">Searching…</p>
          ) : online.length === 0 ? (
            <p className="text-xs text-muted-foreground">Search the online catalogue to stream a track.</p>
          ) : (
            online.map((t) => (
              <TrackRow key={t.id} track={t} tag="Online" onPlay={() => void m.playTrack(t, online)} onQueue={() => m.enqueue(t)} active={m.current?.id === t.id} />
            ))
          ))}

        {tab === "queue" &&
          (m.queue.length === 0 ? (
            <p className="text-xs text-muted-foreground">Queue empty.</p>
          ) : (
            m.queue.map((t, i) => (
              <TrackRow
                key={`${t.id}-${i}`}
                track={t}
                tag={t.source === "local" ? "Local" : "Online"}
                onPlay={() => m.jumpTo(i)}
                active={m.current?.id === t.id}
              />
            ))
          ))}
      </div>
    </HoloPanel>
  );
}

function TrackRow({
  track,
  tag,
  onPlay,
  onQueue,
  active,
}: {
  track: AnyTrack;
  tag: string;
  onPlay: () => void;
  onQueue?: () => void;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2 py-1 transition ${
        active ? "border border-accent/50 bg-secondary/60" : "hover:bg-secondary/40"
      }`}
    >
      <button onClick={onPlay} className="min-w-0 flex-1 text-left">
        <p className="truncate text-xs text-foreground">{track.title}</p>
        <p className="truncate text-[10px] text-muted-foreground">{track.artist}</p>
      </button>
      <span className="label-hud shrink-0 text-[9px]">{tag}</span>
      {onQueue && (
        <button
          onClick={onQueue}
          aria-label={`Add ${track.title} to queue`}
          className="shrink-0 text-muted-foreground transition hover:text-accent"
        >
          <ListMusic size={12} />
        </button>
      )}
    </div>
  );
}
