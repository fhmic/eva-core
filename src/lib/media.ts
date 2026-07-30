/**
 * Local media indexing for EVA.
 *
 * Recursively scans the single user-approved directory handle for audio files
 * and builds a lightweight in-memory search index (title / artist / album /
 * relative path). Nothing outside the granted handle is ever touched.
 */

import type { DirectoryHandleLike } from "./workspace";

export const AUDIO_EXTENSIONS = ["mp3", "flac", "wav", "m4a", "aac", "ogg"] as const;

const AUDIO_RE = new RegExp(`\\.(${AUDIO_EXTENSIONS.join("|")})$`, "i");

export type Track = {
  id: string;
  /** Path relative to the approved folder, e.g. "Albums/Zimmer/Time.mp3" */
  path: string;
  title: string;
  artist: string;
  album: string;
  source: "local";
  handle: any;
};

export type WebTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  source: "web";
  streamUrl: string;
  artwork?: string;
  pageUrl?: string;
};

export type AnyTrack = Track | WebTrack;

export function isAudioFile(name: string) {
  return AUDIO_RE.test(name);
}

/** "03 - Hans Zimmer - Time.mp3" → { artist, title } best-effort. */
function parseName(fileName: string, folder: string) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/^\d+\s*[-._]\s*/, "");
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  }
  return { artist: folder || "Unknown artist", title: base.trim() };
}

/** Recursively index every audio file inside the approved directory. */
export async function indexAudio(
  dir: DirectoryHandleLike,
  prefix = "",
  depth = 0,
  out: Track[] = [],
): Promise<Track[]> {
  if (depth > 6) return out;
  for await (const handle of dir.values()) {
    const path = prefix ? `${prefix}/${handle.name}` : handle.name;
    if (handle.kind === "directory") {
      await indexAudio(handle as DirectoryHandleLike, path, depth + 1, out);
    } else if (isAudioFile(handle.name)) {
      const folder = prefix.split("/").pop() ?? "";
      const { artist, title } = parseName(handle.name, folder);
      out.push({
        id: path,
        path,
        title,
        artist,
        album: folder || "Local files",
        source: "local",
        handle,
      });
    }
  }
  return out;
}

/** Ranked substring search over the local index. */
export function searchLocal(index: Track[], query: string, folderPath?: string): Track[] {
  const q = query.trim().toLowerCase();
  const scope = folderPath
    ? index.filter((t) => t.path.toLowerCase().startsWith(folderPath.toLowerCase().replace(/^\/+/, "")))
    : index;
  if (!q) return scope.slice(0, 50);
  const terms = q.split(/\s+/);
  return scope
    .map((t) => {
      const hay = `${t.title} ${t.artist} ${t.album} ${t.path}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (!hay.includes(term)) return { t, score: -1 };
        score += t.title.toLowerCase().includes(term) ? 3 : 1;
      }
      return { t, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((r) => r.t);
}

/** Resolve a local track handle into a playable object URL. */
export async function trackObjectUrl(track: Track): Promise<string> {
  const file: File = await track.handle.getFile();
  return URL.createObjectURL(file);
}
