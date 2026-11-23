// Story #7: "Show done" in the header, remembered across reloads, and the empty-board notice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { herdrStub, mount, settle, tick, text, walk, cx } from "../support/harness.js";
import { issue, itemsPage } from "../support/items.js";

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const fail = (code, stderr = "") => ({ code, stdout: "", stderr });
const id = () => randomUUID().slice(0, 8);
const DONE = { name: "Done", color: "PURPLE" };
const MOVING = { name: "In Progress", color: "YELLOW" };

// Herdr gives each mod copy its own localStorage; Node has none, so each test gets a fresh one
// in memory. It outlives the views a test mounts, as Herdr's does across a reload.
function freshStorage() {
  const data = new Map();
  const storage = {
    getItem: (k) => (data.has(String(k)) ? data.get(String(k)) : null),
    setItem: (k, v) => void data.set(String(k), String(v)),
    removeItem: (k) => void data.delete(String(k)),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
    flush: async () => {},
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
}

// A folder whose origin is github.com/<repo>, with one linked board holding `nodes` (one page).
function world(s, nodes) {
  const folder = `/w/${s}`;
  const repo = `own-${s}/web-${s}`;
  const project = { id: `PVT_${s}`, number: 11, title: `Board ${s}`, closed: false };
  herdrStub.exec = (command, args, options = {}) => {
    if (command === "gh") {
      const asked = args.join(" ");
      if (args[0] !== "api" || args[1] !== "graphql") return fail(1, `unexpected gh ${asked}`);
      if (/projectsV2/.test(asked))
        return ok(JSON.stringify({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: false, endCursor: null } } } } }));
      if (args.includes(`id=${project.id}`)) return ok(JSON.stringify(itemsPage(nodes)));
      return fail(1, `unexpected gh ${asked}`);
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
  return project;
}

// Opens the panel (a new copy of the View, as on a reload) once the board has loaded.
async function open() {
  const { render } = await mount();
  await tick();
  await settle();
  return render;
}

// Clicks the header's "Show done" control, found by its text or label.
async function clickShowDone(tree) {
  const found = [];
  walk(tree, (n) => {
    if (n.handlers.on_click && (text(n).trim() === "Show done" || n.props.accessibility_label === "Show done")) found.push(n);
  });
  assert.ok(found.length, `no clickable "Show done" in: ${text(tree)}`);
  await found.at(-1).handlers.on_click({}, cx);
  await settle();
}

test("T-3: should keep Show done on after the mod reloads", async () => {
  freshStorage();
  const s = id();
  const moving = `Moving ${s}`;
  const finished = `Finished ${s}`;
  world(s, [
    issue({ id: `I_m${s}`, number: 1, title: moving, status: MOVING }),
    issue({ id: `I_f${s}`, number: 2, title: finished, state: "CLOSED", status: DONE }),
  ]);

  let render = await open();
  assert.ok(text(render()).includes(moving), "the moving item shows");
  assert.ok(!text(render()).includes(finished), "a Done item is hidden by default");

  await clickShowDone(render());
  assert.ok(text(render()).includes(finished), "Show done shows the Done item");

  // Reload: a new copy of the View, same mod copy (same localStorage).
  render = await open();
  assert.ok(text(render()).includes(moving), "after reload the moving item shows");
  assert.ok(text(render()).includes(finished), "after reload Show done is still on: the Done item shows");

  // Still on, not just still showing: one more click turns it off.
  await clickShowDone(render());
  assert.ok(!text(render()).includes(finished), "clicking Show done again hides the Done item");
});

test("T-4: should show the empty-board notice for a stubbed board with no items, and a notice (not an empty list) when every item is Done and Show done is off", async () => {
  // A board with no items at all.
  freshStorage();
  world(id(), []);
  let screen = text((await open())());
  assert.ok(screen.includes("This board has no items yet"), `no empty-board notice in: ${screen}`);

  // Every item Done, Show done off (the default): a notice, as in the approved prototype.
  freshStorage();
  const s = id();
  const titles = [`Shipped ${s}`, `Released ${s}`];
  world(s, titles.map((title, i) => issue({ id: `I_${i}${s}`, number: i + 1, title, state: "CLOSED", status: DONE })));
  screen = text((await open())());
  assert.ok(screen.includes("Everything on this board is done"), `no all-done notice in: ${screen}`);
  for (const t of titles) assert.ok(!screen.includes(t), `Done item "${t}" shows with Show done off`);
});
