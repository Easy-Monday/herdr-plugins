// Story #15: images in issue markdown become Open image links (BRD §4.11; epic #10 prototype
// a28afdf, mods/project-board/src/images.js `imageLinks`): labelled by alt text, else the image's file name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { imageLinks } from "../../mods/project-board/src/images.js";

// Sha-pinned raw URLs, the way agents post screenshots of the private repo.
const raw = (sha, file) => `https://github.com/own/web/blob/${sha}/docs/screenshots/15/${file}?raw=true`;

test("T-1: should rewrite markdown and `<img>` images to links labelled by alt text or file name, including sha-pinned `?raw=true` URLs", async (t) => {
  await t.test("a markdown image with alt text is labelled by its alt text", () => {
    const url = raw("2c4d8e0", "header.png");
    assert.equal(imageLinks(`![Detail header with Status](${url})`), `[Open image: Detail header with Status](${url})`);
  });

  await t.test("a markdown image with an empty alt is labelled by its file name, without the query", () => {
    const url = raw("9f1a3b7", "back-to-board.png");
    assert.equal(imageLinks(`![](${url})`), `[Open image: back-to-board.png](${url})`);
  });

  await t.test("an HTML <img> with alt text is labelled by its alt text", () => {
    const url = raw("5b7e0c2", "list.png");
    assert.equal(imageLinks(`<img width="400" alt="Board list" src="${url}">`), `[Open image: Board list](${url})`);
  });

  await t.test("an HTML <img> without alt is labelled by its file name", () => {
    const url = raw("5b7e0c2", "open-image-link.png");
    assert.equal(imageLinks(`<img src="${url}" width="300" />`), `[Open image: open-image-link.png](${url})`);
  });

  await t.test("an HTML <img> with an empty alt is labelled by its file name", () => {
    const url = raw("7d0e4a1", "empty-alt.png");
    assert.equal(imageLinks(`<img alt="" src="${url}">`), `[Open image: empty-alt.png](${url})`);
  });

  await t.test("every image in a body is rewritten and the text around them is kept", () => {
    const a = raw("2c4d8e0", "a.png");
    const b = raw("2c4d8e0", "b.png");
    const md = `Screenshots:\n\n![First](${a})\n\n<img src="${b}" alt="Second">\n\nDone.`;
    assert.equal(imageLinks(md), `Screenshots:\n\n[Open image: First](${a})\n\n[Open image: Second](${b})\n\nDone.`);
  });

  await t.test("markdown without images is unchanged", () => {
    const md = "Plain [link](https://example.com) and **bold**.";
    assert.equal(imageLinks(md), md);
  });
});
