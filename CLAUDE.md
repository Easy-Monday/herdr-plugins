# Herdr Project Board
This product follows the `project-plugin:software-product` lifecycle (status contract, agent roster).

It is a Herdr mod (gpui-kit JavaScript, run by Herdr's gpui-shell, not Node). Read `~/.config/herdr-app/AGENTS.md` before writing mod code: no `setTimeout` (use `cx.timer`), never keep a `cx`, `exec` for programs, `if (checking()) return;` before side effects in `init`. Types: `~/.config/herdr-app/herdr.d.ts`, `~/.config/herdr-app/gpui-kit.d.ts`.

## Commands
- Runtime: Node 26 from `.nvmrc` (tests and scripts only; the mod runs on Herdr's engine). Check: `export PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH" && node -v`. Every command below starts with `export PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH" && `.
- Install: `export PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH" && npm ci`
- Test, all: `export PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH" && npm test` — unit then e2e, both always run
- Test, one file: `export PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH" && npm run test:file -- <path>`
- Lint: `export PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH" && npm run lint` — `node --check` on every file (syntax only) and `sh -n` on the install script
- Check: `export PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH" && npm run check` — `herdr-app check mod`; needs the Herdr app, so it is not in CI. Run it before every handoff and PR; a failing check is a failing test.
- Audit: `export PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH" && npm run audit` — defined in `package.json` scripts; production dependencies, fails on high and critical, exceptions in `config/audit-allowlist.json`
- Ports: none (no servers).
- Preview: `export PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH" && npm run preview` — installs this worktree's `mod/` as `~/.config/herdr-app/mods/project-board-preview` with real `gh`; open it in Herdr (`herdr-app do tab.new '{"mod":"project-board-preview"}'`). Re-run after each change.
- Prototype: `export PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH" && npm run prototype` — installs as `project-board-prototype` with `mock/mock.js` answering `gh`; open it the same way.
- Install for real: `export PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH" && npm run install-mod` — `mods/project-board`, no mocks.
## Layout
- `mod/`: exactly what installs. `mod/main.js` exports the View; `mod/src/` holds logic. Pure modules in `mod/src/` must not import `herdr` or `gpui-kit` (unit-testable); `mod/src/gh.js` is the only place that calls `gh`.
- mocks: `mock/mock.js` mocks the `gh` calls of epics still in their Prototype gate; every other call goes to the real `gh`. It replaces `mod/src/mock.js` (`export const mock = null`) only in the Prototype install; `test/e2e/install.test.js` proves other installs ship no mocks.
- Tests: `test/unit/` (`node --test`, pure functions) · `test/e2e/` (`node --test` with `test/support/register.mjs`: stub `herdr`, `gpui-kit`, `gpui-base` modules in `test/support/stubs/`, `herdrStub.exec` answers `gh`/`git`; `test/support/harness.js` mounts the View, reads text, fires `on_click`). e2e here does not draw: native layout is covered by Check, `herdr-app shot` and the owner's preview. Add stub exports when mod code imports new gpui-kit or herdr names.
## Design system
Herdr's own: `theme()` colours and Herdr's UI font, compact rows like the shipped panels (`~/.config/herdr-app/mods/files`, `changes`). No custom palette; no CSS.
## Run mode
subagents
