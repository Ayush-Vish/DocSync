import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sqliteDatabase } from '../scripts/sqlite.ts';
import { getDocument, sharedDocument } from '../src/store.ts';
import { sample } from './helpers.ts';
import { hash, randomToken } from '../src/auth.ts';
import { acceptInvitation } from '../src/collaboration.ts';

test('account migration preserves populated legacy documents, revisions, and publications', async t => {
  const database = sqliteDatabase(':memory:'); t.after(database.close);
  database.sqlite.exec('CREATE TABLE _migrations(name TEXT PRIMARY KEY)');
  for (const name of ['0001_initial.sql', '0002_agent_publishing.sql']) {
    database.sqlite.exec(readFileSync('migrations/' + name, 'utf8'));
    database.sqlite.prepare('INSERT INTO _migrations VALUES(?)').run(name);
  }
  const id = crypto.randomUUID(), content = sample('Before upgrade');
  database.sqlite.prepare('INSERT INTO documents(id,title,updated_at) VALUES(?,?,?)').run(id,content.title,new Date().toISOString());
  database.sqlite.prepare('INSERT INTO revisions(document_id,revision,content,created_at) VALUES(?,1,?,?)').run(id,JSON.stringify(content),new Date().toISOString());
  database.sqlite.prepare('INSERT INTO publications VALUES(?,1,?)').run(id,'a'.repeat(64));
  database.migrate();
  assert.equal((await getDocument(database.db,id)).title,'Before upgrade');
  assert.equal((await sharedDocument(database.db,'a'.repeat(64))).title,'Before upgrade');
  await assert.rejects(()=>getDocument(database.db,id,undefined,'another-account'),/not found/);
  await assert.rejects(()=>database.db.prepare('INSERT INTO documents(id,title,updated_at) VALUES(?,?,?)').bind(crypto.randomUUID(),'No owner','now').run(),/account required/);
  await assert.rejects(()=>database.db.prepare('UPDATE documents SET account_id=NULL WHERE id=?').bind(id).run(),/account required/);
  await assert.rejects(()=>database.db.prepare('UPDATE documents SET account_id=? WHERE id=?').bind('missing-account',id).run(),/FOREIGN KEY/);
  database.migrate();
  assert.equal((await getDocument(database.db,id)).revision,1);
});

test('email invitation migration preserves acceptance of an existing private link', async t => {
  const database = sqliteDatabase(':memory:'); t.after(database.close);
  for (const name of readdirSync('migrations').filter(name => name.endsWith('.sql') && name < '0008').sort()) database.sqlite.exec(readFileSync('migrations/' + name, 'utf8'));
  const id = crypto.randomUUID(), token = randomToken();
  await database.db.prepare("INSERT INTO documents(id,title,updated_at,account_id) VALUES(?,'Existing document',datetime('now'),'legacy')").bind(id).run();
  await database.db.prepare("INSERT INTO accounts(id,kind,email,created_at) VALUES('recipient','user','recipient@example.com',datetime('now'))").run();
  await database.db.prepare("INSERT INTO document_invitations(id,document_id,token_hash,role,expires_at) VALUES(?,?,?,'viewer',unixepoch()+86400)").bind(crypto.randomUUID(), id, await hash(token)).run();
  database.sqlite.exec(readFileSync('migrations/0008_email_invitations.sql', 'utf8'));
  assert.deepEqual(await acceptInvitation(database.db, token, 'recipient'), { documentId: id, access: 'viewer' });
});
