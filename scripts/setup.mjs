import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { sqliteDatabase } from './sqlite.ts';

mkdirSync('.local', { recursive: true, mode: 0o700 });
if (existsSync('.local/config.json')) {
  console.log('Local credentials already exist; nothing changed. Owner key: .local/owner-key');
  process.exit(0);
}
const key = randomBytes(32).toString('hex'), token = randomBytes(32).toString('hex');
const hash = value => createHash('sha256').update(value).digest('hex');
const database = sqliteDatabase('.local/docsync.sqlite'); database.migrate();
await database.db.prepare('INSERT INTO agent_credentials(slot,token_hash,created_at,can_publish) VALUES(1,?,?,1) ON CONFLICT(slot) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,can_publish=1').bind(hash(token), new Date().toISOString()).run();
database.close();
writeFileSync('.local/owner-key', key + '\n', { mode: 0o600 });
writeFileSync('.local/config.json', JSON.stringify({ OWNER_KEY_HASH: hash(key), SESSION_SECRET: randomBytes(32).toString('hex') }, null, 2), { mode: 0o600 });
writeFileSync('.local/mcp.env', `DOCSYNC_URL=http://127.0.0.1:8787\nDOCSYNC_AGENT_TOKEN=${token}\n`, { mode: 0o600 });
console.log('Local workspace ready. Owner key: .local/owner-key. Agent environment: .local/mcp.env. This new agent token can publish local read-only links. Keep both private.');
