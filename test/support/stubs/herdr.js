// Herdr runtime stub. Tests set behaviour through `herdrStub` (see test/support/harness.js).
export const herdrStub = { exec: null, props: {}, spaces: [], panes: [], files: {} };

export const theme = () => new Proxy({}, { get: (_, key) => (typeof key === "string" ? `theme.${key}` : undefined) });
export const checking = () => false;
export const props = () => herdrStub.props;
export const spaces = () => herdrStub.spaces;
export const panes = () => herdrStub.panes;
export const home = () => "/home/test";
export const appHome = () => "/home/test/.config/herdr-app";
export const settings = () => ({ dark: true });
export const run = () => null;
export const exec = (command, args = [], options = {}) => {
  if (!herdrStub.exec) return Promise.reject(new Error(`unstubbed exec: ${command} ${args.join(" ")}`));
  return Promise.resolve(herdrStub.exec(command, args, options));
};
export const readTextFile = async (path) => herdrStub.files[path] ?? null;
export const writeTextFile = async (path, text) => { herdrStub.files[path] = text; return null; };
