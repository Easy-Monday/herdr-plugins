// Story #8, developer tests beyond the Test spec: the refreshSeconds block prop reaches the timer,
// and Try again reloads in place (the notice stays, the header refresh icon spins), as the prototype does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setImmediate as nextTurn } from "node:timers/promises";
import { herdrStub, mount, settle, tick, advance, text, walk, cx } from "../support/harness.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const boards = (title) => ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [{ id: "P", number: 1, title, closed: false }] } } } }));

function world(folder, repo, gh) {
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") return gh(args);
    if (options.cwd !== folder) return { code: 128, stdout: "", stderr: "fatal: not a git repository" };
    if (args[0] === "remote" && args.length === 1) return ok("origin\n");
    if (args[0] === "remote") return ok(`git@github.com:${repo}.git\n`);
    if (args[0] === "symbolic-ref") return ok("main\n");
    return ok("origin\n");
  };
  herdrStub.spaces = [{ id: "s1", folder: "/home/test", machine: null, active: true, tabs: [{ id: "t1", active: true }] }];
  herdrStub.panes = [{ pane: "p1", terminal: "term1", tab: "t1", cwd: folder, focused: true }];
}

function find(tree, pred) {
  let found = null;
  walk(tree, (n) => { if (!found && pred(n)) found = n; });
  return found;
}

test("should reload at the refreshSeconds block prop's interval from props(), not init's argument", async () => {
  const s = randomUUID().slice(0, 8);
  let title = `Ready ${s}`;
  world(`/w/${s}`, `own-${s}/web-${s}`, () => boards(title));
  // Herdr documents the block's props as props(); init's first argument gets 60 here, so reading it fails.
  Object.defineProperty(herdrStub, "props", { configurable: true, get: () => ({ refreshSeconds: 120 }), set() {} });
  try {
    const { render } = await mount({ refreshSeconds: 60 });
    await tick();
    title = `Moved ${s}`;
    await advance(60_000); // 61 s
    assert.ok(text(render()).includes(`Ready ${s}`), `reloaded before 120 s: ${text(render())}`);
    await advance(59_000); // 120 s
    assert.ok(text(render()).includes(`Moved ${s}`), `no reload at 120 s: ${text(render())}`);
  } finally {
    delete herdrStub.props;
    herdrStub.props = {};
  }
});

test("should keep the error notice and spin the header refresh icon while Try again reloads", async () => {
  const s = randomUUID().slice(0, 8);
  let answer = null;
  let gh = () => ({ code: 1, stdout: "", stderr: `HTTP 502 ${s}` });
  world(`/w/${s}`, `own-${s}/web-${s}`, (args) => gh(args));
  const { render } = await mount();
  await tick();
  assert.match(text(render()), /The board didn't load/);

  gh = () => new Promise((resolve) => { answer = resolve; });
  const tryAgain = find(render(), (n) => n.handlers.on_click && text(n).trim() === "Try again");
  tryAgain.handlers.on_click({}, cx);
  try {
    for (let i = 0; i < 10 && !answer; i++) await nextTurn();
    const during = render();
    assert.match(text(during), /The board didn't load/, "the notice left the screen during Try again");
    const refresh = find(during, (n) => n.props.accessibility_label === "Refresh board");
    assert.ok(find(refresh, (n) => n.props.spin !== undefined), "the header refresh icon does not spin");
  } finally {
    gh = () => boards(`Roadmap ${s}`); // later reads (the items) answer at once
    answer?.(gh());
    await settle();
  }
  assert.match(text(render()), new RegExp(`Roadmap ${s}`));
  assert.equal(find(find(render(), (n) => n.props.accessibility_label === "Refresh board"), (n) => n.props.spin !== undefined), null);
});
