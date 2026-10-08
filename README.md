# Guardian Angel — Web Prototype

A browser prototype for **Guardian Angel**, a UI-heavy space game set in a vast 3D
universe around a modular space station. The prototype exists to iterate on
gameplay, UI and data quickly. The final game will be built in **Unity**, so the
code is organised to port cleanly.

**Live build:** https://phanphantz.github.io/guardian-angel/ (redeploys on every push to `main`)

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # core simulation tests
npm run build      # production build in dist/
```

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build | **Vite + TypeScript** | Instant reloads, static output that hosts anywhere |
| 3D | **three.js** via **React Three Fiber** + **drei** | Mature WebGL renderer, glTF support, declarative scene |
| UI | **React + plain CSS (flexbox + CSS variables)** | UI-heavy game: real DOM UI iterates fastest. The CSS subset used maps onto Unity UI Toolkit (USS) |
| State | **Zustand** | Tiny store, readable outside React (per-frame code) |
| Assets | **glTF 2.0 (.glb)** | One asset format for web and Unity (via glTFast) |
| Tests | **Vitest** | Tests the engine-agnostic core |
| Hosting | **GitHub Pages** via Actions | Every push to `main` produces a shareable test build |

## Architecture

```
src/
  core/      Pure TypeScript simulation. No React, no three.js. Ports 1:1 to C#.
    sim.ts         Survival scenario: one-minute tick, advance/skip, crew, dialogue
    resources.ts   Energy / Water / Food / Materials, producers & consumers (per hour)
    vitals.ts      HR, SpO₂, core temp, CO₂ derived from cabin + hidden condition
    time.ts        Speeds (pause / 1 min/s / ×10), skips, clock formatting
    station.ts, universe.ts   Station grid + star system (3D backdrop)
  data/      JSON content: scenario.json (all tuning), crew.json, dialogue.json, modules.json
  state/     gameStore.ts (sim + speech queue + restart), sceneStore.ts (3D backdrop)
  render/    R3F backdrop scene: floating origin, starfield, bodies, station
  ui/        HUD: TimeBar, ResourcePanel, CrewSlot, GameOver, Avatar, Charts
public/models/  .glb models, referenced from data/modules.json via "model"
```

## Survival scenario (current build)

Six crew share one living quarter module with a fixed starting stockpile and no production.
Materials run out first (life support then needs more energy), then water, food and
finally energy. Without power, O₂ falls, CO₂ rises and the cabin freezes, and the crew die
one by one, which shows in their vitals and faces. When everyone is dead, a summary
appears and the run restarts with the next seed.

- **Time:** pause, normal (1 game min/s), ×10, and skip +1h / +6h / +1d. Skips stop
  early on depletion, critical condition or death, so nothing happens off-screen.
- **Resources:** one gauge per resource: a stock bar (fill vs empty) with a live red
  draining or green filling edge whose stripe speed follows the net rate, a ghost chunk
  after sudden drops, an OUT/IN per-hour flow meter (hover for the usage and production
  breakdown), net rate, and "Empty in…" / "Full in…". GEN ON/OFF in the top bar switches
  on test generators. All rates are per hour.
- **Crew slot:** name, role, location, a procedural face with 5 expressions, vitals with an
  ECG trace and 24h trends, a speaking waveform with the latest line, and an unread
  badge. Click a slot for its message log.
- **Tuning:** every rate, threshold and damage weight lives in `src/data/scenario.json`.
  `npm test` checks the pacing (order of depletion, staggered deaths).

Rules that keep the Unity port cheap:

1. **`core/` stays engine-agnostic.** A test fails if it imports React or three.js.
   The sim state is plain data with a serializable RNG, so runs are reproducible from a seed.
2. **Game content lives in `data/*.json`**, not in code.
3. **1 unit = 1 meter, Y-up.** Convert handedness only at the boundary (`toUnity` in `core/units.ts`).
4. **Positions are float64 in the sim.** The renderer only ever sees offsets from a
   floating origin (`render/frame.ts`).
5. **UI uses flexbox and CSS variables only.** No CSS grid or pseudo-elements, so panels can be rebuilt in UI Toolkit.

## Rendering a vast universe

- **Floating origin.** The focused object (station, planet or star) is always at
  `(0,0,0)`. Every frame, world positions are computed in float64 and turned into
  float32 offsets on the CPU. Without this, GPU float32 precision breaks down at
  about 1e7 m. Unity has the same limit, so the same pattern applies there.
- **Logarithmic depth buffer.** Lets a 12 m module and a 1e12 m orbit share one depth buffer.
- **Starfield shell** follows the camera, so it can never be reached.
- **HTML world labels** keep sub-pixel planets findable and clickable.

## Modular station

The station is a 3D grid of cells (`CELL_SIZE = 12 m`). A module can be placed in an
empty cell next to an existing one. Removing a module is blocked if it would split
the station, and the Command Core can never be removed. All of this lives in
`core/station.ts` as pure functions over plain data.

To use a real model, export a `.glb` (Blender → glTF Binary, +Y up, meters), drop it in
`public/models/`, and add `"model": "models/<name>.glb"` to the module in
`src/data/modules.json`. Modules without a model render as primitive placeholders.

See [docs/UNITY_PORTING.md](docs/UNITY_PORTING.md) for the file-by-file Unity mapping.
