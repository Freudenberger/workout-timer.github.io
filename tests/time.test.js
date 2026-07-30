const test = require("node:test");
const assert = require("node:assert/strict");

const { pad, formatTime, toNonNegativeInteger } = require("../src/core/time.js");

test("pad keeps two digits", () => {
  assert.equal(pad(0), "00");
  assert.equal(pad(7), "07");
  assert.equal(pad(42), "42");
  assert.equal(pad(123), "123");
});

test("formatTime renders mm:ss and floors partial seconds", () => {
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(9.9), "00:09");
  assert.equal(formatTime(59), "00:59");
  assert.equal(formatTime(60), "01:00");
  assert.equal(formatTime(3725), "62:05");
});

test("formatTime clamps negatives and marks open ended durations", () => {
  assert.equal(formatTime(-5), "00:00");
  assert.equal(formatTime(Infinity), "∞");
  assert.equal(formatTime(NaN), "∞");
});

test("toNonNegativeInteger falls back on unusable input", () => {
  assert.equal(toNonNegativeInteger("30"), 30);
  assert.equal(toNonNegativeInteger(12.9), 12);
  assert.equal(toNonNegativeInteger(-4), 0);
  assert.equal(toNonNegativeInteger(undefined, 600), 600);
  assert.equal(toNonNegativeInteger("abc", 7), 7);
});
