import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { searchWebMusic } from "./media.server";

const schema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(20).optional(),
});

export const webMusicSearch = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => ({ results: await searchWebMusic(data.query, data.limit ?? 8) }));
