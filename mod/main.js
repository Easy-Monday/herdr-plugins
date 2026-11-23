// Project Board: a read-only panel showing the GitHub project board of the active tab's repo.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, spaces, panes, checking, props } from "herdr";
import { mock } from "./src/mock.js";
import { detectRepo } from "./src/git.js";
import { loadProjects, loadItems } from "./src/load.js";
import { pickProject, parseItems, buildTree, visibleRows, progress } from "./src/board.js";
import { classifyError } from "./src/errors.js";
import {
  TEXT,
  Busy,
  Button,
  Chevron,
  Header,
  Icon,
  IconButton,
  IssueNumber,
  Notice,
  Panel,
  Progress,
  StatusPill,
  TextButton,
} from "./ui.js";

const CONTEXT_POLL_MS = 1000;
// shortcut: fixed at 60 s; story #8 reads the interval from the mod setting (60 s minimum).
const REFRESH_MS = 60000;

// localStorage can be missing (tests) or refuse; the toggle then just isn't remembered.
const stored = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

// The active tab's focused terminal folder; a tab without one keeps the space's last
// (Branch PR's activeSpace(), munza/herdr-mods, Apache-2.0).
function activeSpace(lastFolder) {
  const sp = spaces().find((s) => s.active);
  if (!sp) return null;
  const tab = sp.tabs?.find((t) => t.active)?.id;
  const candidates = panes().filter((p) => p.tab === tab && p.cwd);
  const current = candidates.find((p) => p.focused) ?? candidates[0];
  if (current) lastFolder.set(sp.id, current.cwd);
  return { id: sp.id, machine: sp.machine ?? null, folder: lastFolder.get(sp.id) ?? sp.folder };
}

// [icon, colour, label] for an item's kind and state, as GitHub draws them.
function stateIcon(node, t) {
  if (node.type === "DraftIssue") return ["draft", t.dim, "Draft issue"];
  if (node.type === "PullRequest") {
    if (node.state === "MERGED") return ["pull-request-merged", t.ansi5, "Merged"];
    if (node.state === "CLOSED") return ["pull-request-closed", t.ansi1, "Closed"];
    return node.isDraft
      ? ["pull-request-draft", t.dim, "Draft pull request"]
      : ["pull-request", t.ansi2, "Open"];
  }
  if (node.state === "CLOSED")
    return node.stateReason === "NOT_PLANNED"
      ? ["issue-skipped", t.dim, "Closed as not planned"]
      : ["issue-closed", t.ansi5, "Closed"];
  return ["issue-open", t.ansi2, "Open"];
}

export default class ProjectBoard extends View {
  init(_props, cx) {
    const given = props() ?? {};
    this.lastFolder = new Map();
    this.expanded = new Set();
    // Prototype only: open in a given state, e.g. props {"scenario": "big", "expand": ["I_1"]}.
    if (mock?.scenarios && given.scenario) mock.choose(given.scenario);
    this.startExpanded = mock?.scenarios ? (given.expand ?? []) : [];
    this.showDone = stored("show-done") === "on";
    this.screen = { kind: "loading" };
    this.loading = true;
    this.token = 0;
    this.prototypeOpen = false;
    if (checking()) return;
    this.followFocus(cx);
    cx.timer.every(CONTEXT_POLL_MS, (cx) => this.followFocus(cx));
    cx.timer.every(REFRESH_MS, (cx) => {
      if (!this.loading) this.load(cx);
    });
  }

  // Switching tab, space or pane, or `cd` in the terminal, shows that folder's board.
  followFocus(cx) {
    const sp = activeSpace(this.lastFolder);
    const key = sp ? `${sp.machine ?? "local"}:${sp.folder}` : "";
    if (key === this.key) return;
    this.key = key;
    this.sp = sp;
    this.screen = { kind: "loading" };
    this.expanded = new Set(this.startExpanded);
    this.load(cx);
  }

  load(cx) {
    const token = ++this.token;
    const sp = this.sp;
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      let screen;
      let repo = null;
      try {
        const found = sp?.folder ? await detectRepo(sp) : { kind: "not-git" };
        if (found.kind !== "repo") screen = found;
        else {
          repo = found.repo;
          const pick = pickProject(await loadProjects(repo));
          if (pick.kind === "none") screen = { kind: "no-board", repo };
          else if (pick.kind === "many") screen = { kind: "many-boards", repo, names: pick.names };
          else {
            const items = parseItems(await loadItems(pick.project.id));
            screen = { kind: "board", repo, title: pick.project.title, tree: buildTree(items) };
          }
        }
      } catch (e) {
        screen = { kind: classifyError(e), repo, message: e.message };
      }
      if (token !== this.token) return;
      this.screen = { ...screen, folder: sp?.folder ?? null };
      this.loading = false;
      cx.notify();
    });
  }

  toggle(key, cx) {
    if (!this.expanded.delete(key)) this.expanded.add(key);
    cx.notify();
  }

  toggleDone(cx) {
    this.showDone = !this.showDone;
    store("show-done", this.showDone ? "on" : "off");
    cx.notify();
  }

  render() {
    const root = Panel("project-board").child(this.header(this.screen)).child(this.body(this.screen));
    return mock?.scenarios ? root.child(this.prototypeBar()) : root;
  }

  header(s) {
    const actions = [];
    if (s.kind === "board")
      actions.push(
        TextButton({
          id: "show-done",
          icon: this.showDone ? "check" : null,
          label: "Show done",
          active: this.showDone,
          onClick: (cx) => this.toggleDone(cx),
        }),
      );
    actions.push(
      IconButton({
        id: "refresh",
        icon: "refresh",
        label: "Refresh board",
        spinning: this.loading,
        onClick: (cx) => this.load(cx),
      }),
    );
    return Header({
      title: s.kind === "board" ? s.title : "Project Board",
      subtitle: s.repo ?? (s.kind === "loading" ? null : s.folder),
      actions,
    });
  }

  tryAgain() {
    return Button({ id: "try-again", label: "Try again", primary: true, onClick: (cx) => this.load(cx) });
  }

  body(s) {
    switch (s.kind) {
      case "loading":
        return Busy("Loading the board…");
      case "not-git":
        return Notice({
          id: "not-git",
          icon: "folder",
          title: "Not a git repo",
          detail: "The panel follows the focused terminal. cd into a repo, or switch to a tab in one.",
        });
      case "no-remote":
        return Notice({
          id: "no-remote",
          icon: "folder",
          title: "No GitHub remote",
          detail: "This repo has no remote on github.com, so it has no board to show.",
        });
      case "no-board":
        return Notice({
          id: "no-board",
          icon: "board",
          title: `No project board is linked to ${s.repo}.`,
          detail: "Link a board to the repo on GitHub, then refresh.",
        });
      case "many-boards":
        return Notice({
          id: "many-boards",
          icon: "board",
          title: "Only one linked board is supported",
          detail: `${s.repo} has ${s.names.length} open boards linked:`,
          list: s.names,
        });
      case "gh-missing":
        return Notice({
          id: "gh-missing",
          icon: "terminal",
          title: "The GitHub CLI is needed",
          detail: "The panel reads the board through gh. Install it, log in, then try again.",
          buttons: [
            Button({ id: "get-gh", label: "Get GitHub CLI", onClick: (cx) => cx.open_url("https://cli.github.com") }),
            this.tryAgain(),
          ],
        });
      case "gh-logged-out":
        return Notice({
          id: "gh-logged-out",
          icon: "terminal",
          title: "gh isn't logged in",
          detail: "The panel reads the board through gh. Log in with the project scope in a terminal, then try again.",
          command: "gh auth login -s project",
          buttons: [this.tryAgain()],
        });
      case "gh-scope":
        return Notice({
          id: "gh-scope",
          icon: "terminal",
          title: "gh can't read project boards",
          detail: "gh is logged in, but its login lacks the project scope. Add it in a terminal, then try again.",
          command: "gh auth refresh -s project",
          buttons: [this.tryAgain()],
        });
      case "api-error":
        return Notice({
          id: "api-error",
          icon: "alert",
          title: "The board didn't load",
          detail: s.message,
          buttons: [this.tryAgain()],
        });
      default:
        return this.list(s);
    }
  }

  list(s) {
    const rows = visibleRows(s.tree, { showDone: this.showDone, expanded: this.expanded });
    if (!rows.length)
      return Notice({
        id: "board-empty",
        icon: "board",
        title: s.tree.length ? "Everything on this board is done" : "This board has no items yet",
        detail: s.tree.length ? "Turn on Show done to see finished items." : null,
      });
    return v_flex()
      .id("board-list")
      .flex_1()
      .min_h(0)
      .overflow_y_scrollbar()
      .px(6)
      .py(4)
      .children(rows.map((row) => this.row(row)));
  }

  // Top level: title line, then Status and progress under it. Sub-issues: one line, Status last.
  row({ node, depth }) {
    const t = theme();
    const [icon, color, label] = stateIcon(node, t);
    const titleLine = h_flex()
      .gap(6)
      .items_center()
      .child(
        Chevron({
          id: `chevron-${node.key}`,
          open: this.expanded.has(node.key),
          onClick: node.children.length ? (cx) => this.toggle(node.key, cx) : null,
        }),
      )
      .child(Icon(icon, 15).text_color(color).accessibility_label(label))
      .child(div().flex_1().min_w(0).truncate().child(node.title))
      .when(node.number != null, (el) => el.child(IssueNumber(node.number)));
    if (depth)
      return h_flex()
        .id(`row-${node.key}`)
        .flex_none()
        .h(28)
        .pl(depth * 20)
        .pr(4)
        .gap(6)
        .items_center()
        .child(titleLine.flex_1().min_w(0))
        .when(Boolean(node.status), (el) => el.child(StatusPill(node.status)));
    const percent = progress(node.summary);
    return v_flex()
      .id(`row-${node.key}`)
      .flex_none()
      .px(4)
      .py(5)
      .gap(3)
      .child(titleLine)
      .when(Boolean(node.status) || percent !== null, (el) =>
        el.child(
          h_flex()
            .pl(45)
            .min_w(0)
            .overflow_hidden()
            .gap(10)
            .items_center()
            .when(Boolean(node.status), (row) => row.child(StatusPill(node.status)))
            .when(percent !== null, (row) => row.child(Progress(percent))),
        ),
      );
  }

  // Prototype installs only: pick the state to look at.
  prototypeBar() {
    const t = theme();
    const current = mock.scenarios.find((s) => s.id === mock.scenario());
    return v_flex()
      .id("prototype")
      .flex_none()
      .px(12)
      .py(6)
      .gap(6)
      .border_t(1)
      .border_color(t.border)
      .child(
        h_flex()
          .id("prototype-toggle")
          .gap(6)
          .items_center()
          .text_size(TEXT.caption)
          .text_color(t.dim)
          .cursor_pointer()
          .hover((s) => s.text_color(t.foreground))
          .on_click((_e, cx) => {
            this.prototypeOpen = !this.prototypeOpen;
            cx.notify();
          })
          .child(Icon(this.prototypeOpen ? "chevron-down" : "chevron-right", 11))
          .child("Prototype state")
          .child(div().text_color(t.foreground).child(current?.label ?? "")),
      )
      .when(this.prototypeOpen, (el) =>
        el.child(
          h_flex()
            .flex_wrap()
            .gap(4)
            .children(
              mock.scenarios.map((s) =>
                TextButton({
                  id: `scenario-${s.id}`,
                  label: s.label,
                  active: s.id === current?.id,
                  onClick: (cx) => {
                    mock.choose(s.id);
                    this.screen = { kind: "loading" };
                    this.expanded.clear();
                    this.load(cx);
                  },
                }),
              ),
            ),
        ),
      );
  }
}
