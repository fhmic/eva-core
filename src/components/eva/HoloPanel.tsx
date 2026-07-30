import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function HoloPanel({
  title,
  icon,
  action,
  children,
  className,
  delay = 0,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "holo-panel holo-panel-hover animate-fade-up overflow-hidden p-4",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/70 to-transparent"
      />
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-cyan/80">{icon}</span>
          <h2 className="label-hud">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
