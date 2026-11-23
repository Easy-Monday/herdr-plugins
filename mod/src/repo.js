// owner/repo from a GitHub remote URL (https, ssh or scp style); null for other hosts.
export function parseRemoteUrl(url) {
  const match = /github\.com[:/]+([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(String(url ?? "").trim());
  return match ? `${match[1]}/${match[2]}` : null;
}
