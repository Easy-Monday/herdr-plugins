// The repo of a folder, read-only git only. Prototype installs may answer git from mock/ fixtures.
import { exec } from "herdr";
import { mock } from "./mock.js";
import { parseRemoteUrl } from "./repo.js";

const git = (args, options) => (mock?.git ? mock.git(args, options) : exec("git", args, options));

// Branch PR's order: upstream, else the current branch's tracking remote, else origin.
export async function detectRepo(space) {
  const options = { cwd: space.folder, on: space.machine };
  const list = await git(["remote"], options);
  if (list.code !== 0) return { kind: "not-git" };
  const names = list.stdout.split(/\r?\n/).filter(Boolean);
  const branch = await git(["symbolic-ref", "--quiet", "--short", "HEAD"], options);
  const tracking =
    branch.code === 0
      ? (await git(["config", "--get", `branch.${branch.stdout.trim()}.remote`], options)).stdout.trim()
      : "";
  for (const name of ["upstream", tracking, "origin"]) {
    if (!names.includes(name)) continue;
    const url = await git(["remote", "get-url", name], options);
    const repo = url.code === 0 && parseRemoteUrl(url.stdout);
    if (repo) return { kind: "repo", repo };
  }
  return { kind: "no-remote" };
}
