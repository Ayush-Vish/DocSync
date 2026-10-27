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
  await page.waitForFunction(
    (text) =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent?.trim() === text && !b.disabled,
      ),
    {},
    text,
  );
  await page.evaluate(
    (text) =>
      (
        [...document.querySelectorAll("button")].find(
          (b) => b.textContent?.trim() === text,
        ) as HTMLButtonElement
      ).click(),
    text,
  );
}
async function fill(selector: string, text: string) {
  await page.click(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.type(text);
}
try {
  const trial = await mcp();
  const connection = parse(
    await trial.callTool({ name: "get_connection", arguments: {} }),
  );
  assert.equal(connection.trial, true);
  const created = await trial.callTool({
    name: "create_document",
    arguments: sample("My first report"),
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
  await click("Claim my document");
  await page.waitForFunction(() =>
    document
      .querySelector("[role=status]")
      ?.textContent?.includes("Document added"),
  );
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
  await page.reload();
  await page.waitForSelector(".workspace");
  // Navigate using the sidebar and open the claimed document.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("nav button")].find((b) =>
      b.textContent?.includes("My documents"),
    ) as HTMLButtonElement;
    button.click();
  });
  await page.waitForSelector(".document-card");
  await page.screenshot({ path: "/tmp/docsync-library.png", fullPage: true });
  await page.click(".custom-theme-card summary");
  assert.match(await page.$eval(".custom-theme-card code", node => node.textContent || ""), /custom theme/i);
  await page.click('[data-theme-id="sales-dashboard"]');
  await page.waitForFunction(() => (document.querySelector('input[aria-label="Document title"]') as HTMLInputElement)?.value === "Northstar Sales Dashboard");
  const salesFrame = await (await page.$('iframe[src="/artifact-frame"]'))!.contentFrame();
  assert.ok(salesFrame);
  await salesFrame.waitForSelector("#live-sales");
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
  await page.waitForSelector(".editor-page");
  await fill('input[aria-label="Document title"]', "Browser edited report");
  await click("＋ Text section");
  await page.waitForSelector("[contenteditable=true]");
  await page.click("[contenteditable=true]");
  await page.keyboard.type("A clear view of the coming year.");
  await click("Save");
  await page.waitForFunction(
    () => document.querySelector("[role=status]")?.textContent === "Saved.",
  );
  // Agent-managed implementation source is not exposed in the customer UI.
  assert.equal(await page.$(".component-editor textarea"), null);
  assert.ok(!(await page.$eval("body", node => node.textContent || "")).includes("Edit HTML, CSS & JavaScript"));
  assert.equal(await page.evaluate(() => (window as any).stolen), undefined);
  const frame = page.frames().find((x) => x.url() === "about:srcdoc");
  assert.ok(frame);
  await frame!.waitForSelector("h1");
  assert.equal(
    await frame!.$eval("h1", (e) => e.textContent),
    "Overview",
  );
  assert.equal(await frame!.$("script,img,[onclick]"), null);
  const editorLayout = await page.evaluate(() => {
    const editor = document.querySelector(".editor-page")!.getBoundingClientRect();
    const frame = document.querySelector(".component-editor iframe")!.getBoundingClientRect();
    return { editorWidth: editor.width, frameWidth: frame.width, frameHeight: frame.height };
  });
  assert.ok(editorLayout.editorWidth >= 1100);
  assert.ok(editorLayout.frameWidth >= 800 && editorLayout.frameWidth <= 900);
  assert.ok(editorLayout.frameHeight >= 640);
  await page.screenshot({ path: "/tmp/docsync-editor.png" });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const stickyLayout = await page.evaluate(() => ({
    sidebarTop: document.querySelector(".sidebar")!.getBoundingClientRect().top,
    topbarTop: document.querySelector(".topbar")!.getBoundingClientRect().top,
  }));
  assert.equal(Math.round(stickyLayout.sidebarTop), 0);
  assert.equal(Math.round(stickyLayout.topbarTop), 0);
  await click("Share ↗");
  await page.waitForSelector(".share-link a");
  const sharedUrl = await page.$eval(
    ".share-link a",
    (a) => (a as HTMLAnchorElement).href,
  );
  const reader = await browser.createBrowserContext();
  const publicPage = await reader.newPage();
  await publicPage.setViewport({ width: 1440, height: 1000 });
  await publicPage.goto(sharedUrl);
  await publicPage.waitForFunction(
    () => document.querySelector("h1")?.textContent === "Browser edited report",
  );
  assert.equal(await publicPage.$(".sidebar"), null);
  const sharedLayout = await publicPage.evaluate(() => {
    const reader = document.querySelector(".shared")!.getBoundingClientRect();
    const frame = document.querySelector(".shared iframe")!.getBoundingClientRect();
    return { readerWidth: reader.width, frameWidth: frame.width, frameHeight: frame.height };
  });
  assert.ok(sharedLayout.readerWidth >= 900);
  assert.ok(sharedLayout.frameWidth >= 850);
  assert.ok(sharedLayout.frameHeight >= 640);
  // A stale save must preserve the user's draft.
  await fill('input[aria-label="Document title"]', "Unsaved browser draft");
  const current = parse(
    await account.callTool({ name: "get_document", arguments: { id: doc.id } }),
  );
  await account.callTool({
    name: "update_document",
    arguments: {
      id: doc.id,
      expectedRevision: current.revision,
      title: "Agent update",
      sections: current.sections,
    },
  });
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
  await click("Revoke link");
  assert.equal(
    (await fetch(sharedUrl.replace("/share/", "/api/shared/"))).status,
    404,
  );
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "/tmp/docsync-mobile.png", fullPage: true });
  await page.click('button[aria-label="Sign out"]');
  await page.waitForSelector("input[name=email]");
  assert.deepEqual(errors, []);
  console.log(
    "Browser + packaged MCP acceptance passed: signup, free document, quota, claim, account token login, editor, sanitization, sharing, conflict preservation, revocation, logout, mobile.",
  );
} finally {
  for (const client of clients) await client.close();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  f.close();
  rmSync(profile, { recursive: true, force: true });
}
