/**
 * Vital signs are derived, never stored: cabin environment + the crew member's hidden condition.
 */

export interface Cabin {
  /** % oxygen in cabin air */
  o2: number
  /** ppm */
  co2: number
  /** °C */
  temp: number
}

export interface Condition {
  alive: boolean
  /** 0..100, hidden. 0 = dead. */
  health: number
  /** 0..100 */
  hydration: number
  /** 0..100 */
  satiety: number
  /** °C */
  coreTemp: number
  baseHr: number
}

export interface Vitals {
  hr: number
  spo2: number
  temp: number
  co2: number
}

export type VitalKey = keyof Vitals
export type VitalStatus = 'normal' | 'warning' | 'critical'
export type Expression = 'calm' | 'worried' | 'distressed' | 'unconscious' | 'dead'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function bloodOxygen(cabin: Cabin, health: number): number {
  return clamp(97 - Math.max(0, 20 - cabin.o2) * 5 - Math.max(0, 30 - health) * 0.3, 30, 99)
}

export function vitals(c: Condition, cabin: Cabin): Vitals {
  if (!c.alive) return { hr: 0, spo2: 0, temp: c.coreTemp, co2: cabin.co2 }
  const stressed = c.baseHr + (100 - c.health) * 0.7 + Math.max(0, 70 - c.hydration) * 0.3
  // Below 25 health the heart gives out: rate falls towards zero.
  const hr = c.health > 25 ? stressed : (c.baseHr + 52) * (c.health / 25)
  return { hr, spo2: bloodOxygen(cabin, c.health), temp: c.coreTemp, co2: cabin.co2 }
}

const THRESHOLDS: Record<VitalKey, (v: number) => VitalStatus> = {
  hr: (v) => (v < 40 || v > 140 ? 'critical' : v < 50 || v > 110 ? 'warning' : 'normal'),
  spo2: (v) => (v < 88 ? 'critical' : v < 94 ? 'warning' : 'normal'),
  temp: (v) => (v < 35 || v > 39 ? 'critical' : v < 36 || v > 38 ? 'warning' : 'normal'),
  co2: (v) => (v >= 5000 ? 'critical' : v >= 2000 ? 'warning' : 'normal'),
}

export const vitalStatus = (key: VitalKey, value: number): VitalStatus => THRESHOLDS[key](value)

export function expression(c: Condition, v: Vitals): Expression {
  if (!c.alive) return 'dead'
  if (c.health < 15) return 'unconscious'
  if (c.health < 45) return 'distressed'
  const anyAbnormal = (Object.keys(v) as VitalKey[]).some((k) => vitalStatus(k, v[k]) !== 'normal')
  if (c.health < 75 || anyAbnormal) return 'worried'
  return 'calm'
}
