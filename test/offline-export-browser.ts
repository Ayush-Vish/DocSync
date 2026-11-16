import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import puppeteer from "puppeteer-core";
import { fixture, sample } from "./helpers.ts";

const { default: worker } = await import(new URL("../dist/worker.mjs", import.meta.url).href);
const f = await fixture(), directory = await mkdtemp(join(tmpdir(), "docsync-offline-")), root = resolve("dist/public");
f.env.ASSETS = { fetch: async request => {
  const path = new URL(request.url).pathname, candidate = resolve(root, "." + path);
  let bytes: Buffer;
  try { if (!candidate.startsWith(root + "/")) throw Error(); bytes = await readFile(candidate); }
  catch { bytes = await readFile(join(root, "index.html")); }
  return new Response(new Uint8Array(bytes).buffer, { headers: { "Content-Type": path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html" } });
} };
let exfiltration = 0;
const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.url?.startsWith("/exfil-offline")) exfiltration++;
    const chunks: Buffer[] = []; for await (const chunk of incoming) chunks.push(chunk);
    const method = incoming.method || "GET";
    const response = await worker.fetch(new Request(`http://${incoming.headers.host}${incoming.url}`, { method, headers: incoming.headers as Record<string, string>, ...(["GET", "HEAD"].includes(method) ? {} : { body: Buffer.concat(chunks) }) }), f.env);
    outgoing.setHeader("Set-Cookie", response.headers.getSetCookie());
    outgoing.writeHead(response.status, Object.fromEntries([...response.headers].filter(([key]) => key !== "set-cookie")));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end(); }
});
await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1000 });
  page.on("dialog", dialog => void dialog.accept());
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: directory });
  await page.goto(origin + "/login");
  assert.equal(await page.evaluate(async key => (await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) })).status, f.ownerKey), 200);
  const api = (path: string, method = "GET", data?: unknown) => page.evaluate(async ({ path, method, data }) => {
    const response = await fetch("/api" + path, { method, headers: data === undefined ? {} : { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
    const value = await response.json(); if (!response.ok) throw new Error(JSON.stringify(value)); return value;
  }, { path, method, data });
  const doc = await api("/documents", "POST", { ...sample("Saved export fixture"), format: "presentation" });
  const upload = (base64: string, mime: string, filename: string) => page.evaluate(async ({ id, base64, mime, filename }) => {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const response = await fetch(`/api/documents/${id}/media`, { method: "POST", headers: { "Content-Type": mime, "X-File-Name": filename }, body: bytes });
    const value = await response.json(); if (!response.ok) throw new Error(JSON.stringify(value)); return value;
  }, { id: doc.id, base64, mime, filename });
  const png = await upload("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==", "image/png", "image.png");
  const gif = await upload("R0lGODlhIAAgAIEAACLFXgAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAGQAAACwAAAAAIAAgAAAINQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJUmRAACH5BAEZAAEALAAAAAAgACAAgU9G5QAAAAAAAAAAAAg1AAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWLGDNq3Mixo8ePIEOKHEmypMmTKFOqXMlSZEAAOw==", "image/gif", "animation.gif");
  const webm = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 90;
    const context = canvas.getContext("2d")!, stream = canvas.captureStream(10), chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    const done = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
    recorder.ondataavailable = event => chunks.push(event.data); recorder.start();
    for (let i = 0; i < 12; i++) { context.fillStyle = i % 2 ? "#4f46e5" : "#22c55e"; context.fillRect(0, 0, 160, 90); await new Promise(resolve => setTimeout(resolve, 100)); }
    recorder.stop(); await done; stream.getTracks().forEach(track => track.stop());
    return btoa(String.fromCharCode(...new Uint8Array(await new Blob(chunks).arrayBuffer())));
  });
  const video = await upload(webm, "video/webm", "video.webm");
  const css = '.slide,.page{padding:48px;background:#f8fafc}h1{font:48px system-ui;animation:enter 1s both}p,button,input,output{font:20px system-ui}img{width:96px;height:96px}video{width:480px}@keyframes enter{from{opacity:.1;transform:translateY(16px)}to{opacity:1;transform:none}}';
  const js = `document.body.dataset.boot=String(Math.random());document.body.dataset.ready='true';document.addEventListener('DOMContentLoaded',()=>document.body.dataset.domReady='true');window.addEventListener('load',()=>document.body.dataset.loaded='true');try{parent.document.body.dataset.escaped='true'}catch{document.body.dataset.isolated='true'}fetch(${JSON.stringify(origin + "/exfil-offline")}).catch(()=>document.body.dataset.network='blocked');document.getElementById('increment')?.addEventListener('click',()=>document.getElementById('count').textContent=String(Number(document.getElementById('count').textContent)+1));`;
  const sections = [
    { id: "first", kind: "html", html: `<article class="slide"><h1>Offline export fixture</h1><p>Simulated interactive content.</p>${png.html}<button id="increment">Increment</button><output id="count">0</output><input id="note" type="text" value="Editable offline"></article>`, css, js },
    { id: "gif", kind: "html", html: `<article class="slide"><h1>Animated GIF fixture</h1>${gif.html}</article>`, css, js },
    { id: "video", kind: "html", html: `<article class="slide"><h1>Video fixture</h1>${video.html}</article>`, css, js },
  ];
  async function saveFormat(format: string) {
    const current = await api(`/documents/${doc.id}`), lease = await api(`/documents/${doc.id}/lock`, "POST", {});
    await api(`/documents/${doc.id}`, "PUT", { title: "Saved export fixture", format, sections: sections.map(section => ({ ...section, html: format === "document" ? section.html.replace('class="slide"', 'class="page"') : section.html })), expectedRevision: current.revision, lockToken: lease.lockToken });
    await api(`/documents/${doc.id}/lock`, "DELETE", { lockToken: lease.lockToken });
  }
  async function waitFile(filename: string) {
    const path = join(directory, filename);
    for (let i = 0; i < 100; i++) { try { if ((await stat(path)).size) return path; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error("Download did not finish: " + filename);
  }
  for (const format of ["presentation", "document"]) {
    await saveFormat(format);
    await page.goto(`${origin}/documents/${doc.id}${format === "document" ? "/preview" : ""}`, { waitUntil: "networkidle0" });
    if (format === "presentation") {
      await page.waitForSelector('.edit-lock-status[data-editing="true"]');
      await page.click('input[aria-label="Document title"]'); await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control"); await page.keyboard.type("Unsaved offline deck");
    }
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>("button")].some(button => button.textContent?.trim() === "Download HTML" && !button.disabled));
    await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Download HTML")!.click());
    const path = await waitFile(format === "presentation" ? "docsync-Unsaved-offline-deck.html" : "docsync-Saved-export-fixture.html");
    assert.equal((await api(`/documents/${doc.id}`)).title, "Saved export fixture", "Export never saves the draft or requires an edit mutation");
    const file = await readFile(path, "utf8"); assert.ok(!file.includes("?access=")); assert.ok(!file.includes('"mediaToken"'));
    const context = await browser.createBrowserContext(), offline = await context.newPage();
    await offline.setViewport({ width: 1440, height: 1000 }); await offline.setOfflineMode(true);
    await offline.goto(pathToFileURL(path).href);
    await offline.waitForFunction(() => document.querySelector("#counter")?.textContent?.endsWith("1 of 3"));
    const frame = async () => { const result = await (await offline.waitForSelector("#surface iframe"))!.contentFrame(); assert.ok(result); await result.waitForFunction(() => document.body.dataset.ready === "true"); return result; };
    let active = await frame();
    await active.waitForFunction(() => { const image = document.querySelector("img"); return image?.complete && image.naturalWidth === 1; });
    assert.equal(await active.$eval("body", node => node.dataset.isolated), "true");
    assert.equal(await active.$eval("body", node => node.dataset.domReady), "true");
    assert.equal(await active.$eval("body", node => node.dataset.loaded), "true");
    assert.equal(await offline.$eval("body", node => node.dataset.escaped), undefined);
    // Account for the slide's CSS scale when issuing a real pointer click.
    const button = await active.$eval("#increment", node => { const rect = node.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: innerWidth }; });
    const viewport = await offline.$eval("#surface iframe", node => { const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width }; });
    const scale = viewport.width / button.width;
    await offline.mouse.click(viewport.x + button.x * scale, viewport.y + button.y * scale);
    assert.equal(await active.$eval("#count", node => node.textContent), "1");
    await active.focus("#note"); await offline.keyboard.press("ArrowRight");
    assert.ok((await offline.$eval("#counter", node => node.textContent))?.endsWith("1 of 3"));
    const boot = await active.$eval("body", node => node.dataset.boot);
    await offline.click("#replay"); active = await frame();
    assert.notEqual(await active.$eval("body", node => node.dataset.boot), boot);
    assert.equal(await active.$eval("#count", node => node.textContent), "0");
    await active.focus("#increment"); await offline.keyboard.press("ArrowRight");
    await offline.waitForFunction(() => document.querySelector("#counter")?.textContent?.endsWith("2 of 3"));
    active = await frame();
    await active.waitForFunction(() => document.querySelector("img")?.naturalWidth === 32);
    assert.ok((await offline.$eval("#counter", node => node.textContent))?.endsWith("2 of 3"));
    await offline.click("#next"); active = await frame();
    await active.waitForFunction(() => (document.querySelector("video")?.readyState || 0) >= 1);
    await active.evaluate(async () => { const video = document.querySelector("video")!; video.muted = true; await video.play(); });
    await active.waitForFunction(() => (document.querySelector("video")?.currentTime || 0) > .05);
    await active.evaluate(() => { const video = document.querySelector("video")!; video.pause(); video.currentTime = .2; });
    await offline.click("#fullscreen");
    await offline.waitForFunction(() => Boolean(document.fullscreenElement || document.querySelector("#viewer-error")?.textContent));
    if (await offline.evaluate(() => Boolean(document.fullscreenElement))) {
      await offline.click("#fullscreen");
      await offline.waitForFunction(() => !document.fullscreenElement);
    }
    assert.equal(await offline.$$eval("#surface iframe", nodes => nodes.length), 1, "Only the active page runs scripts");
    await offline.setViewport({ width: 390, height: 844 });
    assert.ok(await offline.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await offline.screenshot({ path: `/tmp/docsync-offline-${format}.png` });
    await offline.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await offline.click("#previous"); active = await frame();
    assert.equal(await active.$eval("h1", node => getComputedStyle(node).animationName), "none");
    await context.close();
    if (format === "presentation") {
      await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Stop editing")!.click());
      await page.waitForFunction(async id => !(await (await fetch(`/api/documents/${id}/lock`)).json()).lock, {}, doc.id);
      await page.goto(origin, { waitUntil: "networkidle0" });
    }
  }
  assert.equal(exfiltration, 0);
  console.log("Offline HTML browser acceptance passed: built-in downloads without MCP, unsaved drafts, docs and slides, keyboard navigation, replay, isolated scripts, PNG/GIF/video playback, reduced motion, and mobile layout with networking disabled.");
} finally {
  await browser.close(); await new Promise<void>(done => server.close(() => done())); f.close(); await rm(directory, { recursive: true, force: true });
}
