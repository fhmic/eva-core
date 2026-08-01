/**
 * Server-side URL fetcher for Eva's download_url tool.
 *
 * Vercel Functions have a hard 4.5MB request/response body limit (infra-level,
 * not configurable). Since this returns JSON with base64 content, the real
 * ceiling is ~3MB raw before base64 inflation — enforced below.
 */

const MAX_BYTES = 3 * 1024 * 1024; // 3MB raw, keeps the base64 response under Vercel's cap

const BLOCKED_EXTENSIONS = new Set([
  "exe", "msi", "bat", "cmd", "com", "scr", "ps1", "sh", "bash",
  "apk", "app", "dmg", "jar", "vbs", "wsf", "js", "jse", "cpl", "gadget",
]);

const BLOCKED_CONTENT_TYPES = [
  /application\/x-msdownload/i,
  /application\/x-executable/i,
  /application\/vnd\.microsoft\.portable-executable/i,
  /application\/x-sh/i,
  /text\/x-shellscript/i,
  /application\/java-archive/i,
  /application\/vnd\.android\.package-archive/i,
];

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // covers cloud metadata endpoints
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  return false;
}

export type DownloadedFile = {
  base64: string;
  contentType: string;
  byteLength: number;
};

export async function downloadUrlServer(rawUrl: string): Promise<DownloadedFile> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error("That host is not allowed.");
  }

  const ext = url.pathname.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(`Files with .${ext} extension are blocked for safety.`);
  }

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "EvaAssistant/1.0" },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Download failed [${res.status}]: ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  if (BLOCKED_CONTENT_TYPES.some((re) => re.test(contentType))) {
    throw new Error(`Content type "${contentType}" is blocked for safety.`);
  }

  const declaredLength = Number(res.headers.get("content-length") ?? "0");
  if (declaredLength && declaredLength > MAX_BYTES) {
    throw new Error(
      `File is ${(declaredLength / 1024 / 1024).toFixed(1)}MB, which exceeds the ${(MAX_BYTES / 1024 / 1024).toFixed(1)}MB limit imposed by the hosting platform's function response cap.`,
    );
  }

  if (!res.body) {
    throw new Error("No response body.");
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error(
        `File exceeds the ${(MAX_BYTES / 1024 / 1024).toFixed(1)}MB limit imposed by the hosting platform's function response cap.`,
      );
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    base64: Buffer.from(combined).toString("base64"),
    contentType,
    byteLength: total,
  };
}
