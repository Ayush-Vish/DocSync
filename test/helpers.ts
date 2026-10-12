import { sqliteDatabase } from '../scripts/sqlite.ts';
import { hash, randomToken } from '../src/auth.ts';
import { handle } from '../src/worker.ts';
import type { Env } from '../src/platform.ts';

export async function fixture(canPublish = false) {
  const database = sqliteDatabase(':memory:'); database.migrate();
  const ownerKey = randomToken(), agentToken = randomToken();
  const env: Env = { DB: database.db, OWNER_KEY_HASH: await hash(ownerKey), SESSION_SECRET: randomToken(), ASSETS: { fetch: async () => new Response('app') } };
  await env.DB.prepare('INSERT INTO agent_credentials(slot,token_hash,created_at,can_publish) VALUES(1,?,?,?)').bind(await hash(agentToken), new Date().toISOString(), Number(canPublish)).run();
  let cookie = '';
  async function call(path: string, method = 'GET', data?: unknown, mode: 'owner' | 'agent' | 'anonymous' = 'owner', extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...(mode === 'owner' ? { Cookie: cookie, Origin: 'http://127.0.0.1:8787' } : mode === 'agent' ? { Authorization: `Bearer ${agentToken}` } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra };
    return handle(new Request(`http://127.0.0.1:8787/api${path}`, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) }), env);
  }
  const response = await call('/login', 'POST', { key: ownerKey }); cookie = response.headers.get('Set-Cookie')!.split(';')[0];
  return { env, ownerKey, agentToken, call, close: database.close };
}
export const sample = (title = 'Architecture notes') => ({ title, sections: [{ id: 'intro', html: '<h1>Overview</h1><p>A useful document.</p>', css: 'h1{color:#276c54}' }] });
