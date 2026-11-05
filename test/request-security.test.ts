import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.ts";
import { handle } from "../src/worker.ts";
import { randomToken, hash } from "../src/auth.ts";

const origin = "https://docs.example";

test("OAuth inputs reject malformed and oversized bodies before storing clients", async t => {
  const f = await fixture(); t.after(f.close);
  for (const [body, contentType, status] of [
    ["{", "application/json", 400],
    ["[]", "application/json", 400],
    ['{"redirect_uris":[]}', "text/plain", 415],
    [JSON.stringify({ client_name: "x".repeat(20_000) }), "application/json", 413],
    [JSON.stringify({ redirect_uris: ["https://client.example/callback#secret"] }), "application/json", 400],
    [JSON.stringify({ redirect_uris: ["https://user:pass@client.example/callback"] }), "application/json", 400],
  ] as const) {
    const response = await handle(new Request(origin + "/oauth/register", { method: "POST", headers: { "Content-Type": contentType }, body }), f.env);
    assert.equal(response.status, status);
  }
  const count = await f.env.DB.prepare("SELECT COUNT(*) AS count FROM oauth_clients").first<{ count: number }>();
  assert.equal(count!.count, 0);
  for (const path of ["/oauth/authorize", "/oauth/token", "/oauth/revoke"]) {
    const response = await handle(new Request(origin + path, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "x=" + "x".repeat(20_000) }), f.env);
    assert.equal(response.status, 413);
  }
});

test("OAuth uses the caller's IP for password limits and binds approval to the issuing browser", async t => {
  const f = await fixture(); t.after(f.close);
  const signup = await f.call("/auth/signup", "POST", { email: "flow@example.com", password: "a long safe password 123!" }, "anonymous", { Origin: "http://127.0.0.1:8787", "CF-Connecting-IP": "192.0.2.1" });
  assert.equal(signup.status, 200);
  const clientId = randomToken(), redirect = 'https://client.example/callback?note=</script><script>bad()</script>';
  await f.env.DB.prepare("INSERT INTO oauth_clients VALUES(?,?,?,?)").bind(clientId, "Test Agent", JSON.stringify([redirect]), Math.floor(Date.now() / 1000)).run();
  const url = new URL(origin + "/oauth/authorize");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", code_challenge_method: "S256", code_challenge: "A".repeat(43) }).toString();
  const page = await handle(new Request(url), f.env);
  const csrf = (await page.text()).match(/name="csrf" value="([^"]+)"/)![1];
  const cookie = page.headers.getSetCookie()[0].split(";")[0];
  assert.match(page.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax;.*Secure/);
  const body = new URLSearchParams({ csrf, email: "flow@example.com", password: "a long safe password 123!" });
  const otherBrowser = await handle(new Request(origin + "/oauth/authorize", { method: "POST", headers: { Cookie: "docsync_oauth=" + randomToken() }, body }), f.env);
  assert.equal(otherBrowser.status, 403);
  const approved = await handle(new Request(origin + "/oauth/authorize", { method: "POST", headers: { Cookie: cookie, "CF-Connecting-IP": "192.0.2.2" }, body }), f.env);
  assert.equal(approved.status, 302);
  assert.ok(!(await approved.text()).includes("<script>"));
  const ipLimit = await f.env.DB.prepare("SELECT attempts FROM login_limits WHERE key=?").bind(await hash("password:192.0.2.2")).first<{ attempts: number }>();
  assert.equal(ipLimit?.attempts, 1);
  assert.ok(approved.headers.getSetCookie().some(cookie => cookie.startsWith("docsync_oauth=;") && cookie.includes("Max-Age=0")));
  const replay = await handle(new Request(origin + "/oauth/authorize", { method: "POST", headers: { Cookie: cookie }, body }), f.env);
  assert.equal(replay.status, 403);
});

test("credential guessing and client registration are limited per IP", async t => {
  const f = await fixture(); t.after(f.close);
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await handle(new Request(origin + "/oauth/register", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.3" }, body: JSON.stringify({ redirect_uris: ["https://client.example/callback"] }) }), f.env);
    assert.equal(response.status, 201);
  }
  const limited = await handle(new Request(origin + "/oauth/register", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.3" }, body: JSON.stringify({ redirect_uris: ["https://client.example/callback"] }) }), f.env);
  assert.equal(limited.status, 429);
});

test("public bundles can be cached while sensitive responses remain private", async t => {
  const f = await fixture(); t.after(f.close);
  const asset = await handle(new Request(origin + "/assets/index-12345678.js"), f.env);
  assert.equal(asset.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.equal(asset.headers.get("Strict-Transport-Security"), "max-age=31536000");
  const session = await handle(new Request(origin + "/api/session"), f.env);
  assert.equal(session.status, 401);
  assert.equal(session.headers.get("Cache-Control"), "no-store");
});
