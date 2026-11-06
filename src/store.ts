import type { Database } from "./platform.ts";
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
};
const document = (row: Row): Document => ({
  ...JSON.parse(row.content),
  id: row.id,
  revision: row.revision,
  updated_at: row.updated_at,
});
export async function getDocument(
  db: Database,
  id: string,
  revision?: number,
  accountId = "legacy",
): Promise<Document> {
  const row = await db
    .prepare(
      `SELECT d.id, r.revision, r.content, r.created_at AS updated_at FROM documents d JOIN revisions r ON r.document_id = d.id AND r.revision = ${revision === undefined ? "d.current_revision" : "?"} WHERE d.id = ? AND d.account_id = ?`,
    )
    .bind(
      ...(revision === undefined ? [id, accountId] : [revision, id, accountId]),
    )
    .first<Row>();
  if (!row) throw new HttpError(404, "Document or revision not found");
  return document(row);
}
export async function documentThumbnail(db: Database, id: string, accountId: string) {
  const row = await db.prepare(
    "SELECT d.current_revision AS revision, json_remove(json_extract(r.content, '$.sections[0]'), '$.js') AS section FROM documents d JOIN revisions r ON r.document_id=d.id AND r.revision=d.current_revision WHERE d.id=? AND d.account_id=?",
  ).bind(id, accountId).first<{ revision: number; section: string }>();
  if (!row?.section) throw new HttpError(404, "Document not found");
  return { revision: row.revision, section: JSON.parse(row.section) as Content["sections"][number] };
}

export async function createDocument(
  db: Database,
  input: unknown,
  accountId = "legacy",
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
        "INSERT INTO revisions(document_id,revision,content,created_at) VALUES(?,1,?,?)",
      )
      .bind(id, JSON.stringify(content), time),
  ]);
  return { ...content, id, revision: 1, updated_at: time, ...(warnings.length ? { warnings } : {}) };
}
export async function updateDocument(
  db: Database,
  id: string,
  expected: number,
  input: unknown,
  accountId = "legacy",
): Promise<Document> {
  const content = validateContent(input),
    warnings = lintContent(content),
    time = new Date().toISOString();
  const result = await db
    .prepare(
      "INSERT INTO revisions(document_id,revision,content,created_at) SELECT id, current_revision+1, ?, ? FROM documents WHERE id=? AND current_revision=? AND account_id=?",
    )
    .bind(JSON.stringify(content), time, id, expected, accountId)
    .run();
  if (result.meta.changes === 0) {
    const current = await getDocument(db, id, undefined, accountId);
    throw new HttpError(
      409,
      "Document changed. Read the current revision before retrying; your draft has not been overwritten.",
      { currentRevision: current.revision },
    );
  }
  return { ...content, id, revision: expected + 1, updated_at: time, ...(warnings.length ? { warnings } : {}) };
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
        WHERE d.account_id=? ORDER BY d.updated_at DESC LIMIT 200`,
      )
      .bind(accountId)
      .all()
  ).results;
}
export async function history(db: Database, id: string, accountId = "legacy") {
  await getDocument(db, id, undefined, accountId);
  return (
    await db
      .prepare(
        "SELECT revision,created_at FROM revisions WHERE document_id=? ORDER BY revision DESC LIMIT 100",
      )
      .bind(id)
      .all()
  ).results;
}
export async function publish(
  db: Database,
  id: string,
  expected: number,
  tokenHash: string,
  accountId = "legacy",
) {
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
