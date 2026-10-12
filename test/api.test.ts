import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, sample } from './helpers.ts';
import { cleanCss, cleanHtml, frameSource, validateContent } from '../src/content.ts';
import { hash } from '../src/auth.ts';

test('private API requires authentication; draft-only agents cannot publish, restore, or manage credentials', async t => {
  const f = await fixture(); t.after(f.close);
  assert.equal((await f.call('/documents', 'GET', undefined, 'anonymous')).status, 401);
  const created = await (await f.call('/documents', 'POST', sample(), 'agent')).json() as any;
  assert.equal((await f.call(`/documents/${created.id}`, 'GET', undefined, 'agent')).status, 200);
  for (const [path, method] of [[`/documents/${created.id}/publish`, 'POST'], [`/documents/${created.id}/restore`, 'POST'], ['/agent-token', 'POST']] as const)
    assert.equal((await f.call(path, method, { expectedRevision: 1, revision: 1 }, 'agent')).status, 403);
  assert.equal((await f.call('/documents', 'POST', sample(), 'owner', { Origin: 'https://attacker.test' })).status, 403);
  assert.equal((await f.call('/documents', 'POST', sample(), 'owner', { Cookie: 'docsync_session=0.' + 'a'.repeat(64) + '.' + 'a'.repeat(64) })).status, 401);
});

test('concurrent stale writes have one winner, preserve immutable history, and restore adds a revision', async t => {
  const f = await fixture(); t.after(f.close);
  const created = await (await f.call('/documents', 'POST', sample())).json() as any;
  const results = await Promise.all(['Winner A', 'Winner B'].map(title => f.call(`/documents/${created.id}`, 'PUT', { ...sample(title), expectedRevision: 1 })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const current = await (await f.call(`/documents/${created.id}`)).json() as any;
  assert.equal(current.revision, 2);
  const history = await (await f.call(`/documents/${created.id}/history`)).json() as any[];
  assert.deepEqual(history.map(r => r.revision), [2, 1]);
  const restored = await (await f.call(`/documents/${created.id}/restore`, 'POST', { revision: 1, expectedRevision: 2 })).json() as any;
  assert.equal(restored.revision, 3); assert.equal(restored.title, sample().title);
  const stored = await f.env.DB.prepare('SELECT content FROM revisions WHERE document_id=? AND revision=2').bind(created.id).first<{ content: string }>();
  assert.equal(JSON.parse(stored!.content).title, current.title);
});

test('publication is a reviewed snapshot; republish rotates URL; revocation and no-store protect reads', async t => {
  const f = await fixture(); t.after(f.close);
  const doc = await (await f.call('/documents', 'POST', sample())).json() as any;
  const published = await (await f.call(`/documents/${doc.id}/publish`, 'POST', { expectedRevision: 1 })).json() as any;
  const shared = '/shared/' + published.url.split('/').at(-1);
  await f.call(`/documents/${doc.id}`, 'PUT', { ...sample('Private draft'), expectedRevision: 1 });
  const response = await f.call(shared, 'GET', undefined, 'anonymous');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json() as any).title, sample().title);
  assert.equal((await f.call(`/documents/${doc.id}/publish`, 'POST', { expectedRevision: 1 })).status, 409);
  const next = await (await f.call(`/documents/${doc.id}/publish`, 'POST', { expectedRevision: 2 })).json() as any;
  assert.notEqual(next.url, published.url);
  assert.equal((await f.call(shared, 'GET', undefined, 'anonymous')).status, 404);
  const nextShared = '/shared/' + next.url.split('/').at(-1);
  assert.equal((await (await f.call(nextShared, 'GET', undefined, 'anonymous')).json() as any).title, 'Private draft');
  await f.call(`/documents/${doc.id}/publish`, 'DELETE');
  assert.equal((await f.call(nextShared, 'GET', undefined, 'anonymous')).status, 404);
});

test('agent tokens are hashed, rotate, and revoke', async t => {
  const f = await fixture(); t.after(f.close);
  const rotated = await (await f.call('/agent-token', 'POST')).json() as any;
  const stored = await f.env.DB.prepare('SELECT token_hash FROM agent_credentials').first<{ token_hash: string }>();
  assert.equal(stored!.token_hash, await hash(rotated.token)); assert.notEqual(stored!.token_hash, rotated.token);
  assert.equal((await f.call('/documents', 'GET', undefined, 'agent')).status, 401);
  assert.equal((await f.call('/documents', 'GET', undefined, 'anonymous', { Authorization: `Bearer ${rotated.token}` })).status, 200);
  await f.call('/agent-token', 'DELETE');
  assert.equal((await f.call('/documents', 'GET', undefined, 'anonymous', { Authorization: `Bearer ${rotated.token}` })).status, 401);
});

test('HTML parsing removes executable elements, navigation, event handlers, SVG, and embeds', () => {
  const html = cleanHtml('<p onclick="steal()">Keep me</p><script>steal()</script><img src="https://evil.test"><svg onload="steal()"></svg><form><input></form><iframe src="https://evil.test"></iframe><a href="javascript:steal()">link</a><style>body{color:red}</style>');
  assert.equal(html, '<p>Keep me</p>');
  const malformed = cleanHtml('<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=steal()>">');
  assert.ok(!/onerror|<img|<style|<math/.test(malformed));
  const frame = frameSource(sample().sections[0]);
  assert.ok(frame.includes("script-src 'none'")); assert.ok(frame.includes("connect-src 'none'"));
});

test('CSS parsing blocks remote resources, malformed CSS, and style-element escapes', () => {
  for (const css of ['@import "https://evil.test/a.css";', 'p{background:url(https://evil.test)}', '@font-face{src:url(x)}', 'p{background:image-set("https://evil.test" 1x)}', 'p{color:???}']) assert.throws(() => cleanCss(css));
  assert.throws(() => cleanHtml('<p style="background:url(https://evil.test)">x</p>'));
  assert.ok(!cleanCss('p::before{content:"</style><script>alert(1)</script>"}').includes('</style>'));
  assert.ok(cleanCss('@media(max-width:600px){p{color:blue}}').includes('@media'));
  assert.ok(cleanCss(':root{--accent:#276c54}h1{color:var(--accent)}').includes('--accent'));
  assert.throws(() => cleanCss(':root{--image:url(https://evil.test)}'));
  assert.throws(() => cleanHtml('<div>'.repeat(100) + 'nested' + '</div>'.repeat(100)));
});

test('invalid documents and oversized requests leave storage unchanged; login is rate-limited', async t => {
  const f = await fixture(); t.after(f.close);
  assert.equal((await f.call('/documents', 'POST', { ...sample(), sections: [...sample().sections, ...sample().sections] })).status, 400);
  assert.equal((await f.call('/documents', 'POST', { ...sample(), extra: true })).status, 400);
  assert.equal((await f.call('/documents', 'POST', { title: 'x', sections: [{ id: 'x', html: 'x'.repeat(560_000), css: '' }] })).status, 413);
  assert.deepEqual(await (await f.call('/documents')).json(), []);
  assert.throws(() => validateContent({ ...sample(), sections: [{ id: 'x', html: '', css: 'x'.repeat(30_001) }] }));
  for (let i = 0; i < 10; i++) assert.equal((await f.call('/login', 'POST', { key: 'wrong' })).status, 401);
  assert.equal((await f.call('/login', 'POST', { key: f.ownerKey })).status, 429);
});

test('missing production secrets fail closed', async t => {
  const f = await fixture(); t.after(f.close);
  f.env.SESSION_SECRET = '';
  assert.equal((await f.call('/documents', 'GET', undefined, 'agent')).status, 503);
});

test('publishing-enabled agents return a readable snapshot link without owner interaction', async t => {
  const f = await fixture(true); t.after(f.close);
  const connection = await (await f.call('/connection', 'GET', undefined, 'agent')).json() as any;
  assert.equal(connection.canPublish, true); assert.equal(connection.linkAccess, 'local_only');
  const doc = await (await f.call('/documents', 'POST', sample('FY27 report'), 'agent')).json() as any;
  const publish = await f.call(`/documents/${doc.id}/publish`, 'POST', { expectedRevision: 1 }, 'agent');
  assert.equal(publish.status, 200);
  const result = await publish.json() as any; assert.equal(result.linkAccess, 'local_only');
  const shared = await f.call('/shared/' + result.url.split('/').at(-1), 'GET', undefined, 'anonymous');
  assert.equal((await shared.json() as any).title, 'FY27 report');
  assert.equal((await f.call(`/documents/${doc.id}/publish`, 'DELETE', undefined, 'agent')).status, 403);
  assert.equal((await f.call('/agent-token', 'POST', { allowPublishing: true }, 'agent')).status, 403);
});

test('owners control publishing grants and rotated draft-only tokens cannot publish', async t => {
  const f = await fixture(); t.after(f.close);
  const invalid = await f.call('/agent-token', 'POST', { allowPublishing: 'yes' }); assert.equal(invalid.status, 400);
  assert.equal((await (await f.call('/connection', 'GET', undefined, 'agent')).json() as any).canPublish, false);
  const granted = await (await f.call('/agent-token', 'POST', { allowPublishing: true })).json() as any;
  const headers = { Authorization: `Bearer ${granted.token}` };
  const connection = await f.call('/connection', 'GET', undefined, 'anonymous', headers); assert.equal((await connection.json() as any).canPublish, true);
  const doc = await (await f.call('/documents', 'POST', sample())).json() as any;
  assert.equal((await f.call(`/documents/${doc.id}/publish`, 'POST', { expectedRevision: 1 }, 'anonymous', headers)).status, 200);
  const replaced = await (await f.call('/agent-token', 'POST', { allowPublishing: false })).json() as any;
  assert.equal((await f.call('/connection', 'GET', undefined, 'anonymous', headers)).status, 401);
  assert.equal((await f.call(`/documents/${doc.id}/publish`, 'POST', { expectedRevision: 1 }, 'anonymous', { Authorization: `Bearer ${replaced.token}` })).status, 403);
});
