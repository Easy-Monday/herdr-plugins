// Loads the mod's View in Node, renders it, and lets tests read text and fire handlers.
import { herdrStub } from "herdr";
export { herdrStub };

const timer = { every() {}, after() {} };
const cx = new Proxy({}, {
  get: (_, key) => (key === "timer" ? timer : key === "focus_handle" ? () => ({ focus() {} }) : () => {}),
});

export async function mount(props = {}) {
  herdrStub.props = props;
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
