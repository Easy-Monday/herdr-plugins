// Story #4: what a failed gh call means (pure parts). Messages are what gh and Herdr's exec give.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyError } from "../../mods/project-board/src/errors.js";

test("T-1: should classify an exec ENOENT for gh as `gh-missing`", () => {
  // Herdr's exec rejects when the program can't start (herdr.d.ts `exec`).
  assert.equal(classifyError(new Error("gh: No such file or directory (os error 2)")), "gh-missing");
  assert.equal(classifyError(Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" })), "gh-missing");
});

test("T-2: should classify a gh not-logged-in error as `gh-logged-out`", () => {
  const stderr =
    "To get started with GitHub CLI, please run:  gh auth login\n" +
    "Alternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.";
  assert.equal(classifyError(new Error(stderr)), "gh-logged-out");
});

test("T-5: should classify a missing-scope GraphQL error as `gh-scope`", () => {
  // gh's hint names `gh auth refresh`, so it must not read as logged out.
  const stderr =
    "gh: Your token has not been granted the required scopes to execute this query. The 'projectsV2' field " +
    "requires one of the following scopes: ['read:project'], but your token has only been granted the: " +
    "['gist', 'read:org', 'repo'] scopes. Please modify your token's scopes at: https://github.com/settings/tokens.\n" +
    'This API operation needs the "read:project" scope. To request it, run:  gh auth refresh -h github.com -s read:project';
  assert.equal(classifyError(new Error(stderr)), "gh-scope");
});
