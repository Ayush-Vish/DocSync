CREATE TABLE agent_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_version TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('api','mcp','client')),
  document_id TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('pending','success','error')),
  status INTEGER,
  duration_ms INTEGER,
  error TEXT NOT NULL DEFAULT '',
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  ip TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  details TEXT NOT NULL
);
CREATE INDEX agent_audit_account_page ON agent_audit_events(account_id,id DESC);
CREATE INDEX agent_audit_retention ON agent_audit_events(account_id,created_at);
