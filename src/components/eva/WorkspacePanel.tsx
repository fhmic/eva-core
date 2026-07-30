import { useCallback, useRef, useState } from "react";
import {
  ExternalLink,
  FileSpreadsheet,
  FolderPlus,
  FolderOpen,
  HardDrive,
  Presentation,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { HoloPanel } from "./HoloPanel";
import { buildDeck, parseWorkbook } from "@/lib/docgen";
import {
  createFolder,
  deleteEntry,
  downloadBlob,
  ensureWritable,
  fileExists,
  isEmbedded,
  isFileSystemSupported,
  listDirectory,
  pickWorkspace,
  readFile,
  writeFile,
  type DirectoryHandleLike,
  type WorkspaceEntry,
} from "@/lib/workspace";

type Pending = { kind: "delete" | "overwrite"; name: string; run: () => Promise<void> };

export function WorkspacePanel({
  delay,
  onEntries,
  onDirectory,
}: {
  delay?: number;
  onEntries?: (dir: string | null, entries: WorkspaceEntry[]) => void;
  onDirectory?: (dir: DirectoryHandleLike | null) => void;
}) {
  const dirRef = useRef<DirectoryHandleLike | null>(null);
  const [dirName, setDirName] = useState<string | null>(null);
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [status, setStatus] = useState("No workspace granted");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const refresh = useCallback(async () => {
    const dir = dirRef.current;
    if (!dir) return;
    const list = await listDirectory(dir);
    setEntries(list);
    onEntries?.(dir.name, list);
  }, [onEntries]);

  const grant = async () => {
    try {
      const dir = await pickWorkspace();
      if (!(await ensureWritable(dir))) {
        setStatus("Write permission declined");
        return;
      }
      dirRef.current = dir;
      setDirName(dir.name);
      setStatus(`Access granted to /${dir.name}`);
      await refresh();
      onDirectory?.(dir);
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      setStatus(err instanceof Error ? err.message : "Access failed");
    }
  };

  const newFolder = async () => {
    const dir = dirRef.current;
    if (!dir) return;
    const name = window.prompt("Folder name");
    if (!name) return;
    try {
      await createFolder(dir, name.trim());
      setStatus(`Created folder ${name.trim()}`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not create folder");
    }
  };

  const requestDelete = (entry: WorkspaceEntry) =>
    setPending({
      kind: "delete",
      name: entry.name,
      run: async () => {
        await deleteEntry(dirRef.current!, entry.name, entry.kind === "directory");
        setStatus(`Deleted ${entry.name}`);
        await refresh();
      },
    });

  const compileDeck = async (entry: WorkspaceEntry) => {
    const dir = dirRef.current;
    if (!dir) return;
    setBusy(true);
    try {
      const file = await readFile(dir, entry.name);
      const sheets = await parseWorkbook(file);
      const title = entry.name.replace(/\.[^.]+$/, "");
      const blob = await buildDeck(title, sheets);
      const target = `${title}.pptx`;
      const write = async () => {
        await writeFile(dir, target, blob);
        setStatus(`Presentation saved as ${target}`);
        await refresh();
      };
      if (await fileExists(dir, target)) {
        setPending({ kind: "overwrite", name: target, run: write });
      } else {
        await write();
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Deck compilation failed");
    } finally {
      setBusy(false);
    }
  };

  const supported = isFileSystemSupported();
  const embedded = isEmbedded();

  const compileUpload = async (file: File) => {
    setBusy(true);
    try {
      const sheets = await parseWorkbook(file);
      const title = file.name.replace(/\.[^.]+$/, "");
      downloadBlob(await buildDeck(title, sheets), `${title}.pptx`);
      setStatus(`Presentation generated: ${title}.pptx`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Deck compilation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <HoloPanel
      title="Local Workspace"
      icon={<HardDrive size={14} />}
      delay={delay}
      action={
        dirName ? (
          <button
            onClick={() => void refresh()}
            aria-label="Refresh workspace"
            className="text-accent transition hover:rotate-90"
          >
            <RefreshCw size={13} />
          </button>
        ) : null
      }
    >
      {!dirName ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {!supported
              ? "Local folder access requires a Chromium desktop browser."
              : embedded
                ? "Folder access is blocked inside the embedded preview. Open EVA in its own tab to grant access."
                : "Grant Eva access to a single approved folder. All reads and writes stay inside it."}
          </p>
          {supported && embedded ? (
            <button
              onClick={() => window.open(window.location.href, "_blank", "noopener")}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-accent/50 bg-secondary px-4 py-2 text-sm text-accent transition hover:scale-[1.02]"
              style={{ boxShadow: "var(--shadow-glow)" }}
            >
              <ExternalLink size={14} /> Open EVA in a new tab
            </button>
          ) : (
            <button
              onClick={() => void grant()}
              disabled={!supported}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-accent/50 bg-secondary px-4 py-2 text-sm text-accent transition hover:scale-[1.02] disabled:opacity-40"
              style={{ boxShadow: "var(--shadow-glow)" }}
            >
              <FolderOpen size={14} /> Grant folder access
            </button>
          )}

          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition hover:text-foreground">
            <Upload size={13} /> Compile a spreadsheet to .pptx
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void compileUpload(f);
              }}
            />
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="label-hud truncate">/{dirName}</span>
            <button
              onClick={() => void newFolder()}
              className="flex items-center gap-1 text-xs text-accent transition hover:text-primary"
            >
              <FolderPlus size={13} /> New
            </button>
          </div>

          <ul className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
            {entries.length === 0 && (
              <li className="text-xs text-muted-foreground">Workspace is empty.</li>
            )}
            {entries.map((e) => (
              <li
                key={e.name}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {e.kind === "directory" ? "▸ " : ""}
                  {e.name}
                </span>
                {/\.(xlsx|xls|csv)$/i.test(e.name) && (
                  <button
                    onClick={() => void compileDeck(e)}
                    disabled={busy}
                    aria-label={`Compile ${e.name} into a presentation`}
                    className="text-accent transition hover:text-primary disabled:opacity-40"
                  >
                    <Presentation size={13} />
                  </button>
                )}
                <button
                  onClick={() => requestDelete(e)}
                  aria-label={`Delete ${e.name}`}
                  className="text-muted-foreground transition hover:text-destructive"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <FileSpreadsheet size={11} /> {busy ? "Compiling…" : status}
      </p>

      {pending && (
        <div className="mt-3 rounded-lg border border-destructive/50 bg-secondary/70 p-3">
          <p className="text-xs text-foreground">
            {pending.kind === "delete"
              ? `Confirm permanent deletion of "${pending.name}", Felix?`
              : `"${pending.name}" already exists. Overwrite it?`}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={async () => {
                const p = pending;
                setPending(null);
                try {
                  await p.run();
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : "Operation failed");
                }
              }}
              className="rounded-full border border-destructive/60 px-3 py-1 text-xs text-destructive transition hover:bg-destructive/10"
            >
              Confirm
            </button>
            <button
              onClick={() => setPending(null)}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </HoloPanel>
  );
}
