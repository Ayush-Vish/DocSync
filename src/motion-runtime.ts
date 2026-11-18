// Server-side motion support: any agent can animate a slide or page by writing class names only.
// On save, sections whose HTML uses class "motion" receive the shared motion runtime (motion.js + motion.css),
// pruned to the icons, features and rules that section uses. Earlier injected copies are removed first, so a
// re-saved document always carries the current runtime and never accumulates duplicates.
import assets from "./generated/skill-assets.json" with { type: "json" };
import { MOTION_END, MOTION_START, classesIn, motionRuntime, pruneCss, stripMotionRuntime } from "../skills/docsync/scripts/prune.mjs";
import { HttpError, type Content } from "./content.ts";

type RawSection = { js?: unknown; css?: unknown; [key: string]: unknown };

/** Remove previously injected runtime blocks from raw input, before validation and sanitizing. */
export function withoutMotionRuntime(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const strip = (sections: unknown) => Array.isArray(sections) ? sections.map(section => {
    if (!section || typeof section !== "object") return section;
    const { js, css } = section as RawSection;
    return { ...(section as RawSection), ...(typeof js === "string" ? { js: stripMotionRuntime(js).replace(/\n;\n$/, "") } : {}), ...(typeof css === "string" ? { css: stripMotionRuntime(css) } : {}) };
  }) : sections;
  const value = input as { sections?: unknown; pages?: unknown };
  return { ...value, ...(value.sections ? { sections: strip(value.sections) } : {}), ...(value.pages ? { pages: strip(value.pages) } : {}) };
}

/** Add the pruned motion runtime to every validated section that opts in with class "motion". */
export function withMotionRuntime(content: Content): Content {
  const sections = content.sections.map(section => {
    const classes = classesIn(section.html);
    const js = section.js ?? "";
    // A hand-bundled runtime without markers is left alone; motion.js also guards against double loading.
    if (!classes.has("motion") || js.includes("DocSyncMotion")) return section;
    const next = {
      ...section,
      css: section.css + MOTION_START + pruneCss(assets.motionCss, classes) + MOTION_END,
      js: (js ? js + "\n;\n" : "") + MOTION_START + motionRuntime(assets.motionJs, classes) + MOTION_END,
    };
    if (next.css.length > 30_000 || next.js.length > 50_000) throw new HttpError(400, `Section '${section.id}' exceeds the CSS (30,000) or JavaScript (50,000) character limit once the motion runtime is added. Move shared CSS out of this section or shorten its script.`);
    return next;
  });
  const result = { ...content, sections };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 500_000) throw new HttpError(413, "Document exceeds 500 KB once the motion runtime is added to its animated sections. Remove slides or split the deck.");
  return result;
}
