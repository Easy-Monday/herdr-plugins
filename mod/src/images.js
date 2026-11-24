// Images in issue markdown as links: the repos are private, so the panel can't load them (BRD §4.11).
// From the approved epic #10 prototype (epic/10-prototype, a28afdf).
// Bugs #52 and #49: one linear, index-based scan replaces the prototype's two regexes, which were
// quadratic on crafted bodies (CWE-1333) and missed image forms. Code spans and fences stay as written.

// shortcut: text past 65,536 characters (GitHub's limit for an issue or comment body, so only
// non-GitHub input) is kept as written, images included; scan it too if longer bodies ever reach the panel.
const MAX = 65_536;
const LABEL_MAX = 999; // CommonMark's longest link label
const WS = " \t\n\r\f";
const PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

function fileName(url) {
  const path = url.split(/[?#]/, 1)[0];
  const name = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(name) || "image";
  } catch {
    return name || "image";
  }
}

const link = (alt, url) => `[Open image: ${(alt.trim() || fileName(url)).replace(/[[\]]/g, "")}](${url})`;
const label = (text) => text.trim().replace(/\s+/g, " ").toLowerCase();
const spaces = (url) => url.replace(/ /g, "%20");

export function imageLinks(markdown) {
  const text = String(markdown ?? "");
  return text.length > MAX ? rewrite(text.slice(0, MAX)) + text.slice(MAX) : rewrite(text);
}

const FENCE = / {0,3}(`{3,}|~{3,})([^\n]*)/y;
const FENCE_END = / {0,3}(`{3,}|~{3,})[ \t]*(?:\n|$)/y;
const DEF = / {0,3}\[([^[\]\n]{1,999})\]:[ \t]*(?:<([^<>\n]*)>|(\S+))/y;

// Fenced code blocks and code spans (`code[i]`: one starts at i and ends before code[i]), and the
// reference definitions, in one forward pass.
function blocks(s) {
  const n = s.length;
  const code = new Array(n).fill(0);
  const defs = new Map();
  // Every backtick run by length, so a code span's closer is found by a pointer that only moves forward.
  const runs = new Map();
  for (let i = 0; i < n; ) {
    if (s[i] !== "`") { i++; continue; }
    let j = i;
    while (s[j] === "`") j++;
    if (!runs.has(j - i)) runs.set(j - i, { at: [], next: 0 });
    runs.get(j - i).at.push(i);
    i = j;
  }
  let blank = -1; // the next blank line: a code span doesn't cross one
  for (let i = 0; i < n; ) {
    if (i === 0 || s[i - 1] === "\n") {
      FENCE.lastIndex = i;
      const f = FENCE.exec(s);
      if (f && !(f[1][0] === "`" && f[2].includes("`"))) {
        let end = n;
        for (let q = s.indexOf("\n", i); q >= 0 && q < n; q = s.indexOf("\n", q + 1)) {
          FENCE_END.lastIndex = q + 1;
          const e = FENCE_END.exec(s);
          if (e && e[1][0] === f[1][0] && e[1].length >= f[1].length) { end = FENCE_END.lastIndex; break; }
        }
        code[i] = end;
        i = end;
        continue;
      }
      DEF.lastIndex = i;
      const d = DEF.exec(s);
      if (d && !defs.has(label(d[1]))) defs.set(label(d[1]), spaces(d[2] ?? d[3]));
    }
    if (s[i] === "\\" && PUNCT.includes(s[i + 1] ?? " ")) { i += 2; continue; }
    if (s[i] !== "`") { i++; continue; }
    let j = i;
    while (s[j] === "`") j++;
    // No run of this length when an escaped backtick shortened it ("\``"): then there's no closer.
    const run = runs.get(j - i) ?? { at: [], next: 0 };
    while (run.at[run.next] <= i) run.next++;
    if (blank < i) blank = s.indexOf("\n\n", i) < 0 ? n : s.indexOf("\n\n", i);
    const closer = run.at[run.next];
    if (closer !== undefined && closer < blank) {
      code[i] = closer + j - i;
      i = code[i];
    } else {
      i = j;
    }
  }
  return { code, defs };
}

// close[i]: the index of the ] that closes the [ at i, or -1. Brackets in code or escaped don't count.
function brackets(s, code) {
  const close = new Array(s.length).fill(-1);
  const open = [];
  for (let i = 0; i < s.length; i++) {
    if (code[i]) i = code[i] - 1;
    else if (s[i] === "\\") i++;
    else if (s[i] === "[") open.push(i);
    else if (s[i] === "]" && open.length) close[open.pop()] = i;
  }
  return close;
}

function rewrite(s) {
  const n = s.length;
  const { code, defs } = blocks(s);
  const close = brackets(s, code);

  // next(set)[i]: the first index from i whose character is in `set` (with `not`: isn't), else n.
  // Built once per set, so no lookahead below rescans text another attempt already scanned.
  const tables = new Map();
  const next = (set, not = false) => {
    const key = `${not}${set}`;
    if (!tables.has(key)) {
      const t = new Array(n + 1);
      t[n] = n;
      for (let i = n - 1; i >= 0; i--) t[i] = set.includes(s[i]) !== not ? i : t[i + 1];
      tables.set(key, t);
    }
    return tables.get(key);
  };
  const skipWs = (p) => next(WS, true)[p];

  // `(destination "title")` from p, just after the "(". Titles may use "", '' or ().
  // shortcut: a bare destination ends at its first ")" or space, so `(a_(b))` links `a_(b` and the
  // output's own ")" closes it again; parse balanced parentheses if such URLs show up wrong.
  const inline = (p) => {
    p = skipWs(p);
    let a, b;
    if (s[p] === "<") {
      const q = next("<>\n")[p + 1];
      if (s[q] !== ">") return null;
      [a, b, p] = [p + 1, q, q + 1];
    } else {
      [a, b] = [p, next(`${WS})`)[p]];
      p = b;
    }
    p = skipWs(p);
    if (p > b && (s[p] === '"' || s[p] === "'" || s[p] === "(")) {
      const q = next(s[p] === "(" ? ")" : s[p])[p + 1];
      if (q >= n) return null;
      p = skipWs(q + 1);
    }
    return s[p] === ")" && b > a ? { url: spaces(s.slice(a, b)), end: p + 1 } : null;
  };

  // What follows a link's or image's text [from, j): an inline target or a full, collapsed or
  // shortcut reference to a definition. Returns { url, end } or null.
  const target = (from, j) => {
    if (s[j + 1] === "(") {
      const t = inline(j + 2);
      if (t) return t;
    }
    let [a, b, end] = [from, j, j + 1];
    const k = s[j + 1] === "[" ? close[j + 1] : -1;
    if (k > j + 2) [a, b, end] = [j + 2, k, k + 1];
    else if (k === j + 2) end = k + 1;
    if (!defs.size || b - a > LABEL_MAX) return null;
    const url = defs.get(label(s.slice(a, b)));
    return url === undefined ? null : { url, end };
  };

  const image = (i) => {
    const j = close[i + 1];
    const t = j > 0 && target(i + 2, j);
    return t ? { alt: s.slice(i + 2, j), url: t.url, end: t.end } : null;
  };

  // A linked image, like a CI badge: [![alt](src)](href). A link can't hold a link, so it becomes
  // one link to the image (BRD §4.11) and the outer href is dropped.
  const badge = (i) => {
    const k = close[i];
    const m = k > 0 && image(i + 1);
    const t = m && m.end === k && target(i + 1, k);
    return t ? { ...m, end: t.end } : null;
  };

  // An <img> tag, its attributes read in order, so a quoted value may hold ">" or "src=".
  const img = (i) => {
    let p = i + 4;
    if (p >= n || !`${WS}/`.includes(s[p])) return null;
    const attrs = new Map();
    for (;;) {
      p = next(`${WS}/`, true)[p];
      if (p >= n) return null;
      if (s[p] === ">") break;
      const e = next(`${WS}/>="'<\``)[p];
      if (e === p) return null;
      const name = s.slice(p, e).toLowerCase();
      let [a, b] = [e, e];
      p = skipWs(e);
      if (s[p] === "=") {
        p = skipWs(p + 1);
        if (s[p] === '"' || s[p] === "'") {
          const q = next(s[p])[p + 1];
          if (q >= n) return null;
          [a, b, p] = [p + 1, q, q + 1];
        } else {
          const q = next(`${WS}"'=<>\``)[p];
          if (q === p) return null;
          [a, b, p] = [p, q, q];
        }
      }
      if (!attrs.has(name) && (name === "src" || name === "srcset" || name === "alt")) attrs.set(name, s.slice(a, b));
    }
    const url = attrs.get("src")?.trim() || (attrs.get("srcset") ?? "").trim().split(/[\s,]+/)[0];
    return url ? { alt: attrs.get("alt") ?? "", url: spaces(url), end: p + 1 } : null;
  };

  const out = [];
  let from = 0;
  for (let i = 0; i < n; ) {
    if (code[i]) { i = code[i]; continue; }
    const c = s[i];
    if (c === "\\") { i += 2; continue; }
    const m =
      c === "!" && s[i + 1] === "[" ? image(i)
      : c === "[" && s[i + 1] === "!" && s[i + 2] === "[" ? badge(i)
      : c === "<" && s.slice(i + 1, i + 4).toLowerCase() === "img" ? img(i)
      : null;
    if (m) {
      out.push(s.slice(from, i), link(m.alt, m.url));
      i = from = m.end;
    } else {
      i++;
    }
  }
  out.push(s.slice(from));
  return out.join("");
}
