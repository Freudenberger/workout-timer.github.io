const test = require("node:test");
const assert = require("node:assert/strict");

const shareLink = require("../src/core/share-link.js");

test("serialize uses the countup alias for count-up timers", () => {
  const query = shareLink.serialize({
    type: "countdown",
    prep: 30,
    mode: "up",
    total: 600,
  });

  assert.equal(query, "type=countup&prep=30&total=600");
});

test("serialize keeps the explicit mode for countdown timers", () => {
  const query = shareLink.serialize({
    type: "countdown",
    prep: 15,
    mode: "down",
    total: 90,
  });

  assert.equal(query, "type=countdown&prep=15&mode=down&total=90");
});

test("serialize skips non numeric values and empty configs", () => {
  assert.equal(shareLink.serialize({ type: "emom", rounds: 10, note: "hi" }), "type=emom&rounds=10");
  assert.equal(shareLink.serialize(null), "");
  assert.equal(shareLink.serialize({ rounds: 3 }), "");
});

test("parse accepts countup share URLs", () => {
  assert.deepEqual(shareLink.parse("type=countup&prep=30&total=600"), {
    type: "countdown",
    mode: "up",
    prep: 30,
    total: 600,
  });
});

test("parse preserves legacy countdown mode URLs", () => {
  assert.deepEqual(
    shareLink.parse("type=countdown&prep=30&mode=up&total=600"),
    { type: "countdown", mode: "up", prep: 30, total: 600 },
  );
});

test("parse defaults countdown to counting down", () => {
  assert.equal(shareLink.parse("type=countdown&total=60").mode, "down");
});

test("parse accepts URLSearchParams and ignores junk keys", () => {
  const params = new URLSearchParams("type=emom&rounds=5&work=abc&evil=1");
  assert.deepEqual(shareLink.parse(params), { type: "emom", rounds: 5 });
});

test("parse rejects missing or unsupported types", () => {
  assert.equal(shareLink.parse("rounds=5"), null);
  assert.equal(shareLink.parse("type=marathon&rounds=5"), null);
  assert.equal(
    shareLink.parse("type=emom", { supportedTypes: new Set(["tabata"]) }),
    null,
  );
});

test("serialize and parse round-trip a config", () => {
  const cfg = {
    type: "custom",
    prep: 10,
    rounds: 5,
    exercisesPerRound: 8,
    exerciseWork: 20,
    exerciseRest: 10,
    betweenRounds: 10,
  };
  assert.deepEqual(shareLink.parse(shareLink.serialize(cfg)), cfg);
});

test("parse ignores the mode parameter on a countup link", () => {
  // The alias already says "up"; a stale mode=down must not undo it.
  assert.equal(shareLink.parse("type=countup&mode=down&total=60").mode, "up");
  assert.equal(shareLink.parse("type=countup&mode=up&total=60").mode, "up");
});

test("parse only accepts the exact countup alias", () => {
  assert.equal(shareLink.parse("type=COUNTUP&total=60"), null);
  assert.equal(shareLink.parse("type=CountUp&total=60"), null);
});

test("parse treats any unrecognized mode as counting down", () => {
  assert.equal(shareLink.parse("type=countdown&mode=UP&total=60").mode, "down");
  assert.equal(
    shareLink.parse("type=countdown&mode=sideways&total=60").mode,
    "down",
  );
  assert.equal(shareLink.parse("type=countdown&mode=&total=60").mode, "down");
});

test("parse ignores fractional and partly numeric values the way parseInt does", () => {
  const cfg = shareLink.parse("type=tabata&rounds=4.7&work=20abc&rest=x10");
  assert.deepEqual(cfg, { type: "tabata", rounds: 4, work: 20 });
});

test("parse skips numeric fields that have no value", () => {
  assert.deepEqual(shareLink.parse("type=emom&rounds=&work=40"), {
    type: "emom",
    work: 40,
  });
});

test("parse clamps values to the bounds of their field", () => {
  assert.deepEqual(shareLink.parse("type=emom&prep=-30&rounds=0&work=99999"), {
    type: "emom",
    prep: 0,
    rounds: 1,
    work: 3600,
  });
  assert.equal(shareLink.parse("type=micro&reps=999999").reps, 10000);
  assert.equal(shareLink.parse("type=countdown&total=-1").total, 0);
});

test("parse keeps the last value when a parameter repeats", () => {
  assert.equal(shareLink.parse("type=emom&rounds=5&rounds=9").rounds, 9);
});

test("parse accepts a leading question mark and url encoded separators", () => {
  assert.deepEqual(shareLink.parse("?type=emom&rounds=5"), {
    type: "emom",
    rounds: 5,
  });
  assert.deepEqual(shareLink.parse("type=emom&rounds=5%20"), {
    type: "emom",
    rounds: 5,
  });
});

test("parse does not carry fields from other workout types over", () => {
  // A tabata link that also mentions micro fields keeps them; building is what
  // decides which ones matter, so the config stays a faithful copy of the URL.
  const cfg = shareLink.parse("type=tabata&rounds=4&reps=99");
  assert.deepEqual(cfg, { type: "tabata", rounds: 4, reps: 99 });
});

test("extractQueryString handles full URLs, fragments and bare params", () => {
  assert.equal(
    shareLink.extractQueryString("https://example.com/timer/?type=emom&rounds=5"),
    "type=emom&rounds=5",
  );
  assert.equal(
    shareLink.extractQueryString("https://example.com/?type=emom#timer"),
    "type=emom",
  );
  assert.equal(
    shareLink.extractQueryString("?type=emom&rounds=5"),
    "type=emom&rounds=5",
  );
  assert.equal(
    shareLink.extractQueryString("type=emom&rounds=5"),
    "type=emom&rounds=5",
  );
  assert.equal(
    shareLink.extractQueryString("  index.html?type=emom#x  "),
    "type=emom",
  );
  assert.equal(shareLink.extractQueryString(""), "");
  assert.equal(shareLink.extractQueryString(null), "");
});

test("extractQueryString reads links opened from the file system", () => {
  assert.equal(
    shareLink.extractQueryString(
      "file:///C:/workouts/index.html?type=emom&rounds=5",
    ),
    "type=emom&rounds=5",
  );
});

test("extractQueryString returns nothing when a URL carries no query", () => {
  assert.equal(shareLink.extractQueryString("https://example.com"), "");
  assert.equal(shareLink.extractQueryString("https://example.com/timer/"), "");
  assert.equal(shareLink.extractQueryString("https://example.com/#type=emom"), "");
});

test("extractQueryString keeps everything after the first question mark", () => {
  assert.equal(
    shareLink.extractQueryString("index.html?type=emom&note=a?b"),
    "type=emom&note=a?b",
  );
});

test("extractQueryString survives an unparseable http URL", () => {
  // Falls back to plain text handling; parse() then rejects the result.
  assert.equal(shareLink.parse(shareLink.extractQueryString("https://")), null);
  assert.equal(
    shareLink.extractQueryString("HTTPS://example.com/?type=emom"),
    "type=emom",
  );
});

test("extractQueryString ignores non string input", () => {
  assert.equal(shareLink.extractQueryString(undefined), "");
  assert.equal(shareLink.extractQueryString(42), "42");
});

test("buildShareUrl falls back to file:// for a null origin", () => {
  assert.equal(
    shareLink.buildShareUrl({
      origin: "https://example.com",
      pathname: "/timer/",
      query: "type=emom",
    }),
    "https://example.com/timer/?type=emom",
  );
  assert.equal(
    shareLink.buildShareUrl({ origin: "null", pathname: "/x/index.html", query: "type=emom" }),
    "file:///x/index.html?type=emom",
  );
  assert.equal(
    shareLink.buildShareUrl({ origin: "https://example.com", pathname: "/" }),
    "https://example.com/",
  );
});
