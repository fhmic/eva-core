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

/**
 * Persists the granted directory handle in IndexedDB so Felix doesn't have to
 * re-pick the folder from the OS dialog every time he opens the browser.
 * FileSystemDirectoryHandle is structured-clone-serializable, so it can be
 * stored directly. Permission itself still has to be re-verified each session
 * (browser security requirement, not something app code can bypass) — but
 * that's a single lightweight click-through prompt, not the full folder picker.
 */
const HANDLE_DB = "eva-workspace";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "workspace-dir";

function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(HANDLE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveWorkspaceHandle(dir: DirectoryHandleLike): Promise<void> {
  try {
    const db = await openHandleDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, "readwrite");
      tx.objectStore(HANDLE_STORE).put(dir, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Persistence is a convenience — if it fails, Felix just re-grants next time.
  }
}

async function loadStoredHandle(): Promise<DirectoryHandleLike | null> {
  try {
    const db = await openHandleDB();
    return await new Promise<DirectoryHandleLike | null>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, "readonly");
      const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as DirectoryHandleLike) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function forgetWorkspace(): Promise<void> {
  try {
    const db = await openHandleDB();
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY);
  } catch {
    /* ignore */
  }
}

export type RestoredWorkspace = { dir: DirectoryHandleLike; granted: boolean };

/** Looks up a previously-granted folder from IndexedDB — no OS picker involved. */
export async function restoreWorkspace(): Promise<RestoredWorkspace | null> {
  if (!isFileSystemSupported()) return null;
  const dir = await loadStoredHandle();
  if (!dir) return null;
  const granted = (await dir.queryPermission?.({ mode: "readwrite" })) === "granted";
  return { dir, granted };
}

/** Re-confirms permission on an already-known folder: one click, not a folder re-pick. */
export async function reconnectWorkspace(dir: DirectoryHandleLike): Promise<boolean> {
  const result = await dir.requestPermission?.({ mode: "readwrite" });
  return result === "granted";
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
  const dir = (await window.showDirectoryPicker({ mode: "readwrite" })) as DirectoryHandleLike;
  await saveWorkspaceHandle(dir);
  return dir;
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

/* ------------------------------------------------------------------ *
 * Path-aware operations (nested paths inside the approved root only)  *
 * ------------------------------------------------------------------ */

export function splitPath(path: string): string[] {
  const parts = path
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== ".");
  if (parts.some((p) => p === ".." || p.includes(":"))) {
    throw new Error(`"${path}" escapes the approved workspace, Felix. Request denied.`);
  }
  return parts.map(assertSafeName);
}

/** Resolve the parent directory handle and the final segment name. */
export async function resolvePath(
  dir: DirectoryHandleLike,
  path: string,
  createParents = false,
): Promise<{ parent: DirectoryHandleLike; name: string }> {
  const parts = splitPath(path);
  if (parts.length === 0) throw new Error("A file or folder name is required, Felix.");
  let parent = dir;
  for (const segment of parts.slice(0, -1)) {
    parent = await parent.getDirectoryHandle(segment, { create: createParents });
  }
  return { parent, name: parts[parts.length - 1] };
}

export async function pathExists(
  dir: DirectoryHandleLike,
  path: string,
): Promise<"file" | "directory" | null> {
  try {
    const { parent, name } = await resolvePath(dir, path);
    try {
      await parent.getFileHandle(name);
      return "file";
    } catch {
      await parent.getDirectoryHandle(name);
      return "directory";
    }
  } catch {
    return null;
  }
}

export async function createFolderPath(dir: DirectoryHandleLike, path: string) {
  const parts = splitPath(path);
  let current = dir;
  for (const segment of parts) current = await current.getDirectoryHandle(segment, { create: true });
}

export async function writeFilePath(dir: DirectoryHandleLike, path: string, data: BlobPart) {
  const { parent, name } = await resolvePath(dir, path, true);
  const handle = await parent.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function readFilePath(dir: DirectoryHandleLike, path: string): Promise<File> {
  const { parent, name } = await resolvePath(dir, path);
  const handle = await parent.getFileHandle(name);
  return handle.getFile();
}

export async function deletePath(dir: DirectoryHandleLike, path: string, recursive = true) {
  const { parent, name } = await resolvePath(dir, path);
  await parent.removeEntry(name, { recursive });
}

export async function movePath(dir: DirectoryHandleLike, from: string, to: string) {
  const file = await readFilePath(dir, from);
  await writeFilePath(dir, to, await file.arrayBuffer());
  await deletePath(dir, from, false);
}

export async function listPath(
  dir: DirectoryHandleLike,
  path?: string,
): Promise<WorkspaceEntry[]> {
  let target = dir;
  if (path && splitPath(path).length) {
    for (const segment of splitPath(path)) target = await target.getDirectoryHandle(segment);
  }
  return listDirectory(target);
}

/** Recursive listing used to give Eva verified, physical disk state. */
export async function listTree(
  dir: DirectoryHandleLike,
  prefix = "",
  depth = 3,
): Promise<string[]> {
  const out: string[] = [];
  for await (const handle of dir.values()) {
    const p = prefix ? `${prefix}/${handle.name}` : handle.name;
    if (handle.kind === "directory") {
      out.push(`${p}/`);
      if (depth > 1) out.push(...(await listTree(handle as DirectoryHandleLike, p, depth - 1)));
    } else {
      out.push(p);
    }
  }
  return out;
}
