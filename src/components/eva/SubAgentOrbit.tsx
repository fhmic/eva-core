import { motion } from "motion/react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";

export type SubAgent = {
  id: string;
  name: string;
  icon: LucideIcon;
  /** CSS colour for the orb glow. */
  color: string;
  status: string;
  /** Active agents break orbit, brighten and beam back to the core. */
  active?: boolean;
  /** Orbit radius in px. */
  radius: number;
  /** Seconds per revolution. */
  period: number;
  /** Starting angle offset in degrees. */
  offset?: number;
};

/**
 * Reusable constellation of sub-agent satellites orbiting EVA's core.
 * Fed entirely by the `agents` array — add capabilities without touching layout.
 */
export function SubAgentOrbit({ agents }: { agents: SubAgent[] }) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      {agents.map((agent) => {
        const Icon = agent.icon;
        const isHot = agent.active || hovered === agent.id;
        return (
          <motion.div
            key={agent.id}
            className="absolute"
            style={{ width: agent.radius * 2, height: agent.radius * 2 }}
            initial={{ rotate: agent.offset ?? 0 }}
            animate={{ rotate: (agent.offset ?? 0) + 360 }}
            transition={{ duration: agent.period, repeat: Infinity, ease: "linear" }}
          >
            {/* neural link back to the core */}
            {agent.active && (
              <span
                className="absolute left-1/2 top-0 -z-10 w-px"
                style={{
                  height: agent.radius,
                  background: `linear-gradient(180deg, ${agent.color}, transparent)`,
                  opacity: 0.7,
                }}
              />
            )}
            <motion.button
              type="button"
              onHoverStart={() => setHovered(agent.id)}
              onHoverEnd={() => setHovered(null)}
              onFocus={() => setHovered(agent.id)}
              onBlur={() => setHovered(null)}
              aria-label={`${agent.name} — ${agent.status}`}
              className="pointer-events-auto absolute left-1/2 top-0 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border outline-none"
              style={{
                borderColor: agent.color,
                background: "oklch(0.16 0.03 250 / 0.75)",
                boxShadow: isHot
                  ? `0 0 22px ${agent.color}, inset 0 0 14px ${agent.color}`
                  : `0 0 10px ${agent.color}55`,
              }}
              animate={{
                scale: agent.active ? [1, 1.18, 1] : 1,
                y: agent.active ? 0 : [0, -3, 0],
              }}
              transition={{ duration: agent.active ? 1.2 : 4, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* counter-rotate so the icon and tooltip stay upright */}
              <motion.span
                className="grid place-items-center"
                animate={{ rotate: -360 }}
                transition={{ duration: agent.period, repeat: Infinity, ease: "linear" }}
              >
                <Icon size={14} style={{ color: agent.color }} />
                {hovered === agent.id && (
                  <span
                    className="glass-panel absolute left-1/2 top-11 w-max -translate-x-1/2 whitespace-nowrap px-2.5 py-1 text-[10px] tracking-widest uppercase"
                    style={{ color: agent.color }}
                  >
                    {agent.name} — {agent.status}
                  </span>
                )}
              </motion.span>
            </motion.button>
          </motion.div>
        );
      })}
    </div>
  );
}
