// Bundle the DocSync skill guide and the motion runtime into a JSON module that the Worker and the stdio
// MCP bridge import. Agents connected only through MCP receive the skill from get_docsync_skill, and the
// server injects the motion runtime into saved sections, so nothing has to be installed locally.
// It also carries the research-talk pattern slides and styles: get_slide_patterns serves them, and the server
// attaches the styles to slides whose root has class "research".
// Run by `npm run build`; test/motion.test.ts fails when the committed file is stale.
import { readFileSync, writeFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../skills/docsync/${path}`, import.meta.url), "utf8");

// Pattern catalog rows come from the table in references/research-talk.md, so the docs stay the single source.
function patterns() {
  const index = read("assets/templates/research-talk/index.html");
  const table = new Map([...read("references/research-talk.md").matchAll(/^\| `([\w-]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)]
    .map(([, id, use, blocks, builds]) => [id, { use: use.trim(), blocks: blocks.trim(), builds: builds.trim() }]));
  return [...index.matchAll(/<!-- docsync:([\w-]+) -->\s*([\s\S]*?)\s*<!-- \/docsync -->/g)].map(([, id, html]) => {
    const row = table.get(id);
    if (!row) throw new Error(`Pattern "${id}" is missing from the table in references/research-talk.md`);
    return { id, ...row, html };
  });
}

export function skillAssets() {
  return {
    researchCss: read("assets/templates/research-talk/styles.css"),
    patterns: patterns(),
    motionJs: read("assets/templates/motion.js"),
    motionCss: read("assets/templates/motion.css"),
    guide: {
      overview: read("SKILL.md").replace(/^---[\s\S]*?---\s*/, ""),
      motion: read("references/motion.md"),
      "research-talk": read("references/research-talk.md"),
      mcp: read("references/mcp.md"),
    },
  };
}

export const SKILL_ASSETS_PATH = new URL("../src/generated/skill-assets.json", import.meta.url);

export function writeSkillAssets() {
  writeFileSync(SKILL_ASSETS_PATH, JSON.stringify(skillAssets(), null, 1) + "\n");
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) writeSkillAssets();
