import { useEffect, useState } from 'react'
import { formatClock, formatDuration } from '../core/time'
import { useGameStore } from '../state/gameStore'

export function GameOver() {
  const sim = useGameStore((s) => s.sim)
  const restartAt = useGameStore((s) => s.restartAt)
  const restart = useGameStore((s) => s.restart)
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (restartAt === null) return
    const id = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(id)
  }, [restartAt])

  if (!sim.over || restartAt === null) return null
  const deaths = [...sim.crew].sort((a, b) => a.diedAt! - b.diedAt!)

  return (
    <div className="overlay">
      <section className="panel game-over">
        <div className="panel__header">Mission failed</div>
        <div className="panel__body">
          <span className="game-over__title">All crew lost</span>
          <span className="muted">
            Survived {formatDuration(sim.minute - sim.startMinute)} · run #{sim.seed}
          </span>
          <div className="game-over__deaths">
            {deaths.map((c) => (
              <div key={c.id} className="row">
                <span>{c.name}</span>
                <span className="row__value muted">{formatClock(c.diedAt!)}</span>
              </div>
            ))}
          </div>
          <button className="button" onClick={restart}>
            Restart now ({Math.max(0, Math.ceil((restartAt - now) / 1000))}s)
          </button>
        </div>
      </section>
    </div>
  )
}
