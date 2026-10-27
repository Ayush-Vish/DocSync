import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.ts";
import { cleanHtml, validateContent } from "../src/content.ts";
import { handle } from "../src/worker.ts";

test("JavaScript survives create, read, and published snapshots with a size limit", async (t) => {
  const f = await fixture(true);
  t.after(f.close);
  const content = { title: "Interactive chart", sections: [{ id: "chart", kind: "html", html: '<button type="button" id="increment">Add</button><output id="count">0</output>', css: "", js: 'document.getElementById("increment").onclick=()=>document.getElementById("count").textContent="1";' }] };
  const created = await f.call("/documents", "POST", content);
  assert.equal(created.status, 201);
  const document = await created.json() as { id: string; revision: number };
  const read = await (await f.call(`/documents/${document.id}`)).json() as typeof content;
  assert.equal(read.sections[0].js, content.sections[0].js);
  const publication = await (await f.call(`/documents/${document.id}/publish`, "POST", { expectedRevision: document.revision })).json() as { url: string };
  const shared = await (await f.call(`/shared/${publication.url.split("/").at(-1)}`, "GET", undefined, "anonymous")).json() as typeof content;
  assert.equal(shared.sections[0].js, content.sections[0].js);
  assert.throws(() => validateContent({ ...content, sections: [{ ...content.sections[0], js: "x".repeat(50_001) }] }));
});

test("controls survive sanitization without executable HTML attributes or uploads", () => {
  assert.equal(cleanHtml('<button type="button" onclick="bad()">Go</button><input type="file" onchange="bad()"><canvas width="300" height="200"></canvas>'), '<button type="button">Go</button><input type="text"><canvas width="300" height="200"></canvas>');
});

test("scripted frame applies response sandbox and inline-only code policy", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const response = await handle(new Request("http://127.0.0.1:8787/artifact-frame"), f.env);
  assert.equal(response.status, 200);
  const policy = response.headers.get("Content-Security-Policy") || "";
  assert.ok(policy.includes("sandbox allow-scripts"));
  assert.ok(policy.includes("script-src 'unsafe-inline';"));
  assert.ok(policy.includes("connect-src 'none'"));
  assert.ok(policy.includes("frame-ancestors 'self'"));
  assert.ok(!policy.includes("allow-same-origin"));
  const root = await handle(new Request("http://127.0.0.1:8787/"), f.env);
  assert.ok(!(root.headers.get("Content-Security-Policy") || "").includes("script-src 'unsafe-inline'"));
});
