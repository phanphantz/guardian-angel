import { useEffect, useState } from 'react'
import { stationStats } from '../core/station'
import { MODULE_DEFS, TIME_SCALES, simClock, useGame } from '../state/store'

const SCALE_LABELS: Record<number, string> = { 0: '❚❚', 1: '1×', 60: '1m/s', 3600: '1h/s', 86400: '1d/s', 604800: '1w/s' }

function useSimTime(): number {
  const [t, setT] = useState(simClock.t)
  useEffect(() => {
    const id = setInterval(() => setT(simClock.t), 250)
    return () => clearInterval(id)
  }, [])
  return t
}

function formatSimTime(t: number): string {
  const day = Math.floor(t / 86400) + 1
  const h = Math.floor((t % 86400) / 3600)
  const m = Math.floor((t % 3600) / 60)
  return `Day ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function TopBar() {
  const system = useGame((s) => s.system)
  const station = useGame((s) => s.station)
  const timeScale = useGame((s) => s.timeScale)
  const setTimeScale = useGame((s) => s.setTimeScale)
  const t = useSimTime()
  const stats = stationStats(station, MODULE_DEFS)
  const net = stats.powerProduced - stats.powerConsumed

  return (
    <header className="panel topbar">
      <div className="brand">
        <span className="brand__title">GUARDIAN ANGEL</span>
        <span className="muted">{system.name} · prototype</span>
      </div>
      <div className="topbar__spacer" />
      <div className="stat stat--optional">
        <span className="muted">Sim time</span>
        <span className="stat__value">{formatSimTime(t)}</span>
      </div>
      <div className="segmented" role="group" aria-label="Time scale">
        {TIME_SCALES.map((scale) => (
          <button key={scale} className={scale === timeScale ? 'is-active' : ''} onClick={() => setTimeScale(scale)}>
            {SCALE_LABELS[scale]}
          </button>
        ))}
      </div>
      <div className="stat">
        <span className="muted">Power</span>
        <span className={`stat__value ${net >= 0 ? 'positive' : 'negative'}`}>
          {net >= 0 ? '+' : ''}
          {net}
        </span>
      </div>
      <div className="stat">
        <span className="muted">Credits</span>
        <span className="stat__value cost">{station.credits.toLocaleString()}</span>
      </div>
    </header>
  )
}
