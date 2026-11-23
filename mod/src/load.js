// Reading the board through gh: GraphQL queries only, never mutations (BRD §5.1).
import { gh } from "./gh.js";

const PROJECTS = `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){projectsV2(first:100,after:$after){nodes{id number title closed}pageInfo{hasNextPage endCursor}}}}`;

async function graphql(query, vars) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(vars)) args.push("-f", `${key}=${value}`);
  const result = await gh(args);
  if (result.code !== 0) throw new Error((result.stderr || result.stdout).trim() || `gh exited with ${result.code}`);
  const json = JSON.parse(result.stdout);
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json;
}

// Every linked board, page by page: closed boards fill pages too, so one page can miss the open one.
export async function loadProjects(repo) {
  const [owner, name] = repo.split("/");
  const nodes = [];
  let after;
  for (;;) {
    const page = (await graphql(PROJECTS, after ? { owner, name, after } : { owner, name })).data?.repository?.projectsV2;
    nodes.push(...(page?.nodes ?? []));
    if (!page?.pageInfo?.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  return { data: { repository: { projectsV2: { nodes } } } };
}
