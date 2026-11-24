// Story #12: an issue's sub-issues, read from GitHub's answer to the issue query
// (epic #10 prototype a28afdf, mod/src/load.js ISSUE: `subIssues(first:50){nodes{id number title url state stateReason projectItems...}}`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIssue } from "../../mod/src/issue.js";

const board = "PVT_this";
const onBoard = (projectId, status) => ({ project: { id: projectId }, status });
const sub = ({ id, number, title, state = "OPEN", stateReason = null, boards = [] }) => ({
  id,
  number,
  title,
  url: `https://github.com/acme/web/issues/${number}`,
  state,
  stateReason,
  projectItems: { nodes: boards },
});
const response = (subIssues) => ({
  data: {
    node: {
      id: "I_kw10",
      number: 10,
      title: "Issue detail",
      url: "https://github.com/acme/web/issues/10",
      state: "OPEN",
      stateReason: null,
      body: "",
      issueType: { name: "Epic" },
      projectItems: { nodes: [onBoard(board, { name: "In Progress", color: "YELLOW" })] },
      subIssues: { nodes: subIssues },
      comments: { nodes: [] },
      timelineItems: { nodes: [] },
    },
  },
});

test("T-1: should parse sub-issues with state, title, number and board Status from the issue response", () => {
  const { subIssues } = parseIssue(
    response([
      // On two boards: the row shows this board's Status.
      sub({ id: "I_kw11", number: 11, title: "Open an issue's detail", boards: [onBoard("PVT_other", { name: "Done", color: "PURPLE" }), onBoard(board, { name: "In Review", color: "BLUE" })] }),
      sub({ id: "I_kw12", number: 12, title: "Sub-issues in the issue detail", state: "CLOSED", stateReason: "COMPLETED", boards: [onBoard(board, { name: "Done", color: "PURPLE" })] }),
      // Not on this board: no Status, not another board's.
      sub({ id: "I_kw13", number: 13, title: "Activity", state: "CLOSED", stateReason: "NOT_PLANNED", boards: [onBoard("PVT_other", { name: "Backlog", color: "GRAY" })] }),
    ]),
    board,
  );

  assert.ok(Array.isArray(subIssues), "parseIssue returns no subIssues list");
  const shown = subIssues.map(({ key, number, title, state, stateReason, status }) => ({ key, number, title, state, stateReason, status }));
  assert.deepEqual(shown, [
    { key: "I_kw11", number: 11, title: "Open an issue's detail", state: "OPEN", stateReason: null, status: { name: "In Review", color: "BLUE" } },
    { key: "I_kw12", number: 12, title: "Sub-issues in the issue detail", state: "CLOSED", stateReason: "COMPLETED", status: { name: "Done", color: "PURPLE" } },
    { key: "I_kw13", number: 13, title: "Activity", state: "CLOSED", stateReason: "NOT_PLANNED", status: null },
  ]);

  // An issue without sub-issues has an empty list, not a missing one.
  assert.deepEqual(parseIssue(response([]), board).subIssues, []);
});
