// Story #12, developer test beyond the spec (review of PR #45): a sub-issue opened from a detail
// takes its board from that detail, so a failed board refresh under the open detail does not
// cost the sub-issue its Status.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, advance, text, walk, cx } from "../support/harness.js";
import { issue, subIssue, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const vars = (args) => Object.fromEntries(args.filter((a) => /^\w+=/.test(a) && !a.startsWith("query=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const query = (args) => (args.find((a) => a.startsWith("query=")) ?? "").slice("query=".length);

const onBoard = (projectId, name) => ({ nodes: [{ project: { id: projectId }, status: { name, color: "BLUE" } }] });
const detail = ({ id, number, title, body, projectItems, subIssues = [] }) => ({
  data: {
    node: {
      id, number, title, url: `https://github.com/acme/web/issues/${number}`, state: "OPEN", stateReason: null, body, issueType: null, projectItems,
      subIssues: { nodes: subIssues.map((s) => ({ id: s.id, number: s.number, title: s.title, url: `https://github.com/acme/web/issues/${s.number}`, state: "OPEN", stateReason: null, projectItems: s.projectItems })) },
      comments: { nodes: [] },
      timelineItems: { nodes: [] },
    },
  },
});

async function clickRow(render, title) {
  const rows = [];
  walk(render(), (n) => { if (n.handlers.on_click && text(n).includes(title)) rows.push(n); });
  assert.ok(rows.length, `no clickable row "${title}" in: ${text(render())}`);
  await rows.at(-1).handlers.on_click({}, cx);
  await settle();
}

test("should show a sub-issue's Status when it is opened from a detail after a failed board refresh", async () => {
  const s = randomUUID().slice(0, 8);
  const folder = `/w/${s}`;
  const repo = `own-${s}/web-${s}`;
  const projectId = `PVT_${s}`;
  const project = { id: projectId, number: 11, title: `Board ${s}`, url: `https://github.com/orgs/own-${s}/projects/11`, closed: false };
  const epic = `Epic ${s}`;
  const story = `Story ${s}`;
  const answers = new Map([
    [`I_10${s}`, detail({ id: `I_10${s}`, number: 10, title: epic, body: `Body of epic ${s}`, projectItems: onBoard(projectId, `Building ${s}`), subIssues: [{ id: `I_11${s}`, number: 11, title: story, projectItems: onBoard(projectId, `Testing ${s}`) }] })],
    [`I_11${s}`, detail({ id: `I_11${s}`, number: 11, title: story, body: `Body of story ${s}`, projectItems: onBoard(projectId, `Testing ${s}`) })],
  ]);
  let boardsDown = false;
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      const q = query(args);
      if (/projectsV2/.test(q)) return boardsDown ? fail(1, "HTTP 502: Bad Gateway") : ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } } } } }));
      const { id } = vars(args);
      if (id === projectId) return ok(JSON.stringify(itemsPage([issue({ id: `I_10${s}`, number: 10, title: epic, summary: { total: 1, completed: 0, percentCompleted: 0 }, subIssues: [subIssue({ id: `I_11${s}`, number: 11, title: story })] })])));
      if (answers.has(id)) return ok(JSON.stringify(answers.get(id)));
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
  herdrStub.spaces = [{ id: `s-${s}`, folder: "/home/test", machine: null, active: true, tabs: [{ id: "t1", active: true }] }];
  herdrStub.panes = [{ pane: `p-${s}`, terminal: `term-${s}`, tab: "t1", cwd: folder, focused: true }];
  const { render } = await mount();
  await tick();
  await settle();

  await clickRow(render, epic);
  assert.match(text(render()), new RegExp(`Building ${s}`));

  // The interval refresh fails: the epic's detail stays open over a screen with no board.
  boardsDown = true;
  await advance(60_000);
  await settle();
  assert.match(text(render()), new RegExp(`Body of epic ${s}`), "the failed refresh closed the detail");

  await clickRow(render, story);
  const screen = text(render());
  assert.match(screen, new RegExp(`Body of story ${s}`));
  assert.match(screen, new RegExp(`Testing ${s}`), `the sub-issue lost its Status: ${screen}`);
});
