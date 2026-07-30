/*
 * Config objects: { type, ...fieldValues }.
 * Merging with defaults, legacy normalization, fingerprints and summary rows.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./workout-types.js"),
      require("./fields.js"),
      require("./time.js"),
    );
  } else {
    root.WT = root.WT || {};
    root.WT.config = factory(root.WT.workoutTypes, root.WT.fields, root.WT.time);
  }
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function (workoutTypes, fields, time) {
    /**
     * Normalize the incoming values (legacy field mapping, mode fallbacks) and
     * then fill in whatever is still missing from the type defaults.
     *
     * Normalizing first is what lets an old preset holding only `work`/`rest`
     * win over the modern defaults it does not know about.
     */
    function mergeWithDefaults(type, config = {}) {
      const def = workoutTypes.getType(type);
      const incoming = { ...config };
      delete incoming.type;
      const normalized = def?.normalize ? def.normalize(incoming) : incoming;
      return { type, ...workoutTypes.getDefaults(type), ...normalized };
    }

    /** Stable identity of a config, used to detect an already pinned workout. */
    function fingerprint(config) {
      return Object.keys(config)
        .sort()
        .map((key) => `${key}:${config[key]}`)
        .join("|");
    }

    /** Human readable value for one field. */
    function formatFieldValue(key, value) {
      const def = fields.getFieldDef(key);
      if (def?.kind === "select") {
        const option = def.options?.find((o) => o.value === value);
        return option ? option.label : String(value);
      }
      if (fields.isDurationKey(key)) return time.formatTime(Number(value) || 0);
      return String(value);
    }

    /**
     * Rows for the config summary list: [{ key, label, value }].
     * Unknown keys fall back to their raw name so nothing silently disappears.
     */
    function summaryRows(config = {}) {
      return Object.keys(config)
        .filter((key) => key !== "type")
        .map((key) => ({
          key,
          label: fields.getFieldDef(key)?.label || key,
          value: formatFieldValue(key, config[key]),
        }));
    }

    return {
      mergeWithDefaults,
      fingerprint,
      formatFieldValue,
      summaryRows,
    };
  },
);
