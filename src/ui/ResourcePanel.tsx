import { useState } from 'react'
import { RESOURCE_IDS, summarize, type Flow, type ResourceId, type ResourceStore, type ResourceSummary } from '../core/resources'
import { computeFlows } from '../core/sim'
import { formatClock, formatHours } from '../core/time'
import { SIM_CONFIG, useGameStore, type ResourceTab } from '../state/gameStore'

const RESOURCES: Record<ResourceId, { label: string; icon: string; color: string }> = {
  energy: { label: 'Energy', icon: '⚡', color: '#ffd27f' },
  water: { label: 'Water', icon: '💧', color: '#7fd4ff' },
  food: { label: 'Food', icon: '🍲', color: '#7be3a5' },
  materials: { label: 'Materials', icon: '🔩', color: '#d0a77c' },
}

/** Categorical colors for producer / consumer segments, assigned by position. */
const SEGMENT_COLORS = ['#7fd4ff', '#b79cff', '#ff9f7f', '#7be3a5', '#ffd27f', '#ff7a9a']

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
        <span className="gauge__title">
          {meta.icon} {meta.label}
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

function formatNet(perHour: number): string {
  const abs = Math.abs(perHour)
  const text = abs >= 10 ? Math.round(abs).toString() : abs.toFixed(1)
  return `${perHour > 0 ? '+' : perHour < 0 ? '−' : '±'}${text}/h`
}

const USAGE_COLOR = '#ff5c5c'

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

/** Budget: stock out of capacity, split into the next hour of usage, the rest, and free space. */
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
  const s = summarize(id, store, flows)
  const [showUsage, setShowUsage] = useState(false)
  const usageHover = {
    onMouseEnter: () => setShowUsage(true),
    onMouseLeave: () => setShowUsage(false),
    onFocus: () => setShowUsage(true),
    onBlur: () => setShowUsage(false),
  }
  const hoursLeft = emptyAt === undefined ? Infinity : (emptyAt - minute) / 60
  const level = urgency(store.stock, hoursLeft)
  const net = s.productionPerHour - s.usagePerHour
  const segments: Segment[] = [
    { label: 'Usage/h', value: s.nextHourUsage, color: USAGE_COLOR },
    { label: 'Free', value: s.free, color: meta.color },
    { label: 'Empty', value: s.empty, color: 'rgba(255, 255, 255, 0.06)' },
  ]

  return (
    <div className={`gauge gauge--${level}`}>
      <div className="gauge__header">
        <span className="gauge__title">
          {meta.icon} {meta.label}
        </span>
        <span className="gauge__value">
          {whole(store.stock)} / {whole(store.capacity)}
          <span className="gauge__runway">{level === 'depleted' ? 'Depleted' : formatHours(hoursLeft)}</span>
        </span>
      </div>
      <div className="gauge__bar">
        {segments.map((seg) =>
          seg.value > 0 ? (
            <div
              key={seg.label}
              className={`gauge__segment${seg.label === 'Usage/h' ? ' gauge__segment--use' : ''}`}
              title={seg.label === 'Usage/h' ? undefined : `${seg.label}: ${whole(seg.value)}`}
              style={{ width: `${(seg.value / store.capacity) * 100}%`, background: seg.color }}
              {...(seg.label === 'Usage/h' ? usageHover : {})}
            />
          ) : null,
        )}
      </div>
      <div className="gauge__legend gauge__legend--single">
        {segments.map((seg) => (
          <span
            key={seg.label}
            className={`legend-item${seg.label === 'Usage/h' ? ' legend-item--hoverable' : ''}`}
            {...(seg.label === 'Usage/h' ? { ...usageHover, tabIndex: 0 } : {})}
          >
            <span className="swatch" style={{ background: seg.color }} />
            {seg.label} <span className="legend-item__value">{whole(seg.value)}</span>
          </span>
        ))}
      </div>
      {showUsage && <UsageBreakdown flows={flows} summary={s} />}
      <div className="gauge__footer">
        {level === 'depleted' && net < 0 ? (
          <span className="negative">Unmet {formatNet(-net).slice(1)}</span>
        ) : (
          <span className={net < 0 ? 'negative' : net > 0 ? 'positive' : 'muted'}>{formatNet(net)}</span>
        )}
        <span className="gauge__eta">
          {level === 'depleted' ? 'Out of stock' : emptyAt !== undefined ? `Empty at ${formatClock(emptyAt)}` : 'Lasts 7d+'}
        </span>
      </div>
    </div>
  )
}
