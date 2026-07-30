/*
 * Interval math.
 *
 * An interval is a plain object:
 *   {
 *     label: string,
 *     type: 'prep' | 'work' | 'rest' | 'cooldown',
 *     duration: number,              // seconds
 *     variant?: string,              // e.g. 'warmup', 'rest-exercise', 'rest-between'
 *     round?: number,                // 1-based round (or rep) this interval belongs to
 *     exercise?: number,             // 1-based exercise inside the round
 *     mode?: 'up',                   // count-up interval (duration is informational)
 *     softLimit?: number | null,     // count-up target; exceeding it is allowed
 *     index?: number,                // assigned by the engine on load
 *   }
 *
 * Pure: no DOM, no globals.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.WT = root.WT || {};
    root.WT.intervals = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const NOTHING_EXCLUDED = new Set();
  const EFFECTIVE_EXCLUDED = new Set(["prep", "cooldown"]);

  function isCountUp(interval) {
    return interval?.mode === "up";
  }

  /** Duration used for previews, totals and progress. Infinity when open ended. */
  function nominalDuration(interval) {
    if (!interval) return 0;
    if (isCountUp(interval)) {
      return Number.isFinite(interval.softLimit) ? interval.softLimit : Infinity;
    }
    return interval.duration;
  }

  /** Value the engine starts an interval at (0 counting up, duration counting down). */
  function initialValue(interval) {
    if (!interval) return 0;
    return isCountUp(interval) ? 0 : interval.duration;
  }

  function isOpenEnded(interval) {
    return isCountUp(interval) && !Number.isFinite(interval?.softLimit);
  }

  /** How much of `interval` is behind us, given the engine's current value. */
  function elapsedIn(interval, currentValue) {
    if (!interval) return 0;
    const value = Math.max(0, Number(currentValue) || 0);
    if (isCountUp(interval)) return value;
    return Math.max(0, interval.duration - value);
  }

  function exceedsSoftLimit(interval, currentValue) {
    return (
      isCountUp(interval) &&
      Number.isFinite(interval?.softLimit) &&
      Number(currentValue) > interval.softLimit
    );
  }

  function sumDurations(sequence, exclude = NOTHING_EXCLUDED) {
    let total = 0;
    for (const interval of sequence) {
      if (exclude.has(interval.type)) continue;
      const duration = nominalDuration(interval);
      if (!Number.isFinite(duration)) return Infinity;
      total += duration;
    }
    return total;
  }

  function totalDuration(sequence) {
    return sumDurations(sequence);
  }

  function elapsedBefore(sequence, position, exclude = NOTHING_EXCLUDED) {
    let elapsed = 0;
    for (let i = 0; i < position && i < sequence.length; i++) {
      const interval = sequence[i];
      if (exclude.has(interval.type)) continue;
      const duration = nominalDuration(interval);
      if (!Number.isFinite(duration)) return Infinity;
      elapsed += duration;
    }
    return elapsed;
  }

  /** Elapsed / total / left across the whole sequence. */
  function computeTime(sequence, position, currentValue, exclude) {
    const excluded = exclude || NOTHING_EXCLUDED;
    const total = sumDurations(sequence, excluded);
    let elapsed = elapsedBefore(sequence, position, excluded);
    const current = sequence[position];
    if (current && !excluded.has(current.type)) {
      elapsed += elapsedIn(current, currentValue);
    }
    const left = Number.isFinite(total)
      ? Math.max(0, total - elapsed)
      : Infinity;
    return { total, elapsed, left };
  }

  /** Same as computeTime but ignoring prep/cooldown, i.e. "real training time". */
  function computeEffectiveTime(sequence, position, currentValue) {
    return computeTime(sequence, position, currentValue, EFFECTIVE_EXCLUDED);
  }

  return {
    EFFECTIVE_EXCLUDED,
    isCountUp,
    nominalDuration,
    initialValue,
    isOpenEnded,
    elapsedIn,
    exceedsSoftLimit,
    sumDurations,
    totalDuration,
    elapsedBefore,
    computeTime,
    computeEffectiveTime,
  };
});
