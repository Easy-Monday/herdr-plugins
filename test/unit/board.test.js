// Story #3: the board linked to the repo (pure parts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickProject } from "../../mod/src/board.js";

const response = (nodes) => ({ data: { repository: { projectsV2: { nodes } } } });

test("T-1: should return the single open project from a `repository.projectsV2` GraphQL response, ignoring closed ones", () => {
  const open = { id: "PVT_open", number: 7, title: "Roadmap", closed: false };
  const old = { id: "PVT_old", number: 2, title: "Old board", closed: true };
  const older = { id: "PVT_older", number: 1, title: "Older board", closed: true };

  assert.deepEqual(pickProject(response([old, open, older])), { kind: "one", project: open });
  assert.deepEqual(pickProject(response([open])), { kind: "one", project: open });
});
