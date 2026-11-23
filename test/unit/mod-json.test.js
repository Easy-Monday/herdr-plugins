import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("should ship with place none so installing changes no layout (BRD §4.10)", () => {
  const mod = JSON.parse(readFileSync(new URL("../../mod/mod.json", import.meta.url)));
  assert.equal(mod.place, "none");
});
