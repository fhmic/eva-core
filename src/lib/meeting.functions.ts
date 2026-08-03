import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateMinutes, mintDeepgramToken } from "./meeting.server";

export const getMeetingToken = createServerFn({ method: "POST" }).handler(async () =>
  mintDeepgramToken(),
);

const minutesSchema = z.object({ transcript: z.string().min(1).max(200000) });

export const buildMinutes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => minutesSchema.parse(data))
  .handler(async ({ data }) => ({ minutes: await generateMinutes(data.transcript) }));
