// Bug #49: `imageLinks` (mods/project-board/src/images.js, story #15) must turn every image form GitHub renders
// into an Open image link (BRD §4.11), leave code spans and fenced code blocks as written, and take
// an <img>'s URL from its real src. Forms from the PR #48 review.
import { test } from "node:test";
import assert from "node:assert/strict";
import { imageLinks } from "../../mods/project-board/src/images.js";

const url = (file) => `https://github.com/own/web/blob/2c4d8e0/docs/screenshots/49/${file}?raw=true`;

test("#49 T-1: should rewrite every image form GitHub renders to an Open image link", async (t) => {
  await t.test("alt text with brackets", () => {
    const u = url("brackets.png");
    assert.equal(imageLinks(`![a [b] c](${u})`), `[Open image: a b c](${u})`);
  });

  await t.test("a full reference-style image", () => {
    const u = url("ref-full.png");
    const out = imageLinks(`See ![Board][shot]\n\n[shot]: ${u}`);
    assert.ok(out.startsWith(`See [Open image: Board](${u})`), out);
    assert.ok(!out.includes("!["), out);
  });

  await t.test("a collapsed reference-style image", () => {
    const u = url("ref-collapsed.png");
    const out = imageLinks(`See ![Board][]\n\n[Board]: ${u}`);
    assert.ok(out.startsWith(`See [Open image: Board](${u})`), out);
    assert.ok(!out.includes("!["), out);
  });

  await t.test("a shortcut reference-style image", () => {
    const u = url("ref-shortcut.png");
    const out = imageLinks(`See ![Board]\n\n[board]: ${u} "Title"`);
    assert.ok(out.startsWith(`See [Open image: Board](${u})`), out);
    assert.ok(!out.includes("!["), out);
  });

  await t.test("a reference with no definition is not an image and stays as written", () => {
    const md = "Not an image: ![Board][missing]";
    assert.equal(imageLinks(md), md);
  });

  await t.test("a title in single quotes", () => {
    const u = url("single.png");
    assert.equal(imageLinks(`![Single](${u} 'The title')`), `[Open image: Single](${u})`);
  });

  await t.test("a title in parentheses", () => {
    const u = url("paren.png");
    assert.equal(imageLinks(`![Paren](${u} (The title))`), `[Open image: Paren](${u})`);
  });

  await t.test("an angle-bracket URL with a space", () => {
    // Either form is one clickable link to the same file: <…> keeps the space, %20 encodes it.
    const out = imageLinks("![Spaced](<https://example.com/shots/a b.png>)");
    assert.match(out, /^\[Open image: Spaced\]\((<https:\/\/example\.com\/shots\/a b\.png>|https:\/\/example\.com\/shots\/a%20b\.png)\)$/);
  });

  await t.test("an <img> with > inside a quoted attribute before src", () => {
    const u = url("gt.png");
    assert.equal(imageLinks(`<img alt="a > b" src="${u}">`), `[Open image: a > b](${u})`);
  });

  await t.test("an <img/src=…> with no space after the tag name", () => {
    const u = url("slash.png");
    assert.equal(imageLinks(`<img/src="${u}">`), `[Open image: slash.png](${u})`);
  });

  await t.test("an <img> with only srcset links one of its candidates", () => {
    const a = url("set-1x.png");
    const b = url("set-2x.png");
    const out = imageLinks(`<img alt="Set" srcset="${a} 1x, ${b} 2x">`);
    assert.ok(out === `[Open image: Set](${a})` || out === `[Open image: Set](${b})`, out);
  });
});

test("#49 T-2: should leave image syntax inside code spans and fenced code blocks as written", async (t) => {
  await t.test("a markdown image in a code span", () => {
    const md = `Write \`![Shot](${url("a.png")})\` in the comment.`;
    assert.equal(imageLinks(md), md);
  });

  await t.test("an <img> in a code span", () => {
    const md = `Write \`<img src="${url("a.png")}">\` in the comment.`;
    assert.equal(imageLinks(md), md);
  });

  await t.test("an image in a double-backtick code span holding a backtick", () => {
    const md = `Run \`\` a \` ![Shot](${url("a.png")}) \`\` now.`;
    assert.equal(imageLinks(md), md);
  });

  await t.test("images in a backtick fence with an info string", () => {
    const md = `Before\n\n\`\`\`md\n![Shot](${url("a.png")})\n<img src="${url("b.png")}">\n\`\`\`\n\nAfter`;
    assert.equal(imageLinks(md), md);
  });

  await t.test("images in a tilde fence", () => {
    const md = `~~~\n![Shot](${url("a.png")})\n~~~`;
    assert.equal(imageLinks(md), md);
  });

  await t.test("an image after a closed fence or code span is still rewritten", () => {
    const a = url("in.png");
    const b = url("out.png");
    const md = `\`![In](${a})\`\n\n\`\`\`\n![In](${a})\n\`\`\`\n\n![Out](${b})`;
    assert.equal(imageLinks(md), `\`![In](${a})\`\n\n\`\`\`\n![In](${a})\n\`\`\`\n\n[Open image: Out](${b})`);
  });
});

// Expectation: one link to the image (BRD §4.11: every image is an Open image link to its URL).
// A link can't hold another link, so the badge's outer href is dropped.
test("#49 T-3: should turn a linked image badge into one Open image link to the image", () => {
  const badge = "https://github.com/own/web/actions/workflows/ci.yml/badge.svg";
  const href = "https://github.com/own/web/actions/workflows/ci.yml";
  assert.equal(imageLinks(`Status: [![CI](${badge})](${href})`), `Status: [Open image: CI](${badge})`);
});

test("#49 T-4: should take an <img>'s URL from its src attribute, not from text inside another attribute's value", () => {
  const u = url("real.png");
  assert.equal(imageLinks(`<img alt="x src=evil" src="${u}">`), `[Open image: x src=evil](${u})`);
});
