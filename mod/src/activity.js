// An issue's activity: comments and board Status changes in one list, as plain functions.
// From the approved epic #10 prototype (epic/10-prototype, a28afdf, mod/src/activity.js).
// relativeTime adapted from Branch PR (munza/herdr-mods, Apache-2.0).

// The first lines of the project-plugin's agent handoffs (branch-and-flag-policy). Authorship
// can't tell them apart: all agents post as one user. A `\r\n` body still starts with the prefix.
const HANDOFFS = ["Tests written at ", "Prototype handoff at "];
export const isHandoff = (body) => {
  const first = String(body ?? "").split("\n", 1)[0];
  return HANDOFFS.some((prefix) => first.startsWith(prefix));
};

// Oldest first; a comment and a change at the same moment keep that order.
export function mergeActivity(comments, events) {
  return [
    ...comments.map((c) => ({ kind: "comment", ...c })),
    ...events.map((e) => ({ kind: "status", ...e })),
  ].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

// just now, 5m, 2h, 3d ago.
export function relativeTime(date, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(date)) / 60000);
  if (!(minutes >= 1)) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

// A first Status on the board has an empty or null previousStatus.
export const statusLine = (event, now = Date.now()) =>
  `${event.previousStatus || "No status"} → ${event.status || "No status"} · ${relativeTime(event.createdAt, now)}`;
