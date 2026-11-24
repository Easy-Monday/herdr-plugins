// Story #17: epic #10 acceptance. Each test drives the merged panel end to end through the harness,
// along the epic's whole path: git and gh answered by `herdrStub.exec`, the board list, a click on
// the epic's row, its detail (header, body, sub-issues), a click on a sub-issue, its Activity, and
// Back up the trail. Wording and behaviour as in the approved epic #10 prototype (a28afdf) and the
// owner's decision on #10 (story #44): Activity shows only this board's Status changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, advance, text, walk, byId, cx, opened } from "../support/harness.js";
import { issue, subIssue, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);

const vars = (args) => Object.fromEntries(args.filter((a) => /^\w+=/.test(a) && !a.startsWith("query=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const query = (args) => (args.find((a) => a.startsWith("query=")) ?? "").slice("query=".length);
const asks = (q, field) => new RegExp(`\\b${field}\\b`).test(q);

// Times relative to the real clock: the mod reads Date.now() when it draws.
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

// A folder whose origin is github.com/<repo>, linked to one board (PVT_<s>). On it: epic #10 with
// sub-issues #11 and #12. #11 has an image in its body and a comment, three comments (one a
// `Tests written at` handoff, one quoting it), three Status changes on this board and one on
// another board (PVT_other<s>). `comments` is read at call time, so a test can add one.
// `unreadable: true` makes the other board one the gh login can't read: GitHub answers #11 with
// its data, nulls where that board would be, and an `errors` entry for each, and gh exits 1.
function world(s, { unreadable = false } = {}) {
  const folder = `/w/${s}`;
  const repo = `own-${s}/web-${s}`;
  const board = `PVT_${s}`;
  const other = `PVT_other${s}`;
  const project = { id: board, number: 11, title: `Board ${s}`, url: `https://github.com/orgs/own-${s}/projects/11`, closed: false };
  const url = (n) => `https://github.com/${repo}/issues/${n}`;
  const on = (projectId, name, color) => ({ project: projectId ? { id: projectId } : null, status: name ? { name, color } : null });
  const e = { id: `I_E${s}`, number: 10, title: `Issue detail ${s}`, status: { name: "In Progress", color: "YELLOW" } };
  const a = { id: `I_A${s}`, number: 11, title: `Open the detail ${s}`, status: { name: "In Review", color: "PURPLE" } };
  const b = { id: `I_B${s}`, number: 12, title: `Show images ${s}`, status: { name: "Todo", color: "GRAY" } };
  const imageUrl = `https://github.com/user-attachments/assets/${randomUUID()}`;
  const shotUrl = `https://github.com/${repo}/blob/5b7e0c2${s}/docs/screenshots/11/shot-${s}.png?raw=true`;
  const handoff = `Tests written at 9f3c2e1 on story/11-open-the-detail-${s}`;
  const comments = [
    { id: `IC_1${s}`, author: { login: `dev-${s}` }, createdAt: ago(3 * 60), body: `Picked up ${s}\n\n<img src="${shotUrl}" width="300" />` },
    { id: `IC_2${s}`, author: { login: `tester-${s}` }, createdAt: ago(2 * 60), body: `${handoff}\n\n- test/e2e/detail-${s}.test.js` },
    { id: `IC_3${s}`, author: { login: `rev-${s}` }, createdAt: ago(10), body: `Approved ${s}\n\n> ${handoff}` },
  ];
  const events = [
    { id: `PVTISC_1${s}`, createdAt: ago(3 * 24 * 60), previousStatus: "", status: "Specified", project: { id: board } },
    { id: `PVTISC_2${s}`, createdAt: ago(90), previousStatus: "Tests Written", status: "In Progress", project: { id: board } },
    { id: `PVTISC_3${s}`, createdAt: ago(60), previousStatus: "Backlog", status: "Shipped", project: unreadable ? null : { id: other } },
    { id: `PVTISC_4${s}`, createdAt: ago(20), previousStatus: "In Progress", status: "In Review", project: { id: board } },
  ];
  const subNode = (i) => ({ id: i.id, number: i.number, title: i.title, url: url(i.number), state: "OPEN", stateReason: null, projectItems: { nodes: [on(board, i.status.name, i.status.color)] } });
  const issues = {
    [e.id]: () => ({
      id: e.id, number: e.number, title: e.title, url: url(e.number), state: "OPEN", stateReason: null,
      body: `## Goal ${s}\n\nClicking a row shows the issue.\n\n- AC-1 ${s}\n- AC-2 ${s}\n`, issueType: { name: "Epic" },
      projectItems: { nodes: [on(board, e.status.name, e.status.color)] },
      subIssues: { nodes: [subNode(a), subNode(b)] }, comments: { nodes: [] }, timelineItems: { nodes: [] },
    }),
    [a.id]: () => ({
      id: a.id, number: a.number, title: a.title, url: url(a.number), state: "OPEN", stateReason: null,
      body: `Spec ${s}\n\n![Detail header ${s}](${imageUrl})\n`, issueType: { name: "Feature" },
      projectItems: { nodes: [on(board, a.status.name, a.status.color), unreadable ? on(null, null) : on(other, "Shipped", "GREEN")] },
      subIssues: { nodes: [] }, comments: { nodes: [...comments] }, timelineItems: { nodes: [...events] },
    }),
    [b.id]: () => ({
      id: b.id, number: b.number, title: b.title, url: url(b.number), state: "OPEN", stateReason: null,
      body: `Images ${s}`, issueType: { name: "Feature" }, projectItems: { nodes: [on(board, b.status.name, b.status.color)] },
      subIssues: { nodes: [] }, comments: { nodes: [] }, timelineItems: { nodes: [] },
    }),
  };
  const DENIED = "Resource not accessible by integration";
  const denied = (path) => ({ type: "FORBIDDEN", path, locations: [{ line: 1, column: 1 }], message: DENIED });
  const items = [
    issue({ id: e.id, number: e.number, title: e.title, status: e.status, summary: { total: 2, completed: 0, percentCompleted: 0 }, subIssues: [a, b].map((i) => subIssue({ id: i.id, number: i.number, title: i.title })) }),
    issue({ id: a.id, number: a.number, title: a.title, status: a.status }),
    issue({ id: b.id, number: b.number, title: b.title, status: b.status }),
  ];
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      if (args[0] !== "api" || args[1] !== "graphql") return fail(1, `unexpected gh ${args.join(" ")}`);
      const q = query(args);
      if (/projectsV2/.test(q)) return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } } } } }));
      const { id: nodeId } = vars(args);
      if (nodeId === board) return ok(JSON.stringify(itemsPage(items)));
      if (issues[nodeId]) {
        // Like GitHub, only the issue fields the query names.
        const node = Object.fromEntries(Object.entries(issues[nodeId]()).filter(([k]) => k === "id" || asks(q, k)));
        if (!(unreadable && nodeId === a.id)) return ok(JSON.stringify({ data: { node } }));
        // gh prints the body, reports the GraphQL errors on stderr and exits 1.
        const errors = [denied(["node", "projectItems", "nodes", 1, "project"]), denied(["node", "timelineItems", "nodes", 2, "project"])];
        return { code: 1, stdout: JSON.stringify({ data: { node }, errors }), stderr: `gh: ${DENIED}\n${DENIED}\n` };
      }
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
  herdrStub.spaces = [{ id: `s-${s}`, folder: "/home/test", machine: null, active: true, tabs: [{ id: "t1", active: true }] }];
  herdrStub.panes = [{ pane: `p-${s}`, terminal: `term-${s}`, tab: "t1", cwd: folder, focused: true }];
  return { e, a, b, url, comments, imageUrl, shotUrl, handoff };
}

const nodes = (tree, match) => {
  const found = [];
  walk(tree, (n) => { if (match(n)) found.push(n); });
  return found;
};
const only = (tree, word) => nodes(tree, (n) => n.kids.length === 1 && n.kids[0] === word);
const labelled = (tree, match) => nodes(tree, (n) => n.handlers.on_click && match.test(String(n.props.accessibility_label ?? "")));

// Opens the panel and waits for the focus poll and the board load.
async function open() {
  const { render } = await mount();
  await tick();
  await settle();
  return render;
}

// Clicks the row titled `title`: the innermost clickable element holding that title.
async function clickRow(render, title) {
  const rows = nodes(render(), (n) => n.handlers.on_click && text(n).includes(title));
  assert.ok(rows.length, `no clickable row "${title}" in: ${text(render())}`);
  await rows.at(-1).handlers.on_click({}, cx);
  await settle();
}

// Clicks the one Back control and returns its label.
async function back(render) {
  const found = labelled(render(), /^Back/);
  assert.equal(found.length, 1, `not one Back control in: ${text(render())}`);
  await found[0].handlers.on_click({}, cx);
  await settle();
  return found[0].props.accessibility_label;
}

// The detail of `i` is on screen in place of the board list: its header shows its #number and title.
function assertDetail(tree, i, when) {
  const header = byId(tree, "detail-header");
  assert.ok(header, `no detail ${when}: ${text(tree)}`);
  assert.ok(text(header).includes(`#${i.number}`) && text(header).includes(i.title), `the detail of #${i.number} is not shown ${when}: ${text(header)}`);
  assert.ok(!byId(tree, "board-list"), `the board list shows ${when}`);
  assert.ok(!byId(tree, "detail-error"), `#${i.number} shows an error ${when}: ${text(tree)}`);
}

// The epic's path: the board, a click on the epic's row, a click on its sub-issue #11.
async function toSubIssue(w) {
  const render = await open();
  await clickRow(render, w.e.title);
  assertDetail(render(), w.e, "after a click on the epic's row");
  await clickRow(render, w.a.title);
  assertDetail(render(), w.a, "after a click on the sub-issue");
  return render;
}

// Clicks the link labelled `label` in the markdown view holding `marker`, as Herdr does on a real
// click: the view's link handler gets the link's target.
function clickLink(tree, marker, label) {
  const views = nodes(tree, (n) => n.kind === "markdown" && text(n).includes(marker));
  assert.equal(views.length, 1, `no markdown view holding "${marker}" in: ${text(tree)}`);
  const md = text(views[0]);
  const link = md.match(new RegExp(`\\[${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\(([^)\\s]+)\\)`));
  assert.ok(link, `no "${label}" link in: ${md}`);
  assert.ok(views[0].handlers.on_link_click, "the markdown view has no link handler");
  views[0].handlers.on_link_click(link[1], cx);
  return { url: link[1], md };
}

test("T-1: should open a row's detail with header, body and sub-issues and return with Back", async () => {
  const s = id();
  const w = world(s);
  const render = await open();
  assert.ok(byId(render(), "board-list"), `no board list: ${text(render())}`);
  await clickRow(render, w.e.title);
  let tree = render();
  assertDetail(tree, w.e, "after a click on the epic's row");

  // Header: type, #number, Status, title and Open on GitHub. The title doesn't hold the type's word.
  const header = byId(tree, "detail-header");
  assert.equal(only(header, "Epic").length, 1, `the header has no Epic type tag: ${text(header)}`);
  assert.equal(only(header, "In Progress").length, 1, `the header has no In Progress Status: ${text(header)}`);
  const github = labelled(header, /^Open on GitHub$/);
  assert.equal(github.length, 1, `the header has no Open on GitHub: ${text(header)}`);
  const before = opened.length;
  github[0].handlers.on_click({}, cx);
  assert.deepEqual(opened.slice(before), [w.url(10)]);

  // Body: rendered as markdown.
  const body = nodes(tree, (n) => n.kind === "markdown" && text(n).includes(`## Goal ${s}`));
  assert.equal(body.length, 1, `the body is not a markdown view: ${text(tree)}`);
  assert.match(text(body[0]), new RegExp(`^- AC-1 ${s}\\n- AC-2 ${s}$`, "m"));

  // Sub-issues: each with its title, #number and Status, under "Sub-issues 2".
  const subs = byId(tree, "sub-issues");
  assert.ok(subs, `no sub-issues: ${text(tree)}`);
  assert.match(text(subs), /^Sub-issues 2\b/);
  for (const [i, status] of [[w.a, "In Review"], [w.b, "Todo"]]) {
    const row = byId(subs, `sub-${i.id}`);
    assert.ok(row, `no sub-issue #${i.number}: ${text(subs)}`);
    for (const part of [i.title, `#${i.number}`, status]) assert.ok(text(row).includes(part), `sub-issue #${i.number} lacks "${part}": ${text(row)}`);
  }

  // A sub-issue opens its own detail; Back walks up to the epic, then to the board.
  await clickRow(render, w.a.title);
  tree = render();
  assertDetail(tree, w.a, "after a click on the sub-issue");
  assert.equal(only(byId(tree, "detail-header"), "Feature").length, 1, "the sub-issue's header has no Feature type tag");
  assert.equal(await back(render), "Back to #10");
  assertDetail(render(), w.e, "after Back from the sub-issue");
  assert.equal(await back(render), "Back to the board");
  tree = render();
  assert.ok(!byId(tree, "detail-header"), `a detail still shows after Back: ${text(tree)}`);
  assert.ok(byId(tree, "board-list"), `no board list after Back: ${text(tree)}`);
  assert.ok(text(byId(tree, "board-list")).includes(w.e.title), `the epic's row is not on the list after Back: ${text(tree)}`);
});

// Checks #11's Activity: comments and this board's Status changes, oldest first; only the
// `Tests written at` comment is marked as a handoff.
function assertActivity(tree, s, w) {
  const activity = byId(tree, "activity");
  assert.ok(activity, `no Activity: ${text(tree)}`);
  const screen = text(activity);
  assert.match(screen, /^Activity 6\b/, `Activity doesn't count 3 comments and 3 Status changes: ${screen}`);
  const parts = ["No status → Specified · 3d ago", `dev-${s}`, `tester-${s}`, "Tests Written → In Progress · 1h ago", "In Progress → In Review · 20m ago", `rev-${s}`];
  const at = parts.map((p) => screen.indexOf(p));
  parts.forEach((p, i) => assert.ok(at[i] >= 0, `Activity lacks "${p}": ${screen}`));
  assert.deepEqual([...at].sort((x, y) => x - y), at, `Activity is not oldest first (${parts.join(" | ")}): ${screen}`);
  assert.ok(!screen.includes("Shipped"), `the other board's Status change shows: ${screen}`);

  const handoff = byId(tree, `comment-IC_2${s}`);
  assert.ok(handoff && text(handoff).includes(w.handoff), `no handoff comment in: ${screen}`);
  assert.equal(only(handoff, "Handoff").length, 1, `the handoff comment has no Handoff label: ${text(handoff)}`);
  assert.ok(nodes(handoff, (n) => n.props.border_l != null && n.props.border_color === "theme.accent").length, "the handoff comment has no accent bar");
  assert.equal(only(tree, "Handoff").length, 1, `not exactly one Handoff label (the quote isn't a handoff): ${screen}`);
}

test("T-2: should list comments and status changes in date order with a Handoff label on a `Tests written at` comment", async () => {
  const s = id();
  const w = world(s);
  const render = await toSubIssue(w);
  assertActivity(render(), s, w);
});

// The lead's known risk on #10 (PR #46 review): #11 also sits on a board the gh login can't read.
// GitHub answers with the issue's data plus an `errors` entry for that board; the detail still
// shows, with this board's Status changes (#44) and the comments.
test("T-2: should list comments and this board's status changes when GitHub also answers with an errors entry for a board the gh login can't read", async () => {
  const s = id();
  const w = world(s, { unreadable: true });
  const render = await toSubIssue(w);
  const tree = render();
  assert.ok(!text(tree).includes("Couldn't refresh"), `the detail shows a refresh error: ${text(tree)}`);
  assert.equal(only(byId(tree, "detail-header"), "In Review").length, 1, `the header has no In Review Status: ${text(byId(tree, "detail-header"))}`);
  assertActivity(tree, s, w);
});

test("T-3: should show an Open image link in place of a private image", async () => {
  const s = id();
  const w = world(s);
  const render = await toSubIssue(w);
  const tree = render();

  // The body's markdown image and the comment's <img>: links labelled by alt text, else file name.
  const before = opened.length;
  const body = clickLink(tree, `Spec ${s}`, `Open image: Detail header ${s}`);
  assert.equal(body.url, w.imageUrl);
  assert.ok(!body.md.includes("!["), `the body still holds the image: ${body.md}`);
  const shot = clickLink(tree, `Picked up ${s}`, `Open image: shot-${s}.png`);
  assert.equal(shot.url, w.shotUrl);
  assert.ok(!/<img\b/i.test(shot.md), `the comment still holds the image: ${shot.md}`);
  assert.deepEqual(opened.slice(before), [w.imageUrl, w.shotUrl]);
});

test("T-4: should show a new stubbed comment after one interval with the detail still open", async () => {
  const s = id();
  const w = world(s);
  const render = await toSubIssue(w);
  const handles = nodes(render(), (n) => n.props.track_scroll).map((n) => n.props.track_scroll);
  assert.equal(handles.length, 1, `the detail doesn't track one ScrollHandle: ${text(render())}`);
  const scroll = handles[0];
  scroll.offset = 480; // the owner scrolled #11's detail

  // An agent hands off while the owner reads.
  const handoff = `Tests written at abc1234 on story/11-open-the-detail-${s}`;
  w.comments.push({ id: `IC_4${s}`, author: { login: `agent-${s}` }, createdAt: ago(0), body: handoff });
  await advance(60_000); // one interval (the default 60 s)

  const tree = render();
  assertDetail(tree, w.a, "after one interval");
  const screen = text(byId(tree, "activity"));
  assert.ok(screen.includes(handoff), `no new comment after one interval: ${screen}`);
  assert.ok(screen.indexOf(`rev-${s}`) < screen.indexOf(`agent-${s}`), `the new comment is not last: ${screen}`);
  assert.equal(only(byId(tree, `comment-IC_4${s}`), "Handoff").length, 1, "the new handoff has no Handoff label");
  assert.deepEqual(nodes(tree, (n) => n.props.track_scroll).map((n) => n.props.track_scroll), [scroll], "the detail tracks another ScrollHandle");
  assert.equal(scroll.offset, 480, "scroll offset after the refresh");
  assert.equal(scroll.released, false, "the detail's ScrollHandle was released");
  // The trail is kept: Back still returns to the epic.
  assert.equal(await back(render), "Back to #10");
  assertDetail(render(), w.e, "after Back");
});
