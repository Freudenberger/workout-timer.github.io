/*
 * Boots the real browser bundle against a DOM stub. This is the guard rail for
 * the script list in index.html and for every cross-module reference: any typo
 * or wrong load order shows up here as a thrown error.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { loadBundle, scriptSources } = require("./helpers/fake-dom.js");

const ROOT = path.join(__dirname, "..");

test("index.html lists every source file exactly once", () => {
  const listed = scriptSources();
  const onDisk = ["core", "ui"]
    .flatMap((dir) =>
      fs
        .readdirSync(path.join(ROOT, "src", dir))
        .filter((name) => name.endsWith(".js"))
        .map((name) => `src/${dir}/${name}`),
    )
    .concat("src/app.js");

  assert.deepEqual([...listed].sort(), onDisk.sort());
  assert.equal(new Set(listed).size, listed.length);
  assert.equal(listed.at(-1), "src/app.js", "app.js must load last");
});

test("the bundle boots and exposes every module", () => {
  const { WT } = loadBundle();

  [
    "time",
    "intervals",
    "fields",
    "workoutTypes",
    "config",
    "shareLink",
    "durationSplit",
    "engine",
    "presenter",
    "storage",
    "quickPresets",
    "dom",
    "feedback",
    "modal",
    "screens",
    "scale",
    "configForm",
    "timerView",
    "pinnedView",
    "presetsView",
    "shareView",
    "app",
  ].forEach((name) => {
    assert.ok(WT[name], `WT.${name} is missing`);
  });
});

test("booting builds a sequence and renders the timer screen", () => {
  const { WT, element } = loadBundle();
  const { engine } = WT.app;

  assert.ok(engine.sequence.length > 0, "a sequence should be loaded");
  assert.equal(engine.state, "idle");
  assert.match(element("totalDuration").textContent, /^\d\d:\d\d$/);
  assert.ok(element("dynamicFields").innerHTML.includes("data-key="));
  WT.workoutTypes.typeNames.forEach((type) => {
    assert.ok(
      element("workoutType").innerHTML.includes(`value="${type}"`),
      `the type select should offer ${type}`,
    );
  });
  assert.ok(element("sequencePreview").innerHTML.includes("seq-item"));
  assert.equal(element("startBtn").disabled, false);
  assert.equal(element("pauseBtn").disabled, true);
});

test("a shared count-up URL is applied on boot", () => {
  const { WT, element } = loadBundle({ search: "?type=countup&prep=0&total=600" });

  const cfg = WT.app.form.collect();
  assert.equal(cfg.type, "countdown");
  assert.equal(cfg.mode, "up");
  assert.equal(WT.app.engine.sequence[0].mode, "up");
  assert.equal(element("screenTimer").classList.contains("active"), true);
  assert.equal(element("screenSelect").classList.contains("hidden"), true);
});

test("a shared workout URL builds its sequence and clears the address bar", () => {
  const { WT, element, replaceStateCalls } = loadBundle({
    search: "?type=tabata&prep=0&rounds=2&work=30&rest=10",
  });

  assert.deepEqual(
    WT.app.engine.sequence.map((item) => [item.label, item.duration]),
    [
      ["Round 1 Work", 30],
      ["Round 1 Rest", 10],
      ["Round 2 Work", 30],
      ["Round 2 Rest", 10],
    ],
  );
  assert.equal(element("totalDuration").textContent, "01:20");
  assert.equal(element("screenTimer").classList.contains("active"), true);
  assert.equal(replaceStateCalls.length, 1, "the query should be dropped");
});

test("an unusable URL falls through to the select screen", () => {
  ["?type=marathon&rounds=5", "?rounds=5&work=30", "?"].forEach((search) => {
    const { element } = loadBundle({ search });
    assert.equal(
      element("screenSelect").classList.contains("active"),
      true,
      `${search} should land on the select screen`,
    );
    assert.equal(element("screenTimer").classList.contains("active"), false);
  });
});

test("a query string wins over a #type hash", () => {
  const { WT } = loadBundle({ search: "?type=micro&reps=4&interval=3", hash: "#type=hiit" });
  assert.equal(WT.app.form.getType(), "micro");
});

test("pasting a URL loads it and opens the timer", () => {
  const { WT, element } = loadBundle();

  element("importUrlInput").value =
    "https://freudenberger.github.io/workout-timer/?type=micro&prep=0&reps=4&interval=3#x";
  element("importUrlBtn").dispatch("click", {});

  assert.equal(WT.app.form.getType(), "micro");
  assert.equal(WT.app.engine.sequence.length, 4);
  assert.equal(element("importStatus").textContent, "Loaded ✅");
  assert.match(element("importStatus").className, /emerald/);
  assert.equal(element("screenTimer").classList.contains("active"), true);
});

test("pasting bare parameters works the same way", () => {
  const { WT } = loadBundle();
  const input = document.getElementById("importUrlInput");

  input.value = "type=emom&prep=0&rounds=3&work=45";
  input.dispatch("keydown", { key: "Enter", preventDefault() {} });

  assert.equal(WT.app.form.getType(), "emom");
  assert.equal(WT.app.engine.sequence.length, 6);
});

test("pasting an unusable URL reports an error and changes nothing", () => {
  const { WT, element } = loadBundle();
  const before = WT.app.engine.sequence.length;

  element("importUrlInput").value = "https://example.com/?type=marathon&rounds=5";
  element("importUrlBtn").dispatch("click", {});

  assert.equal(element("importStatus").textContent, "Invalid parameters");
  assert.match(element("importStatus").className, /rose/);
  assert.equal(WT.app.engine.sequence.length, before);
  assert.equal(element("screenSelect").classList.contains("active"), true);
});

test("copying the URL round-trips the current configuration", () => {
  const { WT } = loadBundle({ search: "?type=custom&prep=5&rounds=2&exercisesPerRound=4&exerciseWork=25&exerciseRest=5&betweenRounds=15" });
  const first = WT.app.engine.sequence;

  const shared = WT.shareView.create({
    getCurrentConfig: () => WT.app.form.collect(),
  }).currentUrl();

  assert.match(shared, /^https:\/\/example\.com\/\?type=custom&/);
  const reparsed = WT.shareLink.parse(WT.shareLink.extractQueryString(shared));
  assert.deepEqual(
    WT.workoutTypes.build(reparsed.type, WT.config.mergeWithDefaults(reparsed.type, reparsed))
      .sequence,
    first.map(({ index, ...item }) => item),
  );
});

test("a #type= hash opens the config screen for that type", () => {
  const { WT, element } = loadBundle({ hash: "#type=micro" });

  assert.equal(WT.app.form.getType(), "micro");
  assert.equal(element("screenConfig").classList.contains("active"), true);
});

test("editing a field rebuilds the sequence", () => {
  const { WT, element } = loadBundle();
  const rounds = element("dynamicFields")
    .querySelectorAll("[data-key]")
    .find((input) => input.dataset.key === "rounds");

  rounds.value = "3";
  rounds.dispatch("input");

  // prep + 3 x (work + rest)
  assert.equal(WT.app.engine.sequence.length, 7);
  assert.equal(element("roundCount").textContent, "3");
});

test("the seconds stepper feeds back into the hidden seconds field", () => {
  const { element } = loadBundle();
  const plusSecond = element("dynamicFields")
    .querySelectorAll(".step-btn")
    .find(
      (btn) =>
        btn.dataset.field === "prep" &&
        btn.dataset.part === "sec" &&
        btn.dataset.step === "1",
    );

  plusSecond.dispatch("click", { shiftKey: false });
  assert.equal(element("f_prep").value, "11");
  assert.equal(element("f_prep_sec").value, "11");

  plusSecond.dispatch("click", { shiftKey: true });
  assert.equal(element("f_prep").value, "16");
});

test("marking logs an entry from the timer screen", () => {
  const { WT, element } = loadBundle();
  WT.app.engine.start();

  element("markBtn").dispatch("click", {});

  const entries = element("roundLog").children;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].classList.contains("marked"), true);
  assert.match(entries[0].innerHTML, /Elapsed/);
  WT.app.engine.reset();
});

test("running the engine drives the timer view", () => {
  const { WT, element } = loadBundle();
  const { engine } = WT.app;

  engine.start();
  assert.equal(engine.state, "running");
  assert.equal(element("intervalLabel").textContent, engine.current().label);
  assert.ok(document.body.classList.contains(`phase-${engine.current().type}`));

  engine.skip();
  assert.ok(element("roundLog").children.length > 0, "skips are logged");

  engine.pause();
  assert.equal(element("pauseBtn").textContent, "Resume");
  engine.reset();
});
