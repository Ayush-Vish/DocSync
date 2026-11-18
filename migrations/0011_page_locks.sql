CREATE TABLE page_locks (
  document_id TEXT NOT NULL REFERENCES documents(id),
  page_id TEXT NOT NULL,
  holder_account_id TEXT NOT NULL REFERENCES accounts(id),
  holder_actor_id TEXT NOT NULL,
  holder_label TEXT NOT NULL,
  PRIMARY KEY(document_id, page_id)
);
CREATE INDEX page_locks_holder ON page_locks(holder_account_id, holder_actor_id);

CREATE TABLE page_unlock_requests (
  document_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  requester_account_id TEXT NOT NULL REFERENCES accounts(id),
  requester_actor_id TEXT NOT NULL,
  requester_label TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT(unixepoch()),
  PRIMARY KEY(document_id, page_id, requester_account_id, requester_actor_id),
  FOREIGN KEY(document_id, page_id) REFERENCES page_locks(document_id, page_id) ON DELETE CASCADE
);

CREATE TRIGGER protect_locked_pages BEFORE INSERT ON revisions
WHEN EXISTS (
  SELECT 1 FROM page_locks l
  JOIN documents d ON d.id=l.document_id
  JOIN revisions previous ON previous.document_id=d.id AND previous.revision=d.current_revision
  JOIN json_each(previous.content, '$.sections') old ON json_extract(old.value, '$.id')=l.page_id
  LEFT JOIN json_each(NEW.content, '$.sections') next ON json_extract(next.value, '$.id')=l.page_id
  WHERE l.document_id=NEW.document_id AND (
    next.key IS NULL OR (
      (NEW.author_account_id IS NOT l.holder_account_id OR NEW.actor_id IS NOT l.holder_actor_id)
      AND (json_extract(old.value, '$.kind') IS NOT json_extract(next.value, '$.kind')
        OR json_extract(old.value, '$.html') IS NOT json_extract(next.value, '$.html')
        OR json_extract(old.value, '$.css') IS NOT json_extract(next.value, '$.css')
        OR json_extract(old.value, '$.js') IS NOT json_extract(next.value, '$.js'))
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'DOCSYNC_PAGE_LOCKED');
END;
