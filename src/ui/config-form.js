/*
 * The configuration form: renders the fields of the selected workout type,
 * keeps a per-type memory of edited values, and reads values back out.
 *
 * Duration fields are edited through a minutes/seconds pair backed by a hidden
 * seconds input (`#f_<key>`), which stays the single source of truth.
 */
(function (root) {
  const { els, $$, byId, escapeHtml } = root.WT.dom;
  const { fields, workoutTypes, config: configCore, durationSplit } = root.WT;

  function boundsFor(key) {
    const def = fields.getFieldDef(key);
    return {
      min: typeof def?.min === "number" ? def.min : 0,
      max: typeof def?.max === "number" ? def.max : Infinity,
    };
  }

  function stepperButton({ field, part, step, label }) {
    return `<button type="button" class="step-btn" tabindex="-1" data-field="${field}" data-part="${part}" data-step="${step}" aria-label="${escapeHtml(label)}">${
      step < 0 ? "−" : "+"
    }</button>`;
  }

  function numberRow(key, def, value) {
    return `<div class="number-stepper">
        ${stepperButton({ field: key, part: "value", step: -1, label: `Decrease ${def.label}` })}
        <input type="number" inputmode="numeric" pattern="[0-9]*" id="f_${key}" data-key="${key}" min="${def.min}" max="${def.max}" value="${value}" class="field text-base" aria-label="${escapeHtml(def.label)}" />
        ${stepperButton({ field: key, part: "value", step: 1, label: `Increase ${def.label}` })}
      </div>`;
  }

  function splitGroup(key, def, part, value, maxAttr) {
    const unit = part === "min" ? "Minutes" : "Seconds";
    const max = maxAttr == null ? "" : `max="${maxAttr}"`;
    return `<div class="number-stepper">
        ${stepperButton({ field: key, part, step: -1, label: `Decrease ${def.label} ${unit}` })}
        <label class="sr-only" for="f_${key}_${part}">${escapeHtml(def.label)} ${unit}</label>
        <input type="number" inputmode="numeric" pattern="[0-9]*" id="f_${key}_${part}" data-split="${key}" data-part="${part}" min="0" ${max} value="${value}" class="field text-sm w-20" aria-label="${escapeHtml(def.label)} ${unit}" />
        ${stepperButton({ field: key, part, step: 1, label: `Increase ${def.label} ${unit}` })}
      </div>`;
  }

  function durationRow(key, def, seconds) {
    const split = durationSplit.toSplit(seconds);
    const maxMinutes = fields.maxMinutesForKey(key);
    return `<input type="hidden" id="f_${key}" data-key="${key}" value="${seconds}" />
      <div id="f_${key}_split" class="time-split flex items-center gap-2">
        ${splitGroup(key, def, "min", split.minutes, maxMinutes)}
        <span class="text-xs text-slate-400">m</span>
        ${splitGroup(key, def, "sec", split.seconds, 59)}
        <span class="text-xs text-slate-400">s</span>
      </div>`;
  }

  function selectRow(key, def, value) {
    const options = def.options
      .map(
        (option) =>
          `<option value="${option.value}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`,
      )
      .join("");
    const hint = def.hint
      ? `<p class="text-[11px] text-slate-400 leading-snug">${escapeHtml(def.hint)}</p>`
      : "";
    return `<div class="flex flex-col gap-1">
        <select id="f_${key}" data-key="${key}" class="field text-base" aria-label="${escapeHtml(def.label)}">${options}</select>
        ${hint}
      </div>`;
  }

  function fieldRow(key, value) {
    const def = fields.getFieldDef(key);
    if (!def) return "";
    let control;
    if (def.kind === "select") {
      control = selectRow(key, def, value || def.options[0]?.value);
    } else if (fields.isDurationKey(key)) {
      control = durationRow(key, def, Number(value) || 0);
    } else {
      control = numberRow(key, def, value ?? "");
    }
    return `<tr>
        <td class="py-2 pr-4 text-left align-middle">${escapeHtml(def.label)}</td>
        <td class="py-2 align-middle split_controls">${control}</td>
      </tr>`;
  }

  function create({ onChange = () => {} } = {}) {
    /** Last edited config per type, so switching types keeps your values. */
    const memory = {};

    function getType() {
      const selected = els.workoutType?.value;
      return workoutTypes.isSupported(selected)
        ? selected
        : workoutTypes.typeNames[0];
    }

    function remembered(type) {
      if (!memory[type]) {
        memory[type] = configCore.mergeWithDefaults(type, {});
      }
      return memory[type];
    }

    function secondsInput(key) {
      return byId(`f_${key}`);
    }

    function writeSeconds(key, seconds) {
      const clamped = durationSplit.clamp(seconds, boundsFor(key));
      const hidden = secondsInput(key);
      if (hidden) hidden.value = String(clamped);
      const split = durationSplit.toSplit(clamped);
      const minEl = byId(`f_${key}_min`);
      const secEl = byId(`f_${key}_sec`);
      if (minEl) minEl.value = String(split.minutes);
      if (secEl) secEl.value = String(split.seconds);
      return clamped;
    }

    function readSplit(key) {
      return {
        minutes: parseInt(byId(`f_${key}_min`)?.value ?? "0", 10) || 0,
        seconds: parseInt(byId(`f_${key}_sec`)?.value ?? "0", 10) || 0,
      };
    }

    function stepValue(field, part, delta) {
      if (part === "value") {
        const input = secondsInput(field);
        if (!input) return;
        const current = parseInt(input.value, 10) || 0;
        input.value = String(fields.clampForKey(field, current + delta));
        onChange();
        return;
      }
      const split = readSplit(field);
      const next =
        part === "min"
          ? durationSplit.stepMinutes(split, delta, boundsFor(field))
          : durationSplit.stepSeconds(split, delta, boundsFor(field));
      writeSeconds(field, durationSplit.toSeconds(next));
      onChange();
    }

    function attachListeners() {
      // main inputs (hidden seconds, numbers, selects)
      $$("[data-key]", els.dynamicFields).forEach((input) => {
        input.addEventListener("input", () => {
          const key = input.dataset.key;
          if (fields.isDurationKey(key)) {
            writeSeconds(key, parseInt(input.value, 10) || 0);
          }
          onChange();
        });
      });

      // minutes/seconds pairs
      $$("[data-split]", els.dynamicFields).forEach((input) => {
        input.addEventListener("input", () => {
          const key = input.dataset.split;
          writeSeconds(key, durationSplit.toSeconds(readSplit(key)));
          onChange();
        });
      });

      // steppers (hold shift for x5)
      $$(".step-btn", els.dynamicFields).forEach((btn) => {
        const activate = (multiplier) => {
          const step = parseInt(btn.dataset.step, 10) || 0;
          stepValue(btn.dataset.field, btn.dataset.part, step * multiplier);
        };
        btn.addEventListener("click", (event) =>
          activate(event.shiftKey ? 5 : 1),
        );
        btn.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activate(event.shiftKey ? 5 : 1);
          }
        });
      });
    }

    /** Fill the workout type <select> from the registry. */
    function renderTypeOptions() {
      const select = els.workoutType;
      if (!select) return;
      const previous = select.value;
      select.innerHTML = workoutTypes.typeNames
        .map((type) => {
          const def = workoutTypes.getType(type);
          return `<option value="${type}">${escapeHtml(def.optionLabel || def.label)}</option>`;
        })
        .join("");
      if (workoutTypes.isSupported(previous)) select.value = previous;
    }

    function render(type = getType()) {
      const cfg = remembered(type);
      const rows = workoutTypes
        .getFields(type)
        .map((key) => fieldRow(key, cfg[key]))
        .join("");
      els.dynamicFields.innerHTML = `<table class="w-full text-sm font-medium mx-auto">${rows}</table>`;
      attachListeners();
    }

    /** Current values from the form, merged with defaults and normalized. */
    function collect() {
      const type = getType();
      const raw = {};
      $$("[data-key]", els.dynamicFields).forEach((input) => {
        const key = input.dataset.key;
        if (fields.isNumericKey(key)) {
          const value = parseInt(input.value, 10);
          // Typed values bypass the steppers, so clamp them here too.
          if (!Number.isNaN(value)) raw[key] = fields.clampForKey(key, value);
        } else {
          raw[key] = input.value;
        }
      });
      const merged = configCore.mergeWithDefaults(type, raw);
      memory[type] = merged;
      return merged;
    }

    /** Load a config into the form (from a preset, pin, quick preset or URL). */
    function apply(cfg = {}) {
      const type = cfg.type || getType();
      if (!workoutTypes.isSupported(type)) return null;
      const merged = configCore.mergeWithDefaults(type, cfg);
      memory[type] = merged;
      if (els.workoutType) els.workoutType.value = type;
      render(type);
      return merged;
    }

    function setType(type) {
      if (!workoutTypes.isSupported(type)) return false;
      if (els.workoutType) els.workoutType.value = type;
      render(type);
      return true;
    }

    return {
      render,
      renderTypeOptions,
      collect,
      apply,
      getType,
      setType,
      remembered,
    };
  }

  root.WT.configForm = { create, fieldRow };
})(typeof globalThis !== "undefined" ? globalThis : this);
