// Reading the board through gh: GraphQL queries only, never mutations (BRD §5.1).
import { gh } from "./gh.js";

const PROJECTS = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){projectsV2(first:20){nodes{id number title closed}}}}`;
const SUB = `id number title state stateReason subIssuesSummary{total completed percentCompleted}`;
const ITEMS = `query($id:ID!,$after:String){node(id:$id){... on ProjectV2{title items(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{id status:fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name color}} content{__typename ... on Issue{${SUB} subIssues(first:50){nodes{${SUB}}}} ... on PullRequest{id number title state isDraft} ... on DraftIssue{id title}}}}}}}`;

async function graphql(query, vars) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(vars)) if (value != null) args.push("-f", `${key}=${value}`);
  const result = await gh(args);
  if (result.code !== 0)
    throw new Error((result.stderr || result.stdout).trim() || `gh exited with ${result.code}`);
  const json = JSON.parse(result.stdout);
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json;
}

export function loadProjects(repo) {
  const [owner, name] = repo.split("/");
  return graphql(PROJECTS, { owner, name });
}

// Every page of the board's items, 100 at a time.
export async function loadItems(id) {
  const pages = [];
  let after = null;
  do {
    const page = await graphql(ITEMS, { id, after });
    pages.push(page);
    const info = page.data?.node?.items?.pageInfo;
    after = info?.hasNextPage ? info.endCursor : null;
  } while (after);
  return pages;
}
