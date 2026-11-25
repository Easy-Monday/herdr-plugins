// An issue's detail as GitHub's answer gives it, as a plain function: no Herdr, no drawing.
// Adapted from the approved epic #10 prototype (epic/10-prototype, a28afdf, mods/project-board/src/issue.js).
// Changed: the header, body (story #11), sub-issues (#12) and activity (#13).

// The issue's Status on this board; null when it isn't on it or has none.
function statusOn(projectItems, projectId) {
  const item = (projectItems?.nodes ?? []).find((n) => n?.project?.id === projectId);
  return item?.status?.name ? { name: item.status.name, color: item.status.color ?? null } : null;
}

export function parseIssue(response, projectId) {
  const i = response?.data?.node;
  if (!i?.id) throw new Error("GitHub returned no issue for this row.");
  return {
    key: i.id,
    type: "Issue",
    issueType: i.issueType?.name ?? null,
    number: i.number,
    title: i.title,
    url: i.url,
    state: i.state ?? "OPEN",
    stateReason: i.stateReason ?? null,
    status: statusOn(i.projectItems, projectId),
    body: i.body ?? "",
    subIssues: (i.subIssues?.nodes ?? []).filter(Boolean).map((s) => ({
      key: s.id,
      type: "Issue",
      number: s.number,
      title: s.title,
      url: s.url,
      state: s.state ?? "OPEN",
      stateReason: s.stateReason ?? null,
      status: statusOn(s.projectItems, projectId),
    })),
    comments: (i.comments?.nodes ?? []).filter(Boolean),
    // timelineItems holds only Status changes (load.js asks for no other type); keep this board's.
    events: (i.timelineItems?.nodes ?? []).filter((e) => e?.createdAt && e.project?.id === projectId),
  };
}
