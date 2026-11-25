# Requirements: gallery listing

Follow-up to `docs/brd.md`. Personas: as in `docs/brd.md` §3 (the owner, directing agents).

## 1. Mod folder layout for the Herdr gallery
Priority: Must
Release: MVP
The mod must sit in `mods/project-board/` at the repo root (with `RECIPE.md` and `preview.png` beside it), the layout Herdr describes for a shared mod ("a folder laid out like this home", `~/.config/herdr-app/AGENTS.md`, "Layouts and mods other people made"), so that `herdr.dev/mods` lists it. Today the mod is in `mod/`, and the public repo with the topic `herdr-mod` (set 2026-11-24) is not listed. Raised by the owner on 2026-11-25. Evidence: of 95 repos of listed gallery owners, 93 have a `mods/<name>/` folder (65 at the repo root, 28 nested); none puts its mod in a bare `mod/` folder. The change moves the folder and everything that names it; nothing about how the mod behaves changes, and the installed name stays `project-board`. Whether the gallery then lists the mod is checked by the owner after the merge; if it still does not, the next step is to ask Herdr what its indexer needs.
