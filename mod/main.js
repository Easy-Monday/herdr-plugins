// Project Board: a read-only panel showing the GitHub project board of the active tab's repo.
import { View } from "gpui-kit";
import { spaces, panes, checking } from "herdr";
import { activeSpace } from "./src/repo.js";
import { detectRepo } from "./src/git.js";
import { Panel, Header, Notice } from "./ui.js";

const CONTEXT_POLL_MS = 1000;

const NOTICES = {
  "not-git": {
    title: "Not a git repo",
    detail: "The panel follows the focused terminal. cd into a repo, or switch to a tab in one.",
  },
  "no-remote": {
    title: "No GitHub remote",
    detail: "This repo has no remote on github.com, so it has no board to show.",
  },
};

export default class ProjectBoard extends View {
  init(_props, cx) {
    this.lastFolder = new Map();
    this.screen = { kind: "loading" };
    this.token = 0;
    if (checking()) return;
    this.followFocus(cx);
    cx.timer.every(CONTEXT_POLL_MS, (cx) => this.followFocus(cx));
  }

  // Switching tab, space or pane, or `cd` in the terminal, re-resolves the repo.
  followFocus(cx) {
    const sp = activeSpace(spaces(), panes(), this.lastFolder);
    const key = sp ? `${sp.machine ?? "local"}:${sp.folder}` : "";
    if (key === this.key) return;
    this.key = key;
    const token = ++this.token;
    cx.spawn(async (cx) => {
      let screen;
      try {
        screen = sp?.folder ? await detectRepo(sp) : { kind: "not-git" };
      } catch (e) {
        // exec rejects when git can't start: not installed, folder gone, machine unreachable.
        screen = { kind: "git-error", message: e.message };
      }
      if (token !== this.token) return;
      this.screen = { ...screen, folder: sp?.folder ?? null };
      cx.notify();
    });
  }

  render() {
    const s = this.screen;
    const notice =
      NOTICES[s.kind] ?? (s.kind === "git-error" ? { title: "Couldn't read this folder", detail: s.message } : null);
    return Panel("project-board")
      .child(Header({ title: "Project Board", subtitle: s.repo ?? s.folder }))
      .when(Boolean(notice), (el) => el.child(Notice({ id: s.kind, icon: "folder", ...notice })));
  }
}
