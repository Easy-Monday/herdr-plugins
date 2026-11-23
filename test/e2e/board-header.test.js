// Story #3, developer tests beyond the Test spec: the header names the one linked board (AC-1),
// and a failing gh call says so instead of blaming the folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text } from "../support/harness.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });

function world(folder, repo, ghAnswer) {
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") return ghAnswer;
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
