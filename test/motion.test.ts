import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parseFragment, serialize } from "parse5";
import { validateContent } from "../src/content.ts";
import { toDocument } from "../skills/docsync/scripts/to-document.mjs";
import { classesIn, pruneCss, pruneFeatures, pruneIcons } from "../skills/docsync/scripts/prune.mjs";

const root = "skills/docsync/assets/templates";

test("motion sections get a pruned runtime that survives hosted sanitization", () => {
  const deck = toDocument(join(root, "research-talk"), "Research talk");
  assert.equal(deck.format, "presentation");
  assert.ok(deck.sections.length >= 20);
  assert.ok(Buffer.byteLength(JSON.stringify(deck)) < 500_000);
  const validated = validateContent(deck);
  deck.sections.forEach((section: { id: string; html: string; css: string; js: string }, i: number) => {
    assert.equal(validated.sections[i].html, serialize(parseFragment(section.html)), `${section.id}: HTML must survive sanitization`);
    assert.match(section.js, /DocSyncMotion/);
    assert.match(section.js, /prefers-reduced-motion/);
    assert.ok(section.css.length < 30_000 && section.js.length < 50_000);
  });
  const agenda = deck.sections.find((s: { id: string }) => s.id === "agenda");
  const architecture = deck.sections.find((s: { id: string }) => s.id === "architecture");
  assert.ok(!agenda.js.includes("FEATURES.wires ="), "slides without wires do not carry the wire feature");
  assert.match(architecture.js, /FEATURES\.wires =/);
  assert.match(architecture.js, /server:/);
  assert.ok(!architecture.js.includes("battery:"), "unused icons are pruned");
  assert.match(architecture.css, /#architecture \.slots/);
  assert.ok(!agenda.css.includes("#architecture"), "slide CSS stays with its slide");
});

test("templates without motion sections are not given the runtime", () => {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "research-talk") continue;
    for (const section of toDocument(join(root, entry.name), "Plain").sections) {
      assert.ok(!section.js.includes("DocSyncMotion"), `${entry.name}/${section.id}`);
      assert.ok(!section.css.includes(".mo-js"), `${entry.name}/${section.id}`);
    }
  }
});

test("pruning keeps rules, icons and features a section uses", () => {
  const classes = classesIn('<article class="slide motion"><span class="wire f s1"></span><span class="ic i-check"></span></article>');
  const css = pruneCss(".a{color:red}.wire{display:none}.motion .f.in{opacity:1}@media print{.b{x:y}.slide{z:1}}@keyframes gone{to{opacity:0}}", classes);
  assert.equal(css, ".wire{display:none}.motion .f.in{opacity:1}@media print{.slide{z:1}}");
  const js = "/*@icons*/\nconst ICONS = {\n  check: 'c',\n  x: 'x',\n};\n/*@end-icons*/\n/*@feature wire*/W/*@end-feature*/\n/*@feature nnet*/N/*@end-feature*/";
  const pruned = pruneFeatures(pruneIcons(js, classes), classes);
  assert.match(pruned, /check: 'c'/);
  assert.ok(!pruned.includes("x: 'x'"));
  assert.match(pruned, /W/);
  assert.ok(!pruned.includes("N/*"));
});
