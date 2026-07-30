/*
 * Minutes/seconds split arithmetic for duration inputs.
 *
 * Every operation goes through a total-seconds value, so carrying (59s +1 -> 1:00)
 * and borrowing (1:00 -1 -> 0:59) fall out of the clamping instead of being
 * special cased per stepper.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.WT = root.WT || {};
    root.WT.durationSplit = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function clamp(totalSeconds, { min = 0, max = Infinity } = {}) {
    const safe = Number.isFinite(totalSeconds) ? Math.floor(totalSeconds) : 0;
    return Math.min(max, Math.max(Math.max(0, min), safe));
  }

  function toSplit(totalSeconds) {
    const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    return { minutes: Math.floor(safe / 60), seconds: safe % 60 };
  }

  function toSeconds({ minutes, seconds } = {}) {
    const m = Number.isFinite(Number(minutes)) ? Math.floor(Number(minutes)) : 0;
    const s = Number.isFinite(Number(seconds)) ? Math.floor(Number(seconds)) : 0;
    return Math.max(0, m * 60 + s);
  }

  /** Normalize a possibly out-of-range split (e.g. 0m 75s -> 1m 15s). */
  function normalize(split, bounds) {
    return toSplit(clamp(toSeconds(split), bounds));
  }

  function step(split, deltaSeconds, bounds) {
    return toSplit(clamp(toSeconds(split) + deltaSeconds, bounds));
  }

  function stepMinutes(split, delta, bounds) {
    return step(split, delta * 60, bounds);
  }

  function stepSeconds(split, delta, bounds) {
    return step(split, delta, bounds);
  }

  return { clamp, toSplit, toSeconds, normalize, step, stepMinutes, stepSeconds };
});
