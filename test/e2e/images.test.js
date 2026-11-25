// Story #15: an Open image link opens its image URL in the system browser (epic #10 prototype
// a28afdf: mods/project-board/ui.js `Markdown` `on_link_click` → cx.open_url; mods/project-board/src/images.js `imageLinks`).
// The harness doesn't draw, so the click is the markdown view's link handler with the URL of the
// link labelled "Open image: …" in that view's markdown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text, walk, cx, opened } from "../support/harness.js";
import { issue, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);

const vars = (args) => Object.fromEntries(args.filter((a) => /^\w+=/.test(a) && !a.startsWith("query=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const query = (args) => (args.find((a) => a.startsWith("query=")) ?? "").slice("query=".length);

// A folder whose origin is github.com/<repo>, linked to one board whose items are `nodes`;
// `issues` answers the issue query by id.
function world(s, nodes, issues) {
  const folder = `/w/${s}`;
  const repo = `own-${s}/web-${s}`;
  const project = { id: `PVT_${s}`, number: 11, title: `Board ${s}`, url: `https://github.com/orgs/own-${s}/projects/11`, closed: false };
  const byId = new Map(issues.map((i) => [i.id, i]));
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      if (args[0] !== "api" || args[1] !== "graphql") return fail(1, `unexpected gh ${args.join(" ")}`);
      const q = query(args);
      if (/projectsV2/.test(q)) return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } } } } }));
      const { id: nodeId } = vars(args);
      if (nodeId === project.id) return ok(JSON.stringify(itemsPage(nodes)));
      if (byId.has(nodeId)) return ok(JSON.stringify({ data: { node: byId.get(nodeId) } }));
      return fail(1, `unexpected gh ${args.join(" ")}`);
    }
    if (command !== "git" || options.cwd !== folder) return fail(128, "fatal: not a git repository");
    const [verb, ...rest] = args;
    if (verb === "remote" && rest.length === 0) return ok("origin\n");
    if (verb === "remote" && rest[0] === "get-url") return ok(`git@github.com:${repo}.git\n`);
    if (verb === "symbolic-ref") return ok("main\n");
    if (verb === "config") return ok("origin\n");
    return fail(1, `unexpected git ${args.join(" ")}`);
  };
  herdrStub.spaces = [{ id: `s-${id()}`, folder: "/home/test", machine: null, active: true, tabs: [{ id: "t1", active: true }] }];
  herdrStub.panes = [{ pane: `p-${id()}`, terminal: `term-${id()}`, tab: "t1", cwd: folder, focused: true }];
}

const nodes = (tree, match) => {
  const found = [];
  walk(tree, (n) => { if (match(n)) found.push(n); });
  return found;
};

// Clicks the row titled `title`: the innermost clickable element holding that title.
async function clickRow(render, title) {
  const rows = nodes(render(), (n) => n.handlers.on_click && text(n).includes(title));
  assert.ok(rows.length, `no clickable row "${title}" in: ${text(render())}`);
  await rows.at(-1).handlers.on_click({}, cx);
  await settle();
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Clicks the link labelled `label` inside the markdown view holding `marker`: finds its target in
// the view's markdown and hands it to the view's link handler, as Herdr does on a real click.
function clickLink(render, marker, label) {
  const views = nodes(render(), (n) => n.kind === "markdown" && text(n).includes(marker));
  assert.equal(views.length, 1, `no markdown view holding "${marker}" in: ${text(render())}`);
  const md = text(views[0]);
  const link = md.match(new RegExp(`\\[${escape(label)}\\]\\(([^)\\s]+)\\)`));
  assert.ok(link, `no "${label}" link in: ${md}`);
  assert.ok(views[0].handlers.on_link_click, "the markdown view has no link handler");
  views[0].handlers.on_link_click(link[1], cx);
  return link[1];
}

test("T-2: should open the stubbed image URL in the system browser on click", async () => {
  const s = id();
  const title = `Shots ${s}`;
  const repo = `own-${s}/web-${s}`;
  // Sha-pinned raw URLs: a markdown image with alt text in the body, an <img> without alt in a comment.
  const bodyUrl = `https://github.com/${repo}/blob/2c4d8e0${s}/docs/screenshots/15/header-${s}.png?raw=true`;
  const commentUrl = `https://github.com/${repo}/blob/5b7e0c2${s}/docs/screenshots/15/link-${s}.png?raw=true`;
  world(s, [issue({ id: `I_1${s}`, number: 1, title })], [
    {
      id: `I_1${s}`, number: 1, title, url: `https://github.com/${repo}/issues/1`, state: "OPEN", stateReason: null,
      body: `Body ${s}\n\n![Header ${s}](${bodyUrl})\n`, issueType: null, projectItems: { nodes: [] }, subIssues: { nodes: [] },
      comments: { nodes: [{ id: `IC_1${s}`, author: { login: `dev-${s}` }, createdAt: new Date().toISOString(), body: `Shot ${s}\n\n<img src="${commentUrl}" width="300" />` }] },
      timelineItems: { nodes: [] },
    },
  ]);
  const { render } = await mount();
  await tick();
  await settle();
  await clickRow(render, title);

  const before = opened.length;
  assert.equal(clickLink(render, `Body ${s}`, `Open image: Header ${s}`), bodyUrl);
  assert.deepEqual(opened.slice(before), [bodyUrl]);

  assert.equal(clickLink(render, `Shot ${s}`, `Open image: link-${s}.png`), commentUrl);
  assert.deepEqual(opened.slice(before), [bodyUrl, commentUrl]);
});
