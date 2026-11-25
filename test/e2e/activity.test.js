// Story #13: the issue detail's Activity, comments and board Status changes oldest first
// (epic #10 prototype a28afdf: mods/project-board/main.js `comment`, `statusChange`; mods/project-board/src/load.js ISSUE).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text, walk, cx } from "../support/harness.js";
import { issue, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);

const vars = (args) => Object.fromEntries(args.filter((a) => /^\w+=/.test(a) && !a.startsWith("query=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const query = (args) => (args.find((a) => a.startsWith("query=")) ?? "").slice("query=".length);
const asks = (q, field) => new RegExp(`\\b${field}\\b`).test(q);

// Like GitHub, the stub answers only the issue fields the query names: no `comments` or
// `timelineItems` unless the issue query asks for them, the Status changes only when it
// asks for PROJECT_V2_ITEM_STATUS_CHANGED_EVENT items, and each change's board (`project`,
// story #44) only when the ProjectV2ItemStatusChangedEvent part asks for it.
function issueAnswer(q, node) {
  const answer = Object.fromEntries(Object.entries(node).filter(([k]) => k === "id" || asks(q, k)));
  if (answer.timelineItems && !asks(q, "PROJECT_V2_ITEM_STATUS_CHANGED_EVENT")) answer.timelineItems = { nodes: [] };
  if (answer.timelineItems && !/ProjectV2ItemStatusChangedEvent\s*\{[^}]*\bproject\b/.test(q)) {
    answer.timelineItems = { nodes: answer.timelineItems.nodes.map(({ project, ...e }) => e) };
  }
  return { data: { node: answer } };
}

// A folder whose origin is github.com/<repo>, linked to one board whose items are `nodes`;
// `issues` answers the issue query by id.
function world(s, nodes, issues) {
  const folder = `/w/${s}`;
  const repo = `own-${s}/web-${s}`;
  const project = { id: `PVT_${s}`, number: 11, title: `Board ${s}`, url: `https://github.com/orgs/own-${s}/projects/11`, closed: false };
  const byId = new Map(issues.map((i) => [i.id, i]));
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      if (args[0] !== "api" || args[1] !== "graphql") return fail(1, `unexpected gh ${args.join(" ")}`);
      const q = query(args);
      if (/projectsV2/.test(q)) return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } } } } }));
      const { id: nodeId } = vars(args);
      if (nodeId === project.id) return ok(JSON.stringify(itemsPage(nodes)));
      if (byId.has(nodeId)) return ok(JSON.stringify(issueAnswer(q, byId.get(nodeId))));
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

async function open() {
  const { render } = await mount();
  await tick();
  await settle();
  return render;
}

const nodes = (tree, match) => {
  const found = [];
  walk(tree, (n) => { if (match(n)) found.push(n); });
  return found;
};

// Clicks the row titled `title`: the innermost clickable element holding that title.
async function clickRow(render, title) {
  const rows = nodes(render(), (n) => n.handlers.on_click && text(n).includes(title));
  assert.ok(rows.length, `no clickable row "${title}" in: ${text(render())}`);
  await rows.at(-1).handlers.on_click({}, cx);
  await settle();
}

// Times relative to the real clock: the mod reads Date.now() when it draws.
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

test("T-4: should show a stubbed comment and a status change in date order", async () => {
  const s = id();
  const title = `Plan ${s}`;
  // GitHub returns comments and Status changes as two lists; the detail interleaves them by time.
  const comments = [
    { id: `IC_1${s}`, author: { login: `dev-${s}` }, createdAt: ago(2 * 60), body: `Tests pass ${s}.\n\n- first ${s}\n- second ${s}\n` },
    { id: `IC_2${s}`, author: { login: `rev-${s}` }, createdAt: ago(10), body: `Approved ${s}` },
  ];
  // Both changes are on the board the panel shows (`world` links board PVT_<s>; #44 shows only those).
  const events = [
    // A first Status on the board has an empty previousStatus (#11's note).
    { id: `PVTISC_1${s}`, createdAt: ago(3 * 24 * 60), previousStatus: "", status: "Todo", project: { id: `PVT_${s}` } },
    { id: `PVTISC_2${s}`, createdAt: ago(25), previousStatus: "In Progress", status: "In Review", project: { id: `PVT_${s}` } },
  ];
  world(s, [issue({ id: `I_1${s}`, number: 1, title })], [
    {
      id: `I_1${s}`, number: 1, title, url: `https://github.com/own-${s}/web-${s}/issues/1`, state: "OPEN", stateReason: null,
      body: `Body ${s}`, issueType: null, projectItems: { nodes: [] }, subIssues: { nodes: [] },
      comments: { nodes: comments },
      timelineItems: { nodes: events },
    },
  ]);
  const render = await open();
  await clickRow(render, title);
  const screen = text(render());

  // Oldest first: first Status, comment, Status change, comment.
  const parts = ["No status → Todo · 3d ago", `dev-${s}`, "In Progress → In Review · 25m ago", `rev-${s}`];
  const at = parts.map((p) => screen.indexOf(p));
  parts.forEach((p, i) => assert.ok(at[i] >= 0, `the detail lacks "${p}": ${screen}`));
  assert.deepEqual([...at].sort((a, b) => a - b), at, `not in date order (${parts.join(" | ")}): ${screen}`);

  // The comment shows its author, its relative time and its body as markdown.
  const own = screen.slice(at[1], at[2]);
  assert.match(own, /2h ago/, `the comment by dev-${s} lacks its time: ${own}`);
  const views = nodes(render(), (n) => n.kind === "markdown" && text(n).includes(`Tests pass ${s}`));
  assert.equal(views.length, 1, `no markdown view holding the comment in: ${screen}`);
  assert.match(text(views[0]), new RegExp(`^- first ${s}\\n- second ${s}$`, "m"));
});

// Story #44: Activity shows only the Status changes made on the board the panel shows.
const onIssue = (s, n, title, comments, events) => ({
  id: `I_${n}${s}`, number: n, title, url: `https://github.com/own-${s}/web-${s}/issues/${n}`, state: "OPEN", stateReason: null,
  body: `Body ${s}`, issueType: null, projectItems: { nodes: [] }, subIssues: { nodes: [] },
  comments: { nodes: comments }, timelineItems: { nodes: events },
});

test("#44 T-2: should show this board's Status change line and not the other board's, for a stubbed issue on two boards, and show no Status change line when all changes are on the other board", async () => {
  // AC-1: the issue is on this board (PVT_<s>) and on another one; each board has a change.
  const s = id();
  const title = `Two boards ${s}`;
  world(s, [issue({ id: `I_1${s}`, number: 1, title })], [
    onIssue(s, 1, title, [{ id: `IC_1${s}`, author: { login: `dev-${s}` }, createdAt: ago(30), body: `Note ${s}` }], [
      { id: `PVTISC_1${s}`, createdAt: ago(2 * 60), previousStatus: "Todo", status: "In Progress", project: { id: `PVT_${s}` } },
      { id: `PVTISC_2${s}`, createdAt: ago(60), previousStatus: "Backlog", status: "Shipped", project: { id: `PVT_other${s}` } },
    ]),
  ]);
  let render = await open();
  await clickRow(render, title);
  let screen = text(render());
  assert.ok(screen.includes("Todo → In Progress · 2h ago"), `this board's change is missing: ${screen}`);
  assert.ok(screen.includes(`dev-${s}`), `the comment is missing: ${screen}`);
  assert.ok(!screen.includes("Backlog → Shipped"), `the other board's change shows: ${screen}`);

  // AC-2: every change is on another board; Activity keeps the comment and shows no change line.
  const t = id();
  const only = `Other board ${t}`;
  world(t, [issue({ id: `I_2${t}`, number: 2, title: only })], [
    onIssue(t, 2, only, [{ id: `IC_2${t}`, author: { login: `rev-${t}` }, createdAt: ago(30), body: `Note ${t}` }], [
      { id: `PVTISC_3${t}`, createdAt: ago(60), previousStatus: "Todo", status: "Done", project: { id: `PVT_other${t}` } },
    ]),
  ]);
  render = await open();
  await clickRow(render, only);
  screen = text(render());
  assert.ok(screen.includes(`rev-${t}`), `the comment is missing: ${screen}`);
  assert.ok(!screen.includes(" → "), `a Status change line shows: ${screen}`);
});
