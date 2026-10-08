import { useEffect, useState } from 'react'
import { SKIPS, formatClock, type Speed } from '../core/time'
import { useGameStore } from '../state/gameStore'
import { PlansPanel } from './Requests'

const SPEEDS: { id: Speed; label: string; title: string }[] = [
  { id: 'paused', label: 'Hold', title: 'Pause' },
  { id: 'normal', label: '1×', title: 'Normal speed (1 min/s)' },
  { id: 'fast', label: '10×', title: 'Fast forward (10 min/s)' },
]

export function TimeBar() {
  const minute = useGameStore((s) => s.sim.minute)
  const over = useGameStore((s) => s.sim.over)
  const speed = useGameStore((s) => s.speed)
  const setSpeed = useGameStore((s) => s.setSpeed)
  const skip = useGameStore((s) => s.skip)

  return (
    <header className="topbar">
      <span className="clock">{formatClock(minute)}</span>
      <div className="segmented" role="group" aria-label="Time speed">
        {SPEEDS.map((s) => (
          <button key={s.id} title={s.title} className={speed === s.id ? 'is-active' : ''} disabled={over} onClick={() => setSpeed(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Skip time">
        {SKIPS.map((s) => (
          <button key={s.label} title={`Skip ${s.label.slice(1)} (stops early on important events)`} disabled={over} onClick={() => skip(s.minutes)}>
            {s.label}
          </button>
        ))}
      </div>
      <PlansPanel />
    </header>
  )
}

export function Notice() {
  const notice = useGameStore((s) => s.notice)
  const [dismissedId, setDismissedId] = useState<number | null>(null)

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setDismissedId(notice.id), 3500)
    return () => clearTimeout(id)
  }, [notice])

  return notice && notice.id !== dismissedId ? <div className="toast">{notice.text}</div> : null
}
