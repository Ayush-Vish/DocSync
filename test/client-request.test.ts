import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../src/ui/api.ts";

test("failed mutations are not automatically repeated", async t => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => { attempts++; throw new TypeError("Network error"); });
  await assert.rejects(api("/documents", "POST", { title: "Draft" }), error => error instanceof ApiError && error.status === 0 && /may have reached the server/.test(error.message));
  assert.equal(attempts, 1);
});

test("request errors preserve status and handle invalid server responses", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: "Session expired" }), { status: 401 }));
  await assert.rejects(api("/session"), error => error instanceof ApiError && error.status === 401 && error.message === "Session expired");
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Gateway unavailable</html>", { status: 502 }));
  await assert.rejects(api("/documents"), error => error instanceof ApiError && error.status === 502 && /unreadable response/.test(error.message));
});

test("API requests restrict credentials and redirects to protect the session", async t => {
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "/api/documents");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    return new Response("[]");
  });
  assert.deepEqual(await api("/documents"), []);
});
