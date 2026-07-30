const test = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/core/config.js");

test("mergeWithDefaults fills the gaps for a bare config", () => {
  assert.deepEqual(config.mergeWithDefaults("tabata", {}), {
    type: "tabata",
    prep: 10,
    rounds: 8,
    work: 20,
    rest: 10,
  });
});

test("mergeWithDefaults keeps provided values", () => {
  const merged = config.mergeWithDefaults("tabata", { rounds: 4, work: 30 });
  assert.equal(merged.rounds, 4);
  assert.equal(merged.work, 30);
  assert.equal(merged.rest, 10);
});

test("mergeWithDefaults maps a legacy custom preset onto exercise fields", () => {
  const merged = config.mergeWithDefaults("custom", {
    type: "custom",
    rounds: 3,
    work: 25,
    rest: 5,
  });

  assert.equal(merged.exerciseWork, 25);
  assert.equal(merged.exerciseRest, 5);
  assert.equal(merged.exercisesPerRound, 1);
  assert.equal(merged.rounds, 3);
});

test("mergeWithDefaults keeps modern custom defaults untouched", () => {
  const merged = config.mergeWithDefaults("custom", {});
  assert.equal(merged.exercisesPerRound, 3);
  assert.equal(merged.exerciseWork, 30);
});

test("mergeWithDefaults normalizes the countdown mode", () => {
  assert.equal(config.mergeWithDefaults("countdown", {}).mode, "down");
  assert.equal(
    config.mergeWithDefaults("countdown", { mode: "sideways" }).mode,
    "down",
  );
  assert.equal(config.mergeWithDefaults("countdown", { mode: "up" }).mode, "up");
});

test("mergeWithDefaults always reports the requested type", () => {
  const merged = config.mergeWithDefaults("emom", { type: "tabata" });
  assert.equal(merged.type, "emom");
});

test("fingerprint ignores key order", () => {
  const a = config.fingerprint({ type: "emom", rounds: 10, work: 40 });
  const b = config.fingerprint({ work: 40, type: "emom", rounds: 10 });
  assert.equal(a, b);
  assert.notEqual(
    a,
    config.fingerprint({ type: "emom", rounds: 9, work: 40 }),
  );
});

test("formatFieldValue renders durations and select labels", () => {
  assert.equal(config.formatFieldValue("work", 90), "01:30");
  assert.equal(config.formatFieldValue("rounds", 8), "8");
  assert.equal(config.formatFieldValue("mode", "up"), "Count Up");
  assert.equal(config.formatFieldValue("mode", "down"), "Count Down");
});

test("summaryRows labels every field and drops the type", () => {
  const rows = config.summaryRows({
    type: "countdown",
    prep: 15,
    mode: "up",
    total: 600,
  });

  assert.deepEqual(rows, [
    { key: "prep", label: "Prep (s)", value: "00:15" },
    { key: "mode", label: "Mode", value: "Count Up" },
    { key: "total", label: "Total / Soft Limit (s)", value: "10:00" },
  ]);
});

test("summaryRows falls back to the raw key for unknown fields", () => {
  const rows = config.summaryRows({ type: "emom", mystery: 3 });
  assert.deepEqual(rows, [{ key: "mystery", label: "mystery", value: "3" }]);
});
