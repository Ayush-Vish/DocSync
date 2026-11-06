import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, sample } from "./helpers.ts";
import type { Env, Statement } from "../src/platform.ts";
import { randomToken } from "../src/auth.ts";

type InvitationEmail = Parameters<NonNullable<Env["EMAIL"]>["send"]>[0];
function emailService(env: Env) {
  const messages: InvitationEmail[] = [];
  env.DOCSYNC_EMAIL_FROM = "invites@example.com";
  env.EMAIL = { async send(message) {
    assert.ok("subject" in message);
    messages.push(message);
    return { messageId: `message-${messages.length}` };
  } };
  return messages;
}

async function setup() {
  const f = await fixture(true);
  async function user(email: string) {
    const signup = await f.call('/auth/signup', 'POST', { email, password: 'a long secure password 123!' }, 'anonymous', { Origin: 'http://127.0.0.1:8787' });
    assert.equal(signup.status, 200);
    const cookie = signup.headers.getSetCookie()[0].split(';')[0];
    const call = (path: string, method = 'GET', body?: unknown) => f.call(path, method, body, 'anonymous', { Cookie: cookie, Origin: 'http://127.0.0.1:8787' });
    const token = (await (await call('/agent-token', 'POST', { allowPublishing: true })).json() as any).token;
    const agent = (path: string, method = 'GET', body?: unknown) => f.call(path, method, body, 'anonymous', { Authorization: `Bearer ${token}` });
    const account = await f.env.DB.prepare('SELECT id FROM accounts WHERE email=?').bind(email).first<{ id: string }>();
    return { call, agent, accountId: account!.id, cookie };
  }
  const owner = await user('owner@example.com'), editor = await user('editor@example.com'), viewer = await user('viewer@example.com');
  const doc = await (await owner.call('/documents', 'POST', sample('Team document'))).json() as any;
  async function grant(target: typeof editor, role: 'editor' | 'viewer') {
    const response = await owner.call(`/documents/${doc.id}/access`, 'POST', { role });
    assert.equal(response.status, 201);
    const invite = await response.json() as any;
    const token = new URLSearchParams(new URL(invite.url).hash.slice(1)).get('invite');
    assert.ok(token);
    assert.equal((await target.call(`/invitations/${token}`, 'POST', {})).status, 200);
    return { token, id: invite.id };
  }
  return { f, owner, editor, viewer, doc, grant };
}

test('private invitations grant explicit roles to accounts and their agents; public links grant no editing access', async t => {
  const { f, owner, editor, viewer, doc, grant } = await setup(); t.after(f.close);
  assert.equal((await editor.agent(`/documents/${doc.id}`)).status, 404);
  const used = await grant(editor, 'editor');
  await grant(viewer, 'viewer');
  assert.equal((await editor.call(`/invitations/${used.token}`)).status, 404);
  assert.equal((await editor.call(`/invitations/${used.token}`, 'POST', {})).status, 404);
  assert.equal((await (await editor.agent(`/documents/${doc.id}`)).json() as any).access, 'editor');
  assert.equal((await (await viewer.agent(`/documents/${doc.id}`)).json() as any).access, 'viewer');
  assert.ok((await (await editor.agent('/documents')).json() as any[]).some(row => row.id === doc.id));
  assert.equal((await viewer.agent(`/documents/${doc.id}/lock`, 'POST', {})).status, 403);
  assert.equal((await editor.call(`/documents/${doc.id}/access`, 'POST', { role: 'editor' })).status, 403);
  assert.equal((await editor.agent(`/documents/${doc.id}/publish`, 'POST', { expectedRevision: 1 })).status, 403);
  assert.equal((await editor.call(`/documents/${doc.id}/publish`, 'DELETE')).status, 403);
  assert.equal((await owner.call(`/documents/${doc.id}/access`, 'PATCH', { accountId: editor.accountId })).status, 400);
  assert.equal((await owner.call(`/documents/${doc.id}/access`, 'DELETE', { accountId: owner.accountId })).status, 400);
  const published = await (await owner.call(`/documents/${doc.id}/publish`, 'POST', { expectedRevision: 1 })).json() as any;
  const shared = await f.call('/shared/' + published.url.split('/').at(-1), 'GET', undefined, 'anonymous');
  const body = await shared.json() as any;
  assert.equal(body.title, 'Team document');
  assert.equal(body.access, undefined);
  assert.equal((await f.call(`/documents/${doc.id}/lock`, 'POST', {}, 'anonymous')).status, 401);
  assert.equal((await viewer.agent(`/documents/${doc.id}/thumbnail`)).status, 200);
  assert.equal((await viewer.agent(`/documents/${doc.id}/history`)).status, 200);
});

test('owner agents email recipient-bound invitations; recipients and their agents inherit read/write changes', async t => {
  const { f, owner, editor, viewer, doc } = await setup(); t.after(f.close);
  const messages = emailService(f.env);
  assert.equal((await editor.agent(`/documents/${doc.id}/access`, 'POST', { role: 'editor', email: 'viewer@example.com' })).status, 404);
  const response = await owner.agent(`/documents/${doc.id}/access`, 'POST', { role: 'viewer', email: '  EDITOR@EXAMPLE.COM  ' });
  assert.equal(response.status, 201);
  const invite = await response.json() as any;
  assert.equal(invite.recipientEmail, 'editor@example.com');
  assert.deepEqual(invite.emailDelivery, { status: 'accepted', messageId: 'message-1' });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, 'editor@example.com');
  assert.match(messages[0].text!, /read only/);
  assert.ok(messages[0].text!.includes(invite.url));
  assert.ok(messages[0].html!.includes(invite.url));
  const token = new URL(invite.url).hash.slice('#invite='.length);
  assert.equal((await editor.agent(`/documents/${doc.id}`)).status, 404, 'Sending does not grant access before acceptance');
  assert.equal((await viewer.call(`/invitations/${token}`, 'POST', {})).status, 403, 'Forwarded mail cannot grant another account access');
  const pending = await (await owner.agent(`/documents/${doc.id}/access`)).json() as any;
  assert.equal(pending.emailInvitationsAvailable, true);
  assert.equal(pending.invitations[0].recipientEmail, 'editor@example.com');
  assert.equal((await editor.call(`/invitations/${token}`, 'POST', {})).status, 200, 'Wrong recipient did not consume the invitation');
  assert.equal((await (await editor.agent(`/documents/${doc.id}`)).json() as any).access, 'viewer');
  assert.equal((await editor.agent(`/documents/${doc.id}/lock`, 'POST', {})).status, 403);
  assert.equal((await owner.agent(`/documents/${doc.id}/access`, 'PATCH', { accountId: editor.accountId, role: 'editor' })).status, 200);
  assert.equal((await editor.agent(`/documents/${doc.id}/lock`, 'POST', {})).status, 200);
  assert.equal((await owner.agent(`/documents/${doc.id}/access`, 'PATCH', { accountId: editor.accountId, role: 'viewer' })).status, 200);
  assert.equal((await (await owner.agent(`/documents/${doc.id}/lock`)).json() as any).lock, null);
  assert.equal((await editor.agent(`/documents/${doc.id}/lock`, 'POST', {})).status, 403);
  assert.equal((await owner.agent(`/documents/${doc.id}/access`, 'DELETE', { accountId: editor.accountId })).status, 200);
  assert.equal((await editor.agent(`/documents/${doc.id}`)).status, 404);
});

test('email invitations validate inputs, escape document content, and revoke uncertain sends', async t => {
  const { f, owner, doc } = await setup(); t.after(f.close);
  const path = `/documents/${doc.id}/access`;
  assert.equal((await owner.agent(path, 'POST', { role: 'viewer', email: 'editor@example.com' })).status, 503);
  assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM document_invitations').first<{ n: number }>())!.n, 0);
  const messages = emailService(f.env);
  for (const email of ['', null, 42, 'a@example.com,b@example.com', 'a@example.com\r\nBcc: other@example.com', 'x'.repeat(255) + '@example.com']) {
    assert.equal((await owner.agent(path, 'POST', { role: 'viewer', email })).status, 400);
  }
  assert.equal((await owner.agent(path, 'POST', { role: 'owner', email: 'editor@example.com' })).status, 400);
  assert.equal(messages.length, 0);
  await f.env.DB.prepare('UPDATE documents SET title=? WHERE id=?').bind('<img src=x onerror="alert(1)"> & team', doc.id).run();
  assert.equal((await owner.agent(path, 'POST', { role: 'editor', email: 'editor@example.com' })).status, 201);
  assert.ok(!messages[0].html!.includes('<img'));
  assert.match(messages[0].html!, /&lt;img/);
  assert.match(messages[0].text!, /read and edit/);
  let uncertainUrl = '';
  f.env.EMAIL = { async send(message) {
    assert.ok('subject' in message);
    uncertainUrl = message.text!.match(/http[^\s]+/)![0];
    throw new Error('provider failure with private diagnostic data');
  } };
  const failed = await owner.agent(path, 'POST', { role: 'viewer', email: 'editor@example.com' });
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes('private diagnostic'));
  const token = new URL(uncertainUrl).hash.slice('#invite='.length);
  assert.equal((await owner.call(`/invitations/${token}`)).status, 404);
  assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM document_invitations').first<{ n: number }>())!.n, 1, 'Failed delivery leaves no live invitation');
});

test('email invitation limits persist across revocations, clients, and IPs', async t => {
  const { f, owner, doc } = await setup(); t.after(f.close);
  const messages = emailService(f.env);
  for (let i = 0; i < 10; i++) {
    const response = await owner.agent(`/documents/${doc.id}/access`, 'POST', { role: 'viewer', email: 'editor@example.com' });
    assert.equal(response.status, 201);
    const invite = await response.json() as any;
    assert.equal((await owner.agent(`/documents/${doc.id}/invitations/${invite.id}`, 'DELETE')).status, 200);
  }
  const blocked = await f.call(`/documents/${doc.id}/access`, 'POST', { role: 'viewer', email: 'editor@example.com' }, 'anonymous', { Cookie: owner.cookie, Origin: 'http://127.0.0.1:8787', 'CF-Connecting-IP': '203.0.113.2' });
  assert.equal(blocked.status, 429);
  assert.equal(messages.length, 10);
  assert.equal((await owner.call(`/documents/${doc.id}/access`, 'POST', { role: 'viewer' })).status, 201, 'Private link sharing remains available');
});

test('anonymous trial installations cannot send email invitations', async t => {
  const f = await fixture(); t.after(f.close);
  const messages = emailService(f.env), credential = randomToken();
  assert.equal((await f.call('/installations', 'POST', { credential }, 'anonymous')).status, 200);
  const headers = { Authorization: `Bearer ${credential}` };
  const doc = await (await f.call('/documents', 'POST', sample(), 'anonymous', headers)).json() as any;
  const denied = await f.call(`/documents/${doc.id}/access`, 'POST', { role: 'viewer', email: 'editor@example.com' }, 'anonymous', headers);
  assert.equal(denied.status, 403);
  assert.equal(messages.length, 0);
});

test('invitation acceptance is single-use under races, and expiry and revocation are enforced', async t => {
  const { f, owner, editor, viewer, doc } = await setup(); t.after(f.close);
  const create = async () => {
    const invite = await (await owner.call(`/documents/${doc.id}/access`, 'POST', { role: 'editor' })).json() as any;
    return { ...invite, token: new URLSearchParams(new URL(invite.url).hash.slice(1)).get('invite') };
  };
  const invite = await create();
  const responses = await Promise.all([editor.call(`/invitations/${invite.token}`, 'POST', {}), viewer.call(`/invitations/${invite.token}`, 'POST', {})]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const members = await (await owner.call(`/documents/${doc.id}/access`)).json() as any;
  assert.equal(members.members.length, 2, 'Only one account receives the raced invitation');
  const revoked = await create();
  await owner.call(`/documents/${doc.id}/invitations/${revoked.id}`, 'DELETE');
  assert.equal((await editor.call(`/invitations/${revoked.token}`, 'POST', {})).status, 404);
  const expired = await create();
  await f.env.DB.prepare('UPDATE document_invitations SET expires_at=unixepoch()-1 WHERE id=?').bind(expired.id).run();
  assert.equal((await editor.call(`/invitations/${expired.token}`, 'POST', {})).status, 404);
});

test('one agent wins a raced lease; tokens and current revisions protect saves, history and restore', async t => {
  const { f, owner, editor, doc, grant } = await setup(); t.after(f.close); await grant(editor, 'editor');
  const attempts = await Promise.all([owner.agent(`/documents/${doc.id}/lock`, 'POST', {}), editor.agent(`/documents/${doc.id}/lock`, 'POST', {})]);
  assert.deepEqual(attempts.map(response => response.status).sort(), [200, 423]);
  const winnerIndex = attempts.findIndex(response => response.status === 200);
  const winner = [owner, editor][winnerIndex], loser = [editor, owner][winnerIndex];
  const lease = await attempts[winnerIndex].json() as any;
  const status = await (await loser.agent(`/documents/${doc.id}/lock`)).json() as any;
  assert.equal(status.lock.leaseId, lease.leaseId);
  assert.equal(status.lock.lockToken, undefined);
  assert.equal(status.lock.actorId, undefined);
  assert.equal((await winner.agent(`/documents/${doc.id}/lock`, 'POST', {})).status, 423, 'Two sessions on the same credential cannot silently share a lease');
  assert.equal((await loser.agent(`/documents/${doc.id}`, 'PUT', { ...sample(), expectedRevision: 1, lockToken: lease.lockToken })).status, 423, 'A copied token cannot cross accounts');
  assert.equal((await loser.agent(`/documents/${doc.id}/lock`, 'PATCH', { lockToken: lease.lockToken })).status, 423);
  assert.equal((await winner.agent(`/documents/${doc.id}`, 'PUT', { ...sample(), expectedRevision: 1 })).status, 423);
  const edited = { title: 'Edited team document', format: 'document', sections: [{ id: 'intro', html: '<h1>Updated content</h1>', css: 'h1{color:blue}', js: 'window.example=true' }, { id: 'second', html: '<h2>New page</h2>', css: '' }] };
  assert.equal((await winner.agent(`/documents/${doc.id}`, 'PUT', { ...edited, expectedRevision: 1, lockToken: lease.lockToken, changeSummary: 'Added a second page' })).status, 200);
  assert.equal((await winner.agent(`/documents/${doc.id}`, 'PUT', { ...sample('Stale'), expectedRevision: 1, lockToken: lease.lockToken })).status, 409);
  const comparison = await (await winner.agent(`/documents/${doc.id}/compare?from=1&to=2`)).json() as any;
  assert.equal(comparison.title.after, edited.title);
  assert.ok(comparison.pages.find((page: any) => page.id === 'intro').changes.some((change: any) => change.field === 'js'));
  assert.equal(comparison.pages.find((page: any) => page.id === 'second').fromIndex, -1);
  assert.equal((await (await winner.agent(`/documents/${doc.id}?revision=1`)).json() as any).title, 'Team document');
  assert.equal((await winner.agent(`/documents/${doc.id}/restore`, 'POST', { revision: 1, expectedRevision: 2, lockToken: lease.lockToken })).status, 200);
  const history = await (await winner.agent(`/documents/${doc.id}/history`)).json() as any[];
  assert.deepEqual(history.map(row => row.revision), [3, 2, 1]);
  assert.equal(history[0].restored_from, 1);
  assert.equal(history[0].parent_revision, 2);
  assert.equal(history[1].summary, 'Added a second page');
  assert.equal(history[1].author, winnerIndex === 0 ? 'owner@example.com' : 'editor@example.com');
  assert.equal(history[1].agent, 'Account agent');
  await winner.agent(`/documents/${doc.id}/lock`, 'DELETE', { lockToken: lease.lockToken });
  assert.equal((await loser.agent(`/documents/${doc.id}/lock`, 'POST', {})).status, 200);
});

test('expired leases cannot renew, write, restore or release a replacement lease; revocation removes live edit access', async t => {
  const { f, owner, editor, doc, grant } = await setup(); t.after(f.close); await grant(editor, 'editor');
  const old = await (await editor.agent(`/documents/${doc.id}/lock`, 'POST', {})).json() as any;
  await f.env.DB.prepare('UPDATE edit_locks SET expires_at=unixepoch()-1 WHERE document_id=?').bind(doc.id).run();
  assert.equal((await editor.agent(`/documents/${doc.id}/lock`, 'PATCH', { lockToken: old.lockToken })).status, 423);
  const next = await (await owner.agent(`/documents/${doc.id}/lock`, 'POST', {})).json() as any;
  assert.notEqual(next.lockToken, old.lockToken);
  assert.equal((await editor.agent(`/documents/${doc.id}`, 'PUT', { ...sample(), expectedRevision: 1, lockToken: old.lockToken })).status, 423);
  assert.equal((await editor.agent(`/documents/${doc.id}/restore`, 'POST', { revision: 1, expectedRevision: 1, lockToken: old.lockToken })).status, 423);
  await editor.agent(`/documents/${doc.id}/lock`, 'DELETE', { lockToken: old.lockToken });
  assert.equal((await (await owner.agent(`/documents/${doc.id}/lock`)).json() as any).lock.leaseId, next.leaseId);
  await owner.agent(`/documents/${doc.id}/lock`, 'DELETE', { lockToken: next.lockToken });
  const active = await (await editor.agent(`/documents/${doc.id}/lock`, 'POST', {})).json() as any;
  await owner.call(`/documents/${doc.id}/access`, 'PATCH', { accountId: editor.accountId, role: 'viewer' });
  assert.equal((await editor.agent(`/documents/${doc.id}`, 'PUT', { ...sample(), expectedRevision: 1, lockToken: active.lockToken })).status, 403);
  assert.equal((await (await owner.call(`/documents/${doc.id}/lock`)).json() as any).lock, null);
  await owner.call(`/documents/${doc.id}/access`, 'DELETE', { accountId: editor.accountId });
  for (const action of ['', '/history', '/thumbnail', '/lock', '/compare?from=1&to=1']) assert.equal((await editor.agent(`/documents/${doc.id}${action}`)).status, 404);
  assert.deepEqual(await (await editor.agent('/documents')).json(), []);
});

test('revocation between the application permission check and the revision insert cannot commit a save', async t => {
  const { f, owner, editor, doc, grant } = await setup(); t.after(f.close); await grant(editor, 'editor');
  const lease = await (await editor.agent(`/documents/${doc.id}/lock`, 'POST', {})).json() as any;
  const prepare = f.env.DB.prepare.bind(f.env.DB);
  let revoked = false;
  // Interleave a revocation at the write boundary, leaving the lease itself
  // intact to prove that the mutation checks current membership as well.
  t.mock.method(f.env.DB, 'prepare', (sql: string): Statement => {
    const statement = prepare(sql);
    if (!sql.startsWith('INSERT INTO revisions')) return statement;
    const wrap = (inner: Statement): Statement => ({
      ...inner,
      bind: (...values) => wrap(inner.bind(...values)),
      run: async () => {
        revoked = true;
        await prepare('DELETE FROM document_members WHERE document_id=? AND account_id=?').bind(doc.id, editor.accountId).run();
        return inner.run();
      },
    });
    return wrap(statement);
  });
  const response = await editor.agent(`/documents/${doc.id}`, 'PUT', { ...sample('Must not commit'), expectedRevision: 1, lockToken: lease.lockToken });
  assert.ok(revoked);
  assert.equal(response.status, 404);
  assert.equal((await (await owner.call(`/documents/${doc.id}`)).json() as any).revision, 1);
});

test('the same account can resume its secret lease after re-login; logout and credential revocation release their locks', async t => {
  const { f, owner, doc } = await setup(); t.after(f.close);
  const lease = await (await owner.call(`/documents/${doc.id}/lock`, 'POST', {})).json() as any;
  const signedIn = await f.call('/auth/signin', 'POST', { email: 'owner@example.com', password: 'a long secure password 123!' }, 'anonymous', { Origin: 'http://127.0.0.1:8787' });
  const cookie = signedIn.headers.getSetCookie()[0].split(';')[0];
  const call = (path: string, method: string, body: unknown) => f.call(path, method, body, 'anonymous', { Cookie: cookie, Origin: 'http://127.0.0.1:8787' });
  assert.equal((await call(`/documents/${doc.id}/lock`, 'PATCH', { lockToken: lease.lockToken })).status, 200);
  assert.equal((await call(`/documents/${doc.id}`, 'PUT', { ...sample('After re-login'), expectedRevision: 1, lockToken: lease.lockToken })).status, 200);
  assert.equal((await call('/logout', 'POST', {})).status, 200);
  assert.equal((await (await owner.call(`/documents/${doc.id}/lock`)).json() as any).lock, null);
  assert.equal((await owner.agent(`/documents/${doc.id}/lock`, 'POST', {})).status, 200);
  await owner.call('/agent-token', 'DELETE');
  assert.equal((await owner.agent(`/documents/${doc.id}`)).status, 401);
  assert.equal((await (await owner.call(`/documents/${doc.id}/lock`)).json() as any).lock, null);
});
