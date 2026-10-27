import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";

export function buildSkill() {
  const source = "skills/docsync";
  const destination = "dist/public/downloads";
  mkdirSync(destination, { recursive: true });
  cpSync(source, join(destination, "docsync"), { recursive: true });
  const files = {};
  function collect(directory, prefix) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      const name = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) collect(path, name);
      else if (entry.isFile()) files[name] = readFileSync(path);
      else throw new Error(`Unsupported skill entry: ${path}`);
    }
  }
  collect(source, "docsync");
  writeFileSync(join(destination, "docsync-skill.zip"), zipSync(files));
  console.log(`Packaged DocSync skill and templates (${Object.keys(files).length} files).`);
}
