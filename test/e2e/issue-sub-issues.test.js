// Story #12: an issue's detail lists its sub-issues; clicking one opens its detail
// (epic #10 prototype a28afdf: `subRow`, and `back` walking up the trail "Back to #N", then the board).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text, walk, cx } from "../support/harness.js";
import { issue, subIssue, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);

const vars = (args) => Object.fromEntries(args.filter((a) => /^\w+=/.test(a) && !a.startsWith("query=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const query = (args) => (args.find((a) => a.startsWith("query=")) ?? "").slice("query=".length);

// Like GitHub, the stub answers only the issue fields the issue query names (`subIssues` among them).
const issueAnswer = (q, node) => ({ data: { node: Object.fromEntries(Object.entries(node).filter(([k]) => k === "id" || new RegExp(`\\b${k}\\b`).test(q))) } });

// The issue query's answer for one issue, in the prototype's shape (a28afdf, mod/src/load.js ISSUE).
const detail = ({ id, number, title, body, projectId, subIssues = [] }) => ({
  id,
  number,
  title,
  url: `https://github.com/acme/web/issues/${number}`,
  state: "OPEN",
  stateReason: null,
  body,
  issueType: null,
  projectItems: { nodes: [] },
  subIssues: {
    nodes: subIssues.map((s) => ({
      id: s.id,
      number: s.number,
      title: s.title,
      url: `https://github.com/acme/web/issues/${s.number}`,
      state: "OPEN",
      stateReason: null,
      projectItems: { nodes: [{ project: { id: projectId }, status: { name: "In Review", color: "BLUE" } }] },
    })),
  },
  comments: { nodes: [] },
  timelineItems: { nodes: [] },
});

// A folder whose origin is github.com/<repo>, linked to one board whose items are `nodes`;
// `issues` answers the issue query by id.
function world(s, nodes, issues) {
  const folder = `/w/${s}`;
  const repo = `own-${s}/web-${s}`;
  const project = { id: `PVT_${s}`, number: 11, title: `Board ${s}`, url: `https://github.com/orgs/own-${s}/projects/11`, closed: false };
  const byId = new Map(issues.map((i) => [i.id, i]));
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      if (args[0] !== "api" || args[1] !== "graphql") return fail(1, `unexpected gh ${args.join(" ")}`);
      const q = query(args);
      if (/projectsV2/.test(q)) return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } } } } }));
      const { id: nodeId } = vars(args);
      if (nodeId === project.id) return ok(JSON.stringify(itemsPage(nodes)));
      if (byId.has(nodeId)) return ok(JSON.stringify(issueAnswer(q, byId.get(nodeId))));
      return fail(1, `unexpected gh ${args.join(" ")}`);
    }
    if (command !== "git" || options.cwd !== folder) return fail(128, "fatal: not a git repository");
    const [verb, ...rest] = args;
    if (verb === "remote" && rest.length === 0) return ok("origin\n");
    if (verb === "remote" && rest[0] === "get-url") return ok(`git@github.com:${repo}.git\n`);
    if (verb === "symbolic-ref") return ok("main\n");
    if (verb === "config") return ok("origin\n");
    return fail(1, `unexpected git ${args.join(" ")}`);
  };
  herdrStub.spaces = [{ id: `s-${id()}`, folder: "/home/test", machine: null, active: true, tabs: [{ id: "t1", active: true }] }];
  herdrStub.panes = [{ pane: `p-${id()}`, terminal: `term-${id()}`, tab: "t1", cwd: folder, focused: true }];
  return { project };
}

const clickables = (tree) => {
  const found = [];
  walk(tree, (n) => { if (n.handlers.on_click) found.push(n); });
  return found;
};
const label = (n) => String(n.props.accessibility_label ?? text(n).trim());

// Clicks the innermost clickable element holding `title`.
async function clickRow(render, title) {
  const rows = clickables(render()).filter((n) => text(n).includes(title));
  assert.ok(rows.length, `no clickable row "${title}" in: ${text(render())}`);
  await rows.at(-1).handlers.on_click({}, cx);
  await settle();
}

// Clicks the control whose label or text matches `name` (a string is matched exactly).
async function press(render, name) {
  const match = typeof name === "string" ? (l) => l === name : (l) => name.test(l);
  const found = clickables(render()).filter((n) => match(label(n)));
  assert.ok(found.length, `no "${name}" control in: ${text(render())}`);
  await found.at(-1).handlers.on_click({}, cx);
  await settle();
}

test("T-2: should open the sub-issue's detail on click", async () => {
  const s = id();
  const epic = `Epic ${s}`;
  const story = `Story ${s}`;
  const other = `Other ${s}`;
  const projectId = `PVT_${s}`;
  world(
    s,
    // The story is not a row of its own on the list, so a row for it can only be in the epic's detail.
    [issue({ id: `I_10${s}`, number: 10, title: epic, summary: { total: 1, completed: 0, percentCompleted: 0 }, subIssues: [subIssue({ id: `I_11${s}`, number: 11, title: story })] }), issue({ id: `I_3${s}`, number: 3, title: other })],
    [
      detail({ id: `I_10${s}`, number: 10, title: epic, body: `Body of epic ${s}`, projectId, subIssues: [{ id: `I_11${s}`, number: 11, title: story }] }),
      detail({ id: `I_11${s}`, number: 11, title: story, body: `Body of story ${s}`, projectId }),
    ],
  );
  const { render } = await mount();
  await tick();
  await settle();

  await clickRow(render, epic);
  assert.match(text(render()), new RegExp(`Body of epic ${s}`));

  // A click on the sub-issue in the epic's detail opens the sub-issue's detail.
  await clickRow(render, story);
  let screen = text(render());
  assert.match(screen, new RegExp(`Body of story ${s}`));
  assert.doesNotMatch(screen, new RegExp(`Body of epic ${s}`), "the epic's detail still shows under the sub-issue's");

  // Back walks up the trail (design): first to the epic, then to the list.
  await press(render, "Back to #10");
  screen = text(render());
  assert.match(screen, new RegExp(`Body of epic ${s}`));
  assert.doesNotMatch(screen, new RegExp(`Body of story ${s}`));
  await press(render, /^Back/);
  screen = text(render());
  assert.match(screen, new RegExp(other));
  assert.doesNotMatch(screen, new RegExp(`Body of epic ${s}`));
});
