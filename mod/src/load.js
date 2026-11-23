// Reading the board through gh: GraphQL queries only, never mutations (BRD §5.1).
import { gh } from "./gh.js";

// shortcut: the first 20 linked boards only; more than one already means "only one is supported".
const PROJECTS = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){projectsV2(first:20){nodes{id number title closed}}}}`;

async function graphql(query, vars) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(vars)) args.push("-f", `${key}=${value}`);
  const result = await gh(args);
  if (result.code !== 0) throw new Error((result.stderr || result.stdout).trim() || `gh exited with ${result.code}`);
  const json = JSON.parse(result.stdout);
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json;
}

export function loadProjects(repo) {
  const [owner, name] = repo.split("/");
  return graphql(PROJECTS, { owner, name });
}
