// Project Board: a read-only panel showing the GitHub project board of the active tab's repo.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { theme, spaces, panes, checking, props } from "herdr";
import { mock } from "./src/mock.js";
import { detectRepo } from "./src/git.js";
import { loadProjects, loadItems, loadIssue } from "./src/load.js";
import { parseIssue } from "./src/issue.js";
import { mergeActivity, isHandoff, relativeTime, statusLine } from "./src/activity.js";
import { imageLinks } from "./src/images.js";
import { pickProject, parseItems, buildTree, visibleRows, progress } from "./src/board.js";
import { classifyError } from "./src/errors.js";
import {
  TEXT,
  Busy,
  Button,
  Chevron,
  Header,
  HandoffTag,
  Icon,
  IconButton,
  IssueNumber,
  Markdown,
  Message,
  Notice,
  Panel,
  Progress,
  SectionLabel,
  StatusPill,
  TextButton,
  TypeTag,
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
    // Per repo: its expanded rows, scroll position and last board, kept while the panel
    // shows another board or is hidden (#8 AC-4). A hidden copy isn't drawn, so the list's
    // own scroll state is dropped; a ScrollHandle kept on the view holds it.
    this.boards = new Map();
    // Prototype only: open in a given state, e.g. props {"scenario": "big", "expand": ["I_1"]}.
    if (mock?.scenarios && given.scenario) mock.choose(given.scenario);
    this.startExpanded = mock?.scenarios ? (given.expand ?? []) : [];
    this.startOpen = mock?.scenarios ? (given.open ?? null) : null; // e.g. "I_11": that issue's detail
    this.showDone = stored("show-done") === "on";
    this.screen = { kind: "loading" };
    this.loading = true;
    this.token = 0;
    this.prototypeOpen = false;
    // Open issue details, the shown one last; Back goes one step up, then to the list.
    this.trail = [];
    if (checking()) return;
    this.followFocus(cx);
    cx.timer.every(CONTEXT_POLL_MS, (cx) => this.followFocus(cx));
    cx.timer.every(REFRESH_MS, (cx) => {
      if (!this.loading) this.load(cx);
      const shown = this.shown();
      if (shown?.node.type === "Issue" && !shown.loading) this.loadDetail(shown, cx);
    });
  }

  // Switching tab, space or pane, or `cd` in the terminal, shows that folder's board.
  followFocus(cx) {
    const sp = activeSpace(this.lastFolder);
    const key = sp ? `${sp.machine ?? "local"}:${sp.folder}` : "";
    if (key === this.key) return;
    this.key = key;
    this.sp = sp;
    this.load(cx);
  }

  // Not callable from render: Herdr makes scroll handles only outside it.
  board(repo) {
    if (!this.boards.has(repo))
      this.boards.set(repo, { expanded: new Set(this.startExpanded), scroll: ScrollHandle.new(), screen: null });
    return this.boards.get(repo);
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
          // A switch to another board shows it as it was left; the load below refreshes it.
          if (token === this.token && this.screen.repo !== repo) {
            this.closeDetails();
            this.screen = this.board(repo).screen ?? { kind: "loading", repo };
            cx.notify();
          }
          const pick = pickProject(await loadProjects(repo));
          if (pick.kind === "none") screen = { kind: "no-board", repo };
          else if (pick.kind === "many") screen = { kind: "many-boards", repo, names: pick.names };
          else {
            const items = parseItems(await loadItems(pick.project.id));
            screen = { kind: "board", repo, title: pick.project.title, project: pick.project, tree: buildTree(items) };
          }
        }
      } catch (e) {
        screen = { kind: classifyError(e), repo, message: e.message };
      }
      if (token !== this.token) return;
      // An issue stays open over its own repo's board only (a failed refresh keeps it).
      if (this.trail[0]?.repo !== repo) this.closeDetails();
      this.screen = { ...screen, folder: sp?.folder ?? null };
      if (screen.kind === "board") this.board(repo).screen = this.screen;
      if (this.startOpen && screen.kind === "board") {
        const find = (nodes) => nodes.map((n) => (n.key === this.startOpen ? n : find(n.children))).find(Boolean);
        const node = find(screen.tree);
        this.startOpen = null;
        if (node) this.openDetail(node, cx);
      }
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

  shown() {
    return this.trail[this.trail.length - 1] ?? null;
  }

  // A row or a sub-issue: the list makes way for its detail. Not callable from render (scroll handle).
  openDetail(node, cx) {
    const project = this.screen.project;
    const url =
      node.type === "DraftIssue" && project?.url && node.itemId
        ? `${project.url}?pane=issue&itemId=${node.itemId}`
        : node.url;
    this.trail.push({
      node: { ...node, url },
      repo: this.screen.repo,
      projectId: project?.id,
      data: null,
      error: null,
      loading: false,
      token: 0,
      scroll: ScrollHandle.new(),
    });
    if (node.type === "Issue") this.loadDetail(this.shown(), cx);
    cx.notify();
  }

  back(cx) {
    this.trail.pop()?.scroll.release();
    cx.notify();
  }

  closeDetails() {
    for (const d of this.trail) d.scroll.release();
    this.trail = [];
  }

  // A reload keeps what's shown, so the detail and its scroll stay put.
  loadDetail(d, cx) {
    const token = ++d.token;
    d.loading = true;
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
      if (data) d.data = data;
      d.error = error;
      d.loading = false;
      cx.notify();
    });
  }

  render() {
    const shown = this.shown();
    const root = shown
      ? Panel("project-board").child(this.detailHeader(shown)).child(this.detailBody(shown))
      : Panel("project-board").child(this.header(this.screen)).child(this.body(this.screen));
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
    const { expanded, scroll } = this.boards.get(s.repo);
    const rows = visibleRows(s.tree, { showDone: this.showDone, expanded });
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
      .track_scroll(scroll)
      .px(6)
      .py(4)
      .children(rows.map((row) => this.row(row, expanded)));
  }

  // Top level: title line, then Status and progress under it. Sub-issues: one line, Status last.
  row({ node, depth }, expanded) {
    const t = theme();
    const [icon, color, label] = stateIcon(node, t);
    const titleLine = h_flex()
      .gap(6)
      .items_center()
      .child(
        Chevron({
          id: `chevron-${node.key}`,
          open: expanded.has(node.key),
          onClick: node.children.length ? (cx) => this.toggle(node.key, cx) : null,
        }),
      )
      .child(Icon(icon, 15).text_color(color).accessibility_label(label))
      .child(div().flex_1().min_w(0).truncate().child(node.title))
      .when(node.number != null, (el) => el.child(IssueNumber(node.number)));
    if (depth)
      return this.clickable(h_flex(), node)
        .flex_none()
        .h(28)
        .pl(depth * 20)
        .pr(4)
        .gap(6)
        .items_center()
        .child(titleLine.flex_1().min_w(0))
        .when(Boolean(node.status), (el) => el.child(StatusPill(node.status)));
    const percent = progress(node.summary);
    return this.clickable(v_flex(), node)
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

  clickable(el, node) {
    const t = theme();
    return el
      .id(`row-${node.key}`)
      .rounded(6)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.openDetail(node, cx));
  }

  // Back, then what this is: state, type, #number and Status; the title under it.
  detailHeader(d) {
    const t = theme();
    const issue = d.data ?? d.node;
    const [icon, color, label] = stateIcon(issue, t);
    const above = this.trail[this.trail.length - 2];
    const actions = [];
    if (d.node.type === "Issue")
      actions.push(
        IconButton({
          id: "refresh",
          icon: "refresh",
          label: "Refresh issue",
          spinning: d.loading,
          onClick: (cx) => this.loadDetail(d, cx),
        }),
      );
    if (issue.url)
      actions.push(
        IconButton({
          id: "open-github",
          icon: "external-link",
          label: "Open on GitHub",
          onClick: (cx) => cx.open_url(issue.url),
        }),
      );
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
          .child(
            IconButton({
              id: "back",
              icon: "chevron-left",
              label: above?.node.number != null ? `Back to #${above.node.number}` : "Back to the board",
              onClick: (cx) => this.back(cx),
            }),
          )
          .child(Icon(icon, 15).text_color(color).accessibility_label(label))
          .when(Boolean(issue.issueType), (el) => el.child(TypeTag(issue.issueType)))
          .when(issue.number != null, (el) => el.child(IssueNumber(issue.number)))
          .when(Boolean(issue.status), (el) => el.child(StatusPill(issue.status)))
          .child(div().flex_1())
          .children(actions),
      )
      .child(div().pl(53).pr(4).font_medium().whitespace_normal().child(issue.title));
  }

  detailBody(d) {
    const t = theme();
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
          ? [
              Button({
                id: "open-github-big",
                label: "Open on GitHub",
                primary: true,
                onClick: (cx) => cx.open_url(d.node.url),
              }),
            ]
          : [],
      });
    }
    const retry = (cx) => this.loadDetail(d, cx);
    if (!d.data && d.error)
      return Notice({
        id: "detail-error",
        icon: "alert",
        title: `#${d.node.number} didn't load`,
        detail: d.error,
        buttons: [Button({ id: "detail-try-again", label: "Try again", primary: true, onClick: retry })],
      });
    if (!d.data) return Busy(`Loading #${d.node.number}…`, "detail-loading");
    const issue = d.data;
    const activity = mergeActivity(issue.comments, issue.events);
    const now = Date.now();
    return v_flex()
      .id(`detail-${d.node.key}`)
      .flex_1()
      .min_h(0)
      .overflow_y_scrollbar()
      .track_scroll(d.scroll)
      .px(14)
      .py(12)
      .gap(18)
      .when(Boolean(d.error), (el) =>
        el.child(
          h_flex()
            .id("detail-stale")
            .flex_none()
            .gap(8)
            .items_center()
            .text_size(TEXT.small)
            .text_color(t.ansi1)
            .child(div().flex_1().min_w(0).whitespace_normal().child(`Couldn't refresh: ${d.error}`))
            .child(TextButton({ id: "detail-try-again", label: "Try again", onClick: retry })),
        ),
      )
      .child(issue.body.trim() ? Markdown(`body-${issue.key}`, imageLinks(issue.body)) : Message("No description."))
      .when(issue.subIssues.length > 0, (el) =>
        el.child(
          v_flex()
            .id("sub-issues")
            .flex_none()
            .gap(4)
            .child(SectionLabel("Sub-issues", issue.subIssues.length))
            .child(v_flex().mx(-6).children(issue.subIssues.map((s) => this.subRow(s)))),
        ),
      )
      .child(
        v_flex()
          .id("activity")
          .flex_none()
          .gap(12)
          .child(SectionLabel("Activity", activity.length))
          .when(!activity.length, (el) => el.child(Message("No comments or Status changes yet.")))
          .children(activity.map((a) => (a.kind === "comment" ? this.comment(a, now) : this.statusChange(a, now)))),
      );
  }

  subRow(s) {
    const t = theme();
    const [icon, color, label] = stateIcon(s, t);
    return h_flex()
      .id(`sub-${s.key}`)
      .flex_none()
      .h(28)
      .px(6)
      .gap(6)
      .items_center()
      .rounded(6)
      .cursor_pointer()
      .hover((st) => st.bg(t.hover))
      .on_click((_e, cx) => this.openDetail(s, cx))
      .child(Icon(icon, 15).text_color(color).accessibility_label(label))
      .child(div().flex_1().min_w(0).truncate().child(s.title))
      .child(IssueNumber(s.number))
      .when(Boolean(s.status), (el) => el.child(StatusPill(s.status)));
  }

  // A handoff gets the accent bar and its tag; every comment keeps the same text edge.
  comment(c, now) {
    const t = theme();
    const handoff = isHandoff(c.body);
    return v_flex()
      .id(`comment-${c.id}`)
      .flex_none()
      .min_w(0)
      .gap(4)
      .ml(-10)
      .pl(8)
      .border_l(2)
      .border_color(handoff ? t.accent : t.background)
      .child(
        h_flex()
          .gap(6)
          .items_center()
          .child(div().flex_none().font_medium().text_size(TEXT.small).child(c.author?.login ?? "ghost"))
          .child(
            div()
              .flex_1()
              .min_w(0)
              .truncate()
              .text_size(TEXT.caption)
              .text_color(t.dim)
              .child(relativeTime(c.createdAt, now)),
          )
          .when(handoff, (el) => el.child(HandoffTag(`handoff-${c.id}`))),
      )
      .child(Markdown(`comment-body-${c.id}`, imageLinks(c.body || "")));
  }

  statusChange(e, now) {
    const t = theme();
    return h_flex()
      .id(`status-${e.id}`)
      .flex_none()
      .min_w(0)
      .gap(6)
      .items_center()
      .text_size(TEXT.caption)
      .text_color(t.dim)
      .child(Icon("board", 12))
      .child(div().flex_1().min_w(0).truncate().child(statusLine(e, now)));
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
                    this.closeDetails();
                    // shortcut: drops the old handles unreleased (a few per click); prototype only.
                    this.boards.clear();
                    this.load(cx);
                  },
                }),
              ),
            ),
        ),
      );
  }
}
