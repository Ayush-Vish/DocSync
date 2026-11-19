CREATE TABLE company_templates (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK(format IN ('document', 'presentation')),
  id TEXT UNIQUE,
  name TEXT,
  recipe TEXT,
  PRIMARY KEY (account_id, format),
  -- A row without a template records an explicit decision to skip setup.
  CHECK((id IS NULL AND name IS NULL AND recipe IS NULL) OR
        (id IS NOT NULL AND name IS NOT NULL AND recipe IS NOT NULL))
);
