CREATE TABLE document_members (
  document_id TEXT NOT NULL REFERENCES documents(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  role TEXT NOT NULL CHECK(role IN ('editor','viewer')),
  PRIMARY KEY(document_id, account_id)
);
CREATE INDEX document_members_account ON document_members(account_id, document_id);
CREATE TABLE document_invitations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('editor','viewer')),
  expires_at INTEGER NOT NULL,
  accepted_by TEXT REFERENCES accounts(id),
  acceptance_id TEXT
);
CREATE INDEX document_invitations_document ON document_invitations(document_id);
CREATE TABLE edit_locks (
  document_id TEXT PRIMARY KEY REFERENCES documents(id),
  lease_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  actor_id TEXT NOT NULL,
  actor_label TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
ALTER TABLE revisions ADD COLUMN author_account_id TEXT REFERENCES accounts(id);
ALTER TABLE revisions ADD COLUMN actor_id TEXT;
ALTER TABLE revisions ADD COLUMN actor_label TEXT;
ALTER TABLE revisions ADD COLUMN parent_revision INTEGER;
ALTER TABLE revisions ADD COLUMN summary TEXT NOT NULL DEFAULT '';
ALTER TABLE revisions ADD COLUMN restored_from INTEGER;
