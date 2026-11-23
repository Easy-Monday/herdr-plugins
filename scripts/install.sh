#!/bin/sh
# Install mod/ into Herdr. Usage: scripts/install.sh [preview|prototype]
#   (none)     -> mods/project-board            real gh, what users get
#   preview    -> mods/project-board-preview    this worktree, real gh
#   prototype  -> mods/project-board-prototype  this worktree, mock/ fixtures answer gh
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
case "${1:-}" in
  "") name=project-board ;;
  preview) name=project-board-preview ;;
  prototype) name=project-board-prototype ;;
  *) echo "usage: $0 [preview|prototype]" >&2; exit 2 ;;
esac
dest="${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/$name"
mkdir -p "$dest"
# Replace our files, keep what Herdr writes there (jsconfig.json, *.d.ts).
find "$dest" -mindepth 1 -maxdepth 1 ! -name jsconfig.json ! -name '*.d.ts' -exec rm -rf {} +
(cd "$root/mod" && tar cf - --exclude jsconfig.json --exclude '*.d.ts' --exclude .DS_Store .) | (cd "$dest" && tar xf -)
# Asset paths (mods/<name>/icons) follow the installed folder name.
printf 'export const MOD = "%s";\n' "$name" > "$dest/src/name.js"
if [ "${1:-}" = prototype ]; then
  cp "$root/mock/mock.js" "$dest/src/mock.js"
  mkdir -p "$dest/mock" && cp -R "$root/mock/images" "$dest/mock/" # image download fixtures (epic #18)
fi
echo "$dest"
