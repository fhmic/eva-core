import { EVA_SYSTEM_PROMPT } from "./eva-prompt";

export type EvaMessage = { role: "user" | "assistant"; content: string };

function joinMessages(messages: EvaMessage[]) {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n");
}

function normalizeApiBase(base: string | undefined, fallback: string) {
  if (!base) return fallback;
  return base.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

async function callOpenAI(messages: EvaMessage[]) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiBase = normalizeApiBase(process.env.OPENAI_API_BASE, "https://api.openai.com");
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const fallbackModel = "gpt-3.5-turbo";
  const useFallback = !process.env.OPENAI_MODEL;

  const makeRequest = async (modelName: string) => {
    const url = `${openaiBase}/v1/chat/completions`;
    return await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName, messages: [{ role: "system", content: EVA_SYSTEM_PROMPT }, ...messages] }),
    });
  };

  const res = await makeRequest(model);
  if (res.ok) {
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  const body = await res.text().catch(() => "");
  if (res.status === 429) throw new Error("Rate limit reached. Please retry shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted for this workspace.");
  if (res.status === 404 && useFallback && model === "gpt-4o-mini") {
    const retry = await makeRequest(fallbackModel);
    if (retry.ok) {
      const data = await retry.json();
      return data.choices?.[0]?.message?.content ?? "";
    }
    const retryBody = await retry.text().catch(() => "");
    throw new Error(
      `OpenAI fallback failed for ${fallbackModel} [${retry.status}]: ${retryBody}`,
    );
  }

  if (res.status === 404)
    throw new Error(
      `OpenAI request failed 404: model or endpoint not found. Confirm OPENAI_API_BASE is https://api.openai.com and OPENAI_MODEL is valid. Response: ${body}`,
    );
  throw new Error(`OpenAI request failed [${res.status}]: ${body}`);
}

async function callOpenRouter(messages: EvaMessage[]) {
  const key = process.env.OPENROUTER_API_KEY;
  const base = normalizeApiBase(process.env.OPENROUTER_API_BASE, "https://openrouter.ai/api");
  const model = process.env.OPENROUTER_MODEL?.trim() || "gpt-4o-mini";
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: EVA_SYSTEM_PROMPT }, ...messages] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter request failed [${res.status}]: ${body}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? data?.output?.[0]?.content ?? "";
}

async function callGemini(messages: EvaMessage[]) {
  const key = process.env.GROQ_API_KEY;
  const base = process.env.GROQ_API_BASE || "https://api.groq.ai/v1";
  const model = process.env.GROQ_MODEL || "groq-alpha:latest";
  const prompt = `${EVA_SYSTEM_PROMPT}\n${joinMessages(messages)}`;
  const res = await fetch(`${base}/models/${model}/predict`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`Groq request failed [${res.status}]`);
  const data = await res.json();
  return data?.output?.[0]?.content ?? data?.result ?? "";
}

async function callHuggingFace(messages: EvaMessage[]) {
  const key = process.env.HUGGINGFACE_API_KEY;
  const base = process.env.HUGGINGFACE_API_BASE || "https://api-inference.huggingface.co";
  const model = process.env.HUGGINGFACE_MODEL || "gpt2";
  const prompt = `${EVA_SYSTEM_PROMPT}\n${joinMessages(messages)}`;
  const res = await fetch(`${base}/models/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: prompt }),
  });
  if (!res.ok) throw new Error(`HuggingFace request failed [${res.status}]`);
  const data = await res.json();
  // HF can return text or an array of tokens/objects
  if (typeof data === "string") return data;
  if (Array.isArray(data) && data[0]?.generated_text) return data[0].generated_text;
  if (data?.generated_text) return data.generated_text;
  if (data?.error) throw new Error(`HuggingFace: ${data.error}`);
  return "";
}

export async function askEva(messages: EvaMessage[]): Promise<string> {
  // provider preference order: OpenAI → OpenRouter → Gemini → Groq → HuggingFace
  try {
    if (process.env.OPENAI_API_KEY) return await callOpenAI(messages);
    if (process.env.OPENROUTER_API_KEY) return await callOpenRouter(messages);
    if (process.env.GOOGLE_GEMINI_API_KEY) return await callGemini(messages);
    if (process.env.GROQ_API_KEY) return await callGroq(messages);
    if (process.env.HUGGINGFACE_API_KEY) return await callHuggingFace(messages);
  } catch (err) {
    // Bubble up provider-specific errors so caller can decide how to present them
    throw err;
  }

  throw new Error(
    "Eva intelligence core is offline: set OPENAI_API_KEY or a fallback provider (GOOGLE_GEMINI_API_KEY, GROQ_API_KEY, or HUGGINGFACE_API_KEY) in your environment.",
  );
}
