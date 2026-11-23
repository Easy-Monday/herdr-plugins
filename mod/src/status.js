// GitHub's Status option colours as theme colours, so pills follow light and dark themes.
const COLORS = {
  GRAY: "muted",
  BLUE: "ansi4",
  GREEN: "ansi2",
  YELLOW: "ansi3",
  RED: "ansi1",
  PINK: "ansi13",
  PURPLE: "ansi5",
};

// Halfway between two #rrggbb colours; a theme has no orange of its own.
function mix(a, b) {
  if (!/^#[0-9a-f]{6}/i.test(a) || !/^#[0-9a-f]{6}/i.test(b)) return a;
  const channel = (i) => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2);
  return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, "0")).join("")}`;
}

export const statusColor = (color, t) =>
  color === "ORANGE" ? mix(t.ansi1, t.ansi3) : t[COLORS[color] ?? "muted"];
