// A recording element: every builder call is kept, child()/children() collect children into
// `kids` (so the builder's own children() stays callable), when() applies, on_* keep handlers.
export function element(kind) {
  const node = { kind, props: {}, kids: [], handlers: {} };
  const proxy = new Proxy(node, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === "symbol" || key === "then") return undefined;
      return (...args) => {
        if (key === "child") target.kids.push(args[0]);
        else if (key === "children") target.kids.push(...args[0]);
        else if (key === "when") return args[0] ? args[1](proxy) : proxy;
        else if (key.startsWith("on_")) target.handlers[key] = args[0];
        else target.props[key] = args.length <= 1 ? args[0] : args;
        return proxy;
      };
    },
  });
  return proxy;
}
