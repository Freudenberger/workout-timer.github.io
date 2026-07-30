/*
 * Ready-made configurations offered on the Select screen.
 * Keys match the `data-preset` attributes in index.html.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.WT = root.WT || {};
    root.WT.quickPresets = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Tabata blocks are modelled as `custom`: 8 exercises of 20/10 per block,
  // one block per round, with a short break between blocks.
  const quickPresets = {
    tabata3: {
      type: "custom",
      prep: 10,
      rounds: 3,
      exercisesPerRound: 8,
      exerciseWork: 20,
      exerciseRest: 10,
      betweenRounds: 10,
    },
    tabata5: {
      type: "custom",
      prep: 10,
      rounds: 5,
      exercisesPerRound: 8,
      exerciseWork: 20,
      exerciseRest: 10,
      betweenRounds: 10,
    },
    // 10 min EMOM with a full minute of work (no rest)
    emom10x60: { type: "emom", prep: 10, rounds: 10, work: 60 },
    // 100 reps, one every 4 seconds
    micro100x4: { type: "micro", prep: 10, reps: 100, interval: 4 },
    hiit10x45_15_60_30: {
      type: "hiit",
      prep: 10,
      rounds: 10,
      work: 45,
      rest: 15,
      warmup: 60,
      cooldown: 30,
    },
    hiit10x40_20_30_30: {
      type: "hiit",
      prep: 10,
      rounds: 10,
      work: 40,
      rest: 20,
      warmup: 30,
      cooldown: 30,
    },
  };

  function getQuickPreset(key) {
    const preset = quickPresets[key];
    return preset ? { ...preset } : null;
  }

  return { quickPresets, getQuickPreset };
});
