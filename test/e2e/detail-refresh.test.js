// Story #16: an open issue detail reloads on the board's refresh cycle and keeps its place
// (epic #10 prototype a28afdf: mods/project-board/main.js `loadDetail`, the REFRESH_MS timer, `detailBody`'s
// `track_scroll(d.scroll)`). The scroll offset: Herdr keeps it in the ScrollHandle the detail's
// scroll area tracks, one per detail as in the prototype; the stub handle's `offset` stands in for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, advance, text, walk, cx } from "../support/harness.js";
import { issue, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);

const vars = (args) => Object.fromEntries(args.filter((a) => /^\w+=/.test(a) && !a.startsWith("query=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const query = (args) => (args.find((a) => a.startsWith("query=")) ?? "").slice("query=".length);
const asks = (q, field) => new RegExp(`\\b${field}\\b`).test(q);

// Like GitHub, the stub answers only the issue fields the query names.
const issueAnswer = (q, node) => ({ data: { node: Object.fromEntries(Object.entries(node).filter(([k]) => k === "id" || asks(q, k))) } });

// Times relative to the real clock: the mod reads Date.now() when it draws.
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

// Every folder in `folders` is a clone of one repo, linked to one board holding one issue whose
// comments are `comments` (read at call time, so a test can add one). `hold()` makes the next
// issue query wait until released, to look at the screen while the detail reloads.
function world(s, folders, comments) {
  const repo = `own-${s}/web-${s}`;
  const title = `Plan ${s}`;
  const project = { id: `PVT_${s}`, number: 11, title: `Board ${s}`, url: `https://github.com/orgs/own-${s}/projects/11`, closed: false };
  const node = () => ({
    id: `I_1${s}`, number: 1, title, url: `https://github.com/${repo}/issues/1`, state: "OPEN", stateReason: null,
    body: `Body ${s}`, issueType: null, projectItems: { nodes: [] }, subIssues: { nodes: [] },
    comments: { nodes: [...comments] }, timelineItems: { nodes: [] },
  });
  let gate = null;
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      if (args[0] !== "api" || args[1] !== "graphql") return fail(1, `unexpected gh ${args.join(" ")}`);
      const q = query(args);
      if (/projectsV2/.test(q)) return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } } } } }));
      const { id: nodeId } = vars(args);
      if (nodeId === project.id) return ok(JSON.stringify(itemsPage([issue({ id: `I_1${s}`, number: 1, title })])));
      if (nodeId === `I_1${s}`) {
        const answer = () => ok(JSON.stringify(issueAnswer(q, node())));
        if (!gate) return answer();
        const held = gate;
        gate = null;
        held.begin();
        return held.wait.then(answer);
      }
      return fail(1, `unexpected gh ${args.join(" ")}`);
    }
    if (command !== "git" || !folders.includes(options.cwd)) return fail(128, "fatal: not a git repository");
    const [verb, ...rest] = args;
    if (verb === "remote" && rest.length === 0) return ok("origin\n");
    if (verb === "remote" && rest[0] === "get-url") return ok(`git@github.com:${repo}.git\n`);
    if (verb === "symbolic-ref") return ok("main\n");
    if (verb === "config") return ok("origin\n");
    return fail(1, `unexpected git ${args.join(" ")}`);
  };
  const hold = () => {
    const held = { begun: false };
    held.wait = new Promise((r) => (held.release = r));
    held.started = new Promise((r) => (held.begin = () => { held.begun = true; r(); }));
    gate = held;
    return held;
  };
  return { title, hold };
}

// Spaces, each with tabs holding one terminal: `layout` is { spaceId: { tabId: cwd } };
// the space and tab named by `active` are focused.
function window(layout, [activeSpace, activeTab]) {
  herdrStub.spaces = Object.entries(layout).map(([sp, tabs]) => ({
    id: sp, folder: "/home/test", machine: null, active: sp === activeSpace,
    tabs: Object.keys(tabs).map((t) => ({ id: t, active: t === activeTab || (sp !== activeSpace && t === Object.keys(tabs)[0]) })),
  }));
  herdrStub.panes = Object.values(layout).flatMap((tabs) => Object.entries(tabs).map(([tab, cwd]) => ({ pane: `p-${tab}`, terminal: `term-${tab}`, tab, cwd, focused: true })));
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

// The issue's detail is on screen, not the board list: its Back control and its body show.
function assertDetailOpen(tree, s, when) {
  const back = nodes(tree, (n) => n.handlers.on_click && /^Back/.test(String(n.props.accessibility_label ?? "")));
  assert.ok(back.length && text(tree).includes(`Body ${s}`), `the issue's detail is not open ${when}: ${text(tree)}`);
  assert.equal(nodes(tree, (n) => n.props.id === "board-list").length, 0, `the board list shows ${when}`);
}

// The ScrollHandle the detail's scroll area tracks (the board list is not drawn under a detail).
function detailScroll(tree) {
  const handles = nodes(tree, (n) => n.props.track_scroll).map((n) => n.props.track_scroll);
  assert.ok(handles.length, `the detail tracks no ScrollHandle, so nothing keeps its scroll offset: ${text(tree)}`);
  return handles[0];
}

const comment = (s, n, minutes, body) => ({ id: `IC_${n}${s}`, author: { login: `dev-${n}-${s}` }, createdAt: ago(minutes), body });

test("T-1: should show a new stubbed comment after one interval", async () => {
  const s = id();
  const folder = `/w/${s}`;
  const comments = [comment(s, 1, 30, `First ${s}`)];
  const { title } = world(s, [folder], comments);
  window({ [`s-${s}`]: { t1: folder } }, [`s-${s}`, "t1"]);
  const { render } = await mount();
  await tick();
  await settle();
  await clickRow(render, title);
  assert.ok(text(render()).includes(`First ${s}`), `the detail lacks its first comment: ${text(render())}`);

  // An agent hands off while the owner reads.
  comments.push(comment(s, 2, 0, `Tests written at abc1234 on story/1-${s}`));
  await advance(60_000); // one interval (the default 60 s)
  const tree = render();
  assert.ok(text(tree).includes(`Tests written at abc1234 on story/1-${s}`), `no new comment after one interval: ${text(tree)}`);
  assertDetailOpen(tree, s, "after the interval");
  assert.ok(text(tree).indexOf(`First ${s}`) < text(tree).indexOf(`Tests written at abc1234`), `the new comment is not after the first: ${text(tree)}`);
});

test("T-2: should keep the issue open and the scroll offset after a refresh", async () => {
  const s = id();
  const folder = `/w/${s}`;
  const comments = [comment(s, 1, 30, `First ${s}`)];
  const { title, hold } = world(s, [folder], comments);
  window({ [`s-${s}`]: { t1: folder } }, [`s-${s}`, "t1"]);
  const { render } = await mount();
  await tick();
  await settle();
  await clickRow(render, title);
  const scroll = detailScroll(render());
  scroll.offset = 480; // the owner scrolled the detail

  // While the interval reload is under way, the detail stays on screen with the same scroll.
  comments.push(comment(s, 2, 0, `Second ${s}`));
  const held = hold();
  const running = advance(60_000);
  await Promise.race([held.started, running]);
  assert.ok(held.begun, "the interval did not reload the detail");
  const during = render();
  assertDetailOpen(during, s, "while it reloads");
  assert.equal(detailScroll(during), scroll, "the detail tracks another ScrollHandle while it reloads");
  assert.equal(scroll.offset, 480, "scroll offset while the detail reloads");
  held.release();
  await running;

  const after = render();
  assert.ok(text(after).includes(`Second ${s}`), `the refresh did not reload the detail: ${text(after)}`);
  assertDetailOpen(after, s, "after the refresh");
  assert.equal(detailScroll(after), scroll, "the detail tracks another ScrollHandle after the refresh");
  assert.equal(scroll.offset, 480, "scroll offset after the refresh");
  assert.equal(scroll.released, false);
});

// The lead's note on #16 (from #11 / PR #42): like the board list (#8 AC-4), the detail keeps its
// scroll across tab and space switches; a switch re-resolves the repo and reloads its board.
test("T-2: should keep the issue open and the scroll offset after a refresh caused by a switch to another tab or space of the same repo", async () => {
  const s = id();
  // Three clones of one repo (say, the main checkout and two worktrees): two tabs of one space, one in another space.
  const folders = { t1: `/w/${s}`, t2: `/wt1/${s}`, t3: `/wt2/${s}` };
  const comments = [comment(s, 1, 30, `First ${s}`)];
  const { title } = world(s, Object.values(folders), comments);
  const layout = { [`s1-${s}`]: { t1: folders.t1, t2: folders.t2 }, [`s2-${s}`]: { t3: folders.t3 } };
  const focus = async (space, tab) => {
    window(layout, [space, tab]);
    await tick(); // the focus poll
  };
  window(layout, [`s1-${s}`, "t1"]);
  const { render } = await mount();
  await tick();
  await settle();
  await clickRow(render, title);
  const scroll = detailScroll(render());
  scroll.offset = 480; // the owner scrolled the detail

  for (const [space, tab, where] of [
    [`s1-${s}`, "t2", "another tab of the same repo"],
    [`s2-${s}`, "t3", "another space in the same repo"],
    [`s1-${s}`, "t1", "back to the first tab"],
  ]) {
    await focus(space, tab);
    const tree = render();
    assertDetailOpen(tree, s, `after a switch to ${where}`);
    assert.equal(detailScroll(tree), scroll, `the detail tracks another ScrollHandle after a switch to ${where}`);
    assert.equal(scroll.offset, 480, `scroll offset after a switch to ${where}`);
    assert.equal(scroll.released, false, `the detail's ScrollHandle was released after a switch to ${where}`);
  }
});
