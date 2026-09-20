export type FailureClass = "timeout" | "auth" | "blocking" | "network" | "locator" | "unknown";

export function classifyError(error: unknown): FailureClass {
  const msg = String((error as any)?.message || error).toLowerCase();
  if (msg.includes("timeout")) return "timeout";
  if (msg.includes("captcha") || msg.includes("blocked") || msg.includes("rate limit")) return "blocking";
  if (msg.includes("net::") || msg.includes("network") || msg.includes("connection")) return "network";
  if (msg.includes("locator") || msg.includes("strict mode") || msg.includes("element")) return "locator";
  if (msg.includes("login") || msg.includes("sign in") || msg.includes("unauthorized")) return "auth";
  return "unknown";
}
