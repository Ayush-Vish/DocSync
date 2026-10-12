// Transport fixture: real stdio, real Worker + SQLite, no TCP listener required.
import { sqliteDatabase } from '../scripts/sqlite.ts';
import { handle } from '../src/worker.ts';
import { hash, randomToken } from '../src/auth.ts';
const database = sqliteDatabase(':memory:'); database.migrate();
await database.db.prepare('INSERT INTO agent_credentials(slot,token_hash,created_at,can_publish) VALUES(1,?,?,1)').bind(await hash(process.env.DOCSYNC_AGENT_TOKEN!), new Date().toISOString()).run();
const env = { DB: database.db, OWNER_KEY_HASH: await hash(randomToken()), SESSION_SECRET: randomToken(), ASSETS: { fetch: async () => new Response('app') } };
globalThis.fetch = async (input, init) => handle(new Request(input, init), env);
await import(new URL(process.env.DOCSYNC_TEST_BUNDLE === '1' ? '../dist/docsync-mcp.cjs' : '../dist/mcp.mjs', import.meta.url).href);
