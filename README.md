# Herdr Project Board

A read-only side panel for [Herdr Desktop](https://github.com/herdrdev/herdr-app) that shows the GitHub project board linked to the repo of your active tab. Follow epics, stories and their sub-issues while agents work, without keeping a browser open beside Herdr. It works with GitHub through the `gh` CLI.

> **Status:** in development. The first release will be tagged `v0.1.0`; until then `main` works but may be incomplete.

## What it shows

- **The right board, automatically:** the panel follows the focused terminal's folder, finds its GitHub repo (`upstream`, then the branch's tracking remote, then `origin`) and shows the one Projects (v2) board linked to it.
- **Board list:** top-level items in the board's order with their state, `#number`, Status pill and sub-issue progress.
- **Sub-issues** nest under their parent, at any depth.
- **Done hidden by default**, with a **Show done** toggle.
- **Issue detail** *(coming in v0.1.0)*: body, sub-issues, comments and Status changes in one timeline, with agent handoff comments highlighted.
- **Keeps current:** refreshes every 60 seconds (a setting) and on the refresh button, keeping your place.

It never changes anything on GitHub or in git: GraphQL queries only, and read-only git commands.

## Requirements

- Herdr Desktop.
- The **GitHub CLI** on this computer, logged in with the `project` scope: `gh auth login -s project`, or `gh auth refresh -s project` if you're already logged in. Every GitHub call goes through `gh`; there's no token setting.
- Git on the machines your spaces run on. For a space on another machine, git runs there and `gh` runs on this computer.

If `gh` is missing, logged out or lacks the scope, the panel says so and shows what to run.

## Install

Copy this prompt into your Herdr agent:

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/Easy-Monday/herdr-plugins (install `mod/` as `~/.config/herdr-app/mods/project-board`)

<details>
<summary>Install by hand</summary>

```sh
git clone https://github.com/Easy-Monday/herdr-plugins.git
cd herdr-plugins
scripts/install.sh            # copies mod/ to ~/.config/herdr-app/mods/project-board
herdr-app check ~/.config/herdr-app/mods/project-board
```

`scripts/install.sh` needs only `sh` and `tar`. It doesn't edit layouts or keys. Run it again after pulling a new version. `HERDR_APP_HOME` installs into another Herdr home.

</details>

### Place the panel

The mod ships with `place: none`, so installing it changes no layout. Add it to a layout you own (clone one first: `herdr-app do layout.clone '{"name":"main","as":"my-layout"}'`). The usual spot is the right panel's `panel-body` stack, next to `files` and `changes`, about 368px wide:

```json
{ "id": "project-board", "type": "block", "content": { "mod": "project-board" } }
```

To open it from the tab bar, add a button that selects that block, in a tab bar you own (clone it with `mod.clone`). In a clone of the default `tabs` mod, the button's click runs:

```js
run("layout.select", { stack: "panel-body", child: "project-board" });
run("layout.show", { id: "panel" });
```

With [Better Tabs](https://github.com/munza/herdr-mods/tree/main/better-tabs), a button entry does the same:

```json
{
  "id": "board",
  "label": "Board",
  "action": { "type": "panel", "container": "panel", "stack": "panel-body", "target": "project-board" }
}
```

To try it without changing a layout, open it as a tab: `herdr-app do tab.new '{"mod":"project-board"}'`.

## Development

The mod is gpui-kit JavaScript run by Herdr, not Node; Node 26 (`.nvmrc`) runs the tests and scripts. Commands, layout and test approach are in [CLAUDE.md](CLAUDE.md). In short:

```sh
npm ci
npm test              # unit and e2e (Herdr runtime stubbed)
npm run lint
npm run check         # herdr-app check mod (needs Herdr)
npm run preview       # install this checkout as project-board-preview
```

Requirements are in [docs/brd.md](docs/brd.md); work is tracked on the GitHub project board linked to this repo.

## License

[Apache License 2.0](LICENSE). Repository-detection code is adapted from [Branch PR](https://github.com/munza/herdr-mods/tree/main/branch-pr) (Apache-2.0); see [NOTICE](NOTICE).
