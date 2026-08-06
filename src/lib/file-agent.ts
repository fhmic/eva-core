/**
 * EVA client-side file agent.
 *
 * The web runtime has no host disk access, so Eva emits structured tool calls
 * in her reply and this agent executes them directly against the approved
 * local directory handle (File System Access API) inside the browser process.
 * Every call is verified against physical storage afterwards.
 */

import {
  createFolderPath,
  deletePath,
  listPath,
  listTree,
  movePath,
  pathExists,
  readFilePath,
  writeFilePath,
  type DirectoryHandleLike,
} from "./workspace";

export type EvaToolCall =
  | { tool: "create_folder"; path: string }
  | { tool: "write_file"; path: string; content?: string }
  | { tool: "move_file"; from: string; to: string }
  | { tool: "delete_file"; path: string }
  | { tool: "read_file"; path: string }
  | { tool: "list_directory"; path?: string }
  | { tool: "download_url"; url: string; path: string };

export type ToolResult = { tool: string; ok: boolean; message: string; verified?: boolean };

const BLOCK = /```(?:eva-tool|json:eva-tool)\s*([\s\S]*?)```|<eva-tool>([\s\S]*?)<\/eva-tool>/gi;

const KNOWN = new Set([
  "create_folder",
  "write_file",
  "move_file",
  "delete_file",
  "read_file",
  "list_directory",
  "download_url",
]);

function coerce(value: unknown): EvaToolCall[] {
  const items = Array.isArray(value) ? value : [value];
  return items.filter(
    (item): item is EvaToolCall =>
      !!item && typeof item === "object" && KNOWN.has(String((item as any).tool)),
  );
}

/** Extract tool calls from a model reply and return the reply without them. */
export function parseToolCalls(text: string): { calls: EvaToolCall[]; cleaned: string } {
  const calls: EvaToolCall[] = [];
  const cleaned = text
    .replace(BLOCK, (_m, a?: string, b?: string) => {
      const raw = (a ?? b ?? "").trim();
      try {
        calls.push(...coerce(JSON.parse(raw)));
      } catch {
        return _m;
      }
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { calls, cleaned };
}

export type ConfirmFn = (kind: "delete" | "overwrite", target: string) => Promise<boolean>;
export type DownloadFn = (url: string) => Promise<{ base64: string; contentType: string; byteLength: number }>;

export async function executeToolCall(
  dir: DirectoryHandleLike,
  call: EvaToolCall,
  confirm: ConfirmFn,
  download?: DownloadFn,
): Promise<ToolResult> {
  try {
    switch (call.tool) {
      case "create_folder": {
        await createFolderPath(dir, call.path);
        const verified = (await pathExists(dir, call.path)) === "directory";
        return {
          tool: call.tool,
          ok: verified,
          verified,
          message: verified
            ? `Folder /${dir.name}/${call.path} created and verified on disk.`
            : `Folder /${call.path} could not be verified after creation.`,
        };
      }
      case "write_file": {
        if ((await pathExists(dir, call.path)) === "file") {
          if (!(await confirm("overwrite", call.path)))
            return { tool: call.tool, ok: false, message: `Overwrite of ${call.path} declined.` };
        }
        await writeFilePath(dir, call.path, call.content ?? "");
        const verified = (await pathExists(dir, call.path)) === "file";
        return {
          tool: call.tool,
          ok: verified,
          verified,
          message: verified
            ? `File /${dir.name}/${call.path} written and verified on disk.`
            : `File /${call.path} could not be verified after write.`,
        };
      }
      case "move_file": {
        if ((await pathExists(dir, call.to)) === "file") {
          if (!(await confirm("overwrite", call.to)))
            return { tool: call.tool, ok: false, message: `Overwrite of ${call.to} declined.` };
        }
        await movePath(dir, call.from, call.to);
        const verified =
          (await pathExists(dir, call.to)) === "file" && (await pathExists(dir, call.from)) === null;
        return {
          tool: call.tool,
          ok: verified,
          verified,
          message: verified
            ? `Moved ${call.from} to ${call.to}; verified on disk.`
            : `Move of ${call.from} could not be fully verified.`,
        };
      }
      case "delete_file": {
        if (!(await confirm("delete", call.path)))
          return { tool: call.tool, ok: false, message: `Deletion of ${call.path} declined.` };
        await deletePath(dir, call.path);
        const verified = (await pathExists(dir, call.path)) === null;
        return {
          tool: call.tool,
          ok: verified,
          verified,
          message: verified
            ? `Deleted ${call.path}; absence verified on disk.`
            : `${call.path} still present after deletion attempt.`,
        };
      }
      case "read_file": {
        const file = await readFilePath(dir, call.path);
        const full = await file.text();
        const text = full.slice(0, 8000);
        const truncated = full.length > 8000;
        return {
          tool: call.tool,
          ok: true,
          message: `Contents of ${call.path}:\n${text}${truncated ? "\n[file truncated at 8000 chars — ask to read it in sections if you need the rest]" : ""}`,
        };
      }
      case "list_directory": {
        const entries = await listPath(dir, call.path);
        return {
          tool: call.tool,
          ok: true,
          message: `/${dir.name}${call.path ? `/${call.path}` : ""}: ${
            entries.map((e) => `${e.name}${e.kind === "directory" ? "/" : ""}`).join(", ") || "empty"
          }`,
        };
      }
      case "download_url": {
        if (!download) {
          return { tool: call.tool, ok: false, message: "Download tool is not wired up." };
        }
        if ((await pathExists(dir, call.path)) === "file") {
          if (!(await confirm("overwrite", call.path)))
            return { tool: call.tool, ok: false, message: `Overwrite of ${call.path} declined.` };
        }
        const file = await download(call.url);
        const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: file.contentType });
        await writeFilePath(dir, call.path, blob);
        const verified = (await pathExists(dir, call.path)) === "file";
        return {
          tool: call.tool,
          ok: verified,
          verified,
          message: verified
            ? `Downloaded ${(file.byteLength / 1024).toFixed(0)}KB from ${call.url} to /${dir.name}/${call.path} and verified on disk.`
            : `Download completed but /${call.path} could not be verified after write.`,
        };
      }
      default:
        return { tool: "unknown", ok: false, message: "Unsupported tool." };
    }
  } catch (err) {
    return {
      tool: call.tool,
      ok: false,
      message: err instanceof Error ? err.message : "Operation failed.",
    };
  }
}


export async function runToolCalls(
  dir: DirectoryHandleLike,
  calls: EvaToolCall[],
  confirm: ConfirmFn,
  download?: DownloadFn,
  onProgress?: (done: number, total: number) => void,
): Promise<{ results: ToolResult[]; tree: string[] }> {
  const results: ToolResult[] = [];
  for (const call of calls) {
    results.push(await executeToolCall(dir, call, confirm, download));
    onProgress?.(results.length, calls.length);
  }
  return { results, tree: await listTree(dir) };
}
