// What a failed gh call means for the person: gh missing, gh login or scope, or anything else.
export function classifyError(err) {
  const message = String(err?.message ?? err);
  if (/ENOENT|No such file or directory|command not found/i.test(message)) return "gh-missing";
  if (/auth login|not logged in|INSUFFICIENT_SCOPES|required scopes|read:project/i.test(message))
    return "gh-auth";
  return "api-error";
}
