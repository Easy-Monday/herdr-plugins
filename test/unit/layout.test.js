import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// Story #67: Herdr's gallery lists mods from mods/<name>/.
const repo = new URL("../..", import.meta.url).pathname;
const read = (file) => readFileSync(repo + file, "utf8");

// The old folder: `mod/` (or `../../mod/`) as a path, never the `mod` inside `mods/` or `herdr-mods/`.
const OLD_FOLDER = /(?<![\w-])mod\//;
// `herdr-app check mod`, the old folder as a bare argument.
const CHECK_OLD = /\bcheck mod(?![\w./-])/;
// The repo folder, not the installed ~/.config/herdr-app/mods/project-board.
const NEW_FOLDER = /(?<!herdr-app\/)mods\/project-board\//;

test("T-1 (#67): should find `mods/project-board/main.js` and `mods/project-board/mod.json`, `RECIPE.md` and `preview.png` at the repo root, and no `mod` directory", () => {
  for (const file of ["mods/project-board/main.js", "mods/project-board/mod.json", "RECIPE.md", "preview.png"]) {
    assert.ok(existsSync(repo + file), `${file} does not exist`);
  }
  assert.ok(!existsSync(repo + "mod"), "the old mod/ folder still exists");
});

test("T-3 (#67): should find `mods/project-board` in the `lint` and `check` scripts of `package.json` and no bare `mod` folder argument", () => {
  const { scripts } = JSON.parse(read("package.json"));
  for (const name of ["lint", "check"]) {
    assert.match(scripts[name], /(^|\s)mods\/project-board(\s|$)/, `${name} does not name mods/project-board`);
    assert.doesNotMatch(scripts[name], /(?<![\w./-])mod(?![\w.-])/, `${name} still names the old mod folder`);
  }
});

test("T-4 (#67): should find `mods/project-board` in `README.md`, `RECIPE.md` and `CLAUDE.md`, and no install-source reference to the old `mod/` folder in them, in `.gitignore` or in `NOTICE`", () => {
  for (const file of ["README.md", "RECIPE.md", "CLAUDE.md"]) {
    assert.ok(NEW_FOLDER.test(read(file)), `${file} does not name mods/project-board/`);
  }
  for (const file of ["README.md", "RECIPE.md", "CLAUDE.md", ".gitignore", "NOTICE"]) {
    const old = read(file).split("\n").filter((line) => OLD_FOLDER.test(line) || CHECK_OLD.test(line));
    assert.deepEqual(old, [], `${file} still names the old mod/ folder`);
  }
});
