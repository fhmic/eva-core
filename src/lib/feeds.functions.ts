import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchNews, fetchWeather, geocodePlace } from "./feeds.server";

const geoSchema = z.object({ query: z.string().min(1).max(120) });
const weatherSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  place: z.string().min(1).max(120),
});
const newsSchema = z.object({
  topic: z.enum(["top", "business", "technology", "world", "science"]).default("top"),
  limit: z.number().int().min(1).max(12).optional(),
});

export const searchPlaces = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => geoSchema.parse(d))
  .handler(async ({ data }) => ({ places: await geocodePlace(data.query) }));

export const getWeather = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => weatherSchema.parse(d))
  .handler(async ({ data }) => ({
    report: await fetchWeather(data.latitude, data.longitude, data.place),
  }));

export const getNews = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => newsSchema.parse(d))
  .handler(async ({ data }) => ({ items: await fetchNews(data.topic, data.limit ?? 6) }));
