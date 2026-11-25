import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("../../scripts/install.sh", import.meta.url).pathname;
const install = (home, ...args) => execFileSync(script, args, { env: { ...process.env, HERDR_APP_HOME: home } }).toString().trim();

test("should install without mocks, so mocks never reach users", () => {
  const home = mkdtempSync(join(tmpdir(), "herdr-"));
  const dest = install(home);
  assert.equal(dest, join(home, "mods/project-board"));
  assert.ok(existsSync(join(dest, "main.js")));
  assert.match(readFileSync(join(dest, "src/mock.js"), "utf8"), /export const mock = null;/);
  assert.ok(!existsSync(join(dest, "mock")));
});

test("should install the preview copy without mocks", () => {
  const home = mkdtempSync(join(tmpdir(), "herdr-"));
  const dest = install(home, "preview");
  assert.equal(dest, join(home, "mods/project-board-preview"));
  assert.match(readFileSync(join(dest, "src/mock.js"), "utf8"), /export const mock = null;/);
});

test("should install the prototype copy with the mock layer", () => {
  const home = mkdtempSync(join(tmpdir(), "herdr-"));
  const dest = install(home, "prototype");
  assert.equal(dest, join(home, "mods/project-board-prototype"));
  assert.match(readFileSync(join(dest, "src/mock.js"), "utf8"), /export function mock/);
});

test("T-2: should install a mod.json with place \"right\" and size 368 when scripts/install.sh runs into an empty HERDR_APP_HOME", () => {
  const home = mkdtempSync(join(tmpdir(), "herdr-"));
  const mod = JSON.parse(readFileSync(join(install(home), "mod.json"), "utf8"));
  assert.equal(mod.place, "right");
  assert.equal(mod.size, 368);
});

test("T-3 (#59): should leave `RECIPE.md` and `preview.png` out of the folder `scripts/install.sh` installs", () => {
  const repo = new URL("../..", import.meta.url).pathname;
  // Herdr says to leave the recipe and preview out of mods/<name>/; both must exist in the repo for this to mean anything.
  for (const file of ["RECIPE.md", "preview.png"]) assert.ok(existsSync(join(repo, file)), `${file} does not exist at the repo root`);
  const home = mkdtempSync(join(tmpdir(), "herdr-"));
  for (const args of [[], ["preview"], ["prototype"]]) {
    const dest = install(home, ...args);
    for (const file of ["RECIPE.md", "preview.png"]) assert.ok(!existsSync(join(dest, file)), `${file} was installed into ${dest}`);
  }
});

test("T-2 (#67): should install `main.js` and `mod.json` under `mods/project-board`, `mods/project-board-preview` and `mods/project-board-prototype`, with `src/name.js` naming each folder, when `scripts/install.sh` runs into an empty `HERDR_APP_HOME`", () => {
  const source = new URL("../../mods/project-board/", import.meta.url).pathname;
  for (const [args, name] of [[[], "project-board"], [["preview"], "project-board-preview"], [["prototype"], "project-board-prototype"]]) {
    const home = mkdtempSync(join(tmpdir(), "herdr-"));
    const dest = install(home, ...args);
    assert.equal(dest, join(home, "mods", name));
    for (const file of ["main.js", "mod.json"]) {
      assert.ok(existsSync(join(source, file)), `mods/project-board/${file} does not exist in the repo`);
      assert.equal(readFileSync(join(dest, file), "utf8"), readFileSync(join(source, file), "utf8"), `${file} in ${dest} is not the one from mods/project-board/`);
    }
    assert.equal(readFileSync(join(dest, "src/name.js"), "utf8"), `export const MOD = "${name}";\n`);
  }
});

test("should point icon paths at the installed folder name", () => {
  const home = mkdtempSync(join(tmpdir(), "herdr-"));
  for (const [args, name] of [[[], "project-board"], [["preview"], "project-board-preview"]]) {
    const dest = install(home, ...args);
    assert.equal(readFileSync(join(dest, "src/name.js"), "utf8"), `export const MOD = "${name}";\n`);
  }
});
