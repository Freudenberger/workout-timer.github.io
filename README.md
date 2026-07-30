<div align="center">

# ⏱️ Workout Timer

Lightweight interval workout timer

EMOM • Tabata • HIIT • Custom Multi‑Exercise • Micro • Countdown / Count Up

Pure HTML + vanilla JS.

Just open and train.

</div>

## ✨ Highlights

- Workout types: **EMOM**, **Tabata**, **HIIT**, **Custom (multi‑exercise per round)**, **Micro (tiny repeating interval)**, **Countdown / Count Up (simple timer with optional soft limit)**
- Adaptive form: prep, warmup, work, rest, between‑round, cooldown, exercises/round, micro reps
- Live sequence + total duration preview
- Start • Pause/Resume • Reset • Skip • Auto‑restart
- Sound beeps + optional voice (SpeechSynthesis)
- Preset save/load (localStorage)
- Pin up to 5 favorite workouts for one‑click access on the main screen
- Accessible: ARIA live region, focus rings, high contrast, keyboard shortcuts
- Pure client-side: Tailwind CDN + `styles.css` + small ES5-friendly modules under `src/` (no dependencies / tooling / build step)

## 🚀 Quick Start

1. Clone or download.
2. Open `index.html` in any modern browser (desktop or mobile). That’s it.

GitHub Pages friendly — drop the folder in a repo named `username.github.io` or enable Pages for this project.

## ⚡ Quick Presets

From the main page, you can load ready‑made workouts:

- 5 Tabatas in a row — 5 blocks of Tabata (8 × 20s/10s) with 60s between blocks
- 10‑min EMOM — 10 rounds of 60s work per minute (no rest)
- Micro: 100 Burpees — 100 reps with a 4s interval per rep

These presets simply prefill the configuration and jump you to the timer. You can still tweak values in the Config screen if desired (use Copy URL to share).

### 🔖 Pinned Workouts

On the main (Select) screen there's a "Your Pinned Workouts" section. From the Config screen click the new "Pin" button (next to Copy URL / Save Preset) to store the current configuration for instant access later. You can:

- Keep up to 5 pinned workouts (oldest can be replaced when full)
- Rename a pin when adding (prompt appears)
- Click a pinned card to load and go straight to the timer
- Remove a pin with the ✕ button that appears on hover/focus
- Choose a custom emoji icon for each pin (defaults to a type‑based suggestion)

Pins persist in `localStorage` under the key `workoutTimer.pinned.v1`.

## 🧪 Workout Types

| Type      | Core Idea                                               | Key Fields                                                                 |
| --------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| EMOM      | Work inside each 60s block                              | prep, rounds, work                                                         |
| Tabata    | Classic 20/10 style (configurable)                      | prep, rounds, work, rest                                                   |
| HIIT      | Warmup + repeated work/rest + optional cooldown         | prep, warmup, rounds, work, rest, cooldown                                 |
| Custom    | Multiple exercises per round + between rounds rest      | prep, rounds, exercisesPerRound, exerciseWork, exerciseRest, betweenRounds |
| Micro     | Repeat a tiny fixed interval many times (e.g. 5s × 100) | prep, reps, interval                                                       |
| Countdown | Simple timer with down or up mode                       | prep, mode, total                                                          |

## 🧱 Project Layout

```
index.html          markup + the script list (load order matters)
styles.css
src/core/           pure logic, no DOM — unit tested
  time.js           mm:ss formatting
  intervals.js      interval math (durations, elapsed, effective time)
  fields.js         catalog of editable fields (labels, bounds, kinds)
  workout-types.js  registry: defaults, fields and sequence builders per type
  config.js         merge with defaults, legacy mapping, fingerprints, summary
  share-link.js     config <-> query string, URL parsing
  duration-split.js minutes/seconds arithmetic for duration inputs
  engine.js         TimerEngine (injectable clock)
  presenter.js      view models: round text, progress, log entries, controls
  storage.js        presets + pinned workouts (injectable Web Storage)
  quick-presets.js  ready-made configurations
src/ui/             DOM bindings, no logic
  dom.js feedback.js modal.js screens.js scale.js
  config-form.js timer-view.js pinned-view.js presets-view.js share-view.js
src/app.js          wiring: engine events <-> views
tests/              node:test suites (`npm test`)
```

Everything in `src/core` is a UMD-ish module: it registers itself on `window.WT.*`
in the browser and exports via `module.exports` in node, so the same file runs in
the page and in the tests. No bundler, no `type="module"` — the page still works
straight from `file://`.

## ⏱️ Interval Shape

```js
{
  label: string,
  type: 'prep' | 'work' | 'rest' | 'cooldown',
  duration: number,          // seconds
  variant?: string,          // 'warmup' | 'rest-exercise' | 'rest-between' (styling)
  round?: number,            // 1-based round (or rep)
  exercise?: number,         // 1-based exercise inside the round
  mode?: 'up',               // count-up interval
  softLimit?: number | null, // count-up target; exceeding it is allowed
}
```

## 🔄 Engine Events

`load`, `start`, `interval`, `interval_complete`, `skipped`, `tick`, `pause`, `resume`, `reset`, `finish`

The engine takes its clock via the constructor (`new TimerEngine({ clock })`), which
is how the tests run whole workouts instantly.

## 🎹 Shortcuts

- Space: start / pause / resume
- r: reset (rebuild current config, clear the log)
- s: skip current interval

## 🧪 Tests

```
npm test        # node --test, no dependencies
```

`tests/app-smoke.test.js` boots the real browser bundle against a tiny DOM stub,
so a broken script list in `index.html` or a bad cross-module reference fails the
suite.

## 🛠️ Extend

Add a workout type with one entry in `src/core/workout-types.js`:

```js
ladder: {
  label: "Ladder",
  optionLabel: "Ladder (increasing work)",
  emoji: "🪜",
  fields: ["prep", "rounds", "work"],       // names from src/core/fields.js
  defaults: { prep: 10, rounds: 5, work: 20 },
  build(config) {
    // return { sequence: Interval[], meta: { totalRounds } }
  },
}
```

The type `<select>`, config form, summary, share links, sequence preview and timer
screen all read from that registry. Add a new field to `src/core/fields.js` first if
you need one, add a shortcut card in `index.html` if you want one on the Select
screen, and style phases via `styles.css` (`body.phase-work`, `.seq-*`).

## 🎨 Styling Notes

Phase colors: work (emerald), rest (blue), prep/warmup (amber), cooldown (violet). Progress + dial glow adapt automatically.

## 📦 Persistence

Presets are stored under `localStorage` key `workoutTimer.presets.v1` (simple JSON).
Pinned quick‑access workouts are stored under `workoutTimer.pinned.v1` (array of { name, icon, config }).

## 📄 License

MIT — do anything, attribution appreciated.

---

Train hard. Ship small. Improve fast.

From [Freudenberger](https://github.com/Freudenberger) with ❤️