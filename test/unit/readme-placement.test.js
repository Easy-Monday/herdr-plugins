import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Story #64.
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const lines = readme.split("\n");

// The body under `## Install` up to the next heading of any level (same rule as readme-install.test.js).
function installSection() {
  const start = lines.findIndex((l) => /^##\s+Install\s*$/.test(l));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,6}\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

// The by-hand block (`<details>` ... `</details>` in `## Install`) plus the first sentence after it, unless a heading comes first.
function byHandText() {
  const section = installSection();
  if (section === null) return null;
  const m = section.match(/<details>[\s\S]*?<\/details>/);
  if (!m) return null;
  const after = section.slice(m.index + m[0].length).trim();
  const next = /^#/.test(after) ? "" : after.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)[0];
  return `${m[0]}\n${next}`;
}

test("T-1: should find `AGENTS.md`, the repo URL, `~/.config/herdr-app/mods/project-board`, \"panel\", \"Files and Changes\" and \"Board\" button wording in the agent-prompt quote line under `## Install` of `README.md`", () => {
  const section = installSection();
  assert.ok(section !== null, "README has no `## Install` heading");
  const prompt = section.split("\n").find((l) => /^>\s.*AGENTS\.md/.test(l));
  assert.ok(prompt, "no agent prompt (a `>` quote line naming AGENTS.md) in `## Install`");
  assert.ok(prompt.includes("https://github.com/Easy-Monday/herdr-plugins"), "the prompt doesn't name the repo URL");
  assert.ok(prompt.includes("~/.config/herdr-app/mods/project-board"), "the prompt doesn't name the install path");
  assert.match(prompt, /\bpanel\b/i, "the prompt doesn't ask for the board as a panel");
  assert.match(prompt, /\bFiles and Changes\b/i, "the prompt doesn't say \"Files and Changes\"");
  // Case-sensitive `Board` so `project-board` in the path doesn't count.
  assert.match(prompt, /\bBoard\b[^.]*\bbutton\b|\bbutton\b[^.]*\bBoard\b/, "the prompt doesn't ask for a \"Board\" button");
});

test("T-2: should find \"restart\" in the `## Install` text of `README.md`", () => {
  const section = installSection();
  assert.ok(section !== null, "README has no `## Install` heading");
  assert.match(section, /restart/i, "`## Install` doesn't say a Herdr restart may be needed");
});

test("T-3: should find, in the by-hand block or the sentence after it, \"own\" column wording with `place` right and 368, and a link to `#place-the-panel`", () => {
  const text = byHandText();
  assert.ok(text !== null, "no by-hand `<details>` block in `## Install`");
  assert.match(text, /\bown\b[^.]*\bcolumn\b/i, "no \"own ... column\" wording for the by-hand install");
  assert.match(text, /\bplace\b["`]?\s*:\s*["`]?right\b/, "no `place: right` for the by-hand install");
  assert.match(text, /(?<!\d)368(?!\d)/,"no 368 width for the by-hand install");
  assert.match(text, /\]\(#place-the-panel\)/, "no link to `#place-the-panel` for the by-hand install");
});
