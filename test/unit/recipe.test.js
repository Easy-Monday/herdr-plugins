import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Story #59.
const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null);
const tracked = () => execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString().split("\0");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The image must be committed (not only lying in a local checkout) and be a PNG with content.
function assertPng(path) {
  assert.ok(existsSync(join(root, path)), `${path} does not exist`);
  assert.ok(tracked().includes(path), `${path} is not committed to the repo`);
  const bytes = readFileSync(join(root, path));
  assert.ok(bytes.length > PNG.length, `${path} is empty`);
  assert.deepEqual(bytes.subarray(0, PNG.length), PNG, `${path} is not a PNG`);
}

const lines = (md) => md.split("\n");
const headingAt = (md, re) => lines(md).findIndex((l) => re.test(l));

// The body under the first heading whose text matches `re`, up to the next heading of the same or a higher level.
function section(md, re) {
  const ls = lines(md);
  const start = ls.findIndex((l) => /^#{2,6}\s/.test(l) && re.test(l.replace(/^#+\s+/, "")));
  if (start === -1) return null;
  const level = ls[start].match(/^#+/)[0].length;
  const rest = ls.slice(start + 1);
  const end = rest.findIndex((l) => (l.match(/^(#{1,6})\s/)?.[1].length ?? 7) <= level);
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

const RECIPE_SECTIONS = ["What you see", "How it behaves", "Built from", "Watch out"];
const detailLink = /\]\(\s*<?(?:\.\/)?docs\/preview-detail\.png>?(?:\s+"[^"]*")?\s*\)/;

test("T-1: should find `RECIPE.md` and a non-empty `preview.png` at the repo root", () => {
  assert.ok(read("RECIPE.md") !== null, "RECIPE.md does not exist at the repo root");
  assert.ok(read("RECIPE.md").trim().length > 0, "RECIPE.md is empty");
  assertPng("preview.png");
});

test("T-2: should find the five RECIPE.md headings, in order, and the `preview.png` image link", () => {
  const md = read("RECIPE.md");
  assert.ok(md !== null, "RECIPE.md does not exist at the repo root");
  const title = headingAt(md, /^#\s+\S/);
  assert.equal(title, lines(md).findIndex((l) => l.trim() !== ""), "RECIPE.md does not start with a `# Name` heading");
  const name = lines(md)[title].replace(/^#\s+/, "").trim();
  const positions = RECIPE_SECTIONS.map((h) => headingAt(md, new RegExp(`^#{2,6}\\s+${h}\\b`, "i")));
  RECIPE_SECTIONS.forEach((h, i) => assert.ok(positions[i] !== -1, `RECIPE.md has no "${h}" heading`));
  assert.deepEqual([title, ...positions], [title, ...positions].toSorted((a, b) => a - b), "RECIPE.md headings are not in Herdr's order");
  const image = lines(md).findIndex((l) => /!\[[^\]]*\]\(\s*<?(?:\.\/)?preview\.png>?\s*\)/.test(l));
  assert.ok(image !== -1, "RECIPE.md has no `![Name](preview.png)` image link");
  assert.ok(image > title && image < positions[0], "the `preview.png` image is not between `# Name` and \"What you see\"");
  assert.match(lines(md)[image], new RegExp(`!\\[${RegExp.escape(name)}\\]`), `the image alt text is not the name "${name}"`);
});

test("T-4: should find `gh`, `git` and \"network\" in the RECIPE.md \"Built from\" section", () => {
  const md = read("RECIPE.md");
  assert.ok(md !== null, "RECIPE.md does not exist at the repo root");
  const built = section(md, /^Built from\b/i);
  assert.ok(built !== null, "RECIPE.md has no \"Built from\" section");
  assert.match(built, /\bgh\b/, "\"Built from\" doesn't name `gh`");
  assert.match(built, /\bgit\b/, "\"Built from\" doesn't name `git`");
  assert.match(built, /network/i, "\"Built from\" doesn't say the mod reaches the network");
});

test("T-5: should find a non-empty `docs/preview-detail.png`, and a link to it in `RECIPE.md` under \"What you see\" and in `README.md`", () => {
  assertPng("docs/preview-detail.png");
  const md = read("RECIPE.md");
  assert.ok(md !== null, "RECIPE.md does not exist at the repo root");
  const see = section(md, /^What you see\b/i);
  assert.ok(see !== null, "RECIPE.md has no \"What you see\" section");
  assert.match(see, detailLink, "RECIPE.md \"What you see\" doesn't link docs/preview-detail.png");
  assert.match(read("README.md"), detailLink, "README.md doesn't link docs/preview-detail.png");
});
