// Story #14: agent handoff comments get an accent left bar and a Handoff label in the Activity
// (epic #10 prototype a28afdf: mods/project-board/main.js `comment`, mods/project-board/ui.js `HandoffTag`; BRD §4.7 prefixes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text, walk, byId, cx } from "../support/harness.js";
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
  const byNode = new Map(issues.map((i) => [i.id, i]));
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      if (args[0] !== "api" || args[1] !== "graphql") return fail(1, `unexpected gh ${args.join(" ")}`);
      if (/projectsV2/.test(query(args))) return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } } } } }));
      const { id: nodeId } = vars(args);
      if (nodeId === project.id) return ok(JSON.stringify(itemsPage(nodes)));
      if (byNode.has(nodeId)) return ok(JSON.stringify({ data: { node: byNode.get(nodeId) } }));
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

// Clicks the row titled `title`: the innermost clickable element holding that title.
async function clickRow(render, title) {
  const rows = nodes(render(), (n) => n.handlers.on_click && text(n).includes(title));
  assert.ok(rows.length, `no clickable row "${title}" in: ${text(render())}`);
  await rows.at(-1).handlers.on_click({}, cx);
  await settle();
}

const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

// What the owner sees of one comment: a "Handoff" label (an element whose only text is
// "Handoff"), and an accent bar (a left border in the theme's accent colour).
const label = (el) => nodes(el, (n) => n.kids.length === 1 && n.kids[0] === "Handoff").length > 0;
const bar = (el) => nodes(el, (n) => n.props.border_l != null && n.props.border_color === "theme.accent").length > 0;

test("T-3: should show the Handoff label on a stubbed handoff comment only", async () => {
  const s = id();
  const title = `Detail ${s}`;
  const comment = (n, body, minutes) => ({ id: `IC_${n}${s}`, author: { login: `agent-${s}` }, createdAt: ago(minutes), body });
  // The two BRD §4.7 handoffs, a comment that quotes one below its first line, and a look-alike.
  const tests = comment(1, `Tests written at 9f3c2e1 on story/1-detail-${s}\n\n- test/e2e/detail-${s}.test.js`, 50);
  const proto = comment(2, `Prototype handoff at 5b7e0c2 on epic/1-prototype\n\n- [x] paths ${s}`, 40);
  const quote = comment(3, `Approved ${s}\n\n> Tests written at 9f3c2e1 on story/1-detail-${s}`, 30);
  const coverage = comment(4, `Prototype coverage at a28afdf on epic/1-prototype ${s}`, 20);
  const all = [tests, proto, quote, coverage];
  world(s, [issue({ id: `I_1${s}`, number: 1, title })], [
    {
      id: `I_1${s}`, number: 1, title, url: `https://github.com/own-${s}/web-${s}/issues/1`, state: "OPEN", stateReason: null,
      body: `Body ${s}`, issueType: null, projectItems: { nodes: [] }, subIssues: { nodes: [] },
      comments: { nodes: all },
      timelineItems: { nodes: [] },
    },
  ]);
  const { render } = await mount();
  await tick();
  await settle();
  await clickRow(render, title);
  const tree = render();

  // Each comment shows, so a missing label is the feature missing, not a missing comment.
  const shown = Object.fromEntries(all.map((c) => [c.id, byId(tree, `comment-${c.id}`)]));
  all.forEach((c) => assert.ok(shown[c.id], `no comment ${c.id} in: ${text(tree)}`));

  for (const c of [tests, proto]) {
    assert.ok(label(shown[c.id]), `the handoff "${c.body.split("\n")[0]}" has no Handoff label: ${text(shown[c.id])}`);
    assert.ok(bar(shown[c.id]), `the handoff "${c.body.split("\n")[0]}" has no accent left bar`);
  }
  for (const c of [quote, coverage]) {
    assert.ok(!label(shown[c.id]), `"${c.body.split("\n")[0]}" is not a handoff but has a Handoff label`);
    assert.ok(!bar(shown[c.id]), `"${c.body.split("\n")[0]}" is not a handoff but has an accent bar`);
  }
  // One label per handoff in the whole detail, none elsewhere.
  assert.equal(nodes(tree, (n) => n.kids.length === 1 && n.kids[0] === "Handoff").length, 2, text(tree));
});
