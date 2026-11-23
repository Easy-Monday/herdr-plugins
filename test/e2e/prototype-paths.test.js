// Prototype self-check for epic #1: each click path of the handoff, run against a prototype
// install (mock layer on, as `npm run prototype` writes it). The stories' tests replace it.
// Herdr-only behaviour (real scroll offsets, smooth scrolling, a remote machine, localStorage
// across a reload) is tested here up to the state the harness can reach; the owner confirms
// the rest in Herdr.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { herdrStub, mount, settle, click, byId, text, walk, timers, cx } from "../support/harness.js";

const script = new URL("../../scripts/install.sh", import.meta.url).pathname;
const home = mkdtempSync(join(tmpdir(), "herdr-proto-"));
const dest = execFileSync(script, ["prototype"], { env: { ...process.env, HERDR_APP_HOME: home } }).toString().trim();
const main = pathToFileURL(join(dest, "main.js")).href;
const MOD = "project-board-prototype";

// Each Herdr copy has its own localStorage; one map stands in for the copy under test.
const storage = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
});

// Real git is faked per folder; gh is answered by the prototype's mock layer.
const REPOS = {
  "/work/herdr": { origin: "git@github.com:Easy-Monday/herdr-plugins.git" },
  "/work/herdr-worktree": { origin: "git@github.com:Easy-Monday/herdr-plugins.git" },
  "/work/website": { origin: "git@github.com:acme/website.git" },
  "/work/fork": { origin: "git@github.com:me/fork.git", upstream: "https://github.com/up/stream.git" },
  "/work/tracking": { origin: "git@github.com:o/origin.git", mine: "git@github.com:o/tracked.git", tracking: "mine" },
  "/work/gitlab": { origin: "https://gitlab.com/a/b.git" },
};
const gitCalls = [];
const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
herdrStub.exec = (command, args, options = {}) => {
  if (command !== "git") return { code: 1, stdout: "", stderr: `unexpected ${command} call` };
  gitCalls.push({ args, options });
  const repo = REPOS[options.cwd];
  if (!repo) return { code: 128, stdout: "", stderr: "fatal: not a git repository" };
  const { tracking = "origin", ...remotes } = repo;
  if (args[0] === "remote") return args[1] === "get-url" ? ok(`${remotes[args[2]]}\n`) : ok(`${Object.keys(remotes).join("\n")}\n`);
  if (args[0] === "symbolic-ref") return ok("main\n");
  return ok(`${tracking}\n`);
};

// One space. tabs: [{ id, panes: [{ cwd } | { mod }] }]; each tab's first pane is its focused one.
function windowWith(tabs, active, { machine = null, folder = "/work/herdr" } = {}) {
  herdrStub.spaces = [{ id: "s1", machine, folder, active: true, tabs: tabs.map((t) => ({ id: t.id, active: t.id === active })) }];
  herdrStub.panes = tabs.flatMap((t) =>
    t.panes.map((p, i) => ({ pane: `${t.id}-${i}`, tab: t.id, terminal: p.mod ? null : `${t.id}-t${i}`, mod: p.mod, cwd: p.cwd ?? null, focused: i === 0 })),
  );
}
const terminal = (id, cwd) => ({ id, panes: [{ cwd }] });
const boardTab = (id) => ({ id, panes: [{ mod: MOD }] });

// Opens the panel, then picks the Board state; `tabs`/`active` describe the window at open time.
async function open(tabs = [terminal("t1", "/work/herdr")], active = tabs[0].id, opts) {
  windowWith(tabs, active, opts);
  storage.clear();
  return start();
}
async function start() {
  const before = timers.length;
  const app = await mount({}, main);
  app.timers = timers.slice(before);
  app.tree = () => app.render();
  app.text = () => text(app.render());
  app.poll = async () => {
    app.timers.find((t) => t.ms === 1000).fn(cx);
    await settle();
  };
  await pick(app, "board");
  return app;
}
async function pick(app, id, { wait = true } = {}) {
  if (!byId(app.tree(), `scenario-${id}`)) click(app.tree(), "prototype-toggle");
  click(app.tree(), `scenario-${id}`);
  if (wait) await settle();
}
async function press(app, id) {
  click(app.tree(), id);
  await settle();
}
async function switchTo(app, tabs, active, opts) {
  windowWith(tabs, active, opts);
  await app.poll();
}
const rows = (app) => {
  const keys = [];
  walk(byId(app.tree(), "board-list"), (n) => {
    if (n.props.id?.startsWith("row-")) keys.push(n.props.id.slice(4));
  });
  return keys;
};
const row = (app, key) => byId(app.tree(), `row-${key}`);
const pills = (node) => {
  const found = [];
  walk(node, (n) => {
    if (n.props.rounded === 9) found.push({ name: text(n).trim(), color: n.props.text_color });
  });
  return found;
};
const scrollHandle = (app) => byId(app.tree(), "board-list").props.track_scroll;

// #2 Show the repo of the active tab

test("#2 AC-1: shows owner/repo, choosing upstream, else the tracking remote, else origin", async () => {
  const app = await open([terminal("t1", "/work/herdr")]);
  assert.match(app.text(), /Easy-Monday\/herdr-plugins/);
  await switchTo(app, [terminal("t1", "/work/fork")], "t1");
  assert.equal(app.view.screen.repo, "up/stream");
  await switchTo(app, [terminal("t1", "/work/tracking")], "t1");
  assert.equal(app.view.screen.repo, "o/tracked");
});

test("#2 AC-2: re-resolves on cd in the terminal and on a tab switch", async () => {
  const app = await open([terminal("t1", "/work/herdr")]);
  await switchTo(app, [terminal("t1", "/work/website")], "t1"); // cd
  assert.match(app.text(), /Website relaunch/);
  assert.match(app.text(), /acme\/website/);
  await switchTo(app, [terminal("t1", "/work/website"), terminal("t2", "/work/herdr")], "t2"); // tab switch
  assert.match(app.text(), /Easy-Monday\/herdr-plugins/);
});

test("#2 AC-3: a tab with no terminal keeps the last folder seen for the space", async () => {
  const app = await open([terminal("t1", "/work/website")]);
  await switchTo(app, [terminal("t1", "/work/website"), { id: "t2", panes: [{ mod: "files" }] }], "t2");
  assert.equal(app.view.screen.repo, "acme/website"); // not the space folder /work/herdr
});

test("#2 AC-4: shows Not a git repo and No GitHub remote", async () => {
  const app = await open();
  await pick(app, "not-git");
  assert.match(app.text(), /Not a git repo/);
  await pick(app, "no-remote");
  assert.match(app.text(), /No GitHub remote/);
  await pick(app, "board"); // the same messages from real folders
  await switchTo(app, [terminal("t1", "/nowhere")], "t1");
  assert.match(app.text(), /Not a git repo/);
  await switchTo(app, [terminal("t1", "/work/gitlab")], "t1");
  assert.match(app.text(), /No GitHub remote/);
});

// Herdr-only: a real remote space. Here: every git call is sent to the space's machine, read-only.
test("#2 AC-5: runs only read-only git, on the space's machine", async () => {
  const from = gitCalls.length;
  await open([terminal("t1", "/work/herdr")], "t1", { machine: "mac-mini" });
  const calls = gitCalls.slice(from);
  assert.ok(calls.length);
  for (const { args, options } of calls) {
    assert.equal(options.on, "mac-mini");
    assert.ok(["remote", "symbolic-ref", "config"].includes(args[0]), args.join(" "));
    if (args[0] === "remote") assert.ok(args.length === 1 || args[1] === "get-url");
    if (args[0] === "config") assert.equal(args[1], "--get");
  }
});

// #3 Find the project board linked to the repo

test("#3 AC-1: the header shows the board name above owner/repo", async () => {
  const app = await open();
  assert.match(app.text(), /herdr-plugins\s+Easy-Monday\/herdr-plugins/);
});

test("#3 AC-2: no open linked board says so", async () => {
  const app = await open();
  await pick(app, "no-board");
  assert.match(app.text(), /No project board is linked to Easy-Monday\/herdr-plugins\./);
  assert.equal(byId(app.tree(), "board-list"), null);
});

test("#3 AC-3: two open linked boards lists both names and shows no board", async () => {
  const app = await open();
  await pick(app, "many-boards");
  assert.match(app.text(), /Only one linked board is supported/);
  assert.match(app.text(), /herdr-plugins/);
  assert.match(app.text(), /Herdr roadmap/);
  assert.doesNotMatch(app.text(), /Old roadmap/);
  assert.equal(byId(app.tree(), "board-list"), null);
});

// #4 Clear messages for gh and network errors

test("#4 AC-1: gh not installed says the GitHub CLI is needed", async () => {
  const app = await open();
  await pick(app, "gh-missing");
  assert.match(app.text(), /The GitHub CLI is needed/);
  assert.ok(byId(app.tree(), "get-gh").handlers.on_click);
});

test("#4 AC-2: gh not logged in shows gh auth login -s project", async () => {
  const app = await open();
  await pick(app, "gh-logged-out");
  assert.match(app.text(), /gh isn't logged in/);
  assert.match(app.text(), /gh auth login -s project/);
  assert.doesNotMatch(app.text(), /gh auth refresh/);
});

test("#4 AC-5: gh without the project scope shows gh auth refresh -s project", async () => {
  const app = await open();
  await pick(app, "gh-scope");
  assert.match(app.text(), /lacks the project scope/);
  assert.match(app.text(), /gh auth refresh -s project/);
  assert.doesNotMatch(app.text(), /gh auth login/);
});

test("#4 AC-3: an API error shows the error, and Try again loads the board", async () => {
  const app = await open();
  await pick(app, "api-error");
  assert.match(app.text(), /The board didn't load/);
  assert.match(app.text(), /HTTP 502/);
  await press(app, "try-again");
  assert.ok(byId(app.tree(), "board-list"));
});

test("#4 AC-4: a native spinner shows while the first load runs", async () => {
  const app = await open();
  await pick(app, "loading", { wait: false });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(app.text(), /Loading the board…/);
  assert.equal(byId(app.tree(), "refresh").kids[0].props.spin, 900);
  await pick(app, "board"); // releases the held load
  assert.ok(byId(app.tree(), "board-list"));
  assert.equal(byId(app.tree(), "refresh").kids[0].props.spin, undefined);
});

// #5 Board list rows with Status and progress

test("#5 AC-1: top-level rows in board order with state icon, title and #number", async () => {
  const app = await open();
  assert.deepEqual(rows(app), ["I_1", "I_10", "I_26", "PR_29", "PR_30", "DI_1", "I_27", "I_32", "I_33", "I_16"]);
  const first = row(app, "I_1");
  assert.match(text(first), /Epic: Project board panel/);
  assert.match(text(first), /#1/);
  let icon = null;
  walk(first, (n) => {
    if (n.kind === "svg" && n.props.accessibility_label === "Open") icon = n;
  });
  assert.ok(icon);
});

test("#5 AC-2: Status pills take the option colour; no Status, no pill", async () => {
  const app = await open();
  await press(app, "chevron-I_1");
  assert.deepEqual(pills(row(app, "I_1")), [{ name: "Specified", color: "theme.ansi5" }]);
  assert.deepEqual(pills(row(app, "I_2")), [{ name: "In Progress", color: "theme.ansi3" }]);
  assert.deepEqual(pills(row(app, "I_32")), []);
});

test("#5 AC-3: progress bar and percentage of closed sub-issues", async () => {
  const app = await open();
  assert.match(text(row(app, "I_1")), /13%/);
  assert.match(text(row(app, "I_10")), /0%/);
  assert.match(text(row(app, "I_16")), /50%/);
  assert.doesNotMatch(text(row(app, "I_26")), /%/);
});

// Herdr-only: scrolling without lag (the owner confirmed it at 0cce053). Here: all 300 items load,
// which takes three pages of 100 from the fixture.
test("#5 AC-4: a 300-item board loads every page", async () => {
  const app = await open();
  await pick(app, "big");
  assert.equal(rows(app).length, 257);
  await press(app, "show-done");
  assert.equal(rows(app).length, 300);
  await press(app, "show-done");
});

test("#5 AC-5: pull requests and draft issues are plain rows with title and Status", async () => {
  const app = await open();
  for (const key of ["PR_29", "PR_30", "DI_1"]) {
    assert.equal(byId(row(app, key), `chevron-${key}`).handlers.on_click, undefined);
    assert.equal(pills(row(app, key)).length, 1);
  }
  assert.match(text(row(app, "DI_1")), /Try Herdr's virtual list for long boards/);
});

// #6 Sub-issues nested under their parent

test("#6 AC-1: the chevron expands and collapses sub-issues at every level", async () => {
  const app = await open();
  await press(app, "chevron-I_1");
  assert.deepEqual(rows(app).slice(0, 9), ["I_1", "I_2", "I_3", "I_4", "I_5", "I_6", "I_7", "I_8", "I_9"]);
  assert.equal(row(app, "I_2").props.pl, 20);
  await press(app, "chevron-I_5");
  assert.equal(rows(app)[5], "I_31");
  assert.equal(row(app, "I_31").props.pl, 40);
  await press(app, "chevron-I_5");
  assert.ok(!rows(app).includes("I_31"));
  await press(app, "chevron-I_1");
  assert.ok(!rows(app).includes("I_2"));
});

test("#6 AC-2: a sub-issue shows its Status on this board, or none when it is off the board", async () => {
  const app = await open();
  await press(app, "chevron-I_1");
  await press(app, "chevron-I_5");
  assert.match(text(row(app, "I_2")), /Show the repo of the active tab/);
  assert.match(text(row(app, "I_2")), /#2/);
  assert.equal(pills(row(app, "I_2"))[0].name, "In Progress");
  assert.deepEqual(pills(row(app, "I_31")), []);
});

test("#6 AC-3: a sub-issue on the board shows only under its parent", async () => {
  const app = await open();
  for (const key of ["I_2", "I_3", "I_4", "I_5", "I_6", "I_7", "I_8", "I_9"]) assert.ok(!rows(app).includes(key));
  await press(app, "chevron-I_1");
  assert.equal(rows(app).filter((k) => k === "I_2").length, 1);
});

// #7 Hide Done by default

test("#7 AC-1: Done top-level items are hidden until Show done is on", async () => {
  const app = await open();
  assert.ok(!rows(app).includes("I_20"));
  assert.ok(!rows(app).includes("PR_28"));
  await press(app, "show-done");
  assert.ok(rows(app).includes("I_20"));
  assert.ok(rows(app).includes("PR_28"));
  await press(app, "show-done");
});

test("#7 AC-2: Done sub-issues of an expanded parent show either way", async () => {
  const app = await open();
  await press(app, "chevron-I_1");
  await press(app, "chevron-I_16");
  assert.ok(rows(app).includes("I_8"));
  assert.ok(rows(app).includes("I_18"));
  await press(app, "show-done");
  assert.ok(rows(app).includes("I_8"));
  assert.ok(rows(app).includes("I_18"));
  await press(app, "show-done");
});

// Herdr-only: the toggle after a real reload. Here: the copy's localStorage keeps it for a new view.
test("#7 AC-3: Show done stays on when the mod reloads", async () => {
  const app = await open();
  await press(app, "show-done");
  const again = await start(); // same copy (same storage), new view
  assert.equal(again.view.showDone, true);
  assert.equal(byId(again.tree(), "show-done").props.aria_selected, true);
  await press(again, "show-done");
});

// #8 Keep the board current

test("#8 AC-1: refresh and the 60 s timer reload the board", async () => {
  const app = await open();
  await press(app, "chevron-I_1");
  const status = () => pills(row(app, "I_3"))[0].name;
  const first = status();
  await press(app, "refresh");
  const second = status();
  assert.notEqual(second, first);
  const refresh = app.timers.filter((t) => t.ms === 60000);
  assert.equal(refresh.length, 1);
  refresh[0].fn(cx);
  await settle();
  assert.notEqual(status(), second);
});

// Herdr-only: the real scroll offset. Here: the list stays mounted with the same scroll handle.
test("#8 AC-2: a refresh keeps the expanded rows and the scroll handle", async () => {
  const app = await open();
  await press(app, "chevron-I_1");
  await press(app, "chevron-I_5");
  const handle = scrollHandle(app);
  click(app.tree(), "refresh");
  assert.equal(scrollHandle(app), handle); // during the load
  await settle();
  assert.equal(scrollHandle(app), handle);
  assert.ok(rows(app).includes("I_31"));
});

// Herdr-only: time passing while hidden. Here: one 60 s reload timer; the 1 s poll never loads
// unless the folder changed.
test("#8 AC-3: never polls gh faster than the refresh interval", async () => {
  const app = await open();
  assert.deepEqual(app.timers.map((t) => t.ms).sort(), [1000, 60000]);
  const from = gitCalls.length;
  for (let i = 0; i < 5; i++) await app.poll();
  assert.equal(gitCalls.length, from);
  assert.equal(app.view.loading, false);
});

// Herdr-only: the real scroll offset (the owner confirmed it at 75f207b). Here: the same handle.
test("#8 AC-4: a tab switch and back keeps scroll and expanded rows on the same board", async () => {
  const tabs = [terminal("t1", "/work/herdr"), terminal("t2", "/work/herdr-worktree"), terminal("t3", "/work/website")];
  const app = await open(tabs, "t1");
  await press(app, "chevron-I_1");
  const handle = scrollHandle(app);
  await switchTo(app, tabs, "t2"); // another tab, same repo
  assert.equal(scrollHandle(app), handle);
  assert.ok(rows(app).includes("I_2"));
  await switchTo(app, tabs, "t3"); // another repo's board, with its own handle
  assert.notEqual(scrollHandle(app), handle);
  await switchTo(app, tabs, "t1"); // back
  assert.equal(scrollHandle(app), handle);
  assert.ok(rows(app).includes("I_2"));
});

// #30 Keep a board tab on the board it started with

// tab.new puts the board tab right after the tab it was opened from, so that tab's terminal counts.
test("#30 AC-1: a board tab opens on the repo of the terminal focused when it opened", async () => {
  const tabs = [terminal("t0", "/work/herdr"), terminal("t1", "/work/website"), boardTab("board")]; // space folder: /work/herdr
  const app = await open(tabs, "board");
  assert.match(app.text(), /Website relaunch/);
  assert.match(app.text(), /acme\/website/);
});

// Herdr-only: the real scroll offset. Here: the same board, handle and expanded rows.
test("#30 AC-2: a board tab stays on its first board after other tabs, and after a reload", async () => {
  const tabs = [terminal("t1", "/work/website"), boardTab("board"), terminal("t3", "/work/herdr")];
  const app = await open(tabs, "board");
  await press(app, "chevron-I_101");
  const handle = scrollHandle(app);
  await switchTo(app, tabs, "t3"); // a tab in another repo
  assert.equal(app.view.screen.repo, "acme/website");
  await switchTo(app, tabs, "board"); // and back
  assert.equal(app.view.screen.repo, "acme/website");
  assert.equal(scrollHandle(app), handle);
  assert.ok(rows(app).includes("I_102"));
  windowWith(tabs, "t3"); // a hot reload while another tab is active
  const reloaded = await start();
  assert.equal(reloaded.view.screen.repo, "acme/website");
});

test("#30 AC-3: a panel outside the tabs still follows the active tab", async () => {
  const tabs = [terminal("t1", "/work/website"), terminal("t3", "/work/herdr")];
  const app = await open(tabs, "t1");
  assert.equal(app.view.pinned, null);
  await switchTo(app, tabs, "t3");
  assert.equal(app.view.screen.repo, "Easy-Monday/herdr-plugins");
});
