// Story #9: epic #1 acceptance. Each test drives the merged panel end to end through the harness:
// git and gh answered by `herdrStub.exec`, a space with terminal tabs, the View mounted, read and
// clicked. Wording and behaviour as in the approved epic #1 prototype (cac901d) and the owner's
// decisions on #1: no board-tab pinning (the panel follows the active tab, like Branch PR), and
// expanded rows and scroll position kept per board.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { herdrStub, mount, settle, tick, text, walk, cx } from "../support/harness.js";
import { issue, subIssue, pullRequest, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);

const vars = (args) => Object.fromEntries(args.filter((a) => /^\w+=/.test(a) && !a.startsWith("query=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const query = (args) => (args.find((a) => a.startsWith("query=")) ?? "").slice("query=".length);

const LOGGED_OUT = {
  code: 4,
  stdout: "",
  stderr:
    "To get started with GitHub CLI, please run:  gh auth login\n" +
    "Alternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.",
};
const SCOPES =
  "Your token has not been granted the required scopes to execute this query. The 'projectsV2' field requires " +
  "one of the following scopes: ['read:project'], but your token has only been granted the: ['gist', 'read:org', " +
  "'repo'] scopes. Please modify your token's scopes at: https://github.com/settings/tokens.";
const NO_SCOPE = {
  code: 1,
  stdout: JSON.stringify({ errors: [{ type: "INSUFFICIENT_SCOPES", message: SCOPES }] }),
  stderr: `gh: ${SCOPES}\nThis API operation needs the "read:project" scope. To request it, run:  gh auth refresh -h github.com -s read:project`,
};

// The machine the panel runs on. `folders`: cwd → the repo of its origin remote (other folders
// are not git repos). `boards`: repo → its one linked board { id, title, items: () => nodes }.
// `auth`: null when gh works, else the gh answer to every call (logged out, missing scope);
// tests change it as the owner fixes gh.
function world(folders, boards) {
  const state = { auth: null };
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      if (state.auth) return state.auth;
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
    if (command !== "git" || !repo) return fail(128, "fatal: not a git repository (or any of the parent directories): .git");
    const [verb, ...rest] = args;
    if (verb === "remote" && rest.length === 0) return ok("origin\n");
    if (verb === "remote" && rest[0] === "get-url") return ok(`git@github.com:${repo}.git\n`);
    if (verb === "symbolic-ref") return ok("main\n");
    if (verb === "config") return ok("origin\n");
    return fail(1, `unexpected git ${args.join(" ")}`);
  };
  return state;
}

// One space whose tabs each hold one terminal (tab id → cwd); `active` is the shown tab.
function window(spaceId, tabs, active) {
  herdrStub.spaces = [{ id: spaceId, folder: "/home/test", machine: null, active: true, tabs: Object.keys(tabs).map((t) => ({ id: t, active: t === active })) }];
  herdrStub.panes = Object.entries(tabs).map(([tab, cwd]) => ({ pane: `p-${spaceId}-${tab}`, terminal: `term-${spaceId}-${tab}`, tab, cwd, focused: true }));
}

// Herdr gives each mod copy its own localStorage (Show done is kept there); Node has none.
function freshStorage() {
  const data = new Map();
  const storage = {
    getItem: (k) => (data.has(String(k)) ? data.get(String(k)) : null),
    setItem: (k, v) => void data.set(String(k), String(v)),
    removeItem: (k) => void data.delete(String(k)),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
    flush: async () => {},
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
}

// Opens the panel and waits for the focus poll and every load.
async function open() {
  freshStorage();
  const { render } = await mount();
  await tick();
  await settle();
  return render;
}

// What the panel reads out, in order: accessibility labels and text.
function reading(node, out = []) {
  if (node == null) return out;
  if (typeof node !== "object") {
    out.push(String(node));
    return out;
  }
  if (node.props?.accessibility_label) out.push(String(node.props.accessibility_label));
  for (const kid of node.kids ?? []) reading(kid, out);
  return out;
}

// Index in `seq` of each of `wanted`, in order, or a failure naming the first one missing.
function inOrder(seq, wanted, from = 0) {
  const found = [];
  let i = from;
  for (const w of wanted) {
    while (i < seq.length && seq[i] !== w) i++;
    assert.ok(i < seq.length, `"${w}" missing after ${JSON.stringify(found.map((j) => seq[j]))} in: ${JSON.stringify(seq)}`);
    found.push(i++);
  }
  return found;
}

const nodes = (tree, match) => {
  const found = [];
  walk(tree, (n) => { if (match(n)) found.push(n); });
  return found;
};

// Every node with the chain of its ancestors, outermost first.
function* withAncestors(node, above = []) {
  if (node == null || typeof node !== "object") return;
  yield [node, above];
  for (const kid of node.kids ?? []) yield* withAncestors(kid, [...above, node]);
}

// Clicks the chevron of the row titled `title` (its nearest ancestor with text is that row's line).
async function chevron(render, title) {
  for (const [node, above] of withAncestors(render())) {
    if (!/^(Expand|Collapse) sub-issues$/.test(node.props.accessibility_label ?? "")) continue;
    const line = [...above].reverse().find((a) => text(a).trim());
    if (line && text(line).includes(title)) {
      await node.handlers.on_click({}, cx);
      await settle();
      return;
    }
  }
  assert.fail(`no sub-issues chevron on the row "${title}" in: ${text(render())}`);
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

// Clicks the clickable element whose text or label is `label`.
async function press(render, label) {
  const found = nodes(render(), (n) => n.handlers.on_click && (text(n).trim() === label || n.props.accessibility_label === label));
  assert.ok(found.length, `no "${label}" control in: ${text(render())}`);
  await found.at(-1).handlers.on_click({}, cx);
  await settle();
}

// The ScrollHandle the board list tracks: where Herdr keeps its scroll offset.
function listScroll(tree) {
  const handle = nodes(tree, (n) => n.props.track_scroll).map((n) => n.props.track_scroll)[0];
  assert.ok(handle, `the board list tracks no ScrollHandle: ${text(tree)}`);
  return handle;
}

// A board like the owner's: an epic with two sub-issues (one also on the board), a PR, a
// Done item. Titles carry `s`, so each test asserts only on its own data.
function epicBoard(s, tag) {
  const t = {
    epic: `Epic ${tag} ${s}`,
    story: `Story ${tag} ${s}`,
    loose: `Loose ${tag} ${s}`,
    pr: `Pull ${tag} ${s}`,
    done: `Shipped ${tag} ${s}`,
  };
  const items = () => [
    issue({
      id: `I_1${tag}${s}`, number: 1, title: t.epic, status: { name: "In Progress", color: "YELLOW" },
      summary: { total: 2, completed: 1, percentCompleted: 50 },
      subIssues: [subIssue({ id: `I_5${tag}${s}`, number: 5, title: t.story }), subIssue({ id: `I_31${tag}${s}`, number: 31, title: t.loose, state: "CLOSED", stateReason: "COMPLETED" })],
    }),
    issue({ id: `I_5${tag}${s}`, number: 5, title: t.story, status: { name: "In Review", color: "BLUE" } }),
    pullRequest({ id: `PR_29${tag}${s}`, number: 29, title: t.pr, status: { name: "In Review", color: "BLUE" } }),
    issue({ id: `I_8${tag}${s}`, number: 8, title: t.done, state: "CLOSED", stateReason: "COMPLETED", status: { name: "Done", color: "PURPLE" } }),
  ];
  return { t, board: { id: `PVT_${tag}${s}`, title: `Board ${tag} ${s}`, items } };
}

test("T-1: should show the board name, repo and top-level rows with Status pills and progress bars", async () => {
  const s = id();
  const repo = `own-${s}/web-${s}`;
  const { t, board } = epicBoard(s, "A");
  world({ [`/w/${s}`]: repo }, { [repo]: board });
  window(`s-${s}`, { t1: `/w/${s}` }, "t1");

  const render = await open();
  const tree = render();
  const seq = reading(tree);

  // Header: the board name above owner/repo.
  inOrder(seq, [board.title, repo]);
  // Top-level rows in board order: state icon, title, #number, Status pill, progress.
  const [, epicAt] = inOrder(seq, ["Open", t.epic, "#1", "In Progress", "50%"]);
  inOrder(seq, ["Open", t.pr, "#29", "In Review"], epicAt);
  // The story is a sub-issue of the epic: not a top-level row while the epic is collapsed.
  assert.ok(!text(tree).includes(t.story), `a sub-issue shows as a top-level row: ${text(tree)}`);
  // The pill takes the Status option's colour from the theme; the progress bar is labelled.
  const colours = nodes(tree, (n) => text(n).trim() === "In Progress").map((n) => n.props.text_color);
  assert.ok(colours.includes("theme.ansi3"), `In Progress pill colours: ${colours}`);
  assert.ok(nodes(tree, (n) => /\b50%/.test(n.props.accessibility_label ?? "")).length, "no progress bar for the epic's 50%");
});

test("T-2: should show indented sub-issues on expand and hide Done top-level rows until Show done is toggled", async () => {
  const s = id();
  const repo = `own-${s}/web-${s}`;
  const { t, board } = epicBoard(s, "A");
  world({ [`/w/${s}`]: repo }, { [repo]: board });
  window(`s-${s}`, { t1: `/w/${s}` }, "t1");
  const render = await open();

  // Show done off (the default): the Done top-level item is hidden.
  assert.ok(text(render()).includes(t.epic));
  assert.ok(!text(render()).includes(t.done), `a Done top-level row shows with Show done off: ${text(render())}`);

  // Expand the epic: its sub-issues show indented, the one on the board with its Status.
  await chevron(render, t.epic);
  let tree = render();
  assert.ok(inset(tree, t.story) > inset(tree, t.epic), `story inset ${inset(tree, t.story)} vs epic ${inset(tree, t.epic)}`);
  assert.ok(inset(tree, t.loose) > inset(tree, t.epic), `loose inset ${inset(tree, t.loose)} vs epic ${inset(tree, t.epic)}`);
  const seq = reading(tree);
  const [, storyAt] = inOrder(seq, [t.epic, t.story]);
  const next = seq.indexOf(t.loose) > storyAt ? seq.indexOf(t.loose) : seq.indexOf(t.pr);
  assert.ok(seq.slice(storyAt, next).includes("In Review"), `the sub-issue's Status is not on its row: ${JSON.stringify(seq.slice(storyAt, next))}`);
  // A closed sub-issue still shows under its parent with Show done off.
  assert.ok(text(tree).includes(t.loose), "a closed sub-issue is hidden under its parent");

  // Show done on: the Done top-level item shows, and the expanded epic stays open.
  await press(render, "Show done");
  tree = render();
  assert.ok(text(tree).includes(t.done), `Show done on, the Done item is missing: ${text(tree)}`);
  assert.ok(text(tree).includes(t.story), "Show done collapsed the expanded epic");

  // Show done off again: hidden again.
  await press(render, "Show done");
  assert.ok(!text(render()).includes(t.done), "Show done off again, the Done item still shows");
});

test("T-3: should switch to the other repo's board when focus moves to a tab in that repo", async () => {
  const s = id();
  const [repoA, repoB] = [`own-${s}/a-${s}`, `own-${s}/b-${s}`];
  const a = epicBoard(s, "A");
  const b = epicBoard(s, "B");
  const tabs = { t1: `/a/${s}`, t2: `/b/${s}` };
  world({ [tabs.t1]: repoA, [tabs.t2]: repoB }, { [repoA]: a.board, [repoB]: b.board });
  const space = `s-${s}`;
  const focus = async (tab) => {
    window(space, tabs, tab);
    await tick(); // the focus poll
    await settle();
  };
  window(space, tabs, "t1");
  const render = await open();
  assert.ok(text(render()).includes(`${a.board.title} ${repoA}`), `not on board A: ${text(render())}`);
  await chevron(render, a.t.epic);
  listScroll(render()).offset = 320; // the owner scrolled board A

  // A tab in repo B: B's board, B's rows, none of A's; B starts collapsed and at the top.
  await focus("t2");
  let tree = render();
  assert.ok(text(tree).includes(`${b.board.title} ${repoB}`), `not on board B: ${text(tree)}`);
  assert.ok(text(tree).includes(b.t.epic), `B's rows are missing: ${text(tree)}`);
  for (const title of [a.board.title, repoA, a.t.epic, a.t.story]) assert.ok(!text(tree).includes(title), `"${title}" from repo A still shows on B`);
  assert.ok(!text(tree).includes(b.t.story), "B's epic opened expanded: expansion is per board");
  assert.equal(listScroll(tree).offset, 0, "B's list starts at the top: the scroll position is per board");

  // Back to the tab in repo A: board A as it was left (owner's decision: per-board state).
  await focus("t1");
  tree = render();
  assert.ok(text(tree).includes(`${a.board.title} ${repoA}`), `not back on board A: ${text(tree)}`);
  assert.ok(!text(tree).includes(b.t.epic), "B's rows still show on A");
  assert.ok(text(tree).includes(a.t.story), "A's expanded epic collapsed after a switch to B and back");
  assert.equal(listScroll(tree).offset, 320, "A's scroll position after a switch to B and back");
});

// AC-4 names one gh message; the owner split it on #4 (comment on #1, prototype at 99dc241):
// logged out shows `gh auth login -s project`, a login without the project scope shows
// `gh auth refresh -s project`. This test checks both, and the not-a-git-repo message.
test("T-4: should show the not-a-git-repo message and the gh login message with `gh auth refresh -s project` (logged out: `gh auth login -s project`)", async () => {
  const s = id();
  const repo = `own-${s}/web-${s}`;
  const { t, board } = epicBoard(s, "A");
  const tabs = { t1: `/plain/${s}`, t2: `/w/${s}` };
  const gh = world({ [tabs.t2]: repo }, { [repo]: board });
  gh.auth = LOGGED_OUT;
  const space = `s-${s}`;
  window(space, tabs, "t1");

  // A terminal in a plain folder: the not-a-git-repo message, no board, no gh message.
  const render = await open();
  let screen = text(render());
  assert.match(screen, /Not a git repo/);
  assert.doesNotMatch(screen, /gh isn't logged in|gh can't read project boards/);

  // Focus moves to a tab in a GitHub repo while gh is logged out: the login message.
  window(space, tabs, "t2");
  await tick();
  await settle();
  screen = text(render());
  assert.match(screen, /gh isn't logged in/);
  assert.ok(screen.includes("gh auth login -s project"), `login command missing in: ${screen}`);
  assert.doesNotMatch(screen, /Not a git repo/);

  // The owner logs in without the project scope, then reloads: the scope message.
  gh.auth = NO_SCOPE;
  await press(render, "Refresh board");
  screen = text(render());
  assert.match(screen, /gh can't read project boards/);
  assert.ok(screen.includes("gh auth refresh -s project"), `refresh command missing in: ${screen}`);
  assert.ok(!screen.includes("gh auth login -s project"), `login command shown when only the scope is missing: ${screen}`);

  // The owner runs `gh auth refresh -s project` and reloads: the board shows.
  gh.auth = null;
  await press(render, "Refresh board");
  screen = text(render());
  assert.ok(screen.includes(`${board.title} ${repo}`) && screen.includes(t.epic), `board not shown once gh works: ${screen}`);
  assert.doesNotMatch(screen, /gh isn't logged in|gh can't read project boards/);
});

// `herdr-app check` needs the Herdr app, which CI doesn't have (CLAUDE.md `## Commands`, Check):
// there this test skips, and Check is run locally before every handoff and PR.
const herdrApp = (() => {
  try {
    execFileSync("herdr-app", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("T-5: should pass `herdr-app check` on the mod folder (runs only where herdr-app is on PATH, skipped in CI)", { skip: !herdrApp && "herdr-app is not on PATH" }, () => {
  const mod = new URL("../../mod", import.meta.url).pathname;
  const out = execFileSync("herdr-app", ["check", mod], { encoding: "utf8" });
  assert.match(out, /check passed/);
});
