/*
 * DOM helpers and the single lookup of every element the app touches.
 * Browser only.
 */
(function (root) {
  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);

  const ELEMENT_IDS = [
    "appRoot",
    "autoRestartToggle",
    "backToSelectBtn",
    "configSummary",
    "copyLinkBtn",
    "dynamicFields",
    "goToTimerBtn",
    "importStatus",
    "importUrlBtn",
    "importUrlInput",
    "intervalLabel",
    "liveRegion",
    "mainTime",
    "markBtn",
    "modalCancel",
    "modalExtra",
    "modalMessage",
    "modalOk",
    "modalRoot",
    "modalTitle",
    "nextInterval",
    "pauseBtn",
    "pinWorkoutBtn",
    "pinnedCountBadge",
    "pinnedEmptyState",
    "pinnedPresets",
    "presetSelect",
    "progressBar",
    "resetBtn",
    "roundCount",
    "roundInfo",
    "roundLog",
    "savePresetBtn",
    "scaleMinusBtn",
    "scalePlusBtn",
    "scaleResetBtn",
    "scaleValue",
    "screenConfig",
    "screenSelect",
    "screenTimer",
    "sequencePreview",
    "skipBtn",
    "soundToggle",
    "startBtn",
    "statusBadges",
    "timerBackBtn",
    "timerCopyBtn",
    "timerRestartBtn",
    "toast",
    "totalDuration",
    "voiceToggle",
    "workoutType",
  ];

  const els = ELEMENT_IDS.reduce((acc, id) => {
    acc[id] = byId(id);
    return acc;
  }, {});

  els.quickPresetBtns = $$("#screenSelect [data-preset]");
  els.typeButtons = $$("#screenSelect button[data-type]");

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function setHTML(el, html) {
    if (el) el.innerHTML = html;
  }

  function toggle(el, className, on) {
    if (el) el.classList.toggle(className, Boolean(on));
  }

  /**
   * Swap one class out of a mutually exclusive group,
   * e.g. setModifier(body, "phase-", ["work","rest"], "work").
   */
  function setModifier(el, prefix, values, active) {
    if (!el) return;
    values.forEach((value) => el.classList.remove(prefix + value));
    if (active) el.classList.add(prefix + active);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  root.WT = root.WT || {};
  root.WT.dom = { $, $$, byId, els, setText, setHTML, toggle, setModifier, escapeHtml };
})(typeof globalThis !== "undefined" ? globalThis : this);
