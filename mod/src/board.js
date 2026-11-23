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
        url: c.url ?? null,
        itemId: n.databaseId ?? null,
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
export const progress = (summary) =>
  summary?.total ? Math.round((summary.completed / summary.total) * 100) : null;

// Items with their sub-issues as children, at any depth. A sub-issue on the board
// carries its Status and shows only under its parent.
export function buildTree(items) {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const nested = new Set(items.flatMap((i) => i.subIssues.map((s) => s.id)));
  const offBoard = (s) => ({
    key: s.id,
    type: "Issue",
    number: s.number,
    title: s.title,
    url: s.url ?? null,
    state: s.state,
    stateReason: s.stateReason ?? null,
    isDraft: false,
    status: null,
    summary: s.subIssuesSummary ?? null,
    subIssues: [],
  });
  // `above` holds the ancestors, so a sub-issue loop can't recurse forever.
  const node = (item, above) => ({
    ...item,
    children: above.has(item.key)
      ? []
      : item.subIssues.map((s) => node(byKey.get(s.id) ?? offBoard(s), new Set([...above, item.key]))),
  });
  return items.filter((i) => !nested.has(i.key)).map((i) => node(i, new Set()));
}

// The rows on screen: Done top-level items only with showDone; children of expanded rows always.
export function visibleRows(tree, { showDone, expanded }) {
  const rows = [];
  const add = (node, depth) => {
    rows.push({ node, depth });
    if (expanded.has(node.key)) for (const child of node.children) add(child, depth + 1);
  };
  for (const node of tree) if (showDone || node.status?.name !== "Done") add(node, 0);
  return rows;
}
