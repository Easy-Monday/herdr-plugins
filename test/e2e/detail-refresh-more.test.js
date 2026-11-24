// Story #16, beyond its Test spec (developer's tests): the detail header's Refresh, a failed reload
// that keeps the issue with "Couldn't refresh: …" and Try again, and Back keeping each detail's
// scroll (epic #10 prototype a28afdf: `detailHeader`, `detail-stale`, `back`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, advance, text, walk, cx } from "../support/harness.js";
import { issue, subIssue, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);
const vars = (args) => Object.fromEntries(args.filter((a) => /^\w+=/.test(a) && !a.startsWith("query=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const query = (args) => (args.find((a) => a.startsWith("query=")) ?? "").slice("query=".length);
const issueAnswer = (q, node) => ({ data: { node: Object.fromEntries(Object.entries(node).filter(([k]) => k === "id" || new RegExp(`\\b${k}\\b`).test(q))) } });

const detail = (s, number, subs, comments) => ({
  id: `I_${number}${s}`, number, title: `Issue ${number} ${s}`, url: `https://github.com/acme/web/issues/${number}`,
  state: "OPEN", stateReason: null, body: `Body ${number} ${s}`, issueType: null, projectItems: { nodes: [] },
  subIssues: { nodes: subs.map((n) => ({ id: `I_${n}${s}`, number: n, title: `Issue ${n} ${s}`, url: `https://github.com/acme/web/issues/${n}`, state: "OPEN", stateReason: null, projectItems: { nodes: [] } })) },
  comments: { nodes: [...comments] }, timelineItems: { nodes: [] },
});

// Issue 1 (on the board) has sub-issue 2. `state.failing` makes issue queries fail.
function world(s, comments) {
  const folder = `/w/${s}`;
  const project = { id: `PVT_${s}`, number: 11, title: `Board ${s}`, url: "https://github.com/orgs/acme/projects/11", closed: false };
  const state = { failing: false };
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      const q = query(args);
      if (/projectsV2/.test(q)) return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } } } } }));
      const { id: nodeId } = vars(args);
      if (nodeId === project.id) return ok(JSON.stringify(itemsPage([issue({ id: `I_1${s}`, number: 1, title: `Issue 1 ${s}`, subIssues: [subIssue({ id: `I_2${s}`, number: 2, title: `Issue 2 ${s}` })] })])));
      if (state.failing) return fail(1, `HTTP 502 ${s}`);
      if (nodeId === `I_1${s}`) return ok(JSON.stringify(issueAnswer(q, detail(s, 1, [2], comments))));
      if (nodeId === `I_2${s}`) return ok(JSON.stringify(issueAnswer(q, detail(s, 2, [], []))));
      return fail(1, `unexpected gh ${args.join(" ")}`);
    }
    if (command !== "git" || options.cwd !== folder) return fail(128, "fatal: not a git repository");
    if (args[0] === "remote") return ok(args.length === 1 ? "origin\n" : "git@github.com:acme/web.git\n");
    return ok(args[0] === "symbolic-ref" ? "main\n" : "origin\n");
  };
  herdrStub.spaces = [{ id: `s-${s}`, folder: "/home/test", machine: null, active: true, tabs: [{ id: "t1", active: true }] }];
  herdrStub.panes = [{ pane: `p-${s}`, terminal: `term-${s}`, tab: "t1", cwd: folder, focused: true }];
  return state;
}

const all = (tree, match) => {
  const found = [];
  walk(tree, (n) => { if (match(n)) found.push(n); });
  return found;
};
const scrollOf = (tree) => all(tree, (n) => n.props.track_scroll)[0]?.props.track_scroll;
async function press(render, match) {
  const found = all(render(), (n) => n.handlers.on_click && match(String(n.props.accessibility_label ?? text(n).trim())));
  assert.ok(found.length, `no ${match} control in: ${text(render())}`);
  await found.at(-1).handlers.on_click({}, cx);
  await settle();
}

async function openIssue1(s, comments) {
  const state = world(s, comments);
  const { render } = await mount();
  await tick();
  await settle();
  await press(render, (l) => l.includes(`Issue 1 ${s}`));
  return { state, render };
}

test("a failed reload keeps the issue and its scroll, shows Couldn't refresh, and Try again reloads", async () => {
  const s = id();
  const comments = [];
  const { state, render } = await openIssue1(s, comments);
  const scroll = scrollOf(render());
  scroll.offset = 300;

  state.failing = true;
  await advance(60_000);
  let screen = text(render());
  assert.match(screen, new RegExp(`Body 1 ${s}`), "the failed reload dropped the issue");
  assert.match(screen, new RegExp(`Couldn't refresh: .*HTTP 502 ${s}`));
  assert.equal(scrollOf(render()), scroll);
  assert.equal(scroll.offset, 300);

  state.failing = false;
  comments.push({ id: `IC_1${s}`, author: { login: "dev" }, createdAt: new Date().toISOString(), body: `New ${s}` });
  await press(render, (l) => l === "Try again");
  screen = text(render());
  assert.doesNotMatch(screen, /Couldn't refresh/);
  assert.match(screen, new RegExp(`New ${s}`));
  assert.equal(scrollOf(render()), scroll);
});

test("the detail header's Refresh issue reloads the shown issue", async () => {
  const s = id();
  const comments = [];
  const { render } = await openIssue1(s, comments);
  comments.push({ id: `IC_1${s}`, author: { login: "dev" }, createdAt: new Date().toISOString(), body: `Fresh ${s}` });
  await press(render, (l) => l === "Refresh issue");
  assert.match(text(render()), new RegExp(`Fresh ${s}`));
});

test("Back keeps the parent detail's scroll and releases the closed detail's", async () => {
  const s = id();
  const { render } = await openIssue1(s, []);
  const parent = scrollOf(render());
  parent.offset = 120;
  await press(render, (l) => l.includes(`Issue 2 ${s}`));
  const child = scrollOf(render());
  assert.notEqual(child, parent, "the sub-issue's detail shares its parent's ScrollHandle");
  await press(render, (l) => l === "Back to #1");
  assert.equal(scrollOf(render()), parent);
  assert.equal(parent.offset, 120);
  assert.equal(parent.released, false);
  assert.equal(child.released, true);
});
