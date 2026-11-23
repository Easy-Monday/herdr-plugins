// Maps Herdr's runtime modules to test stubs, so mod code loads in Node.
import { registerHooks } from "node:module";

const stubs = new Set(["herdr", "gpui-kit", "gpui-base"]);
registerHooks({
  resolve(specifier, context, next) {
    if (stubs.has(specifier)) return { url: new URL(`./stubs/${specifier}.js`, import.meta.url).href, shortCircuit: true };
    return next(specifier, context);
  },
});
