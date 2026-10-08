/**
 * World conventions shared by the web prototype and the future Unity project.
 *
 * - 1 unit = 1 meter, everywhere. Never bake scale factors into data.
 * - Y is up. The web side (three.js / glTF) is right-handed; Unity is left-handed.
 *   Data crossing the boundary goes through `toUnity` (flip Z). glTF importers
 *   (glTFast / UnityGLTF) do the same flip for meshes automatically.
 * - Positions in the simulation are float64 (JS numbers / C# double). Only
 *   origin-relative offsets are handed to the renderer (see render/frame.ts).
 */
export interface Vec3 {
  x: number
  y: number
  z: number
}

export const AU = 1.495978707e11
export const G = 6.674e-11

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const length = (v: Vec3): number => Math.hypot(v.x, v.y, v.z)

/** Right-handed (web) -> left-handed (Unity). The conversion is its own inverse. */
export const toUnity = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: -v.z })

export function formatDistance(m: number): string {
  if (m >= 0.05 * AU) return `${(m / AU).toFixed(2)} AU`
  if (m >= 1e6) return `${(m / 1e3).toLocaleString('en-US', { maximumFractionDigits: 0 })} km`
  if (m >= 1e3) return `${(m / 1e3).toFixed(1)} km`
  return `${m.toFixed(0)} m`
}
