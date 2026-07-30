/*
 * Persistence: named presets and pinned workouts.
 *
 * The Web Storage object is injected, so stores can be exercised in node with
 * a plain Map-backed stub (see createMemoryStorage).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./config.js"));
  } else {
    root.WT = root.WT || {};
    root.WT.storage = factory(root.WT.config);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (config) {
  const PRESETS_KEY = "workoutTimer.presets.v1";
  const PINNED_KEY = "workoutTimer.pinned.v1";
  const PIN_LIMIT = 5;

  function createMemoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
    };
  }

  function readJSON(storage, key, fallback) {
    try {
      const raw = storage?.getItem(key);
      if (raw == null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function writeJSON(storage, key, value) {
    try {
      storage?.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  // ----- presets -----

  function createPresetStore(storage) {
    return {
      all() {
        const value = readJSON(storage, PRESETS_KEY, {});
        return value && typeof value === "object" && !Array.isArray(value)
          ? value
          : {};
      },
      names() {
        return Object.keys(this.all());
      },
      get(name) {
        return this.all()[name] ?? null;
      },
      save(name, cfg) {
        const next = { ...this.all(), [name]: cfg };
        writeJSON(storage, PRESETS_KEY, next);
        return next;
      },
      remove(name) {
        const next = { ...this.all() };
        delete next[name];
        writeJSON(storage, PRESETS_KEY, next);
        return next;
      },
    };
  }

  // ----- pinned workouts (pure list operations) -----

  function sanitizePins(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item && typeof item === "object" && item.config)
      .slice(0, PIN_LIMIT);
  }

  function findPin(list, fingerprint) {
    return list.find((item) => item.fp === fingerprint) ?? null;
  }

  /**
   * Add or update a pin.
   * Returns { list, action: 'updated' | 'added' | 'full' }.
   * `full` means the limit is reached and replaceOldest was not allowed.
   */
  function upsertPin(list, entry, { replaceOldest = false } = {}) {
    const fp = entry.fp ?? config.fingerprint(entry.config ?? {});
    const pin = { ...entry, fp };
    const existingIndex = list.findIndex((item) => item.fp === fp);

    if (existingIndex !== -1) {
      const next = list.slice();
      next[existingIndex] = { ...next[existingIndex], ...pin };
      return { list: next, action: "updated" };
    }

    if (list.length >= PIN_LIMIT) {
      if (!replaceOldest) return { list, action: "full" };
      return { list: [...list.slice(1), pin], action: "added" };
    }

    return { list: [...list, pin], action: "added" };
  }

  function removePinAt(list, index) {
    if (!Number.isInteger(index) || index < 0 || index >= list.length) {
      return list;
    }
    return list.filter((_, i) => i !== index);
  }

  function createPinnedStore(storage) {
    return {
      all() {
        return sanitizePins(readJSON(storage, PINNED_KEY, []));
      },
      replaceAll(list) {
        const next = sanitizePins(list);
        writeJSON(storage, PINNED_KEY, next);
        return next;
      },
    };
  }

  return {
    PRESETS_KEY,
    PINNED_KEY,
    PIN_LIMIT,
    createMemoryStorage,
    readJSON,
    writeJSON,
    createPresetStore,
    sanitizePins,
    findPin,
    upsertPin,
    removePinAt,
    createPinnedStore,
  };
});
