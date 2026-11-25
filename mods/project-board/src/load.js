// Reading the board through gh: GraphQL queries only, never mutations (BRD §5.1).
import { gh } from "./gh.js";

const PROJECTS = `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){projectsV2(first:100,after:$after){nodes{id number title url closed}pageInfo{hasNextPage endCursor}}}}`;
// The epic #1 prototype's items query (epic/1-prototype, cac901d).
const SUB = `id number title url state stateReason subIssuesSummary{total completed percentCompleted}`;
const ITEMS = `query($id:ID!,$after:String){node(id:$id){... on ProjectV2{items(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{id fullDatabaseId status:fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name color}} content{__typename ... on Issue{${SUB} subIssues(first:100){nodes{${SUB}}}} ... on PullRequest{id number title url state isDraft} ... on DraftIssue{id title}}}}}}}`;

// `keepPartial`: return a FORBIDDEN-only partial answer instead of throwing (loadIssue only, story #17).
async function graphql(query, vars, keepPartial = false) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(vars)) if (value != null) args.push("-f", `${key}=${value}`);
  const result = await gh(args);
  let json;
  try {
    json = JSON.parse(result.stdout);
  } catch (err) {
    if (result.code === 0) throw err;
  }
  if (keepPartial && partial(json)) return json;
  if (result.code !== 0) throw new Error((result.stderr || result.stdout).trim() || `gh exited with ${result.code}`);
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json;
}

// An issue also on a board this login can't read: GitHub sends the data, null where that board's
// fields would be, and FORBIDDEN errors for them (gh exits 1). The parsers skip those nulls, so keep it.
// Anything else (an error on a root field, a null root, any other error type) is a failed read.
function partial(json) {
  const { data, errors } = json ?? {};
  return Boolean(data) && Object.values(data).every((v) => v != null) &&
    errors?.length > 0 && errors.every((e) => e.type === "FORBIDDEN" && e.path?.length > 1);
}

// Every page of a connection. `pick` finds the connection in a response. Stops when GitHub's
// cursor is missing or doesn't advance, so a bad answer can't loop forever (no count cap: that drops items).
async function pages(query, vars, pick) {
  const all = [];
  let after;
  for (;;) {
    const json = await graphql(query, { ...vars, after });
    all.push(json);
    const page = pick(json);
    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor || page.pageInfo.endCursor === after) break;
    after = page.pageInfo.endCursor;
  }
  return all;
}

// Every linked board, page by page: closed boards fill pages too, so one page can miss the open one.
export async function loadProjects(repo) {
  const [owner, name] = repo.split("/");
  const all = await pages(PROJECTS, { owner, name }, (json) => json.data?.repository?.projectsV2);
  const nodes = all.flatMap((json) => json.data?.repository?.projectsV2?.nodes ?? []);
  return { data: { repository: { projectsV2: { nodes } } } };
}

// One issue's header, body and sub-issues, each with its Status on every board (parseIssue picks this board's).
// shortcut: the first 20 boards an issue or sub-issue is on; page projectItems if issues sit on more.
// shortcut: the latest 100 comments and 100 Status changes; page back if issues get longer threads.
// From the approved epic #10 prototype (a28afdf).
const STATUS = `projectItems(first:20){nodes{project{id} status:fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name color}}}}`;
const ISSUE = `query($id:ID!){node(id:$id){... on Issue{id number title url state stateReason body issueType{name} ${STATUS} subIssues(first:100){nodes{id number title url state stateReason ${STATUS}}} comments(last:100){nodes{id author{login} createdAt body}} timelineItems(last:100,itemTypes:[PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]){nodes{... on ProjectV2ItemStatusChangedEvent{id createdAt previousStatus status project{id}}}}}}}`;

export const loadIssue = (id) => graphql(ISSUE, { id }, true);

// Every page of the board's items, 100 at a time, as gh's responses (parseItems reads them).
export const loadItems = (id) => pages(ITEMS, { id }, (json) => json.data?.node?.items);
