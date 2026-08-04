export type MeetingIntent =
  | { type: "start_meeting"; mode: "in-person" | "online" }
  | { type: "end_meeting" };

/**
 * Lightweight natural-language intent router for meeting-capture commands so
 * voice and text directives control recording without a model round-trip —
 * mirrors media-intents.ts.
 */
export function parseMeetingIntent(raw: string): MeetingIntent | null {
  const text = raw.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (!text) return null;

  const onlineWord = /\b(online|virtual|zoom|teams|meet|call|video)\b/;
  const startWord = /^(?:eva[,\s]+)?(?:please\s+)?(?:start|begin|kick off)\b/;
  const meetingWord = /\b(meeting|minutes|call)\b/;

  if (startWord.test(text) && meetingWord.test(text)) {
    return { type: "start_meeting", mode: onlineWord.test(text) ? "online" : "in-person" };
  }
  if (/^(?:eva[,\s]+)?(?:please\s+)?(?:take|start taking)\s+(?:the\s+)?minutes\b/.test(text)) {
    return { type: "start_meeting", mode: onlineWord.test(text) ? "online" : "in-person" };
  }

  if (
    /^(?:eva[,\s]+)?(?:please\s+)?(?:end|stop|finish|wrap up)\b.*\b(meeting|minutes|recording|call)\b/.test(
      text,
    )
  ) {
    return { type: "end_meeting" };
  }
  if (/^(?:eva[,\s]+)?(?:please\s+)?save\s+(?:the\s+)?minutes\b/.test(text)) {
    return { type: "end_meeting" };
  }

  return null;
}
