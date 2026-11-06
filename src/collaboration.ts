import type { Database } from "./platform.ts";
import type { Principal } from "./auth.ts";
import type { DocumentAccess, EditLock, EditLease } from "./document.ts";
import { hash, randomToken } from "./auth.ts";
import { HttpError } from "./content.ts";

// Queries using these predicates alias documents as d and bind accountId twice.
// Keeping authorization in each mutation prevents a revoke/write race.
export const readableDocument = `(d.account_id=? OR EXISTS(SELECT 1 FROM document_members m WHERE m.document_id=d.id AND m.account_id=?))`;
export const editableDocument = `(d.account_id=? OR EXISTS(SELECT 1 FROM document_members m WHERE m.document_id=d.id AND m.account_id=? AND m.role='editor'))`;
const leaseSeconds = 300;

export async function access(db: Database, id: string, accountId: string, required: DocumentAccess = "viewer"): Promise<DocumentAccess> {
  const row = await db.prepare(`SELECT CASE WHEN d.account_id=? THEN 'owner' ELSE m.role END AS role FROM documents d LEFT JOIN document_members m ON m.document_id=d.id AND m.account_id=? WHERE d.id=? AND ${readableDocument}`)
    .bind(accountId, accountId, id, accountId, accountId).first<{ role: DocumentAccess }>();
  if (!row) throw new HttpError(404, "Document not found");
  if ((required === "owner" && row.role !== "owner") || (required === "editor" && row.role === "viewer")) throw new HttpError(403, `${required === "owner" ? "Document owner" : "Editor"} access required`);
  return row.role;
}

export function lockToken(value: unknown): string {
  if (value === undefined) throw new HttpError(423, "Acquire an edit lock before changing this document.", { code: "LOCK_REQUIRED" });
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new HttpError(400, "Invalid edit lock token");
  return value;
}
export function summary(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > 300) throw new HttpError(400, "Change summary must be at most 300 characters");
  return value.trim();
}

export async function lockStatus(db: Database, id: string, accountId: string): Promise<{ revision: number; lock: EditLock | null; access: DocumentAccess }> {
  const row = await db.prepare(`SELECT d.current_revision AS revision,
    CASE WHEN d.account_id=? THEN 'owner' ELSE (SELECT role FROM document_members WHERE document_id=d.id AND account_id=?) END AS access,
    l.lease_id AS leaseId, COALESCE(a.email,'Workspace member') AS holder, l.actor_label AS agent, l.expires_at AS expiresAt
    FROM documents d LEFT JOIN edit_locks l ON l.document_id=d.id AND l.expires_at>unixepoch() LEFT JOIN accounts a ON a.id=l.account_id
    WHERE d.id=? AND ${readableDocument}`)
    .bind(accountId, accountId, id, accountId, accountId).first<{ revision: number; access: DocumentAccess; leaseId: string | null; holder: string; agent: string; expiresAt: number }>();
  if (!row) throw new HttpError(404, "Document not found");
  return { revision: row.revision, access: row.access, lock: row.leaseId ? { leaseId: row.leaseId, holder: row.holder, agent: row.agent, expiresAt: row.expiresAt } : null };
}

export async function acquireLock(db: Database, id: string, principal: Principal): Promise<EditLease> {
  await access(db, id, principal.accountId, "editor");
  const token = randomToken(), leaseId = crypto.randomUUID();
  const result = await db.prepare(`INSERT INTO edit_locks(document_id,lease_id,token_hash,account_id,actor_id,actor_label,expires_at)
    SELECT d.id,?,?,?,?,?,unixepoch()+? FROM documents d WHERE d.id=? AND ${editableDocument}
    ON CONFLICT(document_id) DO UPDATE SET lease_id=excluded.lease_id,token_hash=excluded.token_hash,account_id=excluded.account_id,actor_id=excluded.actor_id,actor_label=excluded.actor_label,expires_at=excluded.expires_at
    WHERE edit_locks.expires_at<=unixepoch()`)
    .bind(leaseId, await hash(token), principal.accountId, principal.actorId, principal.actorLabel, leaseSeconds, id, principal.accountId, principal.accountId).run();
  if (!result.meta.changes) {
    await access(db, id, principal.accountId, "editor");
    throw new HttpError(423, "This document is being edited. Keep reading and try again when the editor finishes.", { code: "DOCUMENT_LOCKED", ...await lockStatus(db, id, principal.accountId) });
  }
  const status = await lockStatus(db, id, principal.accountId);
  if (status.lock?.leaseId !== leaseId) throw new HttpError(423, "Edit access changed. Your draft has not been saved.");
  return { ...status.lock, revision: status.revision, lockToken: token };
}

export async function renewLock(db: Database, id: string, principal: Principal, token: string) {
  // Possession of the lease secret lets the same account resume after signing
  // in again. Status responses never disclose it to another tab or agent.
  const result = await db.prepare(`UPDATE edit_locks SET expires_at=unixepoch()+?,actor_id=?,actor_label=? WHERE document_id=? AND token_hash=? AND account_id=? AND expires_at>unixepoch()
    AND EXISTS(SELECT 1 FROM documents d WHERE d.id=edit_locks.document_id AND ${editableDocument})`)
    .bind(leaseSeconds, principal.actorId, principal.actorLabel, id, await hash(token), principal.accountId, principal.accountId, principal.accountId).run();
  if (!result.meta.changes) await lostLock(db, id, principal);
  return lockStatus(db, id, principal.accountId);
}
export async function releaseLock(db: Database, id: string, principal: Principal, token: string) {
  await access(db, id, principal.accountId);
  await db.prepare("DELETE FROM edit_locks WHERE document_id=? AND token_hash=? AND account_id=? AND actor_id=?").bind(id, await hash(token), principal.accountId, principal.actorId).run();
  return { ok: true };
}
export async function lostLock(db: Database, id: string, principal: Principal): Promise<never> {
  await access(db, id, principal.accountId, "editor");
  throw new HttpError(423, "Your edit lock expired or belongs to another session. Keep your draft, acquire a new lock, and read the latest version before saving.", { code: "LOCK_LOST", ...await lockStatus(db, id, principal.accountId) });
}

function memberRole(value: unknown): "editor" | "viewer" {
  if (value !== "editor" && value !== "viewer") throw new HttpError(400, "Choose editor or viewer access");
  return value;
}
export async function members(db: Database, id: string, accountId: string) {
  await access(db, id, accountId);
  return (await db.prepare(`WITH allowed AS(SELECT d.id,d.account_id FROM documents d WHERE d.id=? AND ${readableDocument})
    SELECT a.id AS accountId,COALESCE(a.email,'Workspace owner') AS name,'owner' AS role FROM allowed d JOIN accounts a ON a.id=d.account_id
    UNION ALL SELECT a.id,COALESCE(a.email,'Workspace member'),m.role FROM document_members m JOIN allowed d ON d.id=m.document_id JOIN accounts a ON a.id=m.account_id`)
    .bind(id, accountId, accountId).all<{ accountId: string; name: string; role: "owner" | "editor" | "viewer" }>()).results;
}
export async function sharing(db: Database, id: string, accountId: string) {
  await access(db, id, accountId, "owner");
  const people = await members(db, id, accountId);
  const invitations = await db.prepare("SELECT id,role,expires_at AS expiresAt FROM document_invitations WHERE document_id=? AND accepted_by IS NULL AND expires_at>unixepoch() ORDER BY expires_at DESC LIMIT 50").bind(id).all();
  return { members: people, invitations: invitations.results };
}
export async function invite(db: Database, id: string, accountId: string, role: unknown, origin: string) {
  await access(db, id, accountId, "owner");
  const permission = memberRole(role), token = randomToken(), invitationId = crypto.randomUUID();
  const result = await db.prepare("INSERT INTO document_invitations(id,document_id,token_hash,role,expires_at) SELECT ?,id,?,?,unixepoch()+86400 FROM documents WHERE id=? AND account_id=? AND (SELECT COUNT(*) FROM document_invitations WHERE document_id=documents.id AND accepted_by IS NULL AND expires_at>unixepoch())<50").bind(invitationId, await hash(token), permission, id, accountId).run();
  if (!result.meta.changes) { await access(db, id, accountId, "owner"); throw new HttpError(400, "Revoke an unused invitation before creating another"); }
  return { id: invitationId, url: `${origin}/invite#invite=${token}`, role: permission };
}
export async function invitation(db: Database, token: string) {
  const row = await db.prepare("SELECT i.document_id AS documentId,d.title,i.role,i.expires_at AS expiresAt FROM document_invitations i JOIN documents d ON d.id=i.document_id WHERE i.token_hash=? AND i.accepted_by IS NULL AND i.expires_at>unixepoch()")
    .bind(await hash(token)).first<{ documentId: string; title: string; role: "editor" | "viewer"; expiresAt: number }>();
  if (!row) throw new HttpError(404, "Invitation expired, revoked, or already used");
  return row;
}
export async function acceptInvitation(db: Database, token: string, accountId: string) {
  const target = await invitation(db, token), acceptanceId = crypto.randomUUID(), digest = await hash(token);
  const results = await db.batch([
    db.prepare("UPDATE document_invitations SET accepted_by=?,acceptance_id=? WHERE token_hash=? AND accepted_by IS NULL AND expires_at>unixepoch() AND EXISTS(SELECT 1 FROM documents d WHERE d.id=document_id AND d.account_id<>?)").bind(accountId, acceptanceId, digest, accountId),
    db.prepare("INSERT INTO document_members(document_id,account_id,role) SELECT document_id,?,role FROM document_invitations WHERE token_hash=? AND accepted_by=? AND acceptance_id=? ON CONFLICT(document_id,account_id) DO UPDATE SET role=CASE WHEN document_members.role='editor' THEN 'editor' ELSE excluded.role END").bind(accountId, digest, accountId, acceptanceId),
  ]);
  if (!results[0].meta.changes) throw new HttpError(409, "Invitation was already used or this document belongs to you");
  return { documentId: target.documentId, access: await access(db, target.documentId, accountId) };
}
export async function changeMember(db: Database, id: string, ownerId: string, accountId: unknown, role?: unknown) {
  await access(db, id, ownerId, "owner");
  if (typeof accountId !== "string" || accountId.length > 80 || accountId === ownerId) throw new HttpError(400, "Choose a collaborator; document ownership cannot be changed here");
  const permission = role === undefined ? null : memberRole(role);
  await db.batch([
    db.prepare("DELETE FROM edit_locks WHERE document_id=? AND account_id=? AND EXISTS(SELECT 1 FROM documents WHERE id=? AND account_id=?)").bind(id, accountId, id, ownerId),
    permission ? db.prepare("UPDATE document_members SET role=? WHERE document_id=? AND account_id=? AND EXISTS(SELECT 1 FROM documents WHERE id=? AND account_id=?)").bind(permission, id, accountId, id, ownerId)
      : db.prepare("DELETE FROM document_members WHERE document_id=? AND account_id=? AND EXISTS(SELECT 1 FROM documents WHERE id=? AND account_id=?)").bind(id, accountId, id, ownerId),
  ]);
  return { ok: true };
}
