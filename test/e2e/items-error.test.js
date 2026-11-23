// Story #4, developer test beyond the Test spec: a failing items read (story #5) gets the
// same classified notice and Try again as a failing boards read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text } from "../support/harness.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });

test("should show the logged-out notice with Try again when the items read fails after the boards read", async () => {
  const s = randomUUID().slice(0, 8);
  const folder = `/w/${s}`;
  const board = ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [{ id: `PVT_${s}`, number: 1, title: `Roadmap ${s}`, closed: false }] } } } }));
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh")
      return args.some((a) => a.includes("projectsV2"))
        ? board
        : { code: 4, stdout: "", stderr: "To get started with GitHub CLI, please run:  gh auth login" };
    if (options.cwd !== folder) return { code: 128, stdout: "", stderr: "fatal" };
    if (args[0] === "remote" && args.length === 1) return ok("origin\n");
    if (args[0] === "remote") return ok(`https://github.com/own-${s}/web-${s}.git\n`);
    return ok("origin\n");
  };
  herdrStub.spaces = [{ id: `s-${s}`, folder: "/home/test", machine: null, active: true, tabs: [{ id: "t1", active: true }] }];
  herdrStub.panes = [{ pane: `p-${s}`, terminal: `t-${s}`, tab: "t1", cwd: folder, focused: true }];
  const { render } = await mount();
  await tick();
  await settle();
  const screen = text(render());
  assert.match(screen, /gh isn't logged in/);
  assert.ok(screen.includes("gh auth login -s project"), screen);
  assert.match(screen, /Try again/);
});
