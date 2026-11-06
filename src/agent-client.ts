export type AgentProvider = "openai" | "anthropic" | "google" | "other";
export function clientName(request: Request, fallback: string) {
  try {
    const value = decodeURIComponent(request.headers.get("X-DocSync-Client") || "");
    return value && value.length <= 100 && !/[\x00-\x1f\x7f]/.test(value) ? value : fallback;
  } catch { return fallback; }
}
export function agentIdentity(client: string): { name: string; company: string; provider: AgentProvider } {
  if (/\bcodex\b/i.test(client)) return { name: "Codex", company: "OpenAI", provider: "openai" };
  if (/\bclaude\b/i.test(client)) return { name: /code/i.test(client) ? "Claude Code" : "Claude", company: "Anthropic", provider: "anthropic" };
  if (/\bantigravity\b|\bgemini\b/i.test(client)) return { name: /antigravity/i.test(client) ? "Antigravity" : "Gemini", company: "Google", provider: "google" };
  return { name: client.slice(0, 80) || "MCP client", company: "MCP client", provider: "other" };
}
export type ConnectedAgent = ReturnType<typeof agentIdentity> & { active: boolean; lastSeen: number | null };
export type Collaborator = { accountId: string; name: string; role: "owner" | "editor" | "viewer"; agents: ConnectedAgent[] };
