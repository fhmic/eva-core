export type WebSearchResult = {
  id: string;
  title: string;
  artist: string;
  album: string;
  streamUrl: string;
  artwork?: string;
  pageUrl?: string;
};

type ITunesItem = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
};

/**
 * Web music lookup. Uses the public iTunes Search catalogue, which returns
 * directly streamable audio URLs (no API key, no user account required).
 */
export async function searchWebMusic(query: string, limit = 8): Promise<WebSearchResult[]> {
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=${limit}&term=${encodeURIComponent(
    query,
  )}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Web music search failed [${res.status}]`);
  const data = (await res.json()) as { results?: ITunesItem[] };
  return (data.results ?? [])
    .filter((r) => !!r.previewUrl)
    .map((r) => ({
      id: String(r.trackId ?? r.previewUrl),
      title: r.trackName ?? "Unknown track",
      artist: r.artistName ?? "Unknown artist",
      album: r.collectionName ?? "",
      streamUrl: r.previewUrl!,
      artwork: r.artworkUrl100?.replace("100x100", "300x300"),
      pageUrl: r.trackViewUrl,
    }));
}
