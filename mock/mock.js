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
  // Epic #10 (issue detail): pick one, then click a row.
  { id: "detail-loading", label: "Issue loading" },
  { id: "detail-error", label: "Issue API error" },
];

let scenario = "board";
let failNext = false; // API error fails once, so Try again loads the board
let held = []; // loads the Loading state keeps waiting
let fetches = 0; // each board load moves #3 one column on, as an agent would
const reads = new Map(); // issue number -> detail loads; each reload of #16 brings one new comment
const arrived = new Map(); // issue number -> the comments that came in while it was open

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
    10: ["Epic: Issue detail", "In Progress", [11, 12, 13, 14, 15, 16, 17]],
    11: ["Open an issue's detail", "In Review"],
    12: ["Sub-issues in the issue detail", "Tests Written"],
    13: ["Activity: comments and status changes", "Designed"],
    14: ["Highlight agent handoff comments", "Designed"],
    15: ["Images as Open image links", "Designed"],
    16: ["Issue detail stays current", "Designed"],
    17: ["Epic #10 acceptance tests", "Specified"],
    40: ["Epic: Images in issue detail", "Backlog", [41, 42]],
    41: ["Spike: load private images through gh", "Backlog"],
    42: ["Show images inline through gh", "Done", [], true],
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

const HERDR_REPO = "https://github.com/Easy-Monday/herdr-plugins";
const WEB_REPO = "https://github.com/acme/website";

function content(n, issues, repo = HERDR_REPO) {
  const [title, status, subs = [], notPlanned] = issues[n];
  const closed = status === "Done";
  const children = subs.map((m) => {
    const { __typename, subIssues, ...sub } = content(m, issues, repo);
    return sub;
  });
  const completed = children.filter((c) => c.state === "CLOSED").length;
  return {
    __typename: "Issue",
    id: `I_${n}`,
    number: n,
    title,
    url: `${repo}/issues/${n}`,
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

const item = (key, status, content, databaseId = null) => ({
  id: `PVTI_${key}`,
  databaseId,
  status: status ? { name: status, color: OPTION_COLORS[status] } : null,
  content,
});
const issueItems = (order, issues, repo) => order.map((n) => item(n, issues[n][1], content(n, issues, repo)));

function herdrBoard() {
  const issues = herdrIssues();
  const at = (numbers) => issueItems(numbers, issues);
  return [
    ...at([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 26]),
    item("pr29", "In Review", { __typename: "PullRequest", id: "PR_29", number: 29, title: "docs: explain placement in the README", url: `${HERDR_REPO}/pull/29`, state: "OPEN", isDraft: false }),
    item("pr30", "In Progress", { __typename: "PullRequest", id: "PR_30", number: 30, title: "feat(#2): show the repo of the active tab", url: `${HERDR_REPO}/pull/30`, state: "OPEN", isDraft: true }),
    item("draft1", "Backlog", { __typename: "DraftIssue", id: "DI_1", title: "Try Herdr's virtual list for long boards" }, 140213),
    ...at([27, 32, 33, 40, 41, 42, 20, 21, 22]),
    item("pr28", "Done", { __typename: "PullRequest", id: "PR_28", number: 28, title: "chore: set up dev environment", url: `${HERDR_REPO}/pull/28`, state: "MERGED", isDraft: false }),
  ];
}

function websiteIssues() {
  return {
    101: ["Epic: New pricing page", "In Progress", [102, 103, 104]],
    102: ["Pricing table component", "Done"],
    103: ["Plan comparison copy", "In Progress"],
    104: ["Annual billing toggle", "Todo"],
    105: ["Footer links broken on mobile", "Todo"],
    106: ["Move analytics to the new tag manager", "In Progress"],
    107: ["Launch checklist", "Todo"],
  };
}
const websiteBoard = () => issueItems([101, 102, 103, 104, 105, 106, 107], websiteIssues(), WEB_REPO);

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
const HERDR = { id: "PVT_main", number: 11, title: "herdr-plugins", url: "https://github.com/orgs/Easy-Monday/projects/11", closed: false };

function projects(vars) {
  if (scenario === "no-board") return [{ id: "PVT_old", number: 3, title: "Old roadmap", closed: true }];
  if (scenario === "many-boards")
    return [HERDR, { id: "PVT_road", number: 12, title: "Herdr roadmap", closed: false }, { id: "PVT_old", number: 3, title: "Old roadmap", closed: true }];
  if (scenario === "big") return [{ id: "PVT_big", number: 99, title: "Load test board", closed: false }];
  if (vars.name === "website") return [{ id: "PVT_web", number: 4, title: "Website relaunch", url: "https://github.com/orgs/acme/projects/4", closed: false }];
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

// Epic #10 (issue detail): what an issue's detail query answers. Times are minutes ago.
const shot = (sha, n, file) => `${HERDR_REPO}/blob/${sha}/docs/screenshots/${n}/${file}?raw=true`;
const OWNER = "S4n3L"; // every agent posts as the owner's account, as on the real board

// number: { type, body, comments: [minutes ago, body], events: [minutes ago, previous, status] }
const DETAILS = {
  10: {
    type: "Epic",
    body: `## Goal
Clicking a row shows the issue's definition, sub-issues, status history and agent handoffs inside Herdr.

## Scope
In: detail view with header, body, sub-issues, activity (comments and status changes), handoff highlight, images as links, detail refresh.
Out: inline images (separate epic), labels, assignees, linked PRs, other timeline events, any writing.

## Acceptance criteria
- AC-1: Given the board list, When the owner clicks a row, Then the detail shows type, title, #number, Status, Open on GitHub, the rendered body and the sub-issues, and Back returns to the list
- AC-2: Given an issue with comments and status changes, When its detail shows, Then they appear in one list oldest first, with handoff comments marked
- AC-3: Given a body with an image, When the detail shows, Then the image is an Open image link
- AC-4: Given an open detail, When the refresh interval passes, Then new comments appear and the issue stays open

## Source
BRD §4.6, §4.7, §4.8, §4.11`,
    events: [
      [4320, "Backlog", "Specified"],
      [180, "Specified", "Designed"],
      [60, "Designed", "In Progress"],
    ],
    comments: [
      [4300, "Entering the Prototype gate: every story is `Specified`, and epic #1 has `Prototype approved at cac901d`."],
      [1440, `Prototype handoff at 5b7e0c2 on epic/10-prototype

- [x] Every acceptance criterion of every UI story is reachable by a click path
- [x] Empty, loading and error states are reachable by clicking
- [x] Changes to existing copy are listed

<img alt="Issue detail with activity" src="${shot("5b7e0c2", 10, "activity.png")}" width="368">`],
      [1300, `Prototype coverage at 5b7e0c2

| Story | AC | Click path |
|---|---|---|
| #11 | AC-1 | Board → click #10 → Back |
| #14 | AC-1 | Board → #10 → handoff comment |`],
      [200, `> Keep the Status next to the number, not under the title.

Relayed from the owner's review; #11 AC-2 updated.`],
    ],
  },
  11: {
    type: "Feature",
    body: `## User story
As the owner, directing agents, I want to open an issue from the list, so that I read its definition without a browser.

## Acceptance criteria
- AC-1: Given the board list, When the owner clicks a top-level or sub-issue row, Then the list is replaced by that issue's detail, and Back returns to the list
- AC-2: Given an issue detail, When it shows, Then the header has the issue type (if set), title, #number, board Status and an Open on GitHub link that opens the system browser
- AC-3: Given an issue with a body, When the detail shows, Then the body renders as markdown
- AC-4: Given a pull request or draft issue row, When clicked, Then the detail offers only Open on GitHub

## Test spec
- T-1 (AC-1, e2e): should open the clicked row's detail and return to the list with Back
- T-2 (AC-2, unit): should parse an issue GraphQL response into type, title, number, Status and URL

## Notes for developer
Unit: \`src/issue.js\` exports \`parseIssue(response)\`. Body via \`TextView.markdown\`.`,
    events: [
      [4320, "Backlog", "Specified"],
      [180, "Specified", "Designed"],
      [150, "Designed", "Tests Written"],
      [120, "Tests Written", "In Progress"],
      [25, "In Progress", "In Review"],
    ],
    comments: [
      [155, `Tests written at 9f3c2e1 on story/11-open-an-issue-s-detail

Test files:
- \`test/unit/issue.test.js\`
- \`test/e2e/detail.test.js\`

\`\`\`
not ok 1 - should open the clicked row's detail and return to the list with Back
not ok 2 - should parse an issue GraphQL response into type, title, number, Status and URL
# pass 0
# fail 4
\`\`\``],
      [40, `Screenshots at 2c4d8e0:

![Detail header with Status](${shot("2c4d8e0", 11, "header.png")})

![](${shot("2c4d8e0", 11, "back-to-board.png")})`],
      [20, `Approved

The handoff this PR builds on:
Tests written at 9f3c2e1 on story/11-open-an-issue-s-detail
(quoted here, so this comment is not a handoff itself)`],
    ],
  },
  12: {
    type: "Feature",
    body: `## User story
As the owner, directing agents, I want to see and open an issue's sub-issues from its detail, so that I can walk down from an epic to its stories.

## Acceptance criteria
- AC-1: Given an issue with sub-issues, When its detail shows, Then a short list shows each sub-issue's state, title, number and Status
- AC-2: Given that list, When the owner clicks a sub-issue, Then its detail opens`,
    events: [
      [4320, "Backlog", "Specified"],
      [180, "Specified", "Designed"],
      [15, "Designed", "Tests Written"],
    ],
    comments: [
      [14, `Tests written at 77ab0c3 on story/12-sub-issues-in-the-issue-detail

Test files:
- \`test/unit/issue.test.js\`

\`\`\`
# pass 0
# fail 2
\`\`\``],
    ],
  },
  15: {
    type: "Feature",
    body: `## User story
As the owner, directing agents, I want to open images from issues and comments, so that I can see agents' screenshots though the repo is private.

## Acceptance criteria
- AC-1: Given a body or comment with a markdown or HTML image, When it shows, Then the image is replaced by an Open image link labelled with its alt text, else its file name
- AC-2: Given an Open image link, When the owner clicks it, Then the image URL opens in the system browser

## Example
The developer's screenshot from #11:

![Detail header with Status](${shot("2c4d8e0", 11, "header.png")})`,
    events: [
      [4320, "Backlog", "Specified"],
      [180, "Specified", "Designed"],
    ],
    comments: [[170, `An HTML image without alt text, as some agents post them:

<img src="${shot("5b7e0c2", 15, "open-image-link.png")}" width="300">`]],
  },
  26: {
    type: "Bug",
    body: `## Steps
1. Open the board panel.
2. Switch Herdr from a dark to a light theme.

## Expected
The panel redraws in the new theme.

## Actual
The panel stays blank until it is reopened.`,
    events: [[2880, "Backlog", "In Progress"]],
    comments: [[2000, "Seen on Herdr 0.42 only; 0.43 redraws."]],
  },
  32: { type: null, body: "Show the GitHub issue type before each row's title.", events: [], comments: [] },
  33: { type: "Feature", body: "", events: [], comments: [] },
};

// Issues without their own entry: a short definition and how they got to their Status.
function generic(n, title, status) {
  const epic = title.startsWith("Epic:");
  const path = ["Backlog", "Specified", "Designed", "Tests Written", "In Progress", "In Review", "Done"];
  const steps = path.slice(0, Math.max(path.indexOf(status), 0) + 1);
  return {
    type: epic ? "Epic" : n >= 20 && n <= 22 ? "Task" : "Feature",
    body: epic
      ? `## Goal\n${title.slice(6)}.\n\n## Acceptance criteria\n- AC-1: Given the board, When the owner opens it, Then it works as the stories say`
      : `## Acceptance criteria\n- AC-1: ${title}`,
    events: steps.slice(1).map((to, i) => [4320 - i * 600, steps[i], to]),
    comments: [],
  };
}

// #16 ("Issue detail stays current") gets a new comment on each reload, by turns a handoff and a plain one.
const REFRESHED = 16;
function arrival(n, k) {
  const body =
    k % 2
      ? `Tests written at ${(0xa1b2c3 + k).toString(16)} on story/${n}-refresh\n\nTest files:\n- \`test/e2e/detail.test.js\`\n\n\`\`\`\n# pass 0\n# fail 2\n\`\`\``
      : `Picked up again after refresh ${k}: still working on #${n}.`;
  return { id: `IC_${n}_new${k}`, author: { login: OWNER }, createdAt: new Date().toISOString(), body };
}

const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

// shortcut: the 300-item board's rows answer with the herdr board's issue of that number; prototype only.
function detail(id) {
  const n = Number(String(id).slice(2));
  const web = n >= 101 && n <= 107;
  const issues = web ? websiteIssues() : herdrIssues();
  if (!issues[n]) return { data: { node: null } };
  const repo = web ? WEB_REPO : HERDR_REPO;
  const project = { id: web ? "PVT_web" : "PVT_main" };
  const onBoard = (m) => {
    const status = issues[m][1];
    if (status === undefined) return { nodes: [] };
    return { nodes: [{ project, status: status ? { name: status, color: OPTION_COLORS[status] } : null }] };
  };
  const { subIssuesSummary, subIssues, ...node } = content(n, issues, repo);
  const d = DETAILS[n] ?? generic(n, issues[n][0], issues[n][1]);
  const k = (reads.get(n) ?? 0) + 1;
  reads.set(n, k);
  if (!arrived.has(n)) arrived.set(n, []);
  if (k > 1 && n === REFRESHED) arrived.get(n).push(arrival(n, k - 1));
  return {
    data: {
      node: {
        ...node,
        body: d.body,
        issueType: d.type ? { name: d.type } : null,
        projectItems: onBoard(n),
        subIssues: { nodes: subIssues.nodes.map((s) => ({ ...s, projectItems: onBoard(s.number) })) },
        comments: {
          nodes: [
            ...d.comments.map(([minutes, body], i) => ({ id: `IC_${n}_${i}`, author: { login: OWNER }, createdAt: ago(minutes), body })),
            ...arrived.get(n),
          ],
        },
        timelineItems: {
          nodes: d.events.map(([minutes, previousStatus, status], i) => ({ id: `PVTISC_${n}_${i}`, createdAt: ago(minutes), previousStatus, status })),
        },
      },
    },
  };
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
  const issue = query.includes("timelineItems(");
  const ours = issue || query.includes("projectsV2(") || query.includes("items(first:100");
  if (!ours) return exec("gh", args);
  if (issue) {
    // Released, it answers as the Board state would, so it can't use up the next state's failure.
    if (scenario === "detail-loading")
      return new Promise((resolve) => held.push(() => resolve(ok(JSON.stringify(detail(variables(args).id))))));
    if (scenario === "detail-error" && failNext) {
      failNext = false;
      return fail("HTTP 502: Bad Gateway (https://api.github.com/graphql)");
    }
    return ok(JSON.stringify(detail(variables(args).id)));
  }
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
  failNext = id === "api-error" || id === "detail-error";
  const waiting = held;
  held = [];
  for (const release of waiting) release();
};
