// Developer tests for the #52/#49 scan in mod/src/images.js, beyond the bugs' test lines: it must never
// throw (it runs inside render()), whatever the body holds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { imageLinks } from "../../mod/src/images.js";

test("an escaped backtick before a backtick run doesn't throw, and text without images stays as written", () => {
  for (const md of ["\\``", "a \\`` b `` c", "\\```\n![a](u)"]) {
    assert.equal(typeof imageLinks(md), "string", md);
  }
  assert.equal(imageLinks("a \\`` b"), "a \\`` b");
});

test("random markdown-ish bodies never throw", () => {
  const parts = ["![", "[", "]", "(", ")", "<", ">", "<img ", '"', "'", "`", "```", "\n", " ", "a", "=", "src=", "\\", "[x]: u\n", "~~~"];
  let seed = 52;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let r = 0; r < 300; r++) {
    let md = "";
    while (md.length < 400) md += parts[Math.floor(rand() * parts.length)];
    assert.equal(typeof imageLinks(md), "string", md);
  }
});
