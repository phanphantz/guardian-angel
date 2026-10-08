import type { Vector3 } from 'three'
import { vec3, type Vec3 } from '../core/units'

/**
 * Floating origin.
 *
 * The universe spans ~1e13 m but GPUs work in float32 (~7 significant digits).
 * Every frame, SimDriver picks the focused object as the origin and every
 * renderable sets its position to (worldPos - origin), computed in float64 on the CPU.
 * Unity needs the same trick (float32 transforms): keep this pattern when porting.
 */
export const frame = {
  origin: vec3(),
  /** float64 world positions keyed by body id, plus 'station'. */
  positions: new Map<string, Vec3>(),
}

export function toLocal(worldId: string, out: Vector3): Vector3 {
  const p = frame.positions.get(worldId)
  if (!p) return out.set(0, 0, 0)
  return out.set(p.x - frame.origin.x, p.y - frame.origin.y, p.z - frame.origin.z)
}
