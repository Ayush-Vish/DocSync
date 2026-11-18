#!/usr/bin/env node
// Read a source PDF (paper, report, spec) with poppler-utils (pdfinfo, pdftotext, pdftoppm, pdfimages).
//   overview PDF OUT_DIR [--dpi 72]   page text (layout-preserving), page images to look at, metadata, figure/table caption index
//   crop PDF --page N --box x0,y0,x1,y1 --out FILE.png [--dpi 200]
//                                     crop a figure; box = fractions of page width/height measured on the overview image
//   images PDF OUT_DIR                extract embedded raster images as PNG (photos, screenshots)
// Install poppler: apt install poppler-utils | brew install poppler | choco install poppler
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const run = (tool, args) => {
  try { return execFileSync(tool, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error(`${tool} not found. Install poppler-utils (apt install poppler-utils, brew install poppler).`);
    throw new Error(`${tool} failed: ${(error.stderr || error.message).toString().trim()}`);
  }
};
const option = (args, name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };

function info(pdf) {
  const text = run("pdfinfo", [pdf]);
  const pages = +(/^Pages:\s+(\d+)/m.exec(text)?.[1] || 0);
  const meta = Object.fromEntries(text.split("\n").map(l => /^([\w ]+):\s+(.*)$/.exec(l)).filter(Boolean).map(m => [m[1].trim(), m[2].trim()]));
  return { pages, meta };
}
function pageSize(pdf, page) {
  const text = run("pdfinfo", ["-f", String(page), "-l", String(page), pdf]);
  const m = new RegExp(`Page\\s+${page} size:\\s+([\\d.]+) x ([\\d.]+)`).exec(text) || /Page size:\s+([\d.]+) x ([\d.]+)/.exec(text);
  if (!m) throw new Error(`Cannot read the size of page ${page}.`);
  return { w: +m[1], h: +m[2] };
}

function overview(pdf, out, dpi) {
  const { pages, meta } = info(pdf);
  mkdirSync(join(out, "pages"), { recursive: true });
  mkdirSync(join(out, "text"), { recursive: true });
  const captions = [];
  let full = "";
  for (let p = 1; p <= pages; p++) {
    const text = run("pdftotext", ["-layout", "-f", String(p), "-l", String(p), pdf, "-"]);
    const name = String(p).padStart(2, "0");
    writeFileSync(join(out, "text", `page-${name}.txt`), text);
    full += `\n\n===== PAGE ${p} =====\n${text}`;
    for (const line of text.split("\n")) {
      const m = /^\s*((?:Fig\.|Figure|TABLE|Table|Algorithm)\s*[\dIVX]+[.:]?)\s*(.*)$/.exec(line);
      if (m) captions.push({ page: p, label: m[1].trim(), text: m[2].trim().slice(0, 160) });
    }
  }
  writeFileSync(join(out, "paper.txt"), full.trim() + "\n");
  run("pdftoppm", ["-png", "-r", String(dpi), pdf, join(out, "pages", "page")]);
  for (const file of readdirSync(join(out, "pages"))) {
    const m = /^page-0*(\d+)\.png$/.exec(file);
    if (m) renameSync(join(out, "pages", file), join(out, "pages", `page-${m[1].padStart(2, "0")}.png`));
  }
  let embedded = [];
  try { embedded = run("pdfimages", ["-list", pdf]).split("\n").slice(2).filter(Boolean).map(l => l.trim().split(/\s+/)).map(c => ({ page: +c[0], width: +c[3], height: +c[4] })).filter(i => i.width >= 200 && i.height >= 120); } catch {}
  const manifest = { pdf: resolve(pdf), pages, title: meta.Title || "", author: meta.Author || "", captions, embeddedImages: embedded, pageImages: `pages/page-NN.png at ${dpi} dpi`, text: "paper.txt (all pages) and text/page-NN.txt" };
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`${pages} pages → ${out}\n${captions.length} figure/table/algorithm captions indexed in manifest.json`);
  for (const c of captions) console.log(`  p.${c.page} ${c.label} ${c.text}`);
}

function crop(pdf, args) {
  const page = +option(args, "--page"), box = (option(args, "--box") || "").split(",").map(Number), out = option(args, "--out"), dpi = +option(args, "--dpi", 200);
  if (!page || box.length !== 4 || box.some(v => !(v >= 0 && v <= 1)) || box[2] <= box[0] || box[3] <= box[1] || !out) throw new Error("crop needs --page N --box x0,y0,x1,y1 (fractions 0-1, x1>x0, y1>y0) --out FILE.png");
  const size = pageSize(pdf, page), scale = dpi / 72;
  const x = Math.round(box[0] * size.w * scale), y = Math.round(box[1] * size.h * scale);
  const w = Math.round((box[2] - box[0]) * size.w * scale), h = Math.round((box[3] - box[1]) * size.h * scale);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  run("pdftoppm", ["-png", "-singlefile", "-r", String(dpi), "-f", String(page), "-l", String(page), "-x", String(x), "-y", String(y), "-W", String(w), "-H", String(h), pdf, resolve(out).replace(/\.png$/i, "")]);
  console.log(`${out}: ${w}×${h}px from page ${page}`);
}

const [command, pdf, ...rest] = process.argv.slice(2);
try {
  if (command === "overview" && pdf && rest[0]) overview(pdf, rest[0], +option(rest, "--dpi", 72));
  else if (command === "crop" && pdf) crop(pdf, rest);
  else if (command === "images" && pdf && rest[0]) { mkdirSync(rest[0], { recursive: true }); run("pdfimages", ["-png", "-p", pdf, join(rest[0], "img")]); console.log(`Embedded images → ${rest[0]}`); }
  else { console.error("Usage:\n  node pdf-extract.mjs overview PAPER.pdf OUT_DIR [--dpi 72]\n  node pdf-extract.mjs crop PAPER.pdf --page N --box x0,y0,x1,y1 --out figures/fig1.png [--dpi 200]\n  node pdf-extract.mjs images PAPER.pdf OUT_DIR"); process.exit(1); }
} catch (error) { console.error(error.message); process.exit(1); }
