import { EVA_SYSTEM_PROMPT } from "./eva-prompt";

export type EvaMessage = { role: "user" | "assistant"; content: string };

export async function askEva(messages: EvaMessage[]): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error("Eva intelligence core is offline: set OPENAI_API_KEY in your environment.");

  const openaiBase = process.env.OPENAI_API_BASE || "https://api.openai.com";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await fetch(`${openaiBase}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: EVA_SYSTEM_PROMPT }, ...messages],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 429) throw new Error("Rate limit reached, Felix. Please retry shortly.");
    if (response.status === 402) throw new Error("AI credits exhausted for this workspace.");
    throw new Error(`Eva request failed [${response.status}]: ${body}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "I wasn't able to formulate a response, Felix.";
}
