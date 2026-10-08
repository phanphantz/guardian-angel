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
  data/      JSON definitions (station modules, ...). Read by both web and Unity.
  state/     Zustand store (Unity: GameManager + events). The only place that calls core/.
  render/    R3F scene: floating origin, starfield, bodies, station. (Unity: MonoBehaviours)
  ui/        React HUD panels + CSS tokens. (Unity: UI Toolkit UXML/USS)
public/models/  .glb models, referenced from data/modules.json via "model"
```

Rules that keep the Unity port cheap:

1. **`core/` stays engine-agnostic.** A test fails if it imports React or three.js.
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
