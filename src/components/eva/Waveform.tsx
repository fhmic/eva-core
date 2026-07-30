import { useEffect, useRef } from "react";

/** Mirrored voice waveform bars driven by a 0..1 amplitude level. */
export function Waveform({ level, active }: { level: number; active: boolean }) {
  const bars = 48;
  const phase = useRef(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      phase.current += active ? 0.18 : 0.05;
      const el = ref.current;
      if (el) {
        const children = el.children;
        for (let i = 0; i < children.length; i++) {
          const wave = Math.sin(phase.current + i * 0.4) * 0.5 + 0.5;
          const amp = active ? 0.15 + level * 1.1 : 0.06;
          const h = Math.max(4, wave * amp * 100);
          (children[i] as HTMLElement).style.height = `${h}%`;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [level, active]);

  return (
    <div ref={ref} className="flex h-16 w-full items-center justify-between gap-[3px]">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="w-full rounded-full bg-gradient-to-t from-primary/40 to-accent"
          style={{ height: "6%", boxShadow: "var(--shadow-glow)" }}
        />
      ))}
    </div>
  );
}
