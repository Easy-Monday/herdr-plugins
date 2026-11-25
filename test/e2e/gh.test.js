import { test } from "node:test";
import assert from "node:assert/strict";
import { herdrStub } from "../support/harness.js";
import { gh } from "../../mods/project-board/src/gh.js";

test("should send gh calls to the real gh when no mock is installed", async () => {
  herdrStub.exec = (command, args) => ({ code: 0, stdout: `${command} ${args.join(" ")}`, stderr: "" });
  const result = await gh(["api", "graphql"]);
  assert.equal(result.stdout, "gh api graphql");
});
