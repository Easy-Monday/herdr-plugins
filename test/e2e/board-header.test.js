// Story #3, developer tests beyond the Test spec: the header names the one linked board (AC-1),
// a failing gh call says so instead of blaming the folder, the new repo shows while gh reads,
// and an open board past a page of closed ones is still found.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setImmediate as nextTurn } from "node:timers/promises";
import { herdrStub, mount, settle, tick, text, timers, cx } from "../support/harness.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
// Story #5 also reads the board's items; those calls get an empty page.
const isBoardsQuery = (args) => args.some((a) => a.startsWith("query=") && a.includes("projectsV2"));
const noItems = ok(JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } }));

function world(folder, repo, ghAnswer) {
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") return isBoardsQuery(args) ? ghAnswer : noItems;
    if (command !== "git" || options.cwd !== folder) return { code: 128, stdout: "", stderr: "fatal" };
    if (args[0] === "remote" && args.length === 1) return ok("origin\n");
    if (args[0] === "remote") return ok(`https://github.com/${repo}.git\n`);
    return ok("origin\n");
  };
  herdrStub.spaces = [{ id: "s1", folder: "/home/test", machine: null, active: true, tabs: [{ id: "t1", active: true }] }];
  herdrStub.panes = [{ pane: "p1", terminal: "term1", tab: "t1", cwd: folder, focused: true }];
}

async function shown() {
  const { render } = await mount();
  await tick();
  await settle();
  return text(render());
}

test("should show the one open linked board's name in the header with owner/repo", async () => {
  const s = randomUUID().slice(0, 8);
  const repo = `own-${s}/web-${s}`;
  const nodes = [{ id: `PVT_${s}`, number: 1, title: `Roadmap ${s}`, closed: false }];
  world(`/w/${s}`, repo, ok(JSON.stringify({ data: { repository: { projectsV2: { nodes } } } })));
  const screen = await shown();
  assert.match(screen, new RegExp(`Roadmap ${s} ${repo}`));
  assert.doesNotMatch(screen, /No project board|Only one linked board/);
});

test("should say the boards couldn't be read, with gh's message, when gh fails", async () => {
  const s = randomUUID().slice(0, 8);
  world(`/w/${s}`, `own-${s}/web-${s}`, { code: 1, stdout: "", stderr: `boom ${s}` });
  const screen = await shown();
  assert.match(screen, new RegExp(`Couldn't read the repo's boards boom ${s}`));
});

const boards = (nodes, pageInfo) => ok(JSON.stringify({ data: { repository: { projectsV2: { nodes, pageInfo } } } }));

test("should show the new owner/repo, not the previous board's name, while gh is still reading", async () => {
  const s = randomUUID().slice(0, 8);
  world(`/a/${s}`, `own-${s}/a-${s}`, boards([{ id: "A", number: 1, title: `Board A ${s}`, closed: false }]));
  const { render } = await mount();
  await tick();
  await settle();
  assert.match(text(render()), new RegExp(`Board A ${s} own-${s}/a-${s}`));

  let answer;
  world(`/b/${s}`, `own-${s}/b-${s}`, new Promise((resolve) => { answer = resolve; }));
  for (const { fn } of [...timers]) fn(cx); // the focus poll; its task now waits on gh
  try {
    for (let i = 0; i < 10; i++) await nextTurn(); // let git answer
    const pending = text(render());
    assert.match(pending, new RegExp(`Project Board own-${s}/b-${s}`));
    assert.doesNotMatch(pending, new RegExp(`Board A ${s}|own-${s}/a-${s}`));
  } finally {
    // Always answer, or the waiting task would hang the next test's settle().
    answer(boards([{ id: "B", number: 1, title: `Board B ${s}`, closed: false }]));
    await settle();
  }
  assert.match(text(render()), new RegExp(`Board B ${s} own-${s}/b-${s}`));
});

test("should find the open board when closed boards fill the first page", async () => {
  const s = randomUUID().slice(0, 8);
  const repo = `own-${s}/web-${s}`;
  world(`/w/${s}`, repo, null);
  const gitOnly = herdrStub.exec;
  const asked = [];
  herdrStub.exec = (command, args, options) => {
    if (command !== "gh") return gitOnly(command, args, options);
    if (!isBoardsQuery(args)) return noItems;
    asked.push(args);
    if (!args.includes(`after=cur-${s}`))
      return boards([{ id: "C", number: 1, title: `Old ${s}`, closed: true }], { hasNextPage: true, endCursor: `cur-${s}` });
    return boards([{ id: "O", number: 2, title: `Live ${s}`, closed: false }], { hasNextPage: false, endCursor: null });
  };
  const screen = await shown();
  assert.match(screen, new RegExp(`Live ${s} ${repo}`));
  assert.equal(asked.length, 2, "one gh call per page");
});
