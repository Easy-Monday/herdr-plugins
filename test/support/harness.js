// Loads the mod's View in Node, renders it, and lets tests read text and fire handlers.
import { herdrStub } from "herdr";
export { herdrStub };

// cx.timer.every/after calls of the last mounted view, newest last: { ms, fn, due, repeat }.
// A fake clock (`now`, ms since mount) decides when each is due; tick() and advance() move it.
export const timers = [];
let now = 0;
const schedule = (ms, fn, repeat) => { timers.push({ ms, fn, due: now + ms, repeat }); };
const timer = { every: (ms, fn) => schedule(ms, fn, true), after: (ms, fn) => schedule(ms, fn, false) };
// cx.spawn starts the task; settle() waits for every task started so far, and the ones they start.
const tasks = [];
// URLs handed to the system browser (cx.open_url), newest last.
export const opened = [];
const cx = new Proxy({}, {
  get: (_, key) => {
    if (key === "timer") return timer;
    if (key === "spawn") return (fn) => tasks.push(fn(cx));
    if (key === "focus_handle") return () => ({ focus() {} });
    if (key === "open_url") return (url) => opened.push(url);
    return () => {};
  },
});
export { cx };

export async function settle() {
  while (tasks.length) await tasks.shift();
}

// The earliest timer still to fire, due by `end`.
const next = (end) => timers.reduce((a, t) => (t.due != null && t.due <= end && (!a || t.due < a.due) ? t : a), null);

// Moves the clock `ms` on: fires each timer as it falls due (an `every` one again each period),
// waiting after each for the tasks it started.
export async function advance(ms) {
  const end = now + ms;
  for (let t; (t = next(end)); ) {
    now = t.due;
    t.due = t.repeat && t.ms > 0 ? t.due + t.ms : null;
    t.fn(cx);
    await settle();
  }
  now = end;
}

// Moves the clock to the next moment a timer is due (e.g. the 1 s focus poll) and fires the
// timers due then, not slower ones (e.g. a board refresh), then every task they started.
export async function tick() {
  const due = Math.min(...timers.filter((t) => t.due != null).map((t) => t.due));
  if (Number.isFinite(due)) await advance(due - now);
}

export async function mount(props = {}) {
  herdrStub.props = props;
  timers.length = 0;
  now = 0;
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
