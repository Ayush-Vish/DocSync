import { backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { sqliteDatabase } from './sqlite.ts';
mkdirSync('.local/backups', { recursive: true, mode: 0o700 });
if (!existsSync('.local/docsync.sqlite')) throw new Error('Local database not found. Run setup first.');
const db = sqliteDatabase('.local/docsync.sqlite');
const path = `.local/backups/docsync-${new Date().toISOString().replaceAll(':', '-')}.sqlite`;
try { await backup(db.sqlite, path); console.log(`Backup written: ${path}`); }
finally { db.close(); }
