// Images in issue markdown as links: the repos are private, so the panel can't load them (BRD §4.11).
// From the approved epic #10 prototype (epic/10-prototype, a28afdf).

function fileName(url) {
  const path = url.split(/[?#]/, 1)[0];
  const name = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(name) || "image";
  } catch {
    return name || "image";
  }
}

// An <img> attribute's value, quoted or not.
const attr = (tag, name) =>
  tag
    .match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
    ?.slice(1)
    .find((v) => v != null) ?? "";
const link = (alt, url) => `[Open image: ${(alt.trim() || fileName(url)).replace(/[[\]]/g, "")}](${url})`;

export function imageLinks(markdown) {
  return String(markdown ?? "")
    .replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (_m, alt, url) => link(alt, url))
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const src = attr(tag, "src");
      return src ? link(attr(tag, "alt"), src) : tag;
    });
}
