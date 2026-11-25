// Every GitHub call goes through here, so Prototype can answer it from mock/ fixtures.
import { exec } from "herdr";
import { mock } from "./mock.js";

export function gh(args) {
  return mock ? mock(args) : exec("gh", args);
}
