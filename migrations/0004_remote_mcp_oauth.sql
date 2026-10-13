CREATE TABLE oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE oauth_access_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  can_publish INTEGER NOT NULL CHECK(can_publish IN (0,1)),
  expires_at INTEGER NOT NULL
);
CREATE TABLE oauth_refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  can_publish INTEGER NOT NULL CHECK(can_publish IN (0,1)),
  expires_at INTEGER NOT NULL
);
