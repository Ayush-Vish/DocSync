CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  uploaded_by TEXT NOT NULL REFERENCES accounts(id),
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size>0),
  digest TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending','ready')),
  created_at TEXT NOT NULL,
  UNIQUE(document_id,digest)
);
CREATE INDEX media_assets_document ON media_assets(document_id);
CREATE TABLE agent_connections (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  actor_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY(account_id,actor_id,client_name)
);
