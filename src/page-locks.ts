import { hash, type Principal } from "./auth.ts";
import { access, editableDocument, readableDocument } from "./collaboration.ts";
import { HttpError } from "./content.ts";
import { pageIdsSchema, type PageLockRequest, type PageLockState } from "./document.ts";
import type { Database } from "./platform.ts";

export function parsePageIds(value: unknown): string[] {
  const parsed = pageIdsSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, "Select 1 to 40 distinct page IDs");
  return parsed.data;
}

async function accountAgents(db: Database, accountId: string) {
  const rows = await db.prepare(`WITH credentials AS (
      SELECT 'credential:'||token_hash AS actorId, 'Account agent' AS label FROM account_credentials WHERE account_id=?
      UNION SELECT 'credential:'||token_hash, 'Workspace agent' FROM agent_credentials WHERE ?='legacy'
      UNION SELECT 'oauth:'||c.client_id, c.client_name FROM oauth_clients c
        WHERE EXISTS(SELECT 1 FROM oauth_access_tokens t WHERE t.client_id=c.client_id AND t.account_id=? AND t.expires_at>unixepoch())
           OR EXISTS(SELECT 1 FROM oauth_refresh_tokens t WHERE t.client_id=c.client_id AND t.account_id=? AND t.expires_at>unixepoch())
    )
    SELECT actorId, COALESCE((SELECT client_name FROM agent_connections WHERE account_id=? AND actor_id=actorId ORDER BY last_seen DESC LIMIT 1), label) AS label
    FROM credentials ORDER BY label LIMIT 50`).bind(accountId, accountId, accountId, accountId, accountId).all<{ actorId: string; label: string }>();
  return Promise.all(rows.results.map(async agent => ({ ...agent, id: await hash(agent.actorId) })));
}

export async function pageLockState(db: Database, documentId: string, principal: Principal): Promise<PageLockState> {
  const permission = await access(db, documentId, principal.accountId);
  const canManage = principal.role === "owner" && permission === "owner";
  const locks = await db.prepare(`SELECT l.page_id AS pageId, l.holder_label AS agent,
      CASE WHEN l.holder_account_id=? AND l.holder_actor_id=? THEN 1 ELSE 0 END AS mine
    FROM page_locks l JOIN documents d ON d.id=l.document_id WHERE d.id=? AND ${readableDocument}`)
    .bind(principal.accountId, principal.actorId, documentId, principal.accountId, principal.accountId)
    .all<{ pageId: string; agent: string; mine: number }>();
  return {
    locks: locks.results.map(row => ({ ...row, mine: Boolean(row.mine) })),
    canManage,
    canRequest: permission !== "viewer",
    agents: canManage ? (await accountAgents(db, principal.accountId)).map(({ id, label }) => ({ id, label })) : [],
  };
}

export async function lockPages(db: Database, documentId: string, principal: Principal, pageIds: string[], agentId: unknown) {
  await access(db, documentId, principal.accountId, "owner");
  const agent = principal.role === "agent" ? { actorId: principal.actorId, label: principal.actorLabel } :
    (await accountAgents(db, principal.accountId)).find(candidate => candidate.id === agentId);
  if (!agent) throw new HttpError(400, "Choose a connected agent from the document owner's account");
  const result = await db.prepare(`WITH wanted AS (SELECT value AS page_id FROM json_each(?))
    INSERT INTO page_locks(document_id,page_id,holder_account_id,holder_actor_id,holder_label)
    SELECT d.id,w.page_id,?,?,? FROM documents d JOIN revisions r ON r.document_id=d.id AND r.revision=d.current_revision
    CROSS JOIN wanted w WHERE d.id=? AND d.account_id=?
      AND NOT EXISTS (
        SELECT 1 FROM wanted x WHERE NOT EXISTS (SELECT 1 FROM json_each(r.content,'$.sections') p WHERE json_extract(p.value,'$.id')=x.page_id)
        OR EXISTS (SELECT 1 FROM page_locks l WHERE l.document_id=d.id AND l.page_id=x.page_id AND (l.holder_account_id<>? OR l.holder_actor_id<>?))
      )
    ON CONFLICT(document_id,page_id) DO UPDATE SET holder_label=excluded.holder_label`)
    .bind(JSON.stringify(pageIds), principal.accountId, agent.actorId, agent.label, documentId, principal.accountId, principal.accountId, agent.actorId).run();
  if (result.meta.changes !== pageIds.length) throw new HttpError(409, "A selected page was removed or is already locked to another agent. Refresh the page locks.", { code: "PAGE_LOCK_CONFLICT" });
  return pageLockState(db, documentId, principal);
}

export async function unlockPages(db: Database, documentId: string, principal: Principal, pageIds: string[]) {
  if (principal.role !== "owner") throw new HttpError(403, "The document owner must unlock pages in the browser");
  await access(db, documentId, principal.accountId, "owner");
  await db.prepare(`DELETE FROM page_locks WHERE document_id=? AND page_id IN (SELECT value FROM json_each(?))
    AND EXISTS(SELECT 1 FROM documents WHERE id=page_locks.document_id AND account_id=?)`)
    .bind(documentId, JSON.stringify(pageIds), principal.accountId).run();
  return pageLockState(db, documentId, principal);
}

export async function requestPageUnlock(db: Database, documentId: string, principal: Principal, pageIds: string[]) {
  await access(db, documentId, principal.accountId, "editor");
  const result = await db.prepare(`WITH wanted AS (SELECT value AS page_id FROM json_each(?))
    INSERT INTO page_unlock_requests(document_id,page_id,requester_account_id,requester_actor_id,requester_label)
    SELECT d.id,w.page_id,?,?,? FROM documents d CROSS JOIN wanted w
    WHERE d.id=? AND ${editableDocument} AND NOT EXISTS (
      SELECT 1 FROM wanted x WHERE NOT EXISTS (SELECT 1 FROM page_locks l
        WHERE l.document_id=d.id AND l.page_id=x.page_id AND (l.holder_account_id<>? OR l.holder_actor_id<>?))
      OR ((SELECT COUNT(*) FROM page_unlock_requests q WHERE q.document_id=d.id AND q.page_id=x.page_id)>=50
        AND NOT EXISTS (SELECT 1 FROM page_unlock_requests q WHERE q.document_id=d.id AND q.page_id=x.page_id
          AND q.requester_account_id=? AND q.requester_actor_id=?))
    )
    ON CONFLICT(document_id,page_id,requester_account_id,requester_actor_id) DO UPDATE SET requester_label=excluded.requester_label`)
    .bind(JSON.stringify(pageIds), principal.accountId, principal.actorId, principal.actorLabel, documentId, principal.accountId, principal.accountId, principal.accountId, principal.actorId, principal.accountId, principal.actorId).run();
  if (result.meta.changes !== pageIds.length) throw new HttpError(409, "Select pages currently locked by another agent with room for new requests");
  return { requestedPageIds: pageIds };
}

export async function pageLockRequests(db: Database, principal: Principal, documentId?: string) {
  const owner = principal.role === "owner";
  return (await db.prepare(`SELECT d.id AS documentId,d.title,q.page_id AS pageId,q.requester_label AS requester,
      l.holder_label AS agent,q.created_at AS createdAt
    FROM page_unlock_requests q JOIN page_locks l USING(document_id,page_id) JOIN documents d ON d.id=l.document_id
    WHERE ${owner ? "d.account_id=?" : "d.account_id=? AND l.holder_account_id=d.account_id AND l.holder_actor_id=?"}
      ${documentId ? "AND d.id=?" : ""}
      AND (d.account_id=q.requester_account_id OR EXISTS(SELECT 1 FROM document_members m
        WHERE m.document_id=d.id AND m.account_id=q.requester_account_id AND m.role='editor'))
    ORDER BY q.created_at DESC LIMIT 50`)
    .bind(principal.accountId, ...(owner ? [] : [principal.actorId]), ...(documentId ? [documentId] : [])).all<PageLockRequest>()).results;
}
