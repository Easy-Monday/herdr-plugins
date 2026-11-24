import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Story #56, AC-3.
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");

test("T-3: should find \"right\" placement text in README.md and no \"place: none\" or \"ships with\" claim", () => {
  const sentences = readme.split(/(?<=[.!?:])\s+|\n\s*\n/);
  assert.ok(sentences.some((s) => /\bdock/i.test(s) && /\bright\b/i.test(s)), "no sentence says the board docks right");
  assert.doesNotMatch(readme, /"?place"?:\s*"?none/i);
  assert.doesNotMatch(readme, /ships with/i);
});
