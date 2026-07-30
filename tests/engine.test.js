const test = require("node:test");
const assert = require("node:assert/strict");

const { TimerEngine, createManualClock } = require("../src/core/engine.js");

// 125ms slices keep the floating point maths exact for whole-second durations.
const STEP = 125;

function setup(sequence) {
  const clock = createManualClock();
  const engine = new TimerEngine({ clock });
  const events = [];
  [
    "load",
    "start",
    "interval",
    "interval_complete",
    "skipped",
    "pause",
    "resume",
    "reset",
    "finish",
  ].forEach((name) => {
    engine.on(name, (payload) => events.push([name, payload?.label ?? null]));
  });
  engine.load(sequence);
  return { clock, engine, events };
}

const TWO_INTERVALS = [
  { label: "A", type: "work", duration: 2 },
  { label: "B", type: "rest", duration: 1 },
];

test("load indexes the sequence and stays idle", () => {
  const { engine, events } = setup(TWO_INTERVALS);
  assert.equal(engine.state, "idle");
  assert.equal(engine.remaining, 2);
  assert.deepEqual(
    engine.sequence.map((item) => item.index),
    [0, 1],
  );
  assert.deepEqual(events, [["load", null]]);
});

test("load starts a count-up interval at zero", () => {
  const { engine } = setup([
    { label: "Up", type: "work", duration: 0, mode: "up", softLimit: null },
  ]);
  assert.equal(engine.remaining, 0);
});

test("running advances through the sequence and finishes", () => {
  const { clock, engine, events } = setup(TWO_INTERVALS);

  engine.start();
  assert.equal(engine.state, "running");

  clock.advance(2000, STEP);
  assert.equal(engine.position, 1);
  assert.equal(engine.current().label, "B");
  assert.equal(engine.remaining, 1);

  clock.advance(1000, STEP);
  assert.equal(engine.state, "finished");
  assert.deepEqual(
    events.map(([name]) => name),
    ["load", "start", "interval_complete", "interval", "interval_complete", "finish"],
  );
});

test("ticks report the remaining value of the current interval", () => {
  const { clock, engine } = setup(TWO_INTERVALS);
  const ticks = [];
  engine.on("tick", (payload) => ticks.push(payload));

  engine.start();
  clock.advance(500, STEP);

  assert.equal(ticks.length, 4);
  assert.equal(ticks.at(-1).interval.label, "A");
  assert.equal(ticks.at(-1).position, 0);
  assert.ok(Math.abs(ticks.at(-1).remaining - 1.5) < 1e-9);
});

test("count-up intervals keep counting past their soft limit", () => {
  const { clock, engine } = setup([
    { label: "Up", type: "work", duration: 10, mode: "up", softLimit: 10 },
  ]);

  engine.start();
  clock.advance(15000, 250);

  assert.equal(engine.state, "running");
  assert.ok(engine.remaining > 10);
});

test("pause freezes the clock and resume continues without a jump", () => {
  const { clock, engine } = setup([{ label: "A", type: "work", duration: 10 }]);

  engine.start();
  clock.advance(1000, STEP);
  engine.pause();
  assert.equal(engine.state, "paused");

  const frozen = engine.remaining;
  clock.advance(5000, STEP); // nothing is scheduled while paused
  assert.equal(engine.remaining, frozen);

  engine.resume();
  clock.advance(1000, STEP);
  assert.ok(Math.abs(engine.remaining - 8) < 1e-9);
});

test("pause and resume are ignored in the wrong state", () => {
  const { engine, events } = setup(TWO_INTERVALS);
  engine.pause();
  engine.resume();
  assert.equal(engine.state, "idle");
  assert.deepEqual(events, [["load", null]]);
});

test("start is a no-op while already running and on an empty sequence", () => {
  const { engine, events } = setup(TWO_INTERVALS);
  engine.start();
  engine.start();
  assert.equal(events.filter(([name]) => name === "start").length, 1);

  const empty = new TimerEngine({ clock: createManualClock() });
  empty.load([]);
  empty.start();
  assert.equal(empty.state, "idle");
});

test("skip jumps to the next interval and reports the skipped one", () => {
  const { engine, events } = setup(TWO_INTERVALS);

  engine.start();
  engine.skip();

  assert.equal(engine.position, 1);
  assert.equal(engine.remaining, 1);
  assert.deepEqual(events.at(-2), ["skipped", "A"]);
  assert.deepEqual(events.at(-1), ["interval", "B"]);
});

test("skipping the last interval finishes the workout", () => {
  const { engine } = setup([{ label: "Only", type: "work", duration: 5 }]);
  engine.start();
  engine.skip();
  assert.equal(engine.state, "finished");
  engine.skip(); // finished engines ignore further skips
  assert.equal(engine.state, "finished");
});

test("reset clears the sequence and stops the clock", () => {
  const { clock, engine } = setup(TWO_INTERVALS);
  engine.start();
  clock.advance(500, STEP);
  engine.reset();

  assert.deepEqual(engine.sequence, []);
  assert.equal(engine.state, "idle");
  assert.equal(engine.remaining, 0);
  assert.equal(clock.hasPending, false);
});

test("totalDuration sums the loaded sequence", () => {
  const { engine } = setup(TWO_INTERVALS);
  assert.equal(engine.totalDuration(), 3);
});

test("a throwing listener does not break the others", () => {
  const { engine } = setup(TWO_INTERVALS);
  const seen = [];
  engine.on("start", () => {
    throw new Error("boom");
  });
  engine.on("start", () => seen.push("second"));
  engine.start();
  assert.deepEqual(seen, ["second"]);
});

test("on returns an unsubscribe function", () => {
  const { engine } = setup(TWO_INTERVALS);
  let calls = 0;
  const off = engine.on("start", () => calls++);
  off();
  engine.start();
  assert.equal(calls, 0);
});
