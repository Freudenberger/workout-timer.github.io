const test = require("node:test");
const assert = require("node:assert/strict");

const split = require("../src/core/duration-split.js");

test("toSplit breaks seconds into minutes and seconds", () => {
  assert.deepEqual(split.toSplit(0), { minutes: 0, seconds: 0 });
  assert.deepEqual(split.toSplit(59), { minutes: 0, seconds: 59 });
  assert.deepEqual(split.toSplit(60), { minutes: 1, seconds: 0 });
  assert.deepEqual(split.toSplit(605), { minutes: 10, seconds: 5 });
  assert.deepEqual(split.toSplit(-5), { minutes: 0, seconds: 0 });
});

test("toSeconds tolerates blank and bogus inputs", () => {
  assert.equal(split.toSeconds({ minutes: 2, seconds: 5 }), 125);
  assert.equal(split.toSeconds({ minutes: "1", seconds: "30" }), 90);
  assert.equal(split.toSeconds({ seconds: 45 }), 45);
  assert.equal(split.toSeconds({}), 0);
  assert.equal(split.toSeconds(), 0);
});

test("normalize carries overflowing seconds into minutes", () => {
  assert.deepEqual(split.normalize({ minutes: 0, seconds: 75 }), {
    minutes: 1,
    seconds: 15,
  });
});

test("normalize respects field bounds", () => {
  assert.deepEqual(split.normalize({ minutes: 0, seconds: 0 }, { min: 1 }), {
    minutes: 0,
    seconds: 1,
  });
  assert.deepEqual(
    split.normalize({ minutes: 30, seconds: 0 }, { max: 1200 }),
    { minutes: 20, seconds: 0 },
  );
});

test("stepSeconds carries into minutes at the top of the range", () => {
  assert.deepEqual(split.stepSeconds({ minutes: 0, seconds: 59 }, 1), {
    minutes: 1,
    seconds: 0,
  });
  assert.deepEqual(split.stepSeconds({ minutes: 1, seconds: 58 }, 5), {
    minutes: 2,
    seconds: 3,
  });
});

test("stepSeconds borrows from minutes when going below zero seconds", () => {
  assert.deepEqual(split.stepSeconds({ minutes: 1, seconds: 0 }, -1), {
    minutes: 0,
    seconds: 59,
  });
  assert.deepEqual(split.stepSeconds({ minutes: 1, seconds: 0 }, -5), {
    minutes: 0,
    seconds: 55,
  });
});

test("stepSeconds clamps at zero instead of borrowing from nothing", () => {
  // Regression: 0:03 minus 5 used to wrap around to 0:58.
  assert.deepEqual(split.stepSeconds({ minutes: 0, seconds: 3 }, -5), {
    minutes: 0,
    seconds: 0,
  });
  assert.deepEqual(split.stepSeconds({ minutes: 0, seconds: 0 }, -1), {
    minutes: 0,
    seconds: 0,
  });
});

test("stepMinutes keeps the seconds part", () => {
  assert.deepEqual(split.stepMinutes({ minutes: 2, seconds: 30 }, 1), {
    minutes: 3,
    seconds: 30,
  });
  assert.deepEqual(split.stepMinutes({ minutes: 0, seconds: 30 }, -1), {
    minutes: 0,
    seconds: 0,
  });
});

test("stepping honours the maximum of the field", () => {
  const bounds = { min: 0, max: 1200 };
  assert.deepEqual(split.stepMinutes({ minutes: 20, seconds: 0 }, 1, bounds), {
    minutes: 20,
    seconds: 0,
  });
  assert.deepEqual(split.stepSeconds({ minutes: 19, seconds: 59 }, 5, bounds), {
    minutes: 20,
    seconds: 0,
  });
});

test("clamp floors fractional seconds", () => {
  assert.equal(split.clamp(12.9), 12);
  assert.equal(split.clamp(NaN), 0);
  assert.equal(split.clamp(-3), 0);
});
