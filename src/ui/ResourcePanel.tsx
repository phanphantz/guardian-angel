import { useEffect, useState } from 'react'
import { RESOURCE_IDS, summarize, type Flow, type ResourceId, type ResourceStore, type ResourceSummary } from '../core/resources'
import { computeFlows } from '../core/sim'
import { formatHoursLong, type Speed } from '../core/time'
import { SIM_CONFIG, useGameStore } from '../state/gameStore'

/** Resource colors are the only non-terminal hues in the HUD besides alerts. */
const RESOURCES: Record<ResourceId, { label: string; code: string; color: string }> = {
  energy: { label: 'Energy', code: 'PWR', color: '#ffd27f' },
  water: { label: 'Water', code: 'H₂O', color: '#7fd4ff' },
  food: { label: 'Food', code: 'NUT', color: '#b6f29a' },
  materials: { label: 'Materials', code: 'MAT', color: '#d0a77c' },
}

const fmt = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1))

export function ResourcePanel() {
  const sim = useGameStore((s) => s.sim)
  const forecast = useGameStore((s) => s.forecast)
  const flows = computeFlows(sim, SIM_CONFIG)

  return (
    <section className="panel resource-panel">
      <div className="panel__header">Resources</div>
      <div className="panel__body">
        {RESOURCE_IDS.map((id) => (
          <BudgetGauge key={id} id={id} minute={sim.minute} emptyAt={forecast[id]} store={sim.resources[id]} flows={flows.filter((f) => f.resource === id)} />
        ))}
        <span className="muted">All rates are per game hour.</span>
      </div>
    </section>
  )
}

type Urgency = 'ok' | 'warning' | 'critical' | 'depleted'

/** < 24h amber, < 6h red + pulse, 0 grey. */
function urgency(stock: number, hoursLeft: number): Urgency {
  if (stock <= 0) return 'depleted'
  if (hoursLeft < 6) return 'critical'
  if (hoursLeft < 24) return 'warning'
  return 'ok'
}

const whole = (v: number) => Math.round(v).toLocaleString()
const tenth = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function formatNet(perHour: number): string {
  const abs = Math.abs(perHour)
  const text = abs >= 10 ? Math.round(abs).toString() : abs.toFixed(1)
  return `${perHour > 0 ? '+' : perHour < 0 ? '−' : '±'}${text}/h`
}

/** Floating per-hour breakdown: what consumes this resource and what produces it. */
function FlowBreakdown({ flows, summary }: { flows: Flow[]; summary: ResourceSummary }) {
  const section = (kind: Flow['kind'], title: string, total: number, empty: string) => {
    const items = flows.filter((f) => f.kind === kind && f.perHour > 0).sort((a, b) => b.perHour - a.perHour)
    return (
      <>
        <div className={`usage-tooltip__title usage-tooltip__title--${kind}`}>{title}</div>
        {items.length === 0 && <span className="muted">{empty}</span>}
        {items.map((f) => (
          <div key={f.id} className="usage-tooltip__row">
            <span className="usage-tooltip__label">{f.label}</span>
            <span className="usage-tooltip__track">
              <span className={`usage-tooltip__fill usage-tooltip__fill--${kind}`} style={{ width: `${(f.perHour / (total || 1)) * 100}%` }} />
            </span>
            <span className="usage-tooltip__value">{fmt(f.perHour)}/h</span>
          </div>
        ))}
      </>
    )
  }
  return (
    <div className="usage-tooltip" role="tooltip">
      {section('consumer', `Usage · ${fmt(summary.usagePerHour)}/h`, summary.usagePerHour, 'Nothing is consuming this')}
      <div className="usage-tooltip__divider" />
      {section('producer', `Production · ${fmt(summary.productionPerHour)}/h`, summary.productionPerHour, 'No production')}
    </div>
  )
}

/**
 * Lost stock that lingers after a sudden drop (e.g. a time skip), then shrinks away.
 * Small per-tick drains stay below `threshold` and never leave a ghost.
 */
function useGhost(stock: number, threshold: number): number {
  const [ghost, setGhost] = useState(stock)
  useEffect(() => {
    const id = setTimeout(() => setGhost(stock), ghost - stock > threshold ? 700 : 0)
    return () => clearTimeout(id)
  }, [stock, ghost, threshold])
  return Math.max(0, ghost - stock) > threshold ? ghost - stock : 0
}

/** Drain stripe period in seconds: faster when draining a bigger share of capacity, and at 10×. */
function drainPeriod(usagePerHour: number, capacity: number, speed: Speed): number {
  const percentPerHour = (usagePerHour / capacity) * 100
  const base = Math.min(3, Math.max(0.4, 0.9 / Math.max(percentPerHour, 0.01)))
  return speed === 'fast' ? Math.max(0.15, base / 3) : base
}

/** Only says something when the stock is moving: "Empty in…" while draining, "Full in…" on surplus. */
function Eta({
  level,
  draining,
  filling,
  hoursLeft,
  hoursToFull,
  atCapacity,
}: {
  level: Urgency
  draining: boolean
  filling: boolean
  hoursLeft: number
  hoursToFull: number
  atCapacity: boolean
}) {
  if (level === 'depleted') return <span className="gauge__eta negative">Depleted</span>
  if (draining) {
    return <span className="gauge__eta">Empty in {Number.isFinite(hoursLeft) ? formatHoursLong(hoursLeft) : '7+ days'}</span>
  }
  if (filling) return <span className="gauge__eta gauge__eta--fill">Full in {formatHoursLong(hoursToFull)}</span>
  if (atCapacity) return <span className="gauge__eta gauge__eta--fill">Full</span>
  return null
}

/**
 * Budget: a stock bar (fill vs empty) with a live draining edge, plus an OUT/IN flow
 * meter. Stock and rate are shown separately so neither has to be read off the other.
 */
function BudgetGauge({
  id,
  minute,
  emptyAt,
  store,
  flows,
}: {
  id: ResourceId
  minute: number
  /** Forecast minute of depletion; undefined = lasts beyond the forecast horizon. */
  emptyAt: number | undefined
  store: ResourceStore
  flows: Flow[]
}) {
  const meta = RESOURCES[id]
  const speed = useGameStore((st) => st.speed)
  const s = summarize(id, store, flows)
  const [showUsage, setShowUsage] = useState(false)
  const ghost = useGhost(store.stock, store.capacity * 0.01)
  const hoursLeft = emptyAt === undefined ? Infinity : (emptyAt - minute) / 60
  const level = urgency(store.stock, hoursLeft)
  const net = s.productionPerHour - s.usagePerHour
  const pct = (v: number) => `${(v / store.capacity) * 100}%`
  const draining = store.stock > 0 && s.usagePerHour > s.productionPerHour
  const filling = store.stock < store.capacity && s.productionPerHour > s.usagePerHour
  const flowScale = Math.max(s.usagePerHour, s.productionPerHour, 0.0001)
  const motion = {
    animationDuration: `${drainPeriod(Math.abs(net), store.capacity, speed)}s`,
    animationPlayState: speed === 'paused' ? 'paused' : 'running',
  } as const

  return (
    <div className={`gauge gauge--${level}`}>
      <div className="gauge__header">
        <span className="gauge__title" style={{ color: meta.color }}>
          <span className="gauge__code">{meta.code}</span> {meta.label}
        </span>
        <span className="gauge__value">
          {tenth(store.stock)} / {whole(store.capacity)}
        </span>
      </div>

      <div className={`stock-bar${ghost > 0 ? ' is-dropping' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={store.capacity} aria-valuenow={store.stock} aria-label={`${meta.label} stock`}>
        <div className="stock-bar__fill" style={{ width: pct(store.stock), background: meta.color }} />
        <div className="stock-bar__ghost" style={{ left: pct(store.stock), width: pct(ghost) }} />
        {draining && <div className="stock-bar__drain" style={{ left: pct(store.stock), ...motion }} />}
        {filling && <div className="stock-bar__charge" style={{ left: pct(store.stock), ...motion }} />}
      </div>

      <div className="flow" onMouseEnter={() => setShowUsage(true)} onMouseLeave={() => setShowUsage(false)} onFocus={() => setShowUsage(true)} onBlur={() => setShowUsage(false)} tabIndex={0}>
        <div className="flow__row">
          <span className="flow__label">Out</span>
          <span className="flow__track">
            <span className={`flow__fill flow__fill--out${store.stock > 0 && s.usagePerHour > 0 ? ' is-flowing' : ''}`} style={{ width: `${(s.usagePerHour / flowScale) * 100}%`, ...motion }} />
          </span>
          <span className="flow__value">{fmt(s.usagePerHour)}/h</span>
        </div>
        <div className="flow__row">
          <span className="flow__label">In</span>
          <span className="flow__track">
            <span
              className={`flow__fill flow__fill--in${s.productionPerHour > 0 ? ' is-flowing' : ''}`}
              style={{ width: `${(s.productionPerHour / flowScale) * 100}%`, ...motion }}
            />
          </span>
          <span className="flow__value">{fmt(s.productionPerHour)}/h</span>
        </div>
        {showUsage && <FlowBreakdown flows={flows} summary={s} />}
      </div>

      <div className="gauge__footer">
        {level === 'depleted' && net < 0 ? (
          <span className="negative">Unmet {formatNet(-net).slice(1)}</span>
        ) : (
          <span className={net < 0 ? 'negative' : net > 0 ? 'positive' : 'muted'}>{formatNet(net)} net</span>
        )}
        <Eta level={level} draining={draining} filling={filling} hoursLeft={hoursLeft} hoursToFull={(store.capacity - store.stock) / net} atCapacity={store.stock >= store.capacity && net > 0} />
      </div>
    </div>
  )
}
