import type { ConnectedAgent } from "../agent-client";
import { AgentIcon } from "./AgentIcon";

export function AgentIdentity({ agent }: { agent: ConnectedAgent }) {
  const status = agent.active ? "Active in the last 5 minutes" : agent.lastSeen ? `Last used ${new Date(agent.lastSeen * 1000).toLocaleString()}` : "Authorized";
  return <span className="agent-identity" data-active={agent.active ? "true" : "false"} title={status}>
    <AgentIcon provider={agent.provider} size={15} /><span>{agent.name}<small>{agent.company} · {agent.active ? "Recent activity" : agent.lastSeen ? "Idle" : "Authorized"}</small></span><i role="img" aria-label={status} />
  </span>;
}
