import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fixture, sample } from "./helpers.ts";
import { handle } from "../src/worker.ts";
import { hash } from "../src/auth.ts";

const f = await fixture();
const root = resolve("dist/public");
f.env.ASSETS = {
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    const candidate = resolve(root, "." + path);
    const file =
      candidate.startsWith(root + "/") &&
      existsSync(candidate) &&
      statSync(candidate).isFile()
        ? candidate
        : join(root, "index.html");
    return new Response(readFileSync(file), {
      headers: {
        "Content-Type": file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".svg")
              ? "image/svg+xml"
            : "text/html",
      },
    });
  },
};
const server = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    const method = req.method || "GET";
    const r = await handle(
      new Request(`http://${req.headers.host}${req.url}`, {
        method,
        headers: req.headers as Record<string, string>,
        ...(["GET", "HEAD"].includes(method)
          ? {}
          : { body: Buffer.concat(chunks) }),
      }),
      f.env,
    );
    res.setHeader("Set-Cookie", r.headers.getSetCookie());
    res.writeHead(
      r.status,
      Object.fromEntries([...r.headers].filter(([k]) => k !== "set-cookie")),
    );
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
const profile = mkdtempSync(join(tmpdir(), "docsync-browser-"));
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k, v]) =>
      v !== undefined &&
      ![
        "DOCSYNC_AGENT_TOKEN",
        "DOCSYNC_CONNECTION_FILE",
        "DOCSYNC_URL",
      ].includes(k),
  ),
) as Record<string, string>;
env.DOCSYNC_CONFIG_DIR = profile;
const clients: Client[] = [];
async function mcp() {
  const c = new Client({ name: "browser-acceptance", version: "1" });
  await c.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve("packages/mcp/docsync-mcp.cjs"), "--url", origin],
      env,
    }),
  );
  clients.push(c);
  return c;
}
const parse = (r: any) => JSON.parse(r.content[0].text);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage(),
  errors: string[] = [];
await page.setViewport({ width: 1440, height: 1000 });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("dialog", (d) => void d.accept());
async function click(text: string) {
  const button = await page.waitForFunction(
    (text) =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === text && !b.disabled,
      ),
    {},
    text,
  );
  await button.asElement()!.toElement("button").then(element => element.asLocator().click());
  await button.dispose();
}
async function fill(selector: string, text: string) {
  await page.click(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.type(text);
}
try {
  const homepageRequests: string[] = [];
  const trackHomepage = (request: { url(): string }) => homepageRequests.push(request.url());
  page.on("request", trackHomepage);
  await page.goto(origin, { waitUntil: "networkidle0" });
  assert.equal(await page.$$eval("h1", nodes => nodes.length), 1);
  assert.match(await page.$eval("h1", node => node.textContent || ""), /Less busywork/);
  assert.ok(!homepageRequests.some(url => /\/assets\/main-/.test(url)), "Guest homepage must not load the editor bundle");
  page.off("request", trackHomepage);
  await page.screenshot({ path: "/tmp/docsync-home-desktop.png", fullPage: true });
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Skip to content");
  await page.click(".home-faq summary");
  assert.equal(await page.$eval(".home-faq details", node => (node as HTMLDetailsElement).open), true);
  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.screenshot({ path: "/tmp/docsync-home-mobile.png", fullPage: true });
  const staticPage = await browser.newPage();
  await staticPage.setJavaScriptEnabled(false);
  await staticPage.goto(origin);
  assert.match(await staticPage.$eval("main", node => node.textContent || ""), /Reports & updates/);
  await staticPage.click(".home-faq summary");
  assert.equal(await staticPage.$eval(".home-faq details", node => (node as HTMLDetailsElement).open), true);
  await staticPage.close();
  await page.setViewport({ width: 1440, height: 1000 });
  await Promise.all([page.waitForNavigation(), page.click('.home-use-cases a[href="/templates?template=sales-dashboard"]')]);
  await page.waitForFunction(() => document.querySelector('[aria-label="Selected template"] h2')?.textContent === "Sales Dashboard");
  await page.goto(origin);
  await Promise.all([page.waitForNavigation(), page.click('.home-actions a[href="/signup"]')]);
  await page.waitForSelector('input[name="email"]');
  assert.ok(await page.$('input[name="password"]'));
  await page.goto(origin + "/login");
  await page.waitForSelector('input[name="email"]');
  console.log("Homepage acceptance passed: prerendering without JavaScript, metadata routes, keyboard access, FAQ, mobile layout, deferred editor loading, template links, signup and sign-in.");
  const trial = await mcp();
  const connection = parse(
    await trial.callTool({ name: "get_connection", arguments: {} }),
  );
  assert.equal(connection.trial, true);
  const created = await trial.callTool({
    name: "create_document",
    arguments: { ...sample("My first report"), sections: [
      ...sample("My first report").sections,
      { id: "second-page", kind: "text", html: "<p>A clear view of the coming year.</p>", css: "" },
    ] },
  });
  assert.equal(created.isError, false);
  const doc = parse(created);
  const publication = parse(
    await trial.callTool({
      name: "publish_document",
      arguments: { id: doc.id, expectedRevision: 1 },
    }),
  );
  assert.ok(publication.url);
  const blocked = await trial.callTool({
    name: "create_document",
    arguments: sample("Second"),
  });
  assert.equal(blocked.isError, true);
  assert.equal(parse(blocked).details.code, "AUTH_REQUIRED");
  const link = parse(
    await trial.callTool({ name: "connect_account", arguments: {} }),
  );
  await page.goto(link.signInUrl);
  await page.waitForSelector("input[name=email]");
  await page.screenshot({ path: "/tmp/docsync-signin.png", fullPage: true });
  await click("Create an account");
  await page.type("input[name=email]", "browser@example.com");
  await page.type("input[name=password]", "Browser account password 123!");
  await click("Create account →");
  await page.waitForSelector(".workspace");
  console.log("Account signup passed; claiming the trial document.");
  await click("Claim my document");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=status]")
      ?.textContent?.includes("Document added"),
  );
  await page.click(".connect-card details > summary");
  await click("Generate token");
  await page.waitForSelector('input[aria-label="New agent token"]');
  const token = await page.$eval(
    'input[aria-label="New agent token"]',
    (el) => (el as HTMLInputElement).value,
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "packages/mcp/docsync-mcp.cjs",
        "login",
        "--url",
        origin,
        "--token-stdin",
      ],
      { env, stdio: ["pipe", "pipe", "pipe"] },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("MCP login failed")),
    );
    child.stdin.end(token);
  });
  const account = await mcp();
  assert.equal(
    parse(await account.callTool({ name: "get_connection", arguments: {} }))
      .trial,
    false,
  );
  assert.equal(
    (await trial.callTool({ name: "get_document", arguments: { id: doc.id } }))
      .isError,
    true,
  );
  assert.equal(
    (
      await account.callTool({
        name: "create_document",
        arguments: sample("Account second document"),
      })
    ).isError,
    false,
  );
  let sessionRequests = 0;
  const countSession = (request: { url(): string }) => { if (new URL(request.url()).pathname === "/api/session") sessionRequests++; };
  page.on("request", countSession);
  await page.goto(origin);
  await page.waitForSelector(".workspace");
  page.off("request", countSession);
  assert.equal(sessionRequests, 1, "Authenticated home startup reuses the session check");
  // Navigate using the sidebar and open the claimed document.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("nav button")].find((b) =>
      b.textContent?.includes("My documents"),
    ) as HTMLButtonElement;
    button.click();
  });
  await page.waitForSelector(".document-card");
  await page.$eval('.document-card', node => node.scrollIntoView({ block: 'center' }));
  await page.waitForSelector('.document-card .document-cover iframe');
  assert.equal(await page.$eval('.document-card .document-cover iframe', node => node.getAttribute('sandbox')), '', 'Library covers never run document JavaScript');
  const coverFrame = await (await page.$('.document-card .document-cover iframe'))!.contentFrame();
  assert.ok(coverFrame);
  await coverFrame.waitForSelector('h1');
  assert.equal(await coverFrame.$eval('h1', node => node.textContent), 'Overview');
  await page.screenshot({ path: "/tmp/docsync-library.png", fullPage: true });
  await page.click(".custom-theme-card summary");
  assert.match(await page.$eval(".custom-theme-card code", node => node.textContent || ""), /custom theme/i);
  console.log("Agent connection passed; checking templates and editing.");
  await page.click('[data-theme-id="pitch-deck"]');
  await page.waitForSelector('.slide-studio');
  assert.equal(await page.$$eval('.slide-studio-thumbnails .slide-studio-card', nodes => nodes.length), 6);
  await click('Present');
  await page.waitForSelector('dialog.presentation-viewer[open]');
  assert.equal(await page.$eval('.slide-studio-canvas iframe', node => node.getAttribute('sandbox')), '', 'The background editor suspends slide scripts while presenting');
  await page.locator('button[aria-label="Exit presentation"]').click();
  await click('My documents');
  await page.waitForSelector('.document-card');
  const pitchCard = await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('.document-card')].find(card => card.textContent?.includes('Northstar Product Pitch')));
  await (await pitchCard.asElement()!.toElement('button')).scrollIntoView();
  const pitchCover = await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('.document-card')].find(card => card.textContent?.includes('Northstar Product Pitch'))?.querySelector<HTMLIFrameElement>('iframe'));
  const pitchCoverFrame = await (await pitchCover.asElement()!.toElement('iframe')).contentFrame();
  assert.ok(pitchCoverFrame);
  await pitchCoverFrame.waitForSelector('h1');
  assert.match(await pitchCoverFrame.$eval('h1', node => node.textContent || ''), /Clarity moves/);
  assert.equal(await pitchCoverFrame.evaluate(() => document.getAnimations().length), 0);
  await page.screenshot({ path: '/tmp/docsync-library-covers.png', fullPage: true });
  await page.click('[data-theme-id="sales-dashboard"]');
  await page.waitForFunction(() => (document.querySelector('input[aria-label="Document title"]') as HTMLInputElement)?.value === "Northstar Sales Dashboard");
  assert.match(new URL(page.url()).pathname, /^\/documents\/[a-f0-9-]{36}\/preview$/);
  const salesFrame = await (await page.$('iframe[src="/artifact-frame"]'))!.contentFrame();
  assert.ok(salesFrame);
  await salesFrame.waitForSelector("#live-sales");
  await page.waitForFunction(() => document.querySelector(".document-paper iframe")!.getBoundingClientRect().height > 1056);
  assert.ok(await salesFrame.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
  assert.equal(await salesFrame.$eval('nav[aria-label="Presentation controls"]', node => getComputedStyle(node).display), "none");
  assert.equal(await salesFrame.$eval("html", node => getComputedStyle(node).scrollbarWidth), "none");
  const salesBefore = await salesFrame.$eval("#live-sales", node => node.textContent);
  await salesFrame.waitForFunction(value => document.getElementById("live-sales")?.textContent !== value, { timeout: 8000 }, salesBefore);
  await page.screenshot({ path: "/tmp/docsync-sales-theme.png" });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("nav button")].find((b) =>
      b.textContent?.includes("My documents"),
    ) as HTMLButtonElement;
    button.click();
  });
  await page.waitForSelector(".document-card");
  await page.evaluate(() => {
    const button = [...document.querySelectorAll(".document-card")].find((b) =>
      b.textContent?.includes("My first report"),
    ) as HTMLButtonElement;
    button.click();
  });
  await page.waitForSelector(".doc-studio");
  assert.equal(new URL(page.url()).pathname, `/documents/${doc.id}`);
  await click("Preview");
  await page.waitForSelector(".document-paper iframe");
  assert.equal(new URL(page.url()).pathname, `/documents/${doc.id}/preview`);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".document-paper iframe");
  assert.equal(new URL(page.url()).pathname, `/documents/${doc.id}/preview`);
  await click("Edit");
  assert.equal(new URL(page.url()).pathname, `/documents/${doc.id}`);
  await page.waitForSelector('.edit-lock-status[data-editing="true"]');
  await fill('input[aria-label="Document title"]', "Browser edited report");
  await click("Share");
  await page.waitForSelector("dialog.share-dialog[open]");
  assert.equal(await page.$eval(".share-dialog footer button:last-child", button => (button as HTMLButtonElement).disabled), true);
  assert.equal(await page.$$eval(".share-dialog footer button", buttons => (buttons.find(button => button.textContent?.trim() === "Copy link") as HTMLButtonElement).disabled), true);
  assert.ok(await page.$('.share-dialog select[aria-label="Invitation access"]'), "Private draft collaboration has an explicit role selector");
  await page.screenshot({ path: "/tmp/docsync-share.png" });
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog.share-dialog", { hidden: true });
  assert.match(await page.evaluate(() => document.activeElement?.textContent || ""), /Share/);
  let saves = 0;
  const countSave = (request: { url(): string; method(): string }) => { if (request.method() === "PUT" && new URL(request.url()).pathname === `/api/documents/${doc.id}`) saves++; };
  page.on("request", countSave);
  await page.evaluate(() => {
    const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Save")!;
    save.click(); save.click();
  });
  await page.waitForFunction(() => document.querySelector("[role=status]")?.textContent === "Saved.");
  page.off("request", countSave);
  assert.equal(saves, 1, "Repeated save clicks produce one mutation");
  // Agent-managed implementation source is not exposed in the customer UI.
  assert.equal(await page.$(".component-editor textarea"), null);
  assert.ok(!(await page.$eval("body", node => node.textContent || "")).includes("Edit HTML, CSS & JavaScript"));
  assert.equal(await page.evaluate(() => (window as any).stolen), undefined);
  const frame = page.frames().find((x) => x.url().endsWith("/artifact-frame"));
  assert.ok(frame);
  await frame!.waitForSelector("h1");
  assert.equal(
    await frame!.$eval("h1", (e) => e.textContent),
    "Overview",
  );
  assert.equal(await frame!.$("#artifact script,img,[onclick]"), null);
  const editorLayout = await page.evaluate(() => {
    const editor = document.querySelector(".doc-studio")!.getBoundingClientRect();
    const canvas = document.querySelector(".doc-studio-center")!.getBoundingClientRect();
    const frame = document.querySelector(".document-paper iframe")!.getBoundingClientRect();
    return { editorWidth: editor.width, canvasWidth: canvas.width, frameWidth: frame.width, frameHeight: frame.height, contained: frame.left >= canvas.left && frame.right <= canvas.right };
  });
  assert.ok(editorLayout.editorWidth >= 1100);
  assert.ok(editorLayout.frameWidth > 0 && editorLayout.frameWidth <= editorLayout.canvasWidth);
  assert.ok(editorLayout.contained, "The rendered block stays within the document canvas");
  assert.ok(editorLayout.frameHeight >= 260);
  assert.equal(await page.$eval(".sidebar", node => getComputedStyle(node).display), "none");
  assert.equal(await page.$(".section-card"), null);
  assert.ok(!(await page.$eval(".doc-studio", node => node.textContent || "")).includes("Quick-Insert"));
  await page.screenshot({ path: "/tmp/docsync-editor.png" });
  await page.evaluate(() => {
    const canvas = document.querySelector(".doc-studio-center")!;
    canvas.scrollTop = canvas.scrollHeight;
  });
  const stickyLayout = await page.evaluate(() => ({
    topbarTop: document.querySelector(".topbar")!.getBoundingClientRect().top,
  }));
  assert.ok(Math.abs(stickyLayout.topbarTop) < 1);
  await click("Share");
  await page.waitForSelector("dialog.share-dialog[open]");
  await click("Publish v2 with new link");
  await page.waitForSelector(".share-link a");
  const sharedUrl = await page.$eval(
    ".share-link a",
    (a) => (a as HTMLAnchorElement).href,
  );
  assert.equal((await fetch(publication.url.replace("/share/", "/api/shared/"))).status, 404, "Republishing revokes the previous link");
  await page.evaluate(() => {
    (window as any).originalClipboard = navigator.clipboard.writeText;
    navigator.clipboard.writeText = () => Promise.reject(new Error("Permission denied"));
  });
  await click("Copy link");
  await page.waitForFunction(() => document.querySelector(".share-dialog [role=alert]")?.textContent?.includes("copy it manually"));
  assert.ok(!(await page.$eval(".share-dialog", node => node.textContent || "")).includes("Copied"));
  await page.evaluate(() => { navigator.clipboard.writeText = (window as any).originalClipboard; });
  await page.keyboard.press("Escape");
  const reader = await browser.createBrowserContext();
  const publicPage = await reader.newPage();
  await publicPage.setViewport({ width: 1440, height: 1000 });
  await publicPage.goto(sharedUrl);
  await publicPage.waitForFunction(
    () => document.querySelector(".shared-document-title")?.textContent === "Browser edited report",
  );
  assert.equal(await publicPage.$eval(".sidebar", node => getComputedStyle(node).display), "none");
  assert.ok(await publicPage.$(".shared-editor-page"));
  assert.equal(await publicPage.$$eval(".document-paper", pages => pages.length), 1);
  assert.equal(await publicPage.$eval('.document-page-toolbar output', node => node.textContent), 'Page 1 of 2');
  await publicPage.click('button[aria-label="Next page"]');
  await publicPage.waitForFunction(() => document.querySelector('.document-page-toolbar output')?.textContent === 'Page 2 of 2');
  await publicPage.click('button[aria-label="Previous page"]');
  const sharedLayout = await publicPage.evaluate(() => {
    const reader = document.querySelector(".shared")!.getBoundingClientRect();
    const frame = document.querySelector(".shared iframe")!.getBoundingClientRect();
    return { readerWidth: reader.width, frameWidth: frame.width, frameHeight: frame.height };
  });
  assert.ok(sharedLayout.readerWidth >= 900);
  assert.ok(sharedLayout.frameWidth >= 760);
  assert.ok(sharedLayout.frameHeight >= 640);
  // A second signed-in account accepts a one-time editor invitation. Its
  // browser waits for the owner's lease, then saves an attributed version.
  await click("Share");
  await click("Create invitation");
  await page.waitForSelector('input[aria-label="Invitation link"]');
  const invitationUrl = await page.$eval('input[aria-label="Invitation link"]', input => (input as HTMLInputElement).value);
  await page.screenshot({ path: '/tmp/docsync-collaborator-sharing.png', fullPage: true });
  await page.keyboard.press("Escape");
  await publicPage.goto(invitationUrl);
  await publicPage.waitForSelector('input[name=email]');
  await publicPage.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Create an account')!.click());
  await publicPage.type('input[name=email]', 'collaborator@example.com');
  await publicPage.type('input[name=password]', 'Collaboration browser password 123!');
  await publicPage.click('button[type=submit]');
  await publicPage.waitForSelector('.invitation-card');
  await publicPage.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Accept invitation')!.click());
  await publicPage.waitForSelector('.doc-studio');
  await publicPage.waitForFunction(() => document.querySelector('.edit-lock-status')?.textContent?.includes('Browser'));
  assert.equal(await publicPage.$eval('input[aria-label="Document title"]', input => (input as HTMLInputElement).disabled), true);
  await click("Stop editing");
  await page.waitForFunction(async id => !(await (await fetch(`/api/documents/${id}/lock`)).json()).lock, {}, doc.id);
  await publicPage.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Start editing')!.click());
  await publicPage.waitForSelector('.edit-lock-status[data-editing="true"]');
  await publicPage.click('input[aria-label="Document title"]');
  await publicPage.keyboard.down('Control'); await publicPage.keyboard.press('A'); await publicPage.keyboard.up('Control');
  await publicPage.keyboard.type('Collaborator saved revision');
  await publicPage.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Save')!.click());
  await publicPage.waitForFunction(() => document.querySelector('[role=status]')?.textContent === 'Saved.');
  await publicPage.click('input[aria-label="Document title"]');
  await publicPage.keyboard.down('Control'); await publicPage.keyboard.press('A'); await publicPage.keyboard.up('Control');
  await publicPage.keyboard.type('Collaborator unsaved draft');
  await click("Share");
  await page.waitForSelector('select[aria-label="Access for collaborator@example.com"]');
  await page.select('select[aria-label="Access for collaborator@example.com"]', 'viewer');
  await publicPage.waitForFunction(() => document.querySelector('.edit-lock-status')?.textContent?.includes('Viewer access'));
  assert.equal(await publicPage.$eval('input[aria-label="Document title"]', input => (input as HTMLInputElement).value), 'Collaborator unsaved draft', 'A revoked edit lease preserves the browser draft');
  assert.equal(await publicPage.$eval('input[aria-label="Document title"]', input => (input as HTMLInputElement).disabled), true);
  await page.keyboard.press('Escape');
  await click("Start editing");
  await page.waitForSelector('.edit-lock-status[data-editing="true"]');
  assert.equal(await page.$eval('input[aria-label="Document title"]', input => (input as HTMLInputElement).value), 'Collaborator saved revision', 'Acquiring a lock refreshes an unchanged browser from the saved revision');
  await click("History");
  await page.waitForSelector('dialog.version-history[open]');
  assert.match(await page.$eval('.version-history', element => element.textContent || ''), /collaborator@example.com/);
  await page.click('.revision-row:nth-of-type(2) button');
  await page.waitForSelector('[aria-label="Version comparison"]');
  await page.screenshot({ path: '/tmp/docsync-version-history.png' });
  await click("Close history");
  // Expired sessions can be renewed without replacing an unsaved draft.
  await fill('input[aria-label="Document title"]', "Draft kept through sign-in");
  const accountCookie = (await page.cookies()).find(cookie => cookie.name === "docsync_account")!;
  await f.env.DB.prepare("DELETE FROM account_sessions WHERE token_hash=?").bind(await hash(accountCookie.value)).run();
  await click("Save");
  await page.waitForSelector("dialog.session-dialog[open]");
  assert.equal(await page.$eval('.session-dialog input[name=email]', input => (input as HTMLInputElement).readOnly), true);
  await page.type('.session-dialog input[name=password]', "Browser account password 123!");
  await click("Sign in →");
  await page.waitForSelector("dialog.session-dialog", { hidden: true });
  assert.equal(await page.$eval('input[aria-label="Document title"]', input => (input as HTMLInputElement).value), "Draft kept through sign-in");
  await page.keyboard.down("Control"); await page.keyboard.press("s"); await page.keyboard.up("Control");
  await page.waitForFunction(() => document.querySelector("[role=status]")?.textContent === "Saved.");
  // Leases block a second agent, and a fresh lease still cannot overwrite a
  // newer revision with a preserved browser draft.
  await fill('input[aria-label="Document title"]', "Unsaved browser draft");
  const blockedLease = await account.callTool({ name: "acquire_document_lock", arguments: { id: doc.id } });
  assert.equal(blockedLease.isError, true);
  await click("Stop editing");
  await page.waitForFunction(async id => !(await (await fetch(`/api/documents/${id}/lock`)).json()).lock, {}, doc.id);
  const agentLease = parse(await account.callTool({ name: "acquire_document_lock", arguments: { id: doc.id } }));
  const current = parse(await account.callTool({ name: "get_document", arguments: { id: doc.id } }));
  const agentUpdate = await account.callTool({ name: "update_document", arguments: { id: doc.id, lockToken: agentLease.lockToken, expectedRevision: current.revision, title: "Agent update", sections: current.sections } });
  assert.equal(agentUpdate.isError, false);
  await account.callTool({ name: "release_document_lock", arguments: { id: doc.id, lockToken: agentLease.lockToken } });
  await click("Start editing");
  await page.waitForSelector('.edit-lock-status[data-editing="true"]');
  await click("Save");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=alert]")
      ?.textContent?.includes("Document changed"),
  );
  assert.equal(
    await page.$eval(
      'input[aria-label="Document title"]',
      (el) => (el as HTMLInputElement).value,
    ),
    "Unsaved browser draft",
  );
  await click("Share");
  await page.waitForSelector("dialog.share-dialog[open]");
  await click("Revoke link");
  assert.equal(
    (await fetch(sharedUrl.replace("/share/", "/api/shared/"))).status,
    404,
  );
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('.share-dialog button[aria-label="Close sharing"]')!.disabled);
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog.share-dialog", { hidden: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForSelector(".doc-studio-left.collapsed");
  await page.waitForSelector(".doc-studio-right.collapsed");
  await page.waitForFunction(() => document.querySelector(".doc-studio-left")!.getBoundingClientRect().width <= 54 && document.querySelector(".doc-studio-right")!.getBoundingClientRect().width < 1);
  assert.ok(await page.$eval(".doc-studio-center", node => node.getBoundingClientRect().width >= innerWidth - 60), "The mobile canvas keeps its usable width");
  assert.ok(await page.$eval(".doc-studio-center", node => node.getBoundingClientRect().height > 300));
  assert.ok(await page.$$eval(".document-actions button", buttons => buttons.every(button => button.getBoundingClientRect().right <= innerWidth)), "All mobile toolbar actions stay on screen");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "/tmp/docsync-mobile.png", fullPage: true });
  await page.locator('button[aria-label="Expand outline"]').click();
  await page.waitForSelector(".doc-studio-left:not(.collapsed)");
  await page.locator('button[aria-label="Collapse outline"]').click();
  await page.locator('button[title="Inspect properties"]').click();
  await page.waitForSelector(".doc-studio-right:not(.collapsed)");
  await page.locator('button[aria-label="Close properties"]').click();
  await page.waitForFunction(() => document.querySelector(".doc-studio-right")!.getBoundingClientRect().width < 1);
  assert.equal(await page.$('.document-mode-switch'), null, 'Documents cannot be switched into the slide editor');
  await click("My documents");
  await page.evaluate(() => {
    const card = [...document.querySelectorAll<HTMLButtonElement>('.document-card')].find(card => card.textContent?.includes('Northstar Product Pitch'));
    if (!card) throw new Error('Missing presentation');
    card.click();
  });
  await page.waitForSelector(".slide-studio");
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error("Permission denied")); });
  await click("AI Prompt");
  await page.waitForFunction(() => document.querySelector("[role=alert]")?.textContent?.includes("Permission denied"));
  assert.ok(!(await page.$eval("body", node => node.textContent || "")).includes("prompt copied!"));
  await page.evaluate(() => { navigator.clipboard.writeText = (window as any).originalClipboard; });
  await page.screenshot({ path: "/tmp/docsync-slides-mobile.png" });
  await click("My documents");
  await page.click('button[aria-label="Sign out"]');
  await page.waitForSelector("input[name=email]");
  assert.deepEqual(errors, []);
  console.log(
    "Browser + packaged MCP acceptance passed: signup, trial quota and claim, account token login, editor, sanitization, duplicate save protection, sharing and clipboard errors, session recovery, conflict preservation, link rotation and revocation, logout, mobile panels and toolbar.",
  );
} catch (error) {
  console.error("Browser acceptance failed at", page.url(), error);
  await page.screenshot({ path: "/tmp/docsync-browser-failure.png", fullPage: true }).catch(() => {});
  throw error;
} finally {
  for (const client of clients) await client.close();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  f.close();
  rmSync(profile, { recursive: true, force: true });
}
