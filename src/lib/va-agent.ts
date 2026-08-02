/**
 * EVA client-side VA (Vocal Acuity Training Program) progress agent.
 *
 * Mirrors the fenced ```eva-tool block convention used by ./file-agent, but
 * scoped to the two VA tools the model emits (see eva-prompt.ts): updating
 * the onboarding profile and advancing the current day. Calls are parsed out
 * of the model's reply here, then persisted via eva-db's upsertVaProgress.
 */

import { upsertVaProgress } from "./eva-db";

export type VaToolCall =
  | { tool: "va_set_profile"; profile: Record<string, string> }
  | { tool: "va_set_day"; day: number };

const BLOCK = /```(?:eva-tool|json:eva-tool)\s*([\s\S]*?)```|<eva-tool>([\s\S]*?)<\/eva-tool>/gi;

const KNOWN = new Set(["va_set_profile", "va_set_day"]);

const TOTAL_DAYS = 30;

function coerce(value: unknown): VaToolCall[] {
  const items = Array.isArray(value) ? value : [value];
  return items.filter(
    (item): item is VaToolCall =>
      !!item && typeof item === "object" && KNOWN.has(String((item as any).tool)),
  );
}

/** Extract VA tool calls from a model reply (does not alter the reply text). */
export function parseVaToolCalls(text: string): VaToolCall[] {
  const calls: VaToolCall[] = [];
  let match: RegExpExecArray | null;
  BLOCK.lastIndex = 0;
  while ((match = BLOCK.exec(text)) !== null) {
    const raw = (match[1] ?? match[2] ?? "").trim();
    try {
      calls.push(...coerce(JSON.parse(raw)));
    } catch {
      // ignore malformed blocks — they may belong to other tool types
    }
  }
  return calls;
}

/** Persists parsed VA tool calls against the real progress record, in order. */
export async function runVaToolCalls(calls: VaToolCall[]): Promise<void> {
  for (const call of calls) {
    try {
      if (call.tool === "va_set_profile") {
        await upsertVaProgress({ profile: call.profile, status: "in_progress" });
      } else if (call.tool === "va_set_day") {
        const day = Math.min(Math.max(Math.trunc(call.day), 1), TOTAL_DAYS);
        await upsertVaProgress({
          currentDay: day,
          status: day >= TOTAL_DAYS ? "completed" : "in_progress",
        });
      }
    } catch (err) {
      console.error("[eva] VA tool call failed:", call.tool, err);
    }
  }
}
