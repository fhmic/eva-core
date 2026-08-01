import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { askEva } from "./eva.server";

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(24000),
      }),
    )
    .min(1)
    .max(40),
});

export const evaChat = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => ({ reply: await askEva(data.messages) }));
