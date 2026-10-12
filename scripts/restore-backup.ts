import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const source = process.argv[2];
if (!source || !existsSync(source)) throw new Error('Provide an existing SQLite backup path. Stop the server before restoring.');
if (resolve(source) === resolve('.local/docsync.sqlite')) throw new Error('Source must be a separate backup.');
if (existsSync('.local/docsync.sqlite-wal') || existsSync('.local/docsync.sqlite-shm')) throw new Error('Stop the server and ensure SQLite has closed before restoring; live WAL/SHM files exist.');
const check = new DatabaseSync(source, { readOnly: true });
try {
  const integrity = check.prepare('PRAGMA integrity_check').get() as Record<string, unknown>;
  if (Object.values(integrity)[0] !== 'ok') throw new Error('Backup failed integrity check.');
  check.prepare('SELECT id,current_revision FROM documents LIMIT 1').get();
} finally { check.close(); }
if (existsSync('.local/docsync.sqlite')) copyFileSync('.local/docsync.sqlite', `.local/docsync-before-restore-${Date.now()}.sqlite`);
copyFileSync(source, '.local/docsync.sqlite');
console.log('Backup restored. Previous database preserved; restart DocSync and verify.');
