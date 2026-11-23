// Loads the mod's View in Node, renders it, and lets tests read text and fire handlers.
import { herdrStub } from "herdr";
export { herdrStub };

// cx.timer.every/after calls of the last mounted view, newest last: { ms, fn }. tick() fires them.
export const timers = [];
const timer = { every: (ms, fn) => timers.push({ ms, fn }), after: (ms, fn) => timers.push({ ms, fn }) };
// cx.spawn starts the task; settle() waits for every task started so far, and the ones they start.
const tasks = [];
const cx = new Proxy({}, {
  get: (_, key) => {
    if (key === "timer") return timer;
    if (key === "spawn") return (fn) => tasks.push(fn(cx));
    if (key === "focus_handle") return () => ({ focus() {} });
    return () => {};
  },
});
export { cx };

export async function settle() {
  while (tasks.length) await tasks.shift();
}

// One round of the view's timers (e.g. its focus poll), then every task they started.
export async function tick() {
  for (const { fn } of [...timers]) fn(cx);
  await settle();
}

export async function mount(props = {}) {
  herdrStub.props = props;
  timers.length = 0;
  const { default: Mod } = await import("../../mod/main.js");
  const view = new Mod();
  await view.init?.(props, cx);
  return { view, render: () => view.render(cx) };
}

export function walk(node, visit) {
  if (node == null || typeof node !== "object") return;
  visit(node);
  for (const child of node.kids ?? []) walk(child, visit);
}

export function text(node) {
  if (node == null) return "";
  if (typeof node !== "object") return String(node);
  return (node.kids ?? []).map(text).join(" ");
}

export function byId(tree, id) {
  let found = null;
  walk(tree, (n) => { if (!found && n.props.id === id) found = n; });
  return found;
}

export function click(tree, id) {
  const node = byId(tree, id);
  if (!node?.handlers.on_click) throw new Error(`no clickable #${id}`);
  return node.handlers.on_click({}, cx);
}
