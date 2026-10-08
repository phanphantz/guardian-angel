import { STATION_FOCUS, useGame } from '../state/store'

export function Navigator() {
  const system = useGame((s) => s.system)
  const station = useGame((s) => s.station)
  const focus = useGame((s) => s.focus)
  const setFocus = useGame((s) => s.setFocus)

  const targets = [
    { id: STATION_FOCUS, name: station.name, color: 'var(--ga-color-accent)' },
    ...system.bodies.map((b) => ({ id: b.id, name: b.name, color: b.color })),
  ]

  return (
    <section className="panel">
      <div className="panel__header">Navigation</div>
      <div className="panel__body">
        {targets.map((t) => (
          <button
            key={t.id}
            className={`list-button${focus === t.id ? ' is-active' : ''}`}
            onClick={() => setFocus(t.id)}
          >
            <span className="swatch" style={{ background: t.color }} />
            <span className="module-card">{t.name}</span>
            {t.id === system.homeId && <span className="muted">home</span>}
          </button>
        ))}
      </div>
    </section>
  )
}
