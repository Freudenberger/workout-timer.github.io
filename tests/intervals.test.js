const test = require("node:test");
const assert = require("node:assert/strict");

const intervals = require("../src/core/intervals.js");

const SEQUENCE = [
  { label: "Get Ready", type: "prep", duration: 10 },
  { label: "Round 1 Work", type: "work", duration: 20 },
  { label: "Round 1 Rest", type: "rest", duration: 10 },
  { label: "Cool Down", type: "cooldown", duration: 30 },
];

test("nominalDuration uses the soft limit for count-up intervals", () => {
  assert.equal(intervals.nominalDuration({ type: "work", duration: 20 }), 20);
  assert.equal(
    intervals.nominalDuration({ type: "work", mode: "up", softLimit: 600 }),
    600,
  );
  assert.equal(
    intervals.nominalDuration({ type: "work", mode: "up", softLimit: null }),
    Infinity,
  );
  assert.equal(intervals.nominalDuration(undefined), 0);
});

test("initialValue starts count-up intervals at zero", () => {
  assert.equal(intervals.initialValue({ type: "work", duration: 45 }), 45);
  assert.equal(
    intervals.initialValue({ type: "work", duration: 45, mode: "up" }),
    0,
  );
});

test("elapsedIn reads down from the duration and up from zero", () => {
  assert.equal(intervals.elapsedIn({ duration: 20 }, 5), 15);
  assert.equal(intervals.elapsedIn({ duration: 20 }, 25), 0);
  assert.equal(intervals.elapsedIn({ duration: 20, mode: "up" }, 5), 5);
});

test("exceedsSoftLimit only fires past an actual limit", () => {
  const open = { mode: "up", softLimit: null };
  const capped = { mode: "up", softLimit: 60 };
  assert.equal(intervals.exceedsSoftLimit(open, 9999), false);
  assert.equal(intervals.exceedsSoftLimit(capped, 60), false);
  assert.equal(intervals.exceedsSoftLimit(capped, 61), true);
  assert.equal(intervals.exceedsSoftLimit({ duration: 10 }, 999), false);
});

test("totalDuration sums the sequence and stays Infinity when open ended", () => {
  assert.equal(intervals.totalDuration(SEQUENCE), 70);
  assert.equal(
    intervals.totalDuration([
      { type: "work", duration: 5 },
      { type: "work", mode: "up", softLimit: null },
    ]),
    Infinity,
  );
});

test("elapsedBefore defaults to excluding nothing", () => {
  // Regression: callers used to omit the exclude set and crash on it.
  assert.equal(intervals.elapsedBefore(SEQUENCE, 0), 0);
  assert.equal(intervals.elapsedBefore(SEQUENCE, 2), 30);
  assert.equal(intervals.elapsedBefore(SEQUENCE, 99), 70);
});

test("elapsedBefore honours an exclude set", () => {
  assert.equal(
    intervals.elapsedBefore(SEQUENCE, 3, intervals.EFFECTIVE_EXCLUDED),
    30,
  );
});

test("computeEffectiveTime ignores prep and cooldown", () => {
  // second interval (work 20) with 5s left -> 15s of effective work done
  const result = intervals.computeEffectiveTime(SEQUENCE, 1, 5);
  assert.deepEqual(result, { total: 30, elapsed: 15, left: 15 });
});

test("computeEffectiveTime reports zero elapsed while still in prep", () => {
  const result = intervals.computeEffectiveTime(SEQUENCE, 0, 4);
  assert.deepEqual(result, { total: 30, elapsed: 0, left: 30 });
});

test("computeTime counts every interval when nothing is excluded", () => {
  const result = intervals.computeTime(SEQUENCE, 1, 5);
  assert.deepEqual(result, { total: 70, elapsed: 25, left: 45 });
});

test("computeTime keeps left at Infinity for open ended sequences", () => {
  const sequence = [{ type: "work", mode: "up", softLimit: null, duration: 0 }];
  const result = intervals.computeTime(sequence, 0, 42);
  assert.equal(result.total, Infinity);
  assert.equal(result.elapsed, 42);
  assert.equal(result.left, Infinity);
});
