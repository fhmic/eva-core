// Lightweight Microsoft Graph "agent" stub to satisfy client imports during build.
// The real implementation should parse eva-tool blocks for graph_... calls and
// execute them via the existing msgraph.ts helpers. For now we export a minimal
// parser and runner that safely returns no calls or a descriptive error so the
// app can build and run without the missing module error.

export type GraphToolCall = { tool: string; [key: string]: any };

/**
 * Parse Graph tool calls from an assistant reply.
 *
 * Currently this is a stub that returns an empty array (i.e. no graph calls).
 * Replace with a proper parser for eva-tool JSON blocks when implementing.
 */
export function parseGraphToolCalls(_text: string): GraphToolCall[] {
  return [];
}

/**
 * Execute Graph tool calls and return a report array.
 *
 * This stub returns a failed result for each incoming call so callers receive
 * a predictable shape. Replace with an implementation that calls into
 * src/lib/msgraph.ts (or similar) when you re-enable Microsoft Graph tooling.
 */
export async function runGraphToolCalls(
  calls: GraphToolCall[],
): Promise<{ ok: boolean; message: string }[]> {
  if (!calls || calls.length === 0) return [];
  return calls.map((c) => ({ ok: false, message: `Graph agent not implemented: ${c.tool}` }));
}
