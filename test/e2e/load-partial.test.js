// Story #17, developer tests beyond the Test spec: graphql() in load.js keeps a partial answer
// (data plus FORBIDDEN errors below the root field, which gh reports with exit 1) and still
// throws on every other failure, so story #4's classified notices keep working.
import { test } from "node:test";
import assert from "node:assert/strict";
import { herdrStub } from "../support/harness.js";
import { loadIssue } from "../../mod/src/load.js";

const DENIED = "Resource not accessible by integration";
const node = { id: "I_1", number: 11, projectItems: { nodes: [{ project: { id: "PVT_this" } }, { project: null }] } };
const denied = (path) => ({ type: "FORBIDDEN", path, message: DENIED });
const answer = (code, body, stderr = "") => {
  herdrStub.exec = () => ({ code, stdout: typeof body === "string" ? body : JSON.stringify(body), stderr });
};

test("should keep the data when gh exits 1 and every error is FORBIDDEN below the issue", async () => {
  answer(1, { data: { node }, errors: [denied(["node", "projectItems", "nodes", 1, "project"])] }, `gh: ${DENIED}`);
  assert.deepEqual((await loadIssue("I_1")).data.node, node);
});

test("should keep the data when gh exits 0 with FORBIDDEN errors below the issue", async () => {
  answer(0, { data: { node }, errors: [denied(["node", "timelineItems", "nodes", 2, "project"])] });
  assert.deepEqual((await loadIssue("I_1")).data.node, node);
});

test("should throw when a FORBIDDEN error comes with any other error", async () => {
  const errors = [denied(["node", "projectItems", "nodes", 1, "project"]), { type: "NOT_FOUND", path: ["node"], message: "Could not resolve" }];
  answer(1, { data: { node }, errors }, "gh: Could not resolve");
  await assert.rejects(loadIssue("I_1"), /Could not resolve/);
});

test("should throw when the issue itself is FORBIDDEN and comes back null", async () => {
  answer(1, { data: { node: null }, errors: [denied(["node"])] }, `gh: ${DENIED}`);
  await assert.rejects(loadIssue("I_1"), new RegExp(DENIED));
});

test("should throw on a NOT_FOUND error for the issue even with exit 0", async () => {
  answer(0, { data: { node: null }, errors: [{ type: "NOT_FOUND", path: ["node"], message: "Could not resolve to a node" }] });
  await assert.rejects(loadIssue("I_1"), /Could not resolve to a node/);
});

test("should throw gh's stderr when gh exits 1 with JSON but no data", async () => {
  answer(1, { errors: [denied(["node", "projectItems"])] }, `gh: ${DENIED}`);
  await assert.rejects(loadIssue("I_1"), new RegExp(`gh: ${DENIED}`));
});

test("should throw gh's stderr when gh exits non-zero without JSON", async () => {
  answer(4, "", "To get started with GitHub CLI, please run:  gh auth login");
  await assert.rejects(loadIssue("I_1"), /gh auth login/);
});
