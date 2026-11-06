import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.ts";
import { cleanCss, cleanHtml, validateContent, lintContent } from "../src/content.ts";
import { handle } from "../src/worker.ts";

test("document lists honor explicit formats and recognize only legacy slide classes", async (t) => {
  const f = await fixture(true);
  t.after(f.close);
  const cases = [
    { title: "Document using slide markup", format: "document", html: '<article class="slide"><h1>Document</h1></article>', expected: "document" },
    { title: "Explicit deck", format: "presentation", html: '<h1>Deck</h1>', expected: "presentation" },
    { title: "Legacy deck", html: '<article class="cover slide featured"><h1>Deck</h1></article>', expected: "presentation" },
    { title: "Mentioned slide", html: '<article class="slide-panel"><h1>A slide comparison</h1></article>', expected: "document" },
    { title: "Suffixed class", html: '<article class="demo-slide"><h1>Report</h1></article>', expected: "document" },
  ];
  for (const { expected, html, ...input } of cases) {
    assert.equal((await f.call("/documents", "POST", { ...input, sections: [{ id: "page", html, css: "" }] })).status, 201);
  }
  const list = await (await f.call("/documents")).json() as { title: string; format: string }[];
  for (const item of cases) assert.equal(list.find(row => row.title === item.title)?.format, item.expected, item.title);
});

test("explicit pages preserve order, sanitization and format through publishing", async (t) => {
  const f = await fixture(true);
  t.after(f.close);
  const pages = [
    { id: "cover", html: '<h1 onclick="bad()">Cover</h1>', css: "" },
    { id: "details", html: "<p>Second page</p>", css: "" },
  ];
  const response = await f.call("/documents", "POST", { title: "Paged report", pages });
  assert.equal(response.status, 201);
  const doc = await response.json() as { id: string; revision: number };
  const publication = await (await f.call(`/documents/${doc.id}/publish`, "POST", { expectedRevision: doc.revision })).json() as { url: string };
  const saved = await (await f.call(`/shared/${publication.url.split('/').at(-1)}`, "GET", undefined, "anonymous")).json() as ReturnType<typeof validateContent>;
  assert.equal(saved.format, "document");
  assert.deepEqual(saved.sections.map(page => page.id), ["cover", "details"]);
  assert.equal(saved.sections[0].html, "<h1>Cover</h1>");
  for (const invalid of [{ pages, sections: pages }, { sections: [] }, { pages: [pages[0], pages[0]] }]) {
    assert.throws(() => validateContent({ title: "Invalid", ...invalid }));
  }
  const pres = validateContent({ title: "Valid presentation with pages", format: "presentation", pages });
  assert.equal(pres.format, "presentation");
  assert.equal(pres.sections.length, 2);
});

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

test("slide keyframes survive sanitization while resource loading stays blocked", () => {
  const css = cleanCss('@keyframes enter{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}.reveal{animation:enter .5s ease}');
  assert.match(css, /@keyframes enter/);
  assert.match(css, /animation:enter/);
  for (const unsafe of ['@keyframes leak{to{background:url(https://example.invalid/leak)}}', '@import "https://example.invalid/style.css";']) assert.throws(() => cleanCss(unsafe));
});

test("library covers return only the first page without JavaScript and enforce account ownership", async t => {
  const f = await fixture(); t.after(f.close);
  const response = await f.call('/documents', 'POST', { title: 'Private deck', format: 'presentation', sections: [
    { id: 'cover', html: '<h1>Cover</h1>', css: 'h1{color:red}', js: 'window.secret=true' },
    { id: 'private-details', html: '<h1>Other page</h1>', css: '', js: '' },
  ] });
  assert.equal(response.status, 201);
  const doc = await response.json() as { id: string };
  const cover = await f.call(`/documents/${doc.id}/thumbnail`);
  assert.equal(cover.status, 200);
  assert.equal(cover.headers.get('Cache-Control'), 'no-store');
  const { mediaToken, ...thumbnail } = await cover.json() as any;
  assert.equal(typeof mediaToken, 'string');
  assert.deepEqual(thumbnail, { revision: 1, section: { id: 'cover', html: '<h1>Cover</h1>', css: 'h1{color:red}' } });
  assert.equal((await f.call(`/documents/${doc.id}/thumbnail`, 'GET', undefined, 'anonymous')).status, 401);
  await f.env.DB.prepare("INSERT INTO accounts(id,kind,created_at) VALUES('other','user',?)").bind(new Date().toISOString()).run();
  await f.env.DB.prepare("UPDATE documents SET account_id='other' WHERE id=?").bind(doc.id).run();
  assert.equal((await f.call(`/documents/${doc.id}/thumbnail`)).status, 404);
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
  assert.ok(!(await response.text()).includes("__name"));
  const root = await handle(new Request("http://127.0.0.1:8787/"), f.env);
  assert.ok(!(root.headers.get("Content-Security-Policy") || "").includes("script-src 'unsafe-inline'"));
});

test("lintContent identifies design quality issues", () => {
  const content = {
    title: "Lint test",
    sections: [
      {
        id: "bad-slide",
        html: "<p>" + "word ".repeat(130) + "</p>",
        css: "body { font-size: 11px; color: #111; background: #222; border-color: #333; outline-color: #444; fill: #555; stroke: #666; --c1: #777; --c2: #888; --c3: #999; }",
      },
      {
        id: "good-slide",
        html: "<h1>Clean heading</h1><p>Under sixty words here for ideal slide density.</p>",
        css: ".slide { font-size: 18px; color: #172033; background: #ffffff; }",
      },
    ],
  };
  const warnings = lintContent(content);
  assert.ok(warnings.some((w) => w.includes("bad-slide") && w.includes("words")));
  assert.ok(warnings.some((w) => w.includes("bad-slide") && w.includes("no heading")));
  assert.ok(warnings.some((w) => w.includes("bad-slide") && w.includes("small fonts")));
  assert.ok(warnings.some((w) => w.includes("bad-slide") && w.includes("colors")));
  assert.ok(!warnings.some((w) => w.includes("good-slide")));
});
