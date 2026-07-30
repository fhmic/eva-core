export type MediaIntent =
  | { type: "search_local_music"; query: string; folderPath?: string }
  | { type: "play_local_track"; query: string }
  | { type: "stream_web_music"; track: string; artist?: string }
  | { type: "media_control"; action: "play" | "pause" | "stop" | "skip" }
  | { type: "set_volume"; volume: number };

/**
 * Lightweight natural-language intent router for playback commands so voice
 * and text directives control the media engine without a model round-trip.
 */
export function parseMediaIntent(raw: string): MediaIntent | null {
  const text = raw.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (!text) return null;

  const volume = text.match(/(?:set\s+)?volume(?:\s+to)?\s+(\d{1,3})\s*%?/);
  if (volume) return { type: "set_volume", volume: Math.min(100, Number(volume[1])) / 100 };
  if (/^(mute|silence)( the)?( music| audio)?$/.test(text)) return { type: "set_volume", volume: 0 };

  if (/^(pause|hold)( the)?( music| audio| track| song)?$/.test(text))
    return { type: "media_control", action: "pause" };
  if (/^(stop)( the)?( music| audio| track| song| playback)?$/.test(text))
    return { type: "media_control", action: "stop" };
  if (/^(resume|continue|unpause)( the)?( music| audio| playback)?$/.test(text))
    return { type: "media_control", action: "play" };
  if (/^(next|skip)( track| song)?$/.test(text)) return { type: "media_control", action: "skip" };

  const findLocal = text.match(
    /^(?:search|find|look for)\s+(?:my\s+|local\s+)?(?:music|tracks?|songs?|library)?\s*(?:for\s+)?(.+)$/,
  );
  if (findLocal && /music|track|song|library|local/.test(text))
    return { type: "search_local_music", query: findLocal[1].trim() };

  const play = text.match(/^(?:eva[,\s]+)?(?:please\s+)?(?:play|put on|stream)\s+(.+)$/);
  if (play) {
    let q = play[1].replace(/^(?:the\s+)?(?:song|track|music)\s+/, "").trim();
    const web = /\b(?:on|from)\s+(?:the\s+)?(?:web|internet|online|spotify|youtube)\b/.test(q);
    q = q.replace(/\b(?:on|from)\s+(?:the\s+)?(?:web|internet|online|spotify|youtube)\b/g, "").trim();
    const local = /\b(?:from\s+)?(?:my\s+)?(?:local|workspace|library|folder)\b/.test(q);
    q = q.replace(/\b(?:from\s+)?(?:my\s+)?(?:local|workspace|library|folder)\b/g, "").trim();
    const byArtist = q.match(/^(.*?)\s+by\s+(.+)$/);
    if (web && !local) {
      return byArtist
        ? { type: "stream_web_music", track: byArtist[1].trim(), artist: byArtist[2].trim() }
        : { type: "stream_web_music", track: q };
    }
    return { type: "play_local_track", query: q };
  }

  return null;
}
