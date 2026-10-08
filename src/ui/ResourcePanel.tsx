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
  { id: 'usage', label: 'Usage' },
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
            <RateGauge key={id} id={id} tab={tab} store={sim.resources[id]} flows={flows.filter((f) => f.resource === id)} />
          ),
        )}
        <span className="muted">All rates are per game hour.</span>
      </div>
    </section>
  )
}

/** Production / Usage: per-hour rates split by source or consumer. */
function RateGauge({ id, tab, store, flows }: { id: ResourceId; tab: 'production' | 'usage'; store: ResourceStore; flows: Flow[] }) {
  const meta = RESOURCES[id]
  const summary = summarize(id, store, flows)
  const { segments, total, value, detail, emptyText } = rateModel(tab, flows, summary)

  return (
    <div className="gauge">
      <div className="gauge__header">
        <span className="gauge__title">
          {meta.icon} {meta.label}
        </span>
        <span className="gauge__value">{value}</span>
      </div>
      <div className="gauge__bar">
        {segments.map((s) =>
          s.value > 0 ? (
            <div key={s.label} className="gauge__segment" title={`${s.label}: ${fmt(s.value)}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
          ) : null,
        )}
      </div>
      <div className="gauge__legend">
        {segments.length === 0 && <span className="muted">{emptyText}</span>}
        {segments.map((s) => (
          <span key={s.label} className="legend-item">
            <span className="swatch" style={{ background: s.color }} />
            {s.label} <span className="legend-item__value">{fmt(s.value)}</span>
          </span>
        ))}
        {tab === 'usage' && store.stock <= 0 && summary.usagePerHour > summary.productionPerHour && (
          <span className="legend-item legend-item--end negative">Unmet: supply empty</span>
        )}
        {detail && <span className="legend-item legend-item--end muted">{detail}</span>}
      </div>
    </div>
  )
}

function rateModel(tab: 'production' | 'usage', flows: Flow[], s: ResourceSummary) {
  const scale = Math.max(s.productionPerHour, s.usagePerHour, 0.0001)
  const bySegment = (kind: Flow['kind']): Segment[] =>
    flows
      .filter((f) => f.kind === kind && f.perHour > 0)
      .map((f, i) => ({ label: f.label, value: f.perHour, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }))

  return tab === 'production'
    ? {
        segments: bySegment('producer'),
        total: scale,
        value: `${fmt(s.productionPerHour)}/h`,
        detail: `Usage ${fmt(s.usagePerHour)}/h`,
        emptyText: 'No production',
      }
    : {
        segments: bySegment('consumer'),
        total: scale,
        value: `${fmt(s.usagePerHour)}/h`,
        detail: s.productionPerHour > 0 ? `Production ${fmt(s.productionPerHour)}/h` : '',
        emptyText: 'Nothing is consuming this',
      }
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

/** Budget: stock out of capacity, split into what the next 24h will burn, the rest, and free space. */
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
  const hoursLeft = emptyAt === undefined ? Infinity : (emptyAt - minute) / 60
  const level = urgency(store.stock, hoursLeft)
  const net = s.productionPerHour - s.usagePerHour
  const segments: Segment[] = [
    { label: '24h use', value: s.committed24h, color: meta.color },
    { label: 'Free', value: s.free, color: `${meta.color}66` },
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
              className={`gauge__segment${seg.label === '24h use' ? ' gauge__segment--use' : ''}`}
              title={`${seg.label}: ${whole(seg.value)}`}
              style={{ width: `${(seg.value / store.capacity) * 100}%`, background: seg.color }}
            />
          ) : null,
        )}
      </div>
      <div className="gauge__legend gauge__legend--single">
        {segments.map((seg) => (
          <span key={seg.label} className="legend-item">
            <span className="swatch" style={{ background: seg.color }} />
            {seg.label} <span className="legend-item__value">{whole(seg.value)}</span>
          </span>
        ))}
      </div>
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
