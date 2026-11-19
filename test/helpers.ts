import { createHmac, pbkdf2Sync } from 'node:crypto';
import { sqliteDatabase } from '../scripts/sqlite.ts';
import { hash, randomToken } from '../src/auth.ts';
import { newSession } from '../src/accounts.ts';
import { handle } from '../src/worker.ts';
import type { Env, MediaBucket } from '../src/platform.ts';

export function memoryMediaBucket(): MediaBucket {
  const files = new Map<string, Uint8Array>();
  return {
    async put(key, bytes) { files.set(key, bytes.slice()); },
    async get(key, options) {
      let bytes = files.get(key); if (!bytes) return null;
      const size = bytes.byteLength;
      if (options?.range) bytes = bytes.subarray(options.range.offset, options.range.offset + options.range.length);
      return { size, body: new Response(bytes.slice()).body! };
    },
    async delete(key) { files.delete(key); },
  };
}

export async function fixture(canPublish = false) {
  const database = sqliteDatabase(':memory:'); database.migrate();
  const ownerKey = randomToken(), agentToken = randomToken();
  const env: Env = { DB: database.db, MEDIA: memoryMediaBucket(), OWNER_KEY_HASH: await hash(ownerKey), SESSION_SECRET: randomToken(), ASSETS: { fetch: async () => new Response('app') } };
  await env.DB.prepare('INSERT INTO agent_credentials(slot,token_hash,created_at,can_publish) VALUES(1,?,?,?)').bind(await hash(agentToken), new Date().toISOString(), Number(canPublish)).run();
  let cookie = '';
  async function call(path: string, method = 'GET', data?: unknown, mode: 'owner' | 'agent' | 'anonymous' = 'owner', extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...(mode === 'owner' ? { Cookie: cookie, Origin: 'http://127.0.0.1:8787' } : mode === 'agent' ? { Authorization: `Bearer ${agentToken}` } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra };
    return handle(new Request(`http://127.0.0.1:8787/api${path}`, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) }), env);
  }
  const response = await call('/login', 'POST', { key: ownerKey }); cookie = response.headers.get('Set-Cookie')!.split(';')[0];
  async function seedUser(email: string, password?: string) {
    const id = crypto.randomUUID();
    let passwordHash = null;
    if (password) {
      // Match the persisted format of accounts created before Google-only signup.
      const salt = randomToken();
      const peppered = createHmac('sha256', env.SESSION_SECRET).update(password).digest();
      passwordHash = salt + ':' + pbkdf2Sync(peppered, salt, 100_000, 32, 'sha256').toString('hex');
    }
    await env.DB.prepare("INSERT INTO accounts(id,kind,email,password_hash,google_sub,created_at) VALUES(?,'user',?,?,?,?)")
      .bind(id, email, passwordHash, password ? null : id, new Date().toISOString()).run();
    const cookie = (await newSession(new Request('http://127.0.0.1:8787'), env, id)).split(';')[0];
    return { id, cookie };
  }
  return { env, ownerKey, agentToken, call, seedUser, close: database.close };
}
export const sample = (title = 'Architecture notes') => ({ title, sections: [{ id: 'intro', html: '<h1>Overview</h1><p>A useful document.</p>', css: 'h1{color:#276c54}' }] });
