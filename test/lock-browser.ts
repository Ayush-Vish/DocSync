import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import puppeteer from "puppeteer-core";
import type { HTTPRequest, Page } from "puppeteer-core";
import { fixture, sample } from "./helpers.ts";
import { handle } from "../src/worker.ts";

const f = await fixture();
const root = resolve("dist/public");
f.env.ASSETS = { async fetch(request) {
  const candidate = resolve(root, "." + new URL(request.url).pathname);
  const file = candidate.startsWith(root + "/") && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, "index.html");
  return new Response(readFileSync(file), { headers: { "Content-Type": file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".svg") ? "image/svg+xml" : "text/html" } });
} };
const server = createServer(async (request, response) => {
  try {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk);
    const method = request.method || "GET";
    const result = await handle(new Request(`http://${request.headers.host}${request.url}`, { method, headers: request.headers as Record<string, string>, ...(["GET", "HEAD"].includes(method) ? {} : { body: Buffer.concat(chunks) }) }), f.env);
    response.setHeader("Set-Cookie", result.headers.getSetCookie());
    response.writeHead(result.status, Object.fromEntries([...result.headers].filter(([name]) => name !== "set-cookie")));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch { response.writeHead(500); response.end(); }
});
await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
const address = server.address(); assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
page.setDefaultTimeout(15_000);
page.on("dialog", dialog => void dialog.accept());
const errors: string[] = []; page.on("pageerror", error => errors.push(String(error)));
await page.setViewport({ width: 1440, height: 1000 });
async function click(target: Page, text: string) {
  await target.waitForFunction(text => [...document.querySelectorAll<HTMLButtonElement>("button")].some(button => button.textContent?.trim() === text && !button.disabled), {}, text);
  await target.evaluate(text => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === text && !button.disabled)!.click(), text);
}
async function title(value: string) {
  await page.bringToFront();
  await page.click('input[aria-label="Document title"]');
  await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control"); await page.keyboard.type(value);
}
// Advance only the idle check, without expiring the server lease or waiting five
// real minutes. Timers still run normally; their callbacks are also callable.
await page.evaluateOnNewDocument(() => {
  const intervals = new Map<number, () => void>();
  const start = window.setInterval.bind(window), stop = window.clearInterval.bind(window);
  window.setInterval = ((callback: () => void, delay: number, ...args: unknown[]) => {
    const id = start(callback, delay, ...args); if (delay === 60_000) intervals.set(id, callback); return id;
  }) as typeof window.setInterval;
  window.clearInterval = id => { if (typeof id === "number") intervals.delete(id); stop(id); };
  (window as any).runIdleCheck = () => {
    const now = Date.now;
    try { Date.now = () => now() + 300_001; for (const callback of intervals.values()) callback(); }
    finally { Date.now = now; }
  };
});
try {
  await page.goto(origin + "/login", { waitUntil: "networkidle0" });
  const doc = await page.evaluate(async content => {
    const signup = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "lock-browser@example.com", password: "Lock browser password 123!" }) });
    if (!signup.ok) throw new Error("Signup failed");
    const created = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(content) });
    return await created.json() as { id: string };
  }, sample("Lock handoff test"));
  const status = () => f.env.DB.prepare("SELECT lease_id AS leaseId FROM edit_locks WHERE document_id=? AND expires_at>unixepoch()").bind(doc.id).first<{ leaseId: string }>();
  await page.goto(`${origin}/documents/${doc.id}`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".doc-studio");
  assert.equal(await status(), null, "Opening a document only views it");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".doc-studio");
  assert.equal(await status(), null, "Reloading does not reacquire editing");
  await click(page, "Start editing");
  await page.waitForSelector('.edit-lock-status[data-editing="true"]');
  const firstLease = (await status())!;
  const other = await browser.newPage();
  await other.goto(`${origin}/documents/${doc.id}`, { waitUntil: "networkidle0" });
  await other.waitForFunction(() => document.querySelector('.edit-lock-description')?.textContent?.includes('Another browser tab or window'));
  assert.equal(await other.$eval('.edit-lock-action', node => (node as HTMLButtonElement).disabled), true);
  assert.equal((await status())?.leaseId, firstLease.leaseId);
  console.log("Lock viewing, reload and same-account ownership passed.");
  await title("Unsaved draft preserved during handoff");

  let mode: "pass" | "fail" | "lost-response" = "fail";
  let releases = 0, heldRenewal: HTTPRequest | undefined;
  let holdRenewal = false;
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (new URL(request.url()).pathname !== `/api/documents/${doc.id}/lock`) { void request.continue(); return; }
    if (request.method() === "PATCH" && holdRenewal) { heldRenewal = request; return; }
    if (request.method() !== "DELETE") { void request.continue(); return; }
    releases++;
    if (mode === "fail") { void request.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary release failure" }) }); return; }
    if (mode === "lost-response") {
      void (async () => {
        const result = await fetch(request.url(), { method: "DELETE", headers: request.headers(), body: request.postData() });
        await result.arrayBuffer(); await request.abort("failed");
      })();
      return;
    }
    void request.continue();
  });
  await click(page, "Stop editing");
  await page.waitForFunction(() => document.querySelector('.edit-lock-badge')?.textContent === 'Release not confirmed');
  assert.equal((await status())?.leaseId, firstLease.leaseId, "A rejected release still holds the server lock");
  assert.equal(await page.$eval('input[aria-label="Document title"]', node => (node as HTMLInputElement).value), "Unsaved draft preserved during handoff");
  assert.equal(await page.$eval('input[aria-label="Document title"]', node => (node as HTMLInputElement).disabled), true);
  assert.equal(await other.$eval('.edit-lock-action', node => (node as HTMLButtonElement).disabled), true);
  await page.screenshot({ path: "/tmp/docsync-lock-release-retry.png", fullPage: true });
  console.log("Failed release keeps the draft and shows Retry release.");
  mode = "pass";
  await click(page, "Retry release");
  await page.waitForFunction(() => document.querySelector('.edit-lock-action')?.textContent === 'Start editing');
  assert.equal(await status(), null, "A confirmed handoff actually releases the server lock");
  console.log("Confirmed release passed.");
  await other.bringToFront();
  await other.waitForFunction(() => !(document.querySelector('.edit-lock-action') as HTMLButtonElement)?.disabled);
  await click(other, "Start editing");
  await other.waitForSelector('.edit-lock-status[data-editing="true"]');
  await other.close();
  await page.bringToFront();
  await page.waitForFunction(async id => !(await (await fetch(`/api/documents/${id}/lock`)).json()).lock, {}, doc.id);
  await page.waitForFunction(() => !(document.querySelector('.edit-lock-action') as HTMLButtonElement)?.disabled);
  await click(page, "Start editing");
  await page.waitForSelector('.edit-lock-status[data-editing="true"]');
  assert.equal(await page.$eval('input[aria-label="Document title"]', node => (node as HTMLInputElement).value), "Unsaved draft preserved during handoff");
  await click(page, "Save");
  await page.waitForFunction(() => document.querySelector('.notice[role=status]')?.textContent === 'Saved.');
  await page.evaluate(() => (window as any).runIdleCheck());
  await page.waitForFunction(() => document.querySelector('.edit-lock-description')?.textContent?.includes('inactivity'));
  assert.equal(await status(), null, "A saved idle editor releases its lock");
  console.log("Saved idle release passed.");
  await click(page, "Start editing");
  await page.waitForSelector('.edit-lock-status[data-editing="true"]');
  await title("Unsaved work keeps its lease");
  const renewed = page.waitForResponse(response => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith("/lock"));
  await page.evaluate(() => (window as any).runIdleCheck()); await renewed;
  assert.ok(await status(), "An idle editor with unsaved changes retains its lease");
  await page.waitForSelector('.edit-lock-status[data-editing="true"]');
  console.log("Unsaved idle draft protection passed.");

  holdRenewal = true;
  await page.evaluate(() => { document.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.evaluate(() => (window as any).runIdleCheck());
  await page.waitForFunction(() => document.querySelector('.edit-lock-status[data-editing="true"]'));
  // Wait for the request interception callback, then ensure Stop editing waits
  // for that renewal before deleting the lease.
  const deadline = Date.now() + 5000;
  while (!heldRenewal && Date.now() < deadline) await new Promise(done => setTimeout(done, 10));
  assert.ok(heldRenewal);
  const before = releases;
  await click(page, "Stop editing");
  await page.waitForFunction(() => document.querySelector('.edit-lock-badge')?.textContent === 'Releasing');
  assert.equal(releases, before, "Release waits for the in-flight renewal");
  holdRenewal = false; await heldRenewal.continue();
  await page.waitForFunction(() => document.querySelector('.edit-lock-action')?.textContent === 'Start editing');
  assert.equal(await status(), null);
  await click(page, "Start editing");
  await page.waitForSelector('.edit-lock-status[data-editing="true"]');
  mode = "lost-response";
  await click(page, "Stop editing");
  await page.waitForFunction(() => document.querySelector('.edit-lock-action')?.textContent === 'Start editing');
  assert.equal(await status(), null, "An uncertain DELETE response is resolved by checking server status");
  assert.equal(await page.$eval('input[aria-label="Document title"]', node => (node as HTMLInputElement).value), "Unsaved work keeps its lease");
  assert.deepEqual(errors, []);
  console.log("Lock browser acceptance passed: viewing/reload, same-account tabs, failed release/retry, confirmed handoff, saved idle release, unsaved preservation, renewal/release ordering, and lost response recovery.");
} catch (error) {
  console.error("Lock browser acceptance failed:", error);
  console.error(await page.$eval('.edit-lock-status', node => node.textContent).catch(() => "Status unavailable"));
  throw error;
} finally {
  await browser.close(); await new Promise<void>(done => server.close(() => done())); f.close();
}
