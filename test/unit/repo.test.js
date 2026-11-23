// Story #2: the repo of the active tab (pure parts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRemoteUrl, pickRemote } from "../../mod/src/repo.js";

test("T-1: should turn https, ssh and scp-style GitHub remote URLs into owner/repo, and return null for non-GitHub URLs", () => {
  assert.equal(parseRemoteUrl("https://github.com/acme/web.git"), "acme/web");
  assert.equal(parseRemoteUrl("https://github.com/acme/web"), "acme/web");
  assert.equal(parseRemoteUrl("ssh://git@github.com/acme/web.git"), "acme/web");
  assert.equal(parseRemoteUrl("git@github.com:acme/web.git"), "acme/web");
  assert.equal(parseRemoteUrl("git@github.com:acme/my.repo-2"), "acme/my.repo-2");

  assert.equal(parseRemoteUrl("https://gitlab.com/acme/web.git"), null);
  assert.equal(parseRemoteUrl("git@gitlab.com:acme/web.git"), null);
  assert.equal(parseRemoteUrl("https://notgithub.com/acme/web.git"), null);
  assert.equal(parseRemoteUrl("https://github.com.example.org/acme/web.git"), null);
  assert.equal(parseRemoteUrl("/srv/git/web.git"), null);
});

// remotes: the names `git remote` lists; trackingRemote: the current branch's remote, or null.
test("T-2: should pick upstream over the tracking remote over origin", () => {
  assert.equal(pickRemote(["origin", "fork", "upstream"], "fork"), "upstream");
  assert.equal(pickRemote(["origin", "fork"], "fork"), "fork");
  assert.equal(pickRemote(["origin", "fork"], null), "origin");
  // A tracking remote that isn't listed (e.g. "." for a local branch) doesn't count.
  assert.equal(pickRemote(["origin", "fork"], "."), "origin");
});
