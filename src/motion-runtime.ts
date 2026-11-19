// Server-side design packs: any agent can animate a slide or page, and use the research-talk look, by writing
// class names only. On save, sections whose HTML uses class "motion" receive the shared motion runtime
// (motion.js + motion.css) and sections with class "research" receive the research-talk styles, pruned to the
// icons, features and rules that section uses. Earlier injected copies are removed first, so a
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

/**
 * Attach shared design packs to validated sections, pruned per section:
 * - class "research" on the root: the research-talk design system (the benchmark look), unless already present;
 * - class "motion": motion.css plus the motion.js runtime.
 */
export function withMotionRuntime(content: Content): Content {
  const sections = content.sections.map(section => {
    const classes = classesIn(section.html);
    const js = section.js ?? "";
    const research = classes.has("research") && !section.css.includes(".slide.research{");
    // A hand-bundled runtime without markers is left alone; motion.js also guards against double loading.
    const motion = classes.has("motion") && !js.includes("DocSyncMotion");
    if (!research && !motion) return section;
    const packCss = (research ? pruneCss(assets.researchCss, classes) : "") + (motion ? pruneCss(assets.motionCss, classes) : "");
    const next = {
      ...section,
      css: section.css + MOTION_START + packCss + MOTION_END,
      ...(motion ? { js: (js ? js + "\n;\n" : "") + MOTION_START + motionRuntime(assets.motionJs, classes) + MOTION_END } : {}),
    };
    if (next.css.length > 30_000 || (next.js ?? "").length > 50_000) throw new HttpError(400, `Section '${section.id}' exceeds the CSS (30,000) or JavaScript (50,000) character limit once the shared styles and motion runtime are added. Remove duplicated CSS from this section or shorten its script.`);
    return next;
  });
  const result = { ...content, sections };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 500_000) throw new HttpError(413, "Document exceeds 500 KB once shared styles and the motion runtime are added. Remove slides or split the deck.");
  return result;
}
