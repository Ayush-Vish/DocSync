import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { buildSkill } from "./build-skill.mjs";
import {
  chmodSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
await viteBuild();
const results = await Promise.all([
  build({
    entryPoints: ["src/worker.ts"],
    outfile: "dist/worker.mjs",
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
  }),
  build({
    entryPoints: ["src/mcp.ts"],
    outfile: "dist/mcp.mjs",
    bundle: true,
    packages: "external",
    format: "esm",
    platform: "node",
    target: "node22",
  }),
  build({
    entryPoints: ["src/mcp.ts"],
    outfile: "dist/docsync-mcp.cjs",
    banner: { js: "#!/usr/bin/env node" },
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node22",
    minify: true,
    legalComments: "eof",
    metafile: true,
  }),
]);
const packageRoots = new Set();
for (const input of Object.keys(results[2].metafile.inputs)) {
  if (!input.startsWith("node_modules/")) continue;
  let directory = dirname(resolve(input));
  while (directory !== dirname(directory)) {
    const manifest = join(directory, "package.json");
    if (
      existsSync(manifest) &&
      JSON.parse(readFileSync(manifest, "utf8")).name
    ) {
      packageRoots.add(directory);
      break;
    }
    directory = dirname(directory);
  }
}
const notices = [];
for (const directory of packageRoots) {
  const name = JSON.parse(
    readFileSync(join(directory, "package.json"), "utf8"),
  ).name;
  for (const file of readdirSync(directory).filter((file) =>
    /^licen[cs]e(?:\..*)?$/i.test(file),
  ))
    notices.push(`${name}\n${readFileSync(join(directory, file), "utf8")}`);
}
writeFileSync("dist/MCP-LICENSES.txt", notices.join("\n\n---\n\n"));
const mcpPath = resolve("dist/docsync-mcp.cjs");
writeFileSync(
  "dist/mcp-config.json",
  JSON.stringify(
    { mcpServers: { docsync: { command: "node", args: [mcpPath] } } },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  "dist/codex-mcp.toml",
  `[mcp_servers.docsync]\ncommand = "node"\nargs = [${JSON.stringify(mcpPath)}]\nstartup_timeout_sec = 20\n`,
);
console.log(
  "Built editor, Worker, standalone MCP server, and client configuration examples.",
);

mkdirSync("dist/public/downloads", { recursive: true });
copyFileSync("dist/docsync-mcp.cjs", "dist/public/downloads/docsync-mcp.cjs");
for (const name of ["docsync-mcp.cjs", "MCP-LICENSES.txt"])
  copyFileSync(`dist/${name}`, `packages/mcp/${name}`);
chmodSync("packages/mcp/docsync-mcp.cjs", 0o755);
buildSkill();
