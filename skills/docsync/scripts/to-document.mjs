import { readFileSync } from "node:fs";
import { join } from "node:path";

const [directory, title] = process.argv.slice(2);
if (!directory || !title?.trim() || title.length > 200) {
  console.error('Usage: node to-document.mjs TEMPLATE_DIRECTORY "Document title (1–200 characters)"');
  process.exit(1);
}
const source = readFileSync(join(directory, "index.html"), "utf8");
const css = readFileSync(join(directory, "..", "charts.css"), "utf8") + "\n" + readFileSync(join(directory, "styles.css"), "utf8");
const js = readFileSync(join(directory, "..", "preview.js"), "utf8");
const sections = [...source.matchAll(/<!-- docsync:([a-zA-Z0-9_-]{1,80}) -->\s*([\s\S]*?)\s*<!-- \/docsync -->/g)]
  .map(([, id, html]) => ({ id, kind: "html", html, css, js }));
if (!sections.length || sections.length > 40 || (source.match(/<!-- docsync:/g) || []).length !== sections.length || (source.match(/<!-- \/docsync -->/g) || []).length !== sections.length || new Set(sections.map(s => s.id)).size !== sections.length || sections.some(s => s.html.length > 100_000) || css.length > 30_000 || js.length > 50_000) {
  throw new Error("Use 1–40 uniquely marked sections within DocSync size limits.");
}
const payload = JSON.stringify({ title, sections }, null, 2);
if (Buffer.byteLength(payload) > 500_000) throw new Error("Document exceeds 500 KB.");
console.log(payload);
