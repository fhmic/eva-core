import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { HoloPanel } from "./HoloPanel";
import { listAudit, type AuditRow } from "@/lib/eva-db";

const ACTION_LABEL: Record<string, string> = {
  create_folder: "CREATE",
  write_file: "WRITE",
  move_file: "MOVE",
  delete_file: "DELETE",
  compile_deck: "COMPILE",
};

export function AuditLogPanel({ delay, version }: { delay?: number; version: number }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listAudit());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit log unavailable");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  return (
    <HoloPanel
      title="Disk Audit Log"
      icon={<ScrollText size={14} />}
      delay={delay}
      action={
        <button
          onClick={() => void load()}
          aria-label="Refresh audit log"
          className="text-accent transition hover:rotate-90"
        >
          <RefreshCw size={13} />
        </button>
      }
    >
      <ul className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
        {error && <li className="text-xs text-destructive">{error}</li>}
        {!error && rows.length === 0 && (
          <li className="text-xs text-muted-foreground">
            No file operations recorded yet, Felix.
          </li>
        )}
        {rows.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-border/60 bg-secondary/40 px-2.5 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`label-hud ${r.ok ? "text-accent" : "text-destructive"}`}
              >
                {ACTION_LABEL[r.action] ?? r.action} · {r.ok ? "OK" : "FAILED"}
              </span>
              <time
                dateTime={r.created_at}
                className="font-mono text-[10px] text-muted-foreground"
              >
                {new Date(r.created_at).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
            </div>
            {r.path && (
              <p className="mt-0.5 truncate font-mono text-[11px] text-foreground">{r.path}</p>
            )}
            {r.detail && (
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{r.detail}</p>
            )}
          </li>
        ))}
      </ul>
    </HoloPanel>
  );
}
