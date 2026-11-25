// The GitHub repo of a folder, with read-only git only, run on the space's machine.
// Adapted from Branch PR (munza/herdr-mods, Apache-2.0) github/discovery.js detectRepo()
// and discoverRemotes(). Changed: one function returning a screen state instead of throwing,
// and no saved remote choice (no pinning).
import { exec } from "herdr";
import { parseRemoteUrl, pickRemote } from "./repo.js";

export async function detectRepo(space) {
  const git = (args) => exec("git", args, { cwd: space.folder, on: space.machine });
  const list = await git(["remote"]);
  if (list.code !== 0) return { kind: "not-git" };
  const repos = new Map();
  for (const name of new Set(list.stdout.split(/\r?\n/).filter(Boolean))) {
    const url = await git(["remote", "get-url", name]);
    const repo = url.code === 0 ? parseRemoteUrl(url.stdout) : null;
    if (repo) repos.set(name, repo);
  }
  if (!repos.size) return { kind: "no-remote" };
  const branch = await git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const tracking =
    branch.code === 0 ? await git(["config", "--get", `branch.${branch.stdout.trim()}.remote`]) : null;
  const names = [...repos.keys()];
  // Branch PR falls back to any GitHub remote when none of the preferred ones is on GitHub.
  const name = pickRemote(names, tracking?.code === 0 ? tracking.stdout.trim() : null) ?? names[0];
  return { kind: "repo", repo: repos.get(name) };
}
