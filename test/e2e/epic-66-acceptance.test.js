// Story #68: epic #66 acceptance. T-1..T-4 are covered by story #67's tests
// (test/unit/layout.test.js, test/e2e/install.test.js); this adds the one AC-4 clause they leave out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const repo = new URL("../..", import.meta.url).pathname;

test("T-4 (#68, AC-4): should find `mods/project-board/` named in `.gitignore` and `NOTICE`", () => {
  for (const file of [".gitignore", "NOTICE"]) {
    assert.match(readFileSync(repo + file, "utf8"), /(?<!herdr-app\/)mods\/project-board\//, `${file} does not name mods/project-board/`);
  }
});
