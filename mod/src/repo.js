// Which repo the active tab is in: pure parts (no herdr import, so unit-testable).
// Adapted from Branch PR (munza/herdr-mods, Apache-2.0): parseRemoteUrl from
// github/model.js repositoryFromRemote(), pickRemote from github/discovery.js detectRepo(),
// activeSpace from main.js activeSpace(). Changed: null instead of throwing, the remote
// order as a pure function, and Herdr's spaces/panes passed in.

// owner/repo from a GitHub remote URL (https, ssh or scp style); null for any other host.
export function parseRemoteUrl(url) {
  const match =
    /^(?:(?:https?|git|ssh):\/\/(?:[^@/]+@)?([^/:]+)(?::[0-9]+)?\/|git@([^:/]+):)(.+?)(?:\.git)?\/?$/.exec(
      String(url ?? "").trim(),
    );
  let host = (match?.[1] ?? match?.[2] ?? "").toLowerCase();
  // SSH aliases such as github-work name the real host only in ~/.ssh/config.
  if (/^github(\.com)?-|^ssh\.github\.com$/.test(host)) host = "github.com";
  const segments = (match?.[3] ?? "").split("/");
  const valid =
    segments.length === 2 && segments.every((s) => /^[A-Za-z0-9_.-]+$/.test(s) && s !== "." && s !== "..");
  return host === "github.com" && valid ? segments.join("/") : null;
}

// upstream, else the current branch's tracking remote, else origin; null if none is listed.
export function pickRemote(remotes, trackingRemote) {
  return ["upstream", trackingRemote, "origin"].find((name) => name && remotes.includes(name)) ?? null;
}

// The active space, with the folder of its active tab's focused terminal. A tab without a
// terminal (a mod or diff tab) keeps that space's last folder, kept in `lastFolder` (id -> folder).
export function activeSpace(spaceList, paneList, lastFolder) {
  const sp = spaceList.find((s) => s.active);
  if (!sp) return null;
  const tab = sp.tabs?.find((t) => t.active)?.id;
  const candidates = paneList.filter((p) => p.tab === tab && p.cwd);
  const current = candidates.find((p) => p.focused) ?? candidates[0];
  if (current) lastFolder.set(sp.id, current.cwd);
  return { id: sp.id, machine: sp.machine ?? null, folder: lastFolder.get(sp.id) ?? sp.folder };
}
