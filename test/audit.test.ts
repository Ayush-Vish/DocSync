import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, sample } from "./helpers.ts";
import { hash, randomToken } from "../src/auth.ts";
import { handle } from "../src/worker.ts";
import worker from "../src/worker.ts";
import type { AuditPage } from "../src/audit.ts";
import type { Statement } from "../src/platform.ts";

test("agent operations record server results and reported device metadata without secrets or content", async t => {
  const f = await fixture(); t.after(f.close);
  const doc = await (await f.call('/documents', 'POST', sample())).json() as { id: string };
  const metadata = { 'X-DocSync-Client': 'Codex%20CLI', 'X-DocSync-Client-Version': '1.2.3', 'X-DocSync-Device': 'Development%20Laptop', 'X-DocSync-Platform': 'linux%20x64', 'CF-Connecting-IP': '203.0.113.9', 'User-Agent': 'Agent test/1.2.3' };
  const read = await f.call(`/documents/${doc.id}`, 'GET', undefined, 'agent', metadata);
  assert.equal(read.status, 200); assert.ok(read.headers.get('X-DocSync-Request-Id'));
  const write = await f.call(`/documents/${doc.id}`, 'PUT', { ...sample('Attempted update'), expectedRevision: 1, lockToken: 'a'.repeat(64), password: 'never-store-this', sections: [{ id: 'first', html: '<h1>PRIVATE CONTENT</h1>', css: '', js: 'SECRET_SOURCE' }] }, 'agent', metadata);
  assert.equal(write.status, 400);
  const audit = await (await f.call('/audit-log')).json() as AuditPage;
  assert.equal(audit.items.length, 2);
  const event = audit.items.find(event => event.tool === 'get_document')!;
  assert.equal(event.deviceName, 'Development Laptop'); assert.equal(event.platform, 'linux x64'); assert.equal(event.clientVersion, '1.2.3');
  assert.equal(event.clientName, 'Codex CLI'); assert.equal(event.ip, '203.0.113.9'); assert.equal(event.userAgent, metadata['User-Agent']);
  assert.equal(event.source, 'api'); assert.equal(event.outcome, 'success'); assert.equal(event.documentId, doc.id);
  assert.equal(event.requestId, read.headers.get('X-DocSync-Request-Id')); assert.ok(event.durationMs! >= 0);
  assert.equal(audit.items[0].outcome, 'error'); assert.equal(audit.items[0].status, 400); assert.equal(audit.items[0].details.pageCount, 1);
  for (const secret of [f.agentToken, 'a'.repeat(64), 'never-store-this', 'PRIVATE CONTENT', 'SECRET_SOURCE', 'credential:']) assert.ok(!JSON.stringify(audit).includes(secret));
  assert.equal((await f.call('/audit-log', 'GET', undefined, 'anonymous')).status, 401);
  assert.equal((await f.call('/audit-log', 'GET', undefined, 'agent')).status, 403);
  assert.equal((await f.call('/audit-log', 'DELETE', {}, 'agent')).status, 404);
});

test("audit history is account-scoped, searchable, paginated and retained for 90 days", async t => {
  const f = await fixture(); t.after(f.close);
  await f.call('/connection', 'GET', undefined, 'agent', { 'X-DocSync-Client': 'Old Agent' });
  await f.env.DB.prepare("UPDATE agent_audit_events SET created_at='2000-01-01T00:00:00.000Z'").run();
  for (let i = 0; i < 53; i++) await f.call('/connection', 'GET', undefined, 'agent', { 'X-DocSync-Client': i % 2 ? 'Claude%20Code' : 'Codex', 'X-DocSync-Device': 'Laptop' });
  const first = await (await f.call('/audit-log')).json() as AuditPage;
  assert.equal(first.retentionDays, 90); assert.equal(first.items.length, 50); assert.ok(first.nextCursor);
  const second = await (await f.call(`/audit-log?before=${first.nextCursor}`)).json() as AuditPage;
  assert.equal(second.items.length, 3); assert.equal(second.nextCursor, null);
  assert.ok(!second.items.some(item => item.clientName === 'Old Agent'));
  assert.ok(first.items.every(item => !second.items.some(other => other.id === item.id)));
  const filtered = await (await f.call('/audit-log?q=Claude&outcome=success')).json() as AuditPage;
  assert.equal(filtered.items.length, 26);
  for (const params of ['before=nope', 'outcome=unknown', 'q=' + 'x'.repeat(101)]) assert.equal((await f.call('/audit-log?' + params)).status, 400);
  const signup = await f.call('/auth/signup', 'POST', { email: 'other-audit@example.com', password: 'a long secure password 123!' }, 'anonymous', { Origin: 'http://127.0.0.1:8787' });
  const cookie = signup.headers.getSetCookie()[0].split(';')[0];
  const other = await f.call('/audit-log?accountId=legacy', 'GET', undefined, 'anonymous', { Cookie: cookie });
  assert.equal(other.status, 200); assert.deepEqual((await other.json() as AuditPage).items, []);
});

test("hosted MCP logs the real tool call and SDK validation failures exactly once", async t => {
  const f = await fixture(); t.after(f.close);
  const token = randomToken();
  await f.env.DB.prepare("INSERT INTO oauth_clients VALUES('audit-client','Claude Code','[]',unixepoch())").run();
  await f.env.DB.prepare("INSERT INTO oauth_access_tokens VALUES(?,'legacy','audit-client',0,unixepoch()+3600)").bind(await hash(token)).run();
  const call = async (name: string, args: unknown) => handle(new Request('http://127.0.0.1:8787/mcp', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'CF-Connecting-IP': '198.51.100.5', 'User-Agent': 'Claude remote test' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), f.env);
  assert.equal((await call('get_connection', {})).status, 200);
  await call('update_document', { id: 'not-a-uuid' });
  const data = await (await f.call('/audit-log')).json() as AuditPage;
  assert.equal(data.items.length, 2, 'Internal MCP-to-API calls must not produce duplicate audit entries');
  assert.ok(data.items.every(item => item.source === 'mcp' && item.clientName === 'Claude Code' && item.ip === '198.51.100.5'));
  assert.equal(data.items.find(item => item.tool === 'get_connection')?.outcome, 'success');
  assert.equal(data.items.find(item => item.tool === 'update_document')?.outcome, 'error');
});

test("audit reservation fails closed before a write; completion failures preserve an unconfirmed record", async t => {
  const f = await fixture(); t.after(f.close);
  const original = f.env.DB.prepare.bind(f.env.DB);
  let failCompletion = true;
  f.env.DB.prepare = sql => {
    const statement = original(sql);
    if (!sql.startsWith('UPDATE agent_audit_events SET outcome=') || !failCompletion) return statement;
    const wrap = (value: Statement): Statement => ({ ...value, bind: (...args) => wrap(value.bind(...args)), run: async () => { throw new Error('database temporarily unavailable'); } });
    return wrap(statement);
  };
  const result = await f.call('/documents', 'POST', sample(), 'agent');
  assert.equal(result.status, 201); assert.equal(result.headers.get('X-DocSync-Audit'), 'pending');
  let data = await (await f.call('/audit-log')).json() as AuditPage;
  assert.equal(data.items[0].outcome, 'pending');
  failCompletion = false;
  await f.env.DB.prepare('DROP TABLE agent_audit_events').run();
  const blocked = await f.call('/documents', 'POST', sample('Must not execute'), 'agent');
  assert.equal(blocked.status, 503);
  assert.equal((await f.env.DB.prepare('SELECT COUNT(*) n FROM documents').first<{ n: number }>())!.n, 1);
});

test("the native Worker execution context cannot suppress agent auditing", async t => {
  const f = await fixture(); t.after(f.close);
  const response = await Reflect.apply(worker.fetch, worker, [new Request('http://127.0.0.1:8787/api/connection', { headers: { Authorization: `Bearer ${f.agentToken}` } }), f.env, { waitUntil() {} }]);
  assert.equal(response.status, 200);
  assert.equal((await (await f.call('/audit-log')).json() as AuditPage).items.length, 1);
});
