/**
 * EVA client-side Microsoft Graph agent.
 *
 * Eva emits structured tool calls in her reply as ```eva-tool fenced JSON
 * (the same fence the file agent uses), and this agent parses the graph_*
 * calls out of the raw reply and executes them against the real Microsoft
 * Graph helpers in ./msgraph.ts. Every call returns a real result or a
 * descriptive failure — nothing here is a stub.
 */

import { graph } from "./msgraph";

export type GraphToolCall =
  | { tool: "graph_list_mail" }
  | { tool: "graph_search_mail"; query: string }
  | { tool: "graph_read_mail"; id: string }
  | { tool: "graph_draft_mail"; to: string; subject: string; body: string }
  | { tool: "graph_send_mail"; to: string; subject: string; body: string }
  | { tool: "graph_list_events" }
  | {
      tool: "graph_create_event";
      subject: string;
      start: string;
      end: string;
      location?: string;
      attendees?: string[];
      timeZone?: string;
    }
  | { tool: "graph_list_tasks" }
  | {
      tool: "graph_create_task";
      title: string;
      dueDateTime?: string;
      notes?: string;
      timeZone?: string;
    };

export type GraphToolResult = { ok: boolean; message: string };

const BLOCK = /```(?:eva-tool|json:eva-tool)\s*([\s\S]*?)```|<eva-tool>([\s\S]*?)<\/eva-tool>/gi;

const KNOWN = new Set([
  "graph_list_mail",
  "graph_search_mail",
  "graph_read_mail",
  "graph_draft_mail",
  "graph_send_mail",
  "graph_list_events",
  "graph_create_event",
  "graph_list_tasks",
  "graph_create_task",
]);

function coerce(value: unknown): GraphToolCall[] {
  const items = Array.isArray(value) ? value : [value];
  return items.filter((item): item is GraphToolCall => {
    if (!item || typeof item !== "object") return false;
    const tool = (item as Record<string, unknown>).tool;
    return typeof tool === "string" && KNOWN.has(tool);
  });
}

/**
 * Extract graph_* tool calls from a model reply.
 *
 * Scans the same ```eva-tool fences the file agent uses, but only keeps
 * blocks whose tool name is graph_*. Blocks belonging to other agents
 * (file/VA tools) are ignored here — each agent's parser only claims the
 * calls it recognizes.
 */
export function parseGraphToolCalls(text: string): GraphToolCall[] {
  const calls: GraphToolCall[] = [];
  let match: RegExpExecArray | null;
  BLOCK.lastIndex = 0;
  while ((match = BLOCK.exec(text)) !== null) {
    const raw = (match[1] ?? match[2] ?? "").trim();
    if (!raw) continue;
    try {
      calls.push(...coerce(JSON.parse(raw)));
    } catch {
      // Not valid JSON, or belongs to another agent — skip.
    }
  }
  return calls;
}

function fmtDate(iso?: string) {
  if (!iso) return "no date";
  try {
    return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

async function execOne(call: GraphToolCall): Promise<GraphToolResult> {
  try {
    switch (call.tool) {
      case "graph_list_mail": {
        const { messages, unread } = await graph.mail();
        if (!messages.length)
          return { ok: true, message: `Inbox: no messages (${unread} unread).` };
        const lines = messages.map(
          (m) =>
            `- [${m.id}] ${m.isRead ? "" : "(unread) "}"${m.subject}" from ${
              m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "unknown"
            } — ${fmtDate(m.receivedDateTime)}\n  ${m.bodyPreview}`,
        );
        return { ok: true, message: `Inbox (${unread} unread):\n${lines.join("\n")}` };
      }
      case "graph_search_mail": {
        const results = await graph.searchMail(call.query);
        if (!results.length) return { ok: true, message: `No mail matching "${call.query}".` };
        const lines = results.map(
          (m) =>
            `- [${m.id}] "${m.subject}" from ${
              m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "unknown"
            } — ${fmtDate(m.receivedDateTime)}\n  ${m.bodyPreview}`,
        );
        return { ok: true, message: `Search results for "${call.query}":\n${lines.join("\n")}` };
      }
      case "graph_read_mail": {
        const msg = await graph.readMail(call.id);
        return {
          ok: true,
          message: `Subject: ${msg.subject}\nFrom: ${
            msg.from?.emailAddress?.name ?? msg.from?.emailAddress?.address ?? "unknown"
          }\nReceived: ${fmtDate(msg.receivedDateTime)}\n\n${msg.body.content}`,
        };
      }
      case "graph_draft_mail": {
        const res = await graph.draftMail(call.to, call.subject, call.body);
        return {
          ok: true,
          message: `Draft created for ${call.to}: "${call.subject}"${res?.webLink ? ` (${res.webLink})` : ""}`,
        };
      }
      case "graph_send_mail": {
        await graph.sendMail(call.to, call.subject, call.body);
        return { ok: true, message: `Sent to ${call.to}: "${call.subject}"` };
      }
      case "graph_list_events": {
        const events = await graph.events();
        if (!events.length) return { ok: true, message: "No events in the next 7 days." };
        const lines = events.map(
          (e) =>
            `- [${e.id}] "${e.subject}" — ${fmtDate(e.start.dateTime)} to ${fmtDate(e.end.dateTime)}${
              e.location?.displayName ? ` @ ${e.location.displayName}` : ""
            }`,
        );
        return { ok: true, message: `Upcoming events:\n${lines.join("\n")}` };
      }
      case "graph_create_event": {
        const res = await graph.createEvent(call.subject, call.start, call.end, {
          location: call.location,
          attendees: call.attendees,
          timeZone: call.timeZone,
        });
        return {
          ok: true,
          message: `Created event "${call.subject}" (${call.start} – ${call.end})${res?.webLink ? ` — ${res.webLink}` : ""}`,
        };
      }
      case "graph_list_tasks": {
        const tasks = await graph.tasks();
        if (!tasks.length) return { ok: true, message: "No open tasks." };
        const lines = tasks.map(
          (t) =>
            `- [${t.id}] ${t.title} (${t.status})${t.dueDateTime ? ` — due ${fmtDate(t.dueDateTime.dateTime)}` : ""}`,
        );
        return { ok: true, message: `Open tasks:\n${lines.join("\n")}` };
      }
      case "graph_create_task": {
        await graph.createTask(call.title, {
          dueIso: call.dueDateTime,
          notes: call.notes,
          timeZone: call.timeZone,
        });
        return {
          ok: true,
          message: `Created task "${call.title}"${call.dueDateTime ? ` — due ${fmtDate(call.dueDateTime)}` : ""}`,
        };
      }
      default: {
        const unknownTool = (call as { tool: string }).tool;
        return { ok: false, message: `Unknown graph tool: ${unknownTool}` };
      }
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes("[403]") || raw.includes("[401]")) {
      return {
        ok: false,
        message: `Permission denied for ${call.tool} — this scope likely isn't granted/consented yet in your Azure App Registration.`,
      };
    }
    return { ok: false, message: `${call.tool} failed: ${raw.slice(0, 300)}` };
  }
}

/** Executes a batch of graph tool calls sequentially and returns a report per call. */
export async function runGraphToolCalls(calls: GraphToolCall[]): Promise<GraphToolResult[]> {
  const results: GraphToolResult[] = [];
  for (const call of calls) {
    results.push(await execOne(call));
  }
  return results;
}
