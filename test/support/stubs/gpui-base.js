import { element } from "./element.js";
export const v_flex = () => element("v_flex");
export const h_flex = () => element("h_flex");
// The markdown is its text child, so text() reads it.
export const TextView = { markdown: (id, md) => element("markdown").id(id).child(md) };
export const ScrollHandle = { new: () => ({ scroll_to_item() {}, release() {} }) };
