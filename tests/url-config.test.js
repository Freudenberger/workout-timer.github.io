/*
 * End to end coverage of a shared link: query string -> config -> sequence.
 * This is the path taken both by ?type=... on load and by the "import URL" box.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const shareLink = require("../src/core/share-link.js");
const config = require("../src/core/config.js");
const workoutTypes = require("../src/core/workout-types.js");
const intervals = require("../src/core/intervals.js");
const quickPresets = require("../src/core/quick-presets.js");

/** What the app does with an incoming link. */
function loadUrl(input) {
  const parsed = shareLink.parse(shareLink.extractQueryString(input));
  if (!parsed) return null;
  const cfg = config.mergeWithDefaults(parsed.type, parsed);
  return { cfg, ...workoutTypes.build(cfg.type, cfg) };
}

test("a full tabata link builds exactly the shared workout", () => {
  const { cfg, sequence, meta } = loadUrl(
    "https://freudenberger.github.io/workout-timer/?type=tabata&prep=5&rounds=2&work=30&rest=15",
  );

  assert.deepEqual(cfg, {
    type: "tabata",
    prep: 5,
    rounds: 2,
    work: 30,
    rest: 15,
  });
  assert.equal(meta.totalRounds, 2);
  assert.deepEqual(
    sequence.map((item) => [item.label, item.duration]),
    [
      ["Get Ready", 5],
      ["Round 1 Work", 30],
      ["Round 1 Rest", 15],
      ["Round 2 Work", 30],
      ["Round 2 Rest", 15],
    ],
  );
  assert.equal(intervals.totalDuration(sequence), 95);
});

test("a partial link fills the rest from the type defaults", () => {
  const { cfg } = loadUrl("?type=hiit&rounds=3");

  assert.deepEqual(cfg, {
    type: "hiit",
    prep: 10,
    rounds: 3,
    work: 45,
    rest: 15,
    warmup: 60,
    cooldown: 60,
  });
});

test("a link may switch a count-up timer off", () => {
  const up = loadUrl("?type=countup&prep=0&total=300");
  assert.equal(up.cfg.mode, "up");
  assert.deepEqual(up.sequence, [
    {
      label: "Count Up",
      type: "work",
      duration: 300,
      mode: "up",
      softLimit: 300,
    },
  ]);

  const down = loadUrl("?type=countdown&prep=0&total=300");
  assert.equal(down.cfg.mode, "down");
  assert.deepEqual(down.sequence, [
    { label: "Timer", type: "work", duration: 300 },
  ]);
});

test("a count-up link without a total builds an open ended timer", () => {
  const { sequence, meta } = loadUrl("?type=countup&prep=0&total=0");

  assert.equal(meta.softLimit, null);
  assert.equal(intervals.isOpenEnded(sequence[0]), true);
  assert.equal(intervals.totalDuration(sequence), Infinity);
});

test("a legacy custom link is migrated onto the exercise fields", () => {
  const { cfg, sequence } = loadUrl("?type=custom&prep=0&rounds=2&work=20&rest=5");

  assert.equal(cfg.exerciseWork, 20);
  assert.equal(cfg.exerciseRest, 5);
  assert.equal(cfg.exercisesPerRound, 1);
  assert.deepEqual(
    sequence.map((item) => [item.label, item.duration]),
    [
      ["R1 Ex 1 Work", 20],
      ["Between Round 1", 30],
      ["R2 Ex 1 Work", 20],
    ],
  );
});

test("a modern custom link keeps its multi-exercise rounds", () => {
  const { cfg, sequence } = loadUrl(
    "?type=custom&prep=0&rounds=2&exercisesPerRound=3&exerciseWork=40&exerciseRest=20&betweenRounds=0",
  );

  assert.equal(cfg.exercisesPerRound, 3);
  assert.equal(sequence.length, 2 * (3 + 2));
  assert.equal(intervals.totalDuration(sequence), 2 * (3 * 40 + 2 * 20));
});

test("an unknown or incomplete link is rejected instead of guessed", () => {
  assert.equal(loadUrl("?rounds=5&work=30"), null);
  assert.equal(loadUrl("?type=marathon&rounds=5"), null);
  assert.equal(loadUrl("https://freudenberger.github.io/workout-timer/"), null);
  assert.equal(loadUrl(""), null);
});

test("unknown parameters in a link never reach the sequence", () => {
  const { cfg, sequence } = loadUrl(
    "?type=emom&prep=0&rounds=1&work=60&utm_source=twitter&evil=<script>",
  );

  assert.equal(cfg.utm_source, undefined);
  assert.equal(cfg.evil, undefined);
  assert.deepEqual(sequence, [
    { label: "Round 1 Work", type: "work", duration: 60, round: 1 },
  ]);
});

test("every workout type survives a share round-trip", () => {
  workoutTypes.typeNames.forEach((type) => {
    const original = config.mergeWithDefaults(type, {});
    const query = shareLink.serialize(original);
    const restored = loadUrl(query);

    assert.ok(restored, `${type} link should be parseable`);
    assert.deepEqual(restored.cfg, original, `${type} lost data in its link`);
    assert.deepEqual(
      restored.sequence,
      workoutTypes.build(type, original).sequence,
      `${type} rebuilt a different sequence`,
    );
  });
});

test("a count-up config survives a share round-trip", () => {
  const original = config.mergeWithDefaults("countdown", {
    mode: "up",
    total: 1800,
  });
  const restored = loadUrl(shareLink.serialize(original));

  assert.deepEqual(restored.cfg, original);
});

test("every quick preset survives a share round-trip", () => {
  Object.keys(quickPresets.quickPresets).forEach((key) => {
    const preset = quickPresets.getQuickPreset(key);
    const expected = config.mergeWithDefaults(preset.type, preset);
    const restored = loadUrl(shareLink.serialize(expected));

    assert.deepEqual(restored.cfg, expected, `${key} lost data in its link`);
  });
});

test("a hand-edited link cannot build a nonsensical workout", () => {
  // Negative durations used to reach the sequence as-is.
  const negative = loadUrl("?type=emom&prep=-30&rounds=-2&work=40");
  assert.deepEqual(negative.cfg, {
    type: "emom",
    prep: 0,
    rounds: 1,
    work: 40,
  });
  assert.deepEqual(negative.sequence, [
    { label: "Round 1 Work", type: "work", duration: 40, round: 1 },
    { label: "Round 1 Rest", type: "rest", duration: 20, round: 1 },
  ]);

  const huge = loadUrl("?type=micro&prep=99999&reps=999999&interval=99999");
  assert.deepEqual(huge.cfg, {
    type: "micro",
    prep: 1200,
    reps: 10000,
    interval: 3600,
  });
  assert.equal(huge.sequence.length, 10001);
  assert.ok(
    huge.sequence.every((item) => item.duration > 0),
    "no interval should be empty or negative",
  );
});

test("a link with zero durations keeps the workout minimal but valid", () => {
  const { sequence } = loadUrl("?type=hiit&prep=0&warmup=0&rounds=1&work=1&rest=0&cooldown=0");

  assert.deepEqual(sequence, [
    { label: "Round 1 Work", type: "work", duration: 1, round: 1 },
    { label: "Round 1 Rest", type: "rest", duration: 0, round: 1 },
  ]);
});
