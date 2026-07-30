/*
 * Timer screen rendering. Every decision comes from WT.presenter; this module
 * only writes the resulting values into the DOM.
 */
(function (root) {
  const { els, $$, setText, setHTML, toggle, setModifier, escapeHtml } = root.WT.dom;
  const { presenter, config: configCore } = root.WT;

  const PHASES = presenter.PHASE_TYPES;

  function setPhase(type) {
    setModifier(document.body, "phase-", PHASES, type);
    setModifier(els.progressBar, "progress-bar-", PHASES, type);
  }

  function setSoftLimitExceeded(exceeded) {
    toggle(document.body, "soft-limit-exceeded", exceeded);
    toggle(els.progressBar, "progress-bar-soft-limit", exceeded);
    toggle(els.mainTime, "soft-limit-exceeded", exceeded);
  }

  function setProgress(percent) {
    if (els.progressBar) els.progressBar.style.width = `${percent}%`;
  }

  function highlightSequenceItem(index) {
    $$("#sequencePreview li.seq-item").forEach((li, i) => {
      li.classList.toggle("current", i === index);
    });
  }

  function renderSequence(sequence, currentIndex = 0) {
    const items = presenter.sequencePreviewItems(sequence, currentIndex);
    setHTML(
      els.sequencePreview,
      items
        .map(
          (item) =>
            `<li class="seq-item seq-${item.variant}${item.current ? " current" : ""}"><span class="seq-dot"></span><span class="seq-label">${escapeHtml(
              item.label,
            )}</span><span class="seq-time">${item.timeText}</span></li>`,
        )
        .join(""),
    );
  }

  function renderBadges(type) {
    setHTML(
      els.statusBadges,
      `<span class="px-2 py-0.5 rounded bg-slate-700/60 text-[10px] uppercase tracking-wide">${escapeHtml(type)}</span>`,
    );
  }

  function renderSummary(cfg) {
    if (!els.configSummary) return;
    const rows = configCore.summaryRows(cfg);
    setHTML(
      els.configSummary,
      `<li><strong>Type:</strong> ${escapeHtml(cfg.type)}</li>` +
        rows
          .map(
            (row) =>
              `<li class="flex justify-between"><span>${escapeHtml(row.label)}</span><span class="tabular-nums">${escapeHtml(row.value)}</span></li>`,
          )
          .join("") +
        `<li class="flex justify-between border-t border-slate-700 mt-2 pt-2"><span>Total Duration</span><span>${escapeHtml(
          els.totalDuration?.textContent ?? "",
        )}</span></li>`,
    );
  }

  /** Idle state right after (re)building a sequence. */
  function renderReady(sequence, meta, cfg) {
    const view = presenter.readyView(sequence, meta);
    setText(els.roundCount, view.roundCountText);
    setText(els.totalDuration, view.totalDurationText);
    setText(els.intervalLabel, view.label);
    setText(els.mainTime, view.mainTime);
    setText(els.roundInfo, view.roundInfo);
    setText(els.nextInterval, view.nextText);
    renderSequence(sequence, 0);
    renderBadges(cfg.type);
    renderSummary(cfg);
    setProgress(0);
    setSoftLimitExceeded(false);
    setPhase(null);
  }

  /** Entering an interval (engine `start` / `interval`). */
  function renderInterval(interval, { sequence, meta, value }) {
    const view = presenter.intervalView(interval, { sequence, meta, value });
    setText(els.intervalLabel, view.label);
    setText(els.mainTime, view.mainTime);
    setText(els.roundInfo, view.roundInfo);
    setText(els.nextInterval, view.nextText);
    setSoftLimitExceeded(view.softLimitExceeded);
    setPhase(view.phase);
    highlightSequenceItem(interval.index);
  }

  /** Engine `tick`. */
  function renderTick({ interval, value, sequence, meta, position }) {
    const view = presenter.tickView({
      interval,
      value,
      sequence,
      meta,
      position,
    });
    setText(els.mainTime, view.mainTime);
    setProgress(view.percent);
    setText(els.roundInfo, view.roundInfo);
    setSoftLimitExceeded(view.softLimitExceeded);
    return view;
  }

  function renderFinished() {
    setText(els.intervalLabel, "Finished");
    setText(els.nextInterval, "");
    setText(els.mainTime, "00:00");
    setProgress(100);
    setSoftLimitExceeded(false);
    setPhase(null);
  }

  /** Back to a clean slate: no progress, no log, no phase colors. */
  function clearRunState() {
    setProgress(0);
    setSoftLimitExceeded(false);
    setPhase(null);
    setHTML(els.roundLog, "");
  }

  function setControls(state) {
    const view = presenter.controlState(state);
    if (els.startBtn) els.startBtn.disabled = view.start.disabled;
    if (els.pauseBtn) {
      els.pauseBtn.disabled = view.pause.disabled;
      els.pauseBtn.textContent = view.pause.label;
    }
    if (els.resetBtn) els.resetBtn.disabled = view.reset.disabled;
    if (els.markBtn) els.markBtn.disabled = view.mark.disabled;
    if (els.skipBtn) els.skipBtn.disabled = view.skip.disabled;
  }

  /** Prepend one entry to the round log (newest first). */
  function logEntry(interval, options = {}) {
    if (!els.roundLog) return;
    if (!presenter.shouldLog(interval, options)) return;
    const view = presenter.logEntryView(interval, options);
    const li = document.createElement("li");
    li.innerHTML =
      `<span class="${view.iconClass}">${view.icon}</span> <span>${escapeHtml(view.label)}</span>` +
      view.details
        .map(
          (detail) =>
            ` <span class="text-slate-400 text-xs">${escapeHtml(detail)}</span>`,
        )
        .join("");
    view.classes.forEach((cls) => li.classList.add(cls));
    els.roundLog.prepend(li);
    els.roundLog.scrollTop = 0;
  }

  root.WT.timerView = {
    renderReady,
    renderInterval,
    renderTick,
    renderFinished,
    renderSequence,
    renderSummary,
    renderBadges,
    clearRunState,
    setControls,
    setPhase,
    setProgress,
    setSoftLimitExceeded,
    highlightSequenceItem,
    logEntry,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
