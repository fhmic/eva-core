import { cn } from "@/lib/utils";

/** Circular AI core: nested rotating rings, pulse halo and radar sweep. */
export function AICore({
  state,
  level = 0,
}: {
  state: "idle" | "listening" | "thinking" | "speaking";
  level?: number;
}) {
  const label =
    state === "listening"
      ? "Listening"
      : state === "thinking"
        ? "Processing"
        : state === "speaking"
          ? "Responding"
          : "Standby";

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px] animate-float">
      <div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{ background: "var(--gradient-core)", filter: "blur(6px)" }}
      />
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="absolute inset-6 rounded-full border border-cyan/40"
          style={{
            animation: `eva-pulse-ring 3s ${i * 1}s ease-out infinite`,
            opacity: state === "idle" ? 0.4 : 1,
          }}
        />
      ))}
      <div className="animate-spin-slow absolute inset-0 rounded-full border border-dashed border-primary/40" />
      <div className="animate-spin-reverse absolute inset-5 rounded-full border border-cyan/30" />
      <div className="absolute inset-10 overflow-hidden rounded-full border border-primary/25">
        <div
          aria-hidden
          className="animate-sweep absolute inset-0 origin-center"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, oklch(0.87 0.16 195 / 0.35) 40deg, transparent 70deg)",
          }}
        />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span
          className={cn(
            "font-display text-3xl font-bold tracking-[0.3em] text-glow",
            state === "thinking" ? "text-accent" : "text-primary",
          )}
        >
          EVA
        </span>
        <span className="label-hud">{label}</span>
        <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent transition-all duration-150"
            style={{ width: `${Math.max(6, Math.min(100, level * 100))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
