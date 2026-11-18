// Size helpers for motion sections. Every DocSync section is isolated, so shared CSS and the motion runtime are
// copied into each one; pruning keeps a 30-slide deck inside the 500 KB document limit. Dependency-free.

export const classesIn = html => new Set([...html.matchAll(/\sclass\s*=\s*(["'])(.*?)\1/gis)].flatMap(m => m[2].split(/\s+/).filter(Boolean)));

// Classes added at run time by motion.js, preview.js and slide scripts. Rules that need them must survive.
const RUNTIME_CLASSES = new Set(["mo-js", "mo-on", "mo-ov", "mo-pkt", "pb", "in", "dr", "f", "active", "slide", "page"]);

export const minifyCss = css => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{};,>])\s*/g, "$1").replace(/;}/g, "}").trim();

// Removes whole-line comments and indentation only, so strings and regular expressions are never touched.
export const minifyJs = js => js.replace(/^[ \t]*\/\*(?:(?!\*\/)[\s\S])*\*\/[ \t]*$/gm, "").split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("//")).join("\n");

/** Tree-shake CSS: drop rules whose every selector needs a class the section never uses. */
export function pruneCss(css, classes) {
  const has = name => classes.has(name) || RUNTIME_CLASSES.has(name);
  const needed = selector => [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].every(m => has(m[1]));
  const blocks = text => {
    const out = [];
    for (let i = 0; i < text.length;) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      let depth = 1, j = open + 1;
      while (j < text.length && depth) { if (text[j] === "{") depth++; else if (text[j] === "}") depth--; j++; }
      out.push([text.slice(i, open).trim(), text.slice(open + 1, j - 1)]);
      i = j;
    }
    return out;
  };
  const shake = text => blocks(text).map(([prelude, body]) => {
    if (/^@(media|supports|container|layer)\b/.test(prelude)) { const inner = shake(body); return inner ? `${prelude}{${inner}}` : ""; }
    if (prelude.startsWith("@")) return `${prelude}{${body}}`;
    const kept = prelude.split(",").filter(needed);
    return kept.length ? `${kept.join(",")}{${body}}` : "";
  }).join("");
  const result = shake(minifyCss(css));
  // Drop keyframes that no surviving rule refers to.
  return result.replace(/@keyframes ([\w-]+)\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, (rule, name) => result.replace(rule, "").includes(name) ? rule : "");
}

/** Keep only the icon definitions referenced by .i-NAME classes. */
export const pruneIcons = (js, classes) => js.replace(/(\/\*@icons\*\/[\s\S]*?const ICONS = \{\n)([\s\S]*?)(\n\s*\};\n\s*\/\*@end-icons\*\/)/, (_, start, body, end) =>
  start + body.split("\n").filter(line => { const m = /^\s*([\w-]+):/.exec(line); return m && classes.has("i-" + m[1]); }).join("\n") + end);

/** Drop @feature blocks whose trigger class does not occur in the section. */
export const pruneFeatures = (js, classes) => js.replace(/\/\*@feature ([\w-]+)\*\/[\s\S]*?\/\*@end-feature\*\//g, (block, name) => classes.has(name) ? block : "");

/** The motion runtime trimmed to what one section uses. */
export const motionRuntime = (js, classes) => minifyJs(pruneFeatures(pruneIcons(js, classes), classes));
