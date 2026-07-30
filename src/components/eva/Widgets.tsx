import { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  CloudSun,
  Inbox,
  Music4,
  Newspaper,
  Pause,
  Play,
  Radar,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { HoloPanel } from "./HoloPanel";

export function SpotifyWidget({ delay }: { delay?: number }) {
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(38);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setProgress((p) => (p >= 100 ? 0 : p + 0.4)), 600);
    return () => clearInterval(id);
  }, [playing]);

  return (
    <HoloPanel title="Audio Stream" icon={<Music4 size={14} />} delay={delay}>
      <div className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-lg border border-primary/30 bg-secondary">
          <Music4 size={18} className="text-accent" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">Interstellar Suite</p>
          <p className="truncate text-xs text-muted-foreground">Hans Zimmer · Focus Deep</p>
        </div>
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-center gap-5 text-primary">
        <button aria-label="Previous track" className="transition hover:text-accent">
          <SkipBack size={16} />
        </button>
        <button
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => setPlaying((p) => !p)}
          className="grid size-9 place-items-center rounded-full border border-accent/50 bg-secondary text-accent transition hover:scale-105"
          style={{ boxShadow: "var(--shadow-glow)" }}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button aria-label="Next track" className="transition hover:text-accent">
          <SkipForward size={16} />
        </button>
      </div>
    </HoloPanel>
  );
}

const EMAILS = [
  { from: "Board of Directors", subject: "Q3 capital allocation review", tag: "Urgent" },
  { from: "Amara Osei", subject: "Series B term sheet redlines", tag: "High" },
  { from: "Ops Desk", subject: "Weekly performance digest", tag: "Low" },
];

export function EmailWidget({ delay }: { delay?: number }) {
  return (
    <HoloPanel
      title="Email Hub"
      icon={<Inbox size={14} />}
      delay={delay}
      action={<span className="text-xs text-accent">12 new</span>}
    >
      <ul className="space-y-2">
        {EMAILS.map((e) => (
          <li
            key={e.subject}
            className="rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 transition hover:border-accent/50"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-foreground">{e.from}</span>
              <span className="label-hud shrink-0">{e.tag}</span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{e.subject}</p>
          </li>
        ))}
      </ul>
    </HoloPanel>
  );
}

const NEWS = [
  "Global markets steady as central banks hold rates",
  "AI infrastructure spend forecast to double by 2028",
  "Energy majors accelerate grid-storage investment",
];

export function NewsWidget({ delay }: { delay?: number }) {
  return (
    <HoloPanel title="Intelligence Feed" icon={<Newspaper size={14} />} delay={delay}>
      <ul className="space-y-2 text-sm">
        {NEWS.map((n, i) => (
          <li key={n} className="flex gap-2 text-muted-foreground">
            <span className="label-hud pt-[3px]">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-foreground/90">{n}</span>
          </li>
        ))}
      </ul>
    </HoloPanel>
  );
}

const EVENTS = [
  { time: "09:30", title: "Investor sync", room: "Holo Room A" },
  { time: "12:00", title: "Strategy review", room: "Executive Suite" },
  { time: "16:15", title: "Product deep dive", room: "Lab 04" },
];

export function CalendarWidget({ delay }: { delay?: number }) {
  return (
    <HoloPanel title="Schedule" icon={<CalendarDays size={14} />} delay={delay}>
      <ul className="space-y-2">
        {EVENTS.map((e) => (
          <li key={e.title} className="flex items-center gap-3">
            <span className="font-display text-sm text-accent">{e.time}</span>
            <div className="min-w-0 border-l border-border pl-3">
              <p className="truncate text-sm text-foreground">{e.title}</p>
              <p className="truncate text-xs text-muted-foreground">{e.room}</p>
            </div>
          </li>
        ))}
      </ul>
    </HoloPanel>
  );
}

export function WeatherWidget({ delay }: { delay?: number }) {
  return (
    <HoloPanel title="Environment" icon={<CloudSun size={14} />} delay={delay}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-3xl text-foreground text-glow">21°</p>
          <p className="text-xs text-muted-foreground">Clear · Lagos</p>
        </div>
        <CloudSun size={40} className="text-accent/80" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
        {[
          ["Humidity", "54%"],
          ["Wind", "12 km/h"],
          ["UV", "3"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-border/60 bg-secondary/40 py-1.5">
            <p className="label-hud">{k}</p>
            <p className="text-foreground">{v}</p>
          </div>
        ))}
      </div>
    </HoloPanel>
  );
}

export function SystemHealthWidget({ delay }: { delay?: number }) {
  const [stats, setStats] = useState([62, 41, 28, 88]);
  useEffect(() => {
    const id = setInterval(
      () => setStats((s) => s.map((v) => Math.max(12, Math.min(96, v + (Math.random() - 0.5) * 12)))),
      2200,
    );
    return () => clearInterval(id);
  }, []);
  const labels = ["Neural Load", "Memory", "Latency", "Integrity"];

  return (
    <HoloPanel title="System Health" icon={<Activity size={14} />} delay={delay}>
      <div className="space-y-2.5">
        {labels.map((l, i) => (
          <div key={l}>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{l}</span>
              <span className="text-accent">{Math.round(stats[i])}%</span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-1000"
                style={{ width: `${stats[i]}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </HoloPanel>
  );
}

export function RadarWidget({ delay }: { delay?: number }) {
  return (
    <HoloPanel title="Perimeter Scan" icon={<Radar size={14} />} delay={delay}>
      <div className="relative mx-auto aspect-square w-full max-w-[190px]">
        {[100, 74, 48, 22].map((s) => (
          <span
            key={s}
            className="absolute rounded-full border border-primary/25"
            style={{
              inset: `${(100 - s) / 2}%`,
            }}
          />
        ))}
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-primary/20" />
        <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-primary/20" />
        <div
          aria-hidden
          className="animate-sweep absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, oklch(0.87 0.16 195 / 0.35), transparent 55deg)",
          }}
        />
        {[
          [30, 42],
          [68, 60],
          [55, 24],
        ].map(([x, y]) => (
          <span
            key={`${x}-${y}`}
            className="absolute size-1.5 rounded-full bg-accent"
            style={{ left: `${x}%`, top: `${y}%`, boxShadow: "var(--shadow-glow)" }}
          />
        ))}
      </div>
    </HoloPanel>
  );
}
