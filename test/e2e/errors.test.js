// Story #4: clear messages for gh and git errors, Try again, and the loading indicator.
// Wording from the approved epic #1 prototype (cac901d, mod/main.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setImmediate as nextTurn } from "node:timers/promises";
import { herdrStub, mount, settle, tick, text, walk, cx } from "../support/harness.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const boards = (nodes) => ok(JSON.stringify({ data: { repository: { projectsV2: { nodes } } } }));
const id = () => randomUUID().slice(0, 8);

// One folder whose origin is github.com/<repo>. `answers.git()` and `answers.gh()` may be
// swapped during a test: each call asks the current one. git answers a normal repo by default.
function world(folder, repo, answers) {
  const gitRepo = (args) => {
    const [verb, ...rest] = args;
    if (verb === "remote" && rest.length === 0) return ok("origin\n");
    if (verb === "remote") return ok(`git@github.com:${repo}.git\n`);
    if (verb === "symbolic-ref") return ok("main\n");
    return ok("origin\n");
  };
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") return answers.gh(args);
    if (command !== "git" || options.cwd !== folder) return { code: 128, stdout: "", stderr: "fatal: not a git repository" };
    return (answers.git ?? gitRepo)(args);
  };
  herdrStub.spaces = [{ id: `s-${id()}`, folder: "/home/test", machine: null, active: true, tabs: [{ id: "t1", active: true }] }];
  herdrStub.panes = [{ pane: `p-${id()}`, terminal: `term-${id()}`, tab: "t1", cwd: folder, focused: true }];
}

async function loaded() {
  const view = await mount();
  await tick();
  await settle();
  return view;
}

// The clickable element whose text is `label` (a button, found by what it says).
function button(tree, label) {
  let found = null;
  walk(tree, (n) => {
    if (!found && n.handlers.on_click && text(n).trim() === label) found = n;
  });
  return found;
}

async function press(render, label) {
  const node = button(render(), label);
  assert.ok(node, `no "${label}" button in: ${text(render())}`);
  await node.handlers.on_click({}, cx);
  await settle();
}

test("T-6: should show `gh auth login -s project` when logged out and `gh auth refresh -s project` when the scope is missing", async () => {
  const s = id();
  const repo = `own-${s}/web-${s}`;

  world(`/w/${s}/out`, repo, {
    gh: () => ({
      code: 4,
      stdout: "",
      stderr:
        "To get started with GitHub CLI, please run:  gh auth login\n" +
        "Alternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.",
    }),
  });
  const out = text((await loaded()).render());
  assert.match(out, /gh isn't logged in/);
  assert.ok(out.includes("gh auth login -s project"), `login command missing in: ${out}`);
  assert.ok(!out.includes("gh auth refresh -s project"), `refresh command shown when logged out: ${out}`);

  const scopes =
    "Your token has not been granted the required scopes to execute this query. The 'projectsV2' field requires " +
    "one of the following scopes: ['read:project'], but your token has only been granted the: ['gist', 'read:org', " +
    "'repo'] scopes. Please modify your token's scopes at: https://github.com/settings/tokens.";
  world(`/w/${s}/scope`, repo, {
    gh: () => ({
      code: 1,
      stdout: JSON.stringify({ errors: [{ type: "INSUFFICIENT_SCOPES", message: scopes }] }),
      stderr: `gh: ${scopes}\nThis API operation needs the "read:project" scope. To request it, run:  gh auth refresh -h github.com -s read:project`,
    }),
  });
  const scope = text((await loaded()).render());
  assert.match(scope, /gh can't read project boards/);
  assert.ok(scope.includes("gh auth refresh -s project"), `refresh command missing in: ${scope}`);
  assert.ok(!scope.includes("gh auth login -s project"), `login command shown when only the scope is missing: ${scope}`);
});

test("T-3: should show Try again on a stubbed API failure and load the board after Try again once the stub succeeds", async () => {
  const s = id();
  const repo = `own-${s}/web-${s}`;
  const answers = { gh: () => ({ code: 1, stdout: "", stderr: `HTTP 502: Bad Gateway (https://api.github.com/graphql) ${s}` }) };
  world(`/w/${s}`, repo, answers);
  const { render } = await loaded();
  const failed = text(render());
  assert.match(failed, /The board didn't load/);
  assert.ok(failed.includes(`HTTP 502: Bad Gateway (https://api.github.com/graphql) ${s}`), `gh's error missing in: ${failed}`);
  assert.ok(button(render(), "Try again"), `no Try again button in: ${failed}`);

  answers.gh = () => boards([{ id: `PVT_${s}`, number: 1, title: `Roadmap ${s}`, closed: false }]);
  await press(render, "Try again");
  const after = text(render());
  assert.match(after, new RegExp(`Roadmap ${s} ${repo}`));
  assert.doesNotMatch(after, /The board didn't load|Try again/);
});

test('T-7: should show "Couldn\'t read this folder" with the error message when the stubbed git exec rejects, and resolve the repo after Try again once the stub succeeds', async () => {
  const s = id();
  const repo = `own-${s}/web-${s}`;
  // git can't start (here: not installed); exec rejects instead of answering.
  const answers = {
    git: () => Promise.reject(new Error(`git: No such file or directory (os error 2) ${s}`)),
    gh: () => boards([]),
  };
  world(`/w/${s}`, repo, answers);
  const { render } = await loaded();
  const failed = text(render());
  assert.match(failed, /Couldn't read this folder/);
  assert.ok(failed.includes(`git: No such file or directory (os error 2) ${s}`), `git's error missing in: ${failed}`);
  assert.doesNotMatch(failed, /GitHub CLI/, "a git failure is not a missing gh");
  assert.ok(button(render(), "Try again"), `no Try again button in: ${failed}`);

  answers.git = null; // git answers the repo again
  await press(render, "Try again");
  const after = text(render());
  assert.ok(after.includes(repo), `repo not resolved after Try again: ${after}`);
  assert.doesNotMatch(after, /Couldn't read this folder/);
});

// A node labelled for screen readers as loading, animated natively (spin, frames or loop), not by a timer.
function loadingIndicator(tree) {
  let found = null;
  walk(tree, (n) => {
    if (!found && /loading/i.test(String(n.props.accessibility_label ?? ""))) found = n;
  });
  return found;
}

function animated(node) {
  let yes = false;
  walk(node, (n) => {
    if (n.props.spin !== undefined || n.props.frames !== undefined || n.props.loop !== undefined) yes = true;
  });
  return yes;
}

test("T-4: should show the loading indicator while a stubbed gh call is pending", async () => {
  const s = id();
  const repo = `own-${s}/web-${s}`;
  let answer;
  const board = () => boards([{ id: `PVT_${s}`, number: 1, title: `Roadmap ${s}`, closed: false }]);
  // Only the first gh call waits; later ones (e.g. a later story's item reads) answer at once.
  world(`/w/${s}`, repo, { gh: () => (answer ? board() : new Promise((resolve) => { answer = resolve; })) });
  const { render } = await mount(); // init starts the first load; its task now waits on gh
  try {
    for (let i = 0; i < 10 && !answer; i++) await nextTurn(); // let git answer
    assert.ok(answer, "gh was asked for the boards");
    const indicator = loadingIndicator(render());
    assert.ok(indicator, `no loading indicator while gh is pending: ${text(render())}`);
    assert.ok(animated(indicator), "the loading indicator animates natively (spin, frames or loop)");
  } finally {
    // Always answer, or the waiting task would hang the next test's settle().
    answer?.(board());
    await settle();
  }
  assert.equal(loadingIndicator(render()), null, "the loading indicator is gone once the load ends");
});
