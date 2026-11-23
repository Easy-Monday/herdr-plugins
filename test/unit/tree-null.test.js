// Developer test (story #7, from the PR #38 review): GitHub returns `null` in a `nodes` list for an
// item the login can't see, such as a sub-issue in a private repo. The board still loads without it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { issue, subIssue, itemsPage } from "../support/items.js";
import { parseItems, buildTree } from "../../mod/src/board.js";

test("should skip null sub-issue entries when building the tree", () => {
  const items = parseItems([
    itemsPage([issue({ id: "I_1", number: 1, title: "Epic", subIssues: [null, subIssue({ id: "I_2", number: 2, title: "Seen" })] })]),
  ]);
  const tree = buildTree(items);
  assert.deepEqual(
    tree.map((n) => [n.key, n.children.map((c) => c.key)]),
    [["I_1", ["I_2"]]],
  );
});
