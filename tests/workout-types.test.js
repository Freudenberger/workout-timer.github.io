const test = require("node:test");
const assert = require("node:assert/strict");

const workoutTypes = require("../src/core/workout-types.js");
const fields = require("../src/core/fields.js");
const intervals = require("../src/core/intervals.js");

test("every registered type is self describing", () => {
  workoutTypes.typeNames.forEach((type) => {
    const def = workoutTypes.getType(type);
    assert.ok(def.label, `${type} needs a label`);
    assert.ok(def.optionLabel, `${type} needs an option label`);
    assert.ok(def.emoji, `${type} needs an emoji`);
    assert.equal(typeof def.build, "function", `${type} needs a builder`);
    def.fields.forEach((key) => {
      assert.ok(
        fields.getFieldDef(key),
        `${type} lists unknown field "${key}"`,
      );
      assert.notEqual(
        def.defaults[key],
        undefined,
        `${type} has no default for "${key}"`,
      );
    });
  });
});

test("build returns null for unknown types", () => {
  assert.equal(workoutTypes.build("nope", {}), null);
});

test("emom fills each minute with work then the remaining rest", () => {
  const { sequence, meta } = workoutTypes.build("emom", {
    prep: 10,
    rounds: 2,
    work: 40,
  });

  assert.deepEqual(meta, { totalRounds: 2 });
  assert.deepEqual(sequence, [
    { label: "Get Ready", type: "prep", duration: 10 },
    { label: "Round 1 Work", type: "work", duration: 40, round: 1 },
    { label: "Round 1 Rest", type: "rest", duration: 20, round: 1 },
    { label: "Round 2 Work", type: "work", duration: 40, round: 2 },
    { label: "Round 2 Rest", type: "rest", duration: 20, round: 2 },
  ]);
});

test("emom omits rest when work fills the whole minute", () => {
  const { sequence } = workoutTypes.build("emom", {
    prep: 0,
    rounds: 3,
    work: 60,
  });

  assert.equal(sequence.length, 3);
  assert.ok(sequence.every((item) => item.type === "work"));
});

test("tabata alternates work and rest for every round", () => {
  const { sequence, meta } = workoutTypes.build("tabata", {
    prep: 10,
    rounds: 8,
    work: 20,
    rest: 10,
  });

  assert.equal(meta.totalRounds, 8);
  assert.equal(sequence.length, 1 + 8 * 2);
  assert.equal(intervals.totalDuration(sequence), 10 + 8 * 30);
});

test("hiit brackets the rounds with warmup and cooldown", () => {
  const { sequence } = workoutTypes.build("hiit", {
    prep: 5,
    warmup: 60,
    rounds: 1,
    work: 45,
    rest: 15,
    cooldown: 30,
  });

  assert.deepEqual(
    sequence.map((item) => [item.type, item.variant ?? null]),
    [
      ["prep", null],
      ["prep", "warmup"],
      ["work", null],
      ["rest", null],
      ["cooldown", null],
    ],
  );
});

test("hiit skips warmup and cooldown when they are zero", () => {
  const { sequence } = workoutTypes.build("hiit", {
    prep: 0,
    warmup: 0,
    rounds: 2,
    work: 30,
    rest: 10,
    cooldown: 0,
  });

  assert.equal(sequence.length, 4);
});

test("custom tags exercise rests and between-round rests", () => {
  const { sequence, meta } = workoutTypes.build("custom", {
    prep: 0,
    rounds: 2,
    exercisesPerRound: 2,
    exerciseWork: 30,
    exerciseRest: 10,
    betweenRounds: 60,
  });

  assert.deepEqual(meta, { totalRounds: 2, exercisesPerRound: 2 });
  assert.deepEqual(
    sequence.map((item) => [item.label, item.variant ?? null, item.round, item.exercise ?? null]),
    [
      ["R1 Ex 1 Work", null, 1, 1],
      ["R1 Ex 1 Rest", "rest-exercise", 1, 1],
      ["R1 Ex 2 Work", null, 1, 2],
      ["Between Round 1", "rest-between", 1, null],
      ["R2 Ex 1 Work", null, 2, 1],
      ["R2 Ex 1 Rest", "rest-exercise", 2, 1],
      ["R2 Ex 2 Work", null, 2, 2],
    ],
  );
});

test("custom accepts legacy work/rest values", () => {
  const { sequence } = workoutTypes.build("custom", {
    prep: 0,
    rounds: 1,
    exercisesPerRound: 1,
    work: 25,
    rest: 5,
  });

  assert.equal(sequence.length, 1);
  assert.equal(sequence[0].duration, 25);
});

test("micro repeats one interval and labels rounds as reps", () => {
  const { sequence, meta } = workoutTypes.build("micro", {
    prep: 10,
    reps: 3,
    interval: 4,
  });

  assert.deepEqual(meta, { totalRounds: 3, roundLabel: "Rep" });
  assert.deepEqual(
    sequence.map((item) => item.label),
    ["Get Ready", "Rep 1", "Rep 2", "Rep 3"],
  );
});

test("countdown builds a count-up timer with prep and soft limit", () => {
  const workout = workoutTypes.build("countdown", {
    prep: 30,
    mode: "up",
    total: 600,
  });

  assert.deepEqual(workout, {
    sequence: [
      { label: "Get Ready", type: "prep", duration: 30 },
      {
        label: "Count Up",
        type: "work",
        duration: 600,
        mode: "up",
        softLimit: 600,
      },
    ],
    meta: { totalRounds: 1, mode: "up", softLimit: 600 },
  });
});

test("countdown count-up with total 0 has no soft limit", () => {
  const { sequence, meta } = workoutTypes.build("countdown", {
    prep: 0,
    mode: "up",
    total: 0,
  });

  assert.equal(sequence.length, 1);
  assert.equal(sequence[0].softLimit, null);
  assert.equal(meta.softLimit, null);
  assert.equal(intervals.isOpenEnded(sequence[0]), true);
});

test("countdown builds a plain down timer", () => {
  const workout = workoutTypes.build("countdown", {
    prep: 5,
    mode: "down",
    total: 90,
  });

  assert.deepEqual(workout, {
    sequence: [
      { label: "Get Ready", type: "prep", duration: 5 },
      { label: "Timer", type: "work", duration: 90 },
    ],
    meta: { totalRounds: 1, mode: "down" },
  });
});

test("countdown defaults to counting down from 10 minutes", () => {
  const { sequence, meta } = workoutTypes.build("countdown", {});
  assert.equal(meta.mode, "down");
  assert.equal(sequence[0].duration, 600);
});
