// Story #11: an issue's detail header, read from GitHub's answer to the issue query
// (epic #10 prototype a28afdf, mod/src/load.js ISSUE: issueType, projectItems with each board's Status).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIssue } from "../../mod/src/issue.js";

const board = "PVT_this";
const onBoard = (projectId, status) => ({ project: { id: projectId }, status });
const response = (node) => ({ data: { node } });
const node = (extra = {}) => ({
  id: "I_kw1",
  number: 42,
  title: "Sort rows by Status",
  url: "https://github.com/acme/web/issues/42",
  state: "OPEN",
  stateReason: null,
  body: "",
  issueType: { name: "Feature" },
  // The issue is on two boards; the header shows this board's Status.
  projectItems: { nodes: [onBoard("PVT_other", { name: "Done", color: "PURPLE" }), onBoard(board, { name: "In Progress", color: "YELLOW" })] },
  subIssues: { nodes: [] },
  comments: { nodes: [] },
  timelineItems: { nodes: [] },
  ...extra,
});

test("T-2: should parse an issue GraphQL response into type, title, number, Status and URL", () => {
  // The title doesn't hold the type, so the type can only come from issueType.
  const issue = parseIssue(response(node()), board);
  assert.equal(issue.issueType, "Feature");
  assert.equal(issue.title, "Sort rows by Status");
  assert.equal(issue.number, 42);
  assert.deepEqual(issue.status, { name: "In Progress", color: "YELLOW" });
  assert.equal(issue.url, "https://github.com/acme/web/issues/42");

  // No type set, no Status on this board: both are absent, not guessed.
  const bare = parseIssue(response(node({ issueType: null, projectItems: { nodes: [onBoard("PVT_other", { name: "Done", color: "PURPLE" })] } })), board);
  assert.equal(bare.issueType, null);
  assert.equal(bare.status, null);
});
