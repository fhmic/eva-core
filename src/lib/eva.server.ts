import { EVA_SYSTEM_PROMPT } from "./eva-prompt";

export type EvaMessage = { role: "user" | "assistant"; content: string };

export async function askEva(messages: EvaMessage[]): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Eva intelligence core is offline: missing API key.");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
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
