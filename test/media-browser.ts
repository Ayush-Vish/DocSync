import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import puppeteer, { type Page } from "puppeteer-core";
import { fixture } from "./helpers.ts";
import { hash, randomToken } from "../src/auth.ts";

const { default: worker } = await import(new URL("../dist/worker.mjs", import.meta.url).href);
const f = await fixture(true), directory = await mkdtemp(join(tmpdir(), "docsync-media-browser-"));
const publicRoot = resolve("dist/public");
f.env.ASSETS = { fetch: async request => {
  const path = new URL(request.url).pathname;
  const candidate = resolve(publicRoot, "." + path);
  let bytes: Buffer;
  try { if (!candidate.startsWith(publicRoot + "/")) throw Error(); bytes = await readFile(candidate); }
  catch { bytes = await readFile(join(publicRoot, "index.html")); }
  return new Response(new Uint8Array(bytes).buffer, { headers: { "Content-Type": path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html" } });
} };
const server = createServer(async (request, response) => {
  try {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk);
    const method = request.method || "GET";
    const result = await worker.fetch(new Request(`http://${request.headers.host}${request.url}`, { method, headers: request.headers as Record<string, string>, ...(["GET", "HEAD"].includes(method) ? {} : { body: Buffer.concat(chunks) }) }), f.env);
    response.setHeader("Set-Cookie", result.headers.getSetCookie());
    response.writeHead(result.status, Object.fromEntries([...result.headers].filter(([key]) => key !== "set-cookie")));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch { response.writeHead(500); response.end(); }
});
await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1000 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(String(error)));
  await page.goto(origin + "/signup");
  const token = await page.evaluate(async () => {
    const signup = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "media@example.com", password: "a long secure password 123!" }) });
    if (!signup.ok) throw Error(await signup.text());
    return (await (await fetch("/api/agent-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowPublishing: true }) })).json()).token as string;
  });
  const api = async (path: string, method = "GET", data?: unknown) => {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, "X-DocSync-Client": "Codex", ...(data === undefined ? {} : { "Content-Type": "application/json" }) }, body: data === undefined ? undefined : JSON.stringify(data) });
    const result = await response.json() as any; assert.ok(response.ok, JSON.stringify(result)); return result;
  };
  const click = async (text: string) => {
    await page.waitForFunction(text => [...document.querySelectorAll<HTMLButtonElement>("button")].some(button => button.textContent?.trim() === text && !button.disabled), {}, text);
    await page.evaluate(text => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === text && !button.disabled)!.click(), text);
  };
  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 160;
    const context = canvas.getContext("2d")!; context.fillStyle = "#4f46e5"; context.fillRect(0, 0, 320, 160); context.fillStyle = "white"; context.font = "24px sans-serif"; context.fillText("Uploaded media", 50, 88);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const pngPath = join(directory, "image.png"); await writeFile(pngPath, Buffer.from(pngBase64, "base64"));
  const doc = await api("/documents", "POST", { title: "Media report", format: "document", sections: [{ id: "intro", kind: "text", html: "<h1>Media report</h1><p>Keep this text.</p>", css: "" }] });
  const member = randomToken();
  await f.env.DB.prepare("INSERT INTO accounts(id,kind,email,created_at) VALUES('member','user','colleague@example.com',?)").bind(new Date().toISOString()).run();
  await f.env.DB.prepare("INSERT INTO account_credentials VALUES('member',?,0)").bind(await hash(member)).run();
  await f.env.DB.prepare("INSERT INTO document_members VALUES(?,'member','editor')").bind(doc.id).run();
  await fetch(`${origin}/api/documents/${doc.id}`, { headers: { Authorization: `Bearer ${member}`, "X-DocSync-Client": "Claude%20Code" } });
  await page.goto(`${origin}/documents/${doc.id}`, { waitUntil: "networkidle0" });
  await page.waitForSelector('.edit-lock-status[data-editing="true"]');
  await page.click(".collaborator-presence summary");
  await page.waitForFunction(() => document.querySelector(".collaborator-presence-list")?.textContent?.includes("Anthropic"));
  const presence = await page.$eval(".collaborator-presence-list", node => node.textContent || "");
  for (const label of ["Codex", "OpenAI", "Claude Code", "Anthropic", "colleague@example.com"]) assert.ok(presence.includes(label), label);
  assert.equal(await page.$$eval(".collaborator-presence .agent-identity svg", nodes => nodes.length), 2);
  await page.screenshot({ path: "/tmp/docsync-collaborators-media.png" });
  await page.click(".collaborator-presence summary");
  const picker = await page.$('input[aria-label="Upload page media"]'); assert.ok(picker); await picker.uploadFile(pngPath);
  await page.waitForSelector('input[aria-label="Uploaded media URL"]');
  assert.match(await page.$eval('input[aria-label="Uploaded media URL"]', node => (node as HTMLInputElement).value), /\/media\//);
  await click("Insert into HTML page");
  await click("Save");
  await page.waitForFunction(() => document.querySelector(".document-actions")?.textContent?.includes("Saved · v2"));
  const saved = await api(`/documents/${doc.id}`); assert.equal(saved.sections[0].kind, "html"); assert.match(saved.sections[0].html, /Keep this text/); assert.match(saved.sections[0].html, /<img/);
  const exported = await page.evaluate(async () => {
    let captured!: Blob;
    const create = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
    try {
      URL.createObjectURL = blob => { captured = blob as Blob; return "blob:docsync-test-export"; };
      HTMLAnchorElement.prototype.click = () => {};
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Download")!.click();
    } finally { URL.createObjectURL = create; HTMLAnchorElement.prototype.click = click; }
    return JSON.parse(await captured.text());
  });
  assert.equal(exported.mediaToken, undefined, "Draft downloads never contain temporary media credentials");
  assert.equal(exported.id, doc.id); assert.match(exported.sections[0].html, /<img/);
  await click("Stop editing");
  const upload = async (bytes: Buffer, type: string, filename: string) => {
    const response = await fetch(`${origin}/api/documents/${doc.id}/media`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": type, "X-File-Name": filename }, body: new Uint8Array(bytes).buffer });
    const result = await response.json() as any; assert.equal(response.status, 201, JSON.stringify(result)); return result;
  };
  const animatedGif = "R0lGODlhIAAgAIEAACLFXgAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAGQAAACwAAAAAIAAgAAAINQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJUmRAACH5BAEZAAEALAAAAAAgACAAgU9G5QAAAAAAAAAAAAg1AAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWLGDNq3Mixo8ePIEOKHEmypMmTKFOqXMlSZEAAOw==";
  const gif = await upload(Buffer.from(animatedGif, "base64"), "image/gif", "animation.gif");
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
  const video = await upload(Buffer.from(webm, "base64"), "video/webm", "clip.webm");
  const sections = [saved.sections[0], { id: "animation", kind: "html", html: `<h1>GIF animation</h1>${gif.html}`, css: "img{width:160px;height:160px}", js: "document.body.dataset.ready='true'" }, { id: "video", kind: "html", html: `<h1>Video playback</h1>${video.html}`, css: "video{width:480px}", js: "document.body.dataset.ready='true'" }, { id: "closing", kind: "html", html: "<h1>Next steps</h1>", css: "" }];
  const update = async (format: string, pages: typeof sections) => {
    const lease = await api(`/documents/${doc.id}/lock`, "POST", {}), current = await api(`/documents/${doc.id}`);
    const result = await api(`/documents/${doc.id}`, "PUT", { title: current.title, format, sections: pages, expectedRevision: current.revision, lockToken: lease.lockToken });
    await api(`/documents/${doc.id}/lock`, "DELETE", { lockToken: lease.lockToken }); return result;
  };
  const updated = await update("document", sections);
  const publicDoc = await api(`/documents/${doc.id}/publish`, "POST", { expectedRevision: updated.revision });
  const publicPage = await browser.newPage(); await publicPage.setViewport({ width: 1280, height: 900 });
  await publicPage.bringToFront();
  await publicPage.goto(publicDoc.url, { waitUntil: "networkidle0" });
  assert.equal(await publicPage.$(".collaborator-presence"), null, "Public readers see no collaborator identities");
  const imageLoaded = async (page: Page, selector: string, width: number) => {
    const iframe = await page.waitForSelector(selector); const frame = await iframe!.contentFrame(); assert.ok(frame);
    await frame.waitForFunction(width => { const image = document.querySelector("img"); return image?.complete && image.naturalWidth === width; }, {}, width); return frame;
  };
  await imageLoaded(publicPage, '[aria-label="Page 1"] iframe', 320);
  await publicPage.click('button[aria-label="Next page"]');
  await imageLoaded(publicPage, '[aria-label="Page 2"] iframe', 32);
  await publicPage.click('button[aria-label="Next page"]');
  const videoLoaded = async (page: Page, selector: string) => {
    const frame = await (await page.waitForSelector(selector))!.contentFrame(); assert.ok(frame);
    await frame.waitForFunction(() => (document.querySelector("video")?.readyState || 0) >= 1);
    await frame.evaluate(async () => { const video = document.querySelector("video")!; video.muted = true; await video.play(); });
    await frame.waitForFunction(() => (document.querySelector("video")?.currentTime || 0) > .05);
    await frame.evaluate(() => { const video = document.querySelector("video")!; video.pause(); video.currentTime = .2; }); return frame;
  };
  await videoLoaded(publicPage, '[aria-label="Page 3"] iframe');
  console.log("Media reader: PNG, animated GIF, video playback and seeking passed.");
  await publicPage.screenshot({ path: "/tmp/docsync-document-video.png" });
  // Covers use the script-free static renderer with the same protected media.
  await page.bringToFront();
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.waitForSelector(".document-cover");
  await page.$eval(".document-cover", node => node.scrollIntoView());
  await imageLoaded(page, ".document-cover iframe", 320);
  console.log("Media covers: protected image passed in script-free thumbnail.");
  const slideSections = sections.map(section => ({ ...section, html: `<article class="slide">${section.html}</article>`, css: section.css + ".slide{padding:56px;background:#f8fafc}img{max-height:420px}video{width:720px}" }));
  const deck = await update("presentation", slideSections);
  const publicDeck = await api(`/documents/${doc.id}/publish`, "POST", { expectedRevision: deck.revision });
  await publicPage.bringToFront();
  await publicPage.goto(publicDeck.url + "#present", { waitUntil: "networkidle0" });
  await imageLoaded(publicPage, '.presentation-canvas[aria-label="Slide 1"] iframe', 320);
  await publicPage.click('button[aria-label="Next slide"]'); await imageLoaded(publicPage, '.presentation-canvas[aria-label="Slide 2"] iframe', 32);
  await publicPage.click('button[aria-label="Next slide"]');
  const videoFrame = await videoLoaded(publicPage, '.presentation-canvas[aria-label="Slide 3"] iframe');
  await videoFrame.$eval("video", video => video.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await publicPage.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  assert.equal(await publicPage.$eval(".presentation-counter", node => node.textContent), "Slide 3 of 4", "Video controls must not advance to the next slide");
  await publicPage.screenshot({ path: "/tmp/docsync-presentation-video.png" });
  await page.bringToFront();
  await page.goto(`${origin}/documents/${doc.id}`, { waitUntil: "networkidle0" });
  await page.waitForSelector('.edit-lock-status[data-editing="true"]');
  const slidePicker = await page.$('input[aria-label="Upload page media"]'); assert.ok(slidePicker); await slidePicker.uploadFile(pngPath);
  await page.waitForSelector('input[aria-label="Uploaded media URL"]'); await click("Insert into page"); await click("Save");
  await page.waitForFunction(() => !document.querySelector(".document-actions")?.textContent?.includes("Unsaved changes"));
  const inserted = await api(`/documents/${doc.id}`); assert.equal((inserted.sections[0].html.match(/<img/g) || []).length, 2); assert.match(inserted.sections[0].html, /<img[^>]+><\/article>$/);
  assert.deepEqual(errors, []);
  console.log("Media browser acceptance passed: document/PPT uploads and insertion, text preservation, collaborator companies/icons, static covers, sandbox PNG/animated GIF/video playback and seeking, public privacy, video controls.");
} finally {
  await browser.close(); await new Promise<void>(done => server.close(() => done())); f.close(); await rm(directory, { recursive: true, force: true });
}
