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
- Pure client-side: Tailwind CDN + small `styles.css` + `timer.js` (no dependencies / tooling)

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

## ⏱️ Interval Shape

```js
{ label: string, type: 'work' | 'rest' | 'prep' | 'cooldown', duration: number }
```

## 🔄 Engine Events

`load`, `start`, `interval`, `interval_complete`, `tick`, `pause`, `resume`, `finish`

## 🎹 Shortcuts

- Space: start / pause / resume
- r: rebuild current config
- s: skip current interval

## 🛠️ Extend

1. Add a builder in `WorkoutTypes` returning `{ sequence, meta }`.
2. Add defaults in `defaultConfigs`.
3. Map editable fields in `typeFieldMap` (and define in `fieldDefs` if new).
4. (Optional) style via `styles.css` & phase classes (`body.phase-work`, etc.).

## 🎨 Styling Notes

Phase colors: work (emerald), rest (blue), prep/warmup (amber), cooldown (violet). Progress + dial glow adapt automatically.

## 📦 Persistence

Presets are stored under `localStorage` key `workoutTimer.presets.v1` (simple JSON).
Pinned quick‑access workouts are stored under `workoutTimer.pinned.v1` (array of { name, icon, config }).

## 📄 License

MIT — do anything, attribution appreciated.

---

Train hard. Ship small. Improve fast.
