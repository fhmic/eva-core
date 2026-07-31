import { useEffect, useRef } from "react";

type Star = { x: number; y: number; r: number; a: number; tw: number; depth: number };
type Cloud = { x: number; y: number; r: number; hue: number; vx: number; vy: number; a: number };

/**
 * Full-screen procedural deep-space nebula: drifting violet/cyan clouds,
 * a twinkling starfield and subtle parallax on mouse move.
 */
export function NebulaField() {
  const ref = useRef<HTMLCanvasElement>(null);
  const parallax = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let clouds: Cloud[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(320, Math.round((w * h) / 5200));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.5 + 0.25,
        a: Math.random() * 0.6 + 0.25,
        tw: Math.random() * 0.02 + 0.004,
        depth: Math.random() * 0.8 + 0.2,
      }));

      clouds = Array.from({ length: 6 }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.max(w, h) * (0.28 + Math.random() * 0.3),
        hue: i % 2 === 0 ? 288 : 194,
        vx: (Math.random() - 0.5) * 0.05,
        vy: (Math.random() - 0.5) * 0.04,
        a: 0.055 + Math.random() * 0.05,
      }));
    };

    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const onMove = (e: MouseEvent) => {
      parallax.current.tx = (e.clientX / window.innerWidth - 0.5) * 26;
      parallax.current.ty = (e.clientY / window.innerHeight - 0.5) * 18;
    };
    window.addEventListener("mousemove", onMove);

    let t = 0;
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const frame = () => {
      t += 1;
      const p = parallax.current;
      p.x += (p.tx - p.x) * 0.05;
      p.y += (p.ty - p.y) * 0.05;

      ctx.clearRect(0, 0, w, h);

      // Nebula clouds
      for (const c of clouds) {
        if (!reduce) {
          c.x += c.vx;
          c.y += c.vy;
          if (c.x < -c.r) c.x = w + c.r;
          if (c.x > w + c.r) c.x = -c.r;
          if (c.y < -c.r) c.y = h + c.r;
          if (c.y > h + c.r) c.y = -c.r;
        }
        const cx = c.x + p.x * 0.4;
        const cy = c.y + p.y * 0.4;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, c.r);
        g.addColorStop(0, `hsla(${c.hue}, 90%, 62%, ${c.a})`);
        g.addColorStop(0.55, `hsla(${c.hue}, 85%, 50%, ${c.a * 0.35})`);
        g.addColorStop(1, "hsla(240, 60%, 10%, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, c.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Starfield
      for (const s of stars) {
        const a = reduce ? s.a : s.a + Math.sin(t * s.tw * 6) * 0.28;
        ctx.globalAlpha = Math.max(0.05, Math.min(1, a));
        ctx.fillStyle = s.depth > 0.75 ? "#bfeaff" : "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x + p.x * s.depth, s.y + p.y * s.depth, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 size-full"
      style={{ background: "#05070A" }}
    />
  );
}
