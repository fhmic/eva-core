import { motion } from "motion/react";
import { useMemo } from "react";

export type CoreState = "idle" | "listening" | "thinking" | "speaking";

const PALETTE: Record<CoreState, { ring: string; glow: string; label: string }> = {
  idle: { ring: "oklch(0.85 0.16 200)", glow: "oklch(0.85 0.16 200 / 0.35)", label: "ONLINE" },
  listening: { ring: "oklch(0.87 0.16 195)", glow: "oklch(0.87 0.16 195 / 0.6)", label: "LISTENING" },
  thinking: { ring: "oklch(0.68 0.22 305)", glow: "oklch(0.68 0.22 305 / 0.6)", label: "PROCESSING" },
  speaking: { ring: "oklch(0.9 0.15 205)", glow: "oklch(0.9 0.15 205 / 0.7)", label: "SPEAKING" },
};

/** Concentric holographic ring system that reacts to EVA's state. */
export function EvaCore({
  state = "idle",
  level = 0,
  size = 300,
}: {
  state?: CoreState;
  level?: number;
  size?: number;
}) {
  const p = PALETTE[state];
  const active = state !== "idle";
  const speed = state === "thinking" ? 0.4 : state === "speaking" ? 0.7 : 1;
  const amp = state === "listening" || state === "speaking" ? 0.06 + level * 0.5 : 0.02;

  const bars = useMemo(() => Array.from({ length: 48 }, (_, i) => i), []);
  const ticks = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      aria-label={`EVA core ${p.label}`}
    >
      {/* energy field particles */}
      {Array.from({ length: 18 }).map((_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        const r = size * 0.46;
        return (
          <motion.span
            key={i}
            className="absolute size-1 rounded-full"
            style={{ background: p.ring, boxShadow: `0 0 8px ${p.ring}` }}
            animate={{
              x: [Math.cos(angle) * r, Math.cos(angle) * r * 0.35],
              y: [Math.sin(angle) * r, Math.sin(angle) * r * 0.35],
              opacity: [0, 0.9, 0],
            }}
            transition={{
              duration: (4 + (i % 5)) * speed,
              repeat: Infinity,
              delay: i * 0.18,
              ease: "easeInOut",
            }}
          />
        );
      })}

      {/* outer targeting reticle with tick marks */}
      <motion.svg
        viewBox="0 0 200 200"
        className="absolute inset-0 size-full opacity-70"
        animate={{ rotate: 360 }}
        transition={{ duration: 46 * speed, repeat: Infinity, ease: "linear" }}
      >
        {ticks.map((i) => {
          const a = (i / ticks.length) * Math.PI * 2;
          const long = i % 5 === 0;
          const r1 = long ? 88 : 92;
          return (
            <line
              key={i}
              x1={100 + Math.cos(a) * r1}
              y1={100 + Math.sin(a) * r1}
              x2={100 + Math.cos(a) * 96}
              y2={100 + Math.sin(a) * 96}
              stroke={p.ring}
              strokeWidth={long ? 1.4 : 0.6}
              opacity={long ? 0.8 : 0.4}
            />
          );
        })}
        <circle cx="100" cy="100" r="82" fill="none" stroke={p.ring} strokeWidth="0.5" opacity="0.35" />
      </motion.svg>

      {/* rotating arcs */}
      <motion.svg
        viewBox="0 0 200 200"
        className="absolute inset-0 size-full"
        animate={{ rotate: -360 }}
        transition={{ duration: 24 * speed, repeat: Infinity, ease: "linear" }}
      >
        <circle
          cx="100"
          cy="100"
          r="72"
          fill="none"
          stroke={p.ring}
          strokeWidth="1.6"
          strokeDasharray="60 26 14 26"
          opacity="0.75"
          style={{ filter: `drop-shadow(0 0 6px ${p.glow})` }}
        />
      </motion.svg>
      <motion.svg
        viewBox="0 0 200 200"
        className="absolute inset-0 size-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 14 * speed, repeat: Infinity, ease: "linear" }}
      >
        <circle
          cx="100"
          cy="100"
          r="58"
          fill="none"
          stroke="oklch(0.68 0.22 305)"
          strokeWidth="1"
          strokeDasharray="8 14"
          opacity={state === "thinking" ? 0.95 : 0.5}
        />
      </motion.svg>

      {/* radial waveform ring */}
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
        {bars.map((i) => {
          const a = (i / bars.length) * Math.PI * 2;
          const len = 6 + Math.abs(Math.sin(i * 1.7)) * 22 * (0.3 + amp * 3);
          return (
            <line
              key={i}
              x1={100 + Math.cos(a) * 42}
              y1={100 + Math.sin(a) * 42}
              x2={100 + Math.cos(a) * (42 + len)}
              y2={100 + Math.sin(a) * (42 + len)}
              stroke={p.ring}
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity={active ? 0.7 : 0.3}
            />
          );
        })}
      </svg>

      {/* ripple pulses */}
      {active && (
        <>
          <span
            className="animate-sonar absolute rounded-full border"
            style={{ width: size * 0.5, height: size * 0.5, borderColor: p.ring }}
          />
          <span
            className="animate-sonar absolute rounded-full border"
            style={{
              width: size * 0.5,
              height: size * 0.5,
              borderColor: p.ring,
              animationDelay: "0.9s",
            }}
          />
        </>
      )}

      {/* nucleus */}
      <motion.div
        className="relative rounded-full"
        style={{
          width: size * 0.36,
          height: size * 0.36,
          background: "var(--gradient-core)",
          boxShadow: `0 0 60px ${p.glow}, inset 0 0 40px ${p.glow}`,
        }}
        animate={{ scale: [1, 1 + amp, 1] }}
        transition={{ duration: state === "speaking" ? 0.6 : 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <div
          className="absolute inset-[18%] rounded-full opacity-90"
          style={{ background: `radial-gradient(circle, ${p.ring} 0%, transparent 70%)` }}
        />
      </motion.div>
    </div>
  );
}
