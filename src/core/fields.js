/*
 * Catalog of every editable config field.
 *
 * A field def describes how a value is edited, validated and shown:
 *   label     – human label (also used in the config summary)
 *   min/max   – inclusive bounds for numeric fields
 *   duration  – value is a number of seconds and gets the minutes/seconds split UI
 *   kind      – 'number' (default) or 'select'
 *   options   – for selects: [{ value, label }]
 *   hint      – optional helper text rendered under the control
 *
 * Adding a field to a workout type means adding it here once and listing its
 * name in that type's `fields` array (see workout-types.js).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.WT = root.WT || {};
    root.WT.fields = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FIELD_DEFS = {
    rounds: { label: "Rounds", min: 1, max: 200 },
    // legacy single work/rest pair (still used by emom/tabata/hiit)
    work: { label: "Work (s)", min: 1, max: 3600, duration: true },
    rest: { label: "Rest (s)", min: 0, max: 3600, duration: true },
    warmup: { label: "Warmup (s)", min: 0, max: 1200, duration: true },
    cooldown: { label: "Cooldown (s)", min: 0, max: 1200, duration: true },
    prep: { label: "Prep (s)", min: 0, max: 1200, duration: true },
    betweenRounds: {
      label: "Between Rounds Rest (s)",
      min: 0,
      max: 1200,
      duration: true,
    },
    exercisesPerRound: { label: "Exercises / Round", min: 1, max: 50 },
    exerciseWork: { label: "Exercise Work (s)", min: 1, max: 3600, duration: true },
    exerciseRest: { label: "Exercise Rest (s)", min: 0, max: 3600, duration: true },
    reps: { label: "Reps (Intervals)", min: 1, max: 10000 },
    interval: { label: "Interval (s)", min: 1, max: 3600, duration: true },
    mode: {
      label: "Mode",
      kind: "select",
      options: [
        { value: "down", label: "Count Down" },
        { value: "up", label: "Count Up" },
      ],
      hint: "Count up starts at 00:00. Set Total / Soft Limit to 0 for no upper limit.",
    },
    total: {
      label: "Total / Soft Limit (s)",
      min: 0,
      max: 24 * 3600,
      duration: true,
    },
  };

  const DURATION_KEYS = new Set(
    Object.keys(FIELD_DEFS).filter((key) => FIELD_DEFS[key].duration),
  );

  /** Every field that carries a number — used when (de)serializing share links. */
  const NUMERIC_KEYS = new Set(
    Object.keys(FIELD_DEFS).filter((key) => FIELD_DEFS[key].kind !== "select"),
  );

  function getFieldDef(key) {
    return FIELD_DEFS[key];
  }

  function isDurationKey(key) {
    return DURATION_KEYS.has(key);
  }

  function isNumericKey(key) {
    return NUMERIC_KEYS.has(key);
  }

  function clampForKey(key, value) {
    const def = FIELD_DEFS[key];
    if (!def) return value;
    let next = value;
    if (typeof def.min === "number") next = Math.max(def.min, next);
    if (typeof def.max === "number") next = Math.min(def.max, next);
    return next;
  }

  /** Highest whole minute allowed for a duration field, or null when unbounded. */
  function maxMinutesForKey(key) {
    const def = FIELD_DEFS[key];
    if (!def || typeof def.max !== "number") return null;
    return Math.floor(def.max / 60);
  }

  return {
    FIELD_DEFS,
    DURATION_KEYS,
    NUMERIC_KEYS,
    getFieldDef,
    isDurationKey,
    isNumericKey,
    clampForKey,
    maxMinutesForKey,
  };
});
