// Bug #52 (release scan F1, CWE-1333): `imageLinks` (mod/src/images.js) must cost time linear in the
// body. 65,536 characters is GitHub's limit for an issue or comment body. The regexes it replaces take
// 170–910 ms on these bodies on the dev machine; a linear pass takes a few ms. The 50 ms bound leaves
// a wide margin for a slower CI runner either way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { imageLinks } from "../../mod/src/images.js";

const SIZE = 65_536;
const BOUND_MS = 50;
const fill = (unit) => unit.repeat(Math.ceil(SIZE / unit.length)).slice(0, SIZE);

// Fastest of up to three runs, so one GC pause doesn't fail a linear pass; a run 10× over the bound
// is a clear miss and isn't repeated.
function fastest(body) {
  let best = Infinity;
  for (let i = 0; i < 3 && best > BOUND_MS; i++) {
    const start = performance.now();
    const out = imageLinks(body);
    best = Math.min(best, performance.now() - start);
    assert.equal(typeof out, "string");
    if (best > BOUND_MS * 10) break;
  }
  return best;
}

test(`#52 T-1: should rewrite a ${SIZE}-character adversarial body in under ${BOUND_MS} ms`, async (t) => {
  for (const [name, unit] of [
    ["`![` repeated", "!["],
    ["`![a](` repeated", "![a]("],
    ["`<img ` repeated with no `>`", "<img "],
    ["`<img alt=\"` repeated with no closing quote", '<img alt="'],
    ["`[![` repeated (unclosed linked images)", "[!["],
    ["`![a [` repeated (unclosed brackets in alt text)", "![a ["],
    ["`` `![ `` repeated (unclosed code spans and images)", "`!["],
  ]) {
    await t.test(name, () => {
      const ms = fastest(fill(unit));
      assert.ok(ms < BOUND_MS, `${name}: ${ms.toFixed(1)} ms for ${SIZE} characters (bound ${BOUND_MS} ms)`);
    });
  }
});
