-- Existing credentials remain draft-only. Owners explicitly grant publishing when rotating a token.
ALTER TABLE agent_credentials ADD COLUMN can_publish INTEGER NOT NULL DEFAULT 0 CHECK(can_publish IN (0,1));
