import { Asterisk, Orbit, Plug, SquareTerminal } from "lucide-react";
import type { ConnectedAgent } from "../agent-client";

export function AgentIdentity({ agent }: { agent: ConnectedAgent }) {
  const Icon = { openai: SquareTerminal, anthropic: Asterisk, google: Orbit, other: Plug }[agent.provider];
  const status = agent.active ? "Active in the last 5 minutes" : agent.lastSeen ? `Last used ${new Date(agent.lastSeen * 1000).toLocaleString()}` : "Authorized";
  return <span className="agent-identity" data-active={agent.active ? "true" : "false"} title={status}>
    <Icon size={15} aria-hidden="true" /><span>{agent.name}<small>{agent.company} · {agent.active ? "Recent activity" : agent.lastSeen ? "Idle" : "Authorized"}</small></span><i role="img" aria-label={status} />
  </span>;
}
