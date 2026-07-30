/*
 * Time formatting helpers.
 * Pure: safe to use from both the browser bundle and node tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.WT = root.WT || {};
    root.WT.time = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const pad = (n) => String(n).padStart(2, "0");

  function formatTime(sec) {
    if (!Number.isFinite(sec)) return "∞";
    const safe = Math.max(0, Math.floor(sec));
    return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
  }

  function toNonNegativeInteger(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.floor(parsed));
  }

  return { pad, formatTime, toNonNegativeInteger };
});
