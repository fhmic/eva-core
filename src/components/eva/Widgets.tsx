import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Cpu,
  CloudSun,
  Gauge,
  HardDrive,
  Loader2,
  MapPin,
  MemoryStick,
  Newspaper,
  Radar,
  RefreshCw,
  Wifi,
} from "lucide-react";
import { HoloPanel } from "./HoloPanel";
import { getNews, getWeather, searchPlaces } from "@/lib/feeds.functions";
import type { GeoPlace, NewsItem, WeatherReport } from "@/lib/feeds.server";

/* ------------------------------ weather ------------------------------ */

const DEFAULT_PLACE: GeoPlace = {
  id: "lagos",
  name: "Lagos",
  region: "Lagos",
  country: "Nigeria",
  latitude: 6.4541,
  longitude: 3.3947,
};

const PLACE_KEY = "eva.weather.place";

function codeGlyph(code: number) {
  if (code === 0) return "☀";
  if (code <= 2) return "⛅";
  if (code === 3) return "☁";
  if (code <= 48) return "🌫";
  if (code <= 57) return "🌦";
  if (code <= 67) return "🌧";
  if (code <= 77) return "❄";
  if (code <= 86) return "🌧";
  return "⛈";
}

export function WeatherWidget({ delay }: { delay?: number }) {
  const load = useServerFn(getWeather);
  const lookup = useServerFn(searchPlaces);
  const [place, setPlace] = useState<GeoPlace>(DEFAULT_PLACE);
  const [report, setReport] = useState<WeatherReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<GeoPlace[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PLACE_KEY);
      if (saved) setPlace(JSON.parse(saved) as GeoPlace);
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const { report: r } = await load({
        data: {
          latitude: place.latitude,
          longitude: place.longitude,
          place: place.name,
        },
      });
      setReport(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Weather feed unavailable");
    } finally {
      setBusy(false);
    }
  }, [load, place]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  const choose = (p: GeoPlace) => {
    setPlace(p);
    localStorage.setItem(PLACE_KEY, JSON.stringify(p));
    setPicking(false);
    setOptions([]);
    setQuery("");
  };

  const search = async () => {
    if (!query.trim()) return;
    try {
      const { places } = await lookup({ data: { query: query.trim() } });
      setOptions(places);
    } catch {
      setOptions([]);
    }
  };

  return (
    <HoloPanel
      title="Environment"
      icon={<CloudSun size={14} />}
      delay={delay}
      action={
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPicking((p) => !p)}
            aria-label="Change location"
            className="rounded-full border border-border/60 p-1 text-muted-foreground transition hover:text-accent"
          >
            <MapPin size={12} />
          </button>
          <button
            onClick={() => void refresh()}
            aria-label="Refresh weather"
            className="rounded-full border border-border/60 p-1 text-muted-foreground transition hover:text-accent"
          >
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      }
    >
      {picking && (
        <div className="mb-3 space-y-2 rounded-lg border border-border/60 bg-secondary/40 p-2">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void search()}
              placeholder="City name…"
              aria-label="Search location"
              className="h-8 flex-1 rounded-md border border-border bg-background/60 px-2 text-xs outline-none focus:border-accent/60"
            />
            <button
              onClick={() => void search()}
              className="rounded-md border border-accent/50 px-2 text-xs text-accent"
            >
              Find
            </button>
          </div>
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => choose(o)}
              className="block w-full truncate rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
            >
              {o.name}
              {o.region ? `, ${o.region}` : ""} · {o.country}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {report ? (
        <>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-display text-3xl text-foreground text-glow">
                {report.temperature}°
              </p>
              <p className="text-xs text-muted-foreground">
                {report.place} · feels {report.apparent}°
              </p>
            </div>
            <span className="animate-drift text-4xl leading-none">{codeGlyph(report.code)}</span>
          </div>
          <p className="mt-2 text-xs text-foreground/80">{report.summary}</p>
          <div className="mt-3 grid grid-cols-6 gap-1 text-center text-[10px] text-muted-foreground">
            {report.hourly.map((h) => (
              <div key={h.time} className="rounded-md border border-border/60 bg-secondary/40 py-1">
                <p className="label-hud text-[9px]">{h.time}</p>
                <p className="text-foreground">{h.temp}°</p>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            {report.daily.map((d) => (
              <span key={d.day}>
                {d.day} {codeGlyph(d.code)} {d.max}°/{d.min}°
              </span>
            ))}
          </div>
        </>
      ) : (
        !error && <p className="label-hud animate-pulse">Acquiring environment telemetry…</p>
      )}
    </HoloPanel>
  );
}

/* ------------------------------- news -------------------------------- */

const TOPICS = ["top", "business", "technology", "world", "science"] as const;

export function NewsWidget({ delay }: { delay?: number }) {
  const load = useServerFn(getNews);
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("top");
  const [items, setItems] = useState<NewsItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const { items: rows } = await load({ data: { topic, limit: 6 } });
      setItems(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feed unavailable");
    } finally {
      setBusy(false);
    }
  }, [load, topic]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <HoloPanel
      title="Intelligence Feed"
      icon={<Newspaper size={14} />}
      delay={delay}
      accent="violet"
      action={
        <button
          onClick={() => void refresh()}
          aria-label="Refresh news"
          className="rounded-full border border-border/60 p-1 text-muted-foreground transition hover:text-accent"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1">
        {TOPICS.map((t) => (
          <button
            key={t}
            onClick={() => setTopic(t)}
            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider transition ${
              topic === t
                ? "border-accent/60 text-accent"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <ul className="max-h-[260px] space-y-2 overflow-y-auto pr-1 text-sm">
        {items.map((n, i) => (
          <li key={n.id} className="flex gap-2">
            <span className="label-hud pt-[3px]">{String(i + 1).padStart(2, "0")}</span>
            <a href={n.url} target="_blank" rel="noreferrer" className="group block min-w-0 flex-1">
              <p className="truncate text-foreground/90 transition group-hover:text-accent">
                {n.title}
              </p>
              <p className="line-clamp-2 text-[11px] text-muted-foreground">{n.summary}</p>
              <p className="label-hud text-[9px]">{n.source}</p>
            </a>
          </li>
        ))}
        {!items.length && !error && (
          <li className="label-hud animate-pulse">Pulling latest intelligence…</li>
        )}
      </ul>
    </HoloPanel>
  );
}

/* -------------------------- system health ---------------------------- */

type Health = {
  cpu: number;
  fps: number;
  cores: number;
  ram: number;
  ramUsedMb: number;
  ramTotalMb: number;
  disk: number;
  diskUsedGb: number;
  diskTotalGb: number;
  online: boolean;
  downlink: number;
  rtt: number;
  netType: string;
};

/** Live client telemetry: frame-budget CPU load, JS heap, storage quota, link quality. */
export function SystemHealthWidget({ delay }: { delay?: number }) {
  const [h, setH] = useState<Health>({
    cpu: 0,
    fps: 60,
    cores: 0,
    ram: 0,
    ramUsedMb: 0,
    ramTotalMb: 0,
    disk: 0,
    diskUsedGb: 0,
    diskTotalGb: 0,
    online: true,
    downlink: 0,
    rtt: 0,
    netType: "unknown",
  });
  const frames = useRef(0);

  useEffect(() => {
    let raf = 0;
    const count = () => {
      frames.current++;
      raf = requestAnimationFrame(count);
    };
    raf = requestAnimationFrame(count);

    let lastTick = performance.now();
    const sample = async () => {
      const now = performance.now();
      const elapsed = (now - lastTick) / 1000;
      lastTick = now;
      const fps = Math.min(60, Math.round(frames.current / Math.max(0.2, elapsed)));
      frames.current = 0;

      const mem = (performance as any).memory as
        { usedJSHeapSize: number; jsHeapSizeLimit: number } | undefined;
      const ramUsedMb = mem ? Math.round(mem.usedJSHeapSize / 1048576) : 0;
      const ramTotalMb = mem ? Math.round(mem.jsHeapSizeLimit / 1048576) : 0;

      let diskUsedGb = 0;
      let diskTotalGb = 0;
      try {
        const est = await navigator.storage?.estimate?.();
        diskUsedGb = (est?.usage ?? 0) / 1073741824;
        diskTotalGb = (est?.quota ?? 0) / 1073741824;
      } catch {
        /* unavailable */
      }

      const conn = (navigator as any).connection as
        { downlink?: number; rtt?: number; effectiveType?: string } | undefined;

      setH({
        cpu: Math.max(2, Math.min(100, Math.round((1 - fps / 60) * 100))),
        fps,
        cores: navigator.hardwareConcurrency ?? 0,
        ram: ramTotalMb ? Math.round((ramUsedMb / ramTotalMb) * 100) : 0,
        ramUsedMb,
        ramTotalMb,
        disk: diskTotalGb ? Math.min(100, Math.round((diskUsedGb / diskTotalGb) * 100)) : 0,
        diskUsedGb: Number(diskUsedGb.toFixed(2)),
        diskTotalGb: Number(diskTotalGb.toFixed(1)),
        online: navigator.onLine,
        downlink: conn?.downlink ?? 0,
        rtt: conn?.rtt ?? 0,
        netType: conn?.effectiveType ?? (navigator.onLine ? "online" : "offline"),
      });
    };

    void sample();
    const id = setInterval(() => void sample(), 2000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);

  const rows = useMemo(
    () => [
      {
        key: "CPU",
        icon: Cpu,
        pct: h.cpu,
        detail: `${h.fps} fps · ${h.cores || "?"} cores`,
      },
      {
        key: "RAM",
        icon: MemoryStick,
        pct: h.ram,
        detail: h.ramTotalMb ? `${h.ramUsedMb} / ${h.ramTotalMb} MB` : "not exposed",
      },
      {
        key: "Disk",
        icon: HardDrive,
        pct: h.disk,
        detail: h.diskTotalGb ? `${h.diskUsedGb} / ${h.diskTotalGb} GB` : "not exposed",
      },
      {
        key: "Network",
        icon: Wifi,
        pct: h.online ? Math.min(100, Math.round((h.downlink / 10) * 100)) || 60 : 0,
        detail: h.online ? `${h.netType} · ${h.rtt} ms · ${h.downlink} Mb/s` : "offline",
      },
    ],
    [h],
  );

  return (
    <HoloPanel title="System Health" icon={<Gauge size={14} />} delay={delay} accent="amber">
      <div className="space-y-2.5">
        {rows.map((r) => {
          const Icon = r.icon;
          const hot = r.pct > 80;
          return (
            <div key={r.key}>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon size={12} className="text-accent/80" /> {r.key}
                </span>
                <span className={hot ? "text-destructive" : "text-accent"}>{r.pct}%</span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    hot ? "bg-destructive" : "bg-gradient-to-r from-violet via-primary to-accent"
                  }`}
                  style={{ width: `${Math.max(2, r.pct)}%` }}
                />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{r.detail}</p>
            </div>
          );
        })}
      </div>
    </HoloPanel>
  );
}

/* -------------------- assistant status + radar ----------------------- */

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
