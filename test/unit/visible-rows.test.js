// Story #7: Done top-level items are hidden unless "Show done" is on (pure part of mods/project-board/src/board.js).
// The tree is built by hand (each node: a board row with `children`), so this doesn't depend on
// how story #6 builds it from GitHub's answers.
import { test } from "node:test";
import assert from "node:assert/strict";

// Imported per test, so each T-line reports its own result.
const board = () => import("../../mods/project-board/src/board.js");

const DONE = { name: "Done", color: "PURPLE" };
const MOVING = { name: "In Progress", color: "YELLOW" };
const node = (key, status, children = []) => ({
  key,
  type: "Issue",
  number: Number(key.replace(/\D/g, "")) || null,
  title: `Item ${key}`,
  state: status === DONE ? "CLOSED" : "OPEN",
  stateReason: null,
  isDraft: false,
  status,
  summary: children.length ? { total: children.length, completed: 0, percentCompleted: 0 } : null,
  subIssues: [],
  children,
});
// The key of each visible row, in order (a row is { node, depth } as in the epic #1 prototype, or the node).
const keys = (rows) => rows.map((r) => (r.node ?? r).key);

test("T-1: should filter Done top-level items unless showDone is true", async () => {
  const { visibleRows } = await board();
  const tree = [
    node("I_1", MOVING),
    node("I_2", DONE),
    node("I_3", null), // no Status yet: not Done, so shown
    // BRD §12: a Done parent with open sub-issues is still hidden, even when expanded.
    node("I_4", DONE, [node("I_41", MOVING)]),
    node("I_5", MOVING),
  ];
  const expanded = new Set(["I_4"]);

  assert.deepEqual(keys(visibleRows(tree, { showDone: false, expanded })), ["I_1", "I_3", "I_5"]);
  assert.deepEqual(keys(visibleRows(tree, { showDone: true, expanded })), ["I_1", "I_2", "I_3", "I_4", "I_41", "I_5"]);
});

test("T-2: should keep Done sub-issues under a parent when showDone is false", async () => {
  const { visibleRows } = await board();
  const tree = [
    node("I_1", MOVING, [node("I_11", DONE), node("I_12", MOVING), node("I_13", DONE)]),
    node("I_2", DONE),
  ];
  const expanded = new Set(["I_1"]);

  assert.deepEqual(keys(visibleRows(tree, { showDone: false, expanded })), ["I_1", "I_11", "I_12", "I_13"]);
  assert.deepEqual(keys(visibleRows(tree, { showDone: true, expanded })), ["I_1", "I_11", "I_12", "I_13", "I_2"]);
});
