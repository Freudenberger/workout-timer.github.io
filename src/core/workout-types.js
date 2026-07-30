/*
 * Workout type registry.
 *
 * Every entry is self contained:
 *   label       – short name
 *   optionLabel – long name for the workout type <select>
 *   emoji       – default icon suggestion when pinning
 *   fields      – editable field names, in form order (see fields.js)
 *   defaults    – starting config
 *   normalize   – optional (config) => config hook for legacy/migrated values
 *   build       – (config) => { sequence, meta }
 *
 * An entry here is all a new workout type needs: the type <select>, config
 * form, summary, share links, sequence preview and timer screen all read from
 * this registry. Only the shortcut card on the Select screen (index.html) is
 * still hand written.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./time.js"));
  } else {
    root.WT = root.WT || {};
    root.WT.workoutTypes = factory(root.WT.time);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (time) {
  const { toNonNegativeInteger } = time;

  const MINUTE = 60;

  function prepInterval(duration) {
    return { label: "Get Ready", type: "prep", duration };
  }

  function normalizeMode(mode) {
    return mode === "up" ? "up" : "down";
  }

  /** Count-up / count-down builder, shared by the `countdown` type. */
  function buildCountdown(config = {}) {
    const mode = normalizeMode(config.mode);
    const total = toNonNegativeInteger(config.total, 600);
    const prep = toNonNegativeInteger(config.prep, 0);
    const sequence = [];

    if (prep) sequence.push(prepInterval(prep));

    if (mode === "up") {
      const softLimit = total > 0 ? total : null;
      sequence.push({
        label: "Count Up",
        type: "work",
        duration: total,
        mode: "up",
        softLimit,
      });
      return { sequence, meta: { totalRounds: 1, mode: "up", softLimit } };
    }

    sequence.push({ label: "Timer", type: "work", duration: total });
    return { sequence, meta: { totalRounds: 1, mode: "down" } };
  }

  const registry = {
    emom: {
      label: "EMOM",
      optionLabel: "EMOM (Every Minute On the Minute)",
      emoji: "⏲️",
      fields: ["prep", "rounds", "work"],
      defaults: { prep: 10, rounds: 10, work: 40 },
      // Work inside each 60s block; the remainder of the minute becomes rest.
      build(config) {
        const rounds = config.rounds ?? 10;
        const work = config.work ?? 40;
        const prep = config.prep ?? 10;
        const sequence = [];
        if (prep) sequence.push(prepInterval(prep));
        for (let r = 1; r <= rounds; r++) {
          sequence.push({
            label: `Round ${r} Work`,
            type: "work",
            duration: work,
            round: r,
          });
          const restDuration = Math.max(0, MINUTE - work);
          if (restDuration > 0) {
            sequence.push({
              label: `Round ${r} Rest`,
              type: "rest",
              duration: restDuration,
              round: r,
            });
          }
        }
        return { sequence, meta: { totalRounds: rounds } };
      },
    },

    tabata: {
      label: "Tabata",
      optionLabel: "Tabata",
      emoji: "🔥",
      fields: ["prep", "rounds", "work", "rest"],
      defaults: { prep: 10, rounds: 8, work: 20, rest: 10 },
      build(config) {
        const rounds = config.rounds ?? 8;
        const work = config.work ?? 20;
        const rest = config.rest ?? 10;
        const prep = config.prep ?? 10;
        const sequence = [];
        if (prep) sequence.push(prepInterval(prep));
        for (let r = 1; r <= rounds; r++) {
          sequence.push({
            label: `Round ${r} Work`,
            type: "work",
            duration: work,
            round: r,
          });
          sequence.push({
            label: `Round ${r} Rest`,
            type: "rest",
            duration: rest,
            round: r,
          });
        }
        return { sequence, meta: { totalRounds: rounds } };
      },
    },

    hiit: {
      label: "HIIT",
      optionLabel: "HIIT",
      emoji: "⚡",
      fields: ["prep", "warmup", "rounds", "work", "rest", "cooldown"],
      defaults: {
        prep: 10,
        rounds: 6,
        work: 45,
        rest: 15,
        warmup: 60,
        cooldown: 60,
      },
      build(config) {
        const rounds = config.rounds ?? 6;
        const work = config.work ?? 45;
        const rest = config.rest ?? 15;
        const warmup = config.warmup ?? 0;
        const cooldown = config.cooldown ?? 0;
        const prep = config.prep ?? 10;
        const sequence = [];
        if (prep) sequence.push(prepInterval(prep));
        if (warmup) {
          sequence.push({
            label: "Warm Up",
            type: "prep",
            duration: warmup,
            variant: "warmup",
          });
        }
        for (let r = 1; r <= rounds; r++) {
          sequence.push({
            label: `Round ${r} Work`,
            type: "work",
            duration: work,
            round: r,
          });
          sequence.push({
            label: `Round ${r} Rest`,
            type: "rest",
            duration: rest,
            round: r,
          });
        }
        if (cooldown) {
          sequence.push({
            label: "Cool Down",
            type: "cooldown",
            duration: cooldown,
          });
        }
        return { sequence, meta: { totalRounds: rounds } };
      },
    },

    custom: {
      label: "Custom",
      optionLabel: "Custom",
      emoji: "🛠️",
      fields: [
        "prep",
        "rounds",
        "exercisesPerRound",
        "exerciseWork",
        "exerciseRest",
        "betweenRounds",
      ],
      defaults: {
        prep: 10,
        rounds: 5,
        exercisesPerRound: 3,
        exerciseWork: 30,
        exerciseRest: 10,
        betweenRounds: 30,
      },
      // Presets saved before multi-exercise support only carry work/rest;
      // map them onto the exercise fields and assume a single exercise.
      normalize(config) {
        const next = { ...config };
        const isLegacy = next.work != null || next.rest != null;
        if (!isLegacy) return next;
        if (next.work != null && next.exerciseWork == null) {
          next.exerciseWork = next.work;
        }
        if (next.rest != null && next.exerciseRest == null) {
          next.exerciseRest = next.rest;
        }
        if (next.exercisesPerRound == null) next.exercisesPerRound = 1;
        return next;
      },
      build(config) {
        const rounds = config.rounds ?? 1;
        const exercisesPerRound = config.exercisesPerRound ?? 1;
        const exerciseWork = config.exerciseWork ?? config.work ?? 30;
        const exerciseRest =
          config.exerciseRest ?? config.rest ?? 10;
        const betweenRounds = config.betweenRounds ?? 0;
        const prep = config.prep ?? 10;
        const sequence = [];
        if (prep) sequence.push(prepInterval(prep));
        for (let r = 1; r <= rounds; r++) {
          for (let e = 1; e <= exercisesPerRound; e++) {
            sequence.push({
              label: `R${r} Ex ${e} Work`,
              type: "work",
              duration: exerciseWork,
              round: r,
              exercise: e,
            });
            if (exerciseRest && e < exercisesPerRound) {
              sequence.push({
                label: `R${r} Ex ${e} Rest`,
                type: "rest",
                duration: exerciseRest,
                variant: "rest-exercise",
                round: r,
                exercise: e,
              });
            }
          }
          if (betweenRounds && r < rounds) {
            sequence.push({
              label: `Between Round ${r}`,
              type: "rest",
              duration: betweenRounds,
              variant: "rest-between",
              round: r,
            });
          }
        }
        return { sequence, meta: { totalRounds: rounds, exercisesPerRound } };
      },
    },

    micro: {
      label: "Micro",
      optionLabel: "Micro (Tiny Fixed Interval)",
      emoji: "🎯",
      fields: ["prep", "reps", "interval"],
      defaults: { prep: 10, reps: 100, interval: 5 },
      // One short interval repeated N times (e.g. 1 rep every 5s).
      build(config) {
        const reps = config.reps ?? 50;
        const step = config.interval ?? 5;
        const prep = config.prep ?? 10;
        const sequence = [];
        if (prep) sequence.push(prepInterval(prep));
        for (let i = 1; i <= reps; i++) {
          sequence.push({
            label: `Rep ${i}`,
            type: "work",
            duration: step,
            round: i,
          });
        }
        return { sequence, meta: { totalRounds: reps, roundLabel: "Rep" } };
      },
    },

    countdown: {
      label: "Countdown",
      optionLabel: "Timer (Countdown / Count Up)",
      emoji: "⏳",
      fields: ["prep", "mode", "total"],
      defaults: { prep: 10, mode: "down", total: 600 },
      normalize(config) {
        return { ...config, mode: normalizeMode(config.mode) };
      },
      build: buildCountdown,
    },
  };

  const typeNames = Object.keys(registry);
  const supportedTypes = new Set(typeNames);

  /** Derived map kept for convenience: { [type]: defaults }. */
  const defaultConfigs = typeNames.reduce((acc, type) => {
    acc[type] = { ...registry[type].defaults };
    return acc;
  }, {});

  function getType(type) {
    return registry[type];
  }

  function isSupported(type) {
    return supportedTypes.has(type);
  }

  function getFields(type) {
    return registry[type]?.fields ?? [];
  }

  function getDefaults(type) {
    return { ...(registry[type]?.defaults ?? {}) };
  }

  function getEmoji(type) {
    return registry[type]?.emoji ?? "⭐";
  }

  /** Build a sequence; returns null for unknown types. */
  function build(type, config) {
    const def = registry[type];
    if (!def) return null;
    return def.build(config ?? {});
  }

  return {
    registry,
    typeNames,
    supportedTypes,
    defaultConfigs,
    getType,
    isSupported,
    getFields,
    getDefaults,
    getEmoji,
    build,
    buildCountdown,
    normalizeMode,
  };
});
