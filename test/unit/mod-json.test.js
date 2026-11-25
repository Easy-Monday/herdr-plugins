import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Story #56 replaces the BRD §4.10 "place none" test: the board docks right on first install.
test("T-1: should read place \"right\" and size 368 from mods/project-board/mod.json", () => {
  const mod = JSON.parse(readFileSync(new URL("../../mods/project-board/mod.json", import.meta.url)));
  assert.equal(mod.place, "right");
  assert.equal(mod.size, 368);
});
