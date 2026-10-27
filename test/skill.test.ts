import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { unzipSync } from "fflate";
import { parseFragment, serialize } from "parse5";
import { validateContent } from "../src/content.ts";
import { fixture } from "./helpers.ts";
import { handle } from "../src/worker.ts";

test("bundled template examples allow same-origin embedding while app pages forbid framing", async (t) => {
  const f = await fixture();
  t.after(f.close);
  for (const path of [
    "/downloads/docsync/assets/templates/pitch-deck/",
    "/downloads/docsync/assets/templates/pitch-deck/index.html",
  ]) {
    const preview = await handle(new Request(`http://127.0.0.1:8787${path}`), f.env);
    assert.match(preview.headers.get("Content-Security-Policy") || "", /frame-ancestors 'self'/);
  }
  for (const path of ["/", "/connect", "/share/example"]) {
    const response = await handle(new Request(`http://127.0.0.1:8787${path}`), f.env);
    assert.match(response.headers.get("Content-Security-Policy") || "", /frame-ancestors 'none'/);
  }
});

test("downloaded skill archive contains the complete installable source tree", () => {
  const files = unzipSync(readFileSync("dist/public/downloads/docsync-skill.zip"));
  const expected: string[] = [];
  function visit(directory: string, prefix: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) visit(path, name);
      else {
        expected.push(name);
        assert.deepEqual(Buffer.from(files[name]), readFileSync(path));
        assert.deepEqual(readFileSync(join("dist/public/downloads", name)), readFileSync(path));
      }
    }
  }
  visit("skills/docsync", "docsync");
  assert.ok(files["docsync/SKILL.md"]);
  assert.deepEqual(Object.keys(files).sort(), expected.sort());
});

test("every shipped template converts into valid DocSync sections without losing HTML", () => {
  const root = "skills/docsync/assets/templates";
  const templates = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory());
  assert.ok(templates.length >= 4);
  for (const template of templates) {
    const output = execFileSync(process.execPath, ["skills/docsync/scripts/to-document.mjs", join(root, template.name), "Test document"], { encoding: "utf8" });
    const content = JSON.parse(output);
    const validated = validateContent(content);
    assert.equal(validated.title, "Test document");
    for (let i = 0; i < content.sections.length; i++) {
      assert.equal(validated.sections[i].html, serialize(parseFragment(content.sections[i].html)), `${template.name}: HTML should survive hosted sanitization`);
      assert.ok(validated.sections[i].css.length);
      assert.equal(validated.sections[i].js, content.sections[i].js);
      assert.ok(validated.sections[i].js?.includes("addEventListener"));
    }
  }
});
