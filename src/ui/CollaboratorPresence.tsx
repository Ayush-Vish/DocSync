import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import type { Collaborator } from "../agent-client";
import { api } from "./api";
import { AgentIdentity } from "./AgentIdentity";

export function CollaboratorPresence({ documentId }: { documentId: string }) {
  const [people, setPeople] = useState<Collaborator[]>([]), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    const refresh = async () => {
      if (loading) return; loading = true;
      try { const next = await api<Collaborator[]>(`/documents/${documentId}/collaborators`, "GET", undefined, controller.signal); setPeople(next); setError(""); }
      catch (error) { if (!controller.signal.aborted) { setPeople([]); setError(error instanceof Error ? error.message : "Cannot load collaborators"); } }
      finally { loading = false; }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [documentId]);
  return <details className="collaborator-presence"><summary><Users size={15} aria-hidden="true" />{people.length || ""} collaborators</summary>
    <div className="collaborator-presence-list" aria-label="Document collaborators">
      {people.map(person => <div key={person.accountId}><strong>{person.name}<small>{person.role}</small></strong><div className="collaborator-agents">{person.agents.length ? person.agents.map(agent => <AgentIdentity key={agent.name} agent={agent} />) : <small>No agent activity recorded</small>}</div></div>)}
      <p>Agent names identify the reported MCP client. Green indicates activity within 5 minutes; an idle authorization is shown separately.</p>
      {error && <p role="status">{error}</p>}
    </div>
  </details>;
}
