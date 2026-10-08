import { CORE_ID, DEMOLISH_REFUND, stationStats } from '../core/station'
import { MODULE_DEFS, useGame } from '../state/store'

export function Inspector() {
  const station = useGame((s) => s.station)
  const selectedId = useGame((s) => s.selectedModuleId)
  const demolish = useGame((s) => s.demolish)
  const stats = stationStats(station, MODULE_DEFS)
  const load = stats.powerProduced ? stats.powerConsumed / stats.powerProduced : 1
  const selected = station.modules.find((m) => m.id === selectedId)
  const def = selected && MODULE_DEFS.get(selected.type)

  return (
    <>
      <section className="panel">
        <div className="panel__header">{station.name}</div>
        <div className="panel__body">
          <div className="row">
            <span className="muted">Power load</span>
            <span className="row__value">
              {stats.powerConsumed} / {stats.powerProduced}
            </span>
          </div>
          <div className="meter">
            <div className={`meter__fill${load > 1 ? ' is-over' : ''}`} style={{ width: `${Math.min(load, 1) * 100}%` }} />
          </div>
          <div className="row">
            <span className="muted">Crew capacity</span>
            <span className="row__value">{stats.crew}</span>
          </div>
          <div className="row">
            <span className="muted">Storage</span>
            <span className="row__value">{stats.storage}</span>
          </div>
          <div className="row">
            <span className="muted">Modules</span>
            <span className="row__value">{stats.moduleCount}</span>
          </div>
        </div>
      </section>

      {selected && def && (
        <section className="panel">
          <div className="panel__header">
            <span>{def.name}</span>
            <span className="muted">{selected.id}</span>
          </div>
          <div className="panel__body">
            <span className="muted">{def.description}</span>
            <div className="row">
              <span className="muted">Power</span>
              <span className={`row__value ${def.power >= 0 ? 'positive' : 'negative'}`}>{def.power}</span>
            </div>
            <div className="row">
              <span className="muted">Grid cell</span>
              <span className="row__value">{selected.cell.join(', ')}</span>
            </div>
            {selected.id !== CORE_ID && (
              <button className="button button--danger" onClick={() => demolish(selected.id)}>
                Demolish (+{Math.floor(def.cost * DEMOLISH_REFUND)})
              </button>
            )}
          </div>
        </section>
      )}
    </>
  )
}
