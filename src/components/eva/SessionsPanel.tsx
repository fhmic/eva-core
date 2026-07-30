import { useNavigate } from "@tanstack/react-router";
import { History, Plus, Trash2 } from "lucide-react";
import { HoloPanel } from "./HoloPanel";
import type { ThreadRow } from "@/lib/eva-db";

export function SessionsPanel({
  delay,
  threads,
  activeId,
  onCreate,
  onDelete,
}: {
  delay?: number;
  threads: ThreadRow[];
  activeId: string;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();

  return (
    <HoloPanel
      title="Conversation Memory"
      icon={<History size={14} />}
      delay={delay}
      action={
        <button
          onClick={onCreate}
          className="flex items-center gap-1 text-xs text-accent transition hover:text-primary"
        >
          <Plus size={13} /> New
        </button>
      }
    >
      <ul className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
        {threads.length === 0 && (
          <li className="text-xs text-muted-foreground">No sessions recorded yet.</li>
        )}
        {threads.map((t) => (
          <li
            key={t.id}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
              t.id === activeId
                ? "border-accent/60 bg-secondary/70"
                : "border-border/60 bg-secondary/30"
            }`}
          >
            <button
              onClick={() => navigate({ to: "/s/$threadId", params: { threadId: t.id } })}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-xs text-foreground">{t.title}</span>
              <time
                dateTime={t.created_at}
                className="block font-mono text-[10px] text-muted-foreground"
              >
                {new Date(t.created_at).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </button>
            <button
              onClick={() => onDelete(t.id)}
              aria-label={`Delete session ${t.title}`}
              className="text-muted-foreground transition hover:text-destructive"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
    </HoloPanel>
  );
}
