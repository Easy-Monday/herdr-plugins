// Developer test (story #6): a sub-issue loop can't make buildTree recurse forever or drop items.
import { test } from "node:test";
import assert from "node:assert/strict";
import { issue, subIssue, itemsPage } from "../support/items.js";
import { parseItems, buildTree } from "../../mods/project-board/src/board.js";

const shape = (nodes) => nodes.map((n) => [n.number, shape(n.children)]);

test("should cut a sub-issue loop and keep every board item in the tree", () => {
  // #1 and #2 are each other's sub-issue; #3 is its own; #4 has no loop.
  const items = parseItems([
    itemsPage([
      issue({ id: "I_1", number: 1, title: "A", subIssues: [subIssue({ id: "I_2", number: 2, title: "B" })] }),
      issue({ id: "I_2", number: 2, title: "B", subIssues: [subIssue({ id: "I_1", number: 1, title: "A" })] }),
      issue({ id: "I_3", number: 3, title: "C", subIssues: [subIssue({ id: "I_3", number: 3, title: "C" })] }),
      issue({ id: "I_4", number: 4, title: "D" }),
    ]),
  ]);

  assert.deepEqual(shape(buildTree(items)), [
    [4, []],
    [1, [[2, []]]],
    [3, []],
  ]);
});
