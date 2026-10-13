import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.ts";
import { handle } from "../src/worker.ts";

test("OAuth sign-in retry gets a fresh CSRF token bound to the same request", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const origin = "http://127.0.0.1:8787";
  const signup = await f.call("/auth/signup", "POST", { email: "oauth@example.com", password: "a long safe password 123!" }, "anonymous", { Origin: origin });
  assert.equal(signup.status, 200);

  await f.env.DB.prepare("INSERT INTO oauth_clients VALUES(?,?,?,?)")
    .bind("test-client", "Test Agent", JSON.stringify(["http://localhost/callback"]), Math.floor(Date.now() / 1000)).run();
  const authorizeUrl = new URL(`${origin}/oauth/authorize`);
  authorizeUrl.search = new URLSearchParams({ client_id: "test-client", redirect_uri: "http://localhost/callback", response_type: "code", code_challenge_method: "S256", code_challenge: "A".repeat(43), state: "test-state" }).toString();
  const firstPage = await handle(new Request(authorizeUrl), f.env);
  assert.equal(firstPage?.status, 200);
  const firstHtml = await firstPage!.text();
  const firstCsrf = firstHtml.match(/name="csrf" value="([^"]+)"/)?.[1];
  assert.ok(firstCsrf);

  const wrong = new FormData();
  wrong.set("csrf", firstCsrf);
  wrong.set("email", "oauth@example.com");
  wrong.set("password", "incorrect long password");
  const retry = await handle(new Request(`${origin}/oauth/authorize`, { method: "POST", body: wrong }), f.env);
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
  const approved = await handle(new Request(`${origin}/oauth/authorize`, { method: "POST", body: correct }), f.env);
  assert.equal(approved?.status, 302);
  assert.match(approved!.headers.get("Location") || "", /code=/);
});
