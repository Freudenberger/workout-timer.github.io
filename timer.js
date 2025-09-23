/*
 * Workout Timer - Pure JS Module
 * Architecture:
 *  - WorkoutTypes: definitions & sequence builders
 *  - TimerEngine: generic countdown with phases queue
 *  - UI Controller: binds DOM, manages state, persistence, accessibility
 */

// ---------- Utilities ----------
const pad = (n) => String(n).padStart(2, "0");
const formatTime = (sec) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Live region announce (debounced) for accessibility
const liveRegion = $("#liveRegion");
function announce(msg) {
  if (!liveRegion) return;
  liveRegion.textContent = "";
  // slight delay to retrigger SR
  setTimeout(() => (liveRegion.textContent = msg), 40);
}

// ---------- Workout Type Definitions ----------
// Each builder returns { sequence: Interval[], meta }
// Interval: { label, type: 'work'|'rest'|'prep'|'cooldown', duration }

const WorkoutTypes = {
  emom(config) {
    // EMOM: user sets minutes (rounds) & work duration (<=60) remainder is rest
    const rounds = config.rounds || 10;
    const work = config.work || 40; // seconds
    const prep = config.prep || 5;
    const minute = 60;
    const sequence = [];
    if (prep)
      sequence.push({ label: "Get Ready", type: "prep", duration: prep });
    for (let r = 1; r <= rounds; r++) {
      sequence.push({ label: `Round ${r} Work`, type: "work", duration: work });
      const restDur = Math.max(0, minute - work);
      if (restDur > 0)
        sequence.push({
          label: `Round ${r} Rest`,
          type: "rest",
          duration: restDur,
        });
    }
    return { sequence, meta: { totalRounds: rounds } };
  },
  tabata(config) {
    // classic Tabata: 8 rounds 20s work 10s rest OR user override
    const rounds = config.rounds || 8;
    const work = config.work || 20;
    const rest = config.rest;
    const prep = config.prep || 5;
    const sequence = [];
    if (prep)
      sequence.push({ label: "Get Ready", type: "prep", duration: prep });
    for (let r = 1; r <= rounds; r++) {
      sequence.push({ label: `Round ${r} Work`, type: "work", duration: work });
      sequence.push({ label: `Round ${r} Rest`, type: "rest", duration: rest });
    }
    return { sequence, meta: { totalRounds: rounds } };
  },
  hiit(config) {
    // Simple HIIT: rounds, work, rest (like generic). Add optional warmup & cooldown
    const rounds = config.rounds || 6;
    const work = config.work || 45;
    const rest = config.rest ? config.rest : 15;
    const warmup = config.warmup || 0;
    const cooldown = config.cooldown || 0;
    const prep = config.prep || 5;
    const sequence = [];
    if (prep)
      sequence.push({ label: "Get Ready", type: "prep", duration: prep });
    if (warmup)
      sequence.push({ label: "Warm Up", type: "prep", duration: warmup });
    for (let r = 1; r <= rounds; r++) {
      sequence.push({ label: `Round ${r} Work`, type: "work", duration: work });
      sequence.push({ label: `Round ${r} Rest`, type: "rest", duration: rest });
    }
    if (cooldown)
      sequence.push({
        label: "Cool Down",
        type: "cooldown",
        duration: cooldown,
      });
    return { sequence, meta: { totalRounds: rounds } };
  },
  custom(config) {
    // Custom allows full arrays? For now: rounds, work, rest, roundRestBetween? optional prep
    const rounds = config.rounds || 5;
    const work = config.work || 30;
    const rest = config.rest || 15;
    const between = config.betweenRounds || 0;
    const prep = config.prep || 5;
    const sequence = [];
    if (prep)
      sequence.push({ label: "Get Ready", type: "prep", duration: prep });
    for (let r = 1; r <= rounds; r++) {
      sequence.push({ label: `Round ${r} Work`, type: "work", duration: work });
      if (rest)
        sequence.push({
          label: `Round ${r} Rest`,
          type: "rest",
          duration: rest,
        });
      if (between && r < rounds)
        sequence.push({
          label: `Between Rounds`,
          type: "rest",
          duration: between,
        });
    }
    return { sequence, meta: { totalRounds: rounds } };
  },
};

// ---------- Timer Engine ----------
class TimerEngine {
  constructor() {
    // Initialize core mutable state & listeners before any method emits events
    this.listeners = {};
    this.sequence = [];
    this.position = 0;
    this.remaining = 0;
    this.state = "idle";
    this.startedAt = null;
    this.lastTick = null;
    this._tick = this._tick.bind(this);
  }
  load(sequence) {
    this.sequence = sequence.map((s, i) => ({ ...s, index: i }));
    this.position = 0;
    this.remaining = this.sequence[0] ? this.sequence[0].duration : 0;
    this.state = "idle";
    this.startedAt = null;
    this.lastTick = null;
    this.emit("load", { sequence: this.sequence });
  }
  on(evt, cb) {
    if (!this.listeners[evt]) this.listeners[evt] = new Set();
    this.listeners[evt].add(cb);
    return () => this.listeners[evt].delete(cb);
  }
  emit(evt, payload) {
    const list = this.listeners[evt];
    if (list)
      list.forEach((cb) => {
        try {
          cb(payload);
        } catch (e) {
          console.error(e);
        }
      });
  }
  start() {
    if (!this.sequence.length) return;
    if (this.state === "running") return;
    this.state = "running";
    this.startedAt = performance.now();
    this.lastTick = performance.now();
    this.emit("start", this.current());
    this._raf = requestAnimationFrame(this._tick);
  }
  pause() {
    if (this.state !== "running") return;
    this.state = "paused";
    cancelAnimationFrame(this._raf);
    this.emit("pause", this.current());
  }
  resume() {
    if (this.state !== "paused") return;
    this.state = "running";
    this.lastTick = performance.now();
    this.emit("resume", this.current());
    this._raf = requestAnimationFrame(this._tick);
  }
  reset() {
    cancelAnimationFrame(this._raf);
    this.sequence = [];
    this.position = 0;
    this.remaining = 0;
    this.state = "idle";
    this.startedAt = null;
    this.lastTick = null;
    this.emit("reset");
  }
  skip() {
    if (this.state === "finished") return;
    this._advance();
  }
  current() {
    return this.sequence[this.position];
  }
  _advance() {
    this.position++;
    if (this.position >= this.sequence.length) {
      this.state = "finished";
      cancelAnimationFrame(this._raf);
      this.emit("finish");
      return;
    }
    this.remaining = this.sequence[this.position].duration;
    this.emit("interval", this.current());
  }
  _tick(now) {
    if (this.state !== "running") {
      return;
    }
    const dt = (now - this.lastTick) / 1000;
    if (dt >= 0.05) {
      this.remaining -= dt;
      this.lastTick = now;
      if (this.remaining <= 0) {
        this.emit("interval_complete", this.current());
        this._advance();
      }
      this.emit("tick", {
        remaining: Math.max(0, this.remaining),
        interval: this.current(),
        position: this.position,
      });
    }
    if (this.state === "running") this._raf = requestAnimationFrame(this._tick);
  }
  totalDuration() {
    return this.sequence.reduce((a, b) => a + b.duration, 0);
  }
}

// ---------- Audio (simple beep) ----------
class Beeper {
  constructor() {
    this.ctx = null;
  }
  _ensure() {
    if (!this.ctx)
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  beep({ freq = 660, duration = 0.12, type = "sine", volume = 0.3 } = {}) {
    this._ensure();
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }
  sequence() {
    this.beep({ freq: 660 });
    setTimeout(() => this.beep({ freq: 880 }), 120);
  }
}
const beeper = new Beeper();

// Optional voice cues using SpeechSynthesis
function speak(text) {
  if (!$("#voiceToggle").checked) return;
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  u.pitch = 1;
  u.volume = 0.85;
  window.speechSynthesis.speak(u);
}

// ---------- UI Controller ----------
const engine = new TimerEngine();

const els = {
  workoutType: $("#workoutType"),
  dynamicFields: $("#dynamicFields"),
  totalDuration: $("#totalDuration"),
  roundCount: $("#roundCount"),
  sequencePreview: $("#sequencePreview"),
  mainTime: $("#mainTime"),
  intervalLabel: $("#intervalLabel"),
  roundInfo: $("#roundInfo"),
  nextInterval: $("#nextInterval"),
  startBtn: $("#startBtn"),
  pauseBtn: $("#pauseBtn"),
  resetBtn: $("#resetBtn"),
  skipBtn: $("#skipBtn"),
  progressBar: $("#progressBar"),
  roundLog: $("#roundLog"),
  statusBadges: $("#statusBadges"),
  soundToggle: $("#soundToggle"),
  presetSelect: $("#presetSelect"),
  savePresetBtn: $("#savePresetBtn"),
  screenSelect: $("#screenSelect"),
  screenConfig: $("#screenConfig"),
  screenTimer: $("#screenTimer"),
  configSummary: $("#configSummary"),
  backToSelectBtn: $("#backToSelectBtn"),
  goToTimerBtn: $("#goToTimerBtn"),
  timerBackBtn: $("#timerBackBtn"),
  timerRestartBtn: $("#timerRestartBtn"),
};

const defaultConfigs = {
  emom: { prep: 5, rounds: 10, work: 40 },
  tabata: { prep: 5, rounds: 8, work: 20, rest: 10 },
  hiit: { prep: 5, rounds: 6, work: 45, rest: 15, warmup: 60, cooldown: 60 },
  custom: { prep: 5, rounds: 5, work: 30, rest: 15, betweenRounds: 0 },
};

// Persistence
const STORAGE_KEY = "workoutTimer.presets.v1";
function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}
function savePresets(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}
let presets = loadPresets();

function updatePresetSelect() {
  els.presetSelect.innerHTML =
    '<option value="">Presets...</option>' +
    Object.keys(presets)
      .map((k) => `<option value="${k}">${k}</option>`)
      .join("");
}
updatePresetSelect();

els.savePresetBtn.addEventListener("click", async () => {
  const name = await promptDialog({
    title: "Save Preset",
    label: "Preset Name",
    placeholder: "e.g. Morning HIIT",
    defaultValue: "",
    confirmText: "Save",
    validate: (v) => v.length > 0,
  });
  if (!name) return;
  presets[name] = collectConfig();
  savePresets(presets);
  updatePresetSelect();
  announce("Preset saved");
});

els.presetSelect.addEventListener("change", (e) => {
  const v = e.target.value;
  if (!v) return;
  applyConfig(presets[v]);
  build();
});

// Dynamic form fields builder
const fieldDefs = {
  rounds: { label: "Rounds", min: 1, max: 200 },
  work: { label: "Work (s)", min: 1, max: 3600 },
  rest: { label: "Rest (s)", min: 0, max: 3600 },
  warmup: { label: "Warmup (s)", min: 0, max: 1200 },
  cooldown: { label: "Cooldown (s)", min: 0, max: 1200 },
  prep: { label: "Prep (s)", min: 0, max: 1200 },
  betweenRounds: { label: "Between Rounds Rest (s)", min: 0, max: 1200 },
};

const typeFieldMap = {
  emom: ["prep", "rounds", "work"],
  tabata: ["prep", "rounds", "work", "rest"],
  hiit: ["prep", "warmup", "rounds", "work", "rest", "cooldown"],
  custom: ["prep", "rounds", "work", "rest", "betweenRounds"],
};

function renderFields(type) {
  const cfg = (currentConfigMemory[type] ||= { ...defaultConfigs[type] });
  els.dynamicFields.innerHTML = `<table class="w-full text-sm font-medium mx-auto">
    ${typeFieldMap[type]
      .map((key) => {
        const d = fieldDefs[key];
        const val = cfg[key] ?? "";
        return `<tr>
          <td class="py-2 pr-4 text-left">${d.label}</td>
          <td class="py-2">
            <div class="number-stepper">
              <button type="button" class="step-btn" data-step="-1" aria-label="Decrease ${d.label}" data-target="f_${key}">−</button>
              <input type="number" inputmode="numeric" pattern="[0-9]*" id="f_${key}" data-key="${key}" min="${d.min}" max="${d.max}" value="${val}" class="field text-base" />
              <button type="button" class="step-btn" data-step="1" aria-label="Increase ${d.label}" data-target="f_${key}">+</button>
            </div>
          </td>
        </tr>`;
      })
      .join("")}
  </table>`;
  // attach listeners
  $$("input[data-key]", els.dynamicFields).forEach((inp) => {
    inp.addEventListener("input", () => {
      build();
    });
  });
  // stepper buttons
  $$(".step-btn", els.dynamicFields).forEach((btn) => {
    const activate = (mult = 1) => {
      const id = btn.dataset.target;
      const inp = document.getElementById(id);
      if (!inp) return;
      const step = parseInt(btn.dataset.step, 10) || 0;
      let current = parseInt(inp.value, 10);
      if (isNaN(current)) current = 0;
      const min = parseInt(inp.min, 10);
      const max = parseInt(inp.max, 10);
      let next = current + step * mult;
      if (!isNaN(min)) next = Math.max(min, next);
      if (!isNaN(max)) next = Math.min(max, next);
      inp.value = next;
      inp.dispatchEvent(new Event("input"));
    };
    btn.addEventListener("click", (e) => activate(e.shiftKey ? 5 : 1));
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate(e.shiftKey ? 5 : 1);
      }
    });
  });
}

let currentConfigMemory = {}; // memory per type

function collectConfig() {
  const type = els.workoutType.value;
  const cfg = { ...defaultConfigs[type] };
  $$("input[data-key]", els.dynamicFields).forEach((inp) => {
    const k = inp.dataset.key;
    const v = parseInt(inp.value, 10);
    if (!isNaN(v)) cfg[k] = v;
  });
  currentConfigMemory[type] = cfg;
  return { type, ...cfg };
}

function applyConfig(cfg) {
  const { type } = cfg;
  if (type && type !== els.workoutType.value) {
    els.workoutType.value = type;
  }
  currentConfigMemory[type] = { ...cfg };
  renderFields(type);
  $$("input[data-key]", els.dynamicFields).forEach((inp) => {
    const key = inp.dataset.key;
    if (cfg[key] != null) inp.value = cfg[key];
  });
}

function build() {
  const { type, ...cfg } = collectConfig();
  const builder = WorkoutTypes[type];
  if (!builder) {
    return;
  }
  const { sequence, meta } = builder(cfg);
  engine.load(sequence);
  // Update UI preview & stats
  els.roundCount.textContent = meta.totalRounds ?? "?";
  els.totalDuration.textContent = formatTime(engine.totalDuration());
  els.sequencePreview.innerHTML = sequence
    .map((it, i) => {
      const color =
        it.type === "work"
          ? "text-emerald-400"
          : it.type === "rest"
          ? "text-sky-400"
          : it.type === "prep"
          ? "text-amber-400"
          : it.type === "cooldown"
          ? "text-violet-300"
          : "";
      return `<li class="flex justify-between gap-3 ${
        i === 0 ? "opacity-100" : "opacity-90"
      }"><span class="${color}">${
        it.label
      }</span><span class="tabular-nums ${color}">${formatTime(
        it.duration
      )}</span></li>`;
    })
    .join("");
  els.intervalLabel.textContent = "Ready";
  els.mainTime.textContent = formatTime(sequence[0]?.duration || 0);
  els.roundInfo.textContent = `Round 0 / ${meta.totalRounds ?? 0}`;
  els.nextInterval.textContent = sequence[1]
    ? `Next: ${sequence[1].label} (${formatTime(sequence[1].duration)})`
    : "";
  updateBadges();
  updateConfigSummary(type, cfg, meta);
}

function updateBadges() {
  els.statusBadges.innerHTML = `<span class="px-2 py-0.5 rounded bg-slate-700/60 text-[10px] uppercase tracking-wide">${els.workoutType.value}</span>`;
}

els.workoutType.addEventListener("change", () => {
  renderFields(els.workoutType.value);
  build();
});

// Controls
els.startBtn.addEventListener("click", () => {
  if (engine.state === "paused") {
    engine.resume();
    return;
  }
  if (engine.state === "running") return; // already
  engine.start();
});
els.pauseBtn.addEventListener("click", () => {
  if (engine.state === "running") engine.pause();
  else if (engine.state === "paused") engine.resume();
});
els.resetBtn.addEventListener("click", () => {
  build();
  setControlState("idle");
  announce("Reset");
});
els.skipBtn.addEventListener("click", () => engine.skip());

function setControlState(state) {
  if (state === "idle") {
    els.startBtn.disabled = false;
    els.pauseBtn.disabled = true;
    els.resetBtn.disabled = true;
    els.skipBtn.disabled = true;
    els.pauseBtn.textContent = "Pause";
  } else if (state === "running") {
    els.startBtn.disabled = true;
    els.pauseBtn.disabled = false;
    els.resetBtn.disabled = false;
    els.skipBtn.disabled = false;
    els.pauseBtn.textContent = "Pause";
  } else if (state === "paused") {
    els.startBtn.disabled = true;
    els.pauseBtn.disabled = false;
    els.resetBtn.disabled = false;
    els.skipBtn.disabled = false;
    els.pauseBtn.textContent = "Resume";
  } else if (state === "finished") {
    els.startBtn.disabled = false;
    els.pauseBtn.disabled = true;
    els.resetBtn.disabled = false;
    els.skipBtn.disabled = true;
    els.pauseBtn.textContent = "Pause";
  }
}

// Engine events
engine.on("load", () => setControlState("idle"));
engine.on("start", (interval) => {
  setControlState("running");
  displayInterval(interval);
  if (els.soundToggle.checked) beeper.sequence();
  announce(`Start ${interval.label}`);
  speak(`${interval.label} start`);
});
engine.on("interval", (interval) => {
  displayInterval(interval);
  if (els.soundToggle.checked) beeper.sequence();
  announce(interval.label);
  speak(interval.label);
  logRound(interval);
});
engine.on("interval_complete", (interval) => {
  if (els.soundToggle.checked) beeper.beep({ freq: 440 });
});
engine.on("pause", () => {
  setControlState("paused");
  announce("Paused");
});
engine.on("resume", () => {
  setControlState("running");
  announce("Resumed");
});
engine.on("finish", () => {
  setControlState("finished");
  displayFinished();
  announce("Workout complete");
  speak("Workout complete");
  if ($("#autoRestartToggle").checked) {
    setTimeout(() => {
      build();
      engine.start();
    }, 2000);
  }
});
engine.on("tick", ({ remaining, interval, position }) =>
  updateTick(remaining, interval, position)
);

function displayInterval(interval) {
  els.intervalLabel.textContent = interval.label;
  const workIndex = engine.sequence
    .filter((s) => s.type === "work")
    .indexOf(interval);
  const totalWork = engine.sequence.filter((s) => s.type === "work").length;
  els.roundInfo.textContent = `Round ${
    workIndex >= 0 ? workIndex + 1 : 0
  } / ${totalWork}`;
  const next = engine.sequence[interval.index + 1];
  els.nextInterval.textContent = next
    ? `Next: ${next.label} (${formatTime(next.duration)})`
    : "";
  els.mainTime.textContent = formatTime(interval.duration);
  // Phase classes on body
  document.body.classList.remove(
    "phase-work",
    "phase-rest",
    "phase-prep",
    "phase-cooldown"
  );
  document.body.classList.add("phase-" + interval.type);
  // Progress bar color classes
  els.progressBar.classList.remove(
    "progress-bar-work",
    "progress-bar-rest",
    "progress-bar-prep",
    "progress-bar-cooldown"
  );
  els.progressBar.classList.add("progress-bar-" + interval.type);
}

function displayFinished() {
  els.intervalLabel.textContent = "Finished";
  els.nextInterval.textContent = "";
  els.mainTime.textContent = "00:00";
  els.progressBar.style.width = "100%";
  els.progressBar.classList.remove(
    "progress-bar-work",
    "progress-bar-rest",
    "progress-bar-prep",
    "progress-bar-cooldown"
  );
  document.body.classList.remove(
    "phase-work",
    "phase-rest",
    "phase-prep",
    "phase-cooldown"
  );
}

function updateTick(remaining, interval) {
  els.mainTime.textContent = formatTime(Math.ceil(remaining));
  const elapsed = interval.duration - remaining;
  const pct = Math.min(100, (elapsed / interval.duration) * 100);
  els.progressBar.style.width = pct + "%";
  // last 3 second beeps
  const rInt = Math.ceil(remaining);
  if (els.soundToggle.checked && rInt <= 3 && rInt > 0) {
    if (!updateTick._last || updateTick._last !== rInt) {
      beeper.beep({ freq: rInt === 1 ? 880 : 520 });
      updateTick._last = rInt;
    }
  }
}

function logRound(interval) {
  if (interval.type !== "work") return;
  const li = document.createElement("li");
  li.innerHTML = `<span class="text-emerald-400">✔</span> <span>${interval.label}</span>`;
  els.roundLog.appendChild(li);
  // keep scrolled to bottom
  els.roundLog.scrollTop = els.roundLog.scrollHeight;
}

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") {
    e.preventDefault();
    if (engine.state === "running") engine.pause();
    else if (engine.state === "paused") engine.resume();
    else if (engine.state === "idle") engine.start();
  }
  if (e.key === "r") {
    build();
  }
  if (e.key === "s") {
    engine.skip();
  }
});

// Initial render
renderFields(els.workoutType.value);
build();

// Expose for debugging
window.__engine = engine;

// Simple lightweight manual test (dev helper). Call window.__testTabata() in console.
window.__testTabata = function () {
  const testCfg = { type: "tabata", rounds: 2, work: 3, rest: 2 };
  console.log("Testing Tabata config", testCfg);
  const { sequence } = WorkoutTypes.tabata(testCfg);
  if (sequence.length !== testCfg.rounds * 2)
    console.error("Unexpected sequence length", sequence.length);
  else console.log("Sequence length OK");
  console.log(
    "Total duration",
    sequence.reduce((a, b) => a + b.duration, 0),
    "s"
  );
  return sequence;
};

// ---------- Screen Navigation ----------
function showScreen(id) {
  ["screenSelect", "screenConfig", "screenTimer"].forEach((sc) => {
    const el = els[sc];
    if (!el) return;
    el.classList.add("hidden");
    el.classList.remove("active");
  });
  const target = els[id];
  if (target) {
    target.classList.remove("hidden");
    target.classList.add("active");
  }
  announce(id.replace("screen", "") + " screen");
}

// Select screen interactions
$$("#screenSelect button[data-type]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const type = btn.dataset.type;
    els.workoutType.value = type;
    renderFields(type);
    build();
    showScreen("screenConfig");
    window.scrollTo({ top: 0, behavior: "smooth" });
  })
);

els.backToSelectBtn?.addEventListener("click", async () => {
  if (engine.state === "running") {
    const ok = await confirmDialog({
      title: "Leave Configuration",
      message:
        "Timer is currently running. Reset and go back to workout type selection?",
      confirmText: "Reset & Back",
      cancelText: "Stay",
    });
    if (!ok) return;
  }
  showScreen("screenSelect");
});
els.goToTimerBtn?.addEventListener("click", () => {
  build();
  showScreen("screenTimer");
  window.scrollTo({ top: 0 });
});
els.timerBackBtn?.addEventListener("click", async () => {
  if (engine.state === "running") {
    const ok = await confirmDialog({
      title: "Return to Configuration",
      message: "Pause current workout and return to configuration?",
      confirmText: "Pause & Return",
      cancelText: "Stay",
    });
    if (!ok) return;
    engine.pause();
  }
  showScreen("screenConfig");
});
els.timerRestartBtn?.addEventListener("click", () => {
  build();
  engine.start();
});

function updateConfigSummary(type, cfg, meta) {
  if (!els.configSummary) return;
  const entries = Object.entries(cfg).filter(([k]) => k !== "type");
  els.configSummary.innerHTML =
    `<li><strong>Type:</strong> ${type}</li>` +
    entries
      .map(
        ([k, v]) =>
          `<li class="flex justify-between"><span>${k}</span><span class="tabular-nums">${v}</span></li>`
      )
      .join("") +
    `<li class="flex justify-between border-t border-slate-700 mt-2 pt-2"><span>Total Duration</span><span>${els.totalDuration.textContent}</span></li>`;
}

// default initial screen is select; if hash indicates direct type start on config
if (location.hash.startsWith("#type=")) {
  const t = location.hash.split("=")[1];
  if (WorkoutTypes[t]) {
    els.workoutType.value = t;
    renderFields(t);
    build();
    showScreen("screenConfig");
  }
} else {
  showScreen("screenSelect");
}

// ---------- Custom Confirm Dialog ----------
const modalRoot = document.getElementById("modalRoot");
const modalTitle = document.getElementById("modalTitle");
const modalMessage = document.getElementById("modalMessage");
const modalOk = document.getElementById("modalOk");
const modalCancel = document.getElementById("modalCancel");
let modalResolve;
let modalType = "confirm";
let modalInputEl = null;

function confirmDialog({
  title = "Confirm",
  message = "",
  confirmText = "OK",
  cancelText = "Cancel",
} = {}) {
  modalType = "confirm";
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalOk.textContent = confirmText;
  modalCancel.textContent = cancelText;
  // remove input if exists
  if (modalInputEl) {
    modalInputEl.parentElement.remove();
    modalInputEl = null;
  }
  modalRoot.classList.remove("hidden");
  modalOk.focus();
  return new Promise((res) => {
    modalResolve = (v) => {
      res(v);
      closeModal();
    };
  });
}

function promptDialog({
  title = "Enter Value",
  label = "Value",
  placeholder = "",
  defaultValue = "",
  confirmText = "Save",
  cancelText = "Cancel",
  validate,
} = {}) {
  modalType = "prompt";
  modalTitle.textContent = title;
  modalMessage.textContent = label;
  modalOk.textContent = confirmText;
  modalCancel.textContent = cancelText;
  if (modalInputEl) {
    modalInputEl.parentElement.remove();
    modalInputEl = null;
  }
  const wrap = document.createElement("div");
  wrap.className = "mt-2";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "field text-sm";
  input.placeholder = placeholder;
  input.value = defaultValue;
  input.setAttribute("aria-label", label);
  wrap.appendChild(input);
  modalMessage.insertAdjacentElement("afterend", wrap);
  modalInputEl = input;
  modalRoot.classList.remove("hidden");
  setTimeout(() => input.focus(), 40);
  return new Promise((res) => {
    modalResolve = (v) => {
      res(v);
      closeModal();
    };
  }).then((v) => {
    if (v === false) return null;
    const val = input.value.trim();
    if (validate) {
      const valid = validate(val);
      if (!valid) return null;
    }
    return val || null;
  });
}

function closeModal() {
  modalRoot.classList.add("hidden");
  if (modalInputEl) {
    modalInputEl.parentElement.remove();
    modalInputEl = null;
  }
}
modalOk.addEventListener("click", () => {
  if (modalType === "prompt") modalResolve?.(true);
  else modalResolve?.(true);
});
modalCancel.addEventListener("click", () => modalResolve?.(false));
modalRoot.addEventListener("click", (e) => {
  if (e.target === modalRoot) modalResolve?.(false);
});
window.addEventListener("keydown", (e) => {
  if (modalRoot.classList.contains("hidden")) return;
  if (e.key === "Escape") modalResolve?.(false);
  if (e.key === "Enter") {
    if (modalType === "prompt") modalResolve?.(true);
    else modalResolve?.(true);
  }
});
