import { useState } from "react";
import {
  Globe,
  Library,
  Loader2,
  Music4,
  Pause,
  Play,
  Search,
  SkipForward,
  Square,
  Volume2,
} from "lucide-react";
import { HoloPanel } from "./HoloPanel";
import { useMedia } from "./MediaContext";
import type { AnyTrack, WebTrack } from "@/lib/media";

function fmt(s: number) {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function MediaPanel({ delay }: { delay?: number }) {
  const media = useMedia();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const runSearch = async (scope: "local" | "web") => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    try {
      if (scope === "local") {
        media.setLastResults(media.searchLocalMusic(q));
      } else {
        await media.streamWebMusic(q);
      }
    } finally {
      setBusy(false);
    }
  };

  const results: AnyTrack[] = media.lastResults;
  const pct = media.duration ? (media.progress / media.duration) * 100 : 0;

  return (
    <HoloPanel
      title="Media Engine"
      icon={<Music4 size={14} />}
      delay={delay}
      action={
        <span className="text-xs text-accent">
          {media.indexing ? "indexing…" : `${media.index.length} local`}
        </span>
      }
    >
      <div className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-primary/30 bg-secondary">
          {media.current && media.current.source === "web" && (media.current as WebTrack).artwork ? (
            <img
              src={(media.current as WebTrack).artwork}
              alt={`Artwork for ${media.current.title}`}
              className="size-full object-cover"
            />
          ) : (
            <Music4 size={18} className="text-accent" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {media.current?.title ?? "No track loaded"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {media.current ? `${media.current.artist} · ${media.current.source === "local" ? "Local" : "Web"}` : media.status}
          </p>
        </div>
      </div>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{fmt(media.progress)}</span>
        <span>{fmt(media.duration)}</span>
      </div>

      <div className="mt-2 flex items-center justify-center gap-4 text-primary">
        <button
          aria-label="Stop"
          onClick={() => media.mediaControl("stop")}
          className="transition hover:text-accent"
        >
          <Square size={14} />
        </button>
        <button
          aria-label={media.playing ? "Pause" : "Play"}
          onClick={() => media.mediaControl(media.playing ? "pause" : "play")}
          className="grid size-9 place-items-center rounded-full border border-accent/50 bg-secondary text-accent transition hover:scale-105"
          style={{ boxShadow: "var(--shadow-glow)" }}
        >
          {media.playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button
          aria-label="Next track"
          onClick={() => media.mediaControl("skip")}
          className="transition hover:text-accent"
        >
          <SkipForward size={16} />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Volume2 size={13} className="text-muted-foreground" />
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(media.volume * 100)}
          aria-label="Volume"
          onChange={(e) => media.setVolume(Number(e.target.value) / 100)}
          className="h-1 w-full accent-[oklch(0.87_0.16_195)]"
        />
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void runSearch("local")}
            placeholder="Search tracks…"
            aria-label="Search music"
            className="h-8 w-full rounded-full border border-border bg-secondary/50 pl-7 pr-2 text-xs text-foreground outline-none focus:border-accent/60"
          />
        </div>
        <button
          onClick={() => void runSearch("local")}
          aria-label="Search local library"
          className="grid size-8 place-items-center rounded-full border border-border text-primary transition hover:text-accent"
        >
          <Library size={13} />
        </button>
        <button
          onClick={() => void runSearch("web")}
          aria-label="Search and stream from the web"
          className="grid size-8 place-items-center rounded-full border border-accent/50 text-accent transition hover:scale-105"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />}
        </button>
      </div>

      {results.length > 0 && (
        <ul className="mt-2 max-h-[150px] space-y-1 overflow-y-auto pr-1">
          {results.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => void media.playTrack(t, results)}
                className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 px-2.5 py-1.5 text-left transition hover:border-accent/50"
              >
                {t.source === "local" ? (
                  <Library size={11} className="shrink-0 text-primary" />
                ) : (
                  <Globe size={11} className="shrink-0 text-accent" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-foreground">{t.title}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{t.artist}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 truncate text-[11px] text-muted-foreground">{media.status}</p>
    </HoloPanel>
  );
}
