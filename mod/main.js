// Project Board: a read-only panel showing the GitHub project board of the active tab's repo.
import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { theme } from "herdr";

export default class ProjectBoard extends View {
  render() {
    const t = theme();
    return v_flex()
      .id("project-board")
      .size_full()
      .p(12)
      .gap(8)
      .bg(t.background)
      .text_color(t.foreground)
      .text_size(13)
      .child(div().font_semibold().child("Project Board"));
  }
}
