// GitHub's answers to the board items query, in the shape of the epic #1 prototype's query
// (cac901d, mod/src/load.js): `node(id){... on ProjectV2{items(first:100,after){pageInfo nodes}}}`,
// each item with `status` (the Status field's single-select value: name and option colour)
// and `content` (an Issue, PullRequest or DraftIssue). Plain data, no Herdr: unit and e2e use it.

const NO_SUB_ISSUES = { total: 0, completed: 0, percentCompleted: 0 };

export const issue = ({ id, number, title, state = "OPEN", stateReason = null, status = null, summary = NO_SUB_ISSUES }) => ({
  id: `PVTI_${id}`,
  status,
  content: { __typename: "Issue", id, number, title, state, stateReason, subIssuesSummary: summary, subIssues: { nodes: [] } },
});

export const pullRequest = ({ id, number, title, state = "OPEN", isDraft = false, status = null }) => ({
  id: `PVTI_${id}`,
  status,
  content: { __typename: "PullRequest", id, number, title, state, isDraft },
});

export const draftIssue = ({ id, title, status = null }) => ({
  id: `PVTI_${id}`,
  status,
  content: { __typename: "DraftIssue", id, title },
});

// One `gh api graphql` JSON response: a page of the board's items.
export const itemsPage = (nodes, { hasNextPage = false, endCursor = null } = {}) => ({
  data: { node: { items: { pageInfo: { hasNextPage, endCursor }, nodes } } },
});
