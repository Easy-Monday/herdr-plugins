// Story #2: the panel follows the repo of the active tab's focused terminal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text } from "../support/harness.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });

// A fake set of folders, keyed by cwd: { remotes: { name: url }, branch, tracking }.
// Every exec call is recorded. gh answers "no linked boards", so later stories' board
// loading doesn't change what these tests read.
function world(folders) {
  const calls = [];
  herdrStub.exec = (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (command === "gh") return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [] } } } }));
    if (command !== "git") return fail(127, `${command}: command not found`);
    const repo = folders[options.cwd];
    if (!repo) return fail(128, "fatal: not a git repository (or any of the parent directories): .git");
    const [verb, ...rest] = args;
    if (verb === "remote" && rest.length === 0) return ok(Object.keys(repo.remotes).map((n) => `${n}\n`).join(""));
    if (verb === "remote" && rest[0] === "get-url")
      return rest[1] in repo.remotes ? ok(`${repo.remotes[rest[1]]}\n`) : fail(2, `error: No such remote '${rest[1]}'`);
    if (verb === "symbolic-ref") return repo.branch ? ok(`${repo.branch}\n`) : fail(1);
    if (verb === "config" && rest[0] === "--get" && rest[1] === `branch.${repo.branch}.remote`)
      return repo.tracking ? ok(`${repo.tracking}\n`) : fail(1);
    return fail(1, `unexpected git ${args.join(" ")}`);
  };
  return calls;
}

const id = () => randomUUID().slice(0, 8);
const github = (repo) => `git@github.com:${repo}.git`;
const terminal = (tab, cwd, focused = true) => ({ pane: `p-${id()}`, terminal: `term-${id()}`, tab, cwd, focused });
const modPane = (tab) => ({ pane: `p-${id()}`, terminal: null, mod: "project-board", tab, cwd: null, focused: true });
const space = (sid, tabs, active = true, machine = null) => ({
  id: sid,
  folder: "/home/test",
  machine,
  active,
  tabs: tabs.map(([tid, on]) => ({ id: tid, active: on })),
});

// What the panel shows once the focus poll has run and every load has finished.
async function shown(render) {
  await tick();
  await settle();
  return text(render());
}

test("T-3: should show the new owner/repo after focus moves to a pane in another repo, and after `cd` into another repo", async () => {
  const s = id();
  const [a, b, c] = [`own-${s}/alpha`, `own-${s}/beta`, `own-${s}/gamma`];
  world({
    [`/w/${s}/a`]: { remotes: { origin: github(a) }, branch: "main", tracking: "origin" },
    [`/w/${s}/b`]: { remotes: { origin: github(b) }, branch: "main", tracking: "origin" },
    [`/w/${s}/c`]: { remotes: { origin: github(c) }, branch: "main", tracking: "origin" },
  });
  const one = terminal("t1", `/w/${s}/a`, true);
  const two = terminal("t1", `/w/${s}/b`, false);
  herdrStub.spaces = [space(`s-${s}`, [["t1", true]])];
  herdrStub.panes = [one, two];
  const { render } = await mount();
  assert.match(await shown(render), new RegExp(a));

  // Focus moves to the other pane of the same tab, in another repo.
  one.focused = false;
  two.focused = true;
  const afterFocus = await shown(render);
  assert.match(afterFocus, new RegExp(b));
  assert.doesNotMatch(afterFocus, new RegExp(a));

  // `cd` in the focused terminal into a third repo.
  two.cwd = `/w/${s}/c`;
  const afterCd = await shown(render);
  assert.match(afterCd, new RegExp(c));
  assert.doesNotMatch(afterCd, new RegExp(b));
});

test("T-4: should keep the space's last known folder when the active tab has no pane with a cwd", async () => {
  const s = id();
  const [a, b] = [`own-${s}/alpha`, `own-${s}/beta`];
  world({
    [`/w/${s}/a`]: { remotes: { origin: github(a) }, branch: "main", tracking: "origin" },
    [`/w/${s}/b`]: { remotes: { origin: github(b) }, branch: "main", tracking: "origin" },
  });
  const [s1, s2] = [`s1-${s}`, `s2-${s}`];
  const panes = [terminal("t1", `/w/${s}/a`), modPane("t2"), terminal("t3", `/w/${s}/b`), modPane("t4")];
  herdrStub.panes = panes;
  herdrStub.spaces = [space(s1, [["t1", true], ["t2", false]]), space(s2, [["t3", false], ["t4", false]], false)];
  const { render } = await mount();
  assert.match(await shown(render), new RegExp(a));

  // A tab with only a mod pane (no terminal) in the same space keeps the space's last folder.
  herdrStub.spaces = [space(s1, [["t1", false], ["t2", true]]), space(s2, [["t3", false], ["t4", false]], false)];
  const modTab = await shown(render);
  assert.match(modTab, new RegExp(a));
  assert.doesNotMatch(modTab, /Not a git repo/);

  // Another space with a terminal in another repo shows that repo, and its mod-only tab keeps it.
  herdrStub.spaces = [space(s1, [["t1", false], ["t2", true]], false), space(s2, [["t3", true], ["t4", false]])];
  assert.match(await shown(render), new RegExp(b));
  herdrStub.spaces = [space(s1, [["t1", false], ["t2", true]], false), space(s2, [["t3", false], ["t4", true]])];
  assert.match(await shown(render), new RegExp(b));

  // Back to the first space's mod-only tab: that space's own last folder, not the other space's.
  herdrStub.spaces = [space(s1, [["t1", false], ["t2", true]]), space(s2, [["t3", false], ["t4", true]], false)];
  const back = await shown(render);
  assert.match(back, new RegExp(a));
  assert.doesNotMatch(back, new RegExp(b));
});

test('T-5: should show "Not a git repo" in a plain folder and "No GitHub remote" in a repo whose only remote is not GitHub', async () => {
  const s = id();
  world({ [`/w/${s}/gl`]: { remotes: { origin: `https://gitlab.com/own-${s}/web.git` }, branch: "main", tracking: "origin" } });

  herdrStub.spaces = [space(`s-${s}`, [["t1", true]])];
  herdrStub.panes = [terminal("t1", `/w/${s}/plain`)];
  const plain = await mount();
  const plainText = await shown(plain.render);
  assert.match(plainText, /Not a git repo/);
  assert.doesNotMatch(plainText, /No GitHub remote/);

  herdrStub.panes = [terminal("t1", `/w/${s}/gl`)];
  const gitlab = await mount();
  const gitlabText = await shown(gitlab.render);
  assert.match(gitlabText, /No GitHub remote/);
  assert.doesNotMatch(gitlabText, /Not a git repo/);
});

test("T-6: should call exec only with `git remote`, `git remote get-url`, `git symbolic-ref` or `git config --get`, with `on: space.machine` for remote spaces", async () => {
  const s = id();
  const machine = `box-${s}`;
  const [up, fork] = [`up-${s}/web`, `fork-${s}/web`];
  const calls = world({
    [`/w/${s}/a`]: { remotes: { origin: github(fork), upstream: github(up), fork: github(fork) }, branch: "feat", tracking: "fork" },
    [`/w/${s}/t`]: { remotes: { origin: github(fork), fork: github(fork) }, branch: "feat", tracking: "fork" },
    [`/w/${s}/gl`]: { remotes: { origin: `https://gitlab.com/own-${s}/web.git` }, branch: "main", tracking: "origin" },
  });
  const pane = terminal("t1", `/w/${s}/a`);
  herdrStub.spaces = [space(`s-${s}`, [["t1", true]], true, machine)];
  herdrStub.panes = [pane];
  const { render } = await mount();
  assert.match(await shown(render), new RegExp(up));
  // Walk the other detection paths too: tracking remote, no GitHub remote, not a repo.
  for (const folder of ["t", "gl", "plain"]) {
    pane.cwd = `/w/${s}/${folder}`;
    await shown(render);
  }

  const git = calls.filter((c) => c.command === "git");
  assert.ok(git.length > 0, "the repo was resolved with git");
  assert.deepEqual([...new Set(calls.map((c) => c.command))].filter((c) => c !== "git" && c !== "gh"), []);
  const readOnly = ([verb, ...rest]) =>
    (verb === "remote" && (rest.length === 0 || (rest[0] === "get-url" && rest.length === 2))) ||
    verb === "symbolic-ref" ||
    (verb === "config" && rest[0] === "--get");
  for (const c of git) {
    assert.ok(readOnly(c.args), `not a read-only git call: git ${c.args.join(" ")}`);
    assert.equal(c.options.on, machine, `git ${c.args.join(" ")} must run on the space's machine`);
    assert.match(c.options.cwd, new RegExp(`^/w/${s}/`), `git ${c.args.join(" ")} must run in the pane's folder`);
  }
});
