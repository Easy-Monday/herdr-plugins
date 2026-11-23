// Story #11, developer tests beyond the Test spec: a draft issue row (AC-4's other half) and an
// issue query that fails (the prototype's "Issue API error" state, a28afdf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text, walk, cx, opened } from "../support/harness.js";
import { issue, draftIssue, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);

// A folder whose origin is github.com/<repo>, linked to one board holding `nodes`;
// `answerIssue(nodeId)` answers the issue query.
function world(s, nodes, answerIssue = () => fail(1, "no issue")) {
  const folder = `/w/${s}`;
  const project = { id: `PVT_${s}`, number: 11, title: `Board ${s}`, url: `https://github.com/orgs/own-${s}/projects/11`, closed: false };
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      const asked = args.join(" ");
      if (/projectsV2/.test(asked))
        return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } } } } }));
      if (args.includes(`id=${project.id}`)) return ok(JSON.stringify(itemsPage(nodes)));
      const nodeId = args.find((a) => a.startsWith("id="))?.slice(3);
      return answerIssue(nodeId);
    }
    if (command !== "git" || options.cwd !== folder) return fail(128, "fatal: not a git repository");
    const [verb, ...rest] = args;
    if (verb === "remote" && rest.length === 0) return ok("origin\n");
    if (verb === "remote" && rest[0] === "get-url") return ok(`git@github.com:own-${s}/web-${s}.git\n`);
    if (verb === "symbolic-ref") return ok("main\n");
    if (verb === "config") return ok("origin\n");
    return fail(1, `unexpected git ${args.join(" ")}`);
  };
  herdrStub.spaces = [{ id: `s-${id()}`, folder: "/home/test", machine: null, active: true, tabs: [{ id: "t1", active: true }] }];
  herdrStub.panes = [{ pane: `p-${id()}`, terminal: `term-${id()}`, tab: "t1", cwd: folder, focused: true }];
  return project;
}

async function open() {
  const { render } = await mount();
  await tick();
  await settle();
  return render;
}

const clickables = (tree) => {
  const found = [];
  walk(tree, (n) => { if (n.handlers.on_click) found.push(n); });
  return found;
};
const label = (n) => String(n.props.accessibility_label ?? text(n).trim());
async function click(render, match) {
  const hit = clickables(render()).filter(match).at(-1);
  assert.ok(hit, `nothing to click in: ${text(render())}`);
  await hit.handlers.on_click({}, cx);
  await settle();
}

test("a draft issue row offers only Open on GitHub, opening its board item", async () => {
  const s = id();
  const title = `Idea ${s}`;
  const project = world(s, [{ ...draftIssue({ id: `DI_${s}`, title }), databaseId: 77 }, issue({ id: `I_3${s}`, number: 3, title: `Other ${s}` })]);
  const render = await open();
  await click(render, (n) => text(n).includes(title));

  assert.doesNotMatch(text(render()), new RegExp(`Other ${s}`), "the list still shows under the draft");
  const actions = clickables(render()).filter((n) => !/^Back/.test(label(n)));
  assert.deepEqual([...new Set(actions.map(label))], ["Open on GitHub"]);
  for (const action of actions) {
    opened.length = 0;
    await action.handlers.on_click({}, cx);
    assert.deepEqual(opened, [`${project.url}?pane=issue&itemId=77`]);
  }
});

test("an issue that fails to load says so, and Try again loads it", async () => {
  const s = id();
  const title = `Plan ${s}`;
  let up = false;
  world(s, [issue({ id: `I_5${s}`, number: 5, title })], (nodeId) =>
    up
      ? ok(JSON.stringify({ data: { node: { id: nodeId, number: 5, title, url: "u", body: `Body ${s}`, issueType: null, projectItems: { nodes: [{ project: { id: `PVT_${s}` }, status: null }] } } } }))
      : fail(1, `HTTP 502 ${s}`),
  );
  const render = await open();
  await click(render, (n) => text(n).includes(title));
  assert.match(text(render()), new RegExp(`#5 didn't load.*HTTP 502 ${s}`, "s"));

  up = true;
  await click(render, (n) => label(n) === "Try again");
  assert.match(text(render()), new RegExp(`Body ${s}`));
});
