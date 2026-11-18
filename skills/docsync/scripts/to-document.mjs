import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { classesIn, minifyCss, motionRuntime, pruneCss } from "./prune.mjs";

// media: optional {"figures/fig3.png": "/media/<asset-id>"} map from upload_media results for local <img> paths.
export function toDocument(directory, title, media = {}) {
  if (!directory || !title?.trim() || title.length > 200) throw new Error("Document title must contain 1–200 characters.");
  const source = readFileSync(join(directory, "index.html"), "utf8");
  const presentation = [...source.matchAll(/\sclass\s*=\s*(["'])(.*?)\1/gis)].some(match => match[2].split(/\s+/).includes("slide"));
  const shared = file => readFileSync(join(directory, "..", file), "utf8");
  const parts = [shared("charts.css"), ...(presentation ? [shared("presentation-base.css")] : []), readFileSync(join(directory, "styles.css"), "utf8")];
  const css = parts.join("\n");
  const js = shared(presentation ? "slides.js" : "preview.js");
  const optional = (id, extension) => {
    const file = join(directory, "slides", `${id}.${extension}`);
    return existsSync(file) ? "\n" + readFileSync(file, "utf8") : "";
  };
  // Sections with class "motion" get the motion runtime. Their shared CSS, and any stylesheet that starts with
  // "/* docsync:prune", is tree-shaken to the classes that section uses so long animated decks fit the 500 KB limit.
  const motionCss = shared("motion.css"), motionJs = shared("motion.js");
  const prunable = text => text.startsWith("/* docsync:prune");
  const sections = [...source.matchAll(/<!-- docsync:([a-zA-Z0-9_-]{1,80}) -->\s*([\s\S]*?)\s*<!-- \/docsync -->/g)]
    .map(([, id, html]) => {
      html = html.replace(/(<img\b[^>]*\ssrc\s*=\s*)(["'])([^"']+)\2/g, (tag, start, quote, src) => media[src] ? `${start}${quote}${media[src]}${quote}` : tag);
      const classes = classesIn(html);
      if (!classes.has("motion")) return { id, kind: "html", html, css: (parts.some(prunable) ? parts.map(p => prunable(p) ? pruneCss(p, classes) : p).join("\n") : css) + optional(id, "css"), js: js + optional(id, "js") };
      const sectionCss = [...parts, motionCss].map(p => pruneCss(p, classes)).join("") + minifyCss(optional(id, "css"));
      return { id, kind: "html", html, css: sectionCss, js: js + "\n;\n" + motionRuntime(motionJs, classes) + optional(id, "js") };
    });
  if (!sections.length || sections.length > 40 || (source.match(/<!-- docsync:/g) || []).length !== sections.length || (source.match(/<!-- \/docsync -->/g) || []).length !== sections.length || new Set(sections.map(s => s.id)).size !== sections.length || sections.some(s => s.html.length > 100_000 || s.css.length > 30_000 || s.js.length > 50_000)) {
    throw new Error("Use 1–40 uniquely marked sections within DocSync size limits.");
  }
  const content = { title: title.trim(), format: presentation ? "presentation" : "document", sections };
  if (Buffer.byteLength(JSON.stringify(content)) > 500_000) throw new Error("Document exceeds 500 KB.");
  return content;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--media");
  const media = at >= 0 ? JSON.parse(readFileSync(argv[at + 1], "utf8")) : {};
  const [directory, title] = argv.filter((arg, i) => at < 0 || (i !== at && i !== at + 1));
  if (!directory || !title) {
    console.error('Usage: node to-document.mjs TEMPLATE_DIRECTORY "Document title (1–200 characters)" [--media media.json]');
    process.exit(1);
  }
  console.log(JSON.stringify(toDocument(directory, title, media), null, 2));
}
