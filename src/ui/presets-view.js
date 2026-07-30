/*
 * Named presets: the <select> on the Config screen plus "Save Preset".
 */
(function (root) {
  const { els, escapeHtml } = root.WT.dom;
  const { storage } = root.WT;
  const { announce } = root.WT.feedback;
  const { promptDialog } = root.WT.modal;

  function create({ onLoad = () => {}, getCurrentConfig = () => null } = {}) {
    const store = storage.createPresetStore(window.localStorage);

    function render() {
      if (!els.presetSelect) return;
      els.presetSelect.innerHTML =
        '<option value="">Presets...</option>' +
        store
          .names()
          .map(
            (name) =>
              `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`,
          )
          .join("");
    }

    async function saveCurrent() {
      const cfg = getCurrentConfig();
      if (!cfg) return;
      const name = await promptDialog({
        title: "Save Preset",
        label: "Preset Name",
        placeholder: "e.g. Morning HIIT",
        confirmText: "Save",
        validate: (value) => value.length > 0,
      });
      if (!name) return;
      store.save(name, cfg);
      render();
      announce("Preset saved");
    }

    function init() {
      els.savePresetBtn?.addEventListener("click", saveCurrent);
      els.presetSelect?.addEventListener("change", (event) => {
        const name = event.target.value;
        if (!name) return;
        const cfg = store.get(name);
        if (cfg) onLoad(cfg);
      });
      render();
    }

    return { init, render, saveCurrent };
  }

  root.WT.presetsView = { create };
})(typeof globalThis !== "undefined" ? globalThis : this);
