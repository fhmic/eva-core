export function reportRuntimeError(error: unknown, context: Record<string, unknown> = {}) {
  // Console-based error reporting for runtime issues.
  if (typeof window === "undefined") return;
  // eslint-disable-next-line no-console
  console.error("Runtime error:", error, context);
}

export default reportRuntimeError;
