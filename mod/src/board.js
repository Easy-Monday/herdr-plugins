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
        // The board item's number: a draft issue has no page of its own, only the board's item pane.
        itemId: n.fullDatabaseId ?? null,
        state: c.state ?? "OPEN",
        stateReason: c.stateReason ?? null,
        isDraft: Boolean(c.isDraft),
        status: n.status?.name ? { name: n.status.name, color: n.status.color ?? null } : null,
        summary: c.subIssuesSummary ?? null,
        // GitHub sends null for a sub-issue the login can't see (e.g. in a private repo).
        subIssues: (c.subIssues?.nodes ?? []).filter(Boolean),
      };
    });
}

// Rows as a tree: each row plus `children`, its sub-issues at any depth. A sub-issue on the board
// is its board row (Status, own sub-issues); one off the board has no Status and no children.
// Board items that are another item's sub-issue show only under it.
export function buildTree(items) {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const nested = new Set(items.flatMap((i) => i.subIssues.map((s) => s.id)));
  const offBoard = (s) => ({
    key: s.id,
    type: "Issue",
    number: s.number,
    title: s.title,
    url: s.url ?? null,
    state: s.state ?? "OPEN",
    stateReason: s.stateReason ?? null,
    isDraft: false,
    status: null,
    summary: s.subIssuesSummary ?? null,
    subIssues: [],
  });
  const seen = new Set();
  // `path` holds the ancestors: a sub-issue pointing back up is left out, so a loop can't recurse forever.
  const node = (item, above) => {
    seen.add(item.key);
    const path = new Set(above).add(item.key);
    const kids = item.subIssues.filter((s) => !path.has(s.id));
    return { ...item, children: kids.map((s) => node(byKey.get(s.id) ?? offBoard(s), path)) };
  };
  const tree = items.filter((i) => !nested.has(i.key)).map((i) => node(i, []));
  // Items in a loop have no top item; show them at top level rather than lose them.
  for (const i of items) if (!seen.has(i.key)) tree.push(node(i, []));
  return tree;
}

// The rows on screen, depth first: Done top-level items only with showDone (a Done parent hides its
// open sub-issues too, BRD §12); the children of expanded rows always, Done or not.
export function visibleRows(tree, { showDone, expanded }) {
  const rows = [];
  const add = (node, depth) => {
    rows.push({ node, depth });
    if (expanded.has(node.key)) for (const child of node.children) add(child, depth + 1);
  };
  for (const node of tree) if (showDone || node.status?.name !== "Done") add(node, 0);
  return rows;
}

// Closed over all sub-issues, in whole percent; null without sub-issues.
export const progress = (summary) => (summary?.total ? Math.round((summary.completed / summary.total) * 100) : null);
