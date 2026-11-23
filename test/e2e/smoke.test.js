import { test } from "node:test";
import assert from "node:assert/strict";
import { mount, text } from "../support/harness.js";

test("should render the panel title with Herdr theme colours", async () => {
  const { render } = await mount();
  const tree = render();
  assert.match(text(tree), /Project Board/);
  assert.equal(tree.props.bg, "theme.background");
  assert.equal(tree.props.text_color, "theme.foreground");
});
