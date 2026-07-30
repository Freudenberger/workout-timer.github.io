(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.WorkoutTimerCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const defaultConfigs = {
    emom: { prep: 10, rounds: 10, work: 40 },
    tabata: { prep: 10, rounds: 8, work: 20, rest: 10 },
    hiit: { prep: 10, rounds: 6, work: 45, rest: 15, warmup: 60, cooldown: 60 },
    custom: {
      prep: 10,
      rounds: 5,
      exercisesPerRound: 3,
      exerciseWork: 30,
      exerciseRest: 10,
      betweenRounds: 30,
    },
    micro: { prep: 10, reps: 100, interval: 5 },
    countdown: { prep: 10, mode: "down", total: 600 },
  };

  const numericFields = new Set([
    "prep",
    "rounds",
    "work",
    "rest",
    "warmup",
    "cooldown",
    "betweenRounds",
    "exercisesPerRound",
    "exerciseWork",
    "exerciseRest",
    "reps",
    "interval",
    "total",
  ]);

  function normalizeMode(mode) {
    return mode === "up" ? "up" : "down";
  }

  function toNonNegativeInteger(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.floor(parsed));
  }

  function getShareType(config) {
    return config.type === "countdown" && normalizeMode(config.mode) === "up"
      ? "countup"
      : config.type;
  }

  function buildCountdownWorkout(config = {}) {
    const mode = normalizeMode(config.mode);
    const total = toNonNegativeInteger(config.total, 600);
    const prep = toNonNegativeInteger(config.prep, 0);
    const sequence = [];

    if (prep) {
      sequence.push({ label: "Get Ready", type: "prep", duration: prep });
    }

    if (mode === "up") {
      sequence.push({
        label: "Count Up",
        type: "work",
        duration: total,
        mode: "up",
        softLimit: total > 0 ? total : null,
      });
      return {
        sequence,
        meta: {
          totalRounds: 1,
          mode: "up",
          softLimit: total > 0 ? total : null,
        },
      };
    }

    sequence.push({ label: "Timer", type: "work", duration: total });
    return { sequence, meta: { totalRounds: 1, mode: "down" } };
  }

  function serializeConfigToQuery(config) {
    if (!config || typeof config !== "object" || !config.type) return "";

    const params = new URLSearchParams();
    const shareType = getShareType(config);
    params.set("type", shareType);

    Object.entries(config).forEach(([key, value]) => {
      if (key === "type") return;
      if (key === "mode") {
        if (shareType === "countup") return;
        if (typeof value === "string") params.set(key, normalizeMode(value));
        return;
      }
      if (typeof value === "number" && !Number.isNaN(value)) {
        params.set(key, String(value));
      }
    });

    return params.toString();
  }

  function parseQueryParamsToConfig(input, options = {}) {
    const qs =
      input instanceof URLSearchParams ? input : new URLSearchParams(input);
    if (!qs.has("type")) return null;

    const rawType = qs.get("type");
    const type = rawType === "countup" ? "countdown" : rawType;
    const supportedTypes =
      options.supportedTypes || new Set(Object.keys(defaultConfigs));

    if (!supportedTypes.has(type)) return null;

    const cfg = { type };
    if (rawType === "countup") {
      cfg.mode = "up";
    }

    qs.forEach((value, key) => {
      if (key === "type") return;
      if (key === "mode") {
        if (rawType !== "countup") {
          cfg.mode = normalizeMode(value);
        }
        return;
      }
      if (numericFields.has(key)) {
        const parsed = parseInt(value, 10);
        if (!Number.isNaN(parsed)) {
          cfg[key] = parsed;
        }
      }
    });

    if (type === "countdown" && !cfg.mode) {
      cfg.mode = "down";
    }

    return cfg;
  }

  return {
    defaultConfigs,
    buildCountdownWorkout,
    serializeConfigToQuery,
    parseQueryParamsToConfig,
  };
});
