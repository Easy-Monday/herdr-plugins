// Story #6: sub-issues nested under their parent, opened and closed with the row's chevron.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text, cx } from "../support/harness.js";
import { issue, subIssue, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);

const vars = (args) => Object.fromEntries(args.filter((a) => /^\w+=/.test(a) && !a.startsWith("query=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const query = (args) => (args.find((a) => a.startsWith("query=")) ?? "").slice("query=".length);

// Like GitHub, the stub answers only what the query asks for: no `subIssues(...)` in the items
// query, no sub-issue lists in the answer.
const asked = (q, page) => {
  if (/subIssues\s*\(/.test(q)) return page;
  const copy = structuredClone(page);
  for (const n of copy.data.node.items.nodes) delete n.content.subIssues;
  return copy;
};

// A folder whose origin is github.com/<repo>, linked to one board whose items are `nodes`.
function world(s, nodes) {
  const folder = `/w/${s}`;
  const repo = `own-${s}/web-${s}`;
  const project = { id: `PVT_${s}`, number: 11, title: `Board ${s}`, closed: false };
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      if (args[0] !== "api" || args[1] !== "graphql") return fail(1, `unexpected gh ${args.join(" ")}`);
      const q = query(args);
      if (/projectsV2/.test(q)) return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } } } } }));
      if (vars(args).id === project.id) return ok(JSON.stringify(asked(q, itemsPage(nodes))));
      return fail(1, `unexpected gh ${args.join(" ")}`);
    }
    if (command !== "git" || options.cwd !== folder) return fail(128, "fatal: not a git repository");
    const [verb, ...rest] = args;
    if (verb === "remote" && rest.length === 0) return ok("origin\n");
    if (verb === "remote" && rest[0] === "get-url") return ok(`git@github.com:${repo}.git\n`);
    if (verb === "symbolic-ref") return ok("main\n");
    if (verb === "config") return ok("origin\n");
    return fail(1, `unexpected git ${args.join(" ")}`);
  };
  herdrStub.spaces = [{ id: `s-${id()}`, folder: "/home/test", machine: null, active: true, tabs: [{ id: "t1", active: true }] }];
  herdrStub.panes = [{ pane: `p-${id()}`, terminal: `term-${id()}`, tab: "t1", cwd: folder, focused: true }];
}

// Every node with the chain of its ancestors, outermost first.
function* withAncestors(node, above = []) {
  if (node == null || typeof node !== "object") return;
  yield [node, above];
  for (const kid of node.kids ?? []) yield* withAncestors(kid, [...above, node]);
}

// The chevron of the row titled `title`: the control labelled to expand or collapse sub-issues
// whose nearest ancestor with any text is that row's title line.
function chevron(tree, title) {
  for (const [node, above] of withAncestors(tree)) {
    if (!/^(Expand|Collapse) sub-issues$/.test(node.props.accessibility_label ?? "")) continue;
    const line = [...above].reverse().find((a) => text(a).trim());
    if (line && text(line).includes(title)) return node;
  }
  assert.fail(`no sub-issues chevron on the row "${title}"`);
}

// How far in from the list a title is: the left padding and margin of every element around it.
const LEFT = ["p", "px", "pl", "m", "mx", "ml"];
function inset(tree, title) {
  for (const [node, above] of withAncestors(tree)) {
    if (!(node.kids ?? []).some((k) => typeof k !== "object" && String(k) === title)) continue;
    return [...above, node].reduce((sum, n) => sum + LEFT.reduce((s, k) => s + (typeof n.props[k] === "number" ? n.props[k] : 0), 0), 0);
  }
  assert.fail(`"${title}" is not shown`);
}

test("T-4: should show indented sub-issues on chevron click and hide them on a second click", async () => {
  const s = id();
  // Epic > Story (on the board) > Task (not on the board); Epic > Loose (not on the board).
  const epic = `Epic ${s}`;
  const story = `Story ${s}`;
  const task = `Task ${s}`;
  const loose = `Loose ${s}`;
  world(s, [
    issue({
      id: `I_1${s}`, number: 1, title: epic,
      summary: { total: 2, completed: 0, percentCompleted: 0 },
      subIssues: [subIssue({ id: `I_5${s}`, number: 5, title: story }), subIssue({ id: `I_31${s}`, number: 31, title: loose })],
    }),
    issue({
      id: `I_5${s}`, number: 5, title: story, status: { name: "In Progress", color: "YELLOW" },
      summary: { total: 1, completed: 0, percentCompleted: 0 },
      subIssues: [subIssue({ id: `I_9${s}`, number: 9, title: task })],
    }),
  ]);
  const { render } = await mount();
  await tick();
  await settle();
  const click = async (title) => {
    await chevron(render(), title).handlers.on_click({}, cx);
    await settle();
    return render();
  };

  // Collapsed: only the epic; its sub-issue on the board is not a top-level row.
  let screen = text(render());
  assert.match(screen, new RegExp(epic));
  for (const t of [story, task, loose]) assert.doesNotMatch(screen, new RegExp(t), `${t} shows before any click`);

  // First level: the epic's sub-issues, indented under it.
  let tree = await click(epic);
  screen = text(tree);
  assert.match(screen, new RegExp(story));
  assert.match(screen, new RegExp(loose));
  assert.doesNotMatch(screen, new RegExp(task), "the story's own sub-issue shows before the story is expanded");
  assert.ok(inset(tree, story) > inset(tree, epic), `story inset ${inset(tree, story)} vs epic ${inset(tree, epic)}`);
  assert.ok(inset(tree, loose) > inset(tree, epic), `loose inset ${inset(tree, loose)} vs epic ${inset(tree, epic)}`);
  assert.equal(screen.split(story).length - 1, 1, "the story shows once, under the epic");

  // Second level: the story's sub-issue, indented further.
  tree = await click(story);
  assert.match(text(tree), new RegExp(task));
  assert.ok(inset(tree, task) > inset(tree, story), `task inset ${inset(tree, task)} vs story ${inset(tree, story)}`);

  // A second click on the epic's chevron hides every sub-issue under it.
  tree = await click(epic);
  screen = text(tree);
  assert.match(screen, new RegExp(epic));
  for (const t of [story, task, loose]) assert.doesNotMatch(screen, new RegExp(t), `${t} still shows after collapsing`);
});
