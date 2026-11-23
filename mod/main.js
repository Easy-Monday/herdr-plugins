// Project Board: a read-only panel showing the GitHub project board of the active tab's repo.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { theme, spaces, panes, checking, props } from "herdr";
import { activeSpace } from "./src/repo.js";
import { detectRepo } from "./src/git.js";
import { loadProjects, loadItems, loadIssue } from "./src/load.js";
import { parseIssue } from "./src/issue.js";
import { pickProject, parseItems, buildTree, visibleRows, progress } from "./src/board.js";
import { classifyError } from "./src/errors.js";
import { refreshSeconds } from "./src/settings.js";
import { Panel, Header, Notice, Busy, Button, IconButton, TextButton, Icon, IssueNumber, StatusPill, Progress, Chevron, Markdown, TypeTag, Message } from "./ui.js";

const CONTEXT_POLL_MS = 1000;

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

const NOTICES = {
  "not-git": () => ({
    icon: "folder",
    title: "Not a git repo",
    detail: "The panel follows the focused terminal. cd into a repo, or switch to a tab in one.",
  }),
  "no-remote": () => ({
    icon: "folder",
    title: "No GitHub remote",
    detail: "This repo has no remote on github.com, so it has no board to show.",
  }),
  "no-board": (s) => ({
    icon: "board",
    title: `No project board is linked to ${s.repo}.`,
    detail: "Link a board to the repo on GitHub, then refresh.",
  }),
  "many-boards": (s) => ({
    icon: "board",
    title: "Only one linked board is supported",
    detail: `${s.repo} has ${s.names.length} open boards linked:`,
    list: s.names,
  }),
  "git-error": (s, tryAgain) => ({
    icon: "folder",
    title: "Couldn't read this folder",
    detail: s.message,
    buttons: [tryAgain],
  }),
  // The gh errors classifyError tells apart, worded as in the approved epic #1 prototype (cac901d).
  "gh-missing": (_s, tryAgain) => ({
    icon: "terminal",
    title: "The GitHub CLI is needed",
    detail: "The panel reads the board through gh. Install it, log in, then try again.",
    buttons: [
      Button({ id: "get-gh", label: "Get GitHub CLI", onClick: (cx) => cx.open_url("https://cli.github.com") }),
      tryAgain,
    ],
  }),
  "gh-logged-out": (_s, tryAgain) => ({
    icon: "terminal",
    title: "gh isn't logged in",
    detail: "The panel reads the board through gh. Log in with the project scope in a terminal, then try again.",
    command: "gh auth login -s project",
    buttons: [tryAgain],
  }),
  "gh-scope": (_s, tryAgain) => ({
    icon: "terminal",
    title: "gh can't read project boards",
    detail: "gh is logged in, but its login lacks the project scope. Add it in a terminal, then try again.",
    command: "gh auth refresh -s project",
    buttons: [tryAgain],
  }),
  "api-error": (s, tryAgain) => ({ icon: "alert", title: "The board didn't load", detail: s.message, buttons: [tryAgain] }),
};

// [icon, colour, label] for an item's kind and state, as GitHub draws them (from the epic #1 prototype).
function stateIcon(row, t) {
  if (row.type === "DraftIssue") return ["draft", t.dim, "Draft issue"];
  if (row.type === "PullRequest") {
    if (row.state === "MERGED") return ["pull-request-merged", t.ansi5, "Merged"];
    if (row.state === "CLOSED") return ["pull-request-closed", t.ansi1, "Closed"];
    return row.isDraft ? ["pull-request-draft", t.dim, "Draft pull request"] : ["pull-request", t.ansi2, "Open"];
  }
  if (row.state === "CLOSED")
    return row.stateReason === "NOT_PLANNED"
      ? ["issue-skipped", t.dim, "Closed as not planned"]
      : ["issue-closed", t.ansi5, "Closed"];
  return ["issue-open", t.ansi2, "Open"];
}

// Top level: chevron, state icon, title and #number, then the Status pill and sub-issue progress.
// Sub-issues: one line, indented per level, Status last. A click opens the row's detail (#11).
function Row({ node, depth }, open, onToggle, onOpen) {
  const t = theme();
  const [icon, color, label] = stateIcon(node, t);
  const titleLine = h_flex()
    .gap(6)
    .items_center()
    .child(Chevron({ id: `chevron-${node.key}`, open, onClick: node.children.length ? onToggle : null }))
    .child(Icon(icon, 15).text_color(color).accessibility_label(label))
    .child(div().flex_1().min_w(0).truncate().child(node.title))
    .when(node.number != null, (el) => el.child(IssueNumber(node.number)));
  // Clickable as in the approved epic #10 prototype (a28afdf, `clickable`).
  const clickable = (el) =>
    el.id(`row-${node.key}`).rounded(6).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => onOpen(cx));
  if (depth)
    return clickable(h_flex())
      .flex_none()
      .h(28)
      .pl(depth * 20)
      .pr(4)
      .gap(6)
      .items_center()
      .child(titleLine.flex_1().min_w(0))
      .when(Boolean(node.status), (el) => el.child(StatusPill(node.status)));
  const percent = progress(node.summary);
  return clickable(v_flex())
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
          .when(Boolean(node.status), (line) => line.child(StatusPill(node.status)))
          .when(percent !== null, (line) => line.child(Progress(percent))),
      ),
    );
}

// The linked boards of a repo, and the one board's items, as a screen state.
async function findBoard(repo) {
  try {
    const pick = pickProject(await loadProjects(repo));
    if (pick.kind === "none") return { kind: "no-board", repo };
    if (pick.kind === "many") return { kind: "many-boards", repo, names: pick.names };
    return { kind: "board", repo, title: pick.project.title, project: pick.project, tree: buildTree(parseItems(await loadItems(pick.project.id))) };
  } catch (e) {
    // Boards and items alike: gh missing, logged out, missing scope, or any other API error.
    return { kind: classifyError(e), repo, message: e.message };
  }
}

export default class ProjectBoard extends View {
  init(_props, cx) {
    this.lastFolder = new Map();
    // Per repo: its expanded rows, scroll position and last loaded board, kept while the panel
    // shows another board or is hidden. A hidden copy isn't drawn, so the list's own scroll
    // state is dropped; a ScrollHandle kept on the view holds it.
    this.boards = new Map();
    this.showDone = stored("show-done") === "on";
    this.screen = { kind: "loading" };
    this.loading = true;
    this.token = 0;
    // The open issue's detail, shown in place of the list; null shows the list.
    this.detail = null;
    if (checking()) return;
    this.followFocus(cx);
    cx.timer.every(CONTEXT_POLL_MS, (cx) => this.followFocus(cx));
    // Timers run while hidden too, so this is the only poll of GitHub: never faster than the setting.
    cx.timer.every(refreshSeconds(props()) * 1000, (cx) => {
      if (!this.loading) this.load(cx);
    });
  }

  // Switching tab, space or pane, or `cd` in the terminal, re-resolves the repo and its board.
  followFocus(cx) {
    const sp = activeSpace(spaces(), panes(), this.lastFolder);
    const key = sp ? `${sp.machine ?? "local"}:${sp.folder}` : "";
    if (key === this.key) return;
    this.key = key;
    this.sp = sp;
    this.load(cx);
  }

  // Not callable from render: Herdr makes scroll handles only outside it.
  board(repo) {
    if (!this.boards.has(repo)) this.boards.set(repo, { expanded: new Set(), scroll: ScrollHandle.new(), screen: null });
    return this.boards.get(repo);
  }

  // Reloads in place: the screen (a board, a notice) stays while the header's refresh icon spins.
  load(cx) {
    const sp = this.sp;
    const token = ++this.token;
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      let screen;
      try {
        screen = sp?.folder ? await detectRepo(sp) : { kind: "not-git" };
      } catch (e) {
        // exec rejects when git can't start: not installed, folder gone, machine unreachable.
        screen = { kind: "git-error", message: e.message };
      }
      if (screen.kind === "repo") {
        // Another repo: its board as it was left, else the repo while gh reads its boards,
        // never the previous repo's board.
        if (token === this.token && this.screen.repo !== screen.repo) {
          this.detail = null;
          this.screen = this.board(screen.repo).screen ?? { kind: "loading", repo: screen.repo, folder: sp.folder };
          cx.notify();
        }
        screen = await findBoard(screen.repo);
      }
      if (token !== this.token) return;
      // A detail stays open over its own repo's board only (a failed refresh keeps it).
      if (this.detail?.repo !== screen.repo) this.detail = null;
      this.screen = { ...screen, folder: sp?.folder ?? null };
      if (screen.kind === "board") this.board(screen.repo).screen = this.screen;
      this.loading = false;
      cx.notify();
    });
  }

  toggle(key, cx) {
    const { expanded } = this.board(this.screen.repo);
    if (!expanded.delete(key)) expanded.add(key);
    cx.notify();
  }

  toggleDone(cx) {
    this.showDone = !this.showDone;
    store("show-done", this.showDone ? "on" : "off");
    cx.notify();
  }

  // A row or sub-issue row: the list makes way for its detail. Pull requests and draft issues
  // only link to GitHub; a draft has no page of its own, so it opens the board's item pane.
  openDetail(node, cx) {
    const { project, repo } = this.screen;
    const url = node.type === "DraftIssue" && project?.url && node.itemId ? `${project.url}?pane=issue&itemId=${node.itemId}` : node.url;
    this.detail = { node: { ...node, url }, repo, projectId: project?.id, data: null, error: null, token: 0 };
    if (node.type === "Issue") this.loadDetail(this.detail, cx);
    cx.notify();
  }

  back(cx) {
    this.detail = null;
    cx.notify();
  }

  loadDetail(d, cx) {
    const token = ++d.token;
    d.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      let data = null;
      let error = null;
      try {
        data = parseIssue(await loadIssue(d.node.key), d.projectId);
      } catch (e) {
        error = e.message;
      }
      if (token !== d.token) return;
      d.data = data;
      d.error = error;
      cx.notify();
    });
  }

  render() {
    if (this.detail) return Panel("project-board").child(this.detailHeader(this.detail)).child(this.detailBody(this.detail));
    const s = this.screen;
    const tryAgain = Button({ id: "try-again", label: "Try again", primary: true, onClick: (cx) => this.load(cx) });
    const notice = NOTICES[s.kind]?.(s, tryAgain);
    const showDone = TextButton({
      id: "show-done",
      icon: this.showDone ? "check" : null,
      label: "Show done",
      active: this.showDone,
      onClick: (cx) => this.toggleDone(cx),
    });
    return Panel("project-board")
      .child(
        Header({
          title: s.kind === "board" ? s.title : "Project Board",
          subtitle: s.repo ?? s.folder,
          actions: [
            ...(s.kind === "board" ? [showDone] : []),
            IconButton({ id: "refresh", icon: "refresh", label: "Refresh board", spinning: this.loading, onClick: (cx) => this.load(cx) }),
          ],
        }),
      )
      .when(s.kind === "loading", (el) => el.child(Busy("Loading the board…")))
      .when(Boolean(notice), (el) => el.child(Notice({ id: s.kind, ...notice })))
      .when(s.kind === "board", (el) => el.child(this.list(s)));
  }

  // The board's rows, or a notice when none show (wording from the approved epic #1 prototype).
  list({ repo, tree }) {
    const { expanded, scroll } = this.boards.get(repo);
    const rows = visibleRows(tree, { showDone: this.showDone, expanded });
    if (!rows.length)
      return Notice({
        id: "board-empty",
        icon: "board",
        title: tree.length ? "Everything on this board is done" : "This board has no items yet",
        detail: tree.length ? "Turn on Show done to see finished items." : null,
      });
    return v_flex()
      .id("board-list")
      .flex_1()
      .min_h(0)
      .overflow_y_scrollbar()
      .track_scroll(scroll)
      .px(6)
      .py(4)
      .children(
        rows.map((row) =>
          Row(
            row,
            expanded.has(row.node.key),
            (cx) => this.toggle(row.node.key, cx),
            (cx) => this.openDetail(row.node, cx),
          ),
        ),
      );
  }

  // Back, then what this is: state, type, #number and Status; the title under it.
  // From the approved epic #10 prototype (a28afdf, `detailHeader`), without its issue refresh (#16).
  detailHeader(d) {
    const t = theme();
    const issue = d.data ?? d.node;
    const [icon, color, label] = stateIcon(issue, t);
    return v_flex()
      .id("detail-header")
      .flex_none()
      .pl(6)
      .pr(12)
      .py(8)
      .gap(2)
      .border_b(1)
      .border_color(t.border)
      .child(
        h_flex()
          .gap(6)
          .items_center()
          .child(IconButton({ id: "back", icon: "chevron-left", label: "Back to the board", onClick: (cx) => this.back(cx) }))
          .child(Icon(icon, 15).text_color(color).accessibility_label(label))
          .when(Boolean(issue.issueType), (el) => el.child(TypeTag(issue.issueType)))
          .when(issue.number != null, (el) => el.child(IssueNumber(issue.number)))
          .when(Boolean(issue.status), (el) => el.child(StatusPill(issue.status)))
          .child(div().flex_1())
          .when(Boolean(issue.url), (el) =>
            el.child(IconButton({ id: "open-github", icon: "external-link", label: "Open on GitHub", onClick: (cx) => cx.open_url(issue.url) })),
          ),
      )
      .child(div().pl(53).pr(4).font_medium().whitespace_normal().child(issue.title));
  }

  // The issue's body; sub-issues (#12) and activity (#13) go under it.
  detailBody(d) {
    if (d.node.type !== "Issue") {
      const pr = d.node.type === "PullRequest";
      return Notice({
        id: "not-an-issue",
        icon: pr ? "pull-request" : "draft",
        title: pr ? "Pull requests open on GitHub" : "Draft issues open on GitHub",
        detail: pr
          ? "This panel reads issues. The pull request's conversation, checks and files are on GitHub."
          : "A draft issue lives only on the board, so there is nothing more to show here.",
        buttons: d.node.url
          ? [Button({ id: "open-github-big", label: "Open on GitHub", primary: true, onClick: (cx) => cx.open_url(d.node.url) })]
          : [],
      });
    }
    if (d.error)
      return Notice({
        id: "detail-error",
        icon: "alert",
        title: `#${d.node.number} didn't load`,
        detail: d.error,
        buttons: [Button({ id: "detail-try-again", label: "Try again", primary: true, onClick: (cx) => this.loadDetail(d, cx) })],
      });
    if (!d.data) return Busy(`Loading #${d.node.number}…`, "detail-loading");
    const { key, body } = d.data;
    return v_flex()
      .id(`detail-${key}`)
      .flex_1()
      .min_h(0)
      .overflow_y_scrollbar()
      .px(14)
      .py(12)
      .gap(18)
      .child(body.trim() ? Markdown(`body-${key}`, body) : Message("No description."));
  }
}
