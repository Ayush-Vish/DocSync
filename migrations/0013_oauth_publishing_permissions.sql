-- An owner can override publishing for every token of an authorized MCP client.
-- Tokens issued before this migration retain their permissions until the owner changes the setting.
CREATE TABLE oauth_publishing_permissions (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  can_publish INTEGER NOT NULL CHECK(can_publish IN (0,1)),
  PRIMARY KEY (account_id, client_id)
);
