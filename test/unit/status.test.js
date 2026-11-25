// Story #5: Status pill colours (mods/project-board/src/status.js).
import { test } from "node:test";
import assert from "node:assert/strict";

// A theme as Herdr's theme() gives it; hex values so the orange mix can be checked.
const theme = {
  muted: "#808080",
  ansi1: "#ff0000",
  ansi2: "#00ff00",
  ansi3: "#ffff00",
  ansi4: "#0000ff",
  ansi5: "#800080",
  ansi13: "#ff00ff",
};

test("T-2: should map a GitHub option colour name to a pill colour and fall back to a theme colour when absent", async () => {
  const { statusColor } = await import("../../mods/project-board/src/status.js");
  // GitHub's single-select option colours, as the approved prototype shows them (epic #1, cac901d).
  assert.equal(statusColor("GRAY", theme), theme.muted);
  assert.equal(statusColor("BLUE", theme), theme.ansi4);
  assert.equal(statusColor("GREEN", theme), theme.ansi2);
  assert.equal(statusColor("YELLOW", theme), theme.ansi3);
  assert.equal(statusColor("RED", theme), theme.ansi1);
  assert.equal(statusColor("PINK", theme), theme.ansi13);
  assert.equal(statusColor("PURPLE", theme), theme.ansi5);
  // A theme has no orange: halfway between its red and yellow.
  assert.equal(statusColor("ORANGE", theme), "#ff8000");
  // No option colour, or one this mod doesn't know: a theme colour.
  assert.equal(statusColor(null, theme), theme.muted);
  assert.equal(statusColor(undefined, theme), theme.muted);
  assert.equal(statusColor("TEAL", theme), theme.muted);
});
