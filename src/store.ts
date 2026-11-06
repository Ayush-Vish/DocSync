import type { Database } from "./platform.ts";
import type { Principal } from "./auth.ts";
import { hash } from "./auth.ts";
import { access, readableDocument, editableDocument, lostLock } from "./collaboration.ts";
import {
  HttpError,
  validateContent,
  lintContent,
  type Content,
  type Document,
} from "./content.ts";

type Row = {
  id: string;
  revision: number;
  content: string;
  updated_at: string;
  access: "owner" | "editor" | "viewer";
};
const document = (row: Row): Document => ({
  ...JSON.parse(row.content),
  id: row.id,
  revision: row.revision,
  updated_at: row.updated_at,
  access: row.access,
});
export async function getDocument(
  db: Database,
  id: string,
  revision?: number,
  accountId = "legacy",
): Promise<Document> {
  const row = await db
    .prepare(
      `SELECT d.id, r.revision, r.content, r.created_at AS updated_at, CASE WHEN d.account_id=? THEN 'owner' ELSE (SELECT role FROM document_members WHERE document_id=d.id AND account_id=?) END AS access FROM documents d JOIN revisions r ON r.document_id = d.id AND r.revision = ${revision === undefined ? "d.current_revision" : "?"} WHERE d.id = ? AND ${readableDocument}`,
    )
    .bind(
      accountId, accountId, ...(revision === undefined ? [id] : [revision, id]), accountId, accountId,
    )
    .first<Row>();
  if (!row) throw new HttpError(404, "Document or revision not found");
  return document(row);
}
export async function documentThumbnail(db: Database, id: string, accountId: string) {
  const row = await db.prepare(
    `SELECT d.current_revision AS revision, json_remove(json_extract(r.content, '$.sections[0]'), '$.js') AS section FROM documents d JOIN revisions r ON r.document_id=d.id AND r.revision=d.current_revision WHERE d.id=? AND ${readableDocument}`,
  ).bind(id, accountId, accountId).first<{ revision: number; section: string }>();
  if (!row?.section) throw new HttpError(404, "Document not found");
  return { revision: row.revision, section: JSON.parse(row.section) as Content["sections"][number] };
}

export async function createDocument(
  db: Database,
  input: unknown,
  accountId = "legacy",
  actor?: Principal,
): Promise<Document> {
  const content = validateContent(input),
    warnings = lintContent(content),
    id = crypto.randomUUID(),
    time = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO documents(id,title,updated_at,account_id) VALUES(?,?,?,?)",
      )
      .bind(id, content.title, time, accountId),
    db
      .prepare(
        "INSERT INTO revisions(document_id,revision,content,created_at,author_account_id,actor_id,actor_label,summary) VALUES(?,1,?,?,?,?,?,'Created document')",
      )
      .bind(id, JSON.stringify(content), time, actor?.accountId ?? null, actor?.actorId ?? null, actor?.actorLabel ?? null),
  ]);
  return { ...content, id, revision: 1, updated_at: time, access: "owner", ...(warnings.length ? { warnings } : {}) };
}
export async function updateDocument(
  db: Database,
  id: string,
  expected: number,
  input: unknown,
  principal: Principal,
  lockToken: string,
  summary = "",
  restoredFrom?: number,
): Promise<Document> {
  const accountId = principal.accountId;
  const permission = await access(db, id, accountId, "editor");
  const content = validateContent(input),
    warnings = lintContent(content),
    time = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO revisions(document_id,revision,content,created_at,author_account_id,actor_id,actor_label,parent_revision,summary,restored_from)
       SELECT d.id,d.current_revision+1,?,?,?,?,?,d.current_revision,?,? FROM documents d JOIN edit_locks l ON l.document_id=d.id
       WHERE d.id=? AND d.current_revision=? AND ${editableDocument} AND l.token_hash=? AND l.account_id=? AND l.actor_id=? AND l.expires_at>unixepoch()`,
    )
    .bind(JSON.stringify(content), time, accountId, principal.actorId, principal.actorLabel, summary, restoredFrom ?? null, id, expected, accountId, accountId, await hash(lockToken), accountId, principal.actorId)
    .run();
  if (result.meta.changes === 0) {
    await access(db, id, accountId, "editor");
    const lease = await db.prepare("SELECT 1 AS valid FROM edit_locks WHERE document_id=? AND token_hash=? AND actor_id=? AND account_id=? AND expires_at>unixepoch()")
      .bind(id, await hash(lockToken), principal.actorId, accountId).first();
    if (!lease) await lostLock(db, id, principal);
    const current = await getDocument(db, id, undefined, accountId);
    throw new HttpError(
      409,
      "Document changed. Read the current revision before retrying; your draft has not been overwritten.",
      { currentRevision: current.revision },
    );
  }
  return { ...content, id, revision: expected + 1, updated_at: time, access: permission, ...(warnings.length ? { warnings } : {}) };
}
export async function listDocuments(db: Database, accountId = "legacy") {
  return (
    await db
      .prepare(
        // Explicit formats always win. Infer old untyped decks from slide class
        // tokens on every page, without returning snapshot bodies to the list.
        `SELECT d.id, d.title, d.current_revision AS revision, d.updated_at,
          CASE
            WHEN json_extract(r.content, '$.format') = 'document' THEN 'document'
            WHEN json_extract(r.content, '$.format') IN ('presentation', 'slides') THEN 'presentation'
            WHEN json_array_length(r.content, '$.sections') > 0 AND NOT EXISTS (
              SELECT 1 FROM json_each(r.content, '$.sections') s
              WHERE NOT EXISTS (
                WITH RECURSIVE classes(rest, attribute) AS (
                  SELECT json_extract(s.value, '$.html'), 0
                  UNION ALL
                  SELECT substr(rest, instr(rest, ' class="') + 8), 1
                  FROM classes WHERE instr(rest, ' class="') > 0
                )
                SELECT 1 FROM classes WHERE attribute = 1 AND instr(
                  ' ' || replace(replace(replace(substr(rest, 1, instr(rest, '"') - 1), char(9), ' '), char(10), ' '), char(13), ' ') || ' ',
                  ' slide '
                ) > 0
              )
            ) THEN 'presentation'
            ELSE 'document'
          END AS format
        FROM documents d LEFT JOIN revisions r ON r.document_id = d.id AND r.revision = d.current_revision
        WHERE ${readableDocument} ORDER BY d.updated_at DESC LIMIT 200`,
      )
      .bind(accountId, accountId)
      .all()
  ).results;
}
export async function history(db: Database, id: string, accountId = "legacy") {
  await getDocument(db, id, undefined, accountId);
  return (
    await db
      .prepare(
        `SELECT r.revision,r.created_at,a.email AS author,r.actor_label AS agent,r.parent_revision,r.summary,r.restored_from FROM revisions r JOIN documents d ON d.id=r.document_id LEFT JOIN accounts a ON a.id=r.author_account_id WHERE d.id=? AND ${readableDocument} ORDER BY r.revision DESC LIMIT 100`,
      )
      .bind(id, accountId, accountId)
      .all()
  ).results;
}
export async function compareVersions(db: Database, id: string, from: number, to: number, accountId: string) {
  const [before, after] = await Promise.all([getDocument(db, id, from, accountId), getDocument(db, id, to, accountId)]);
  const ids = new Set([...before.sections.map(page => page.id), ...after.sections.map(page => page.id)]);
  const pages = [...ids].flatMap(id => {
    const fromIndex = before.sections.findIndex(page => page.id === id), toIndex = after.sections.findIndex(page => page.id === id);
    const oldPage = before.sections[fromIndex], newPage = after.sections[toIndex];
    const changes = (["kind", "html", "css", "js"] as const).flatMap(field => {
      const previous = oldPage?.[field] ?? "", next = newPage?.[field] ?? "";
      return previous === next ? [] : [{ field, before: previous, after: next }];
    });
    return changes.length || fromIndex !== toIndex ? [{ id, fromIndex, toIndex, changes }] : [];
  });
  return { from, to, title: { before: before.title, after: after.title }, format: { before: before.format ?? "document", after: after.format ?? "document" }, pages };
}
export async function publish(
  db: Database,
  id: string,
  expected: number,
  tokenHash: string,
  accountId = "legacy",
) {
  await access(db, id, accountId, "owner");
  const result = await db
    .prepare(
      "INSERT INTO publications(document_id,revision,token_hash) SELECT id,current_revision,? FROM documents WHERE id=? AND current_revision=? AND account_id=? ON CONFLICT(document_id) DO UPDATE SET revision=excluded.revision,token_hash=excluded.token_hash",
    )
    .bind(tokenHash, id, expected, accountId)
    .run();
  if (!result.meta.changes) {
    const current = await getDocument(db, id, undefined, accountId);
    throw new HttpError(
      409,
      "Document changed. Refresh and review before publishing.",
      { currentRevision: current.revision },
    );
  }
}
export async function sharedDocument(
  db: Database,
  tokenHash: string,
): Promise<Content & { revision: number }> {
  const row = await db
    .prepare(
      "SELECT r.content,p.revision FROM publications p JOIN revisions r ON r.document_id=p.document_id AND r.revision=p.revision WHERE p.token_hash=?",
    )
    .bind(tokenHash)
    .first<{ content: string; revision: number }>();
  if (!row) throw new HttpError(404, "Share link not found or revoked");
  return { ...JSON.parse(row.content), revision: row.revision };
}
