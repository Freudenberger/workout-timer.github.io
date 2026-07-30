const test = require("node:test");
const assert = require("node:assert/strict");

const presenter = require("../src/core/presenter.js");
const workoutTypes = require("../src/core/workout-types.js");

test("sequencePreviewItems uses the variant for styling and marks the current item", () => {
  const { sequence } = workoutTypes.build("custom", {
    prep: 10,
    rounds: 2,
    exercisesPerRound: 2,
    exerciseWork: 30,
    exerciseRest: 10,
    betweenRounds: 60,
  });

  const items = presenter.sequencePreviewItems(sequence, 1);

  assert.deepEqual(items[0], {
    label: "Get Ready",
    timeText: "00:10",
    variant: "prep",
    current: false,
  });
  assert.equal(items[1].current, true);
  assert.deepEqual(
    items.map((item) => item.variant),
    [
      "prep",
      "work",
      "rest-exercise",
      "work",
      "rest-between",
      "work",
      "rest-exercise",
      "work",
    ],
  );
});

test("roundSummary reports round and exercise position", () => {
  const meta = { totalRounds: 5, exercisesPerRound: 3 };
  assert.equal(
    presenter.roundSummary({ type: "work", round: 2, exercise: 3 }, meta),
    "Round 2 / 5 • Exercise 3 / 3",
  );
  assert.equal(
    presenter.roundSummary({ type: "work", round: 4 }, { totalRounds: 8 }),
    "Round 4 / 8",
  );
});

test("roundSummary shows round zero before the first round", () => {
  assert.equal(
    presenter.roundSummary({ type: "prep" }, { totalRounds: 8 }),
    "Round 0 / 8",
  );
});

test("roundSummary uses the meta round label", () => {
  assert.equal(
    presenter.roundSummary(
      { type: "work", round: 7 },
      { totalRounds: 100, roundLabel: "Rep" },
    ),
    "Rep 7 / 100",
  );
});

test("roundSummary describes count-up intervals by their soft limit", () => {
  assert.equal(
    presenter.roundSummary({ type: "work", mode: "up", softLimit: 600 }, {}),
    "Count Up • Soft Limit 10:00",
  );
  assert.equal(
    presenter.roundSummary({ type: "work", mode: "up", softLimit: null }, {}),
    "Count Up • No Limit",
  );
});

test("roundInfoText appends elapsed and left", () => {
  assert.equal(
    presenter.roundInfoText("Round 1 / 8", { elapsed: 65.7, left: 30.2 }),
    "Round 1 / 8 • Elapsed 01:05 • Left 00:31",
  );
  assert.equal(
    presenter.roundInfoText("", { elapsed: 0, left: 0 }),
    "Elapsed 00:00 • Left 00:00",
  );
});

test("nextIntervalText names the upcoming interval", () => {
  assert.equal(
    presenter.nextIntervalText({ label: "Round 2 Work", duration: 45 }),
    "Next: Round 2 Work (00:45)",
  );
  assert.equal(presenter.nextIntervalText(undefined), "");
});

test("intervalView shows the full duration when entering a countdown interval", () => {
  const { sequence, meta } = workoutTypes.build("tabata", {
    prep: 10,
    rounds: 8,
    work: 20,
    rest: 10,
  });
  const indexed = sequence.map((item, index) => ({ ...item, index }));

  const view = presenter.intervalView(indexed[1], {
    sequence: indexed,
    meta,
    value: 20,
  });

  assert.deepEqual(view, {
    label: "Round 1 Work",
    mainTime: "00:20",
    roundInfo: "Round 1 / 8",
    nextText: "Next: Round 1 Rest (00:10)",
    phase: "work",
    variant: "work",
    softLimitExceeded: false,
  });
});

test("intervalView flags a count-up interval past its soft limit", () => {
  const interval = {
    label: "Count Up",
    type: "work",
    index: 0,
    mode: "up",
    softLimit: 60,
    duration: 60,
  };

  assert.equal(
    presenter.intervalView(interval, { sequence: [interval], value: 61 })
      .softLimitExceeded,
    true,
  );
  assert.equal(
    presenter.intervalView(interval, { sequence: [interval], value: 10 })
      .mainTime,
    "00:10",
  );
});

test("readyView summarizes a freshly built workout", () => {
  const { sequence, meta } = workoutTypes.build("tabata", {
    prep: 10,
    rounds: 8,
    work: 20,
    rest: 10,
  });

  assert.deepEqual(presenter.readyView(sequence, meta), {
    label: "Ready",
    mainTime: "00:10",
    roundInfo: "Round 0 / 8 • Elapsed 00:00 • Left 04:00",
    nextText: "Next: Round 1 Work (00:20)",
    totalDurationText: "04:10",
    roundCountText: "8",
  });
});

test("readyView copes with an open ended count-up workout", () => {
  const { sequence, meta } = workoutTypes.build("countdown", {
    prep: 0,
    mode: "up",
    total: 0,
  });

  const view = presenter.readyView(sequence, meta);
  assert.equal(view.mainTime, "00:00");
  assert.equal(view.totalDurationText, "∞");
  assert.equal(view.roundInfo, "Count Up • No Limit • Elapsed 00:00 • Left ∞");
});

test("progressPercent tracks the current interval", () => {
  assert.equal(presenter.progressPercent({ duration: 20 }, 20), 0);
  assert.equal(presenter.progressPercent({ duration: 20 }, 15), 25);
  assert.equal(presenter.progressPercent({ duration: 20 }, 0), 100);
  assert.equal(
    presenter.progressPercent({ mode: "up", softLimit: 60 }, 30),
    50,
  );
  assert.equal(
    presenter.progressPercent({ mode: "up", softLimit: 60 }, 90),
    100,
  );
});

test("progressPercent stays at zero for open ended intervals", () => {
  assert.equal(
    presenter.progressPercent({ mode: "up", softLimit: null }, 42),
    0,
  );
  assert.equal(presenter.progressPercent({ duration: 0 }, 0), 0);
});

test("tickView combines time, progress and effective totals", () => {
  const { sequence, meta } = workoutTypes.build("tabata", {
    prep: 10,
    rounds: 2,
    work: 20,
    rest: 10,
  });

  const view = presenter.tickView({
    interval: sequence[1],
    value: 15,
    sequence,
    meta,
    position: 1,
  });

  assert.equal(view.mainTime, "00:15");
  assert.equal(view.percent, 25);
  assert.equal(view.roundInfo, "Round 1 / 2 • Elapsed 00:05 • Left 00:55");
  assert.equal(view.softLimitExceeded, false);
  assert.deepEqual(view.effective, { total: 60, elapsed: 5, left: 55 });
});

test("finalCountdownFrequency only cues the last three seconds", () => {
  assert.equal(presenter.finalCountdownFrequency(4), null);
  assert.equal(presenter.finalCountdownFrequency(3), 520);
  assert.equal(presenter.finalCountdownFrequency(2), 520);
  assert.equal(presenter.finalCountdownFrequency(1), 880);
  assert.equal(presenter.finalCountdownFrequency(0), null);
  assert.equal(presenter.finalCountdownFrequency(Infinity), null);
});

test("controlState enables the right buttons per state", () => {
  const idle = presenter.controlState("idle");
  assert.deepEqual(
    [idle.start.disabled, idle.pause.disabled, idle.reset.disabled, idle.mark.disabled, idle.skip.disabled],
    [false, true, true, true, true],
  );
  assert.equal(idle.pause.label, "Pause");

  const running = presenter.controlState("running");
  assert.deepEqual(
    [running.start.disabled, running.pause.disabled, running.reset.disabled, running.mark.disabled, running.skip.disabled],
    [true, false, false, false, false],
  );

  const paused = presenter.controlState("paused");
  assert.equal(paused.pause.label, "Resume");
  assert.equal(paused.start.disabled, true);
  assert.equal(paused.skip.disabled, false);

  const finished = presenter.controlState("finished");
  assert.deepEqual(
    [finished.start.disabled, finished.pause.disabled, finished.reset.disabled, finished.mark.disabled, finished.skip.disabled],
    [false, true, false, true, true],
  );
});

test("shouldLog keeps work and prep, drops plain rests", () => {
  assert.equal(presenter.shouldLog({ type: "work" }), true);
  assert.equal(presenter.shouldLog({ type: "prep" }), true);
  assert.equal(presenter.shouldLog({ type: "rest" }), false);
  assert.equal(presenter.shouldLog({ type: "cooldown" }), false);
  assert.equal(presenter.shouldLog({ type: "rest" }, { skipped: true }), true);
  assert.equal(presenter.shouldLog({ type: "rest" }, { marked: true }), true);
  assert.equal(presenter.shouldLog(null, { customMessage: "Paused" }), true);
  assert.equal(presenter.shouldLog(null), false);
});

test("logEntryView describes a completed interval", () => {
  const view = presenter.logEntryView(
    { label: "Round 1 Work", type: "work" },
    { elapsed: 30.4, remaining: 90.2 },
  );

  assert.deepEqual(view, {
    icon: "✅",
    iconClass: "text-emerald-400",
    label: "Round 1 Work",
    details: ["(Elapsed: 00:30 | Left: 01:31)"],
    classes: [],
  });
});

test("logEntryView marks manual marks with the delta since the last one", () => {
  const view = presenter.logEntryView(
    { label: "Rep 12", type: "work" },
    { elapsed: 100, remaining: 50, marked: true, timeSinceLastMark: 12 },
  );

  assert.equal(view.icon, "🛑");
  assert.deepEqual(view.classes, ["marked"]);
  assert.deepEqual(view.details, ["(Elapsed: 01:40 | Left: 00:50)", "(+00:12)"]);
});

test("logEntryView renders skips, pauses and prep differently", () => {
  const skipped = presenter.logEntryView(
    { label: "Round 2 Rest", type: "rest" },
    { elapsed: 10, remaining: 5, skipped: true },
  );
  assert.equal(skipped.icon, "⏭️");
  assert.deepEqual(skipped.classes, ["skipped"]);

  const paused = presenter.logEntryView(null, {
    elapsed: 10,
    remaining: 5,
    customMessage: "Paused",
  });
  assert.equal(paused.icon, "⏸️");
  assert.equal(paused.label, "Paused");
  assert.deepEqual(paused.details, []);
  assert.deepEqual(paused.classes, ["pause"]);

  const prep = presenter.logEntryView({ label: "Get Ready", type: "prep" }, {});
  assert.equal(prep.icon, "⏰");
  assert.deepEqual(prep.details, []);
});
