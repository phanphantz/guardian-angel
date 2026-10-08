/** Game time is an integer count of minutes since Day 1 00:00. */

export type Speed = 'paused' | 'normal' | 'fast'

/** Game minutes per real second. */
export const SPEED_RATE: Record<Speed, number> = { paused: 0, normal: 1, fast: 10 }

export const MINUTES_PER_HOUR = 60
export const MINUTES_PER_DAY = 1440

export const SKIPS = [
  { label: '+1h', minutes: 60 },
  { label: '+6h', minutes: 360 },
  { label: '+1d', minutes: 1440 },
] as const

const pad = (n: number) => String(n).padStart(2, '0')

export function formatClock(minute: number): string {
  const day = Math.floor(minute / MINUTES_PER_DAY) + 1
  const h = Math.floor((minute % MINUTES_PER_DAY) / 60)
  return `Day ${day} · ${pad(h)}:${pad(minute % 60)}`
}

export function formatDuration(minutes: number): string {
  const d = Math.floor(minutes / MINUTES_PER_DAY)
  const h = Math.floor((minutes % MINUTES_PER_DAY) / 60)
  const m = Math.floor(minutes % 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return '∞'
  if (hours >= 48) return `${(hours / 24).toFixed(1)}d`
  return `${hours.toFixed(hours < 10 ? 1 : 0)}h`
}

/** "5.8 hours", "21 hours", "2.6 days". */
export function formatHoursLong(hours: number): string {
  if (hours >= 48) return `${(hours / 24).toFixed(1)} days`
  const value = hours < 10 ? hours.toFixed(1) : Math.round(hours).toString()
  return `${value} ${value === '1' || value === '1.0' ? 'hour' : 'hours'}`
}
