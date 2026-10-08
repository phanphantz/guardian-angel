import type { ResourceId } from '../core/resources'

/** Resource colors are the only non-terminal hues in the HUD besides alerts. */
export const RESOURCES: Record<ResourceId, { label: string; code: string; color: string }> = {
  energy: { label: 'Energy', code: 'PWR', color: '#ffd27f' },
  water: { label: 'Water', code: 'H₂O', color: '#7fd4ff' },
  food: { label: 'Food', code: 'NUT', color: '#b6f29a' },
  materials: { label: 'Materials', code: 'MAT', color: '#d0a77c' },
}

const fmtRate = (v: number) => (Math.abs(v) >= 100 ? Math.round(Math.abs(v)).toLocaleString() : Math.abs(v).toFixed(1))

/** "+30.0" / "−1.5" with a real minus sign. */
export const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtRate(v)}`
