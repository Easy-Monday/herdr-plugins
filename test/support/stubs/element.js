// A recording element: every builder call is kept, child()/children() collect children, on_* keep handlers.
export function element(kind) {
  const node = { kind, props: {}, children: [], handlers: {} };
  const proxy = new Proxy(node, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === "symbol" || key === "then") return undefined;
      return (...args) => {
        if (key === "child") target.children.push(args[0]);
        else if (key === "children") target.children.push(...args[0]);
        else if (key.startsWith("on_")) target.handlers[key] = args[0];
        else target.props[key] = args.length <= 1 ? args[0] : args;
        return proxy;
      };
    },
  });
  return proxy;
}
