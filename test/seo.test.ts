import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { fixture } from "./helpers.ts";
import { handle } from "../src/worker.ts";

async function site() {
  const f = await fixture();
  const root = resolve("dist/public");
  f.env.ASSETS = { fetch: async request => {
    const path = resolve(root, "." + new URL(request.url).pathname);
    const file = path.startsWith(root + "/") && existsSync(path) && statSync(path).isFile() ? path : join(root, "index.html");
    return new Response(readFileSync(file), { headers: { "Content-Type": file.endsWith(".html") ? "text/html" : file.endsWith(".png") ? "image/png" : "text/plain", "ETag": '"original-shell"', "Content-Length": "1" } });
  } };
  return { ...f, request: (path: string, method = "GET", origin = "https://docs.example") => handle(new Request(origin + path, { method }), f.env) };
}

test("public pages ship visible content, unique metadata, canonical URLs and structured data without JavaScript", async t => {
  const f = await site(); t.after(f.close);
  for (const [path, heading] of [["/", "Less busywork."], ["/templates", "Choose your starting point"]]) {
    const response = await f.request(path + "?utm_source=test");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Robots-Tag"), null);
    assert.equal(response.headers.get("ETag"), null);
    assert.equal(response.headers.get("Content-Length"), null);
    assert.ok(response.headers.get("Content-Security-Policy")?.includes("script-src 'self'"));
    const html = await response.text();
    assert.ok(html.includes(heading));
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.equal((html.match(/<title>/g) || []).length, 1);
    assert.ok(html.includes(`rel="canonical" href="https://docs.example${path}"`));
    assert.ok(html.includes('property="og:image" content="https://docs.example/social-card.png"'));
    assert.ok(html.includes('name="description"'));
    const structured = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]);
    assert.equal(structured.url, "https://docs.example" + path);
    assert.equal(structured["@type"], path === "/" ? "SoftwareApplication" : "CollectionPage");
    assert.ok(!html.includes("utm_source"));
    const head = await f.request(path, "HEAD");
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
  }
  assert.ok((await (await f.request("/", "GET", "https://another.example")).text()).includes('href="https://another.example/"'));
});

test("sitemap advertises public pages only, robots exposes it, and aliases redirect", async t => {
  const f = await site(); t.after(f.close);
  const sitemap = await f.request("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("Content-Type")!, /application\/xml/);
  const xml = await sitemap.text();
  assert.deepEqual([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]), ["https://docs.example/", "https://docs.example/templates"]);
  const robots = await f.request("/robots.txt");
  assert.match(await robots.text(), /Sitemap: https:\/\/docs.example\/sitemap.xml/);
  for (const [path, destination] of [["/index.html", "/"], ["/templates/", "/templates"], ["/templates/index.html", "/templates"]]) {
    const response = await f.request(path);
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("Location"), "https://docs.example" + destination);
  }
});

test("workspace and shared links remain noindex, and unknown URLs are real 404s", async t => {
  const f = await site(); t.after(f.close);
  for (const path of ["/login", "/signup", "/connect", "/share/" + "a".repeat(64), "/documents/12345678-1234-1234-1234-123456789abc/preview"]) {
    const response = await f.request(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const html = await response.text();
    assert.ok(html.includes('name="robots" content="noindex, nofollow"'));
    assert.ok(!html.includes("Less busywork."));
    assert.ok(!html.includes('rel="canonical"'));
    assert.ok(!html.includes("application/ld+json"));
  }
  assert.equal((await f.request("/api/session")).headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal((await f.request("/not-a-page")).status, 404);
  assert.equal((await f.request("/share/not-a-token")).status, 404);
  const social = await f.request("/social-card.png");
  assert.equal(social.status, 200);
  assert.equal(social.headers.get("Content-Type"), "image/png");
  assert.equal(social.headers.get("X-Robots-Tag"), null);
  assert.ok((await social.arrayBuffer()).byteLength > 1000);
});
