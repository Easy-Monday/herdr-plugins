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
