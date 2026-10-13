CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('legacy','user','trial')),
  email TEXT UNIQUE,
  password_hash TEXT,
  google_sub TEXT UNIQUE,
  created_at TEXT NOT NULL
);
INSERT INTO accounts(id,kind,created_at) VALUES('legacy','legacy',datetime('now'));
-- SQLite cannot add a REFERENCES column with a non-null default to a populated table.
ALTER TABLE documents ADD COLUMN account_id TEXT REFERENCES accounts(id);
UPDATE documents SET account_id='legacy';
CREATE TRIGGER document_account_required_insert BEFORE INSERT ON documents
WHEN NEW.account_id IS NULL
BEGIN SELECT RAISE(ABORT,'document account required'); END;
CREATE TRIGGER document_account_required_update BEFORE UPDATE OF account_id ON documents
WHEN NEW.account_id IS NULL
BEGIN SELECT RAISE(ABORT,'document account required'); END;
CREATE INDEX documents_account ON documents(account_id,updated_at);
CREATE TRIGGER trial_document_limit BEFORE INSERT ON documents
WHEN (SELECT kind FROM accounts WHERE id=NEW.account_id)='trial'
AND EXISTS(SELECT 1 FROM documents WHERE account_id=NEW.account_id)
BEGIN SELECT RAISE(ABORT,'trial_document_limit'); END;
CREATE TABLE account_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE account_credentials (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  token_hash TEXT NOT NULL UNIQUE,
  can_publish INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE installation_claims (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  expires_at INTEGER NOT NULL
);
