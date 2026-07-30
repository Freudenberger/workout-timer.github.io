/*
 * TimerEngine: generic sequence runner.
 *
 * Events: load, start, interval, interval_complete, skipped, tick, pause,
 *         resume, reset, finish
 *
 * The clock is injected, so the engine is fully testable without a browser:
 *   new TimerEngine({ clock: { now, schedule, cancel } })
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./intervals.js"));
  } else {
    root.WT = root.WT || {};
    root.WT.engine = factory(root.WT.intervals);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (intervals) {
  const MIN_TICK_SECONDS = 0.05;

  /** Animation-frame clock when available, timeout based otherwise. */
  const systemClock = {
    now: () =>
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now(),
    schedule: (cb) =>
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(cb)
        : setTimeout(() => cb(systemClock.now()), 16),
    cancel: (handle) => {
      if (handle == null) return;
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle);
      else clearTimeout(handle);
    },
  };

  class TimerEngine {
    constructor({ clock = systemClock } = {}) {
      this.clock = clock;
      this.listeners = {};
      this.sequence = [];
      this.position = 0;
      /** Current interval value: counts down, or up for count-up intervals. */
      this.remaining = 0;
      this.state = "idle";
      this.startedAt = null;
      this.lastTick = null;
      this._handle = null;
      this._tick = this._tick.bind(this);
    }

    on(event, cb) {
      if (!this.listeners[event]) this.listeners[event] = new Set();
      this.listeners[event].add(cb);
      return () => this.listeners[event].delete(cb);
    }

    emit(event, payload) {
      const list = this.listeners[event];
      if (!list) return;
      list.forEach((cb) => {
        try {
          cb(payload);
        } catch (error) {
          console.error(error);
        }
      });
    }

    load(sequence) {
      this._stopClock();
      this.sequence = sequence.map((item, index) => ({ ...item, index }));
      this.position = 0;
      this.remaining = intervals.initialValue(this.sequence[0]);
      this.state = "idle";
      this.startedAt = null;
      this.lastTick = null;
      this.emit("load", { sequence: this.sequence });
    }

    start() {
      if (!this.sequence.length) return;
      if (this.state === "running") return;
      this.state = "running";
      this.startedAt = this.clock.now();
      this.lastTick = this.startedAt;
      this.emit("start", this.current());
      this._scheduleTick();
    }

    pause() {
      if (this.state !== "running") return;
      this.state = "paused";
      this._stopClock();
      this.emit("pause", this.current());
    }

    resume() {
      if (this.state !== "paused") return;
      this.state = "running";
      this.lastTick = this.clock.now();
      this.emit("resume", this.current());
      this._scheduleTick();
    }

    reset() {
      this._stopClock();
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
      if (!this.current()) return;
      this.emit("skipped", this.current());
      this._advance();
    }

    current() {
      return this.sequence[this.position];
    }

    next() {
      return this.sequence[this.position + 1];
    }

    totalDuration() {
      return intervals.totalDuration(this.sequence);
    }

    isRunning() {
      return this.state === "running";
    }

    _scheduleTick() {
      this._handle = this.clock.schedule(this._tick);
    }

    _stopClock() {
      this.clock.cancel(this._handle);
      this._handle = null;
    }

    _advance() {
      this.position++;
      if (this.position >= this.sequence.length) {
        this.state = "finished";
        this._stopClock();
        this.emit("finish");
        return;
      }
      this.remaining = intervals.initialValue(this.current());
      this.emit("interval", this.current());
    }

    _tick(now) {
      if (this.state !== "running") return;
      const current = this.current();
      const dt = (now - this.lastTick) / 1000;

      if (dt >= MIN_TICK_SECONDS) {
        this.lastTick = now;
        if (intervals.isCountUp(current)) {
          this.remaining += dt;
        } else {
          this.remaining -= dt;
          if (this.remaining <= 0) {
            this.emit("interval_complete", current);
            this._advance();
          }
        }
        this.emit("tick", {
          remaining: Math.max(0, this.remaining),
          interval: this.current(),
          position: this.position,
        });
      }

      if (this.state === "running") this._scheduleTick();
    }
  }

  /** Deterministic clock for tests: advance(ms) drives scheduled callbacks. */
  function createManualClock(startTime = 0) {
    let time = startTime;
    let pending = null;
    let nextHandle = 1;
    return {
      now: () => time,
      schedule(cb) {
        pending = cb;
        return nextHandle++;
      },
      cancel() {
        pending = null;
      },
      /** Advance in `stepMs` slices, running the scheduled callback each slice. */
      advance(ms, stepMs = 100) {
        let left = ms;
        while (left > 0) {
          const slice = Math.min(stepMs, left);
          time += slice;
          left -= slice;
          const cb = pending;
          pending = null;
          if (cb) cb(time);
        }
      },
      get hasPending() {
        return pending !== null;
      },
    };
  }

  return { TimerEngine, systemClock, createManualClock, MIN_TICK_SECONDS };
});
