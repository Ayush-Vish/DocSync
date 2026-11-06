import type { Database } from "./platform.ts";
import type { Principal } from "./auth.ts";
import { agentIdentity, type Collaborator, type ConnectedAgent } from "./agent-client.ts";
import { members, readableDocument } from "./collaboration.ts";

export async function agentActivity(db: Database, principal: Principal) {
  if (principal.role !== "agent") return;
  const name = agentIdentity(principal.actorLabel).name;
  await db.prepare("DELETE FROM agent_connections WHERE account_id=? AND last_seen<unixepoch()-86400").bind(principal.accountId).run();
  await db.prepare(`INSERT INTO agent_connections(account_id,actor_id,client_name,last_seen)
    SELECT ?,?,?,unixepoch() WHERE (SELECT COUNT(*) FROM agent_connections WHERE account_id=?)<20
    OR EXISTS(SELECT 1 FROM agent_connections WHERE account_id=? AND actor_id=? AND client_name=?)
    ON CONFLICT(account_id,actor_id,client_name) DO UPDATE SET last_seen=excluded.last_seen WHERE agent_connections.last_seen<unixepoch()-30`)
    .bind(principal.accountId, principal.actorId, name, principal.accountId, principal.accountId, principal.actorId, name).run();
}
export async function collaborators(db: Database, id: string, accountId: string): Promise<Collaborator[]> {
  const people = await members(db, id, accountId);
  const connections = await db.prepare(`WITH allowed AS(SELECT d.id,d.account_id FROM documents d WHERE d.id=? AND ${readableDocument}),
    participants AS(SELECT account_id FROM allowed UNION SELECT m.account_id FROM document_members m JOIN allowed d ON d.id=m.document_id),
    oauth AS(SELECT account_id,client_id,expires_at FROM oauth_access_tokens UNION ALL SELECT account_id,client_id,expires_at FROM oauth_refresh_tokens)
    SELECT c.account_id,c.client_name,c.last_seen FROM agent_connections c JOIN participants p ON p.account_id=c.account_id
    WHERE c.last_seen>unixepoch()-86400 AND (
      EXISTS(SELECT 1 FROM account_credentials a WHERE a.account_id=c.account_id AND c.actor_id='credential:'||a.token_hash)
      OR (c.account_id='legacy' AND EXISTS(SELECT 1 FROM agent_credentials a WHERE c.actor_id='credential:'||a.token_hash))
      OR EXISTS(SELECT 1 FROM oauth t WHERE t.account_id=c.account_id AND t.expires_at>unixepoch() AND c.actor_id='oauth:'||t.client_id)
    )
    UNION ALL SELECT t.account_id,c.client_name,NULL FROM oauth t JOIN participants p ON p.account_id=t.account_id JOIN oauth_clients c ON c.client_id=t.client_id WHERE t.expires_at>unixepoch() GROUP BY t.account_id,t.client_id`)
    .bind(id, accountId, accountId).all<{ account_id: string; client_name: string; last_seen: number | null }>();
  return people.map(person => {
    const agents = new Map<string, ConnectedAgent>();
    for (const connection of connections.results.filter(row => row.account_id === person.accountId)) {
      const identity = agentIdentity(connection.client_name), previous = agents.get(identity.name);
      const lastSeen = Math.max(previous?.lastSeen ?? 0, connection.last_seen ?? 0) || null;
      agents.set(identity.name, { ...identity, lastSeen, active: Boolean(lastSeen && Date.now() / 1000 - lastSeen <= 300) });
    }
    return { ...person, agents: [...agents.values()] };
  });
}
