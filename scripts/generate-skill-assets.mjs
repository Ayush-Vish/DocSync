// Bundle the DocSync skill guide and the motion runtime into a JSON module that the Worker and the stdio
// MCP bridge import. Agents connected only through MCP receive the skill from get_docsync_skill, and the
// server injects the motion runtime into saved sections, so nothing has to be installed locally.
// Run by `npm run build`; test/skill-assets.test.ts fails when the committed file is stale.
import { readFileSync, writeFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../skills/docsync/${path}`, import.meta.url), "utf8");

export function skillAssets() {
  return {
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
