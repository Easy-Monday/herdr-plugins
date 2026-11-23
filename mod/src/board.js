// What GitHub's board answers mean, as plain functions: no Herdr, no drawing.

// The repo's open linked boards: the one to show, none, or more than one.
export function pickProject(response) {
  const open = (response?.data?.repository?.projectsV2?.nodes ?? []).filter((p) => p && !p.closed);
  if (open.length === 1) return { kind: "one", project: open[0] };
  return open.length ? { kind: "many", names: open.map((p) => p.title) } : { kind: "none" };
}
