export async function askEva(messages: EvaMessage[]): Promise<string> {
  const working: EvaMessage[] = [...messages];
  let readUsedThisTurn = false;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const reply = await callProvider(working);
    const call = extractToolCall(reply);

    if (!call || round === MAX_TOOL_ROUNDS) {
      return reply;
    }

    if (
      call.tool === "github_list_tree" ||
      call.tool === "github_search_code" ||
      call.tool === "github_read_file"
    ) {
      readUsedThisTurn = true;
    }

    if (call.tool === "github_propose_change" && readUsedThisTurn) {
      working.push(
        { role: "assistant", content: reply },
        {
          role: "system",
          content:
            "Blocked: you read repo file(s) earlier in this same turn, so you cannot open a PR in the same breath. Stop here — summarize in plain prose exactly what you'd change and why, then ask Felix to confirm. You may only call github_propose_change in a later turn, after his explicit go-ahead.",
        },
      );
      continue;
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
