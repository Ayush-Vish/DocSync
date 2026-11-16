import { test } from "node:test";
import assert from "node:assert/strict";
import { exportOfflineHtml } from "../src/offline-export.ts";
import { artifactFrameHtml } from "../src/artifact-frame.ts";
import { maxMediaBytes } from "../src/media-config.ts";
import type { Content } from "../src/document.ts";

const mediaId = "11111111-1111-4111-8111-111111111111";
const sample = (html = "<h1>Offline report</h1>"): Content => ({ title: "Offline report", format: "document", sections: [{ id: "first", html, css: "h1{color:green}", js: "document.body.dataset.ready='true'" }] });
const payload = (html: string) => JSON.parse(html.match(/<script id="offline-data" type="application\/json">([\s\S]*?)<\/script>/)![1]);

test("offline HTML exports only content, sanitizes markup, and safely encodes script-closing text", async () => {
  const input = { ...sample('<h1 onclick="attack()">Report</h1><script>attack()</script>'), title: '</title><script>attack()</script>', mediaToken: "secret-sentinel", lockToken: "secret-sentinel", accountId: "secret-sentinel" };
  input.sections[0].js = 'window.value="</script><script>attack()</script>";';
  const result = await exportOfflineHtml(input, async () => { throw new Error("No network needed"); });
  const data = payload(result.html);
  assert.equal(data.sections[0].html, '<h1>Report</h1>');
  assert.equal(data.sections[0].js, input.sections[0].js);
  assert.equal(data.format, "document");
  assert.ok(!result.html.includes("secret-sentinel"));
  assert.equal((result.html.match(/<script\b/g) || []).length, 2);
  assert.ok(result.filename.endsWith(".html"));
  assert.ok(!result.filename.includes("/"));
  assert.match(result.html, /connect-src 'none'/);
  assert.ok(data.frame.includes('const embeddedMedia = true'));
  assert.ok(artifactFrameHtml().includes('const embeddedMedia = false'), "Hosted frames never accept embedded data URLs");
});

test("offline export infers legacy slide decks and embeds each authenticated media asset once", async () => {
  const input = sample(`<article class="slide"><img src="https://old.example/media/${mediaId}?access=expired" alt="Diagram"></article>`);
  delete input.format;
  input.sections.push({ ...input.sections[0], id: "second" });
  let calls = 0;
  const result = await exportOfflineHtml(input, async (path, init) => {
    calls++;
    assert.equal(path, `/media/${mediaId}`);
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.redirect, "error");
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } });
  });
  const data = payload(result.html);
  assert.equal(data.format, "presentation");
  assert.equal(calls, 1);
  assert.equal(data.media[`/media/${mediaId}`], "data:image/png;base64,AQID");
  assert.ok(!result.html.includes("access=expired"));
  assert.deepEqual(data.sections[1].media, [`/media/${mediaId}`]);
});

test("offline export excludes external resources instead of requesting them", async () => {
  let called = false;
  const result = await exportOfflineHtml(sample('<h1>Notes</h1><img src="https://external.example/tracker.png">'), async () => { called = true; throw new Error(); });
  assert.equal(called, false);
  assert.equal(payload(result.html).sections[0].html, '<h1>Notes</h1>');
  await assert.rejects(() => exportOfflineHtml({ ...sample(), sections: [{ id: "first", html: "<h1>Notes</h1>", css: '@import "https://external.example/style.css";' }] }), /disabled|unsupported/);
});

test("missing, mismatched, oversized, and interrupted media fail the entire export", async () => {
  const input = sample(`<img src="/media/${mediaId}">`);
  await assert.rejects(() => exportOfflineHtml(input, async () => new Response("forbidden", { status: 403 })), /403/);
  await assert.rejects(() => exportOfflineHtml(input, async () => new Response("video", { headers: { "Content-Type": "video/mp4" } })), /mismatched/);
  await assert.rejects(() => exportOfflineHtml(input, async () => new Response(new Uint8Array(maxMediaBytes + 1), { headers: { "Content-Type": "image/png" } })), /8 MiB/);
  await assert.rejects(() => exportOfflineHtml(input, async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("disconnected")); } }), { headers: { "Content-Type": "image/png" } })), /could not be read/);
});
