const test = require("node:test");
const assert = require("node:assert/strict");

const storage = require("../src/core/storage.js");

const pin = (name, cfg) => ({
  name,
  icon: "⭐",
  config: cfg,
  fp: name,
  ts: 0,
});

test("readJSON returns the fallback for missing and broken values", () => {
  const store = storage.createMemoryStorage({ broken: "{not json" });
  assert.deepEqual(storage.readJSON(store, "missing", {}), {});
  assert.deepEqual(storage.readJSON(store, "broken", { ok: true }), { ok: true });
});

test("readJSON survives a storage that throws", () => {
  const hostile = {
    getItem() {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(storage.readJSON(hostile, "x", []), []);
  assert.equal(storage.writeJSON(hostile, "x", []), false);
});

test("preset store saves, reads and removes by name", () => {
  const presets = storage.createPresetStore(storage.createMemoryStorage());
  assert.deepEqual(presets.all(), {});

  presets.save("Morning", { type: "emom", rounds: 10 });
  presets.save("Evening", { type: "tabata", rounds: 8 });

  assert.deepEqual(presets.names(), ["Morning", "Evening"]);
  assert.deepEqual(presets.get("Morning"), { type: "emom", rounds: 10 });
  assert.equal(presets.get("Nope"), null);

  presets.remove("Morning");
  assert.deepEqual(presets.names(), ["Evening"]);
});

test("preset store ignores a corrupted payload", () => {
  const presets = storage.createPresetStore(
    storage.createMemoryStorage({ [storage.PRESETS_KEY]: "[1,2,3]" }),
  );
  assert.deepEqual(presets.all(), {});
});

test("sanitizePins drops junk and enforces the limit", () => {
  const messy = [
    pin("a", { type: "emom" }),
    null,
    "nope",
    { name: "no config" },
    pin("b", { type: "tabata" }),
    pin("c", { type: "hiit" }),
    pin("d", { type: "micro" }),
    pin("e", { type: "custom" }),
    pin("f", { type: "countdown" }),
  ];

  const clean = storage.sanitizePins(messy);
  assert.equal(clean.length, storage.PIN_LIMIT);
  assert.deepEqual(
    clean.map((item) => item.name),
    ["a", "b", "c", "d", "e"],
  );
  assert.deepEqual(storage.sanitizePins("nope"), []);
});

test("upsertPin adds new workouts without touching the input list", () => {
  const list = [pin("a", { type: "emom" })];
  const { list: next, action } = storage.upsertPin(list, pin("b", { type: "tabata" }));

  assert.equal(action, "added");
  assert.equal(list.length, 1);
  assert.deepEqual(
    next.map((item) => item.name),
    ["a", "b"],
  );
});

test("upsertPin renames an already pinned config instead of duplicating it", () => {
  const list = [pin("a", { type: "emom" })];
  const { list: next, action } = storage.upsertPin(list, {
    name: "Renamed",
    icon: "🔥",
    config: { type: "emom" },
    fp: "a",
  });

  assert.equal(action, "updated");
  assert.equal(next.length, 1);
  assert.equal(next[0].name, "Renamed");
  assert.equal(next[0].icon, "🔥");
});

test("upsertPin derives a fingerprint when none is given", () => {
  const { list } = storage.upsertPin([], {
    name: "x",
    config: { type: "emom", rounds: 10 },
  });
  assert.equal(list[0].fp, "rounds:10|type:emom");
});

test("upsertPin reports a full list and can replace the oldest", () => {
  const list = ["a", "b", "c", "d", "e"].map((name) => pin(name, { type: name }));
  const entry = pin("f", { type: "f" });

  const rejected = storage.upsertPin(list, entry);
  assert.equal(rejected.action, "full");
  assert.equal(rejected.list, list);

  const replaced = storage.upsertPin(list, entry, { replaceOldest: true });
  assert.equal(replaced.action, "added");
  assert.deepEqual(
    replaced.list.map((item) => item.name),
    ["b", "c", "d", "e", "f"],
  );
});

test("removePinAt removes by index and ignores bad indexes", () => {
  const list = ["a", "b", "c"].map((name) => pin(name, { type: name }));
  assert.deepEqual(
    storage.removePinAt(list, 1).map((item) => item.name),
    ["a", "c"],
  );
  assert.equal(storage.removePinAt(list, 5), list);
  assert.equal(storage.removePinAt(list, -1), list);
});

test("pinned store round-trips through storage and caps on write", () => {
  const backing = storage.createMemoryStorage();
  const pins = storage.createPinnedStore(backing);
  assert.deepEqual(pins.all(), []);

  const written = pins.replaceAll(
    ["a", "b", "c", "d", "e", "f"].map((name) => pin(name, { type: name })),
  );
  assert.equal(written.length, storage.PIN_LIMIT);
  assert.deepEqual(
    pins.all().map((item) => item.name),
    ["a", "b", "c", "d", "e"],
  );
});
