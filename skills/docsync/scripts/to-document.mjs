import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

export function toDocument(directory, title) {
  if (!directory || !title?.trim() || title.length > 200) throw new Error("Document title must contain 1–200 characters.");
  const source = readFileSync(join(directory, "index.html"), "utf8");
  const presentation = /class=["'][^"']*\bslide\b/.test(source);
  const css = readFileSync(join(directory, "..", "charts.css"), "utf8") + "\n" + (presentation ? readFileSync(join(directory, "..", "presentation-base.css"), "utf8") + "\n" : "") + readFileSync(join(directory, "styles.css"), "utf8");
  const js = readFileSync(join(directory, "..", presentation ? "slides.js" : "preview.js"), "utf8");
  const optional = (id, extension) => {
    const file = join(directory, "slides", `${id}.${extension}`);
    return existsSync(file) ? "\n" + readFileSync(file, "utf8") : "";
  };
  const sections = [...source.matchAll(/<!-- docsync:([a-zA-Z0-9_-]{1,80}) -->\s*([\s\S]*?)\s*<!-- \/docsync -->/g)]
    .map(([, id, html]) => ({ id, kind: "html", html, css: css + optional(id, "css"), js: js + optional(id, "js") }));
  if (!sections.length || sections.length > 40 || (source.match(/<!-- docsync:/g) || []).length !== sections.length || (source.match(/<!-- \/docsync -->/g) || []).length !== sections.length || new Set(sections.map(s => s.id)).size !== sections.length || sections.some(s => s.html.length > 100_000 || s.css.length > 30_000 || s.js.length > 50_000)) {
    throw new Error("Use 1–40 uniquely marked sections within DocSync size limits.");
  }
  const content = { title: title.trim(), format: presentation ? "presentation" : "document", sections };
  if (Buffer.byteLength(JSON.stringify(content)) > 500_000) throw new Error("Document exceeds 500 KB.");
  return content;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, title] = process.argv.slice(2);
  if (!directory || !title) {
    console.error('Usage: node to-document.mjs TEMPLATE_DIRECTORY "Document title (1–200 characters)"');
    process.exit(1);
  }
  console.log(JSON.stringify(toDocument(directory, title), null, 2));
}
