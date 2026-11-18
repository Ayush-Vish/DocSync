#!/usr/bin/env node
// Quality gate for a template folder before saving it to DocSync:
//  1. lint: markup DocSync's sanitizer would strip, broken images, motion step gaps, missing headings/notes, leftovers
//  2. layout audit in headless Chrome: content outside the 1280x720 canvas, overlapping text, overflowing boxes
//  3. optional screenshots of every slide in its final build state (--shots DIR) to look at before delivering
// Usage: node check-template.mjs TEMPLATE_DIRECTORY [--shots OUT_DIR] [--slides 1,4,9]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { classesIn } from "./prune.mjs";

// Mirrors src/content.ts. Anything else is removed by DocSync together with its children.
const TAGS = new Set("article section div span p h1 h2 h3 h4 h5 h6 header footer main aside nav strong em b i u s small mark sub sup blockquote pre code ul ol li dl dt dd table thead tbody tfoot tr th td caption colgroup col hr br details summary figure figcaption button input label select option output progress meter canvas img video source".split(" "));
const ATTRS = new Set("id class title role aria-label aria-hidden aria-describedby aria-live aria-pressed colspan rowspan scope start reversed open type value min max step checked disabled selected for width height style src alt loading decoding controls playsinline muted loop preload poster".split(" "));
// Distinctive sample strings from bundled templates; finding one means a placeholder was not replaced.
const LEFTOVERS = ["Short Paper Title", "exactly as printed", "Author One", "presenter names", "Component A", "One-line definition", "First missing piece", "First contribution", "Direction one", "Finding one", "Crop the", "Fig. N", "Metric A", "Title of the presented paper", "10.xxxx", "example.org", "Lorem ipsum", "TODO"];

const argv = process.argv.slice(2);
const flag = name => argv.includes(name) ? argv[argv.indexOf(name) + 1] : null;
const dir = argv.find((a, i) => !a.startsWith("--") && !["--shots", "--slides"].includes(argv[i - 1]));
if (!dir) { console.error("Usage: node check-template.mjs TEMPLATE_DIRECTORY [--shots OUT_DIR] [--slides 1,4,9]"); process.exit(1); }
const directory = resolve(dir);
const source = readFileSync(join(directory, "index.html"), "utf8");
const sections = [...source.matchAll(/<!-- docsync:([a-zA-Z0-9_-]{1,80}) -->\s*([\s\S]*?)\s*<!-- \/docsync -->/g)].map(([, id, html]) => ({ id, html }));
const errors = [], warnings = [];
if (!sections.length) errors.push("No <!-- docsync:ID --> … <!-- /docsync --> sections found.");

const ids = new Map();
for (const { id, html } of sections) {
  const at = `section "${id}"`, classes = classesIn(html), slide = classes.has("slide");
  for (const [, tag] of html.matchAll(/<([a-zA-Z][\w-]*)/g)) if (!TAGS.has(tag.toLowerCase())) errors.push(`${at}: <${tag}> is removed by DocSync with its content.${tag === "a" ? ' Use <span class="url">.' : tag === "svg" ? " Use .ic icons, .wire paths or .nnet (motion.js draws the SVG)." : tag === "style" ? ` Move CSS to styles.css or slides/${id}.css.` : ""}`);
  for (const [, attr] of html.matchAll(/\s([a-zA-Z_:][\w:.-]*)\s*=\s*["']/g)) if (!ATTRS.has(attr.toLowerCase()) && !attr.startsWith("aria-")) errors.push(`${at}: ${attr}= is stripped by DocSync.${attr.startsWith("data-") ? " Use classes (sN for build steps) or CSS custom properties in style=." : ""}`);
  for (const [, src] of html.matchAll(/<img[^>]*\ssrc\s*=\s*["']([^"']+)["']/g)) {
    if (/^(https?:|\/\/)/.test(src)) errors.push(`${at}: external image ${src} is blocked; save it locally and upload it with upload_media.`);
    else if (!src.startsWith("/media/") && !existsSync(join(directory, src))) errors.push(`${at}: image ${src} does not exist.`);
  }
  if (/<img(?![^>]*\salt\s*=\s*["'][^"']+)/.test(html)) warnings.push(`${at}: give every <img> descriptive alt text.`);
  if (!/<h[123][\s>]/.test(html)) warnings.push(`${at}: add an <h1>–<h3> heading.`);
  if (slide && !classes.has("speaker-notes")) warnings.push(`${at}: add <aside class="speaker-notes" title="Presenter · ≈ 60 s">…</aside>.`);
  if (classes.has("motion")) {
    const steps = [...classes].map(c => /^s(\d{1,2})$/.exec(c)).filter(Boolean).map(m => +m[1]);
    const max = Math.max(0, ...steps);
    for (let k = 1; k <= max; k++) if (!steps.includes(k)) warnings.push(`${at}: no element uses step s${k}; the build pauses for a beat.`);
    if (max > 8) warnings.push(`${at}: ${max} build steps; more than 8 usually means two ideas on one slide.`);
  } else if ([...classes].some(c => /^s\d{1,2}$/.test(c) || c === "wire")) warnings.push(`${at}: uses motion classes but its root lacks class "motion", so nothing will animate.`);
  const words = html.replace(/<aside class="speaker-notes"[\s\S]*?<\/aside>/g, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
  if (slide && words > 120) warnings.push(`${at}: ${words} visible words; move detail into speaker notes.`);
  const leftover = LEFTOVERS.find(p => html.includes(p));
  if (leftover) warnings.push(`${at}: sample text "${leftover}" is still present.`);
  if (classes.has("fig-ph")) warnings.push(`${at}: figure placeholder (.fig-ph) not replaced yet.`);
  for (const [, elementId] of html.matchAll(/\sid="([^"]+)"/g)) {
    if (ids.has(elementId)) errors.push(`${at}: id "${elementId}" is also used in section "${ids.get(elementId)}".`);
    else ids.set(elementId, id);
  }
}
const extras = existsSync(join(directory, "slides")) ? readdirSync(join(directory, "slides")) : [];
for (const file of ["styles.css", ...extras.filter(f => f.endsWith(".css")).map(f => `slides/${f}`)]) {
  if (existsSync(join(directory, file)) && /url\s*\(|@import|@font-face/i.test(readFileSync(join(directory, file), "utf8"))) errors.push(`${file}: url(), @import and @font-face are rejected by DocSync.`);
}
for (const file of extras) {
  if (!sections.some(s => `${s.id}.css` === file || `${s.id}.js` === file)) warnings.push(`slides/${file}: no section with that id; the file is never used.`);
  if (file.endsWith(".js") && /\b(fetch|XMLHttpRequest|eval|localStorage|parent\.)/.test(readFileSync(join(directory, "slides", file), "utf8"))) errors.push(`slides/${file}: network, eval, storage and parent access are blocked in DocSync.`);
}

// Layout audit and screenshots run in a temporary copy of index.html next to the original, so relative links resolve.
const AUDIT = `<script>addEventListener('load',()=>setTimeout(()=>{const out=[];const roots=[...document.querySelectorAll('.slide,.page')];
roots.forEach((root,i)=>{const was=root.hidden;root.hidden=false;window.DocSyncMotion&&root.classList.contains('motion')&&DocSyncMotion.finish(root);
const label=(root.classList.contains('slide')?'slide ':'page ')+(i+1)+(root.id?' #'+root.id:'');const frame=root.getBoundingClientRect();
const name=n=>n.tagName.toLowerCase()+(n.classList.length?'.'+[...n.classList].slice(0,3).join('.'):'')+' "'+n.textContent.trim().replace(/\\s+/g,' ').slice(0,40)+'"';
for(const n of root.querySelectorAll('*')){if(n.closest('svg,.speaker-notes,.wire'))continue;const s=getComputedStyle(n);if(s.display==='none')continue;const r=n.getBoundingClientRect();if(!r.width||!r.height)continue;
if(root.classList.contains('slide')&&(r.left<frame.left-1||r.top<frame.top-1||r.right>frame.right+1||r.bottom>frame.bottom+1))out.push({where:label,type:'outside-canvas',element:name(n)});
if(s.display!=='inline'&&s.overflow==='visible'&&n.style.height&&n.clientHeight&&(n.scrollHeight>n.clientHeight+3||n.scrollWidth>n.clientWidth+3))out.push({where:label,type:'text-overflows-box',element:name(n)});}
const runs=[];const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);for(let t=w.nextNode();t;t=w.nextNode()){if(!t.textContent.trim()||t.parentElement.closest('svg,.speaker-notes,.wire'))continue;const g=document.createRange();g.selectNodeContents(t);for(const r of g.getClientRects())if(r.width>1&&r.height>1)runs.push({t,r});}
const seen=new Set();for(let a=0;a<runs.length;a++)for(let b=a+1;b<runs.length;b++){const A=runs[a],B=runs[b];const pa=A.t.parentElement,pb=B.t.parentElement;if(pa===pb||pa.contains(pb)||pb.contains(pa))continue;const x=Math.min(A.r.right,B.r.right)-Math.max(A.r.left,B.r.left),y=Math.min(A.r.bottom,B.r.bottom)-Math.max(A.r.top,B.r.top);const k=name(A.t.parentElement)+' <> '+name(B.t.parentElement);if(x>3&&y>4&&!seen.has(k)){seen.add(k);out.push({where:label,type:'text-overlap',element:k});}}
root.hidden=was;});const p=document.createElement('pre');p.id='ds-check-report';p.textContent=JSON.stringify({count:roots.length,issues:out});document.body.append(p);},300));</script>`;
const SHOT_CSS = "<style>#ds-toolbar,#ds-progress,#ds-float-bar{display:none!important}html,body{margin:0!important;padding:0!important;background:#fff!important}.slide{margin:0!important;box-shadow:none!important}</style>";
const chrome = [process.env.CHROME_PATH, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean).find(c => { try { execFileSync(c, ["--version"], { stdio: "ignore" }); return true; } catch { return false; } });
const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--no-first-run", "--window-size=1280,720", "--virtual-time-budget=6000"];
let audited = 0;
if (!chrome) warnings.push("Chrome/Chromium not found (set CHROME_PATH): skipped the layout audit and screenshots.");
else {
  const page = join(directory, ".docsync-check.html");
  try {
    writeFileSync(page, source.replace(/<\/body>/i, `${AUDIT}</body>`));
    const dom = execFileSync(chrome, [...args, "--dump-dom", pathToFileURL(page).href + "?static"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
    const json = [...dom.matchAll(/<pre id="ds-check-report">([\s\S]*?)<\/pre>/g)].pop()?.[1];
    if (!json) errors.push("The layout audit produced no report: open index.html and check the browser console.");
    else {
      const report = JSON.parse(json.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      audited = report.issues.length;
      for (const issue of report.issues) warnings.push(`${issue.where}: ${issue.type} — ${issue.element}`);
    }
    const shots = flag("--shots");
    if (shots && sections.some(s => classesIn(s.html).has("slide"))) {
      const only = flag("--slides")?.split(",").map(Number);
      mkdirSync(shots, { recursive: true });
      writeFileSync(page, source.replace(/<\/head>/i, `${SHOT_CSS}</head>`));
      sections.forEach((_, i) => {
        if (only && !only.includes(i + 1)) return;
        execFileSync(chrome, [...args, `--screenshot=${join(resolve(shots), `slide-${String(i + 1).padStart(2, "0")}.png`)}`, `${pathToFileURL(page).href}?static#${i + 1}`], { stdio: "ignore" });
      });
      console.log(`Screenshots (final build state) → ${resolve(shots)}`);
    }
  } finally { rmSync(page, { force: true }); }
}
for (const w of warnings) console.error(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(`${sections.length} sections: ${errors.length} errors, ${warnings.length} warnings (${audited} from the layout audit)`);
process.exit(errors.length ? 2 : 0);
