// The look: Herdr's own panel conventions as small components. UI only: values in, callbacks out.
// Adapted from Branch PR (munza/herdr-mods, Apache-2.0): TEXT, Icon and Panel from
// views/ui.js. Changed: TEXT keeps three of its sizes, Icon takes the folder from the
// installed mod name, and Panel takes the id directly and has no rounded border.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, settings } from "herdr";
import { MOD } from "./src/name.js";
import { statusColor } from "./src/status.js";

export const TEXT = { caption: 11, small: 12, body: 13 };

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

// Board name over owner/repo.
export function Header({ title, subtitle }) {
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
    );
}

// StatusPill, Progress and IssueNumber follow the approved epic #1 prototype (epic/1-prototype, cac901d).
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

export const IssueNumber = (n) =>
  div().flex_none().text_size(TEXT.caption).text_color(theme().dim).font_family(codeFont()).child(`#${n}`);

// A whole-panel message: an icon, what happened, what to do, then a list of names.
export function Notice({ id, icon, title, detail, list }) {
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
      el.child(div().text_size(TEXT.small).text_color(t.muted).whitespace_normal().text_center().child(detail)),
    )
    .when(Boolean(list), (el) =>
      el.child(
        v_flex()
          .gap(4)
          .children(list.map((name) => div().text_size(TEXT.small).text_color(t.foreground).child(name))),
      ),
    );
}
