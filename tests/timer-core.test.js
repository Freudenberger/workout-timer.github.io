const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCountdownWorkout,
  parseQueryParamsToConfig,
  serializeConfigToQuery,
} = require("../timer-core.js");

test("serializeConfigToQuery uses countup alias for count-up timers", () => {
  const query = serializeConfigToQuery({
    type: "countdown",
    prep: 30,
    mode: "up",
    total: 600,
  });

  assert.equal(query, "type=countup&prep=30&total=600");
});

test("serializeConfigToQuery keeps countdown mode for countdown timers", () => {
  const query = serializeConfigToQuery({
    type: "countdown",
    prep: 15,
    mode: "down",
    total: 90,
  });

  assert.equal(query, "type=countdown&prep=15&mode=down&total=90");
});

test("parseQueryParamsToConfig accepts countup share URLs", () => {
  const config = parseQueryParamsToConfig("type=countup&prep=30&total=600");

  assert.deepEqual(config, {
    type: "countdown",
    mode: "up",
    prep: 30,
    total: 600,
  });
});

test("parseQueryParamsToConfig preserves legacy countdown mode URLs", () => {
  const config = parseQueryParamsToConfig(
    "type=countdown&prep=30&mode=up&total=600",
  );

  assert.deepEqual(config, {
    type: "countdown",
    mode: "up",
    prep: 30,
    total: 600,
  });
});

test("buildCountdownWorkout creates a count-up timer with prep and soft limit", () => {
  const workout = buildCountdownWorkout({ prep: 30, mode: "up", total: 600 });

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
    meta: {
      totalRounds: 1,
      mode: "up",
      softLimit: 600,
    },
  });
});

test("buildCountdownWorkout creates a countdown timer in down mode", () => {
  const workout = buildCountdownWorkout({ prep: 5, mode: "down", total: 90 });

  assert.deepEqual(workout, {
    sequence: [
      { label: "Get Ready", type: "prep", duration: 5 },
      { label: "Timer", type: "work", duration: 90 },
    ],
    meta: {
      totalRounds: 1,
      mode: "down",
    },
  });
});
