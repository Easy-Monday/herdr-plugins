// Prototype self-check of the board logic the screens use; the stories' tests replace it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTree, visibleRows, progress, pickProject } from "../../mod/src/board.js";
import { parseRemoteUrl } from "../../mod/src/repo.js";

const issue = (key, status, subIssues = []) => ({ key, type: "Issue", title: key, status: status && { name: status }, subIssues });

test("nests board items under their parent, hides Done top level unless asked, keeps Done children", () => {
  const items = [
    issue("epic", "Specified", [{ id: "a" }, { id: "off", number: 9, title: "off", state: "OPEN" }]),
    issue("a", "Done"),
    issue("old", "Done"),
  ];
  const tree = buildTree(items);
  assert.deepEqual(tree.map((n) => n.key), ["epic", "old"]);
  assert.equal(tree[0].children[1].status, null);
  const rows = (showDone) => visibleRows(tree, { showDone, expanded: new Set(["epic"]) }).map((r) => `${r.depth}${r.node.key}`);
  assert.deepEqual(rows(false), ["0epic", "1a", "1off"]);
  assert.deepEqual(rows(true), ["0epic", "1a", "1off", "0old"]);
});

test("survives a sub-issue loop", () => {
  const tree = buildTree([issue("x", null, [{ id: "y" }]), issue("y", null, [{ id: "x" }]), issue("z")]);
  assert.deepEqual(tree.map((n) => n.key), ["z"]);
});

test("rounds progress and picks the one open board", () => {
  assert.equal(progress({ total: 8, completed: 1 }), 13);
  assert.equal(progress({ total: 0, completed: 0 }), null);
  const response = (nodes) => ({ data: { repository: { projectsV2: { nodes } } } });
  assert.equal(pickProject(response([{ title: "a", closed: true }])).kind, "none");
  assert.equal(pickProject(response([{ title: "a" }, { title: "b", closed: true }])).project.title, "a");
  assert.deepEqual(pickProject(response([{ title: "a" }, { title: "b" }])).names, ["a", "b"]);
});

test("reads owner/repo from GitHub remotes only", () => {
  assert.equal(parseRemoteUrl("git@github.com:Easy-Monday/herdr-plugins.git\n"), "Easy-Monday/herdr-plugins");
  assert.equal(parseRemoteUrl("https://github.com/o/r"), "o/r");
  assert.equal(parseRemoteUrl("ssh://git@github.com/o/r.git"), "o/r");
  assert.equal(parseRemoteUrl("https://gitlab.com/o/r.git"), null);
});
