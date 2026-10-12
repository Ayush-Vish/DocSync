PRAGMA foreign_keys = ON;
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  current_revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE revisions (
  document_id TEXT NOT NULL REFERENCES documents(id),
  revision INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (document_id, revision)
);
CREATE TRIGGER revision_sequence BEFORE INSERT ON revisions BEGIN
  SELECT CASE WHEN NEW.revision != (SELECT current_revision + 1 FROM documents WHERE id = NEW.document_id)
    THEN RAISE(ABORT, 'revision conflict') END;
END;
CREATE TRIGGER revision_head AFTER INSERT ON revisions BEGIN
  UPDATE documents SET current_revision = NEW.revision,
    title = json_extract(NEW.content, '$.title'), updated_at = NEW.created_at
    WHERE id = NEW.document_id;
END;
CREATE TABLE publications (
  document_id TEXT PRIMARY KEY REFERENCES documents(id),
  revision INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  FOREIGN KEY (document_id, revision) REFERENCES revisions(document_id, revision)
);
CREATE TABLE agent_credentials (
  slot INTEGER PRIMARY KEY CHECK(slot = 1),
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE login_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
