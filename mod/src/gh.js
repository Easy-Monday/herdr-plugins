// Every GitHub call goes through here, so Prototype can answer it from mock/ fixtures.
import { exec } from "herdr";
import { mock } from "./mock.js";

export function gh(args) {
  return mock ? mock(args) : exec("gh", args);
}

// An image's raw bytes into `out`, once: a file already there is used as is. Values go in as
// positional arguments, never into the script text.
const FETCH = `[ -s "$2" ] && exit 0
mkdir -p "$(dirname "$2")" && gh api "$1" -H "Accept: application/vnd.github.raw" > "$2.part" && mv "$2.part" "$2" && exit 0
rm -f "$2.part"; exit 1`;

export function fetchImage(api, out) {
  return mock?.image ? mock.image(api, out) : exec("sh", ["-c", FETCH, "sh", api, out]);
}
