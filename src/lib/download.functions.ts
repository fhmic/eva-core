import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { downloadUrlServer } from "./download.server";

const schema = z.object({
  url: z.string().url().max(2000),
});

export const downloadUrl = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => downloadUrlServer(data.url));
