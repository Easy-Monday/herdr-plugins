// Story #6: sub-issues nested under their parent (buildTree in mod/src/board.js).
// Input is parseItems' rows (story #5); each tree node is such a row plus `children`, as in the
// epic #1 prototype (epic/1-prototype, cac901d). Sub-issues come from the items query's
// `subIssues` list, which carries no Status and no sub-issue list of its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { issue, subIssue, itemsPage } from "../support/items.js";

// Imported per test, so each T-line reports its own result.
const board = () => import("../../mod/src/board.js");
const rows = async (nodes) => (await board()).parseItems([itemsPage(nodes)]);
const pick = (node, keys) => Object.fromEntries(keys.map((k) => [k, node[k]]));
// A tree as numbers only: [number, [children...]].
const shape = (nodes) => nodes.map((n) => [n.number, shape(n.children)]);

const inProgress = { name: "In Progress", color: "YELLOW" };
const review = { name: "In Review", color: "BLUE" };

test("T-1: should build a tree of any depth from items and their sub-issues", async () => {
  const { buildTree } = await board();
  // #1 > #5 > #9 > #31: #5 and #9 are on the board, #31 is not. #1 also has #7 (not on the board).
  // #20 has no sub-issues.
  const items = await rows([
    issue({ id: "I_1", number: 1, title: "Epic", subIssues: [subIssue({ id: "I_5", number: 5, title: "Story" }), subIssue({ id: "I_7", number: 7, title: "Off board" })] }),
    issue({ id: "I_5", number: 5, title: "Story", subIssues: [subIssue({ id: "I_9", number: 9, title: "Task" })] }),
    issue({ id: "I_9", number: 9, title: "Task", subIssues: [subIssue({ id: "I_31", number: 31, title: "Deepest" })] }),
    issue({ id: "I_20", number: 20, title: "Alone" }),
  ]);

  const tree = buildTree(items);

  assert.deepEqual(shape(tree), [
    [1, [[5, [[9, [[31, []]]]]], [7, []]]],
    [20, []],
  ]);
  // Each node keeps its own row data at every level.
  const deepest = tree[0].children[0].children[0].children[0];
  assert.deepEqual(pick(deepest, ["number", "title", "state", "type"]), { number: 31, title: "Deepest", state: "OPEN", type: "Issue" });
});

test("T-2: should attach the board Status to sub-issues on the board and leave it empty for the others", async () => {
  const { buildTree } = await board();
  // #5 is on the board (In Review); #31 is not on the board.
  const items = await rows([
    issue({
      id: "I_1", number: 1, title: "Epic", status: inProgress,
      subIssues: [
        subIssue({ id: "I_5", number: 5, title: "On the board", state: "CLOSED", stateReason: "COMPLETED" }),
        subIssue({ id: "I_31", number: 31, title: "Not on the board" }),
      ],
    }),
    issue({ id: "I_5", number: 5, title: "On the board", state: "CLOSED", stateReason: "COMPLETED", status: review }),
  ]);

  const [epic] = buildTree(items);

  assert.deepEqual(
    epic.children.map((c) => pick(c, ["number", "title", "state", "stateReason", "status"])),
    [
      { number: 5, title: "On the board", state: "CLOSED", stateReason: "COMPLETED", status: review },
      { number: 31, title: "Not on the board", state: "OPEN", stateReason: null, status: null },
    ],
  );
});

test("T-3: should drop board items from the top level when they are a sub-issue of another item", async () => {
  const { buildTree } = await board();
  // #5 is on the board and a sub-issue of #1 (also on the board), listed before its parent.
  // #8 is no board item's sub-issue, so it stays at top level.
  const items = await rows([
    issue({ id: "I_5", number: 5, title: "Story", status: review }),
    issue({ id: "I_1", number: 1, title: "Epic", subIssues: [subIssue({ id: "I_5", number: 5, title: "Story" })] }),
    issue({ id: "I_8", number: 8, title: "Top level" }),
  ]);

  const tree = buildTree(items);

  assert.deepEqual(tree.map((n) => n.number), [1, 8], "top level, in board order");
  assert.deepEqual(tree[0].children.map((n) => n.number), [5], "#5 only under its parent");
});
