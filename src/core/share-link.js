/*
 * Shareable links: config <-> query string.
 * `countdown` in count-up mode is shared as the friendlier `type=countup`.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./workout-types.js"), require("./fields.js"));
  } else {
    root.WT = root.WT || {};
    root.WT.shareLink = factory(root.WT.workoutTypes, root.WT.fields);
  }
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function (workoutTypes, fields) {
    const { normalizeMode } = workoutTypes;

    function shareType(config) {
      return config.type === "countdown" &&
        normalizeMode(config.mode) === "up"
        ? "countup"
        : config.type;
    }

    function serialize(config) {
      if (!config || typeof config !== "object" || !config.type) return "";

      const params = new URLSearchParams();
      const type = shareType(config);
      params.set("type", type);

      Object.entries(config).forEach(([key, value]) => {
        if (key === "type") return;
        if (key === "mode") {
          // count-up is already encoded in the type alias
          if (type === "countup") return;
          if (typeof value === "string") params.set(key, normalizeMode(value));
          return;
        }
        if (typeof value === "number" && !Number.isNaN(value)) {
          params.set(key, String(value));
        }
      });

      return params.toString();
    }

    /** Returns a config, or null when the query is missing/unsupported. */
    function parse(input, options = {}) {
      const qs =
        input instanceof URLSearchParams ? input : new URLSearchParams(input);
      if (!qs.has("type")) return null;

      const rawType = qs.get("type");
      const type = rawType === "countup" ? "countdown" : rawType;
      const supportedTypes = options.supportedTypes || workoutTypes.supportedTypes;
      if (!supportedTypes.has(type)) return null;

      const config = { type };
      if (rawType === "countup") config.mode = "up";

      qs.forEach((value, key) => {
        if (key === "type") return;
        if (key === "mode") {
          if (rawType !== "countup") config.mode = normalizeMode(value);
          return;
        }
        if (fields.isNumericKey(key)) {
          const parsed = parseInt(value, 10);
          // Links are untrusted input: keep every value inside its field bounds
          // so a hand-edited URL cannot build a nonsensical sequence.
          if (!Number.isNaN(parsed)) {
            config[key] = fields.clampForKey(key, parsed);
          }
        }
      });

      if (type === "countdown" && !config.mode) config.mode = "down";

      return config;
    }

    /**
     * Pull the query part out of whatever the user pasted: a full URL, a
     * `?a=1&b=2` fragment, or bare `a=1&b=2`. Returns "" when there is nothing.
     */
    function extractQueryString(raw) {
      const input = String(raw ?? "").trim();
      if (!input) return "";

      if (/^https?:/i.test(input)) {
        try {
          return new URL(input).search.replace(/^\?/, "");
        } catch {
          // fall through to the plain-text handling below
        }
      }

      const questionMark = input.indexOf("?");
      const afterPath =
        questionMark === -1 ? input : input.slice(questionMark + 1);
      return afterPath.split("#")[0].replace(/^\?/, "");
    }

    /** Absolute share URL; `file://` pages report a "null" origin. */
    function buildShareUrl({ origin, pathname = "", query = "" }) {
      const base = !origin || origin === "null" ? "file://" : origin;
      return query ? `${base}${pathname}?${query}` : `${base}${pathname}`;
    }

    return { serialize, parse, extractQueryString, buildShareUrl, shareType };
  },
);
