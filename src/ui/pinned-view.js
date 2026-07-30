/*
 * Pinned workouts on the Select screen: rendering, pinning and unpinning.
 * List arithmetic lives in WT.storage; this module owns the DOM and dialogs.
 */
(function (root) {
  const { els, escapeHtml } = root.WT.dom;
  const { storage, workoutTypes, intervals, time, config: configCore } = root.WT;
  const { announce } = root.WT.feedback;
  const { confirmDialog, pinConfigDialog } = root.WT.modal;

  function approximateDuration(cfg) {
    const built = workoutTypes.build(cfg.type, cfg);
    if (!built) return "";
    return time.formatTime(intervals.totalDuration(built.sequence));
  }

  function cardMarkup(item, index) {
    const icon = item.icon || "⭐";
    const typeLabel = item.config?.type
      ? item.config.type.toUpperCase()
      : "";
    const approx = approximateDuration(item.config ?? {});
    const meta = [typeLabel, approx].filter(Boolean).join(" • ");
    return `<button type="button" class="card card-select group w-full relative pinned-card" data-pin-index="${index}" title="Load pinned workout: ${escapeHtml(
      item.name,
    )}">
        <div class="flex flex-col gap-1 text-center">
          <span class="text-ml block">${escapeHtml(icon)}${escapeHtml(item.name)}</span>
          <p class="text-[10px] text-slate-400 leading-snug truncate">${escapeHtml(meta)}</p>
        </div>
        <span class="absolute top-1 right-1 inline-flex items-center justify-center text-[10px] bg-slate-900/70 hover:bg-slate-900 text-slate-300 rounded-full w-5 h-5 remove-pin-btn" title="Unpin" aria-label="Remove pinned workout">✕</span>
      </button>`;
  }

  function create({ onLoad = () => {}, getCurrentConfig = () => null } = {}) {
    const store = storage.createPinnedStore(window.localStorage);
    let pins = store.all();

    function render() {
      const container = els.pinnedPresets;
      if (!container) return;
      if (els.pinnedCountBadge) {
        els.pinnedCountBadge.textContent = `${pins.length} / ${storage.PIN_LIMIT}`;
      }
      container.innerHTML = pins.map(cardMarkup).join("");
      els.pinnedEmptyState?.classList.toggle("hidden", pins.length > 0);
    }

    function persist(next) {
      pins = store.replaceAll(next);
      render();
    }

    async function pinCurrent(cfg) {
      const result = await pinConfigDialog({
        defaultName: cfg.type ? cfg.type.toUpperCase() : "Workout",
        defaultEmoji: workoutTypes.getEmoji(cfg.type),
      });
      if (!result) return;

      const entry = {
        name: result.name,
        icon: result.emoji,
        config: cfg,
        fp: configCore.fingerprint(cfg),
        ts: Date.now(),
      };

      let outcome = storage.upsertPin(pins, entry);
      if (outcome.action === "full") {
        const replace = await confirmDialog({
          title: "Pinned Full",
          message: `You already have ${storage.PIN_LIMIT} pinned workouts. Replace the oldest?`,
          confirmText: "Replace",
        });
        if (!replace) return;
        outcome = storage.upsertPin(pins, entry, { replaceOldest: true });
      }

      persist(outcome.list);
      announce(
        outcome.action === "updated"
          ? "Pinned workout updated"
          : "Workout pinned",
      );
    }

    function handleClick(event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const card = target.closest("[data-pin-index]");
      if (!card) return;
      const index = parseInt(card.getAttribute("data-pin-index"), 10);
      if (Number.isNaN(index)) return;

      if (target.classList.contains("remove-pin-btn")) {
        event.stopPropagation();
        persist(storage.removePinAt(pins, index));
        announce("Pinned workout removed");
        return;
      }

      const item = pins[index];
      if (item) onLoad(item.config);
    }

    function init() {
      els.pinnedPresets?.addEventListener("click", handleClick);
      els.pinWorkoutBtn?.addEventListener("click", () => {
        const cfg = getCurrentConfig();
        if (cfg) pinCurrent(cfg);
      });
      render();
    }

    return { init, render, pinCurrent, list: () => pins.slice() };
  }

  root.WT.pinnedView = { create };
})(typeof globalThis !== "undefined" ? globalThis : this);
