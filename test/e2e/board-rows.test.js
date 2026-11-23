// Story #5: the board's top-level items as rows with state icon, title, #number, Status pill
// and sub-issue progress; items paged 100 at a time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text, walk } from "../support/harness.js";
import { issue, pullRequest, draftIssue, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);
// A loader that pages on and on gets an error instead of a hang.
const CALL_CAP = 10;

const vars = (args) => Object.fromEntries(args.filter((a) => /^\w+=/.test(a) && !a.startsWith("query=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const query = (args) => (args.find((a) => a.startsWith("query=")) ?? "").slice("query=".length);
const isBoardsQuery = (args) => /projectsV2/.test(query(args));

// A folder whose origin is github.com/<repo>. gh answers the linked-boards query with
// `boards(after)` and the items query of the board with `items(after)`, each a GraphQL response
// for the page after that cursor (undefined for the first page). Every gh call is recorded.
function world({ folder, repo, project, boards, items }) {
  const calls = { boards: [], items: [] };
  boards ??= () => ({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } } } } });
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      if (args[0] !== "api" || args[1] !== "graphql") return fail(1, `unexpected gh ${args.join(" ")}`);
      const v = vars(args);
      if (isBoardsQuery(args)) {
        calls.boards.push({ query: query(args), ...v });
        if (calls.boards.length > CALL_CAP) return fail(1, "the linked boards were paged forever");
        return ok(JSON.stringify(boards(v.after || undefined)));
      }
      if (v.id === project.id) {
        calls.items.push({ query: query(args), ...v, after: v.after || undefined });
        if (calls.items.length > CALL_CAP) return fail(1, "the board items were paged forever");
        return ok(JSON.stringify(items(v.after || undefined)));
      }
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
  return calls;
}

function setup(s, opts) {
  const project = { id: `PVT_${s}`, number: 11, title: `Board ${s}`, closed: false };
  return { project, calls: world({ folder: `/w/${s}`, repo: `own-${s}/web-${s}`, project, ...opts(project) }) };
}

async function shown() {
  const { render } = await mount();
  await tick();
  await settle();
  return render();
}

// What the panel reads out, in order: accessibility labels and text.
function reading(node, out = []) {
  if (node == null) return out;
  if (typeof node !== "object") {
    out.push(String(node));
    return out;
  }
  if (node.props?.accessibility_label) out.push(String(node.props.accessibility_label));
  for (const kid of node.kids ?? []) reading(kid, out);
  return out;
}

// Index in `seq` of each of `wanted`, in order, or a failure naming the first one missing.
function inOrder(seq, wanted, from = 0) {
  const found = [];
  let i = from;
  for (const w of wanted) {
    while (i < seq.length && seq[i] !== w) i++;
    assert.ok(i < seq.length, `"${w}" missing after ${JSON.stringify(found.map((j) => seq[j]))} in: ${JSON.stringify(seq)}`);
    found.push(i++);
  }
  return found;
}

const nodes = (tree, match) => {
  const found = [];
  walk(tree, (n) => { if (match(n)) found.push(n); });
  return found;
};

test("T-6: should show state icons, titles, numbers, pills and progress bars for a stubbed board", async () => {
  const s = id();
  const a = { id: `I_a${s}`, number: 12, title: `Epic A ${s}`, status: { name: "In Progress", color: "YELLOW" }, summary: { total: 2, completed: 1, percentCompleted: 50 } };
  const b = { id: `I_b${s}`, number: 3, title: `Story B ${s}`, state: "CLOSED", status: { name: "In Review", color: "BLUE" } };
  const c = { id: `I_c${s}`, number: 40, title: `Epic C ${s}`, summary: { total: 8, completed: 1, percentCompleted: 12 } };
  const pr = { id: `PR_${s}`, number: 29, title: `PR ${s}`, status: { name: "In Review", color: "BLUE" } };
  const draft = { id: `DI_${s}`, title: `Draft ${s}`, status: { name: "Backlog", color: "GRAY" } };
  setup(s, () => ({ items: () => itemsPage([issue(a), issue(b), issue(c), pullRequest(pr), draftIssue(draft)]) }));

  const tree = await shown();
  const seq = reading(tree);

  // Board order, each row: state icon, title, #number, then Status pill and progress.
  const [, aTitle] = inOrder(seq, ["Open", a.title, "#12", "In Progress", "50%"]);
  const [bIcon, bTitle] = inOrder(seq, ["Closed", b.title, "#3", "In Review"], aTitle);
  const [cIcon, cTitle] = inOrder(seq, ["Open", c.title, "#40", "13%"], bTitle);
  // A pull request and a draft issue are plain rows: title and Status (AC-5).
  const [prIcon, prTitle] = inOrder(seq, ["Open", pr.title, "#29", "In Review"], cTitle);
  const [draftTitle] = inOrder(seq, [draft.title, "Backlog"], prTitle);
  // B has no sub-issues, so no progress; C has no Status, so no pill; a draft has no #number.
  const none = (from, to, re, what) => assert.ok(!seq.slice(from, to).some((t) => re.test(t)), `${what}: ${JSON.stringify(seq.slice(from, to))}`);
  none(bIcon, cIcon, /%/, "B shows progress");
  none(cIcon, prIcon, /^(In Progress|In Review|Backlog|Done)$/, "C shows a Status pill");
  none(prIcon, draftTitle, /%/, "the pull request shows progress");
  none(draftTitle, undefined, /^#\d+$|%/, "the draft issue shows a #number or progress");

  // Pills take the option colour from the theme.
  const pill = (name) => nodes(tree, (n) => text(n).trim() === name).map((n) => n.props.text_color);
  assert.ok(pill("In Progress").includes("theme.ansi3"), `In Progress pill colours: ${pill("In Progress")}`);
  assert.ok(pill("In Review").includes("theme.ansi4"), `In Review pill colours: ${pill("In Review")}`);
  assert.ok(pill("Backlog").includes("theme.muted"), `Backlog pill colours: ${pill("Backlog")}`);
  // A progress bar is there, named for screen readers.
  assert.ok(nodes(tree, (n) => /\b50%/.test(n.props.accessibility_label ?? "")).length, "no progress bar for 50%");
  assert.ok(nodes(tree, (n) => /\b13%/.test(n.props.accessibility_label ?? "")).length, "no progress bar for 13%");
});

test("T-4: should render a stubbed 300-item board in 3 GraphQL calls and keep it scrollable", async () => {
  const s = id();
  const titles = Array.from({ length: 300 }, (_, i) => `Item ${i + 1} ${s}`);
  const page = (n) => titles.slice(n * 100, n * 100 + 100).map((title, j) =>
    issue({ id: `I_${n * 100 + j + 1}_${s}`, number: n * 100 + j + 1, title, status: { name: "In Progress", color: "YELLOW" } }));
  const cursors = [undefined, `c1-${s}`, `c2-${s}`];
  const { calls } = setup(s, () => ({
    items: (after) => {
      const n = cursors.indexOf(after);
      return itemsPage(page(n), n < 2 ? { hasNextPage: true, endCursor: cursors[n + 1] } : { hasNextPage: false, endCursor: `c3-${s}` });
    },
  }));

  const tree = await shown();

  assert.equal(calls.items.length, 3, "one GraphQL call per 100 items");
  assert.deepEqual(calls.items.map((c) => c.after), cursors, "each page asks for the one after the last");
  for (const c of calls.items) assert.match(c.query, /items\(\s*first:\s*100\b/, "items are fetched 100 per page");
  const screen = text(tree);
  const missing = titles.filter((t) => !screen.includes(t));
  assert.deepEqual(missing, [], "every item has a row");
  const scrollers = nodes(tree, (n) => "overflow_y_scroll" in n.props || "overflow_y_scrollbar" in n.props);
  assert.ok(scrollers.some((n) => text(n).includes(titles[0]) && text(n).includes(titles[299])), "the rows are in a scrolling list");
});

// Comment on #5 (from the PR #35 review): paging stops when GitHub's cursor doesn't advance.
test("should stop paging board items when GitHub returns the same end cursor again", async () => {
  const s = id();
  const { calls } = setup(s, () => ({
    items: (after) => after === undefined
      ? itemsPage([issue({ id: `I_1${s}`, number: 1, title: `First ${s}` })], { hasNextPage: true, endCursor: `c1-${s}` })
      : itemsPage([issue({ id: `I_2${s}`, number: 2, title: `Second ${s}` })], { hasNextPage: true, endCursor: `c1-${s}` }),
  }));

  const screen = text(await shown());
  assert.equal(calls.items.length, 2, `items pages read: ${calls.items.length}`);
  assert.match(screen, new RegExp(`First ${s}`));
  assert.match(screen, new RegExp(`Second ${s}`));
});

test("should stop paging board items when GitHub says there is a next page but gives no end cursor", async () => {
  const s = id();
  const { calls } = setup(s, () => ({
    items: () => itemsPage([issue({ id: `I_1${s}`, number: 1, title: `Only ${s}` })], { hasNextPage: true, endCursor: null }),
  }));

  const screen = text(await shown());
  assert.equal(calls.items.length, 1, `items pages read: ${calls.items.length}`);
  assert.match(screen, new RegExp(`Only ${s}`));
});

test("should stop paging linked boards when GitHub returns the same end cursor again", async () => {
  const s = id();
  const { calls } = setup(s, (project) => ({
    boards: (after) => ({
      data: { repository: { projectsV2: {
        nodes: after === undefined ? [project] : [{ id: `PVT_old${s}`, number: 1, title: `Old ${s}`, closed: true }],
        pageInfo: { hasNextPage: true, endCursor: `b1-${s}` },
      } } },
    }),
    items: () => itemsPage([issue({ id: `I_1${s}`, number: 1, title: `Row ${s}` })]),
  }));

  const screen = text(await shown());
  assert.equal(calls.boards.length, 2, `board pages read: ${calls.boards.length}`);
  assert.match(screen, new RegExp(`Board ${s}`));
  assert.match(screen, new RegExp(`Row ${s}`));
});

test("should stop paging linked boards when GitHub says there is a next page but gives no end cursor", async () => {
  const s = id();
  const { calls } = setup(s, (project) => ({
    boards: () => ({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: true, endCursor: null } } } } }),
    items: () => itemsPage([issue({ id: `I_1${s}`, number: 1, title: `Row ${s}` })]),
  }));

  const screen = text(await shown());
  assert.equal(calls.boards.length, 1, `board pages read: ${calls.boards.length}`);
  assert.match(screen, new RegExp(`Board ${s}`));
  assert.match(screen, new RegExp(`Row ${s}`));
});
