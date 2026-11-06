import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, sample } from "./helpers.ts";
import { agentIdentity, clientName, type Collaborator } from "../src/agent-client.ts";
import { randomToken, hash } from "../src/auth.ts";

test("agent names map to company/icons and malformed metadata falls back safely", () => {
  for (const [name, company, provider] of [["Codex CLI", "OpenAI", "openai"], ["claude-code", "Anthropic", "anthropic"], ["Antigravity", "Google", "google"], ["Gemini CLI", "Google", "google"], ["Other Agent", "MCP client", "other"]]) {
    assert.equal(agentIdentity(name).company, company);
    assert.equal(agentIdentity(name).provider, provider);
  }
  for (const name of ["%ZZ", "%0A", "x".repeat(101)]) assert.equal(clientName(new Request("https://example.com", { headers: { "X-DocSync-Client": name } }), "Fallback"), "Fallback");
  assert.equal(clientName(new Request("https://example.com", { headers: { "X-DocSync-Client": encodeURIComponent("Codex CLI") } }), "Fallback"), "Codex CLI");
});

test("members see collaborators and recently active agents without secrets or public disclosure", async t => {
  const f = await fixture(true); t.after(f.close);
  const doc = await (await f.call("/documents", "POST", sample())).json() as any;
  const memberToken = randomToken();
  await f.env.DB.prepare("INSERT INTO accounts(id,kind,email,created_at) VALUES('member','user','member@example.com',?)").bind(new Date().toISOString()).run();
  await f.env.DB.prepare("INSERT INTO account_credentials VALUES('member',?,0)").bind(await hash(memberToken)).run();
  await f.env.DB.prepare("INSERT INTO document_members VALUES(?,'member','editor')").bind(doc.id).run();
  assert.equal((await f.call(`/documents/${doc.id}`, "GET", undefined, "agent", { "X-DocSync-Client": "Codex" })).status, 200);
  assert.equal((await f.call(`/documents/${doc.id}`, "GET", undefined, "anonymous", { Authorization: `Bearer ${memberToken}`, "X-DocSync-Client": "Claude%20Code" })).status, 200);
  const response = await f.call(`/documents/${doc.id}/collaborators`, "GET", undefined, "anonymous", { Authorization: `Bearer ${memberToken}`, "X-DocSync-Client": "Claude%20Code" });
  const people = await response.json() as Collaborator[];
  assert.equal(people.length, 2);
  assert.deepEqual(people.find(person => person.role === "owner")?.agents.map(agent => [agent.name, agent.company, agent.active]), [["Codex", "OpenAI", true]]);
  assert.deepEqual(people.find(person => person.accountId === "member")?.agents.map(agent => [agent.name, agent.company, agent.active]), [["Claude Code", "Anthropic", true]]);
  assert.ok(!/actorId|credential:|token_hash|Bearer/.test(JSON.stringify(people)));
  assert.ok(!JSON.stringify(people).includes(memberToken));
  const access = await (await f.call(`/documents/${doc.id}/access`)).json() as any;
  assert.equal(access.members.find((person: any) => person.accountId === "member").agents[0].company, "Anthropic");
  assert.equal((await f.call(`/documents/${doc.id}/collaborators`, "GET", undefined, "anonymous")).status, 401);
  await f.env.DB.prepare("DELETE FROM document_members WHERE account_id='member'").run();
  assert.equal((await f.call(`/documents/${doc.id}/collaborators`, "GET", undefined, "anonymous", { Authorization: `Bearer ${memberToken}` })).status, 404);
});

test("idle OAuth authorization is distinct from recent use and revoked credentials disappear", async t => {
  const f = await fixture(); t.after(f.close);
  const doc = await (await f.call("/documents", "POST", sample())).json() as any;
  const oauthToken = randomToken(), now = Math.floor(Date.now() / 1000);
  await f.env.DB.prepare("INSERT INTO oauth_clients VALUES('claude','Claude Code','[]',?)").bind(now).run();
  await f.env.DB.prepare("INSERT INTO oauth_access_tokens VALUES(?,'legacy','claude',0,?)").bind(await hash(oauthToken), now + 900).run();
  const people = async () => await (await f.call(`/documents/${doc.id}/collaborators`)).json() as Collaborator[];
  let agents = (await people())[0].agents;
  assert.equal(agents[0].active, false); assert.equal(agents[0].lastSeen, null);
  await f.call(`/documents/${doc.id}`, "GET", undefined, "anonymous", { Authorization: `Bearer ${oauthToken}`, "X-DocSync-Client": "Codex" });
  agents = (await people())[0].agents;
  assert.equal(agents.length, 1); assert.equal(agents[0].name, "Claude Code", "OAuth uses the registered client identity"); assert.equal(agents[0].active, true);
  await f.env.DB.prepare("UPDATE agent_connections SET last_seen=unixepoch()-301").run();
  assert.equal((await people())[0].agents[0].active, false);
  await f.env.DB.prepare("DELETE FROM oauth_access_tokens").run();
  assert.deepEqual((await people())[0].agents, []);
  await f.call(`/documents/${doc.id}`, "GET", undefined, "agent", { "X-DocSync-Client": "Antigravity" });
  assert.equal((await people())[0].agents[0].company, "Google");
  await f.call("/agent-token", "DELETE");
  assert.deepEqual((await people())[0].agents, []);
});

test("agent activity is bounded and old client activity expires", async t => {
  const f = await fixture(); t.after(f.close);
  const doc = await (await f.call("/documents", "POST", sample())).json() as any;
  for (let i = 0; i < 25; i++) await f.call(`/documents/${doc.id}`, "GET", undefined, "agent", { "X-DocSync-Client": `Client-${i}` });
  assert.equal((await f.env.DB.prepare("SELECT COUNT(*) n FROM agent_connections").first<any>()).n, 20);
  await f.env.DB.prepare("UPDATE agent_connections SET last_seen=unixepoch()-86401").run();
  assert.deepEqual((await (await f.call(`/documents/${doc.id}/collaborators`)).json() as Collaborator[])[0].agents, []);
  await f.call(`/documents/${doc.id}`, "GET", undefined, "agent", { "X-DocSync-Client": "Codex" });
  assert.equal((await f.env.DB.prepare("SELECT COUNT(*) n FROM agent_connections").first<any>()).n, 1);
});
