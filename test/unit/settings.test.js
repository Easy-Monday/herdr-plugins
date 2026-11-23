// Story #8: the board refresh interval, a mod setting (mod/src/settings.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { refreshSeconds } from "../../mod/src/settings.js";

test("T-3: should read the interval from settings, defaulting to 60 seconds, with a 60-second minimum", () => {
  // Read from settings.
  assert.equal(refreshSeconds({ refreshSeconds: 120 }), 120);
  assert.equal(refreshSeconds({ refreshSeconds: 60 }), 60);
  // Default: no setting, or one that is not a number of seconds.
  assert.equal(refreshSeconds({}), 60);
  assert.equal(refreshSeconds({ refreshSeconds: "fast" }), 60);
  // Minimum: never faster than every 60 seconds.
  assert.equal(refreshSeconds({ refreshSeconds: 30 }), 60);
  assert.equal(refreshSeconds({ refreshSeconds: 0 }), 60);
  assert.equal(refreshSeconds({ refreshSeconds: -5 }), 60);
});
