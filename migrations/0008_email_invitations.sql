-- NULL preserves the existing private, single-use link invitation behavior.
ALTER TABLE document_invitations ADD COLUMN recipient_email TEXT;
