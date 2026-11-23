// Story #11: clicking a board row opens the issue's detail in place of the list (epic #10 prototype a28afdf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text, walk, cx, opened } from "../support/harness.js";
import { issue, subIssue, pullRequest, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);

const vars = (args) => Object.fromEntries(args.filter((a) => /^\w+=/.test(a) && !a.startsWith("query=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const query = (args) => (args.find((a) => a.startsWith("query=")) ?? "").slice("query=".length);
const asks = (q, field) => new RegExp(`\\b${field}\\b`).test(q);

// Like GitHub, the stub answers only what the query asks for: an item's `url` only when the items
// query names it, and only the issue fields the issue query names.
function itemsAnswer(q, nodes) {
  const page = structuredClone(itemsPage(nodes));
  if (!asks(q, "url")) for (const n of page.data.node.items.nodes) delete n.content.url;
  return page;
}
const issueAnswer = (q, node) => ({ data: { node: Object.fromEntries(Object.entries(node).filter(([k]) => k === "id" || asks(q, k))) } });

// The issue query's answer for one issue, in the prototype's shape (a28afdf, mod/src/load.js ISSUE).
const detail = ({ id, number, title, url, body = "", issueType = null, projectId, status = null }) => ({
  id,
  number,
  title,
  url,
  state: "OPEN",
  stateReason: null,
  body,
  issueType: issueType && { name: issueType },
  projectItems: { nodes: status ? [{ project: { id: projectId }, status }] : [] },
  subIssues: { nodes: [] },
  comments: { nodes: [] },
  timelineItems: { nodes: [] },
});

// A folder whose origin is github.com/<repo>, linked to one board whose items are `nodes`;
// `issues` answers the issue query by id.
function world(s, nodes, issues = []) {
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
      if (nodeId === project.id) return ok(JSON.stringify(itemsAnswer(q, nodes)));
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
  return { repo, project };
}

async function open() {
  const { render } = await mount();
  await tick();
  await settle();
  return render;
}

const nodes = (tree, match) => {
  const found = [];
  walk(tree, (n) => { if (match(n)) found.push(n); });
  return found;
};
const clickables = (tree) => nodes(tree, (n) => n.handlers.on_click);
const label = (n) => String(n.props.accessibility_label ?? text(n).trim());

// Clicks the row titled `title`: the innermost clickable element holding that title.
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

// The chevron of the row titled `title` (its nearest ancestor with text is that row's line).
async function expand(render, title) {
  const path = [];
  let hit = null;
  const visit = (n, above) => {
    if (hit || n == null || typeof n !== "object") return;
    if (/^Expand sub-issues$/.test(n.props.accessibility_label ?? "")) {
      const line = [...above].reverse().find((a) => text(a).trim());
      if (line && text(line).includes(title)) hit = n;
    }
    for (const k of n.kids ?? []) visit(k, [...above, n]);
  };
  visit(render(), path);
  assert.ok(hit, `no sub-issues chevron on the row "${title}"`);
  await hit.handlers.on_click({}, cx);
  await settle();
}

test("T-1: should open the clicked row's detail and return to the list with Back", async () => {
  const s = id();
  const plan = `Plan ${s}`;
  const child = `Child ${s}`;
  const other = `Other ${s}`;
  const project = `PVT_${s}`;
  const { repo } = world(
    s,
    [
      issue({
        id: `I_1${s}`, number: 1, title: plan, status: { name: "In Progress", color: "YELLOW" },
        summary: { total: 1, completed: 0, percentCompleted: 0 },
        subIssues: [subIssue({ id: `I_2${s}`, number: 2, title: child })],
      }),
      issue({ id: `I_3${s}`, number: 3, title: other }),
    ],
    [
      // The titles don't hold the issue types, so a shown type can only be the type tag.
      detail({ id: `I_1${s}`, number: 1, title: plan, url: `https://github.com/own-${s}/web-${s}/issues/1`, body: `Body of plan ${s}`, issueType: "Epic", projectId: project, status: { name: "In Progress", color: "YELLOW" } }),
      detail({ id: `I_2${s}`, number: 2, title: child, url: `https://github.com/own-${s}/web-${s}/issues/2`, body: `Body of child ${s}`, issueType: "Task", projectId: project }),
    ],
  );
  const render = await open();
  assert.match(text(render()), new RegExp(other));

  // A top-level row: the list makes way for its detail.
  await clickRow(render, plan);
  let screen = text(render());
  assert.doesNotMatch(screen, new RegExp(other), "the list still shows under the detail");
  assert.match(screen, new RegExp(`Body of plan ${s}`));
  // Its header (AC-2): type tag, #number, Status, title, and Open on GitHub in the system browser.
  for (const part of ["Epic", "#1", "In Progress", plan]) assert.ok(screen.includes(part), `the header lacks "${part}": ${screen}`);
  await press(render, "Open on GitHub");
  assert.equal(opened.at(-1), `https://github.com/${repo}/issues/1`);

  // Back returns to the list.
  await press(render, /^Back/);
  screen = text(render());
  assert.match(screen, new RegExp(plan));
  assert.match(screen, new RegExp(other));
  assert.doesNotMatch(screen, new RegExp(`Body of plan ${s}`));

  // A sub-issue row opens its own detail; Back returns to the list as it was left.
  await expand(render, plan);
  await clickRow(render, child);
  screen = text(render());
  assert.doesNotMatch(screen, new RegExp(other), "the list still shows under the sub-issue's detail");
  assert.match(screen, new RegExp(`Body of child ${s}`));
  assert.ok(screen.includes("Task"), `the header lacks the type "Task": ${screen}`);
  await press(render, /^Back/);
  screen = text(render());
  assert.match(screen, new RegExp(other));
  assert.match(screen, new RegExp(child), "the expanded parent closed after Back");
});

test("T-3: should render a stubbed markdown body with a heading and a list", async () => {
  const s = id();
  const title = `Spec ${s}`;
  const body = `## Heading ${s}\n\nIntro ${s}.\n\n- first ${s}\n- second ${s}\n`;
  world(s, [issue({ id: `I_7${s}`, number: 7, title })], [detail({ id: `I_7${s}`, number: 7, title, url: `https://github.com/own-${s}/web-${s}/issues/7`, body })]);
  const render = await open();
  await clickRow(render, title);

  // The body goes to Herdr's markdown view as markdown, heading and list intact.
  const views = nodes(render(), (n) => n.kind === "markdown" && text(n).includes(`Heading ${s}`));
  assert.equal(views.length, 1, `no markdown view holding the body in: ${text(render())}`);
  const source = text(views[0]);
  assert.match(source, new RegExp(`^## Heading ${s}$`, "m"));
  assert.match(source, new RegExp(`^- first ${s}\\n- second ${s}$`, "m"));
});

test("T-4: should show only Open on GitHub for a stubbed pull request row", async () => {
  const s = id();
  const title = `Fix sort ${s}`;
  const other = `Other ${s}`;
  const url = `https://github.com/own-${s}/web-${s}/pull/29`;
  world(s, [pullRequest({ id: `PR_29${s}`, number: 29, title, url }), issue({ id: `I_3${s}`, number: 3, title: other })]);
  const render = await open();
  await clickRow(render, title);

  assert.doesNotMatch(text(render()), new RegExp(other), "the list still shows under the pull request");
  // Besides Back, every control is Open on GitHub, and each opens the pull request.
  const actions = clickables(render()).filter((n) => !/^Back/.test(label(n)));
  assert.ok(actions.length, `no Open on GitHub in: ${text(render())}`);
  assert.deepEqual([...new Set(actions.map(label))], ["Open on GitHub"]);
  for (const action of actions) {
    opened.length = 0;
    await action.handlers.on_click({}, cx);
    assert.deepEqual(opened, [url]);
  }
});
