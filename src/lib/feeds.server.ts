/** Weather + news data services (keyless public APIs). */

export type GeoPlace = {
  id: string;
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
};

export type WeatherReport = {
  place: string;
  temperature: number;
  apparent: number;
  humidity: number;
  wind: number;
  code: number;
  isDay: boolean;
  summary: string;
  hourly: Array<{ time: string; temp: number; code: number }>;
  daily: Array<{ day: string; min: number; max: number; code: number }>;
  updatedAt: string;
};

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  published: string;
};

const WEATHER_TEXT: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm с hail",
  99: "Severe thunderstorm",
};

export function weatherText(code: number) {
  return WEATHER_TEXT[code] ?? "Unsettled";
}

export async function geocodePlace(query: string): Promise<GeoPlace[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query,
  )}&count=6&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Location lookup failed [${res.status}]: ${await res.text()}`);
  const data = (await res.json()) as {
    results?: Array<{
      id: number;
      name: string;
      admin1?: string;
      country?: string;
      latitude: number;
      longitude: number;
    }>;
  };
  return (data.results ?? []).map((r) => ({
    id: String(r.id),
    name: r.name,
    region: r.admin1 ?? "",
    country: r.country ?? "",
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

export async function fetchWeather(
  latitude: number,
  longitude: number,
  place: string,
): Promise<WeatherReport> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day" +
    "&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min" +
    "&forecast_days=4&timezone=auto";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather service failed [${res.status}]: ${await res.text()}`);
  const d = (await res.json()) as {
    current: Record<string, number>;
    hourly: { time: string[]; temperature_2m: number[]; weather_code: number[] };
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
    };
  };

  const nowIso = new Date().toISOString().slice(0, 13);
  let start = d.hourly.time.findIndex((t) => t.slice(0, 13) >= nowIso);
  if (start < 0) start = 0;
  const hourly = d.hourly.time.slice(start, start + 6).map((t, i) => ({
    time: t.slice(11, 16),
    temp: Math.round(d.hourly.temperature_2m[start + i]),
    code: d.hourly.weather_code[start + i],
  }));

  const daily = d.daily.time.map((t, i) => ({
    day: new Date(t).toLocaleDateString("en-GB", { weekday: "short" }),
    min: Math.round(d.daily.temperature_2m_min[i]),
    max: Math.round(d.daily.temperature_2m_max[i]),
    code: d.daily.weather_code[i],
  }));

  const code = d.current.weather_code;
  const temp = Math.round(d.current.temperature_2m);
  const summary = `${weatherText(code)}, ${temp}° in ${place}. Feels like ${Math.round(
    d.current.apparent_temperature,
  )}°, wind ${Math.round(d.current.wind_speed_10m)} km/h.`;

  return {
    place,
    temperature: temp,
    apparent: Math.round(d.current.apparent_temperature),
    humidity: Math.round(d.current.relative_humidity_2m),
    wind: Math.round(d.current.wind_speed_10m),
    code,
    isDay: d.current.is_day === 1,
    summary,
    hourly,
    daily,
    updatedAt: new Date().toISOString(),
  };
}

function decode(text: string) {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return "";
  return decode(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, ""));
}

const TOPICS: Record<string, string> = {
  top: "https://news.google.com/rss?hl=en-GB&gl=GB&ceid=GB:en",
  business:
    "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-GB&gl=GB&ceid=GB:en",
  technology:
    "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-GB&gl=GB&ceid=GB:en",
  world: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-GB&gl=GB&ceid=GB:en",
  science:
    "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-GB&gl=GB&ceid=GB:en",
};

export async function fetchNews(topic: string, limit = 6): Promise<NewsItem[]> {
  const url = TOPICS[topic] ?? TOPICS.top;
  const res = await fetch(url, { headers: { "User-Agent": "EvaAssistant/1.0" } });
  if (!res.ok) throw new Error(`News feed failed [${res.status}]`);
  const xml = await res.text();
  const items = xml.split(/<item>/i).slice(1, limit + 1);

  return items.map((raw, i) => {
    const rawTitle = tag(raw, "title");
    const dash = rawTitle.lastIndexOf(" - ");
    const title = dash > 20 ? rawTitle.slice(0, dash) : rawTitle;
    const source = tag(raw, "source") || (dash > 20 ? rawTitle.slice(dash + 3) : "Newswire");
    const description = tag(raw, "description");
    const summary = (description.startsWith(title) ? description.slice(title.length) : description)
      .replace(new RegExp(`\\b${source}\\b`, "gi"), "")
      .trim()
      .slice(0, 180);
    return {
      id: `${i}-${tag(raw, "guid") || title}`.slice(0, 90),
      title,
      summary: summary || `${source} reporting.`,
      source,
      url: tag(raw, "link"),
      published: tag(raw, "pubDate"),
    };
  });
}
