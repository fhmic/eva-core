import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Floating glass HUD panel: entrance fade/scale, gentle idle drift,
 * scan-line top edge and a holographic border glow.
 */
export function HoloPanel({
  title,
  icon,
  action,
  children,
  className,
  delay = 0,
  accent = "cyan",
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
  accent?: "cyan" | "violet" | "amber";
}) {
  const line =
    accent === "violet"
      ? "via-violet/70"
      : accent === "amber"
        ? "via-amber/70"
        : "via-cyan/70";

  return (
    <motion.section
      initial={{ opacity: 0, y: 18, scale: 0.98, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.6, delay: delay / 1000, ease: [0.22, 1, 0.36, 1] }}
      className={cn("glass-panel animate-drift overflow-hidden p-4", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent",
          line,
        )}
      />
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={accent === "violet" ? "text-violet" : "text-cyan/80"}>{icon}</span>
          <h2 className="label-hud">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </motion.section>
  );
}
