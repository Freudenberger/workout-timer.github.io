<div align="center">

# ⏱️ Workout Timer

Lightweight interval workout timer

EMOM • Tabata • HIIT • Custom Multi‑Exercise • Micro

Pure HTML + vanilla JS.

Just open and train.

</div>

## ✨ Highlights

- Workout types: **EMOM**, **Tabata**, **HIIT**, **Custom (multi‑exercise per round)**, **Micro (tiny repeating interval)**
- Adaptive form: prep, warmup, work, rest, between‑round, cooldown, exercises/round, micro reps
- Live sequence + total duration preview
- Start • Pause/Resume • Reset • Skip • Auto‑restart
- Sound beeps + optional voice (SpeechSynthesis)
- Preset save/load (localStorage)
- Accessible: ARIA live region, focus rings, high contrast, keyboard shortcuts
- Pure client-side: Tailwind CDN + small `styles.css` + `timer.js` (no dependencies / tooling)

## 🚀 Quick Start

1. Clone or download.
2. Open `index.html` in any modern browser (desktop or mobile). That’s it.

GitHub Pages friendly — drop the folder in a repo named `username.github.io` or enable Pages for this project.

## 🧪 Workout Types

| Type   | Core Idea                                               | Key Fields                                                                 |
| ------ | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| EMOM   | Work inside each 60s block                              | prep, rounds, work                                                         |
| Tabata | Classic 20/10 style (configurable)                      | prep, rounds, work, rest                                                   |
| HIIT   | Warmup + repeated work/rest + optional cooldown         | prep, warmup, rounds, work, rest, cooldown                                 |
| Custom | Multiple exercises per round + between rounds rest      | prep, rounds, exercisesPerRound, exerciseWork, exerciseRest, betweenRounds |
| Micro  | Repeat a tiny fixed interval many times (e.g. 5s × 100) | prep, reps, interval                                                       |

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

## 📄 License

MIT — do anything, attribution appreciated.

---

Train hard. Ship small. Improve fast.
