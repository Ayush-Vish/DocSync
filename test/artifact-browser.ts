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
  await page.goto(origin + "/templates?template=editorial-document", { waitUntil: "networkidle0" });
  const galleryFrame = await (await page.$('[aria-label="Selected template"] iframe'))!.contentFrame();
  assert.ok(galleryFrame);
  await galleryFrame.waitForSelector("#live-events");
  const initial = await galleryFrame.$eval("#live-events", node => node.textContent);
  await galleryFrame.waitForFunction(value => document.getElementById("live-events")?.textContent !== value, { timeout: 8000 }, initial);
  await galleryFrame.click(".chart-filters button:nth-child(2)");
  assert.equal(await galleryFrame.$$eval(".filterable-chart .chart-column:not([hidden])", nodes => nodes.length), 3);
  await galleryFrame.click("nav button");
  assert.match(await galleryFrame.$eval("#live-status", node => node.textContent || ""), /paused/);
  await page.screenshot({ path: "/tmp/docsync-live-template.png", fullPage: true });
  for (const title of ["Technical Blueprint", "Sales Dashboard", "Bold Pitch", "Delivery Review"]) {
    await page.evaluate(title => {
      const button = [...document.querySelectorAll<HTMLButtonElement>("main > div button")].find(button => button.querySelector("strong")?.textContent === title);
      if (!button) throw new Error(`Missing template: ${title}`);
      button.click();
    }, title);
    const frame = await (await page.$('[aria-label="Selected template"] iframe'))!.contentFrame();
    assert.ok(frame);
    await frame.waitForSelector(".chart-bar");
    if (["Bold Pitch", "Delivery Review"].includes(title)) {
      await frame.click("nav button:nth-child(2)");
      assert.match(await frame.$eval("[aria-live]", node => node.textContent || ""), /^(?:Slide )?2 of 6$/);
    }
    if (title === "Sales Dashboard") {
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

  // The same player is used by template previews, the editor, and published decks.
  await page.click('button.home-button');
  await page.waitForSelector('dialog.presentation-viewer[open]');
  async function currentFrame() {
    const frame = await (await page.$('.presentation-canvas iframe'))!.contentFrame();
    assert.ok(frame);
    await frame.waitForSelector('.slide');
    await frame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await frame.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
    return frame;
  }
  for (let index = 0; index < 6; index++) {
    await page.waitForFunction(index => document.querySelector('.presentation-counter')?.textContent === `Slide ${index + 1} of 6`, {}, index);
    const frame = await currentFrame();
    const geometry = await frame.evaluate(() => {
      const slide = document.querySelector<HTMLElement>('.slide')!;
      return { width: innerWidth, height: innerHeight, contentWidth: slide.scrollWidth, contentHeight: slide.scrollHeight };
    });
    assert.equal(geometry.width, 1280);
    assert.equal(geometry.height, 720);
    assert.ok(geometry.contentWidth <= 1280 && geometry.contentHeight <= 720, `Review slide ${index + 1} fits: ${JSON.stringify(geometry)}`);
    if (index === 0) await page.screenshot({ path: '/tmp/docsync-review-presentation.png' });
    if (index < 5) await page.locator('.presentation-controls button[aria-label="Next slide"]').click();
  }
  await page.keyboard.press('Home');
  await page.setViewport({ width: 390, height: 844 });
  const mobileFrame = await currentFrame();
  assert.equal(await mobileFrame.evaluate(() => innerWidth), 1280, 'Mobile slides keep their design viewport');
  const ratio = await page.$eval('.presentation-canvas iframe', node => { const r = node.getBoundingClientRect(); return r.width / r.height; });
  assert.ok(Math.abs(ratio - 16 / 9) < .01);
  await page.screenshot({ path: '/tmp/docsync-presentation-mobile.png' });
  await page.locator('button[aria-label="Exit presentation"]').click();
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(origin + '/templates?format=presentation&template=pitch-deck', { waitUntil: 'networkidle0' });
  await page.click('button.home-button');
  await page.waitForSelector('dialog.presentation-viewer[open]');
  for (let index = 0; index < 6; index++) {
    const frame = await currentFrame();
    const geometry = await frame.evaluate(() => { const slide = document.querySelector<HTMLElement>('.slide')!; return { width: slide.scrollWidth, height: slide.scrollHeight }; });
    assert.ok(geometry.width <= 1280 && geometry.height <= 720, `Pitch slide ${index + 1} fits: ${JSON.stringify(geometry)}`);
    if (index === 0) await page.screenshot({ path: '/tmp/docsync-pitch-cover.png' });
    if (index < 5) {
      await page.locator('.presentation-controls button[aria-label="Next slide"]').click();
      await page.waitForFunction(index => document.querySelector('.presentation-counter')?.textContent === `Slide ${index + 2} of 6`, {}, index);
    }
  }
  await page.locator('button[aria-label="Slide overview"]').click();
  assert.equal(await page.$$eval('.presentation-overview button', nodes => nodes.length), 6);
  await page.locator('.presentation-overview button[data-slide="2"]').click();
  let workflow = await currentFrame();
  await workflow.click('#workflow-next');
  assert.match(await workflow.$eval('#workflow-status', node => node.textContent || ''), /Step 2 of 3/);
  assert.equal(await page.$eval('.presentation-counter', node => node.textContent), 'Slide 3 of 6', 'Interactive slide controls do not advance the deck');
  await page.locator('button[aria-label="Replay slide animations"]').click();
  workflow = await currentFrame();
  assert.match(await workflow.$eval('#workflow-status', node => node.textContent || ''), /Step 1 of 3/, 'Replay resets only the current slide');
  await workflow.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.presentation-counter')?.textContent === 'Slide 4 of 6');
  const traction = await currentFrame();
  await traction.waitForFunction(() => document.getElementById('traction-count')?.textContent === '1,280');
  assert.equal(await traction.$('#workflow-next'), null, 'Each slide has an independent DOM and script');
  assert.match(await traction.$eval('#traction-count', node => getComputedStyle(node).fontSize), /80px/);
  await page.screenshot({ path: '/tmp/docsync-pitch-presentation.png' });
  await page.locator('button[aria-label="Replay slide animations"]').click();
  await currentFrame();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.locator('button[aria-label="Replay slide animations"]').click();
  const still = await currentFrame();
  assert.equal(await still.$eval('#traction-count', node => node.textContent), '1,280');
  assert.equal(await still.evaluate(() => document.getAnimations().length), 0);
  await page.locator('button[aria-label="Enter fullscreen"]').click();
  await page.waitForFunction(() => document.fullscreenElement?.classList.contains('presentation-shell'));
  await page.locator('button[aria-label="Leave fullscreen"]').click();
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.evaluate(() => window.postMessage({ type: 'docsync:presentation-v1', action: 'last' }, '*'));
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  assert.equal(await page.$eval('.presentation-counter', node => node.textContent), 'Slide 4 of 6', 'Messages from outside the active frame cannot control the player');
  await still.evaluate(() => {
    const target = document.body;
    const start = new Touch({ identifier: 1, target, clientX: 900, clientY: 300 });
    const end = new Touch({ identifier: 1, target, clientX: 300, clientY: 305 });
    target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start] }));
    target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [end] }));
  });
  await page.waitForFunction(() => document.querySelector('.presentation-counter')?.textContent === 'Slide 5 of 6');
  await page.emulateMediaFeatures([]);
  await page.locator('button[aria-label="Exit presentation"]').click();

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

  const pageScript = `
    document.addEventListener('DOMContentLoaded', () => {
      window.starts = (window.starts || 0) + 1;
      document.getElementById('page-add').addEventListener('click', () => {
        const count = document.getElementById('page-count');
        count.textContent = String(Number(count.textContent) + 1);
      });
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
        document.querySelector('h1').animate([{transform:'translateY(24px)',opacity:.2},{transform:'none',opacity:1}], {duration:5000});
    });
    window.addEventListener('load', () => { window.loads = (window.loads || 0) + 1; });
  `;
  const pagedResponse = await f.call('/documents', 'POST', {
    title: 'Independent document pages', format: 'document', pages: [
      { id: 'page-one', kind: 'html', html: '<article class="page slide"><h1>First page</h1><button id="page-add">Add one</button><output id="page-count">0</output><input aria-label="Page slider" type="range"></article>', css: '.page{padding:32px}h1{color:#9c2424}', js: `window.pageName="one";${pageScript}` },
      { id: 'page-two', kind: 'html', html: '<article class="page"><h1>Second page</h1><button id="page-add">Add one</button><output id="page-count">0</output><p id="only-second">Independent content</p></article>', css: '.page{padding:48px}h1{color:#245c9c}', js: `window.pageName="two";${pageScript}` },
    ],
  });
  assert.equal(pagedResponse.status, 201);
  const paged = await pagedResponse.json() as { id: string; revision: number };
  const pagedPublication = await (await f.call(`/documents/${paged.id}/publish`, 'POST', { expectedRevision: paged.revision })).json() as { url: string };
  await page.goto(origin + new URL(pagedPublication.url).pathname, { waitUntil: 'networkidle0' });
  async function documentFrame() {
    await page.waitForSelector('.document-paper iframe');
    const frame = await (await page.$('.document-paper iframe'))!.contentFrame();
    assert.ok(frame);
    await frame.waitForFunction(() => (window as any).starts === 1 && (window as any).loads === 1);
    return frame;
  }
  let documentPage = await documentFrame();
  assert.ok(await page.$('.shared-document-viewer'), 'Explicit document format wins even with slide markup');
  assert.equal(await page.$('.shared-slide-viewer'), null);
  assert.equal(await page.$$eval('.document-paper iframe', frames => frames.length), 1, 'Inactive document pages are not mounted');
  assert.equal(await documentPage.$eval('h1', node => getComputedStyle(node).color), 'rgb(156, 36, 36)');
  await documentPage.click('#page-add');
  await page.keyboard.press('Space');
  assert.equal(await documentPage.$eval('#page-count', node => node.textContent), '2', 'Space keeps native button behavior');
  await documentPage.focus('input');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.$eval('.document-page-toolbar output', node => node.textContent), 'Page 1 of 2', 'Range widgets retain arrow keys');
  await documentPage.focus('#page-add');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.document-page-toolbar output')?.textContent === 'Page 2 of 2');
  const oldPage = documentPage;
  documentPage = await documentFrame();
  assert.ok(oldPage.detached, 'Leaving a page destroys its scripts and timers');
  assert.equal(await documentPage.$eval('h1', node => getComputedStyle(node).color), 'rgb(36, 92, 156)');
  assert.equal(await documentPage.evaluate(() => (window as any).pageName), 'two');
  assert.ok(await documentPage.evaluate(() => document.getAnimations().some(animation => animation.playState === 'running')), 'The next page starts its own animation');
  await documentPage.click('#page-add');
  await page.click('button[aria-label="Replay page animations"]');
  documentPage = await documentFrame();
  assert.equal(await documentPage.$eval('#page-count', node => node.textContent), '0');
  await page.click('button[aria-label="Previous page"]');
  documentPage = await documentFrame();
  assert.equal(await documentPage.evaluate(() => (window as any).pageName), 'one');
  assert.equal(await documentPage.$('#only-second'), null, 'Page DOM and CSS remain independent');
  assert.equal(await documentPage.$eval('#page-count', node => node.textContent), '0', 'Revisiting restarts the selected page');
  await documentPage.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  assert.equal(await page.$eval('.document-page-toolbar output', node => node.textContent), 'Page 1 of 2', 'Document scroll keys do not turn pages');
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('.document-paper')!.getBoundingClientRect().width < innerWidth);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await page.$eval('.document-pages-scroll', node => node.scrollHeight > node.clientHeight), 'Portrait documents keep normal reading scroll');
  await page.$eval('.document-pages-scroll', node => { node.scrollTop = 300; });
  await page.click('button[aria-label="Next page"]');
  await documentFrame();
  assert.equal(await page.$eval('.document-pages-scroll', node => node.scrollTop), 0);
  await page.screenshot({ path: '/tmp/docsync-document-mobile.png' });
  await page.setViewport({ width: 1280, height: 1000 });

  const deckResponse = await f.call("/documents", "POST", {
    title: "Two slide deck",
    sections: [
      { id: "first-slide", kind: "html", html: '<article class="slide"><h1>First slide</h1><button id="page-add">Add one</button><output id="page-count">0</output><input aria-label="Slide slider" type="range"></article>', css: ".slide{min-height:560px;aspect-ratio:16/9;--long:\"" + 'x'.repeat(29400) + "\"}", js: `window.currentSlide="first";${pageScript}` },
      { id: "second-slide", kind: "html", html: '<article class="slide"><h1>Second slide</h1><button id="page-add">Add one</button><output id="page-count">0</output></article>', css: ".slide{min-height:560px;aspect-ratio:16/9}h1{color:#245c9c}", js: `window.currentSlide="second";${pageScript}` },
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
  await page.waitForSelector(".presentation-viewer");
  const slideshowFrame = await (await page.$(".presentation-canvas iframe"))!.contentFrame();
  assert.ok(slideshowFrame);
  await slideshowFrame.waitForSelector("h1");
  await slideshowFrame.waitForFunction(() => (window as any).starts === 1 && (window as any).loads === 1);
  assert.equal(await slideshowFrame.$eval("h1", node => node.textContent), "First slide");
  await slideshowFrame.click('#page-add');
  await page.keyboard.press('Space');
  assert.equal(await slideshowFrame.$eval('#page-count', node => node.textContent), '2');
  await slideshowFrame.focus('input');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.$eval('.presentation-counter', node => node.textContent), 'Slide 1 of 2');
  await slideshowFrame.focus('#page-add');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.presentation-counter')?.textContent === 'Slide 2 of 2');
  const animatedSlide = await (await page.$('.presentation-canvas iframe'))!.contentFrame();
  assert.ok(animatedSlide);
  await animatedSlide.waitForFunction(() => (window as any).starts === 1 && (window as any).loads === 1 && document.getAnimations().some(animation => animation.playState === 'running'));
  assert.equal(await animatedSlide.evaluate(() => (window as any).currentSlide), 'second');
  assert.equal(await animatedSlide.$eval('h1', node => getComputedStyle(node).color), 'rgb(36, 92, 156)');
  assert.ok(slideshowFrame.detached, 'The previous slide stops running');
  const visibleSlide = await page.$eval('.presentation-canvas iframe', node => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  assert.ok(visibleSlide, 'Right-arrow starts animations in a visible, scaled viewport');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('.presentation-counter')?.textContent === 'Slide 1 of 2');
  await page.click('button[aria-label="Exit presentation"]');
  await page.waitForSelector(".presentation-viewer", { hidden: true });
  await page.click('button[aria-label="Next slide"]');
  await page.waitForFunction(() => document.querySelector(".shared-viewer-toolbar span")?.textContent?.includes("Slide 2 of 2"));
  const secondSlide = await (await page.$(".shared-page iframe"))!.contentFrame();
  assert.ok(secondSlide);
  await secondSlide.waitForSelector("h1");
  assert.equal(await secondSlide.$eval("h1", node => node.textContent), "Second slide");
  assert.ok(await secondSlide.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log("Passed: all 12 template slide layouts, independent document pages and slide scripts/styles, DOM-ready initialization, right-arrow animations, native widget keys, replay, overview, touch navigation, fullscreen, reduced motion, mobile reading and artifact sandbox isolation.");
} catch (error) {
  const active = (await browser.pages()).at(-1);
  await active?.screenshot({ path: '/tmp/docsync-artifact-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  server.close();
  f.close();
}
