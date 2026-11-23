// What GitHub's board answers mean, as plain functions: no Herdr, no drawing.

// The repo's open linked boards: the one to show, none, or more than one.
export function pickProject(response) {
  const open = (response?.data?.repository?.projectsV2?.nodes ?? []).filter((p) => p && !p.closed);
  if (open.length === 1) return { kind: "one", project: open[0] };
  return open.length ? { kind: "many", names: open.map((p) => p.title) } : { kind: "none" };
}

// Item pages, in board order, as rows: issues, pull requests and draft issues alike.
export function parseItems(pages) {
  return pages
    .flatMap((page) => page?.data?.node?.items?.nodes ?? [])
    .filter((n) => n?.content)
    .map((n) => {
      const c = n.content;
      return {
        key: c.id ?? n.id,
        type: c.__typename,
        number: c.number ?? null,
        title: c.title,
        state: c.state ?? "OPEN",
        stateReason: c.stateReason ?? null,
        isDraft: Boolean(c.isDraft),
        status: n.status?.name ? { name: n.status.name, color: n.status.color ?? null } : null,
        summary: c.subIssuesSummary ?? null,
        subIssues: c.subIssues?.nodes ?? [],
      };
    });
}

// Closed over all sub-issues, in whole percent; null without sub-issues.
export const progress = (summary) => (summary?.total ? Math.round((summary.completed / summary.total) * 100) : null);
