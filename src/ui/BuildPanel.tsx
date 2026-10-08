import { MODULE_DEFS, STATION_FOCUS, useGame } from '../state/store'

const buildable = [...MODULE_DEFS.values()].filter((d) => d.buildable)

export function BuildPanel() {
  const buildType = useGame((s) => s.buildType)
  const credits = useGame((s) => s.station.credits)
  const atStation = useGame((s) => s.focus === STATION_FOCUS)
  const setBuildType = useGame((s) => s.setBuildType)

  return (
    <section className="panel">
      <div className="panel__header">
        <span>Construct</span>
        {buildType && (
          <button className="list-button" onClick={() => setBuildType(null)}>
            Cancel
          </button>
        )}
      </div>
      <div className="panel__body">
        {!atStation && <span className="muted">Return to the station to build.</span>}
        {buildable.map((def) => (
          <button
            key={def.id}
            className={`list-button${buildType === def.id ? ' is-active' : ''}`}
            disabled={!atStation || credits < def.cost}
            onClick={() => setBuildType(buildType === def.id ? null : def.id)}
            title={def.description}
          >
            <span className="swatch" style={{ background: def.color }} />
            <span className="module-card">
              <span>{def.name}</span>
              <span className="module-card__meta">
                <span className={def.power >= 0 ? 'positive' : 'negative'}>
                  ⚡{def.power >= 0 ? '+' : ''}
                  {def.power}
                </span>
                {def.crew > 0 && <span>👤{def.crew}</span>}
                {def.storage > 0 && <span>▣{def.storage}</span>}
              </span>
            </span>
            <span className="cost">{def.cost}</span>
          </button>
        ))}
        {buildType && <span className="muted">Click a highlighted cell next to the station to place it.</span>}
      </div>
    </section>
  )
}
