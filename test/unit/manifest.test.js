import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Story #58.
const mod = JSON.parse(readFileSync(new URL("../../mods/project-board/mod.json", import.meta.url), "utf8"));
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");

// The keys Herdr documents for mod.json (~/.config/herdr-app/AGENTS.md, "Mods").
// Add a key here only when the PR shows Herdr accepts it (`npm run check` output).
const ALLOWED_KEYS = ["place", "size", "focusable", "overlay", "title"];

// The README section whose heading names `mod.json`, up to the next heading of the same or a higher level.
function manifestSection(md) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => /^#{1,6}\s.*mod\.json/i.test(l));
  if (start === -1) return null;
  const level = lines[start].match(/^#+/)[0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => {
    const m = l.match(/^(#{1,6})\s/);
    return m && m[1].length <= level;
  });
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

test("T-1: should hold only keys from a named allowlist in mods/project-board/mod.json, the allowlist being the documented keys plus any the PR confirms Herdr accepts", () => {
  const extra = Object.keys(mod).filter((k) => !ALLOWED_KEYS.includes(k));
  assert.deepEqual(extra, [], `mods/project-board/mod.json keys not in ALLOWED_KEYS: ${extra.join(", ")}`);
});

test("T-2: should find every key of mods/project-board/mod.json named in the README manifest section", () => {
  const section = manifestSection(readme);
  assert.ok(section !== null, "README has no heading that names mod.json");
  const missing = Object.keys(mod).filter((k) => !section.includes(`\`${k}\``));
  assert.deepEqual(missing, [], `mod.json keys not named in the README manifest section: ${missing.join(", ")}`);
});
