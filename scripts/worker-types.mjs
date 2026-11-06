import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const output = "src/cloudflare-env.d.ts";
execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "types", output, "--env-interface", "CloudflareBindings"], { stdio: "inherit" });
// Keep Worker runtime declarations scoped to this module. The UI and Node
// adapters use their native DOM/Node types rather than Worker globals.
// Wrangler preserves custom declarations, including our export, between runs.
const declarations = readFileSync(output, "utf8")
  .replace(/^export type \{ CloudflareBindings \};\r?\n?/gm, "")
  .replace(/[\t ]+$/gm, "")
  .trimEnd();
writeFileSync(output, `${declarations}\n\nexport type { CloudflareBindings };\n`);
