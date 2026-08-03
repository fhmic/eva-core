import { callProvider, type EvaMessage } from "./eva.server";
import { MEETING_MINUTES_PROMPT } from "./meeting-prompt";

export type MinutesActionItem = { owner: string; task: string; due: string | null };
export type MinutesDiscussion = { topic: string; notes: string };

export type MeetingMinutes = {
  title: string;
  date: string | null;
  attendees: string[];
  summary: string;
  agenda: string[];
  discussion: MinutesDiscussion[];
  decisions: string[];
  actionItems: MinutesActionItem[];
};

function stripFences(text: string) {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
}

function coerceMinutes(raw: unknown): MeetingMinutes {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const strArray = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    title: typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : "Untitled Meeting",
    date: typeof obj.date === "string" && obj.date.trim() ? obj.date : null,
    attendees: strArray(obj.attendees),
    summary: typeof obj.summary === "string" ? obj.summary : "",
    agenda: strArray(obj.agenda),
    discussion: Array.isArray(obj.discussion)
      ? obj.discussion
          .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
          .map((d) => ({
            topic: typeof d.topic === "string" ? d.topic : "Untitled topic",
            notes: typeof d.notes === "string" ? d.notes : "",
          }))
      : [],
    decisions: strArray(obj.decisions),
    actionItems: Array.isArray(obj.actionItems)
      ? obj.actionItems
          .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
          .map((a) => ({
            owner: typeof a.owner === "string" && a.owner.trim() ? a.owner : "Unassigned",
            task: typeof a.task === "string" ? a.task : "",
            due: typeof a.due === "string" && a.due.trim() ? a.due : null,
          }))
      : [],
  };
}

/** Turns a finished, speaker-labeled transcript into structured minutes via the LLM router. */
export async function generateMinutes(transcript: string): Promise<MeetingMinutes> {
  const messages: EvaMessage[] = [
    { role: "user", content: `${MEETING_MINUTES_PROMPT}\n\nTRANSCRIPT:\n${transcript}` },
  ];
  const reply = await callProvider(messages);
  try {
    return coerceMinutes(JSON.parse(stripFences(reply)));
  } catch {
    // Model didn't return clean JSON — fall back to a minimal record so the
    // meeting isn't lost; the raw transcript is always saved alongside it.
    return coerceMinutes({ title: "Meeting Minutes", summary: stripFences(reply).slice(0, 2000) });
  }
}

/**
 * Deepgram's realtime WebSocket API is meant to be spoken to directly from the
 * browser — proxying raw audio through our own serverless function isn't
 * viable on Vercel (no persistent connections), so instead this mints a
 * short-lived access token server-side via Deepgram's token-grant endpoint
 * and hands it to the client, which opens its own socket straight to
 * Deepgram. This only requires DEEPGRAM_API_KEY (any Member-or-higher key —
 * no admin "keys:write" scope needed, and no project ID either, since /auth/grant
 * is scoped to whichever project the key already belongs to).
 */
export async function mintDeepgramToken(): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Meeting transcription is not configured: set DEEPGRAM_API_KEY in your environment (from your Deepgram account's project settings — any Member-level key works).",
    );
  }
  const ttl = 3600;
  const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: ttl }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Deepgram token grant failed [${res.status}]: ${body}`);
  }
  const data = await res.json();
  const accessToken = data?.access_token;
  if (!accessToken) throw new Error("Deepgram token grant succeeded but returned no access_token.");
  return { accessToken, expiresInSeconds: data?.expires_in ?? ttl };
}
