/**
 * Sandboxed local file access for EVA.
 *
 * Uses the browser File System Access API: Felix explicitly grants access to a
 * single directory (e.g. ~/Documents/EvaWorkspace) and every operation is
 * restricted to that handle — nothing outside it is reachable.
 */

export type WorkspaceEntry = {
  name: string;
  kind: "file" | "directory";
  size?: number;
};

export type DirectoryHandleLike = {
  name: string;
  kind: "directory";
  values: () => AsyncIterableIterator<any>;
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<any>;
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) => Promise<any>;
  removeEntry: (name: string, opts?: { recursive?: boolean }) => Promise<void>;
  queryPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
};

export function isFileSystemSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Preview/embedded frames are blocked from opening the OS directory picker. */
export function isEmbedded() {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function downloadBlob(data: BlobPart, filename: string) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


export async function pickWorkspace(): Promise<DirectoryHandleLike> {
  if (!isFileSystemSupported()) {
    throw new Error(
      "This browser does not expose the local file system API, Felix. Chrome or Edge on desktop is required.",
    );
  }
  // @ts-expect-error - showDirectoryPicker is not in all TS DOM libs
  return (await window.showDirectoryPicker({ mode: "readwrite" })) as DirectoryHandleLike;
}

export async function ensureWritable(dir: DirectoryHandleLike) {
  const state = (await dir.queryPermission?.({ mode: "readwrite" })) ?? "granted";
  if (state === "granted") return true;
  const next = (await dir.requestPermission?.({ mode: "readwrite" })) ?? "denied";
  return next === "granted";
}

function assertSafeName(name: string) {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error(`"${name}" is outside the approved workspace, Felix. Request denied.`);
  }
  return name;
}

export async function listDirectory(dir: DirectoryHandleLike): Promise<WorkspaceEntry[]> {
  const out: WorkspaceEntry[] = [];
  for await (const handle of dir.values()) {
    if (handle.kind === "file") {
      const file = await handle.getFile();
      out.push({ name: handle.name, kind: "file", size: file.size });
    } else {
      out.push({ name: handle.name, kind: "directory" });
    }
  }
  return out.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1,
  );
}

export async function readFile(dir: DirectoryHandleLike, name: string): Promise<File> {
  const handle = await dir.getFileHandle(assertSafeName(name));
  return handle.getFile();
}

export async function readTextFile(dir: DirectoryHandleLike, name: string) {
  return (await readFile(dir, name)).text();
}

export async function writeFile(
  dir: DirectoryHandleLike,
  name: string,
  data: BlobPart,
): Promise<void> {
  const handle = await dir.getFileHandle(assertSafeName(name), { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function fileExists(dir: DirectoryHandleLike, name: string) {
  try {
    await dir.getFileHandle(assertSafeName(name));
    return true;
  } catch {
    return false;
  }
}

export async function createFolder(dir: DirectoryHandleLike, name: string) {
  await dir.getDirectoryHandle(assertSafeName(name), { create: true });
}

export async function deleteEntry(dir: DirectoryHandleLike, name: string, recursive = false) {
  await dir.removeEntry(assertSafeName(name), { recursive });
}
