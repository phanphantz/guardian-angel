import { useEffect, useState } from 'react'
import { RESOURCE_IDS, summarize, type Flow, type ResourceId, type ResourceStore, type ResourceSummary } from '../core/resources'
import { computeFlows } from '../core/sim'
import { formatHours, formatHoursLong, type Speed } from '../core/time'
import { SIM_CONFIG, useGameStore, type ResourceTab } from '../state/gameStore'

/** Resource colors are the only non-terminal hues in the HUD besides alerts. */
const RESOURCES: Record<ResourceId, { label: string; code: string; color: string }> = {
  energy: { label: 'Energy', code: 'PWR', color: '#ffd27f' },
  water: { label: 'Water', code: 'H₂O', color: '#7fd4ff' },
  food: { label: 'Food', code: 'NUT', color: '#b6f29a' },
  materials: { label: 'Materials', code: 'MAT', color: '#d0a77c' },
}

/** Categorical colors for producer / consumer segments, assigned by position. */
const SEGMENT_COLORS = ['#39ff6a', '#22b84a', '#127a2f', '#8dffab', '#1f6b35', '#5cff8a']

const TABS: { id: ResourceTab; label: string }[] = [
  { id: 'production', label: 'Production' },
  { id: 'budget', label: 'Budget' },
]

interface Segment {
  label: string
  value: number
  color: string
}

const fmt = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1))

export function ResourcePanel() {
  const sim = useGameStore((s) => s.sim)
  const tab = useGameStore((s) => s.resourceTab)
  const setTab = useGameStore((s) => s.setResourceTab)
  const forecast = useGameStore((s) => s.forecast)
  const flows = computeFlows(sim, SIM_CONFIG)

  return (
    <section className="panel resource-panel">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel__body">
        {RESOURCE_IDS.map((id) =>
          tab === 'budget' ? (
            <BudgetGauge key={id} id={id} minute={sim.minute} emptyAt={forecast[id]} store={sim.resources[id]} flows={flows.filter((f) => f.resource === id)} />
          ) : (
            <ProductionGauge key={id} id={id} store={sim.resources[id]} flows={flows.filter((f) => f.resource === id)} />
          ),
        )}
        <span className="muted">All rates are per game hour.</span>
      </div>
    </section>
  )
}

/** Production: per-hour output split by source, scaled against usage. */
function ProductionGauge({ id, store, flows }: { id: ResourceId; store: ResourceStore; flows: Flow[] }) {
  const meta = RESOURCES[id]
  const s = summarize(id, store, flows)
  const scale = Math.max(s.productionPerHour, s.usagePerHour, 0.0001)
  const segments: Segment[] = flows
    .filter((f) => f.kind === 'producer' && f.perHour > 0)
    .map((f, i) => ({ label: f.label, value: f.perHour, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }))

  return (
    <div className="gauge">
      <div className="gauge__header">
        <span className="gauge__title" style={{ color: meta.color }}>
          <span className="gauge__code">{meta.code}</span> {meta.label}
        </span>
        <span className="gauge__value">{fmt(s.productionPerHour)}/h</span>
      </div>
      <div className="gauge__bar">
        {segments.map((seg) => (
          <div key={seg.label} className="gauge__segment" title={`${seg.label}: ${fmt(seg.value)}/h`} style={{ width: `${(seg.value / scale) * 100}%`, background: seg.color }} />
        ))}
      </div>
      <div className="gauge__legend">
        {segments.length === 0 && <span className="muted">No production</span>}
        {segments.map((seg) => (
          <span key={seg.label} className="legend-item">
            <span className="swatch" style={{ background: seg.color }} />
            {seg.label} <span className="legend-item__value">{fmt(seg.value)}</span>
          </span>
        ))}
        <span className="legend-item legend-item--end muted">Usage {fmt(s.usagePerHour)}/h</span>
      </div>
    </div>
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

/** Floating breakdown of per-hour usage by consumer, shown below the bar. */
function UsageBreakdown({ flows, summary }: { flows: Flow[]; summary: ResourceSummary }) {
  const consumers = flows.filter((f) => f.kind === 'consumer' && f.perHour > 0).sort((a, b) => b.perHour - a.perHour)
  const total = summary.usagePerHour || 1
  return (
    <div className="usage-tooltip" role="tooltip">
      <div className="usage-tooltip__title">Usage per hour</div>
      {consumers.length === 0 && <span className="muted">Nothing is consuming this</span>}
      {consumers.map((f) => (
        <div key={f.id} className="usage-tooltip__row">
          <span className="usage-tooltip__label">{f.label}</span>
          <span className="usage-tooltip__track">
            <span className="usage-tooltip__fill" style={{ width: `${(f.perHour / total) * 100}%` }} />
          </span>
          <span className="usage-tooltip__value">{fmt(f.perHour)}/h</span>
        </div>
      ))}
      <div className="usage-tooltip__row usage-tooltip__total">
        <span className="usage-tooltip__label">Total</span>
        <span className="usage-tooltip__value">{fmt(summary.usagePerHour)}/h</span>
      </div>
      {summary.productionPerHour > 0 && (
        <div className="usage-tooltip__row muted">
          <span className="usage-tooltip__label">Offset by production</span>
          <span className="usage-tooltip__value">−{fmt(summary.productionPerHour)}/h</span>
        </div>
      )}
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
  const flowScale = Math.max(s.usagePerHour, s.productionPerHour, 0.0001)
  const motion = {
    animationDuration: `${drainPeriod(s.usagePerHour, store.capacity, speed)}s`,
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
          <span className="gauge__runway">{level === 'depleted' ? 'Depleted' : formatHours(hoursLeft)}</span>
        </span>
      </div>

      <div className={`stock-bar${ghost > 0 ? ' is-dropping' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={store.capacity} aria-valuenow={store.stock} aria-label={`${meta.label} stock`}>
        <div className="stock-bar__fill" style={{ width: pct(store.stock), background: meta.color }} />
        <div className="stock-bar__ghost" style={{ left: pct(store.stock), width: pct(ghost) }} />
        {draining && <div className="stock-bar__drain" style={{ left: pct(store.stock), ...motion }} />}
      </div>

      <div className="flow" onMouseEnter={() => setShowUsage(true)} onMouseLeave={() => setShowUsage(false)} onFocus={() => setShowUsage(true)} onBlur={() => setShowUsage(false)} tabIndex={0}>
        <div className="flow__row">
          <span className="flow__label">Out</span>
          <span className="flow__track">
            <span className={`flow__fill flow__fill--out${draining ? ' is-flowing' : ''}`} style={{ width: `${(s.usagePerHour / flowScale) * 100}%`, ...motion }} />
          </span>
          <span className="flow__value">{fmt(s.usagePerHour)}/h</span>
        </div>
        <div className="flow__row">
          <span className="flow__label">In</span>
          <span className="flow__track">
            <span className="flow__fill flow__fill--in" style={{ width: `${(s.productionPerHour / flowScale) * 100}%` }} />
          </span>
          <span className="flow__value">{fmt(s.productionPerHour)}/h</span>
        </div>
        {showUsage && <UsageBreakdown flows={flows} summary={s} />}
      </div>

      <div className="gauge__footer">
        {level === 'depleted' && net < 0 ? (
          <span className="negative">Unmet {formatNet(-net).slice(1)}</span>
        ) : (
          <span className={net < 0 ? 'negative' : net > 0 ? 'positive' : 'muted'}>{formatNet(net)} net</span>
        )}
        <span className="gauge__eta">
          {level === 'depleted' ? 'Out of stock' : emptyAt !== undefined ? `Empty in ${formatHoursLong(hoursLeft)}` : 'Lasts 7+ days'}
        </span>
      </div>
    </div>
  )
}
