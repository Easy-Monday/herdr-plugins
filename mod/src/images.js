// Images in issue markdown: sha-pinned GitHub images are fetched through gh and shown inline
// (epic #18, spike #19); any other image, or one whose fetch fails, is an Open image link (BRD §4.11).

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
export const imageLink = (alt, url) => `[Open image: ${(alt.trim() || fileName(url)).replace(/[[\]]/g, "")}](${url})`;

export function imageLinks(markdown) {
  return String(markdown ?? "")
    .replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (_m, alt, url) => imageLink(alt, url))
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const src = attr(tag, "src");
      return src ? imageLink(attr(tag, "alt"), src) : tag;
    });
}

// Only sha-pinned blob images are fetched, so a cached file never goes stale.
const BLOB =
  /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/blob\/([0-9a-f]{40})\/([A-Za-z0-9._~%/-]+\.(png|jpe?g|gif|webp))\?raw=true$/i;

const badSegment = (s) => {
  try {
    const d = decodeURIComponent(s);
    return !d || d.includes("/") || /^\.+$/.test(d);
  } catch {
    return true;
  }
};

// { api, ext } for `gh api`, or null when the URL isn't one the panel fetches.
export function imageSource(url) {
  const m = BLOB.exec(String(url ?? ""));
  if (!m) return null;
  const [, owner, repo, sha, path, ext] = m;
  if (/^\.+$/.test(repo) || path.split("/").some(badSegment)) return null;
  return { api: `repos/${owner}/${repo}/contents/${path}?ref=${sha}`, ext: ext.toLowerCase() };
}

// cyrb53: a 53-bit string hash, plenty to key a cache of screenshots by URL.
function hash(s) {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761);
    b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(16).padStart(14, "0");
}

export const cachePath = (url, dir) => `${dir}/${hash(url)}.${imageSource(url)?.ext ?? "img"}`;

const IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|<img\b[^>]*>/gi;

// The markdown cut at each fetchable image: [{ text } | { url, alt }]. Other images stay in the text.
export function splitImages(markdown) {
  const md = String(markdown ?? "");
  const parts = [];
  let last = 0;
  for (const m of md.matchAll(IMAGE)) {
    const url = m[2] ?? attr(m[0], "src");
    if (!imageSource(url)) continue;
    if (m.index > last) parts.push({ text: md.slice(last, m.index) });
    parts.push({ url, alt: (m[1] ?? attr(m[0], "alt")).trim() || fileName(url) });
    last = m.index + m[0].length;
  }
  if (last < md.length) parts.push({ text: md.slice(last) });
  return parts.filter((p) => p.url || p.text.trim());
}
