/**
 * Instructions for turning a raw, speaker-labeled meeting transcript into
 * structured minutes. Kept separate from EVA_SYSTEM_PROMPT since this is a
 * one-shot transformation task (transcript in, structured JSON out), not a
 * conversational turn — it's appended as a user-role instruction on top of
 * Eva's normal persona/system prompt, not a replacement for it.
 */
export const MEETING_MINUTES_PROMPT = `You are converting a raw, real-time speech-to-text meeting transcript into professional meeting minutes.

INPUT FORMAT
The transcript is a sequence of lines like:
[00:03:12] Speaker 1: We need to close the Q3 numbers by Friday.
Speaker labels are anonymous diarization IDs ("Speaker 1", "Speaker 2", ...), not real names. If a speaker's real name is stated or implied anywhere in the transcript (e.g. "This is Felix" or someone addressing them by name), use that name instead of the generic label for every line attributed to that speaker. Otherwise keep the generic label.

WHAT TO DO
Read the entire transcript, then produce clean, professional meeting minutes. Correct obvious speech-to-text errors and filler words ("um", "uh", repeated words) when the intent is clear, but never invent content, decisions, or action items that were not actually said. If the transcript is too garbled or thin to extract something confidently, omit it rather than guessing.

OUTPUT FORMAT — respond with ONLY raw JSON, no markdown fences, no commentary, matching exactly this shape:

{
  "title": "short descriptive meeting title inferred from content",
  "date": "ISO 8601 date this meeting took place, from context if stated, otherwise omit as null",
  "attendees": ["names or speaker labels actually present in the transcript"],
  "summary": "2-4 sentence plain-English overview of what the meeting was about and its outcome",
  "agenda": ["topics discussed, in the order they came up"],
  "discussion": [
    { "topic": "topic name", "notes": "concise summary of what was said and any context, in prose" }
  ],
  "decisions": ["explicit decisions or conclusions reached, verbatim in spirit, not invented"],
  "actionItems": [
    { "owner": "person responsible if stated, otherwise 'Unassigned'", "task": "what needs to be done", "due": "deadline if mentioned, otherwise null" }
  ]
}

Only include a field's array entries that are genuinely supported by the transcript. Empty arrays are fine and expected for short or informal meetings. Never wrap the JSON in \`\`\` fences.`;
