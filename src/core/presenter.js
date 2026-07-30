/*
 * Presenter: turns engine/interval state into plain view models.
 *
 * Nothing here touches the DOM — the view modules only copy these values into
 * elements. That keeps every display rule (round text, progress, log entries,
 * button states, audio cues) unit testable.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./intervals.js"), require("./time.js"));
  } else {
    root.WT = root.WT || {};
    root.WT.presenter = factory(root.WT.intervals, root.WT.time);
  }
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function (intervals, time) {
    const { formatTime } = time;
    const PHASE_TYPES = ["work", "rest", "prep", "cooldown"];

    /** CSS suffix for an interval: its variant when set, otherwise its type. */
    function variantOf(interval) {
      return interval?.variant || interval?.type || "";
    }

    function sequencePreviewItems(sequence, currentIndex = 0) {
      return sequence.map((item, index) => ({
        label: item.label,
        timeText: formatTime(intervals.nominalDuration(item)),
        variant: variantOf(item),
        current: index === currentIndex,
      }));
    }

    function roundLabelFor(meta = {}) {
      return meta.roundLabel || "Round";
    }

    /** "Round 3 / 8 • Exercise 2 / 3", "Count Up • Soft Limit 10:00", ... */
    function roundSummary(interval, meta = {}) {
      if (intervals.isCountUp(interval)) {
        const limit = intervals.nominalDuration(interval);
        return Number.isFinite(limit)
          ? `Count Up • Soft Limit ${formatTime(limit)}`
          : "Count Up • No Limit";
      }

      const label = roundLabelFor(meta);
      const totalRounds = meta.totalRounds;
      const round = interval?.round;
      const parts = [];

      if (round != null) {
        parts.push(
          totalRounds != null
            ? `${label} ${round} / ${totalRounds}`
            : `${label} ${round}`,
        );
      } else if (totalRounds != null) {
        parts.push(`${label} 0 / ${totalRounds}`);
      }

      if (interval?.exercise != null) {
        parts.push(
          meta.exercisesPerRound != null
            ? `Exercise ${interval.exercise} / ${meta.exercisesPerRound}`
            : `Exercise ${interval.exercise}`,
        );
      }

      return parts.join(" • ");
    }

    /** Appends the effective elapsed/left tail to a round summary. */
    function roundInfoText(base, { elapsed = 0, left = 0 } = {}) {
      const tail = `Elapsed ${formatTime(Math.max(0, Math.floor(elapsed)))} • Left ${formatTime(
        Math.max(0, Math.ceil(left)),
      )}`;
      return base ? `${base} • ${tail}` : tail;
    }

    function nextIntervalText(nextInterval) {
      if (!nextInterval) return "";
      return `Next: ${nextInterval.label} (${formatTime(
        intervals.nominalDuration(nextInterval),
      )})`;
    }

    /** View model for entering an interval (start / interval events). */
    function intervalView(interval, { sequence = [], meta = {}, value } = {}) {
      const countUp = intervals.isCountUp(interval);
      const currentValue = countUp
        ? (value ?? 0)
        : intervals.nominalDuration(interval);
      return {
        label: interval?.label ?? "",
        mainTime: formatTime(currentValue),
        roundInfo: roundSummary(interval, meta),
        nextText: countUp
          ? ""
          : nextIntervalText(sequence[(interval?.index ?? -1) + 1]),
        phase: interval?.type ?? null,
        variant: variantOf(interval),
        softLimitExceeded: intervals.exceedsSoftLimit(interval, currentValue),
      };
    }

    /** View model for the idle "Ready" state right after building a sequence. */
    function readyView(sequence, meta = {}) {
      const first = sequence[0];
      const effective = intervals.computeEffectiveTime(
        sequence,
        0,
        intervals.initialValue(first),
      );
      return {
        label: "Ready",
        mainTime: formatTime(intervals.initialValue(first)),
        roundInfo: roundInfoText(roundSummary(first, meta), {
          elapsed: 0,
          left: effective.total,
        }),
        nextText: nextIntervalText(sequence[1]),
        totalDurationText: formatTime(intervals.totalDuration(sequence)),
        roundCountText: String(meta.totalRounds ?? "?"),
      };
    }

    /** Percentage of the current interval that is behind us (0 when open ended). */
    function progressPercent(interval, value) {
      const total = intervals.nominalDuration(interval);
      if (!Number.isFinite(total) || total <= 0) return 0;
      const elapsed = intervals.elapsedIn(interval, value);
      return Math.min(100, (elapsed / total) * 100);
    }

    /** View model emitted on every engine tick. */
    function tickView({ interval, value, sequence, meta, position }) {
      const effective = intervals.computeEffectiveTime(
        sequence,
        position,
        value,
      );
      return {
        mainTime: formatTime(Math.ceil(value)),
        percent: progressPercent(interval, value),
        roundInfo: roundInfoText(roundSummary(interval, meta), effective),
        softLimitExceeded: intervals.exceedsSoftLimit(interval, value),
        effective,
      };
    }

    /** Beep frequency for the final seconds of an interval, or null. */
    function finalCountdownFrequency(secondsLeft) {
      if (!Number.isFinite(secondsLeft) || secondsLeft > 3 || secondsLeft <= 0) {
        return null;
      }
      return secondsLeft === 1 ? 880 : 520;
    }

    function controlState(state) {
      const running = state === "running";
      const paused = state === "paused";
      const finished = state === "finished";
      return {
        start: { disabled: running || paused },
        pause: {
          disabled: !(running || paused),
          label: paused ? "Resume" : "Pause",
        },
        reset: { disabled: state === "idle" },
        mark: { disabled: !(running || paused) },
        skip: { disabled: !(running || paused) },
        finished,
      };
    }

    function shouldLog(interval, { marked, skipped, customMessage } = {}) {
      if (customMessage) return true;
      if (marked || skipped) return true;
      if (!interval) return false;
      return interval.type === "work" || interval.type === "prep";
    }

    /** View model for one round-log entry. */
    function logEntryView(
      interval,
      {
        elapsed,
        remaining,
        marked = false,
        skipped = false,
        customMessage = null,
        timeSinceLastMark = null,
      } = {},
    ) {
      let icon = "✅";
      let iconClass = "text-emerald-400";
      let label = interval ? interval.label : "";
      const classes = [];

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
      } else if (interval && interval.type === "prep") {
        icon = "⏰";
        iconClass = "text-blue-400";
      }

      if (marked) classes.push("marked");
      if (skipped) classes.push("skipped");
      if (customMessage) classes.push("pause");

      const details = [];
      if (elapsed !== undefined && !customMessage) {
        details.push(
          `(Elapsed: ${formatTime(Math.floor(elapsed))} | Left: ${formatTime(
            Math.ceil(remaining),
          )})`,
        );
      }
      if (marked && timeSinceLastMark !== null) {
        details.push(`(+${formatTime(Math.floor(timeSinceLastMark))})`);
      }

      return { icon, iconClass, label, details, classes };
    }

    return {
      PHASE_TYPES,
      variantOf,
      sequencePreviewItems,
      roundLabelFor,
      roundSummary,
      roundInfoText,
      nextIntervalText,
      intervalView,
      readyView,
      progressPercent,
      tickView,
      finalCountdownFrequency,
      controlState,
      shouldLog,
      logEntryView,
    };
  },
);
