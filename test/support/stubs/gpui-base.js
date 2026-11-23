import { element } from "./element.js";
export const v_flex = () => element("v_flex");
export const h_flex = () => element("h_flex");
// TextView.markdown(id, source): the markdown source is its text child, so text() reads it.
export const TextView = { markdown: (id, md) => element("markdown").id(id).child(md) };
// A plain scroll area's position. `offset` stands in for where the owner scrolled the list that
// tracks it (Herdr keeps that in the handle; tests set it). Like Herdr's, a released handle throws.
export const ScrollHandle = {
  new: () => {
    let released = false;
    const live = () => { if (released) throw new Error("ScrollHandle used after release()"); };
    return {
      offset: 0,
      get released() { return released; },
      scroll_to_item() { live(); },
      release() { live(); released = true; return true; },
    };
  },
};
