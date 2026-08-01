/** Live web search for Eva, backed by Tavily's search API. */

export type WebSearchResult = {
  title: string;
  url: string;
  content: string;
  score: number;
};

export type WebSearchResponse = {
  answer?: string;
  results: WebSearchResult[];
};

export async function webSearch(query: string, maxResults = 5): Promise<WebSearchResponse> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    throw new Error(
      "Web search is not configured: set TAVILY_API_KEY (free tier at tavily.com, no card required).",
    );
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: Math.min(Math.max(maxResults, 1), 10),
      include_answer: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tavily search failed [${res.status}]: ${body}`);
  }

  const data = (await res.json()) as {
    answer?: string;
    results?: Array<{ title: string; url: string; content: string; score: number }>;
  };

  return {
    answer: data.answer,
    results: (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content.slice(0, 600),
      score: r.score,
    })),
  };
}
