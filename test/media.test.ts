import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture, sample } from "./helpers.ts";
import { handle } from "../src/worker.ts";
import { mediaGrant } from "../src/media.ts";
import { signature } from "../src/auth.ts";
import { cleanHtml } from "../src/content.ts";
import { readMediaFile } from "../src/local-media.ts";
import { fileMediaBucket } from "../scripts/media-store.ts";
import { maxMediaBytes } from "../src/media-config.ts";

const origin = "http://127.0.0.1:8787";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==", "base64");
const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const video = Buffer.from("00000018667479706D703432000000006D70343269736F6D", "hex");
type F = Awaited<ReturnType<typeof fixture>>;
function upload(f: F, id: string, bytes: Uint8Array = png, type = "image/png", name = "image.png", token = f.agentToken) {
  return handle(new Request(`${origin}/api/documents/${id}/media`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": type, "X-File-Name": encodeURIComponent(name) }, body: new Uint8Array(bytes).buffer }), f.env);
}
function read(f: F, src: string, token?: string, headers: Record<string, string> = {}, method = "GET") {
  return handle(new Request(`${origin}${src}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } }), f.env);
}
async function draft(f: F) { return await (await f.call("/documents", "POST", sample())).json() as any; }
async function save(f: F, doc: any, html: string, kind = "html") {
  const lease = await (await f.call(`/documents/${doc.id}/lock`, "POST", {})).json() as any;
  const response = await f.call(`/documents/${doc.id}`, "PUT", { ...sample(), sections: [{ id: "intro", kind, html, css: "" }], expectedRevision: doc.revision, lockToken: lease.lockToken });
  await f.call(`/documents/${doc.id}/lock`, "DELETE", { lockToken: lease.lockToken });
  return response;
}

test("uploads return reusable links, deduplicate per document and preserve revision/lease state", async t => {
  const f = await fixture(); t.after(f.close); const doc = await draft(f);
  const response = await upload(f, doc.id);
  assert.equal(response.status, 201);
  const asset = await response.json() as any;
  assert.equal(asset.url, origin + asset.src);
  assert.match(asset.html, /<img src="\/media\//);
  assert.equal((await (await upload(f, doc.id, png, "image/png", "renamed.png")).json() as any).id, asset.id);
  assert.equal((await f.env.DB.prepare("SELECT COUNT(*) n FROM media_assets").first<any>()).n, 1);
  const readDoc = await (await f.call(`/documents/${doc.id}`)).json() as any;
  assert.equal(readDoc.revision, 1);
  assert.equal((await (await f.call(`/documents/${doc.id}/lock`)).json() as any).lock, null);
  assert.equal((await save(f, doc, `<h1>Media</h1>${asset.html}`)).status, 200);
  const canonical = await read(f, asset.src, f.agentToken);
  assert.equal(canonical.status, 200);
  assert.equal(canonical.headers.get("Content-Type"), "image/png");
  assert.equal(canonical.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(Buffer.from(await canonical.arrayBuffer()), png);
  assert.equal((await read(f, asset.src)).status, 401);
  assert.equal((await read(f, asset.src + "?access=" + readDoc.mediaToken)).status, 200, "Opaque sandbox render uses a scoped grant without cookies");
});

test("media byte/type, filename and body limits reject invalid uploads before storage", async t => {
  const f = await fixture(); t.after(f.close); const doc = await draft(f);
  for (const [bytes, type, name, expected] of [
    [png, "image/jpeg", "image.jpg", 415], [Buffer.from("<svg></svg>"), "image/svg+xml", "image.svg", 415],
    [Buffer.from("<html>bad</html>"), "image/png", "image.png", 415], [png, "image/png", "../image.png", 400],
    [png, "image/png", "bad\nname.png", 400], [new Uint8Array(), "image/png", "empty.png", 413],
    [png, "image/png", "x".repeat(161), 400],
    [new Uint8Array(maxMediaBytes + 1), "image/png", "big.png", 413],
  ] as const) assert.equal((await upload(f, doc.id, bytes, type, name)).status, expected, name);
  assert.equal((await f.env.DB.prepare("SELECT COUNT(*) n FROM media_assets").first<any>()).n, 0);
  for (const [bytes, type, name] of [[gif, "image/gif", "motion.gif"], [video, "video/mp4", "clip.mp4"]] as const) {
    const response = await upload(f, doc.id, bytes, type, name); assert.equal(response.status, 201);
  }
  const unicodeName = "文".repeat(156) + ".png";
  const unicode = await upload(f, doc.id, png, "image/png", unicodeName);
  assert.equal(unicode.status, 201); assert.equal((await unicode.json() as any).filename, unicodeName);
});

test("only editors upload; private render grants recheck membership after revocation", async t => {
  const f = await fixture(); t.after(f.close); const doc = await draft(f);
  const signup = await f.call("/auth/signup", "POST", { email: "member@example.com", password: "a long secure password 123!" }, "anonymous", { Origin: origin });
  const cookie = signup.headers.getSetCookie()[0].split(";")[0];
  const accountId = (await f.env.DB.prepare("SELECT id FROM accounts WHERE email='member@example.com'").first<any>()).id;
  const token = (await (await f.call("/agent-token", "POST", { allowPublishing: false }, "anonymous", { Cookie: cookie, Origin: origin })).json() as any).token;
  assert.equal((await upload(f, doc.id, png, "image/png", "image.png", token)).status, 404);
  await f.env.DB.prepare("INSERT INTO document_members VALUES(?,?,?)").bind(doc.id, accountId, "viewer").run();
  assert.equal((await upload(f, doc.id, png, "image/png", "image.png", token)).status, 403);
  await f.env.DB.prepare("UPDATE document_members SET role='editor' WHERE account_id=?").bind(accountId).run();
  const asset = await (await upload(f, doc.id, png, "image/png", "image.png", token)).json() as any;
  const grant = await mediaGrant(f.env, doc.id, { accountId });
  assert.equal((await read(f, asset.src + "?access=" + grant)).status, 200);
  await f.env.DB.prepare("DELETE FROM document_members WHERE account_id=?").bind(accountId).run();
  assert.equal((await read(f, asset.src + "?access=" + grant)).status, 404);
});

test("HTML saves require document-owned matching media and HTML page mode", async t => {
  const f = await fixture(); t.after(f.close); const one = await draft(f), two = await draft(f);
  const asset = await (await upload(f, one.id)).json() as any;
  assert.equal((await save(f, two, asset.html)).status, 400);
  assert.equal((await save(f, one, asset.html, "text")).status, 400);
  assert.equal((await save(f, one, `<video src="${asset.src}"></video>`)).status, 400);
  assert.equal((await save(f, one, `<img src="/media/${crypto.randomUUID()}">`)).status, 400);
  const external = `<img src="https://outside.example/image.png"><img src="${asset.url}?access=never-save-tokens" onerror="bad()" srcset="https://outside.example/a.png 2x"><video src="https://outside.example/clip.mp4" autoplay></video>`;
  assert.equal(cleanHtml(external), `<img src="${asset.src}"><video controls=""></video>`);
  assert.equal((await save(f, one, `<img src="${asset.url}?access=old-token" alt="Example">`)).status, 200);
  const saved = await (await f.call(`/documents/${one.id}`)).json() as any;
  assert.equal(saved.sections[0].html, `<img src="${asset.src}" alt="Example">`);
});

test("public grants expose only published media; draft changes, rotation and revocation stay isolated", async t => {
  const f = await fixture(true); t.after(f.close); const doc = await draft(f);
  const image = await (await upload(f, doc.id)).json() as any;
  const unused = await (await upload(f, doc.id, gif, "image/gif", "draft.gif")).json() as any;
  const saved = await (await save(f, doc, image.html)).json() as any;
  const publication = await (await f.call(`/documents/${doc.id}/publish`, "POST", { expectedRevision: saved.revision })).json() as any;
  const shared = await (await f.call("/shared/" + publication.url.split("/").at(-1), "GET", undefined, "anonymous")).json() as any;
  assert.equal(shared.collaborators, undefined);
  const query = "?access=" + shared.mediaToken;
  assert.equal((await read(f, image.src + query)).status, 200);
  assert.equal((await read(f, unused.src + query)).status, 403);
  assert.equal((await save(f, saved, unused.html)).status, 200);
  assert.equal((await read(f, unused.src + query)).status, 403, "New draft media is not exposed by an older publication");
  await f.call(`/documents/${doc.id}/publish`, "POST", { expectedRevision: 3 });
  assert.equal((await read(f, image.src + query)).status, 403);
  const next = await mediaGrant(f.env, doc.id, { publication: (await f.env.DB.prepare("SELECT token_hash FROM publications WHERE document_id=?").bind(doc.id).first<any>()).token_hash, revision: 3 });
  assert.equal((await read(f, unused.src + "?access=" + next)).status, 200);
  await f.call(`/documents/${doc.id}/publish`, "DELETE");
  assert.equal((await read(f, unused.src + "?access=" + next)).status, 403);
});

test("grants reject tampering, expiry and use against another document", async t => {
  const f = await fixture(); t.after(f.close); const one = await draft(f), two = await draft(f);
  const asset = await (await upload(f, one.id)).json() as any;
  const token = one.mediaToken as string;
  assert.equal((await read(f, asset.src + "?access=" + token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"))).status, 403);
  assert.equal((await read(f, asset.src + "?access=" + two.mediaToken)).status, 403);
  const payload = btoa(JSON.stringify({ documentId: one.id, accountId: "legacy", expires: Math.floor(Date.now() / 1000) - 1 })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const expired = `${payload}.${await signature(f.env.SESSION_SECRET, `media:${payload}`)}`;
  assert.equal((await read(f, asset.src + "?access=" + expired)).status, 403);
});

test("video gateway supports HEAD, byte ranges and invalid-range errors", async t => {
  const f = await fixture(); t.after(f.close); const doc = await draft(f);
  const asset = await (await upload(f, doc.id, video, "video/mp4", "clip.mp4")).json() as any;
  assert.match(asset.html, /controls playsinline/);
  const head = await read(f, asset.src, f.agentToken, {}, "HEAD");
  assert.equal(head.status, 200); assert.equal(head.headers.get("Content-Length"), String(video.length)); assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal((await read(f, asset.src, f.agentToken, { Range: "bytes=0-1" }, "HEAD")).status, 200, "HEAD ignores Range");
  for (const [range, start, end] of [["bytes=2-5", 2, 5], ["bytes=10-", 10, video.length - 1], ["bytes=-4", video.length - 4, video.length - 1]] as const) {
    const response = await read(f, asset.src, f.agentToken, { Range: range });
    assert.equal(response.status, 206); assert.equal(response.headers.get("Content-Range"), `bytes ${start}-${end}/${video.length}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), video.subarray(start, end + 1));
  }
  for (const range of ["bytes=999-", "bytes=5-2", "bytes=-0", "bytes=-", "bytes=0-1,5-6"]) {
    const response = await read(f, asset.src, f.agentToken, { Range: range }); assert.equal(response.status, 416); assert.equal(response.headers.get("Content-Range"), `bytes */${video.length}`);
  }
});

test("atomic quotas include in-flight uploads and storage failures never expose media", async t => {
  const f = await fixture(); t.after(f.close); const doc = await draft(f);
  for (let i = 0; i < 49; i++) await f.env.DB.prepare("INSERT INTO media_assets VALUES(?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), doc.id, "legacy", "prior.png", "image/png", 1, `seed${i}`, `seed/${i}`, "pending", new Date().toISOString()).run();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const put = f.env.MEDIA!.put.bind(f.env.MEDIA);
  t.mock.method(f.env.MEDIA!, "put", async (...args: Parameters<typeof put>) => { await pending; return put(...args); });
  const uploads = [upload(f, doc.id), upload(f, doc.id, gif, "image/gif", "image.gif")];
  await new Promise(resolve => setImmediate(resolve)); release();
  const responses = await Promise.all(uploads);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 413]);
  assert.equal((await f.env.DB.prepare("SELECT COUNT(*) n FROM media_assets").first<any>()).n, 50);
  const two = await draft(f);
  t.mock.method(f.env.MEDIA!, "put", async () => { throw new Error("storage unavailable"); });
  assert.equal((await upload(f, two.id)).status, 503);
  assert.equal((await f.env.DB.prepare("SELECT COUNT(*) n FROM media_assets WHERE document_id=?").bind(two.id).first<any>()).n, 0);
});

test("byte quota and revocation during upload fail safely at the write boundary", async t => {
  const f = await fixture(); t.after(f.close); const doc = await draft(f);
  await f.env.DB.prepare("INSERT INTO media_assets VALUES(?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), doc.id, "legacy", "prior.mp4", "video/mp4", 104857600, "quota", "quota", "pending", new Date().toISOString()).run();
  assert.equal((await upload(f, doc.id)).status, 413);
  await f.env.DB.prepare("DELETE FROM media_assets").run();
  await f.env.DB.prepare("INSERT INTO accounts(id,kind,created_at) VALUES('new-owner','user',?)").bind(new Date().toISOString()).run();
  t.mock.method(f.env.MEDIA!, "put", async () => { await f.env.DB.prepare("UPDATE documents SET account_id='new-owner' WHERE id=?").bind(doc.id).run(); });
  assert.equal((await upload(f, doc.id)).status, 403);
  assert.equal((await f.env.DB.prepare("SELECT COUNT(*) n FROM media_assets").first<any>()).n, 0);
});

test("local file reader and media store preserve bytes, ranges and size/path checks", async t => {
  const dir = await mkdtemp(join(tmpdir(), "docsync-media-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "image.png"); await writeFile(path, png);
  assert.deepEqual(await readMediaFile(path), { bytes: new Uint8Array(png), filename: "image.png" });
  await assert.rejects(readMediaFile("relative.png"), /absolute/);
  await assert.rejects(readMediaFile(dir), /regular media/);
  const large = join(dir, "large.png"); await writeFile(large, new Uint8Array(maxMediaBytes + 1));
  await assert.rejects(readMediaFile(large), /1 byte to 8 MiB/);
  const store = fileMediaBucket(join(dir, "store")); await store.put("doc/image", png, { httpMetadata: { contentType: "image/png" } });
  assert.deepEqual(Buffer.from(await new Response((await store.get("doc/image", { range: { offset: 2, length: 3 } }))!.body).arrayBuffer()), png.subarray(2, 5));
  await assert.rejects(store.put("../../outside", png, { httpMetadata: { contentType: "image/png" } }), /Invalid media key/);
  await store.delete("doc/image"); assert.equal(await store.get("doc/image"), null);
});
