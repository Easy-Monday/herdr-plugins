// Story #3: the panel finds the project board linked to the repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text } from "../support/harness.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);

// One folder at `folder` whose origin is github.com/<repo>; gh answers the repo's linked
// projects with `projects` (a `repository.projectsV2` GraphQL response). Every call is recorded.
function world(folder, repo, projects) {
  const calls = [];
  herdrStub.exec = (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (command === "gh") {
      const [owner, name] = repo.split("/");
      const asked = args.join(" ");
      if (args[0] === "api" && args[1] === "graphql" && /projectsV2/.test(asked) && asked.includes(owner) && asked.includes(name))
        return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: projects } } } }));
      return fail(1, `unexpected gh ${asked}`);
    }
    if (command !== "git" || options.cwd !== folder) return fail(128, "fatal: not a git repository");
    const [verb, ...rest] = args;
    if (verb === "remote" && rest.length === 0) return ok("origin\n");
    if (verb === "remote" && rest[0] === "get-url" && rest[1] === "origin") return ok(`git@github.com:${repo}.git\n`);
    if (verb === "symbolic-ref") return ok("main\n");
    if (verb === "config") return ok("origin\n");
    return fail(1, `unexpected git ${args.join(" ")}`);
  };
  herdrStub.spaces = [{ id: `s-${id()}`, folder: "/home/test", machine: null, active: true, tabs: [{ id: "t1", active: true }] }];
  herdrStub.panes = [{ pane: `p-${id()}`, terminal: `term-${id()}`, tab: "t1", cwd: folder, focused: true }];
  return calls;
}

async function shown() {
  const { render } = await mount();
  await tick();
  await settle();
  return text(render());
}

// BRD §5.1: the panel reads GitHub with GraphQL queries only.
function assertQueriesOnly(calls) {
  const gh = calls.filter((c) => c.command === "gh");
  assert.ok(gh.length > 0, "the linked boards were read with gh");
  for (const c of gh) {
    assert.deepEqual(c.args.slice(0, 2), ["api", "graphql"], `not a GraphQL call: gh ${c.args.join(" ")}`);
    assert.doesNotMatch(c.args.join(" "), /\bmutation\b/, `not a query: gh ${c.args.join(" ")}`);
  }
}

test("T-2: should show the no-board message with the repo name when gh returns no open projects", async () => {
  const s = id();
  const repo = `own-${s}/web-${s}`;
  // No linked board at all, and only a closed one.
  for (const projects of [[], [{ id: `PVT_${s}`, number: 1, title: `Closed ${s}`, closed: true }]]) {
    const calls = world(`/w/${s}/web`, repo, projects);
    const screen = await shown();
    assert.ok(screen.includes(`No project board is linked to ${repo}.`), `no-board message missing in: ${screen}`);
    assert.doesNotMatch(screen, new RegExp(`Closed ${s}`));
    assertQueriesOnly(calls);
  }
});

test("T-3: should show the only-one-board message listing both names when gh returns two open projects", async () => {
  const s = id();
  const repo = `own-${s}/web-${s}`;
  const a = { id: `PVT_a${s}`, number: 1, title: `Roadmap ${s}`, closed: false };
  const b = { id: `PVT_b${s}`, number: 2, title: `Bugs ${s}`, closed: false };
  const closed = { id: `PVT_c${s}`, number: 3, title: `Archive ${s}`, closed: true };
  const calls = world(`/w/${s}/web`, repo, [a, closed, b]);
  const screen = await shown();

  assert.match(screen, /Only one linked board is supported/);
  assert.match(screen, new RegExp(a.title));
  assert.match(screen, new RegExp(b.title));
  assert.doesNotMatch(screen, new RegExp(closed.title));
  // No board is shown: neither board's items are read.
  for (const c of calls.filter((c) => c.command === "gh"))
    assert.ok(![a.id, b.id].some((pid) => c.args.join(" ").includes(pid)), `a board was loaded: gh ${c.args.join(" ")}`);
  assertQueriesOnly(calls);
});
