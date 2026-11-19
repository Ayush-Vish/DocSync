import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.ts";
import { handle } from "../src/worker.ts";
import { hash, randomToken } from "../src/auth.ts";
import { newSession } from "../src/accounts.ts";

test("Google signs a new user into hosted MCP before the user approves access", async (t) => {
  const f = await fixture();
  t.after(f.close);
  f.env.GOOGLE_CLIENT_ID = "client";
  f.env.GOOGLE_CLIENT_SECRET = "secret";
  const origin = "http://127.0.0.1:8787";
  const clientId = randomToken();
  const redirectUri = "http://localhost:63431/callback";
  await f.env.DB.prepare("INSERT INTO oauth_clients VALUES(?,?,?,unixepoch())")
    .bind(clientId, "Test Agent", JSON.stringify([redirectUri])).run();
  const authorize = "/oauth/authorize?" + new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code", code_challenge_method: "S256",
    code_challenge: "A".repeat(43), state: "agent-state",
  });
  const unsignedPage = await handle(new Request(origin + authorize), f.env);
  const googleLink = (await unsignedPage.text()).match(/href="([^"]+)">Continue with Google/);
  assert.ok(googleLink);
  const started = await handle(new Request(origin + googleLink[1]), f.env);
  assert.equal(started.status, 302);
  const googleState = new URL(started.headers.get("Location")!).searchParams.get("state");
  t.mock.method(globalThis, "fetch", async (url: string) =>
    url.endsWith("/token") ? Response.json({ access_token: "google-token" })
      : Response.json({ sub: "google-subject", email: "new@example.com", email_verified: true }));
  const signedIn = await handle(new Request(origin + "/api/auth/google/callback?" + new URLSearchParams({
    state: googleState!, code: "google-code",
  }), { headers: { Cookie: started.headers.getSetCookie()[0].split(";")[0] } }), f.env);
  assert.equal(signedIn.status, 302);
  const continuation = signedIn.headers.get("Location")!;
  assert.equal(new URL(continuation, origin).pathname, "/oauth/authorize");
  assert.equal(new URL(continuation, origin).searchParams.get("state"), "agent-state");
  const session = signedIn.headers.getSetCookie()[0].split(";")[0];
  const consent = await handle(new Request(origin + continuation, { headers: { Cookie: session } }), f.env);
  const consentHtml = await consent.text();
  assert.match(consentHtml, /Signed in as new@example.com/);
  assert.equal(await f.env.DB.prepare("SELECT code_hash FROM oauth_codes").first(), null);
  const csrf = consentHtml.match(/name="csrf" value="([^"]+)"/)![1];
  const approved = await handle(new Request(origin + continuation, {
    method: "POST",
    headers: { Cookie: session + "; " + consent.headers.getSetCookie()[0].split(";")[0] },
    body: new URLSearchParams({ csrf }),
  }), f.env);
  assert.equal(approved.status, 302);
  const callback = new URL(approved.headers.get("Location")!);
  assert.equal(callback.origin + callback.pathname, redirectUri);
  assert.equal(callback.searchParams.get("state"), "agent-state");
  assert.ok(callback.searchParams.get("code"));
});

test("OAuth sign-in retry gets a fresh CSRF token bound to the same request", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const origin = "http://127.0.0.1:8787";
  await f.seedUser("oauth@example.com", "a long safe password 123!");

  await f.env.DB.prepare("INSERT INTO oauth_clients VALUES(?,?,?,?)")
    .bind("test-client", "Test Agent", JSON.stringify(["http://localhost/callback"]), Math.floor(Date.now() / 1000)).run();
  const authorizeUrl = new URL(`${origin}/oauth/authorize`);
  authorizeUrl.search = new URLSearchParams({ client_id: "test-client", redirect_uri: "http://localhost/callback", response_type: "code", code_challenge_method: "S256", code_challenge: "A".repeat(43), state: "test-state" }).toString();
  const firstPage = await handle(new Request(authorizeUrl), f.env);
  assert.equal(firstPage?.status, 200);
  const firstHtml = await firstPage!.text();
  const firstCsrf = firstHtml.match(/name="csrf" value="([^"]+)"/)?.[1];
  assert.ok(firstCsrf);
  assert.match(firstHtml, /saved templates/);
  const cookie = firstPage.headers.getSetCookie()[0].split(";")[0];

  const wrong = new FormData();
  wrong.set("csrf", firstCsrf);
  wrong.set("email", "oauth@example.com");
  wrong.set("password", "incorrect long password");
  const unbound = await handle(new Request(`${origin}/oauth/authorize`, { method: "POST", body: wrong }), f.env);
  assert.equal(unbound.status, 403, "A request token alone cannot authorize another browser");
  const retry = await handle(new Request(`${origin}/oauth/authorize`, { method: "POST", headers: { Cookie: cookie }, body: wrong }), f.env);
  assert.equal(retry?.status, 200);
  const retryHtml = await retry!.text();
  assert.match(retryHtml, /Email or password is incorrect/);
  const retryCsrf = retryHtml.match(/name="csrf" value="([^"]+)"/)?.[1];
  assert.ok(retryCsrf);
  assert.notEqual(retryCsrf, firstCsrf);

  const correct = new FormData();
  correct.set("csrf", retryCsrf!);
  correct.set("email", "oauth@example.com");
  correct.set("password", "a long safe password 123!");
  const approved = await handle(new Request(`${origin}/oauth/authorize`, { method: "POST", headers: { Cookie: retry.headers.getSetCookie()[0].split(";")[0] }, body: correct }), f.env);
  assert.equal(approved?.status, 302);
  assert.match(approved!.headers.get("Location") || "", /code=/);
  assert.match(approved.headers.get("Content-Security-Policy")!, /script-src 'self';/);
  assert.ok(!(await approved.text()).includes("<script>"));
});

test("hosted MCP uses the authenticated document API without outbound self-fetch", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const origin = "http://127.0.0.1:8787";
  const account = await f.seedUser("hosted@example.com");
  await f.env.DB.prepare("INSERT INTO oauth_clients VALUES(?,?,?,?)").bind("hosted-client", "Hosted Agent", JSON.stringify(["http://localhost/callback"]), Math.floor(Date.now() / 1000)).run();
  const token = randomToken();
  await f.env.DB.prepare("INSERT INTO oauth_access_tokens VALUES(?,?,?,?,?)").bind(await hash(token), account.id, "hosted-client", 1, Math.floor(Date.now() / 1000) + 900).run();
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Outbound self-fetch is unavailable"); });
  async function callTool(name: string, args: Record<string, unknown> = {}) {
    const response = await handle(new Request(`${origin}/mcp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }), f.env);
    assert.equal(response.status, 200);
    const rpc = await response.json() as { result: { isError?: boolean; content: Array<{ text: string }> } };
    assert.ok(rpc.result);
    assert.equal(rpc.result.isError, false);
    return JSON.parse(rpc.result.content[0].text);
  }
  assert.equal((await callTool("get_connection")).canPublish, true);
  const template = await callTool("save_company_template", {
    format: "presentation", name: "Hosted brand", instructions: "Use the company color on slides.",
    css: ".brand{background:#03152b}", layouts: [{ name: "Title", html: '<article class="slide brand"><h1>[Title]</h1></article>' }],
  });
  const recipe = await callTool("get_company_template", { format: "presentation" });
  assert.equal(recipe.id, template.id);
  assert.equal((await f.call("/company-templates/presentation", "GET", undefined, "agent")).status, 404);
  assert.deepEqual((await (await f.call("/template-options?format=presentation", "GET", undefined, "agent")).json()).companyTemplates, []);
  const deck = {
    title: "Hosted presentation", format: "presentation", companyTemplateId: recipe.id,
    pages: [{ id: "cover", html: recipe.layouts[0].html.replace("[Title]", "Hosted presentation"), css: "" }],
    brief: { answeredBy: "user", audience: "team", depth: "overview", slideCount: 1, animation: "none", style: "custom", speakerNotes: false },
  };
  const { brief: _brief, ...deckInput } = deck;
  assert.equal((await f.call("/documents", "POST", deckInput, "agent")).status, 404);
  const branded = await callTool("create_document", deck);
  assert.equal(branded.sections[0].css, recipe.css);
  const auditRows = await f.env.DB.prepare("SELECT details FROM agent_audit_events WHERE account_id=?").bind(account.id).all();
  assert.doesNotMatch(JSON.stringify(auditRows.results), /#03152b|Use the company color on slides/);
  const created = await callTool("create_document", { title: "Hello", sections: [{ id: "hello", html: "<p>hello</p>", css: "" }] });
  const saved = await callTool("get_document", { id: created.id });
  assert.equal(saved.sections[0].html, "<p>hello</p>");
  const published = await callTool("publish_document", { id: saved.id, expectedRevision: saved.revision });
  assert.match(published.url, /\/share\/[a-f0-9]{64}$/);
  // Only media calls receive the larger JSON transport budget.
  const image = new Uint8Array(600_000); image.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const media = await callTool("upload_media", { id: saved.id, filename: "large.png", mimeType: "image/png", dataBase64: Buffer.from(image).toString("base64") });
  assert.equal(media.size, 600_000); assert.match(media.src, /^\/media\//);
  const oversized = await handle(new Request(`${origin}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_document", arguments: { title: "x".repeat(550_001) } } }) }), f.env);
  assert.equal(oversized.status, 413);
});

test("OAuth accepts RFC 7636 verifiers and owners manage publishing after connection", async t => {
  const f = await fixture();
  t.after(f.close);
  const origin = "http://127.0.0.1:8787";
  const accountId = crypto.randomUUID();
  await f.env.DB.prepare("INSERT INTO accounts(id,kind,email,created_at) VALUES(?,'user','permission@example.com',datetime('now'))").bind(accountId).run();
  const session = (await newSession(new Request(origin), f.env, accountId)).split(";")[0];
  const redirectUri = "http://localhost:63431/callback";
  const registration = await handle(new Request(`${origin}/oauth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Claude Code", redirect_uris: [redirectUri] }),
  }), f.env);
  assert.equal(registration.status, 201);
  const { client_id: clientId } = await registration.json();
  const verifier = "valid.~_" + "a".repeat(42);
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  const authorize = new URL(`${origin}/oauth/authorize`);
  authorize.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", code_challenge_method: "S256", code_challenge: challenge }).toString();
  const approval = await handle(new Request(authorize, { headers: { Cookie: session } }), f.env);
  const html = await approval.text();
  assert.doesNotMatch(html, /name="publish"/);
  const csrf = html.match(/name="csrf" value="([a-f0-9]+)"/)![1];
  const consent = await handle(new Request(authorize, {
    method: "POST", headers: { Cookie: `${session}; ${approval.headers.getSetCookie()[0].split(";")[0]}` },
    body: new URLSearchParams({ csrf, publish: "yes" }),
  }), f.env);
  assert.equal(consent.status, 302);
  const code = new URL(consent.headers.get("Location")!).searchParams.get("code")!;
  const token = (inputs: Record<string, string>) => handle(new Request(`${origin}/oauth/token`, {
    method: "POST", body: new URLSearchParams({ client_id: clientId, ...inputs }),
  }), f.env);
  const exchange = { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier };
  assert.equal((await token({ ...exchange, code_verifier: "b".repeat(43) })).status, 400);
  assert.equal((await token({ ...exchange, redirect_uri: redirectUri + "/other" })).status, 400);
  const exchanges = await Promise.all([token(exchange), token(exchange)]);
  assert.deepEqual(exchanges.map(response => response.status).sort(), [200, 400]);
  const credentials = await exchanges.find(response => response.ok)!.json();
  assert.equal(credentials.scope, "docsync");

  const browser = { Cookie: session, Origin: origin };
  const agent = { Authorization: `Bearer ${credentials.access_token}` };
  const call = (path: string, method: string, headers: Record<string, string>, body?: unknown) => f.call(path, method, body, "anonymous", headers);
  const connection = async (headers: Record<string, string>) => (await call("/connection", "GET", headers)).json();
  const clients = async () => (await call("/mcp-clients", "GET", browser)).json();
  const enable = { clientId, allowPublishing: true };
  const setPermission = (allowPublishing: boolean) => call("/mcp-clients", "PATCH", browser, { clientId, allowPublishing });
  assert.equal((await clients())[0].allowPublishing, false);
  assert.equal((await connection(agent)).canPublish, false);
  assert.equal((await call("/mcp-clients", "PATCH", agent, enable)).status, 403);
  assert.equal((await call("/mcp-clients", "PATCH", { ...browser, Origin: "https://untrusted.example" }, enable)).status, 403);
  assert.equal((await f.call("/mcp-clients", "PATCH", enable)).status, 404);
  const draft = await (await call("/documents", "POST", agent, { title: "Private draft", sections: [{ id: "intro", html: "<h1>Intro</h1>", css: "" }] })).json();
  const publish = () => call(`/documents/${draft.id}/publish`, "POST", agent, { expectedRevision: draft.revision });
  assert.equal((await publish()).status, 403);
  assert.equal((await setPermission(true)).status, 200);
  assert.equal((await clients())[0].allowPublishing, true);
  assert.equal((await connection(agent)).canPublish, true);
  assert.equal((await publish()).status, 200);

  const refresh = { grant_type: "refresh_token", refresh_token: credentials.refresh_token };
  const rotations = await Promise.all([token(refresh), token(refresh)]);
  assert.deepEqual(rotations.map(response => response.status).sort(), [200, 400]);
  const rotated = await rotations.find(response => response.ok)!.json();
  const refreshedAgent = { Authorization: `Bearer ${rotated.access_token}` };
  assert.equal((await connection(refreshedAgent)).canPublish, true);
  assert.equal((await setPermission(false)).status, 200);
  assert.equal((await connection(agent)).canPublish, false);
  assert.equal((await connection(refreshedAgent)).canPublish, false);
  assert.equal((await publish()).status, 403);
  assert.equal((await call("/mcp-clients", "DELETE", browser, { clientId })).status, 200);
  assert.deepEqual(await clients(), []);
  assert.equal((await token({ ...refresh, refresh_token: rotated.refresh_token })).status, 400);
});
