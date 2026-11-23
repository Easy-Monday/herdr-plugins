# BRD: Herdr Project Board mod

## 1. Overview

A read-only side panel for the Herdr desktop app that shows the GitHub project board linked to the repo of the active tab. The owner directs coding agents in Herdr terminals and today keeps a browser open beside Herdr only to watch the board move: which epics and stories are in progress, how far sub-issues have got, and what the agents wrote in their handoff comments. This mod brings that view into Herdr, next to the terminals, so the browser is no longer needed while agents work.

It is a Herdr **mod** (a JavaScript panel built with gpui-kit, Herdr's native UI toolkit; see `~/.config/herdr-app/AGENTS.md`), not a web page.

## 2. Goals and success metrics

- Follow a project's progress while agents work, without a browser.
- See at a glance what is moving: status of each epic, story and task, and progress of their sub-issues.
- Read an issue's definition, its status history and the agents' handoff comments without leaving Herdr.

Key metric: the owner no longer opens the GitHub project board in a browser to follow an agent run.
- Baseline: browser kept open beside Herdr during every agent run.
- Target: browser needed only to change the board (out of scope here), within two weeks of use.
- Measured: the owner's own judgement after two weeks of use.

## 3. Personas

### The owner, directing agents
- Who they are: runs several projects, each in its own Herdr space; directs Claude Code agents (via the project-plugin lifecycle: ux-designer, test-writer, developer, reviewer) that move issues across a GitHub Projects board. Technical, works in the terminal all day.
- Goals: keep an eye on what the agents are doing and where each epic stands, while staying in Herdr.
- Pain points: a browser window beside Herdr just for the board; switching to it to check statuses, open an issue and read the latest handoff comment.

## 4. Functional requirements

### 4.1 Find the repo of the active tab
Priority: Must
Release: MVP
The panel works out which GitHub repo to show **the same way the Branch PR mod does** (`~/.config/herdr-app/mods/branch-pr/main.js`, `activeSpace()`, and `github/discovery.js`):
- Take the active space, then its active tab; among that tab's panes with a known folder (`panes()[i].cwd`), use the focused one, else the first.
- If the tab has no terminal (e.g. a mod-only tab), keep the last folder seen for that space.
- Run `git remote` / `git remote get-url <name>` in that folder (on the space's machine for remote spaces: `exec(..., { cwd, on: space.machine })`) and turn the URL into `owner/repo`.
- Remote choice: prefer `upstream`, then the current branch's tracking remote, then `origin` (Branch PR's order).
- The panel follows focus: switching tab, space or focused terminal, or `cd` in the terminal, re-resolves the repo.

### 4.2 Find the project board linked to the repo
Priority: Must
Release: MVP
Look up the GitHub Projects (v2) linked to the repo (GraphQL `repository.projectsV2`, open projects only).
- Exactly one: show it.
- None: show a message "No project board is linked to <owner/repo>."
- More than one: show a message that the mod supports only one linked board, and list the boards' names. Show no board.

### 4.3 Board list
Priority: Must
Release: MVP
One fixed layout (not GitHub's saved views). Top-level items of the board, in the board's own item order. Each row shows:
- open/closed state icon, as GitHub does (open: green circle; closed/completed: purple tick);
- title (truncated to fit) and `#number`;
- the board's **Status** value (e.g. Todo, In Progress, Done, or the project-plugin columns: Specified, Designed, Tests Written, In Review …), as a coloured pill;
- for items with sub-issues: a sub-issue progress bar and percentage (closed sub-issues / all sub-issues, as GitHub shows it).
The panel is ~368px wide, so a row may wrap to two lines (title on the first; Status and progress on the second). Sketch:

```
▸ ◉ Round 3: product prototype ph…  #43
    Done · ████████ 100%
▾ ◎ semi-automated ideation proc…  #73
    In Progress · ███████░ 91%
    ◉ ideation: canvas, evidence…  #74  Done
```

A header above the list shows the board's name and the repo, a refresh button, and the Done toggle (4.5).

### 4.4 Sub-issues nested under their parent
Priority: Must
Release: MVP
An item with sub-issues has an expand/collapse chevron. Expanded, its sub-issues show indented beneath it, each with state icon, title, number and its Status on this board (or no Status if the sub-issue isn't on the board). Sub-issues that are themselves on the board appear only under their parent, not again at top level. Expansion state is kept across refreshes.

### 4.5 Hide Done by default
Priority: Must
Release: MVP
Top-level items whose Status is Done are hidden by default. A toggle in the header ("Show done") shows them. Inside an expanded parent, Done sub-issues are always shown, so progress stays visible. The toggle is remembered per mod copy (`localStorage`).

### 4.6 Issue detail view
Priority: Must
Release: MVP
Clicking a row (top-level or sub-issue) replaces the list with that issue's detail, with a back button to the list (as Branch PR opens a PR in its sidebar). Top to bottom:
- **Header:** issue type (Epic, Story, Task, Bug … from GitHub issue types, if set), title, `#number`, current Status on the board, and an "Open on GitHub" link (opens the system browser).
- **Definition:** the issue body rendered as markdown (`TextView.markdown`).
- **Sub-issues:** a short list of its sub-issues with state and Status; clicking one opens its detail.
- **Activity:** one chronological list (oldest first) of only:
  - comments: author, relative time, rendered markdown body;
  - board status changes: one line each, "Todo → In Progress · 2h ago" (GraphQL `timelineItems` with `PROJECT_V2_ITEM_STATUS_CHANGED_EVENT`; verified to return `previousStatus`, `status`, `createdAt`).

### 4.7 Highlight agent handoff comments
Priority: Should
Release: MVP
Comments whose first line starts with `Tests written at ` (test-writer) or `Prototype handoff at ` (ux-designer) are agent handoff comments (format fixed by the project-plugin's `branch-and-flag-policy` skill). Show them visually distinct (e.g. accent left bar and a "Handoff" label). Authorship can't be used: all agents post as the same GitHub user.

### 4.8 Keep current
Priority: Must
Release: MVP
The board refreshes on its own every 60 seconds and on the refresh button; an open issue detail refreshes on the same cycle. A refresh keeps scroll position, expanded rows and the open issue. The interval is a mod setting.

### 4.9 Clear states for what can go wrong
Priority: Must
Release: MVP
Show a plain message (and, where useful, what to run) for: folder is not a git repo; no GitHub remote; `gh` not installed; `gh` not logged in or missing the `project` scope (`gh auth refresh -s project`); network or API error (with "Try again"). A loading indicator while the first load runs (native animation, not a timer).

### 4.10 Placement in a Herdr window
Priority: Must
Release: MVP
The mod ships with `"place": "none"`, so installing it changes no one's layout. The README explains how to place it: add a block for it as another child of the right panel's `panel-body` stack in a clone of the `main` layout (next to `files`, `changes` and `pull-requests`), and a **Board** button in a clone of the tab bar, the way Branch PR's PRs button is added (`panelButton(...)`). The owner's own placement (`my-layout`, `my-tabs`) is a local task, not part of the mod. (Changed 2026-11-23: the mod is to be published as open source.)

### 4.11 Images in issue bodies and comments as links
Priority: Must
Release: MVP
Images in issue bodies and comments (e.g. the developer agent's UI screenshots, posted as sha-pinned raw URLs `https://github.com/ORG/REPO/blob/<sha>/docs/screenshots/<N>/<file>?raw=true`, and images in prototype handoffs) show as an "Open image" link with the image's alt text or file name, opening in the system browser. The repos are private, so the URLs need a GitHub login the panel's renderer doesn't have.

### 4.12 Images shown inside the panel
Priority: Should
Release: MVP
Show those images inline in the issue detail, scaled to the panel width. Behind a spike first: fetch each image through `gh` (authenticated) to a local cache file, point the markdown at it, and confirm Herdr's markdown view (`TextView.markdown`) or `image()` can show it. Download each image once (cache by URL; sha-pinned URLs don't change), not on every refresh. If the spike fails, 4.11 stands alone.

## 5. Non-functional requirements

### 5.1 Read-only
The mod never changes anything on GitHub or in git: GraphQL queries only, no mutations; git commands only read (`git remote`, `git symbolic-ref`, `git config --get`).

### 5.2 Authentication through `gh`
All GitHub calls go through the GitHub CLI on this computer (`gh api graphql`), using its login. No token setting. For a space on a remote machine, git runs on that machine and `gh` runs locally (as Branch PR does).

### 5.3 Efficiency
Fetch the board in as few GraphQL calls as practical (paginate items at 100 per page). The mod keeps running while hidden, so poll gently (Herdr's AGENTS.md: "timers keep running while hidden, so poll gently"); do not poll faster than the setting. Boards up to ~300 items must stay responsive (use a virtual list if needed).

### 5.4 Look and feel
Match Herdr's own panels: `theme()` colours only (works in light and dark themes), Herdr's UI font, compact rows. Status pill colours: derive from the GitHub Status option colour if available, else theme colours.

### 5.5 Herdr mod rules
Follow `~/.config/herdr-app/AGENTS.md`: `main.js` exporting a `View`; never keep a `cx`; no `setTimeout` (use `cx.timer`); `exec` for programs; `if (checking()) return;` before starting work in `init`. Must pass `herdr-app check ~/.config/herdr-app/mods/<name>`.

## 6. Out of scope

- Any writing: editing issues, changing Status, commenting, closing, assigning.
- More than one linked board per repo (4.2 shows a message instead).
- GitHub's saved views, their filters, sorting, grouping and extra columns; custom fields other than Status.
- Labels, assignees, milestones, reactions, linked PRs (the Branch PR mod covers PRs), close/reopen and other timeline events.
- Search or filtering beyond the Done toggle.
- Notifications or sounds on status changes.
- GitHub Enterprise, GitLab.

## 7. Open questions

None blocking. Builder's calls are marked "builder's call" in section 12.

## 12. Constraints, assumptions and risks

**Approaches considered**

- **A. Standalone mod calling `gh api graphql` directly from JavaScript — chosen.** No compiler or install step; read-only with few queries, so a helper adds nothing. Copy (don't import) Branch PR's repo-detection code. Trade-off: GraphQL handling lives in JS, a little harder to unit-test; keep parsing in pure functions so they can be tested.
- B. Standalone mod with a compiled Go helper, as Branch PR does. Rejected: needs Go and a build/install step for a read-only panel.
- C. A "Board" tab inside a clone of Branch PR. Rejected: maintaining a fork of a third-party mod, losing its updates, and mixing two jobs in one panel.

**Constraints**
- Herdr's shipped layouts and mods are read-only; placement uses the owner's clones `my-layout` and `my-tabs` (4.10).
- Native UI only (gpui-kit): no HTML, CSS or web view.
- The `gh` login needs the `project` scope (the owner's has it).

**Assumptions**
- The board's status field is the single-select field named **Status**.
- Board items are mostly issues. Pull requests and draft issues on the board show as plain rows (title, Status) with no detail view beyond "Open on GitHub" (builder's call).
- Sub-issue nesting: show all levels, indenting each (builder's call; the owner's boards use epic → story/task).
- A Done parent with unfinished sub-issues is still hidden when Done is hidden (builder's call; rare).

**Left to the development lead**
- Where the source lives: written straight into `~/.config/herdr-app/mods/<name>` (no version control), or in a repo (e.g. alongside other mods), optionally run through the project-plugin lifecycle. Either way, the installed copy goes in `~/.config/herdr-app/mods/<name>`.
- The mod's folder name (suggested: `project-board`; it must not clash with an existing mod).

**Risks**
- GitHub's GraphQL rate limit (5,000 points/hour): a 60s refresh of a large board with nested sub-issues must stay well under it.
- Mod API changes between Herdr versions: `herdr-app check` after Herdr updates.

## 13. Origin

Requested by the owner on 2026-11-18, after installing the Branch PR mod (`munza/herdr-mods/branch-pr`), to replace the browser kept open for the project board.
