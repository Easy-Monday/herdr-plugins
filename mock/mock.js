// Prototype mock layer: answers gh calls of epics still in their Prototype gate from fixtures.
// Return { code, stdout, stderr } like herdr's exec. Unmatched calls go to the real gh.
// State is in memory: reloading the mod resets it.
import { exec } from "herdr";

// Epic #1 (project board panel): the states the owner can pick from the panel's Prototype bar.
const SCENARIOS = [
  { id: "board", label: "Board" },
  { id: "loading", label: "Loading" },
  { id: "other-repo", label: "Tab in another repo" },
  { id: "big", label: "300 items" },
  { id: "not-git", label: "Not a git repo" },
  { id: "no-remote", label: "No GitHub remote" },
  { id: "no-board", label: "No linked board" },
  { id: "many-boards", label: "Two linked boards" },
  { id: "gh-missing", label: "gh not installed" },
  { id: "gh-logged-out", label: "gh not logged in" },
  { id: "gh-scope", label: "gh lacks project scope" },
  { id: "api-error", label: "API error" },
];

let scenario = "board";
let failNext = false; // API error fails once, so Try again loads the board
let held = []; // loads the Loading state keeps waiting
let fetches = 0; // each board load moves #3 one column on, as an agent would

const OPTION_COLORS = {
  Backlog: "GRAY",
  Specified: "PURPLE",
  Designed: "PINK",
  "Tests Written": "ORANGE",
  "In Progress": "YELLOW",
  "In Review": "BLUE",
  Done: "GREEN",
  Todo: "GRAY",
};
const MOVES = ["Tests Written", "In Progress", "In Review", "Done"];

// number: [title, Status (null: on the board without one), sub-issues, closed as not planned]
function herdrIssues() {
  return {
    1: ["Epic: Project board panel", "Specified", [2, 3, 4, 5, 6, 7, 8, 9]],
    2: ["Show the repo of the active tab", "In Progress"],
    3: ["Find the project board linked to the repo", MOVES[(fetches - 1) % MOVES.length]],
    4: ["Clear messages for gh and network errors", "Designed"],
    5: ["Board list rows with Status and progress", "Specified", [31]],
    6: ["Sub-issues nested under their parent", "Specified"],
    7: ["Hide Done by default", "In Review"],
    8: ["Keep the board current", "Done"],
    9: ["Epic #1 acceptance tests", "Specified"],
    10: ["Epic: Issue detail view", "Backlog", [11, 12, 13, 14]],
    11: ["Open an issue's detail from its row", "Backlog"],
    12: ["Render the issue body as markdown", "Backlog"],
    13: ["Show comments and Status changes as activity", "Backlog"],
    14: ["Highlight agent handoff comments", "Backlog"],
    16: ["Epic: Images in issue detail", "Backlog", [17, 18]],
    17: ["Show images as Open image links", "Backlog"],
    18: ["Show images inline through gh", "Done", [], true],
    20: ["Development environment", "Done", [21, 22]],
    21: ["Scaffold the repo with tests and CI", "Done"],
    22: ["Add the Prototype mock layer", "Done"],
    26: ["Panel stays blank after a theme switch", "In Progress"],
    27: ["Pick the default refresh interval", "Tests Written"],
    31: ["Spike: virtual list for 300 rows", undefined], // a sub-issue that is not on the board
    32: ["Show the issue type on each row", null],
    33: ["Keyboard navigation in the list", "Specified"],
  };
}

function content(n, issues) {
  const [title, status, subs = [], notPlanned] = issues[n];
  const closed = status === "Done";
  const children = subs.map((m) => {
    const { __typename, subIssues, ...sub } = content(m, issues);
    return sub;
  });
  const completed = children.filter((c) => c.state === "CLOSED").length;
  return {
    __typename: "Issue",
    id: `I_${n}`,
    number: n,
    title,
    state: closed ? "CLOSED" : "OPEN",
    stateReason: closed ? (notPlanned ? "NOT_PLANNED" : "COMPLETED") : null,
    subIssuesSummary: {
      total: children.length,
      completed,
      percentCompleted: children.length ? Math.round((completed / children.length) * 100) : 0,
    },
    subIssues: { nodes: children },
  };
}

const item = (key, status, content) => ({
  id: `PVTI_${key}`,
  status: status ? { name: status, color: OPTION_COLORS[status] } : null,
  content,
});
const issueItems = (order, issues) => order.map((n) => item(n, issues[n][1], content(n, issues)));

function herdrBoard() {
  const issues = herdrIssues();
  const at = (numbers) => issueItems(numbers, issues);
  return [
    ...at([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 26]),
    item("pr29", "In Review", { __typename: "PullRequest", id: "PR_29", number: 29, title: "docs: explain placement in the README", state: "OPEN", isDraft: false }),
    item("pr30", "In Progress", { __typename: "PullRequest", id: "PR_30", number: 30, title: "feat(#2): show the repo of the active tab", state: "OPEN", isDraft: true }),
    item("draft1", "Backlog", { __typename: "DraftIssue", id: "DI_1", title: "Try Herdr's virtual list for long boards" }),
    ...at([27, 32, 33, 16, 17, 18, 20, 21, 22]),
    item("pr28", "Done", { __typename: "PullRequest", id: "PR_28", number: 28, title: "chore: set up dev environment", state: "MERGED", isDraft: false }),
  ];
}

function websiteBoard() {
  const issues = {
    101: ["Epic: New pricing page", "In Progress", [102, 103, 104]],
    102: ["Pricing table component", "Done"],
    103: ["Plan comparison copy", "In Progress"],
    104: ["Annual billing toggle", "Todo"],
    105: ["Footer links broken on mobile", "Todo"],
    106: ["Move analytics to the new tag manager", "In Progress"],
    107: ["Launch checklist", "Todo"],
  };
  return issueItems([101, 102, 103, 104, 105, 106, 107], issues);
}

function bigBoard() {
  const names = Object.keys(OPTION_COLORS).slice(0, 7);
  const issues = {};
  for (let n = 1; n <= 300; n++) {
    const subs = n % 10 === 0 ? [1000 + n * 3, 1001 + n * 3, 1002 + n * 3] : [];
    issues[n] = [`Generated item ${n} with a longer title to show truncation`, names[n % 7], subs];
    for (const [k, m] of subs.entries()) issues[m] = [`Sub-issue ${k + 1} of #${n}`, k === 0 ? "Done" : undefined];
  }
  return issueItems(Array.from({ length: 300 }, (_, i) => i + 1), issues);
}

const BOARDS = { PVT_main: herdrBoard, PVT_web: websiteBoard, PVT_big: bigBoard };
const HERDR = { id: "PVT_main", number: 11, title: "herdr-plugins", closed: false };

function projects(vars) {
  if (scenario === "no-board") return [{ id: "PVT_old", number: 3, title: "Old roadmap", closed: true }];
  if (scenario === "many-boards")
    return [HERDR, { id: "PVT_road", number: 12, title: "Herdr roadmap", closed: false }, { id: "PVT_old", number: 3, title: "Old roadmap", closed: true }];
  if (scenario === "big") return [{ id: "PVT_big", number: 99, title: "Load test board", closed: false }];
  if (vars.name === "website") return [{ id: "PVT_web", number: 4, title: "Website relaunch", closed: false }];
  return [HERDR];
}

function itemsPage({ id, after }) {
  if (id === "PVT_main" && !after) fetches++;
  const all = (BOARDS[id] ?? herdrBoard)();
  const start = Number(after ?? 0);
  const nodes = all.slice(start, start + 100);
  const end = start + nodes.length;
  return { data: { node: { items: { pageInfo: { hasNextPage: end < all.length, endCursor: String(end) }, nodes } } } };
}

// `-f key=value` pairs of a gh api call.
function variables(args) {
  const vars = {};
  args.forEach((arg, i) => {
    if (args[i - 1] !== "-f" && args[i - 1] !== "-F") return;
    const at = arg.indexOf("=");
    vars[arg.slice(0, at)] = arg.slice(at + 1);
  });
  return vars;
}

const ok = (stdout) => Promise.resolve({ code: 0, stdout, stderr: "" });
const fail = (stderr) => Promise.resolve({ code: 1, stdout: "", stderr });

export function mock(args) {
  const query = variables(args).query ?? "";
  const ours = query.includes("projectsV2(") || query.includes("items(first:100");
  if (!ours) return exec("gh", args);
  if (scenario === "loading") return new Promise((resolve) => held.push(() => resolve(mock(args))));
  if (scenario === "gh-missing") return Promise.reject(new Error("gh: No such file or directory (os error 2)"));
  if (scenario === "gh-logged-out") return fail("To get started with GitHub CLI, please run:  gh auth login");
  if (scenario === "gh-scope")
    return fail("Your token has not been granted the required scopes to execute this query. The 'id' field requires one of the following scopes: ['read:project'], but your token has only been granted the: ['repo'] scopes.");
  if (scenario === "api-error" && failNext) {
    failNext = false;
    return fail("HTTP 502: Bad Gateway (https://api.github.com/graphql)");
  }
  const vars = variables(args);
  if (query.includes("projectsV2("))
    return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: projects(vars) } } } }));
  return ok(JSON.stringify(itemsPage(vars)));
}

// git for repo detection: the real one, except in the states that need another folder.
mock.git = (args, options) => {
  if (scenario === "not-git")
    return Promise.resolve({ code: 128, stdout: "", stderr: "fatal: not a git repository (or any of the parent directories): .git" });
  const url = { "no-remote": "https://gitlab.com/acme/website.git", "other-repo": "git@github.com:acme/website.git" }[scenario];
  if (!url) return exec("git", args, options);
  if (args[0] === "remote") return ok(args[1] === "get-url" ? `${url}\n` : "origin\n");
  return ok(args[0] === "symbolic-ref" ? "main\n" : "origin\n");
};

mock.scenarios = SCENARIOS;
mock.scenario = () => scenario;
mock.choose = (id) => {
  scenario = id;
  failNext = id === "api-error";
  const waiting = held;
  held = [];
  for (const release of waiting) release();
};
