// Story #8: the board reloads on the header refresh button and on a timer, and keeps its
// expanded rows and scroll offset across a refresh and across tab switches.
// The scroll offset: Herdr keeps it in the ScrollHandle the list tracks (`.track_scroll`), as in
// the approved epic #1 prototype (cac901d); the stub handle's `offset` stands in for it.
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

// `folders`: each folder's origin repo. `boards`: each repo's one linked board,
// { id, title, items: () => item nodes }; items are read at call time, so a test can change them.
function world(folders, boards) {
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      if (args[0] !== "api" || args[1] !== "graphql") return fail(1, `unexpected gh ${args.join(" ")}`);
      const v = vars(args);
      if (/projectsV2/.test(query(args))) {
        const board = boards[`${v.owner}/${v.name}`];
        const nodes = board ? [{ id: board.id, number: 1, title: board.title, closed: false }] : [];
        return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } } }));
      }
      const board = Object.values(boards).find((b) => b.id === v.id);
      if (board) return ok(JSON.stringify(itemsPage(board.items())));
      return fail(1, `unexpected gh ${args.join(" ")}`);
    }
    const repo = folders[options.cwd];
    if (command !== "git" || !repo) return fail(128, "fatal: not a git repository");
    const [verb, ...rest] = args;
    if (verb === "remote" && rest.length === 0) return ok("origin\n");
    if (verb === "remote" && rest[0] === "get-url") return ok(`git@github.com:${repo}.git\n`);
    if (verb === "symbolic-ref") return ok("main\n");
    if (verb === "config") return ok("origin\n");
    return fail(1, `unexpected git ${args.join(" ")}`);
  };
}

// One space whose tabs each hold one terminal, in `folders` (tab id → cwd); `active` is focused.
function window(spaceId, folders, active) {
  herdrStub.spaces = [{ id: spaceId, folder: "/home/test", machine: null, active: true, tabs: Object.keys(folders).map((t) => ({ id: t, active: t === active })) }];
  herdrStub.panes = Object.entries(folders).map(([tab, cwd]) => ({ pane: `p-${tab}`, terminal: `term-${tab}`, tab, cwd, focused: true }));
}

// The header's refresh control: a clickable element labelled for screen readers as refresh.
function refreshButton(tree) {
  let found = null;
  walk(tree, (n) => {
    if (!found && n.handlers.on_click && /refresh/i.test(String(n.props.accessibility_label ?? ""))) found = n;
  });
  assert.ok(found, `no refresh button in: ${text(tree)}`);
  return found;
}

// The ScrollHandle the board list tracks: where its scroll offset lives.
function listScroll(tree) {
  let handle = null;
  walk(tree, (n) => {
    if (!handle && n.props.track_scroll) handle = n.props.track_scroll;
  });
  assert.ok(handle, `the board list tracks no ScrollHandle, so nothing keeps its scroll offset: ${text(tree)}`);
  return handle;
}

// Every node with the chain of its ancestors, outermost first.
function* withAncestors(node, above = []) {
  if (node == null || typeof node !== "object") return;
  yield [node, above];
  for (const kid of node.kids ?? []) yield* withAncestors(kid, [...above, node]);
}

// Clicks the expand control of the row titled `title`.
async function expand(tree, title) {
  for (const [node, above] of withAncestors(tree)) {
    if (node.props.accessibility_label !== "Expand sub-issues") continue;
    const line = [...above].reverse().find((a) => text(a).trim());
    if (line && text(line).includes(title)) {
      await node.handlers.on_click({}, cx);
      await settle();
      return;
    }
  }
  assert.fail(`no expand control on the row "${title}"`);
}

const has = (tree, s) => text(tree).includes(s);

test("T-1: should show a stubbed Status change after the refresh button and after one interval", async () => {
  const s = id();
  const folder = `/w/${s}`;
  const repo = `own-${s}/web-${s}`;
  const title = `Card ${s}`;
  let status = `Ready ${s}`;
  world({ [folder]: repo }, {
    [repo]: { id: `PVT_${s}`, title: `Board ${s}`, items: () => [issue({ id: `I_3${s}`, number: 3, title, status: { name: status, color: "GRAY" } })] },
  });
  window(`s-${s}`, { t1: folder }, "t1");
  const { render } = await mount(); // the first load, at 0 s
  await tick();
  assert.ok(has(render(), `Ready ${s}`), `first load: ${text(render())}`);

  // An agent moves the card. Nothing reloads before the interval is up...
  status = `Building ${s}`;
  await advance(58_000); // 59 s
  assert.ok(has(render(), `Ready ${s}`), `reloaded before 60 s: ${text(render())}`);
  // ...and one interval (the default 60 s) after the first load, the board shows the move.
  await advance(1_000); // 60 s
  assert.ok(has(render(), `Building ${s}`), `no reload after one interval: ${text(render())}`);
  assert.ok(!has(render(), `Ready ${s}`));

  // The refresh button reloads at once.
  status = `Testing ${s}`;
  await refreshButton(render()).handlers.on_click({}, cx);
  await settle();
  assert.ok(has(render(), `Testing ${s}`), `no reload after the refresh button: ${text(render())}`);
  assert.ok(!has(render(), `Building ${s}`));
});

test("T-2: should keep an expanded row expanded and the scroll offset after a refresh", async () => {
  const s = id();
  const folder = `/w/${s}`;
  const repo = `own-${s}/web-${s}`;
  const parent = `Epic ${s}`;
  const child = `Story ${s}`;
  let status = `Ready ${s}`;
  world({ [folder]: repo }, {
    [repo]: {
      id: `PVT_${s}`,
      title: `Board ${s}`,
      items: () => [
        issue({
          id: `I_1${s}`, number: 1, title: parent, status: { name: status, color: "GRAY" },
          summary: { total: 1, completed: 0, percentCompleted: 0 },
          subIssues: [subIssue({ id: `I_2${s}`, number: 2, title: child })],
        }),
      ],
    },
  });
  window(`s-${s}`, { t1: folder }, "t1");
  const { render } = await mount();
  await tick();
  await expand(render(), parent);
  assert.ok(has(render(), child), `the sub-issue is not shown after expanding: ${text(render())}`);
  const scroll = listScroll(render());
  scroll.offset = 480; // the owner scrolled the list

  // The refresh button: the list stays on screen, on the same scroll position, while it reloads.
  status = `Building ${s}`;
  const pressed = refreshButton(render()).handlers.on_click({}, cx);
  const during = render();
  assert.ok(has(during, child), `the list left the screen during the refresh: ${text(during)}`);
  assert.equal(listScroll(during).offset, 480, "scroll offset during the refresh");
  await pressed;
  await settle();
  let after = render();
  assert.ok(has(after, `Building ${s}`), `the refresh did not reload the board: ${text(after)}`);
  assert.ok(has(after, child), `the expanded row collapsed on refresh: ${text(after)}`);
  assert.equal(listScroll(after).offset, 480, "scroll offset after the refresh");
  assert.equal(listScroll(after).released, false);

  // The interval refresh keeps them too.
  status = `Testing ${s}`;
  await advance(60_000);
  after = render();
  assert.ok(has(after, `Testing ${s}`), `the interval did not reload the board: ${text(after)}`);
  assert.ok(has(after, child), `the expanded row collapsed on the interval refresh: ${text(after)}`);
  assert.equal(listScroll(after).offset, 480, "scroll offset after the interval refresh");
  assert.equal(listScroll(after).released, false);
});

test("T-4: should keep the scroll offset and expanded rows when focus moves to a tab in another repo and back, and when it moves to another tab of the same repo", async () => {
  const s = id();
  // Two clones of repo A (say, the main checkout and a worktree) and one of repo B.
  const folders = { t1: `/a/${s}`, t2: `/a-worktree/${s}`, t3: `/b/${s}` };
  const repoA = `own-${s}/a-${s}`;
  const repoB = `own-${s}/b-${s}`;
  const parent = `Epic A ${s}`;
  const child = `Story A ${s}`;
  world({ [folders.t1]: repoA, [folders.t2]: repoA, [folders.t3]: repoB }, {
    [repoA]: {
      id: `PVT_A${s}`,
      title: `Board A ${s}`,
      items: () => [
        issue({
          id: `I_1${s}`, number: 1, title: parent, status: { name: `Ready ${s}`, color: "GRAY" },
          summary: { total: 1, completed: 0, percentCompleted: 0 },
          subIssues: [subIssue({ id: `I_2${s}`, number: 2, title: child })],
        }),
      ],
    },
    [repoB]: { id: `PVT_B${s}`, title: `Board B ${s}`, items: () => [issue({ id: `I_9${s}`, number: 9, title: `Card B ${s}` })] },
  });
  const space = `s-${s}`;
  const focus = async (tab) => {
    window(space, folders, tab);
    await tick(); // the focus poll
  };
  window(space, folders, "t1");
  const { render } = await mount();
  await tick();
  await expand(render(), parent);
  listScroll(render()).offset = 480; // the owner scrolled board A

  // Another tab of the same repo: the same board, still expanded and scrolled.
  await focus("t2");
  let tree = render();
  assert.ok(has(tree, `Board A ${s}`), `not on board A: ${text(tree)}`);
  assert.ok(has(tree, child), `the expanded row collapsed on a switch to another tab of the same repo: ${text(tree)}`);
  assert.equal(listScroll(tree).offset, 480, "scroll offset after a switch to another tab of the same repo");

  // A tab in another repo shows that repo's board.
  await focus("t3");
  tree = render();
  assert.ok(has(tree, `Board B ${s}`) && has(tree, `Card B ${s}`), `not on board B: ${text(tree)}`);

  // Back to the first tab: board A as it was left.
  await focus("t1");
  tree = render();
  assert.ok(has(tree, `Board A ${s}`), `not back on board A: ${text(tree)}`);
  assert.ok(has(tree, child), `the expanded row collapsed after a switch to another repo and back: ${text(tree)}`);
  const scroll = listScroll(tree);
  assert.equal(scroll.offset, 480, "scroll offset after a switch to another repo and back");
  assert.equal(scroll.released, false);
});
