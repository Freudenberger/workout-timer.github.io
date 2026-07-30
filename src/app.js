/*
 * Application wiring: engine <-> views.
 *
 * This module owns no rendering rules and no timing rules — it connects the
 * config form, the timer engine and the views, and holds the little bit of
 * session state that belongs to neither (current meta, last mark).
 */
(function (root) {
  const {
    dom,
    intervals,
    workoutTypes,
    quickPresets,
    engine: engineModule,
    presenter,
    configForm,
    timerView,
    pinnedView,
    presetsView,
    shareView,
    screens,
    scale,
    modal,
    feedback,
  } = root.WT;
  const { els } = dom;
  const { announce, speak, beep, beepSequence } = feedback;

  const engine = new engineModule.TimerEngine();
  const form = configForm.create({ onChange: () => build() });

  let currentMeta = {};
  let currentConfig = null;
  /** Effective elapsed at the previous mark, for the "+mm:ss" delta. */
  let lastMarkElapsed = null;
  let lastCueSecond = null;

  // ---------- build ----------

  function build() {
    const cfg = form.collect();
    const built = workoutTypes.build(cfg.type, cfg);
    if (!built) return null;
    currentConfig = cfg;
    currentMeta = built.meta;
    engine.load(built.sequence);
    timerView.renderReady(engine.sequence, currentMeta, cfg);
    return built;
  }

  function loadConfig(cfg, { screen = null } = {}) {
    if (!form.apply(cfg)) return false;
    build();
    if (screen) screens.show(screen, { scrollTop: true });
    return true;
  }

  function resetRunState() {
    lastMarkElapsed = null;
    lastCueSecond = null;
  }

  // ---------- engine events ----------

  function logCompleted(interval, extra = {}) {
    const elapsed =
      intervals.elapsedBefore(engine.sequence, engine.position) +
      intervals.elapsedIn(interval, engine.remaining);
    timerView.logEntry(interval, {
      elapsed,
      remaining: engine.totalDuration() - elapsed,
      ...extra,
    });
  }

  engine.on("load", () => timerView.setControls("idle"));

  engine.on("start", (interval) => {
    resetRunState();
    timerView.setControls("running");
    timerView.renderInterval(interval, {
      sequence: engine.sequence,
      meta: currentMeta,
      value: engine.remaining,
    });
    beepSequence();
    announce(`Start ${interval.label}`);
    speak(`${interval.label} start`);
  });

  engine.on("interval", (interval) => {
    lastCueSecond = null;
    timerView.renderInterval(interval, {
      sequence: engine.sequence,
      meta: currentMeta,
      value: engine.remaining,
    });
    beepSequence();
    announce(interval.label);
    speak(interval.label);
  });

  engine.on("interval_complete", (interval) => {
    beep({ freq: 440 });
    logCompleted(interval);
  });

  engine.on("skipped", (interval) => {
    logCompleted(interval, { skipped: true });
  });

  engine.on("pause", (interval) => {
    timerView.setControls("paused");
    if (interval) logCompleted(interval, { customMessage: "Paused" });
    announce("Paused");
  });

  engine.on("resume", () => {
    timerView.setControls("running");
    announce("Resumed");
  });

  engine.on("finish", () => {
    timerView.setControls("finished");
    timerView.renderFinished();
    announce("Workout complete");
    speak("Workout complete");
    if (els.autoRestartToggle?.checked) {
      setTimeout(() => {
        build();
        engine.start();
      }, 2000);
    }
  });

  engine.on("tick", ({ remaining, interval, position }) => {
    if (!interval) return;
    timerView.renderTick({
      interval,
      value: remaining,
      sequence: engine.sequence,
      meta: currentMeta,
      position,
    });
    if (intervals.isCountUp(interval)) return;
    const secondsLeft = Math.ceil(remaining);
    const freq = presenter.finalCountdownFrequency(secondsLeft);
    if (freq !== null && lastCueSecond !== secondsLeft) {
      lastCueSecond = secondsLeft;
      beep({ freq });
    }
  });

  // ---------- controls ----------

  function toggleRun() {
    if (engine.state === "running") engine.pause();
    else if (engine.state === "paused") engine.resume();
    else engine.start();
  }

  function mark() {
    const interval = engine.current();
    if (!interval) return;
    const { elapsed, left } = intervals.computeEffectiveTime(
      engine.sequence,
      engine.position,
      engine.remaining,
    );
    const timeSinceLastMark =
      lastMarkElapsed === null ? null : Math.max(0, elapsed - lastMarkElapsed);
    lastMarkElapsed = elapsed;
    timerView.logEntry(interval, {
      elapsed,
      remaining: left,
      marked: true,
      timeSinceLastMark,
    });
  }

  function resetTimer() {
    build();
    timerView.setControls("idle");
    timerView.clearRunState();
    resetRunState();
    announce("Reset");
  }

  function bindControls() {
    els.startBtn?.addEventListener("click", () => {
      if (engine.state === "paused") engine.resume();
      else engine.start();
    });
    els.pauseBtn?.addEventListener("click", toggleRun);
    els.resetBtn?.addEventListener("click", resetTimer);
    els.skipBtn?.addEventListener("click", () => engine.skip());
    els.markBtn?.addEventListener("click", mark);
    els.timerRestartBtn?.addEventListener("click", () => {
      build();
      engine.start();
    });
  }

  function bindKeyboard() {
    window.addEventListener("keydown", (event) => {
      if (modal.isOpen()) return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (event.code === "Space") {
        event.preventDefault();
        toggleRun();
      } else if (event.key === "r") {
        resetTimer();
      } else if (event.key === "s") {
        engine.skip();
      }
    });
  }

  // ---------- navigation ----------

  function bindNavigation() {
    els.workoutType?.addEventListener("change", () => {
      form.render();
      build();
    });

    els.typeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!form.setType(btn.dataset.type)) return;
        build();
        screens.show("screenConfig", { scrollTop: true });
      });
    });

    els.quickPresetBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const cfg = quickPresets.getQuickPreset(btn.dataset.preset);
        if (cfg) loadConfig(cfg, { screen: "screenTimer" });
      });
    });

    els.goToTimerBtn?.addEventListener("click", () => {
      build();
      screens.show("screenTimer", { scrollTop: true, smooth: false });
    });

    els.backToSelectBtn?.addEventListener("click", async () => {
      if (engine.isRunning()) {
        const ok = await modal.confirmDialog({
          title: "Leave Configuration",
          message:
            "Timer is currently running. Reset and go back to workout type selection?",
          confirmText: "Reset & Back",
          cancelText: "Stay",
        });
        if (!ok) return;
      }
      screens.show("screenSelect");
    });

    els.timerBackBtn?.addEventListener("click", async () => {
      if (engine.isRunning()) {
        const ok = await modal.confirmDialog({
          title: "Return to Configuration",
          message: "Pause current workout and return to configuration?",
          confirmText: "Pause & Return",
          cancelText: "Stay",
        });
        if (!ok) return;
        engine.pause();
      }
      timerView.clearRunState();
      resetRunState();
      build();
      screens.show("screenConfig");
    });
  }

  /** ?type=... wins over #type=..., otherwise start on the Select screen. */
  function route(share) {
    if (share.applyLocationQuery()) {
      screens.show("screenTimer");
      return;
    }
    if (location.hash.startsWith("#type=")) {
      const type = location.hash.split("=")[1];
      if (form.setType(type)) {
        build();
        screens.show("screenConfig");
        return;
      }
    }
    screens.show("screenSelect");
  }

  // ---------- bootstrap ----------

  function init() {
    const getCurrentConfig = () => currentConfig ?? form.collect();

    modal.init();
    scale.init();

    const share = shareView.create({
      getCurrentConfig,
      onImport: (cfg) => loadConfig(cfg),
    });
    const pins = pinnedView.create({
      getCurrentConfig,
      onLoad: (cfg) => loadConfig(cfg, { screen: "screenTimer" }),
    });
    const presets = presetsView.create({
      getCurrentConfig,
      onLoad: (cfg) => loadConfig(cfg),
    });

    share.init();
    pins.init();
    presets.init();
    bindControls();
    bindKeyboard();
    bindNavigation();

    form.renderTypeOptions();
    form.render();
    build();
    route(share);
  }

  root.WT.app = { init, build, engine, form };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
