// GitHub's answers to the board items query, in the shape of the epic #1 prototype's query
// (cac901d, mod/src/load.js): `node(id){... on ProjectV2{items(first:100,after){pageInfo nodes}}}`,
// each item with `status` (the Status field's single-select value: name and option colour)
// and `content` (an Issue, PullRequest or DraftIssue). Plain data, no Herdr: unit and e2e use it.

const NO_SUB_ISSUES = { total: 0, completed: 0, percentCompleted: 0 };

// `subIssues`: the issue's sub-issues as `subIssue(...)` nodes (story #6), none by default.
export const issue = ({ id, number, title, state = "OPEN", stateReason = null, status = null, summary = NO_SUB_ISSUES, subIssues = [] }) => ({
  id: `PVTI_${id}`,
  status,
  content: { __typename: "Issue", id, number, title, state, stateReason, subIssuesSummary: summary, subIssues: { nodes: subIssues } },
});

// One node of an issue's `subIssues` list, in the prototype's shape (cac901d, mod/src/load.js `SUB`):
// the sub-issue itself, with no Status (a board field) and no sub-issue list of its own.
export const subIssue = ({ id, number, title, state = "OPEN", stateReason = null, summary = NO_SUB_ISSUES }) => ({
  id,
  number,
  title,
  state,
  stateReason,
  subIssuesSummary: summary,
});

// `url`: the pull request's GitHub page (story #11), left out of the answer when not given.
export const pullRequest = ({ id, number, title, url, state = "OPEN", isDraft = false, status = null }) => ({
  id: `PVTI_${id}`,
  status,
  content: { __typename: "PullRequest", id, number, title, url, state, isDraft },
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
