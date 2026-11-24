// Story #13: an issue's Activity, comments and board Status changes in one list
// (epic #10 prototype a28afdf, mod/src/activity.js: mergeActivity, relativeTime, statusLine).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeActivity, relativeTime, statusLine } from "../../mod/src/activity.js";

// A fixed clock, so relative times don't depend on when the test runs.
const now = Date.parse("2026-11-23T12:00:00Z");
const ago = (minutes) => new Date(now - minutes * 60000).toISOString();

// Nodes as the issue query returns them (a28afdf, mod/src/load.js ISSUE): `comments` and
// `timelineItems(itemTypes:[PROJECT_V2_ITEM_STATUS_CHANGED_EVENT])`.
const comment = (id, createdAt) => ({ id, author: { login: `agent-${id}` }, createdAt, body: `Body ${id}` });
const change = (id, createdAt, previousStatus, status) => ({ id, createdAt, previousStatus, status });

test("T-1: should merge comments and PROJECT_V2_ITEM_STATUS_CHANGED_EVENT items into one list ordered by createdAt", () => {
  // Each list comes in its own order; the merge interleaves them by time, oldest first.
  const comments = [comment("c1", "2026-11-20T09:00:00Z"), comment("c2", "2026-11-22T18:30:00Z")];
  const events = [change("e1", "2026-11-19T08:00:00Z", "", "Todo"), change("e2", "2026-11-21T10:15:00Z", "Todo", "In Progress"), change("e3", "2026-11-23T07:45:00Z", "In Progress", "In Review")];

  const activity = mergeActivity(comments, events);

  assert.deepEqual(activity.map((a) => [a.kind, a.id]), [
    ["status", "e1"],
    ["comment", "c1"],
    ["status", "e2"],
    ["comment", "c2"],
    ["status", "e3"],
  ]);
  // Each entry keeps what it shows: a comment its author and body, a change its two Statuses.
  const c2 = activity.find((a) => a.id === "c2");
  assert.equal(c2.author.login, "agent-c2");
  assert.equal(c2.body, "Body c2");
  const e2 = activity.find((a) => a.id === "e2");
  assert.equal(e2.previousStatus, "Todo");
  assert.equal(e2.status, "In Progress");
});

test("T-2: should format relative times as minutes, hours and days ago", () => {
  assert.equal(relativeTime(ago(1), now), "1m ago");
  assert.equal(relativeTime(ago(40), now), "40m ago");
  assert.equal(relativeTime(ago(59), now), "59m ago");
  assert.equal(relativeTime(ago(60), now), "1h ago");
  assert.equal(relativeTime(ago(2 * 60 + 30), now), "2h ago");
  assert.equal(relativeTime(ago(23 * 60 + 59), now), "23h ago");
  assert.equal(relativeTime(ago(24 * 60), now), "1d ago");
  assert.equal(relativeTime(ago(3 * 24 * 60 + 5 * 60), now), "3d ago");
});

test("T-3: should format a status change with previousStatus, status and relative time", () => {
  assert.equal(statusLine(change("e1", ago(25), "In Progress", "In Review"), now), "In Progress → In Review · 25m ago");
  // A first Status on the board has no previous one (#11's note): the prototype says "No status".
  assert.equal(statusLine(change("e2", ago(3 * 24 * 60), "", "Todo"), now), "No status → Todo · 3d ago");
  assert.equal(statusLine(change("e3", ago(2 * 60), null, "Todo"), now), "No status → Todo · 2h ago");
});
