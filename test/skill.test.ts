import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync, truncateSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { unzipSync } from "fflate";
import { parseFragment, serialize } from "parse5";
import { validateContent } from "../src/content.ts";
import { fixture } from "./helpers.ts";
import { handle } from "../src/worker.ts";

test("skill media helper preserves binary bytes and produces hosted upload fields", t => {
  const directory = mkdtempSync(join(tmpdir(), "docsync-base64-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==", "base64");
  const path = join(directory, "犬 portrait.PNG");
  writeFileSync(path, bytes);
  const cli = JSON.parse(execFileSync(process.execPath, ["skills/docsync/scripts/media-to-base64.mjs", path], { encoding: "utf8" }));
  const imported = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", "import {mediaToBase64} from './skills/docsync/scripts/media-to-base64.mjs'; console.log(JSON.stringify(await mediaToBase64(process.argv[1])));", path], { encoding: "utf8" }));
  assert.deepEqual(cli, imported);
  assert.equal(cli.filename, "犬 portrait.PNG");
  assert.equal(cli.mimeType, "image/png");
  assert.match(cli.dataBase64, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.deepEqual(Buffer.from(cli.dataBase64, "base64"), bytes);
  for (const [extension, expected] of [["jpg", "image/jpeg"], ["gif", "image/gif"], ["webp", "image/webp"], ["mp4", "video/mp4"], ["webm", "video/webm"]]) {
    const file = join(directory, `media.${extension}`); writeFileSync(file, bytes);
    const payload = JSON.parse(execFileSync(process.execPath, ["skills/docsync/scripts/media-to-base64.mjs", file], { encoding: "utf8" }));
    assert.equal(payload.mimeType, expected);
  }
  const empty = join(directory, "empty.png"); writeFileSync(empty, "");
  const large = join(directory, "large.png"); writeFileSync(large, ""); truncateSync(large, 8 * 1024 * 1024 + 1);
  const folder = join(directory, "directory.png"); mkdirSync(folder);
  for (const input of [empty, large, folder, join(directory, "image.svg")]) {
    assert.throws(() => execFileSync(process.execPath, ["skills/docsync/scripts/media-to-base64.mjs", input], { stdio: "pipe" }), error => {
      assert.equal((error as { stdout: Buffer }).stdout.length, 0, "Rejected inputs never emit a partial payload");
      return true;
    });
  }
});

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

test("selectable theme payloads match the downloadable template catalog", () => {
  const themes = JSON.parse(readFileSync("skills/docsync/themes.json", "utf8")) as { id: string; title: string }[];
  assert.ok(themes.length >= 5);
  for (const theme of themes) {
    const expected = JSON.parse(execFileSync(process.execPath, ["skills/docsync/scripts/to-document.mjs", join("skills/docsync/assets/templates", theme.id), theme.title], { encoding: "utf8" }));
    const generated = JSON.parse(readFileSync(join("dist/public/downloads/docsync/themes", `${theme.id}.json`), "utf8"));
    assert.deepEqual(generated, expected);
  }
});

test("presentation templates have independent slide payloads and scoped script/style overrides", () => {
  const deck = JSON.parse(execFileSync(process.execPath, ['skills/docsync/scripts/to-document.mjs', 'skills/docsync/assets/templates/pitch-deck', 'Animated pitch'], { encoding: 'utf8' }));
  assert.equal(deck.format, 'presentation');
  assert.equal(deck.sections.length, 6);
  const traction = deck.sections.find((section: { id: string }) => section.id === 'pitch-traction');
  const solution = deck.sections.find((section: { id: string }) => section.id === 'pitch-solution');
  assert.match(traction.css, /#traction-count/);
  assert.match(traction.js, /const count =/);
  assert.ok(!solution.css.includes('#traction-count'));
  assert.ok(!solution.js.includes('const count ='));
  assert.match(solution.js, /workflow-next/);
  for (const slide of deck.sections) {
    assert.match(slide.js, /prefers-reduced-motion/);
    assert.ok(!slide.js.includes('ds-grid-overlay'), 'Hosted slides use the host player, without a second navigation toolbar');
  }
});
