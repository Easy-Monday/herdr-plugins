// Story #5: board items as list rows (pure parts of mods/project-board/src/board.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { issue, pullRequest, draftIssue, itemsPage } from "../support/items.js";

// Imported per test, so each T-line reports its own result.
const board = () => import("../../mods/project-board/src/board.js");
const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));

test("T-1: should parse a paginated items response into rows in board order with state, title, number and Status", async () => {
  const { parseItems } = await board();
  const inProgress = { name: "In Progress", color: "YELLOW" };
  const review = { name: "In Review", color: "BLUE" };
  const pages = [
    itemsPage(
      [
        issue({ id: "I_12", number: 12, title: "Show the repo", status: inProgress }),
        issue({ id: "I_3", number: 3, title: "Find the board", state: "CLOSED", status: review }),
      ],
      { hasNextPage: true, endCursor: "c1" },
    ),
    itemsPage([issue({ id: "I_40", number: 40, title: "No Status yet" })]),
  ];

  const rows = parseItems(pages);

  assert.deepEqual(
    rows.map((r) => pick(r, ["number", "title", "state", "status"])),
    [
      { number: 12, title: "Show the repo", state: "OPEN", status: inProgress },
      { number: 3, title: "Find the board", state: "CLOSED", status: review },
      { number: 40, title: "No Status yet", state: "OPEN", status: null },
    ],
  );
});

test("T-3: should compute progress as closed/total sub-issues, rounded to whole percent", async () => {
  const { progress } = await board();
  assert.equal(progress({ total: 8, completed: 1 }), 13); // 12.5 rounds up
  assert.equal(progress({ total: 3, completed: 1 }), 33);
  assert.equal(progress({ total: 3, completed: 2 }), 67);
  assert.equal(progress({ total: 2, completed: 1 }), 50);
  assert.equal(progress({ total: 4, completed: 0 }), 0);
  assert.equal(progress({ total: 5, completed: 5 }), 100);
  // GitHub's own percentCompleted is not what is shown: closed over all, from the counts.
  assert.equal(progress({ total: 8, completed: 1, percentCompleted: 12 }), 13);
  // No sub-issues: no progress at all.
  assert.equal(progress({ total: 0, completed: 0, percentCompleted: 0 }), null);
  assert.equal(progress(null), null);
});

test("T-5: should parse PullRequest and DraftIssue items as plain rows", async () => {
  const { parseItems } = await board();
  const open = { name: "In Review", color: "BLUE" };
  const backlog = { name: "Backlog", color: "GRAY" };
  const rows = parseItems([
    itemsPage([
      pullRequest({ id: "PR_29", number: 29, title: "feat(#5): rows", status: open }),
      pullRequest({ id: "PR_30", number: 30, title: "wip: draft", isDraft: true, status: backlog }),
      draftIssue({ id: "DI_1", title: "Try a virtual list", status: backlog }),
    ]),
  ]);

  const plain = rows.map((r) => pick(r, ["type", "number", "title", "status", "summary", "subIssues"]));
  assert.deepEqual(plain, [
    { type: "PullRequest", number: 29, title: "feat(#5): rows", status: open, summary: null, subIssues: [] },
    { type: "PullRequest", number: 30, title: "wip: draft", status: backlog, summary: null, subIssues: [] },
    { type: "DraftIssue", number: null, title: "Try a virtual list", status: backlog, summary: null, subIssues: [] },
  ]);
});
