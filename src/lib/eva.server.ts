import { EVA_SYSTEM_PROMPT } from "./eva-prompt";
import { webSearch } from "./websearch.server";
import {
  githubListTree,
  githubProposeChange,
  githubReadFile,
  githubSearchCode,
} from "./github.server";

export type EvaMessage = { role: "user" | "assistant" | "system"; content: string };

type EvaToolCall =
  | { tool: "web_search"; query: string }
  | { tool: "github_list_tree" }
  | { tool: "github_search_code"; query: string }
  | { tool: "github_read_file"; path: string }
  | {
      tool: "github_propose_change";
      changes: Array<{ path: string; content: string }>;
      slug: string;
      commitMessage: string;
      prTitle: string;
      prBody: string;
    };

const TOOL_BLOCK = /```eva-tool\s*([\s\S]*?)```/;

const KNOWN_TOOLS = new Set([
  "web_search",
  "github_list_tree",
  "github_search_code",
  "github_read_file",
  "github_propose_change",
]);

function extractToolCall(text: string): EvaToolCall | null {
  const match = text.match(TOOL_BLOCK);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed?.tool && KNOWN_TOOLS.has(parsed.tool)) {
      return parsed as EvaToolCall;
    }
  } catch {
    // malformed block — treat as no tool call, let the model's prose stand
  }
  return null;
}

async function runToolCall(call: EvaToolCall): Promise<string> {
  try {
    if (call.tool === "web_search") {
      const { answer, results } = await webSearch(call.query);
      const lines = results.map((r, i) => `${i + 1}. ${r.title} (${r.url})\n${r.content}`);
      return [
        `Search results for "${call.query}":`,
        answer ? `Quick answer: ${answer}` : null,
        ...lines,
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    if (call.tool === "github_list_tree") {
      const paths = await githubListTree();
      return `Repo file tree (${paths.length} files):\n${paths.join("\n")}`;
    }

    if (call.tool === "github_search_code") {
      const results = await githubSearchCode(call.query);
      if (!results.length) return `No code search results for "${call.query}".`;
      return `Code search results for "${call.query}":\n${results
        .map((r, i) => `${i + 1}. ${r.path}`)
        .join("\n")}`;
    }

    if (call.tool === "github_read_file") {
      const { content, truncated } = await githubReadFile(call.path);
      return `Contents of ${call.path} (from GitHub, base branch):\n${content}${
        truncated ? "\n[truncated at 60000 chars]" : ""
      }`;
    }

    if (call.tool === "github_propose_change") {
      const { prUrl, prNumber } = await githubProposeChange(call);
      return `Opened PR #${prNumber}: ${prUrl}\nFelix must review and merge this himself — nothing is live yet.`;
    }

    return "Unknown tool.";
  } catch (err) {
    return `${call.tool} failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function normalizeApiBase(base: string | undefined, fallback: string) {
  if (!base) return fallback;
  return base.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

const withSystemPrompt = (messages: EvaMessage[]) => [
  { role: "system" as const, content: EVA_SYSTEM_PROMPT },
  ...messages,
];

/**
 * Shared OpenAI-compatible chat completions caller. OpenRouter, NVIDIA NIM,
 * Groq, and Hugging Face's router all speak this exact shape — verified
 * against each provider's current docs (base URLs and models below).
 */
async function callOpenAICompatible(
  label: string,
  base: string,
  key: string | undefined,
  model: string,
): Promise<(messages: EvaMessage[]) => Promise<string>> {
  return async (messages: EvaMessage[]) => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: withSystemPrompt(messages) }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${label} request failed [${res.status}] (${model}): ${body}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  };
}

async function callOpenRouter(messages: EvaMessage[]) {
  const key = process.env.OPENROUTER_API_KEY;
  const base = normalizeApiBase(process.env.OPENROUTER_API_BASE, "https://openrouter.ai/api");
  // OpenRouter requires the "provider/model" format — bare names like "gpt-4o-mini" 404.
  const defaultModel = process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";
  const models = Array.from(new Set([defaultModel, "openai/gpt-4o-mini", "openai/gpt-4o"]));
  let lastError: Error | null = null;

  for (const model of models) {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: withSystemPrompt(messages) }),
    });

    if (res.ok) {
      const data = await res.json();
      return data?.choices?.[0]?.message?.content ?? "";
    }

    const text = await res.text().catch(() => "");
    const isModelMissing =
      res.status === 404 || /NOT_FOUND|not_found|model.*not found|unknown model/i.test(text);
    const error = new Error(`OpenRouter request failed [${res.status}] (${model}): ${text}`);

    if (!isModelMissing) throw error;
    lastError = error;
  }

  throw lastError ?? new Error("OpenRouter request failed without response body");
}

async function callNvidia(messages: EvaMessage[]) {
  const call = await callOpenAICompatible(
    "NVIDIA NIM",
    normalizeApiBase(process.env.NVIDIA_API_BASE, "https://integrate.api.nvidia.com"),
    process.env.NVIDIA_API_KEY,
    process.env.NVIDIA_MODEL?.trim() || "meta/llama-3.3-70b-instruct",
  );
  return call(messages);
}

async function callGroq(messages: EvaMessage[]) {
  // Real base is api.groq.com/openai (not api.groq.ai), OpenAI-compatible shape.
  const call = await callOpenAICompatible(
    "Groq",
    normalizeApiBase(process.env.GROQ_API_BASE, "https://api.groq.com/openai"),
    process.env.GROQ_API_KEY,
    process.env.GROQ_MODEL?.trim() || "llama-3.1-8b-instant",
  );
  return call(messages);
}

async function callHuggingFace(messages: EvaMessage[]) {
  // HF moved chat models to the router (router.huggingface.co), OpenAI-compatible.
  // The old api-inference.huggingface.co/models/{id} raw endpoint is legacy.
  const call = await callOpenAICompatible(
    "HuggingFace",
    normalizeApiBase(process.env.HUGGINGFACE_API_BASE, "https://router.huggingface.co"),
    process.env.HUGGINGFACE_API_KEY,
    process.env.HUGGINGFACE_MODEL?.trim() || "meta-llama/Llama-3.1-8B-Instruct",
  );
  return call(messages);
}

async function callGemini(messages: EvaMessage[]) {
  const key = process.env.GOOGLE_GEMINI_API_KEY;
  const base = normalizeApiBase(
    process.env.GOOGLE_GEMINI_API_BASE,
    "https://generativelanguage.googleapis.com",
  );
  const model = process.env.GOOGLE_GEMINI_MODEL?.trim() || "gemini-2.0-flash";

  // Gemini's contents array only accepts "user"/"model" roles — the system
  // prompt goes in a separate systemInstruction field, and any mid-conversation
  // "system" messages (from our tool loop) get folded into "user" turns.
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: EVA_SYSTEM_PROMPT }] },
      contents,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini request failed [${res.status}] (${model}): ${body}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: { text?: string }) => p.text ?? "").join("");
}

export async function callProvider(messages: EvaMessage[]): Promise<string> {
  // provider preference order: OpenRouter → NVIDIA NIM → Groq → Gemini → HuggingFace
  if (process.env.OPENROUTER_API_KEY) return await callOpenRouter(messages);
  if (process.env.NVIDIA_API_KEY) return await callNvidia(messages);
  if (process.env.GROQ_API_KEY) return await callGroq(messages);
  if (process.env.GOOGLE_GEMINI_API_KEY) return await callGemini(messages);
  if (process.env.HUGGINGFACE_API_KEY) return await callHuggingFace(messages);

  throw new Error(
    "Eva intelligence core is offline: set OPENROUTER_API_KEY or a fallback provider (NVIDIA_API_KEY, GROQ_API_KEY, GOOGLE_GEMINI_API_KEY, or HUGGINGFACE_API_KEY) in your environment.",
  );
}

const MAX_TOOL_ROUNDS = 6;

function describeCall(call: EvaToolCall): string {
  switch (call.tool) {
    case "web_search":
      return `web_search("${call.query}")`;
    case "github_list_tree":
      return "github_list_tree()";
    case "github_search_code":
      return `github_search_code("${call.query}")`;
    case "github_read_file":
      return `github_read_file("${call.path}")`;
    case "github_propose_change":
      return `github_propose_change(${call.changes.map((c) => c.path).join(", ")})`;
  }
}

export async function askEva(messages: EvaMessage[]): Promise<string> {
  const working: EvaMessage[] = [...messages];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const reply = await callProvider(working);
    const call = extractToolCall(reply);

    if (!call || round === MAX_TOOL_ROUNDS) {
      return reply;
    }

    const toolResult = await runToolCall(call);
    working.push(
      { role: "assistant", content: reply },
      { role: "system", content: `Tool result for ${describeCall(call)}:\n\n${toolResult}` },
    );
  }

  // Unreachable, satisfies TypeScript's control-flow analysis.
  throw new Error("Eva tool loop exited unexpectedly.");
}