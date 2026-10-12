import type { Env } from './platform.ts';
import { HttpError } from './content.ts';
import { authenticate, checkOrigin, hash, login, logoutCookie, randomToken } from './auth.ts';
import * as store from './store.ts';

export const appPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self' about:; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...extra } });
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415, 'JSON body required');
  if (Number(request.headers.get('Content-Length')) > 550_000) throw new HttpError(413, 'Request exceeds 550 KB');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Missing request body');
  let length = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 550_000) { await reader.cancel(); throw new HttpError(413, 'Request exceeds 550 KB'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch { throw new HttpError(400, 'Invalid JSON object'); }
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new HttpError(400, 'A positive expectedRevision is required');
  return Number(value);
}
async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url), method = request.method;
  if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (!/^[a-f0-9]{64}$/.test(env.OWNER_KEY_HASH || '') || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new HttpError(503, 'Server credentials are not configured');
  if (pathname === '/api/login' && method === 'POST') {
    const input = await body(request);
    return json({ ok: true }, 200, { 'Set-Cookie': await login(request, env, input.key) });
  }
  if (pathname.startsWith('/api/shared/') && method === 'GET') {
    const token = pathname.slice('/api/shared/'.length);
    if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(404, 'Share link not found or revoked');
    return json(await store.sharedDocument(env.DB, await hash(token)));
  }
  const principal = await authenticate(request, env);
  const owner = () => { if (principal.role !== 'owner') throw new HttpError(403, 'Owner access required'); };
  const linkAccess = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname) ? 'local_only' : 'anyone_with_link';
  if (pathname === '/api/connection' && method === 'GET') return json({ role: principal.role, canPublish: principal.canPublish, origin: new URL(request.url).origin, linkAccess });
  if (pathname === '/api/session' && method === 'GET') { owner(); return json({ authenticated: true }); }
  if (pathname === '/api/logout' && method === 'POST') { owner(); checkOrigin(request); return json({ ok: true }, 200, { 'Set-Cookie': logoutCookie(request) }); }
  if (pathname === '/api/agent-token') {
    owner();
    if (method === 'GET') {
      const credential = await env.DB.prepare('SELECT can_publish FROM agent_credentials WHERE slot=1').first<{ can_publish: number }>();
      return json({ active: Boolean(credential), allowPublishing: credential?.can_publish === 1 });
    }
    if (method === 'POST') {
      const input = request.body ? await body(request) : {};
      if (input.allowPublishing !== undefined && typeof input.allowPublishing !== 'boolean') throw new HttpError(400, 'allowPublishing must be a boolean');
      const canPublish = input.allowPublishing === true;
      const token = randomToken();
      await env.DB.prepare('INSERT INTO agent_credentials(slot,token_hash,created_at,can_publish) VALUES(1,?,?,?) ON CONFLICT(slot) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,can_publish=excluded.can_publish').bind(await hash(token), new Date().toISOString(), Number(canPublish)).run();
      return json({ token, allowPublishing: canPublish });
    }
    if (method === 'DELETE') { await env.DB.prepare('DELETE FROM agent_credentials WHERE slot=1').run(); return json({ ok: true }); }
  }
  if (pathname === '/api/documents') {
    if (method === 'GET') return json(await store.listDocuments(env.DB));
    if (method === 'POST') return json(await store.createDocument(env.DB, await body(request)), 201);
  }
  const match = pathname.match(/^\/api\/documents\/([a-f0-9-]{36})(?:\/(history|restore|publish))?$/);
  if (match) {
    const [, id, action] = match;
    if (!action && method === 'GET') return json(await store.getDocument(env.DB, id));
    if (!action && method === 'PUT') {
      const { expectedRevision, ...content } = await body(request);
      return json(await store.updateDocument(env.DB, id, revision(expectedRevision), content));
    }
    if (action === 'history' && method === 'GET') { owner(); return json(await store.history(env.DB, id)); }
    if (action === 'restore' && method === 'POST') {
      owner(); const input = await body(request);
      const snapshot = await store.getDocument(env.DB, id, revision(input.revision));
      return json(await store.updateDocument(env.DB, id, revision(input.expectedRevision), { title: snapshot.title, sections: snapshot.sections }));
    }
    if (action === 'publish') {
      if (method === 'GET') { owner(); return json(await env.DB.prepare('SELECT revision FROM publications WHERE document_id=?').bind(id).first()); }
      if (method === 'POST') {
        if (!principal.canPublish) throw new HttpError(403, 'Publishing is disabled for this agent token. In DocSync, use Connect agent to generate a token with Allow publishing enabled.');
        const input = await body(request), token = randomToken();
        await store.publish(env.DB, id, revision(input.expectedRevision), await hash(token));
        return json({ url: `${new URL(request.url).origin}/share/${token}`, revision: input.expectedRevision, linkAccess });
      }
      if (method === 'DELETE') { owner(); await env.DB.prepare('DELETE FROM publications WHERE document_id=?').bind(id).run(); return json({ ok: true }); }
    }
  }
  throw new HttpError(404, 'Route not found');
}
export async function handle(request: Request, env: Env): Promise<Response> {
  let response: Response;
  try { response = await route(request, env); }
  catch (error) {
    if (error instanceof HttpError) response = json({ error: error.message, details: error.details }, error.status);
    else { console.error('DocSync request failed:', error instanceof Error ? error.name : 'Unknown error'); response = json({ error: 'Unexpected server error. Retry or check server logs.' }, 500); }
  }
  const secured = new Response(response.body, response);
  secured.headers.set('Cache-Control', 'no-store');
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  secured.headers.set('Referrer-Policy', 'no-referrer');
  secured.headers.set('Content-Security-Policy', appPolicy);
  secured.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return secured;
}
export default { fetch: handle };
