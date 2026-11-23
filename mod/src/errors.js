// What a failed gh call means for the person: gh missing, logged out, missing scope, or anything else.
export function classifyError(err) {
  const message = String(err?.message ?? err);
  if (/ENOENT|No such file or directory|command not found/i.test(message)) return "gh-missing";
  // Scope first: gh's missing-scope hint can itself mention `gh auth`.
  if (/INSUFFICIENT_SCOPES|required scopes|read:project/i.test(message)) return "gh-scope";
  if (/auth login|not logged in/i.test(message)) return "gh-logged-out";
  return "api-error";
}
