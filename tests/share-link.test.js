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
