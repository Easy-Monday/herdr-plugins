import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Story #57.
const root = fileURLToPath(new URL("../..", import.meta.url));
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");

// The install steps: the body under `## Install` up to the next heading of any level,
// so text in sub-sections such as "Place the panel" doesn't count as the install instructions.
function installSection(md) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => /^##\s+Install\s*$/.test(l));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,6}\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

const sentences = (text) => text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);

test("T-1: should find the agent prompt, `scripts/install.sh` and \"right panel\" in the README `## Install` section", () => {
  const section = installSection(readme);
  assert.ok(section !== null, "README has no `## Install` heading");
  assert.ok(section.split("\n").some((l) => /^>\s.*AGENTS\.md/.test(l)), "no agent prompt (a `>` quote naming AGENTS.md) in `## Install`");
  assert.ok(section.includes("scripts/install.sh"), "`scripts/install.sh` not in `## Install`");
  assert.match(section, /right panel/i, "`## Install` doesn't say the board appears in the right panel");
});

test("T-2: should find a sentence saying Herdr has no install command in the README `## Install` section", () => {
  const section = installSection(readme);
  assert.ok(section !== null, "README has no `## Install` heading");
  const says = sentences(section).some(
    (s) => /\bHerdr\b/.test(s) && /(\bno\b|\bnot\b|n't)[^.]*\binstall command\b/i.test(s),
  );
  assert.ok(says, "no sentence in `## Install` says Herdr has no install command");
});

test("T-3: should resolve every relative markdown link in `README.md` to an existing file", () => {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString().split("\0").filter(Boolean);
  const text = readme.replace(/^```[\s\S]*?^```/gm, "");
  const targets = [
    ...[...text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]),
    ...[...text.matchAll(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm)].map((m) => m[1]),
  ];
  const relative = targets.filter((t) => !/^[a-z][a-z0-9+.-]*:/i.test(t) && !t.startsWith("#"));
  assert.ok(relative.length > 0, "found no relative links in README.md");
  // A link must reach a file committed to the repo, not just one lying in a local checkout.
  const broken = relative.filter((t) => {
    const path = decodeURIComponent(t.split("#")[0]).replace(/^\.\//, "").replace(/\/$/, "");
    return !tracked.includes(path) && !tracked.some((f) => f.startsWith(`${path}/`));
  });
  assert.deepEqual(broken, [], `README links to files that are not in the repo: ${broken.join(", ")}`);
});
