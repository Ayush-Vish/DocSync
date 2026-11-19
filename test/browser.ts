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
f.env.GOOGLE_CLIENT_ID = "browser-oauth-client";
f.env.GOOGLE_CLIENT_SECRET = "browser-oauth-secret";
let googleEmail = "browser@example.com";
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input) === "https://oauth2.googleapis.com/token") {
    const data = new URLSearchParams(init?.body as URLSearchParams);
    assert.ok(data.get("code_verifier"));
    return Response.json({ access_token: data.get("code") });
  }
  if (String(input) === "https://openidconnect.googleapis.com/v1/userinfo") {
    const email = new Headers(init?.headers).get("Authorization")!.slice("Bearer ".length);
    return Response.json({ sub: "browser-google:" + email, email, email_verified: true });
  }
  return realFetch(input, init);
};
const invitationEmails: { to: unknown; text?: string }[] = [];
f.env.DOCSYNC_EMAIL_FROM = "invites@example.com";
f.env.EMAIL = { async send(message) {
  assert.ok("subject" in message);
  invitationEmails.push({ to: message.to, text: message.text });
  return { messageId: `browser-mock-${invitationEmails.length}` };
} };
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
              : file.endsWith(".webp")
                ? "image/webp"
                : file.endsWith(".woff2")
                  ? "font/woff2"
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
    const location = r.headers.get("Location");
    if (location?.startsWith("https://accounts.google.com/")) {
      // Simulate Google's authorization response while using the real DocSync callback.
      const authorization = new URL(location);
      const callback = new URL(authorization.searchParams.get("redirect_uri")!);
      callback.searchParams.set("state", authorization.searchParams.get("state")!);
      callback.searchParams.set("code", googleEmail);
      r.headers.set("Location", callback.href);
    }
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
  assert.equal(await page.$eval("h1", node => node.textContent), "AI documents and presentations, ready to share.");
  assert.ok(await page.$eval(".home-hero img", img => (img as HTMLImageElement).naturalWidth > 0), "The outcome image loads from the public asset route");
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
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/docsync-home-mobile.png", fullPage: true });
  const staticPage = await browser.newPage();
  await staticPage.setJavaScriptEnabled(false);
  await staticPage.goto(origin);
  assert.match(await staticPage.$eval("main", node => node.textContent || ""), /Reports & updates/);
  await staticPage.click(".home-faq summary");
  assert.equal(await staticPage.$eval(".home-faq details", node => (node as HTMLDetailsElement).open), true);
  await Promise.all([staticPage.waitForNavigation(), staticPage.click('nav[aria-label="Main navigation"] a[href="/guides"]')]);
  await Promise.all([staticPage.waitForNavigation(), staticPage.click('a[href="/guides/connect-mcp"]')]);
  await staticPage.click('[aria-label="CLI setup"] details:first-of-type > summary');
  assert.match(await staticPage.$eval('[aria-label="CLI setup"] details[open] pre', node => node.textContent ?? ""), /codex mcp add docsync/);
  assert.match(await staticPage.$eval('[aria-label="Web and desktop setup"] summary', node => node.textContent ?? ""), /ChatGPT web & Projects/);
  await staticPage.close();
  await page.setViewport({ width: 1440, height: 1000 });
  await Promise.all([page.waitForNavigation(), page.click('.home-use-cases a[href="/templates?template=sales-dashboard"]')]);
  await page.waitForFunction(() => document.querySelector('[aria-label="Selected template"] h2')?.textContent === "Sales Dashboard");
  await page.goto(origin);
  await Promise.all([page.waitForNavigation(), page.click('.home-actions a[href="/signup"]')]);
  const googleLink = 'a[href^="/api/auth/google?"]';
  await page.waitForSelector(googleLink);
  assert.equal(await page.$('input[name="password"]'), null);
  await page.goto(origin + "/login");
  await page.waitForSelector(googleLink);
  await page.waitForSelector('input[name="password"]');
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
  await page.waitForSelector(googleLink);
  await page.screenshot({ path: "/tmp/docsync-signin.png", fullPage: true });
  await page.click(googleLink);
  await page.waitForSelector(".workspace");
  console.log("Account signup passed; claiming the trial document.");
  await click("Claim my document");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=status]")
      ?.textContent?.includes("Document added"),
  );
  await page.click("#local-mcp-token > summary");
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
  assert.equal(await page.$(".theme-library"), null);
  const savedTemplate = await account.callTool({ name: "save_company_template", arguments: {
    name: "Class report", format: "document", instructions: "Use the report heading style.", css: "h1{color:navy}",
    layouts: [{ name: "Title", html: "<h1>[Title]</h1>" }],
  } });
  assert.equal(savedTemplate.isError, false);
  await click("Templates");
  assert.equal(new URL(page.url()).pathname, "/workspace/templates");
  await page.waitForFunction(() => document.querySelector('[aria-labelledby="saved-templates-title"]')?.textContent?.includes("Class report"));
  await page.click(".custom-theme-card summary");
  assert.match(await page.$eval(".custom-theme-card code", node => node.textContent || ""), /custom theme/i);
  console.log("Agent connection passed; checking the read-only workspace.");
  // Templates are previews for the agent; the browser never creates documents.
  assert.equal(await page.$eval('a[data-theme-id="pitch-deck"]', node => (node as HTMLAnchorElement).getAttribute("href")), "/templates?template=pitch-deck");
  assert.ok(!(await page.$eval("body", node => node.textContent || "")).includes("New document"));
  const clientId = "c".repeat(64), oauthToken = "d".repeat(64);
  const browserAccount = await f.env.DB.prepare("SELECT account_id FROM account_credentials WHERE token_hash=?").bind(await hash(token)).first<{ account_id: string }>();
  await f.env.DB.batch([
    f.env.DB.prepare("INSERT INTO oauth_clients VALUES(?,'Claude Code','[]',unixepoch())").bind(clientId),
    f.env.DB.prepare("INSERT INTO oauth_access_tokens VALUES(?,?,?,0,unixepoch()+3600)").bind(await hash(oauthToken), browserAccount!.account_id, clientId),
  ]);
  await click("Agents");
  assert.equal(new URL(page.url()).pathname, "/agents");
  assert.equal(await page.$(".theme-library"), null);
  const cliGuide = '[aria-label="CLI setup"]';
  assert.deepEqual(await page.$$eval(`${cliGuide} summary`, labels => labels.map(label => label.textContent?.trim())),
    ["Codex CLI", "Claude Code CLI", "Gemini CLI", "Antigravity CLI"]);
  await page.click(`${cliGuide} details:first-child > summary`);
  assert.equal(await page.$eval(`${cliGuide} details[open] pre`, code => code.textContent), `codex mcp add docsync --url ${origin}/mcp`);
  await click("Web & desktop");
  const webGuide = '[aria-label="Web and desktop setup"]';
  assert.deepEqual(await page.$$eval(`${webGuide} summary`, labels => labels.map(label => label.textContent?.trim())),
    ["ChatGPT web & Projects", "Claude web & Claude Code on the web", "Gemini web", "Antigravity App & IDE", "Codex on the web & ChatGPT desktop"]);
  await page.click(`${webGuide} details:first-of-type > summary`);
  assert.match(await page.$eval(`${webGuide} details[open]`, panel => panel.textContent ?? ""), /In a project chat, use the same picker/);
  assert.match(await page.$eval(webGuide, panel => panel.textContent ?? ""), /Web agents need a public HTTPS endpoint/);
  const allow = 'input[aria-label="Allow Claude Code to publish share links"]';
  await page.waitForSelector(allow);
  assert.equal(await page.$eval(allow, input => (input as HTMLInputElement).checked), false);
  await page.click(allow);
  await page.waitForFunction(selector => document.querySelector<HTMLInputElement>(selector)?.checked && document.querySelector('[role="status"]')?.textContent?.includes("Publishing enabled"), {}, allow);
  const permission = await fetch(`${origin}/api/connection`, { headers: { Authorization: `Bearer ${oauthToken}` } });
  assert.equal((await permission.json()).canPublish, true);
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".sidebar nav button")].find(button => button.textContent?.includes("My documents"))!.click());
  // The connected agent creates a presentation (with its brief) and an interactive document.
  const pitch = await (await fetch(`${origin}/downloads/docsync/themes/pitch-deck.json`)).json();
  const pitchBrief = { answeredBy: "defaults", audience: "investors", depth: "overview", slideCount: pitch.sections.length, animation: "none", style: "pitch", speakerNotes: false };
  const pitchCreated = await account.callTool({ name: "create_document", arguments: { ...pitch, brief: pitchBrief } });
  assert.equal(pitchCreated.isError, false, JSON.stringify(pitchCreated.content));
  const presentationId = parse(pitchCreated).id as string;
  const sales = await (await fetch(`${origin}/downloads/docsync/themes/sales-dashboard.json`)).json();
  const salesId = parse(await account.callTool({ name: "create_document", arguments: sales })).id as string;
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".document-card");
  const pitchCard = await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('.document-card')].find(card => card.textContent?.includes('Northstar Product Pitch')));
  await (await pitchCard.asElement()!.toElement('button')).scrollIntoView();
  const pitchCover = await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('.document-card')].find(card => card.textContent?.includes('Northstar Product Pitch'))?.querySelector<HTMLIFrameElement>('iframe'));
  const pitchCoverFrame = await (await pitchCover.asElement()!.toElement('iframe')).contentFrame();
  assert.ok(pitchCoverFrame);
  await pitchCoverFrame.waitForSelector('h1');
  assert.match(await pitchCoverFrame.$eval('h1', node => node.textContent || ''), /Clarity moves/);
  assert.equal(await pitchCoverFrame.evaluate(() => document.getAnimations().length), 0);
  await page.screenshot({ path: '/tmp/docsync-library-covers.png', fullPage: true });
  // Presentations open in the read-only viewer: slides, notes, Present, page locks; nothing editable.
  await page.goto(`${origin}/documents/${presentationId}`, { waitUntil: "networkidle0" });
  await page.waitForSelector('.shared-slide-filmstrip');
  assert.equal(await page.$$eval('.shared-slide-filmstrip .shared-slide-thumbnail', nodes => nodes.length), 6);
  assert.equal(await page.$$eval('input:not([type=hidden]),textarea,[contenteditable="true"]', nodes => nodes.length), 0, "The workspace has no content-editing fields");
  for (const removed of ["Save", "Add slide", "Delete slide", "Start editing", "Preview"]) assert.ok(!(await page.$$eval("button", (buttons, label) => buttons.some(button => button.textContent?.trim() === label || button.title === label), removed)), `${removed} is not offered`);
  assert.match(await page.$eval('.edit-lock-description', node => node.textContent || ''), /agent makes every edit/);
  const screen = '.slide-screen-choice select';
  await page.waitForSelector(screen);
  for (const [preset, aspect] of [["widescreen", 16 / 9], ["projector", 4 / 3], ["phone", 9 / 16]] as const) {
    await page.select(screen, preset);
    await page.waitForFunction(aspect => {
      const preview = document.querySelector('.slide-screen')!.getBoundingClientRect();
      const slide = document.querySelector('.slide-screen iframe')!.getBoundingClientRect();
      return Math.abs(preview.width / preview.height - aspect) < .01 &&
        Math.abs(slide.width / slide.height - 16 / 9) < .01 && slide.width <= preview.width + 1 && slide.height <= preview.height + 1;
    }, {}, aspect);
  }
  await page.focus(screen);
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.$eval('.shared-page-indicator', node => node.textContent?.trim()), 'Slide 1 of 6');
  await page.select(screen, 'projector');
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('.slide-screen')!.getBoundingClientRect().width > 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '/tmp/docsync-projector-preview.png' });
  await page.setViewport({ width: 1440, height: 1000 });
  await click('Present');
  await page.waitForSelector('dialog.presentation-viewer[open]');
  await page.waitForFunction(() => document.fullscreenElement?.classList.contains('presentation-shell'));
  await page.locator('button[aria-label="Exit presentation"]').click();
  await page.waitForFunction(() => !document.fullscreenElement);
  // An interactive document keeps running in the viewer.
  await page.goto(`${origin}/documents/${salesId}`, { waitUntil: "networkidle0" });
  await page.waitForSelector('.document-viewer');
  assert.equal(await page.$(screen), null);
  const salesFrame = await (await page.$('iframe[src="/artifact-frame"]'))!.contentFrame();
  assert.ok(salesFrame);
  await salesFrame.waitForSelector("#live-sales");
  await page.waitForFunction(() => document.querySelector(".document-paper iframe")!.getBoundingClientRect().height > 1056);
  assert.ok(await salesFrame.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
  assert.equal(await salesFrame.$eval('nav[aria-label="Presentation controls"]', node => getComputedStyle(node).display), "none");
  const salesBefore = await salesFrame.$eval("#live-sales", node => node.textContent);
  await salesFrame.waitForFunction(value => document.getElementById("live-sales")?.textContent !== value, { timeout: 8000 }, salesBefore);
  await page.screenshot({ path: "/tmp/docsync-sales-theme.png" });
  // Opening a document never takes an edit lease, so agents are never blocked by a browser tab.
  await click("My documents");
  await page.waitForSelector(".document-card");
  await page.evaluate(() => {
    const button = [...document.querySelectorAll(".document-card")].find((b) => b.textContent?.includes("My first report")) as HTMLButtonElement;
    button.click();
  });
  await page.waitForSelector(".document-viewer");
  assert.equal(new URL(page.url()).pathname, `/documents/${doc.id}`);
  assert.equal((await f.env.DB.prepare("SELECT COUNT(*) n FROM edit_locks WHERE document_id=?").bind(doc.id).first<{ n: number }>())?.n, 0, "Opening a document does not acquire a lease");
  // The agent edits; the browser shows the result.
  const agentEdit = async (title: string) => {
    const lease = parse(await account.callTool({ name: "acquire_document_lock", arguments: { id: doc.id } }));
    const current = parse(await account.callTool({ name: "get_document", arguments: { id: doc.id } }));
    const saved = await account.callTool({ name: "update_document", arguments: { id: doc.id, lockToken: lease.lockToken, expectedRevision: current.revision, title, sections: current.sections, changeSummary: "Agent edit" } });
    assert.equal(saved.isError, false, JSON.stringify(saved.content));
    await account.callTool({ name: "release_document_lock", arguments: { id: doc.id, lockToken: lease.lockToken } });
  };
  await agentEdit("Agent edited report");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelector(".document-title-text")?.textContent === "Agent edited report");
  assert.equal(await page.evaluate(() => (window as any).stolen), undefined);
  const frame = page.frames().find((x) => x.url().endsWith("/artifact-frame"));
  assert.ok(frame);
  await frame!.waitForSelector("h1");
  assert.equal(await frame!.$eval("h1", (e) => e.textContent), "Overview");
  assert.equal(await frame!.$("#artifact script,img,[onclick]"), null);
  assert.equal(await page.$eval(".sidebar", node => getComputedStyle(node).display), "none");
  await page.screenshot({ path: "/tmp/docsync-viewer.png" });
  await click("Share");
  await page.waitForSelector("dialog.share-dialog[open]");
  // The invitation form renders once the dialog has loaded the document's access list.
  assert.ok(await page.waitForSelector('.share-dialog select[aria-label="Invitation access"]'), "Private draft collaboration has an explicit role selector");
  assert.ok(await page.waitForSelector('input[aria-label="Invitation email address"]'), "Configured email invitations have a recipient field");
  await page.screenshot({ path: "/tmp/docsync-share.png" });
  await click("Publish v2 with new link");
  await page.waitForSelector(".share-link a");
  const sharedUrl = await page.$eval(".share-link a", (a) => (a as HTMLAnchorElement).href);
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
  await page.waitForSelector("dialog.share-dialog", { hidden: true });
  const reader = await browser.createBrowserContext();
  const publicPage = await reader.newPage();
  await publicPage.setViewport({ width: 1440, height: 1000 });
  await publicPage.goto(sharedUrl);
  await publicPage.waitForFunction(() => document.querySelector(".shared-document-title")?.textContent === "Agent edited report");
  assert.equal(await publicPage.$eval(".sidebar", node => getComputedStyle(node).display), "none");
  assert.equal(await publicPage.$$eval(".document-paper", pages => pages.length), 1);
  assert.equal(await publicPage.$eval('.document-page-toolbar output', node => node.textContent), 'Page 1 of 2');
  await publicPage.click('button[aria-label="Next page"]');
  await publicPage.waitForFunction(() => document.querySelector('.document-page-toolbar output')?.textContent === 'Page 2 of 2');
  // A collaborator invited by email also gets the read-only workspace.
  await click("Share");
  await page.waitForSelector('input[aria-label="Invitation email address"]');
  await fill('input[aria-label="Invitation email address"]', 'collaborator@example.com');
  await click("Send invitation");
  await page.waitForFunction(() => document.querySelector('.collaborators [role="status"]')?.textContent?.includes('collaborator@example.com'));
  await page.waitForSelector('input[aria-label="Invitation link"]');
  const invitationUrl = await page.$eval('input[aria-label="Invitation link"]', input => (input as HTMLInputElement).value);
  assert.equal(invitationEmails.length, 1);
  assert.equal(invitationEmails[0].to, 'collaborator@example.com');
  assert.ok(invitationEmails[0].text?.includes(invitationUrl));
  await page.keyboard.press("Escape");
  await publicPage.goto(invitationUrl);
  await publicPage.waitForSelector(googleLink);
  googleEmail = "collaborator@example.com";
  await publicPage.click(googleLink);
  await publicPage.waitForSelector('.invitation-card');
  await publicPage.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Accept invitation')!.click());
  await publicPage.waitForSelector('.document-viewer');
  assert.equal(await publicPage.$$eval('input:not([type=hidden]),textarea,[contenteditable="true"]', nodes => nodes.length), 0);
  // While an agent holds the lease, the status line names it.
  const heldLease = parse(await account.callTool({ name: "acquire_document_lock", arguments: { id: doc.id } }));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => /is editing with/.test(document.querySelector('.edit-lock-description')?.textContent || ''));
  await account.callTool({ name: "release_document_lock", arguments: { id: doc.id, lockToken: heldLease.lockToken } });
  // Version history compares versions; restoring is left to the agent.
  await click("History");
  await page.waitForSelector('dialog.version-history[open]');
  assert.ok(!(await page.$$eval('.version-history button', buttons => buttons.some(button => button.textContent?.trim() === 'Restore'))));
  await page.click('.revision-row:nth-of-type(2) button');
  await page.waitForSelector('[aria-label="Version comparison"]');
  await page.screenshot({ path: '/tmp/docsync-version-history.png' });
  await click("Close history");
  // Google reauthentication keeps the current document open.
  const accountCookie = (await page.cookies()).find(cookie => cookie.name === "docsync_account")!;
  await f.env.DB.prepare("DELETE FROM account_sessions WHERE token_hash=?").bind(await hash(accountCookie.value)).run();
  await click("History");
  await page.waitForSelector("dialog.session-dialog[open]");
  assert.equal(await page.$('.session-dialog input[name=password]'), null);
  googleEmail = "browser@example.com";
  const [recoveryTarget] = await Promise.all([
    browser.waitForTarget(target => target.url() === origin + "/login" && target !== page.target()),
    page.click(".session-dialog " + googleLink),
  ]);
  await (await recoveryTarget.page())?.waitForSelector(".workspace");
  await (await recoveryTarget.page())?.close();
  await click("Resume workspace");
  await page.waitForSelector("dialog.session-dialog", { hidden: true });
  assert.equal(new URL(page.url()).pathname, `/documents/${doc.id}`);
  await click("Share");
  await page.waitForSelector("dialog.share-dialog[open]");
  await click("Revoke link");
  assert.equal((await fetch(sharedUrl.replace("/share/", "/api/shared/"))).status, 404);
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('.share-dialog button[aria-label="Close sharing"]')!.disabled);
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog.share-dialog", { hidden: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForSelector(".document-viewer");
  assert.ok(await page.$$eval(".document-actions button", buttons => buttons.every(button => button.getBoundingClientRect().right <= innerWidth)), "All mobile toolbar actions stay on screen");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: "/tmp/docsync-mobile.png", fullPage: true });
  // Page assignment: reserve slides for the agent, then answer an agent's unlock request.
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${origin}/documents/${presentationId}`, { waitUntil: "networkidle0" });
  await page.waitForSelector('.shared-slide-filmstrip');
  await page.locator('button[aria-label^="Slide 1 unlocked"]').click();
  await page.waitForSelector('dialog.page-lock-dialog select');
  await page.locator('.page-lock-selection label:nth-of-type(2) input').click();
  await click("Lock selected");
  await page.waitForSelector('button[aria-label^="Slide 1 locked"]');
  const webLocks = await page.evaluate(async id => (await (await fetch(`/api/documents/${id}/page-locks`)).json()).locks, presentationId);
  assert.equal(webLocks.length, 2);
  const firstPageId = await page.evaluate(async id => (await (await fetch(`/api/documents/${id}`)).json()).sections[0].id, presentationId);
  const requesterToken = "b".repeat(64);
  const holderAccount = await f.env.DB.prepare("SELECT account_id FROM documents WHERE id=?").bind(presentationId).first<{ account_id: string }>();
  await f.env.DB.prepare("INSERT INTO oauth_clients VALUES('browser-lock-requester','Requesting agent','[]',unixepoch())").run();
  await f.env.DB.prepare("INSERT INTO oauth_access_tokens VALUES(?,?,'browser-lock-requester',0,unixepoch()+3600)").bind(await hash(requesterToken), holderAccount!.account_id).run();
  assert.equal((await fetch(`${origin}/api/documents/${presentationId}/page-lock-requests`, {
    method: "POST", headers: { Authorization: `Bearer ${requesterToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pageIds: [firstPageId] }),
  })).status, 200);
  await page.locator('button[aria-label="Page lock requests"]').click();
  await page.waitForFunction(() => document.querySelector("dialog.page-lock-dialog")?.textContent?.includes("Requesting agent"));
  await click("Review");
  await click("Unlock selected");
  await page.waitForSelector('button[aria-label^="Slide 1 unlocked"]');
  await page.setViewport({ width: 390, height: 844 });
  await click("My documents");
  const auditToken = await page.evaluate(async () => (await (await fetch('/api/agent-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allowPublishing: false }) })).json()).token as string);
  for (const path of ['/api/connection', `/api/documents/${crypto.randomUUID()}`]) {
    await fetch(origin + path, { headers: { Authorization: `Bearer ${auditToken}`, 'X-DocSync-Client': 'Codex', 'X-DocSync-Device': 'Audit-fixture-laptop', 'X-DocSync-Platform': 'linux%20x64', 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'Audit browser fixture' } });
  }
  await click('Audit log');
  await page.waitForSelector('#audit-title');
  await page.waitForSelector('.audit-entry');
  await fill('input[aria-label="Search audit log"]', 'Audit-fixture-laptop');
  await page.select('select[aria-label="Audit result filter"]', 'error');
  await click('Filter');
  await page.waitForFunction(() => document.querySelectorAll('.audit-entry').length === 1 && document.querySelector('.audit-command code')?.textContent === 'get_document');
  await page.click('.audit-entry summary');
  assert.ok((await page.$eval('.audit-event-details', node => node.textContent || '')).includes('203.0.113.7'));
  assert.ok(!(await page.$eval('.audit-page', node => node.textContent || '')).includes(auditToken));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '/tmp/docsync-audit-mobile.png', fullPage: true });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.screenshot({ path: '/tmp/docsync-audit-desktop.png', fullPage: true });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#audit-title');
  assert.equal(new URL(page.url()).pathname, '/audit');
  await page.click('button[aria-label="Sign out"]');
  await page.waitForSelector("input[name=email]");
  assert.deepEqual(errors, []);
  console.log(
    "Browser + packaged MCP acceptance passed: signup, trial quota and claim, account token login, read-only workspace, agent edits, sanitization, sharing and clipboard errors, session recovery, page locks, link rotation and revocation, logout, mobile panels and toolbar.",
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
