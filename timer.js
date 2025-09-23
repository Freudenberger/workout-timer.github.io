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

function showToast(msg) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.remove("opacity-0");
  els.toast.classList.add("opacity-100");
  setTimeout(() => {
    els.toast.classList.remove("opacity-100");
    els.toast.classList.add("opacity-0");
  }, 2000);
}

// ---------- Workout Type Definitions ----------
// Each builder returns { sequence: Interval[], meta }
// Interval: { label, type: 'work'|'rest'|'prep'|'cooldown', duration }

const WorkoutTypes = {
  emom(config) {
    // EMOM: user sets minutes (rounds) & work duration (<=60) remainder is rest
    const rounds = config.rounds || 10;
    const work = config.work || 40; // seconds
    const prep = config.prep || 10;
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
    const prep = config.prep || 10;
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
    const prep = config.prep || 10;
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
    // Enhanced Custom: supports multiple exercises per round.
    // Backward compatibility: if legacy work/rest provided and no exerciseWork exists, map them.
    const rounds = config.rounds || 1;
    const exercisesPerRound = config.exercisesPerRound || 1;
    const exerciseWork = config.exerciseWork || config.work || 30;
    const exerciseRest =
      config.exerciseRest !== undefined
        ? config.exerciseRest
        : config.rest !== undefined
        ? config.rest
        : 10;
    const betweenRounds = config.betweenRounds || 0;
    const prep = config.prep || 10;
    const sequence = [];
    if (prep)
      sequence.push({ label: "Get Ready", type: "prep", duration: prep });
    for (let r = 1; r <= rounds; r++) {
      for (let e = 1; e <= exercisesPerRound; e++) {
        sequence.push({
          label: `R${r} Ex ${e} Work`,
          type: "work",
          duration: exerciseWork,
        });
        if (exerciseRest && e < exercisesPerRound) {
          sequence.push({
            label: `R${r} Ex ${e} Rest`,
            type: "rest",
            duration: exerciseRest,
          });
        }
      }
      if (betweenRounds && r < rounds) {
        sequence.push({
          label: `Between Round ${r}`,
          type: "rest",
          duration: betweenRounds,
        });
      }
    }
    return { sequence, meta: { totalRounds: rounds, exercisesPerRound } };
  },
  micro(config) {
    // Micro: fixed short interval repeated 'reps' times, beep each interval end.
    const reps = config.reps || 50;
    const interval = config.interval || 5;
    const prep = config.prep || 10;
    const sequence = [];
    if (prep)
      sequence.push({ label: "Get Ready", type: "prep", duration: prep });
    for (let i = 1; i <= reps; i++) {
      sequence.push({ label: `Rep ${i}`, type: "work", duration: interval });
    }
    return { sequence, meta: { totalRounds: reps } };
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
    this.emit("skipped", this.current());
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

// Track last mark timestamp for calculating time between marks
let lastMarkTime = null;

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
  markBtn: $("#markBtn"),
  skipBtn: $("#skipBtn"),
  progressBar: $("#progressBar"),
  roundLog: $("#roundLog"),
  statusBadges: $("#statusBadges"),
  soundToggle: $("#soundToggle"),
  presetSelect: $("#presetSelect"),
  savePresetBtn: $("#savePresetBtn"),
  copyLinkBtn: $("#copyLinkBtn"),
  importUrlInput: $("#importUrlInput"),
  importUrlBtn: $("#importUrlBtn"),
  importStatus: $("#importStatus"),
  screenSelect: $("#screenSelect"),
  screenConfig: $("#screenConfig"),
  screenTimer: $("#screenTimer"),
  configSummary: $("#configSummary"),
  backToSelectBtn: $("#backToSelectBtn"),
  goToTimerBtn: $("#goToTimerBtn"),
  timerBackBtn: $("#timerBackBtn"),
  timerRestartBtn: $("#timerRestartBtn"),
  timerCopyBtn: $("#timerCopyBtn"),
  toast: $("#toast"),
};

const defaultConfigs = {
  emom: { prep: 10, rounds: 10, work: 40 },
  tabata: { prep: 10, rounds: 8, work: 20, rest: 10 },
  hiit: { prep: 10, rounds: 6, work: 45, rest: 15, warmup: 60, cooldown: 60 },
  // Custom now supports multiple exercises per round. For backwards compatibility
  // legacy presets with work/rest only will map to exerciseWork/exerciseRest with exercisesPerRound=1
  custom: {
    prep: 10,
    rounds: 5,
    exercisesPerRound: 3,
    exerciseWork: 30,
    exerciseRest: 10,
    betweenRounds: 30,
  },
  // Micro: very small fixed interval repeated N times (e.g., every 5s do 1 rep / action)
  micro: { prep: 10, reps: 100, interval: 5 },
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
  work: { label: "Work (s)", min: 1, max: 3600 }, // legacy (non-custom multi-exercise)
  rest: { label: "Rest (s)", min: 0, max: 3600 }, // legacy
  warmup: { label: "Warmup (s)", min: 0, max: 1200 },
  cooldown: { label: "Cooldown (s)", min: 0, max: 1200 },
  prep: { label: "Prep (s)", min: 0, max: 1200 },
  betweenRounds: { label: "Between Rounds Rest (s)", min: 0, max: 1200 },
  exercisesPerRound: { label: "Exercises / Round", min: 1, max: 50 },
  exerciseWork: { label: "Exercise Work (s)", min: 1, max: 3600 },
  exerciseRest: { label: "Exercise Rest (s)", min: 0, max: 3600 },
  reps: { label: "Reps (Intervals)", min: 1, max: 10000 },
  interval: { label: "Interval (s)", min: 1, max: 3600 },
};

const typeFieldMap = {
  emom: ["prep", "rounds", "work"],
  tabata: ["prep", "rounds", "work", "rest"],
  hiit: ["prep", "warmup", "rounds", "work", "rest", "cooldown"],
  // Custom uses the multi-exercise set; legacy work/rest omitted from UI
  custom: [
    "prep",
    "rounds",
    "exercisesPerRound",
    "exerciseWork",
    "exerciseRest",
    "betweenRounds",
  ],
  micro: ["prep", "reps", "interval"],
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
              <input type="number" inputmode="numeric" pattern="[0-9]*" id="f_${key}" data-key="${key}" min="${d.min}" max="${d.max}" value="${val}" class="field text-base" aria-label="${d.label}" />
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
  if (type === "custom") {
    // Map legacy work/rest to exerciseWork/exerciseRest if user loaded an old preset
    if (cfg.work != null && cfg.exerciseWork == null)
      cfg.exerciseWork = cfg.work;
    if (cfg.rest != null && cfg.exerciseRest == null)
      cfg.exerciseRest = cfg.rest;
  }
  currentConfigMemory[type] = cfg;
  return { type, ...cfg };
}

function applyConfig(cfg) {
  const { type } = cfg;
  if (type && type !== els.workoutType.value) {
    els.workoutType.value = type;
  }
  currentConfigMemory[type] = { ...cfg };
  if (type === "custom") {
    const c = currentConfigMemory[type];
    if (c.work != null && c.exerciseWork == null) c.exerciseWork = c.work;
    if (c.rest != null && c.exerciseRest == null) c.exerciseRest = c.rest;
    if (c.exercisesPerRound == null) c.exercisesPerRound = 1;
  }
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
  // For micro type, totalRounds represents total reps (each interval is one rep)
  els.totalDuration.textContent = formatTime(engine.totalDuration());
  els.sequencePreview.innerHTML = sequence
    .map((it, i) => {
      // classify rest sub-types for custom multi-exercise: exercise rest vs between-round
      let clsType = it.type;
      if (it.type === "rest") {
        if (/Between Round/.test(it.label) || /Between Rounds/.test(it.label))
          clsType = "rest-between";
        else if (/Ex \d+ Rest/.test(it.label)) clsType = "rest-exercise";
      } else if (it.type === "prep" && /Warm Up/i.test(it.label)) {
        clsType = "warmup"; // differentiate warmup prep
      }
      const liClasses = ["seq-item", `seq-${clsType}`, i === 0 ? "current" : ""]
        .filter(Boolean)
        .join(" ");
      return `<li class="${liClasses}"><span class="seq-dot"></span><span class="seq-label">${
        it.label
      }</span><span class="seq-time">${formatTime(it.duration)}</span></li>`;
    })
    .join("");
  els.intervalLabel.textContent = "Ready";
  els.mainTime.textContent = formatTime(sequence[0]?.duration || 0);
  const totalDur = engine.totalDuration();
  const baseRoundInfo =
    type === "custom"
      ? "Round 0 • Exercise 0"
      : `Round 0 / ${meta.totalRounds ?? 0}`;
  els.roundInfo.textContent = `${baseRoundInfo} • Elapsed 00:00 • Left ${formatTime(
    totalDur
  )}`;
  els.nextInterval.textContent = sequence[1]
    ? `Next: ${sequence[1].label} (${formatTime(sequence[1].duration)})`
    : "";
  updateBadges();
  updateConfigSummary(type, cfg, meta);
}

// -------- Shareable URL Logic --------
function configToQuery() {
  const { type, ...cfg } = collectConfig();
  const params = new URLSearchParams();
  params.set("type", type);
  Object.entries(cfg).forEach(([k, v]) => {
    if (typeof v === "number" && !isNaN(v)) params.set(k, String(v));
  });
  return params.toString();
}

// Clear current query string (optionally preserving selected keys)
function clearQueryString(preserveKeys = []) {
  if (!location.search) return false;
  try {
    const url = new URL(location.href);
    if (preserveKeys.length) {
      const kept = new URLSearchParams();
      preserveKeys.forEach((k) => {
        if (url.searchParams.has(k)) kept.set(k, url.searchParams.get(k));
      });
      url.search = kept.toString() ? `?${kept.toString()}` : "";
    } else {
      url.search = "";
    }
    const originPart = url.origin && url.origin !== "null" ? url.origin : "";
    history.replaceState(
      null,
      "",
      originPart + url.pathname + url.search + url.hash
    );
    return true;
  } catch (e) {
    try {
      const base = location.href.split("?")[0];
      history.replaceState(null, "", base + location.hash);
      return true;
    } catch {
      return false;
    }
  }
}

// Parse URLSearchParams into config & apply (returns true on success)
function applyParams(qs) {
  if (!qs.has("type")) return false;
  const type = qs.get("type");
  if (!WorkoutTypes[type]) return false;
  const cfg = { type };
  const numericFields = new Set([
    "prep",
    "rounds",
    "work",
    "rest",
    "warmup",
    "cooldown",
    "betweenRounds",
    "exercisesPerRound",
    "exerciseWork",
    "exerciseRest",
    "reps",
    "interval",
  ]);
  qs.forEach((val, key) => {
    if (numericFields.has(key)) {
      const n = parseInt(val, 10);
      if (!isNaN(n)) cfg[key] = n;
    }
  });
  applyConfig(cfg);
  build();
  return true;
}

function applyQueryParams() {
  const qs = new URLSearchParams(location.search);
  if (!applyParams(qs)) return false;
  showScreen("screenTimer");
  clearQueryString();
  return true;
}

if (els.copyLinkBtn) {
  els.copyLinkBtn.addEventListener("click", async () => {
    // Ensure latest build before exporting
    build();
    const qs = configToQuery();
    let origin = location.origin;

    if (origin === "null") origin = "file://"; // handle file:// fallback

    const url = `${origin}${location.pathname}?${qs}`;
    try {
      await navigator.clipboard.writeText(url);
      announce("Shareable URL copied");
      showToast("URL copied!");
    } catch (e) {
      console.warn("Clipboard copy failed", e);
      // Fallback prompt
      window.prompt("Copy URL", url);
    }
  });
}

// Copy from Timer screen (uses existing collected config, rebuild for freshness)
if (els.timerCopyBtn) {
  els.timerCopyBtn.addEventListener("click", async () => {
    build(); // ensure UI + sequence reflect current editable config
    const qs = configToQuery();
    let origin = location.origin;
    if (origin === "null") origin = "file://";
    const url = `${origin}${location.pathname}?${qs}`;
    try {
      await navigator.clipboard.writeText(url);
      announce("Timer URL copied");
      showToast("URL copied!");
    } catch (e) {
      console.warn("Clipboard copy failed", e);
      window.prompt("Copy URL", url);
    }
  });
}

// Manual import from Select screen
if (els.importUrlBtn && els.importUrlInput) {
  const handleImport = () => {
    const raw = els.importUrlInput.value.trim();
    if (!raw) return;
    let queryPart = "";
    const qIndex = raw.indexOf("?");
    if (qIndex !== -1) {
      queryPart = raw.substring(qIndex + 1).split("#")[0];
    } else {
      queryPart = raw;
    }
    try {
      // If full URL, extract search piece
      if (/^https?:/i.test(raw)) {
        const u = new URL(raw);
        queryPart = u.search; // includes leading ? or empty
      }
      // If user pasted just params without leading ? add it
      if (queryPart && !queryPart.startsWith("?")) queryPart = "?" + queryPart;
      const qs = new URLSearchParams(queryPart);
      const success = applyParams(qs);
      if (success) {
        announce("Configuration loaded from URL");
        clearQueryString();
        if (els.importStatus) {
          els.importStatus.textContent = "Loaded ✅";
          els.importStatus.className =
            "text-[10px] tracking-wide text-emerald-400 h-4";
        }
        showScreen("screenTimer");
      } else {
        announce("Invalid or unsupported parameters");
        if (els.importStatus) {
          els.importStatus.textContent = "Invalid parameters";
          els.importStatus.className =
            "text-[10px] tracking-wide text-rose-400 h-4";
        }
      }
    } catch (e) {
      console.warn("Import failed", e);
      announce("Failed to parse URL");
      if (els.importStatus) {
        els.importStatus.textContent = "Parse error";
        els.importStatus.className =
          "text-[10px] tracking-wide text-rose-400 h-4";
      }
    }
  };
  els.importUrlBtn.addEventListener("click", handleImport);
  els.importUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleImport();
    }
  });
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
  // Reset mark tracking
  lastMarkTime = null;
  // Clear progress & logs on explicit reset
  if (els.progressBar) {
    els.progressBar.style.width = "0%";
    els.progressBar.classList.remove(
      "progress-bar-work",
      "progress-bar-rest",
      "progress-bar-prep",
      "progress-bar-cooldown"
    );
  }
  if (els.roundLog) {
    els.roundLog.innerHTML = "";
  }
  document.body.classList.remove(
    "phase-work",
    "phase-rest",
    "phase-prep",
    "phase-cooldown"
  );
  announce("Reset");
});
els.skipBtn.addEventListener("click", () => engine.skip());
els.markBtn.addEventListener("click", () => {
  // Calculate current elapsed time
  const currentInterval = engine.current();
  if (!currentInterval) return;
  const remaining = engine.remaining;
  const elapsedInCurrent = currentInterval.duration - remaining;
  let totalElapsed = 0;
  for (let i = 0; i < engine.position; i++) {
    totalElapsed += engine.sequence[i].duration;
  }
  totalElapsed += elapsedInCurrent;

  // Calculate time since last mark
  const currentTime = performance.now() / 1000; // Convert to seconds
  let timeSinceLastMark = null;
  if (lastMarkTime !== null) {
    timeSinceLastMark = currentTime - lastMarkTime;
  }
  lastMarkTime = currentTime;

  // Log the mark
  logRound(currentInterval, {
    elapsed: totalElapsed,
    remaining: engine.totalDuration() - totalElapsed,
    marked: true,
    timeSinceLastMark,
  });
});

function setControlState(state) {
  if (state === "idle") {
    els.startBtn.disabled = false;
    els.pauseBtn.disabled = true;
    els.resetBtn.disabled = true;
    els.markBtn.disabled = true;
    els.skipBtn.disabled = true;
    els.pauseBtn.textContent = "Pause";
  } else if (state === "running") {
    els.startBtn.disabled = true;
    els.pauseBtn.disabled = false;
    els.resetBtn.disabled = false;
    els.markBtn.disabled = false;
    els.skipBtn.disabled = false;
    els.pauseBtn.textContent = "Pause";
  } else if (state === "paused") {
    els.startBtn.disabled = true;
    els.pauseBtn.disabled = false;
    els.resetBtn.disabled = false;
    els.markBtn.disabled = false;
    els.skipBtn.disabled = false;
    els.pauseBtn.textContent = "Resume";
  } else if (state === "finished") {
    els.startBtn.disabled = false;
    els.pauseBtn.disabled = true;
    els.resetBtn.disabled = false;
    els.markBtn.disabled = true;
    els.skipBtn.disabled = true;
    els.pauseBtn.textContent = "Pause";
  }
}

// Engine events
engine.on("load", () => setControlState("idle"));
engine.on("start", (interval) => {
  // Reset mark tracking for new workout
  lastMarkTime = null;
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
  // No logging here, moved to interval_complete
});
engine.on("interval_complete", (interval) => {
  if (els.soundToggle.checked) beeper.beep({ freq: 440 });
  // Log completed interval
  let totalElapsed = 0;
  for (let i = 0; i <= engine.position; i++) {
    // include current since it completed
    totalElapsed += engine.sequence[i].duration;
  }
  const totalRemaining = engine.totalDuration() - totalElapsed;
  logRound(interval, { elapsed: totalElapsed, remaining: totalRemaining });
});
engine.on("skipped", (interval) => {
  // Calculate elapsed and remaining for logging
  let totalElapsed = 0;
  for (let i = 0; i < engine.position; i++) {
    totalElapsed += engine.sequence[i].duration;
  }
  // For skipped, remaining is the same as before skip, since we didn't complete it
  const totalRemaining = engine.totalDuration() - totalElapsed;
  logRound(interval, {
    elapsed: totalElapsed,
    remaining: totalRemaining,
    skipped: true,
  });
});
engine.on("pause", () => {
  setControlState("paused");
  // Log pause event
  const currentInterval = engine.current();
  if (currentInterval) {
    const remaining = engine.remaining;
    const elapsedInCurrent = currentInterval.duration - remaining;
    let totalElapsed = 0;
    for (let i = 0; i < engine.position; i++) {
      totalElapsed += engine.sequence[i].duration;
    }
    totalElapsed += elapsedInCurrent;
    logRound(null, {
      elapsed: totalElapsed,
      remaining: engine.totalDuration() - totalElapsed,
      customMessage: "Paused",
    });
  }
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
  const workIntervals = engine.sequence.filter((s) => s.type === "work");
  const workIndex = workIntervals.indexOf(interval);
  const totalWork = workIntervals.length;
  // Try to infer exercises per round for custom type from meta (if available on engine?)
  // Since meta isn't stored on engine we attempt pattern detection: labels starting with R# Ex # Work
  let roundDisplay = 0;
  if (/^R\d+ Ex \d+ Work/.test(interval.label)) {
    const m = interval.label.match(/^R(\d+) Ex (\d+)/);
    if (m) {
      const rNum = parseInt(m[1], 10);
      const exNum = parseInt(m[2], 10);
      roundDisplay = rNum;
      els.roundInfo.textContent = `Round ${rNum} • Exercise ${exNum}`; // elapsed/left appended in tick
    }
  }
  if (!roundDisplay) {
    els.roundInfo.textContent = `Work ${workIndex + 1} / ${totalWork}`; // elapsed/left appended in tick
  }
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
  // Highlight current item in sequence preview
  const items = $$("#sequencePreview li.seq-item");
  items.forEach((li, idx) => {
    if (idx === interval.index) li.classList.add("current");
    else li.classList.remove("current");
  });
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
  // Update elapsed / remaining global workout info
  const total = engine.totalDuration();
  // Compute how much time has elapsed overall: sum of completed intervals + (current interval duration - remaining)
  let completed = 0;
  for (let i = 0; i < engine.position; i++)
    completed += engine.sequence[i].duration;
  const overallElapsed = completed + (interval.duration - remaining);
  const overallLeft = Math.max(0, total - overallElapsed);
  // Preserve base round text (before the • Elapsed) by splitting if already present
  let base = els.roundInfo.textContent;
  const marker = " • Elapsed";
  if (base.includes(marker)) base = base.split(marker)[0];
  els.roundInfo.textContent = `${base} • Elapsed ${formatTime(
    Math.max(0, Math.floor(overallElapsed))
  )} • Left ${formatTime(Math.max(0, Math.ceil(overallLeft)))}`;
  // last 3 second beeps
  const rInt = Math.ceil(remaining);
  if (els.soundToggle.checked && rInt <= 3 && rInt > 0) {
    if (!updateTick._last || updateTick._last !== rInt) {
      beeper.beep({ freq: rInt === 1 ? 880 : 520 });
      updateTick._last = rInt;
    }
  }
}

function logRound(
  interval,
  {
    elapsed,
    remaining,
    marked = false,
    skipped = false,
    paused = false,
    customMessage = null,
    timeSinceLastMark = null,
  } = {}
) {
  if (interval && interval.type !== "work" && !marked && !skipped) return;
  const li = document.createElement("li");
  let icon = "✅";
  let iconClass = "text-emerald-400";
  let label = interval ? interval.label : "";

  if (customMessage) {
    icon = "⏸️";
    iconClass = "text-yellow-400";
    label = customMessage;
  } else if (marked) {
    icon = "🛑";
    iconClass = "text-blue-400";
  } else if (skipped) {
    icon = "⏭️";
    iconClass = "text-orange-400";
  }

  li.innerHTML = `<span class="${iconClass}">${icon}</span> <span>${label}</span>`;
  if (elapsed !== undefined && !customMessage) {
    li.innerHTML += ` <span class="text-slate-400 text-xs">(Elapsed: ${formatTime(
      Math.floor(elapsed)
    )} | Left: ${formatTime(Math.ceil(remaining))})</span>`;
  }
  if (marked && timeSinceLastMark !== null) {
    li.innerHTML += ` <span class="text-slate-400 text-xs">(+${formatTime(
      Math.floor(timeSinceLastMark)
    )})</span>`;
  }
  if (marked) {
    li.classList.add("marked");
  }
  if (skipped) {
    li.classList.add("skipped");
  }
  if (customMessage) {
    li.classList.add("pause");
  }
  // Prepend new entries at the top (newest first)
  if (els.roundLog.firstChild) {
    els.roundLog.insertBefore(li, els.roundLog.firstChild);
  } else {
    els.roundLog.appendChild(li);
  }
  // Scroll to top to show newest entries
  els.roundLog.scrollTop = 0;
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
// Priority: query params -> hash -> default select
if (!applyQueryParams()) {
  if (location.hash.startsWith("#type=")) {
    const t = location.hash.split("=")[1];
    if (WorkoutTypes[t]) {
      els.workoutType.value = t;
      renderFields(t);
      build();
      showScreen("screenConfig");
    } else {
      showScreen("screenSelect");
    }
  } else {
    showScreen("screenSelect");
  }
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
