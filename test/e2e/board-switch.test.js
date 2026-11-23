// Prototype self-check for #8 AC-4; the story's T-4 replaces it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { herdrStub, byId } from "../support/harness.js";

const repos = { "/a": "o/a", "/a-worktree": "o/a", "/b": "o/b" };
const item = (id) => ({
  id: `PVTI_${id}`,
  content: { __typename: "Issue", id, number: 1, title: id, subIssues: { nodes: [{ id: `${id}-sub`, number: 2, title: "sub", state: "OPEN" }] } },
});
const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fakeExec = (command, args, { cwd } = {}) => {
  if (command === "git")
    return ok({ remote: "origin\n", "symbolic-ref --quiet --short HEAD": "main\n", "config --get branch.main.remote": "origin\n" }[args.join(" ")] ?? `git@github.com:${repos[cwd]}.git\n`);
  if (args.find((a) => a.startsWith("query=")).includes("projectsV2"))
    return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [{ id: "P", title: "Board" }] } } } }));
  return ok(JSON.stringify({ data: { node: { items: { pageInfo: {}, nodes: [item("I_1")] } } } }));
};

let view;
const seen = [];
const tasks = [];
const cx = { notify: () => seen.push(view.screen), timer: { every() {} }, spawn: (fn) => tasks.push(fn(cx)) };
const settle = async () => {
  while (tasks.length) await tasks.shift();
};
const switchTo = async (cwd) => {
  herdrStub.panes = [{ tab: "t", cwd, focused: true }];
  seen.length = 0;
  view.followFocus(cx);
  await settle();
};
const list = () => byId(view.render(), "board-list");

test("should keep each board's scroll handle and expanded rows across tab switches", async () => {
  herdrStub.exec = fakeExec;
  herdrStub.spaces = [{ id: "s", active: true, tabs: [{ id: "t", active: true }] }];
  herdrStub.panes = [{ tab: "t", cwd: "/a", focused: true }];
  const { default: Mod } = await import("../../mod/main.js");
  view = new Mod();
  view.init({}, cx);
  await settle();
  view.toggle("I_1", cx);
  const handle = list().props.track_scroll;
  assert.ok(handle);

  await switchTo("/a-worktree"); // another tab of the same repo: the same board, nothing reset
  assert.equal(view.screen.repo, "o/a");
  assert.ok(seen.every((s) => s.kind === "board"));
  assert.equal(list().props.track_scroll, handle);

  await switchTo("/b"); // another repo's tab: that board, with its own scroll and expanded rows
  assert.equal(view.screen.repo, "o/b");
  assert.notEqual(list().props.track_scroll, handle);
  assert.equal(view.boards.get("o/b").expanded.size, 0);

  await switchTo("/a"); // back: the earlier board shows at once as it was, then reloads
  assert.ok(seen.filter((s) => s.repo === "o/a").every((s) => s.kind === "board"));
  assert.equal(list().props.track_scroll, handle);
  assert.deepEqual([...view.boards.get("o/a").expanded], ["I_1"]);
});
