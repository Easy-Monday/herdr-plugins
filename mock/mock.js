// Prototype mock layer: answers gh calls of epics still in their Prototype gate from fixtures.
// Return { code, stdout, stderr } like herdr's exec. Unmatched calls go to the real gh.
import { exec } from "herdr";

const fixtures = [
  // { match: (args) => args.includes("graphql") && /projectsV2/.test(args.join(" ")), stdout: { data: {} } },
];

export function mock(args) {
  const hit = fixtures.find((f) => f.match(args));
  if (!hit) return exec("gh", args);
  return Promise.resolve({ code: 0, stdout: JSON.stringify(hit.stdout), stderr: "" });
}
