/*
 * Promise based dialogs sharing the single #modalRoot markup.
 *
 * Each dialog fills #modalExtra with its own controls and resolves with a
 * value built from those controls (or null / false when dismissed).
 */
(function (root) {
  const { els } = root.WT.dom;

  let resolveCurrent = null;

  function isOpen() {
    return Boolean(els.modalRoot) && !els.modalRoot.classList.contains("hidden");
  }

  function close() {
    els.modalRoot?.classList.add("hidden");
    if (els.modalExtra) {
      els.modalExtra.innerHTML = "";
      els.modalExtra.classList.add("hidden");
    }
    resolveCurrent = null;
  }

  /**
   * Open the modal and resolve with `true` (confirm) or `false` (dismiss).
   * `renderExtra(container)` may add controls read by the caller afterwards.
   */
  function open({
    title,
    message = "",
    confirmText = "OK",
    cancelText = "Cancel",
    renderExtra = null,
    focus = "confirm",
  }) {
    if (!els.modalRoot) return Promise.resolve(false);

    els.modalTitle.textContent = title;
    els.modalMessage.textContent = message;
    els.modalOk.textContent = confirmText;
    els.modalCancel.textContent = cancelText;

    if (els.modalExtra) {
      els.modalExtra.innerHTML = "";
      if (renderExtra) {
        renderExtra(els.modalExtra);
        els.modalExtra.classList.remove("hidden");
      } else {
        els.modalExtra.classList.add("hidden");
      }
    }

    els.modalRoot.classList.remove("hidden");
    if (focus === "confirm") els.modalOk.focus();

    return new Promise((resolve) => {
      resolveCurrent = (value) => {
        resolve(value);
        close();
      };
    });
  }

  function settle(value) {
    resolveCurrent?.(value);
  }

  function confirmDialog({
    title = "Confirm",
    message = "",
    confirmText = "OK",
    cancelText = "Cancel",
  } = {}) {
    return open({ title, message, confirmText, cancelText });
  }

  /** Resolves with the trimmed text, or null when cancelled/invalid. */
  function promptDialog({
    title = "Enter Value",
    label = "Value",
    placeholder = "",
    defaultValue = "",
    confirmText = "Save",
    cancelText = "Cancel",
    validate,
  } = {}) {
    let input;
    return open({
      title,
      message: label,
      confirmText,
      cancelText,
      focus: "extra",
      renderExtra: (container) => {
        input = document.createElement("input");
        input.type = "text";
        input.className = "field text-sm";
        input.placeholder = placeholder;
        input.value = defaultValue;
        input.setAttribute("aria-label", label);
        container.appendChild(input);
        setTimeout(() => input.focus(), 40);
      },
    }).then((confirmed) => {
      if (!confirmed) return null;
      const value = input.value.trim();
      if (validate && !validate(value)) return null;
      return value || null;
    });
  }

  const PIN_EMOJIS = [
    "🔥",
    "⚡",
    "⏲️",
    "🎯",
    "🛠️",
    "⏳",
    "⭐",
    "💪",
    "🏃",
    "🚴",
    "😎",
    "🥵",
    "🐷",
    "🤼‍♂️",
    "💀",
    "☠",
    "👽",
  ];

  /** Resolves with { name, emoji } or null. */
  function pinConfigDialog({
    title = "Pin Workout",
    defaultName = "Workout",
    defaultEmoji = "⭐",
    emojis = PIN_EMOJIS,
  } = {}) {
    let input;
    let select;
    return open({
      title,
      message: "Choose emoji and name",
      confirmText: "Pin",
      cancelText: "Cancel",
      focus: "extra",
      renderExtra: (container) => {
        const row = document.createElement("div");
        row.className = "flex items-center gap-3";

        select = document.createElement("select");
        select.className = "field text-sm flex-shrink-0 w-24";
        emojis.forEach((emoji) => {
          const option = document.createElement("option");
          option.value = emoji;
          option.textContent = emoji;
          select.appendChild(option);
        });
        select.value = defaultEmoji;
        select.setAttribute("aria-label", "Emoji");

        input = document.createElement("input");
        input.type = "text";
        input.className = "field text-sm flex-1";
        input.placeholder = defaultName;
        input.value = defaultName;
        input.setAttribute("aria-label", "Workout name");

        row.appendChild(select);
        row.appendChild(input);
        container.appendChild(row);
        setTimeout(() => input.focus(), 40);
      },
    }).then((confirmed) => {
      if (!confirmed) return null;
      return {
        name: input.value.trim() || defaultName,
        emoji: select.value || defaultEmoji,
      };
    });
  }

  function init() {
    els.modalOk?.addEventListener("click", () => settle(true));
    els.modalCancel?.addEventListener("click", () => settle(false));
    els.modalRoot?.addEventListener("click", (event) => {
      if (event.target === els.modalRoot) settle(false);
    });
    window.addEventListener("keydown", (event) => {
      if (!isOpen()) return;
      if (event.key === "Escape") settle(false);
      if (event.key === "Enter") settle(true);
    });
  }

  root.WT.modal = {
    init,
    isOpen,
    confirmDialog,
    promptDialog,
    pinConfigDialog,
    PIN_EMOJIS,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
