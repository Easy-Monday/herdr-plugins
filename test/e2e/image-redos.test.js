// Bug #52 (release scan F1): a 65,536-character comment of `![` froze the panel on every redraw of the
// issue's detail (mod/main.js renders bodies through `imageLinks`). The detail must keep redrawing fast
// and still show the comment. Today each redraw takes about 0.9 s on the dev machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text, walk, cx } from "../support/harness.js";
import { issue, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);

const vars = (args) => Object.fromEntries(args.filter((a) => /^\w+=/.test(a) && !a.startsWith("query=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const query = (args) => (args.find((a) => a.startsWith("query=")) ?? "").slice("query=".length);

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
      if (byId.has(nodeId)) return ok(JSON.stringify({ data: { node: byId.get(nodeId) } }));
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
}

const nodes = (tree, match) => {
  const found = [];
  walk(tree, (n) => { if (match(n)) found.push(n); });
  return found;
};

async function clickRow(render, title) {
  const rows = nodes(render(), (n) => n.handlers.on_click && text(n).includes(title));
  assert.ok(rows.length, `no clickable row "${title}" in: ${text(render())}`);
  await rows.at(-1).handlers.on_click({}, cx);
  await settle();
}

const REDRAWS = 5;
const BOUND_MS = 250;

test(`#52 T-2: should redraw an issue detail holding a 65,536-character adversarial comment ${REDRAWS} times in under ${BOUND_MS} ms`, async () => {
  const s = id();
  const title = `Flooded ${s}`;
  const marker = `Flood ${s}`;
  const head = `${marker}\n\n`;
  const flood = head + "![".repeat((65_536 - head.length) / 2);
  world(s, [issue({ id: `I_1${s}`, number: 1, title })], [
    {
      id: `I_1${s}`, number: 1, title, url: `https://github.com/own-${s}/web-${s}/issues/1`, state: "OPEN", stateReason: null,
      body: `Body ${s}`, issueType: null, projectItems: { nodes: [] }, subIssues: { nodes: [] },
      comments: { nodes: [{ id: `IC_1${s}`, author: { login: `anyone-${s}` }, createdAt: new Date().toISOString(), body: flood }] },
      timelineItems: { nodes: [] },
    },
  ]);
  const { render } = await mount();
  await tick();
  await settle();
  await clickRow(render, title);

  const start = performance.now();
  let tree;
  for (let i = 0; i < REDRAWS; i++) tree = render();
  const ms = performance.now() - start;

  assert.ok(text(tree).includes(marker), `the comment is not shown: ${text(tree).slice(0, 500)}`);
  assert.ok(ms < BOUND_MS, `${REDRAWS} redraws took ${ms.toFixed(0)} ms (bound ${BOUND_MS} ms)`);
});
