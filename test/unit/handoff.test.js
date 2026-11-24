// Story #14: agent handoff comments, told by their first line (BRD §4.7; epic #10 prototype
// a28afdf, mod/src/activity.js `isHandoff`). Authorship can't be used: all agents post as one user.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isHandoff } from "../../mod/src/activity.js";

test("T-1: should return true for bodies whose first line starts with either prefix", () => {
  assert.equal(isHandoff("Tests written at 9f3c2e1 on story/11-open-an-issue-s-detail"), true);
  assert.equal(isHandoff("Prototype handoff at 5b7e0c2 on epic/10-prototype"), true);
  // The rest of the comment (files, run output, checklist) doesn't matter.
  assert.equal(isHandoff("Tests written at 9f3c2e1 on story/11-x\n\n- test/unit/a.test.js\n\n```\nnot ok 1\n```"), true);
  assert.equal(isHandoff("Prototype handoff at 5b7e0c2 on epic/10-prototype\r\n- [x] every AC has a path"), true);
});

test("T-2: should return false when the prefix is not on the first line or absent", () => {
  // A comment that only quotes a handoff below its first line (the prototype's "Approved" comment).
  assert.equal(isHandoff("Approved\n\n> Tests written at 9f3c2e1 on story/11-x"), false);
  assert.equal(isHandoff("Approved\nTests written at 9f3c2e1 on story/11-x"), false);
  assert.equal(isHandoff("\nPrototype handoff at 5b7e0c2 on epic/10-prototype"), false);
  // On the first line but not at its start, or another prefix.
  assert.equal(isHandoff("> Tests written at 9f3c2e1 on story/11-x"), false);
  assert.equal(isHandoff("Re: Tests written at 9f3c2e1"), false);
  assert.equal(isHandoff("Prototype coverage at a28afdf on epic/10-prototype"), false);
  assert.equal(isHandoff("Tests written"), false);
  // Absent: an empty or missing body.
  assert.equal(isHandoff(""), false);
  assert.equal(isHandoff(null), false);
  assert.equal(isHandoff(undefined), false);
});
