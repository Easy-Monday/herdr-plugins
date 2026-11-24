// Story #17, developer tests beyond the Test spec: loadIssue keeps a partial answer (data plus
// FORBIDDEN errors below the root field, which gh reports with exit 1) and still throws on every
// other failure, so story #4's classified notices keep working. The board lookup and items read
// still throw on any GraphQL error, partial or not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text } from "../support/harness.js";
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

// The repo's folder with one linked board; `boards` and `items` answer the two gh reads.
async function boardScreen(boards, items) {
  const s = randomUUID().slice(0, 8);
  const folder = `/w/${s}`;
  const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") return args.some((a) => a.startsWith("query=") && a.includes("projectsV2")) ? boards : items;
    if (options.cwd !== folder) return { code: 128, stdout: "", stderr: "fatal" };
    if (args[0] === "remote" && args.length > 1) return ok(`https://github.com/own-${s}/web-${s}.git\n`);
    return ok("origin\n");
  };
  herdrStub.spaces = [{ id: `s-${s}`, folder: "/home/test", machine: null, active: true, tabs: [{ id: "t1", active: true }] }];
  herdrStub.panes = [{ pane: `p-${s}`, terminal: `t-${s}`, tab: "t1", cwd: folder, focused: true }];
  const { render } = await mount();
  await tick();
  await settle();
  return text(render());
}
const reply = (code, body, stderr = "") => ({ code, stdout: JSON.stringify(body), stderr });
const end = { hasNextPage: false, endCursor: null };
const oneBoard = reply(0, { data: { repository: { projectsV2: { pageInfo: end, nodes: [{ id: "PVT_this", number: 1, title: "Roadmap", closed: false }] } } } });

test("should say the board didn't load when the board lookup's only linked board is FORBIDDEN", async () => {
  const boards = reply(1, { data: { repository: { projectsV2: { pageInfo: end, nodes: [null] } } }, errors: [denied(["repository", "projectsV2", "nodes", 0])] }, `gh: ${DENIED}`);
  const screen = await boardScreen(boards, oneBoard);
  assert.match(screen, /The board didn't load/);
  assert.doesNotMatch(screen, /No project board is linked/);
});

test("should say the board didn't load when the items read has FORBIDDEN errors below the board", async () => {
  const items = reply(1, { data: { node: { items: { pageInfo: end, nodes: [{ id: "PVTI_1", status: null, content: null }] } } }, errors: [denied(["node", "items", "nodes", 0, "content"])] }, `gh: ${DENIED}`);
  const screen = await boardScreen(oneBoard, items);
  assert.match(screen, /The board didn't load/);
  assert.ok(screen.includes(DENIED), screen);
});
