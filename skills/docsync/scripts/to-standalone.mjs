#!/usr/bin/env node
// Bundle a template folder into ONE self-contained HTML file for offline presenting or sending:
// local stylesheets, scripts and images are inlined; preview.js supplies navigation, notes and print.
// Usage: node to-standalone.mjs TEMPLATE_DIRECTORY [OUT.html]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
const local = href => !/^(https?:|data:|\/\/|\/)/.test(href);

export function toStandalone(directory) {
  const read = href => readFileSync(join(directory, href), "utf8");
  return read("index.html")
    .replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/g, (tag, href) => local(href) ? `<style>\n${read(href)}\n</style>` : tag)
    .replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*><\/script>/g, (tag, src) => local(src) ? "" : tag)
    .replace(/<\/body>/, () => {
      const scripts = [...read("index.html").matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*><\/script>/g)].map(m => m[1]).filter(local);
      return scripts.map(src => `<script>\n${read(src).replace(/<\/script/gi, "<\\/script")}\n</script>`).join("\n") + "\n</body>";
    })
    .replace(/(<img\b[^>]*\ssrc\s*=\s*)(["'])([^"']+)\2/g, (tag, start, quote, src) => {
      const type = MIME[extname(src).toLowerCase()];
      return local(src) && type ? `${start}${quote}data:${type};base64,${readFileSync(join(directory, src)).toString("base64")}${quote}` : tag;
    });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, out] = process.argv.slice(2);
  if (!directory) { console.error("Usage: node to-standalone.mjs TEMPLATE_DIRECTORY [OUT.html]"); process.exit(1); }
  const target = resolve(out || join(dirname(resolve(directory)), "standalone.html"));
  const html = toStandalone(directory);
  writeFileSync(target, html);
  console.log(`Wrote ${target} (${(Buffer.byteLength(html) / 1000).toFixed(0)} kB)`);
}
