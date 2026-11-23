// The look: Herdr's own panel conventions as small components. Sizes and shapes follow
// Branch PR's views/ui.js (munza/herdr-mods, Apache-2.0). UI only: values in, callbacks out.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, settings } from "herdr";
import { MOD } from "./src/name.js";
import { statusColor } from "./src/status.js";

export const TEXT = { caption: 11, small: 12, body: 13 };
const SPIN_MS = 900;

// A theme colour at low strength, for a pill's fill.
const tint = (color) => (/^#[0-9a-f]{6}/i.test(color) ? `${color.slice(0, 7)}24` : color);
const codeFont = () => settings().font_family ?? "JetBrains Mono";

export const Icon = (name, size = 14) => svg(`mods/${MOD}/icons/${name}.svg`).size(size).flex_none();

export function Panel(id) {
  const t = theme();
  return v_flex()
    .id(id)
    .size_full()
    .min_w(0)
    .min_h(0)
    .overflow_hidden()
    .bg(t.background)
    .text_color(t.foreground)
    .text_size(TEXT.body);
}

// Board name over owner/repo, then the header's actions.
export function Header({ title, subtitle, actions }) {
  const t = theme();
  return h_flex()
    .h(46)
    .flex_none()
    .px(12)
    .gap(8)
    .items_center()
    .border_b(1)
    .border_color(t.border)
    .child(Icon("board", 16).text_color(t.dim))
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .child(div().font_medium().truncate().child(title))
        .when(Boolean(subtitle), (el) =>
          el.child(div().text_size(TEXT.caption).text_color(t.dim).truncate().child(subtitle)),
        ),
    )
    .children(actions);
}

export function IconButton({ id, icon, label, onClick, spinning = false }) {
  const t = theme();
  return div()
    .id(id)
    .size(26)
    .flex_none()
    .flex()
    .items_center()
    .justify_center()
    .rounded(6)
    .text_color(t.dim)
    .accessibility_label(label)
    .tooltip(label)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .on_click((_e, cx) => onClick(cx))
    .child(spinning ? Icon(icon, 15).spin(SPIN_MS) : Icon(icon, 15));
}

// A small labelled toggle or action.
export function TextButton({ id, icon, label, active = false, onClick }) {
  const t = theme();
  return h_flex()
    .id(id)
    .h(22)
    .flex_none()
    .px(6)
    .gap(4)
    .items_center()
    .rounded(4)
    .text_size(TEXT.caption)
    .text_color(active ? t.foreground : t.dim)
    .when(active, (el) => el.bg(t.selected))
    .role("button")
    .aria_selected(Boolean(active))
    .cursor_pointer()
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .on_click((_e, cx) => onClick(cx))
    .when(Boolean(icon), (el) => el.child(Icon(icon, 12)))
    .child(label);
}

export function Button({ id, label, primary = false, onClick }) {
  const t = theme();
  return h_flex()
    .id(id)
    .h(30)
    .flex_none()
    .px(14)
    .items_center()
    .justify_center()
    .rounded(8)
    .text_size(TEXT.small)
    .bg(primary ? t.solid : t.raised)
    .text_color(primary ? t.solid_foreground : t.foreground)
    .cursor_pointer()
    .hover((s) => (primary ? s.opacity(0.88) : s.bg(t.hover)))
    .on_click((_e, cx) => onClick(cx))
    .child(label);
}

export function StatusPill(status) {
  const t = theme();
  const color = statusColor(status.color, t);
  return div()
    .flex_none()
    .h(18)
    .px(7)
    .flex()
    .items_center()
    .rounded(9)
    .bg(tint(color))
    .text_size(TEXT.caption)
    .text_color(color)
    .child(status.name);
}

export function Progress(percent) {
  const t = theme();
  return h_flex()
    .flex_none()
    .gap(6)
    .items_center()
    .accessibility_label(`${percent}% of sub-issues closed`)
    .child(
      div()
        .w(64)
        .h(4)
        .rounded(2)
        .bg(t.raised)
        .child(div().h(4).w(Math.round(0.64 * percent)).rounded(2).bg(t.ansi2)),
    )
    .child(div().text_size(TEXT.caption).text_color(t.dim).child(`${percent}%`));
}

export const IssueNumber = (n) => {
  const t = theme();
  return div().flex_none().text_size(TEXT.caption).text_color(t.dim).font_family(codeFont()).child(`#${n}`);
};

// The chevron's slot, empty for rows without children so titles line up.
export function Chevron({ id, open, onClick }) {
  const t = theme();
  const slot = div().id(id).w(18).h(18).flex_none().flex().items_center().justify_center().rounded(4);
  if (!onClick) return slot;
  return slot
    .text_color(t.dim)
    .cursor_pointer()
    .accessibility_label(open ? "Collapse sub-issues" : "Expand sub-issues")
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .on_click((_e, cx) => onClick(cx))
    .child(Icon(open ? "chevron-down" : "chevron-right", 12));
}

// A whole-panel message: an icon, what happened, what to do, then a command or buttons.
export function Notice({ id, icon, title, detail, command, list, buttons = [] }) {
  const t = theme();
  return v_flex()
    .id(id)
    .flex_1()
    .min_h(0)
    .px(24)
    .gap(10)
    .items_center()
    .justify_center()
    .child(Icon(icon, 24).text_color(t.dim))
    .child(div().font_medium().text_center().whitespace_normal().child(title))
    .when(Boolean(detail), (el) =>
      el.child(
        div().text_size(TEXT.small).text_color(t.muted).whitespace_normal().text_center().child(detail),
      ),
    )
    .when(Boolean(list), (el) =>
      el.child(
        v_flex()
          .gap(4)
          .children(list.map((name) => div().text_size(TEXT.small).text_color(t.foreground).child(name))),
      ),
    )
    .when(Boolean(command), (el) =>
      el.child(
        div()
          .p(8)
          .rounded(6)
          .bg(t.canvas)
          .text_size(TEXT.small)
          .font_family(codeFont())
          .text_color(t.muted)
          .child(command),
      ),
    )
    .when(buttons.length > 0, (el) => el.child(h_flex().gap(8).children(buttons)));
}

export function Busy(label) {
  const t = theme();
  return v_flex()
    .id("board-loading")
    .flex_1()
    .min_h(0)
    .gap(10)
    .items_center()
    .justify_center()
    .text_size(TEXT.small)
    .text_color(t.dim)
    .child(Icon("refresh", 20).spin(SPIN_MS).accessibility_label("Loading"))
    .child(label);
}
