// The mod's settings, from its layout block's props, e.g. { "mod": "project-board", "props": { "refreshSeconds": 120 } }.

// Seconds between board refreshes: default 60, never faster than 60 (BRD §5.3, poll gently).
export function refreshSeconds(settings) {
  const n = settings?.refreshSeconds;
  return Number.isFinite(n) ? Math.max(60, n) : 60;
}
