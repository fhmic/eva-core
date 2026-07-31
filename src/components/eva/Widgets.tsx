import { useEffect, useState } from "react";
import { Activity, CloudSun, Newspaper, Radar } from "lucide-react";
import { HoloPanel } from "./HoloPanel";

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

export function WeatherWidget({ delay }: { delay?: number }) {
  return (
    <HoloPanel title="Environment" icon={<CloudSun size={14} />} delay={delay}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-3xl text-foreground text-glow">21°</p>
          <p className="text-xs text-muted-foreground">Clear · Lagos</p>
        </div>
        <CloudSun size={40} className="animate-drift text-accent/80" />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[10px] text-muted-foreground">
        {[
          ["Now", "21°"],
          ["12:00", "24°"],
          ["15:00", "26°"],
          ["18:00", "23°"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-border/60 bg-secondary/40 py-1.5">
            <p className="label-hud text-[9px]">{k}</p>
            <p className="text-foreground">{v}</p>
          </div>
        ))}
      </div>
    </HoloPanel>
  );
}

/** Connections / active task / memory / uptime with thin progress rings. */
export function SystemStatusWidget({
  delay,
  connections,
  task,
}: {
  delay?: number;
  connections: number;
  task: string;
}) {
  const [stats, setStats] = useState([62, 41, 28, 88]);
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () =>
        setStats((s) => s.map((v) => Math.max(12, Math.min(96, v + (Math.random() - 0.5) * 12)))),
      2200,
    );
    const up = setInterval(() => setUptime((u) => u + 1), 1000);
    return () => {
      clearInterval(id);
      clearInterval(up);
    };
  }, []);

  const labels = ["Neural Load", "Memory", "Latency", "Integrity"];
  const hh = String(Math.floor(uptime / 3600)).padStart(2, "0");
  const mm = String(Math.floor((uptime % 3600) / 60)).padStart(2, "0");
  const ss = String(uptime % 60).padStart(2, "0");

  return (
    <HoloPanel title="System Status" icon={<Activity size={14} />} delay={delay}>
      <div className="mb-3 grid grid-cols-3 gap-1.5 text-center">
        {[
          ["Links", String(connections)],
          ["Uptime", `${hh}:${mm}:${ss}`],
          ["Task", task],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-border/60 bg-secondary/40 px-1 py-1.5">
            <p className="label-hud text-[9px]">{k}</p>
            <p className="truncate text-[11px] text-foreground">{v}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2.5">
        {labels.map((l, i) => (
          <div key={l}>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{l}</span>
              <span className="text-accent">{Math.round(stats[i])}%</span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet via-primary to-accent transition-all duration-1000"
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
            style={{ inset: `${(100 - s) / 2}%` }}
          />
        ))}
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-primary/20" />
        <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-primary/20" />
        <div
          aria-hidden
          className="animate-sweep absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, oklch(0.87 0.16 195 / 0.35), transparent 55deg)",
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
