import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer } from "node:http";
import puppeteer from "puppeteer-core";
import { fixture } from "./helpers.ts";

// Exercise the built Worker: artifactRuntime.toString() must survive bundling.
const { default: worker } = await import(new URL("../dist/worker.mjs", import.meta.url).href);
const f = await fixture(true);
const root = resolve("dist/public");
let exfiltrationRequests = 0;
f.env.ASSETS = { fetch: async request => {
  const path = new URL(request.url).pathname;
  if (path.startsWith("/exfil")) exfiltrationRequests++;
  const candidate = resolve(root, "." + path);
  const file = candidate.startsWith(root + "/") && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, "index.html");
  return new Response(readFileSync(file), { headers: { "Content-Type": file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html" } });
} };
const server = createServer(async (request, response) => {
  const result = await worker.fetch(new Request(`http://${request.headers.host}${request.url}`, { headers: request.headers as Record<string, string> }), f.env);
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
});
await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(origin + "/templates?format=presentation", { waitUntil: "networkidle0" });
  assert.equal(await page.$$eval("main > div button", nodes => nodes.length), 2);
  assert.match(await page.$eval('[aria-label="Selected template"]', node => node.textContent || ""), /Bold Pitch/);
  await page.click('nav[aria-label="Template format"] button:nth-child(2)');
  assert.equal(await page.$$eval("main > div button", nodes => nodes.length), 3);
  assert.match(page.url(), /format=document/);
  await page.click("main > div button:nth-child(3)");
  assert.match(await page.$eval('[aria-label="Selected template"]', node => node.textContent || ""), /Use the Sales Dashboard template/);
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.click('a[href="#agent-skill"]');
  const galleryFrame = await (await page.$("#template-example iframe"))!.contentFrame();
  assert.ok(galleryFrame);
  await galleryFrame.waitForSelector("#live-events");
  const initial = await galleryFrame.$eval("#live-events", node => node.textContent);
  await galleryFrame.waitForFunction(value => document.getElementById("live-events")?.textContent !== value, { timeout: 8000 }, initial);
  await galleryFrame.click(".chart-filters button:nth-child(2)");
  assert.equal(await galleryFrame.$$eval(".filterable-chart .chart-column:not([hidden])", nodes => nodes.length), 3);
  await galleryFrame.click("nav button");
  assert.match(await galleryFrame.$eval("#live-status", node => node.textContent || ""), /paused/);
  await page.screenshot({ path: "/tmp/docsync-live-homepage.png", fullPage: true });
  for (const title of ["Service design", "Sales dashboard", "Product pitch", "Delivery review"]) {
    await page.click(`button[aria-label="Preview ${title} template"]`);
    const frame = await (await page.$("#template-example iframe"))!.contentFrame();
    assert.ok(frame);
    await frame.waitForSelector(".chart-bar");
    if (["Product pitch", "Delivery review"].includes(title)) {
      await frame.click("nav button:nth-child(2)");
      assert.equal(await frame.$eval("[aria-live]", node => node.textContent), "Slide 2 of 3");
    }
    if (title === "Sales dashboard") {
      const sales = await frame.$eval("#live-sales", node => node.textContent);
      await frame.waitForFunction(value => document.getElementById("live-sales")?.textContent !== value, { timeout: 8000 }, sales);
      await frame.click(".chart-filters button:nth-child(2)");
      assert.equal(await frame.$$eval(".filterable-chart .chart-column:not([hidden])", nodes => nodes.length), 3);
    }
    assert.ok(!/\[(?:Author|Date|Name|Company|Presenter|Owner|Source|Concrete|Next)\]/i.test(await frame.$eval("body", node => node.textContent || "")));
  }
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewport({ width: 1280, height: 1000 });

  const js = `
    const count=document.getElementById('count');
    document.getElementById('increment').addEventListener('click',()=>count.textContent=String(Number(count.textContent)+1));
    const probes={};
    try{void parent.document;probes.parent=false}catch{probes.parent=true}
    try{void document.cookie;probes.cookies=false}catch{probes.cookies=true}
    try{void localStorage;probes.storage=false}catch{probes.storage=true}
    window.escapeLiteral='</script><script>window.escaped=true</script>';
    fetch(${JSON.stringify(origin + "/exfil-fetch")}).then(()=>probes.fetch=false).catch(()=>probes.fetch=true).finally(()=>document.getElementById('probes').textContent=JSON.stringify(probes));
    const image=new Image();image.src=${JSON.stringify(origin + "/exfil-image")};
    const external=document.createElement('script');external.src=${JSON.stringify(origin + "/exfil-script")};document.body.append(external);
  `;
  const createdResponse = await f.call("/documents", "POST", { title: "Scripted artifact", sections: [{ id: "interactive", kind: "html", html: '<button id="increment" type="button">Add one</button><output id="count">0</output><pre id="probes"></pre>', css: "button{padding:16px}output{padding:16px}", js }] });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json() as { id: string; revision: number };
  const published = await (await f.call(`/documents/${created.id}/publish`, "POST", { expectedRevision: created.revision })).json() as { url: string };
  await page.goto(origin + new URL(published.url).pathname, { waitUntil: "networkidle0" });
  await page.waitForSelector(".shared-document-viewer");
  await page.waitForSelector('iframe[src="/artifact-frame"]');
  const artifact = await (await page.$('iframe[src="/artifact-frame"]'))!.contentFrame();
  assert.ok(artifact);
  await artifact.waitForSelector("#increment");
  await artifact.click("#increment");
  assert.equal(await artifact.$eval("#count", node => node.textContent), "1");
  await artifact.evaluate(() => {
    const extra = document.createElement("div");
    extra.id = "height-probe";
    extra.style.height = "1800px";
    document.getElementById("artifact")!.append(extra);
  });
  await page.waitForFunction(() => document.querySelector(".document-paper iframe")!.getBoundingClientRect().height > 1800);
  assert.ok(await artifact.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
  await artifact.evaluate(() => document.getElementById("height-probe")!.remove());
  await page.waitForFunction(() => document.querySelector(".document-paper iframe")!.getBoundingClientRect().height === 1056);
  await artifact.waitForFunction(() => document.getElementById("probes")?.textContent?.includes('"fetch":true'));
  assert.deepEqual(JSON.parse(await artifact.$eval("#probes", node => node.textContent || "")), { parent: true, cookies: true, storage: true, fetch: true });
  assert.equal(await artifact.evaluate(() => "escaped" in window), false);
  assert.equal(exfiltrationRequests, 0);
  assert.equal(await page.$eval('iframe[src="/artifact-frame"]', node => node.getAttribute("sandbox")), "allow-scripts");
  const before = page.url();
  const topNavigationBlocked = await artifact.evaluate(() => { try { window.top!.location.href = "https://example.invalid/artifact-test"; return false; } catch { return true; } });
  assert.equal(topNavigationBlocked, true);
  assert.equal(page.url(), before);

  const deckResponse = await f.call("/documents", "POST", {
    title: "Two slide deck",
    sections: [
      { id: "first-slide", kind: "html", html: '<article class="slide"><h1>First slide</h1></article>', css: ".slide{min-height:560px;aspect-ratio:16/9}" },
      { id: "second-slide", kind: "html", html: '<article class="slide"><h1>Second slide</h1></article>', css: ".slide{min-height:560px;aspect-ratio:16/9}" },
    ],
  });
  assert.equal(deckResponse.status, 201);
  const deck = await deckResponse.json() as { id: string; revision: number };
  const deckPublication = await (await f.call(`/documents/${deck.id}/publish`, "POST", { expectedRevision: deck.revision })).json() as { url: string };
  await page.goto(origin + new URL(deckPublication.url).pathname, { waitUntil: "networkidle0" });
  await page.waitForSelector(".shared-slide-viewer");
  assert.ok(await page.$(".shared-app-shell"));
  assert.ok(await page.$(".shared-editor-page"));
  assert.equal(await page.$$eval(".shared-slide-workarea .shared-page iframe", nodes => nodes.length), 1);
  assert.equal(await page.$$eval(".shared-slide-thumbnail", nodes => nodes.length), 2);
  const slideFit = await page.evaluate(() => {
    const stage = document.querySelector(".shared-page-stage")!.getBoundingClientRect();
    const slide = document.querySelector(".shared-slide-workarea .shared-page")!.getBoundingClientRect();
    return { width: stage.width - slide.width, height: stage.height - slide.height };
  });
  assert.ok(slideFit.width <= 56);
  assert.ok(slideFit.height <= 56);
  assert.match(await page.$eval(".shared-viewer-toolbar span", node => node.textContent || ""), /Slide 1 of 2/);
  const firstMainSlide = await (await page.$(".shared-slide-workarea .shared-page iframe"))!.contentFrame();
  assert.ok(firstMainSlide);
  await firstMainSlide.waitForSelector("h1");
  assert.ok(await firstMainSlide.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
  assert.equal(await firstMainSlide.evaluate(() => getComputedStyle(document.documentElement).overflowY), "hidden");
  await page.click(".shared-header-actions button");
  await page.waitForSelector(".shared-slideshow-overlay");
  const slideshowFrame = await (await page.$(".shared-slideshow-canvas iframe"))!.contentFrame();
  assert.ok(slideshowFrame);
  await slideshowFrame.waitForSelector("h1");
  assert.equal(await slideshowFrame.$eval("h1", node => node.textContent), "First slide");
  await page.evaluate(() => {
    const exit = [...document.querySelectorAll(".shared-slideshow-controls button")].find(button => button.textContent?.includes("Exit")) as HTMLButtonElement;
    exit.click();
  });
  await page.waitForSelector(".shared-slideshow-overlay", { hidden: true });
  await page.click('button[aria-label="Next slide"]');
  await page.waitForFunction(() => document.querySelector(".shared-viewer-toolbar span")?.textContent?.includes("Slide 2 of 2"));
  const secondSlide = await (await page.$(".shared-page iframe"))!.contentFrame();
  assert.ok(secondSlide);
  await secondSlide.waitForSelector("h1");
  assert.equal(await secondSlide.$eval("h1", node => node.textContent), "Second slide");
  assert.ok(await secondSlide.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log("Passed: live demo metrics, chart filters, slide navigation, one-page shared viewers, mobile width; published artifact JS works; parent DOM, cookies, storage, external code, fetch, images, top navigation, and HTML breakout are blocked.");
} finally {
  await browser.close();
  server.close();
  f.close();
}
