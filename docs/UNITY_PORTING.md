# Porting to Unity

Target: **Unity 6 + URP**, UI Toolkit for UI, glTFast for models.

## Mapping

| Web prototype | Unity |
| --- | --- |
| `core/units.ts` `Vec3` (float64) | `double3` (Unity.Mathematics) or a custom `struct Vec3d` |
| `core/rng.ts` mulberry32 | Same algorithm in C# with `uint` math. Same seed gives the same universe |
| `core/universe.ts` | Plain C# static class `UniverseGen` |
| `core/station.ts` | Plain C# `Station` class + `StationRules` static methods |
| `core/*.test.ts` | NUnit EditMode tests (Unity Test Framework); port the same cases |
| `data/modules.json` | Same JSON in `Assets/Data/`, loaded into `ScriptableObject`s by an editor importer |
| `state/store.ts` | `GameState` MonoBehaviour/singleton with C# events (`OnStationChanged`, ...) |
| `render/frame.ts` floating origin | `FloatingOrigin` component: each frame sets `transform.position = (Vector3)(worldPos - origin)` |
| `render/SpaceScene.tsx` camera rig | Cinemachine orbital follow on a target at the origin |
| Logarithmic depth buffer | Camera stacking (far "system" camera + near "local" camera), or scaled-space rendering for distant bodies |
| `render/Starfield.tsx` | Skybox cubemap or a particle shell parented to the camera |
| `render/StationView.tsx` primitives | Prefabs per module type, created from the `.glb` models |
| `render/WorldLabel.tsx` | UI Toolkit element positioned with `RuntimePanelUtils.CameraTransformWorldToPanel` |
| `ui/*.tsx` panels | One UXML per panel (`TopBar.uxml`, `BuildPanel.uxml`, ...) |
| `ui/tokens.css` | `Tokens.uss`: USS supports `--var` / `var()` directly |
| `ui/ui.css` | `Hud.uss`: flexbox rules carry over, rename BEM classes as-is |

## Coordinates

Both sides are Y-up and use meters. three.js is right-handed and Unity is left-handed:
negate Z on any position that crosses the boundary (`toUnity`). glTF importers already
do this for meshes.

## Assets

- Author in Blender. Export **glTF Binary (.glb)**, +Y up, apply transforms, 1 unit = 1 m.
- Keep the module pivot at the cell center and fit the model inside a
  `CELL_SIZE × CELL_SIZE × CELL_SIZE` (12 m) cube, with docking faces on the cube faces.
- Use PBR metallic-roughness materials. They map to URP Lit.
