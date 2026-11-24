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

// Review of PR #53: most GitHub bodies end their lines with CRLF.
test("a fence closed by a CRLF line ends there, and the image after it is rewritten", () => {
  assert.equal(
    imageLinks("```\r\ncode\r\n```\r\n\r\n![Out](https://x/o.png)"),
    "```\r\ncode\r\n```\r\n\r\n[Open image: Out](https://x/o.png)",
  );
  assert.equal(
    imageLinks("~~~ \r\n![In](https://x/i.png)\r\n~~~\r\n![Out](https://x/o.png)"),
    "~~~ \r\n![In](https://x/i.png)\r\n~~~\r\n[Open image: Out](https://x/o.png)",
  );
});

test("a stray backtick doesn't pair with one across a CRLF blank line", () => {
  assert.equal(
    imageLinks("a ` b\r\n\r\n![Shot](https://x/s.png) and ` c"),
    "a ` b\r\n\r\n[Open image: Shot](https://x/s.png) and ` c",
  );
});

test("mixed LF and CRLF line endings: blank lines and fences work with either", () => {
  for (const nl of ["\n\r\n", "\r\n\n"]) {
    assert.equal(imageLinks(`a \` b${nl}![S](https://x/s.png) \` c`), `a \` b${nl}[Open image: S](https://x/s.png) \` c`, JSON.stringify(nl));
  }
  assert.equal(
    imageLinks("```\ncode\r\n```\r\n![Out](https://x/o.png)\n`![In](https://x/i.png)`"),
    "```\ncode\r\n```\r\n[Open image: Out](https://x/o.png)\n`![In](https://x/i.png)`",
  );
});

test("one reference definition and nested `![` stay under 50 ms, and reference images still rewrite", () => {
  const SIZE = 65_536;
  const unit = "![ ".repeat(249) + "]".repeat(249); // the outer labels just under the 999 cap, with spaces to normalise
  const body = ("[a]: https://x/a.png\n" + unit.repeat(Math.ceil(SIZE / unit.length))).slice(0, SIZE);
  let best = Infinity;
  for (let r = 0; r < 3 && best > 50; r++) {
    const start = performance.now();
    imageLinks(body);
    best = Math.min(best, performance.now() - start);
  }
  assert.ok(best < 50, `${best.toFixed(1)} ms for ${SIZE} characters (bound 50 ms)`);
  const defs = "\n\n[a]: https://x/a.png";
  for (const [md, out] of [
    ["![a]", "[Open image: a](https://x/a.png)"],
    ["![a][]", "[Open image: a](https://x/a.png)"],
    ["![Alt][a]", "[Open image: Alt](https://x/a.png)"],
    ["[![CI][a]][a]", "[Open image: CI](https://x/a.png)"],
  ]) assert.equal(imageLinks(md + defs), out + defs, md);
});
