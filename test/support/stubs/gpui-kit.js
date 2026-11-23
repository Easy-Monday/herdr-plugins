// Add exports here as mod code imports more of gpui-kit.
import { element } from "./element.js";
export class View {}
export const div = () => element("div");
export const svg = (path) => element("svg").path(path);
export const img = (path) => element("img").path(path);
