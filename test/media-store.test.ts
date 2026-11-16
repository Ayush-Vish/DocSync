import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaBucket } from "../src/media-store.ts";
import { handle } from "../src/worker.ts";
import { fixture, sample } from "./helpers.ts";
import type { Env } from "../src/platform.ts";

const config = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_STORAGE_BUCKET: "docsync-media",
  SUPABASE_SECRET_KEY: "sb_secret_test-only-key",
};
const base = `${config.SUPABASE_URL}/storage/v1/object/docsync-media`;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==", "base64");
const origin = "http://127.0.0.1:8787";

test("Supabase gateway preserves uploads, deduplication, authorization and range playback", async t => {
  const f = await fixture(); t.after(f.close);
  Object.assign(f.env, config);
  const files = new Map<string, Uint8Array>();
  const requests: Request[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    const request = new Request(input, init); requests.push(request);
    assert.equal(request.headers.get("apikey"), config.SUPABASE_SECRET_KEY);
    assert.equal(request.headers.get("Authorization"), null, "Secret API keys are not bearer JWTs");
    assert.equal(request.redirect, "manual");
    assert.equal(request.signal.aborted, false);
    assert.ok(request.url.startsWith(base + "/"));
    if (request.method === "POST") {
      assert.equal(request.headers.get("Content-Type"), "image/png");
      assert.equal(request.headers.get("x-upsert"), "false");
      files.set(request.url, new Uint8Array(await request.arrayBuffer()));
      return Response.json({ Key: request.url });
    }
    assert.equal(request.method, "GET");
    const bytes = files.get(request.url);
    if (!bytes) return Response.json({ code: "NoSuchKey" }, { status: 404 });
    const range = request.headers.get("Range")?.match(/^bytes=(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]), end = Number(range[2]);
      return new Response(bytes.slice(start, end + 1), { status: 206, headers: { "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${bytes.length}` } });
    }
    return new Response(bytes.slice(), { headers: { "Content-Length": String(bytes.length) } });
  });
  const doc = await (await f.call("/documents", "POST", sample())).json() as { id: string };
  const upload = () => handle(new Request(`${origin}/api/documents/${doc.id}/media`, {
    method: "POST", headers: { Authorization: `Bearer ${f.agentToken}`, "Content-Type": "image/png", "X-File-Name": "image.png" }, body: png,
  }), f.env);
  const response = await upload(); assert.equal(response.status, 201);
  const asset = await response.json() as { id: string; src: string };
  assert.equal(asset.src, `/media/${asset.id}`);
  assert.equal((await upload()).status, 201);
  assert.equal(requests.length, 1, "Duplicate bytes do not upload twice");
  assert.deepEqual(Buffer.from(files.get(`${base}/${doc.id}/${asset.id}`)!), png);
  const read = (headers: Record<string, string> = {}, method = "GET") => handle(new Request(origin + asset.src, { method, headers }), f.env);
  assert.equal((await read()).status, 401);
  assert.equal(requests.length, 1, "Unauthenticated reads never contact Supabase");
  const auth = { Authorization: `Bearer ${f.agentToken}` };
  const full = await read(auth);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), png);
  const partial = await read({ ...auth, Range: "bytes=2-5" });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("Content-Range"), `bytes 2-5/${png.length}`);
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()), png.subarray(2, 6));
  const count = requests.length;
  assert.equal((await read(auth, "HEAD")).status, 200);
  assert.equal(requests.length, count, "HEAD uses the already-authorized metadata");
  const record = await f.env.DB.prepare("SELECT status FROM media_assets WHERE id=?").bind(asset.id).first<{ status: string }>();
  assert.equal(record?.status, "ready");
  assert.ok(!JSON.stringify(asset).includes(config.SUPABASE_SECRET_KEY));
});

test("Supabase failures clean up uploads; failed cleanup retains the quota reservation", async t => {
  const f = await fixture(); t.after(f.close); Object.assign(f.env, config);
  const doc = await (await f.call("/documents", "POST", sample())).json() as { id: string };
  let cleanupFails = false, deletes = 0;
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    if (init.method === "DELETE") {
      deletes++;
      assert.equal(input, base);
      const body = JSON.parse(String(init.body));
      assert.match(body.prefixes[0], new RegExp(`^${doc.id}/[a-f0-9-]{36}$`));
      return Response.json(cleanupFails ? { error: "private provider details" } : [], { status: cleanupFails ? 500 : 200 });
    }
    return Response.json({ error: config.SUPABASE_SECRET_KEY }, { status: 403 });
  });
  const upload = () => handle(new Request(`${origin}/api/documents/${doc.id}/media`, {
    method: "POST", headers: { Authorization: `Bearer ${f.agentToken}`, "Content-Type": "image/png", "X-File-Name": "image.png" }, body: png,
  }), f.env);
  const failed = await upload(); assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes(config.SUPABASE_SECRET_KEY));
  assert.equal((await f.env.DB.prepare("SELECT COUNT(*) n FROM media_assets").first<{ n: number }>())?.n, 0);
  cleanupFails = true;
  assert.equal((await upload()).status, 503);
  assert.equal(deletes, 2);
  const pending = await f.env.DB.prepare("SELECT id,status FROM media_assets").first<{ id: string; status: string }>();
  assert.equal(pending?.status, "pending");
  assert.equal((await handle(new Request(`${origin}/media/${pending!.id}`, { headers: { Authorization: `Bearer ${f.agentToken}` } }), f.env)).status, 404);
});

test("Supabase handles missing files and rejects failed or ignored range requests", async t => {
  const f = await fixture(); t.after(f.close);
  const bucket = mediaBucket({ ...f.env, ...config })!;
  let response: () => Response = () => new Response(null, { status: 404 });
  t.mock.method(globalThis, "fetch", async () => response());
  assert.equal(await bucket.get("doc/file"), null);
  response = () => Response.json({ statusCode: "404", error: "not_found" }, { status: 400 });
  assert.equal(await bucket.get("doc/file"), null);
  response = () => Response.json({ code: "NoSuchKey" }, { status: 400 });
  assert.equal(await bucket.get("doc/file"), null);
  for (const status of [301, 302, 307, 308, 401, 403, 429, 500]) {
    response = () => Response.json({ error: "sensitive provider details" }, { status });
    await assert.rejects(bucket.get("doc/file"), { status: 503 });
  }
  response = () => new Response(png, { headers: { "Content-Length": String(png.length) } });
  await assert.rejects(bucket.get("doc/file", { range: { offset: 2, length: 4 } }), { status: 503 });
  response = () => new Response(png.subarray(2, 6), { status: 206, headers: { "Content-Length": "4", "Content-Range": `bytes 3-6/${png.length}` } });
  await assert.rejects(bucket.get("doc/file", { range: { offset: 2, length: 4 } }), { status: 503 });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("network unavailable"); });
  await assert.rejects(bucket.get("doc/file"), { status: 503 });
});

test("Supabase configuration fails closed while unconfigured development retains local storage", async t => {
  const f = await fixture(); t.after(f.close);
  assert.equal(mediaBucket(f.env), f.env.MEDIA);
  assert.equal(mediaBucket({ ...f.env, MEDIA: undefined }), undefined);
  const invalid: Partial<Env>[] = [
    { SUPABASE_URL: config.SUPABASE_URL },
    { ...config, SUPABASE_SECRET_KEY: "" },
    { ...config, SUPABASE_URL: "not a URL" },
    { ...config, SUPABASE_URL: "http://project.supabase.co" },
    { ...config, SUPABASE_URL: "https://user:password@project.supabase.co" },
    { ...config, SUPABASE_URL: "https://project.supabase.co/storage/v1" },
    { ...config, SUPABASE_URL: "https://project.supabase.co/?key=value" },
    { ...config, SUPABASE_STORAGE_BUCKET: "../other-bucket" },
    { ...config, SUPABASE_SECRET_KEY: "bad\nkey" },
  ];
  for (const value of invalid) assert.throws(() => mediaBucket({ ...f.env, ...value }), { status: 503 });
  const bucket = mediaBucket({ ...f.env, ...config })!;
  for (const key of ["../file", "doc/../file", "doc//file", "/file"]) {
    await assert.rejects(bucket.get(key), /Invalid media key/);
    await assert.rejects(bucket.delete(key), /Invalid media key/);
  }
});
