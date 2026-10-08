import { RESOURCE_IDS, summarize, type Flow, type ResourceId, type ResourceStore, type ResourceSummary } from '../core/resources'
import { computeFlows } from '../core/sim'
import { formatHours } from '../core/time'
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
        {RESOURCE_IDS.map((id) => (
          <ResourceGauge key={id} id={id} tab={tab} store={sim.resources[id]} flows={flows.filter((f) => f.resource === id)} />
        ))}
        <span className="muted">All rates are per game hour.</span>
      </div>
    </section>
  )
}

function ResourceGauge({ id, tab, store, flows }: { id: ResourceId; tab: ResourceTab; store: ResourceStore; flows: Flow[] }) {
  const meta = RESOURCES[id]
  const summary = summarize(id, store, flows)
  const { segments, total, value, detail, emptyText } = gaugeModel(tab, meta.color, store, flows, summary)
  const hoursClass = summary.hoursLeft < 12 ? 'negative' : summary.hoursLeft < 24 ? 'cost' : ''

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
        {tab === 'budget' &&
          (store.stock <= 0 ? (
            <span className="legend-item legend-item--end negative">Depleted</span>
          ) : (
            <span className={`legend-item legend-item--end ${hoursClass}`}>Runs out in {formatHours(summary.hoursLeft)}</span>
          ))}
        {tab === 'usage' && store.stock <= 0 && summary.usagePerHour > summary.productionPerHour && (
          <span className="legend-item legend-item--end negative">Unmet: supply empty</span>
        )}
        {detail && <span className="legend-item legend-item--end muted">{detail}</span>}
      </div>
    </div>
  )
}

function gaugeModel(tab: ResourceTab, color: string, store: ResourceStore, flows: Flow[], s: ResourceSummary) {
  const scale = Math.max(s.productionPerHour, s.usagePerHour, 0.0001)
  const bySegment = (kind: Flow['kind']): Segment[] =>
    flows
      .filter((f) => f.kind === kind && f.perHour > 0)
      .map((f, i) => ({ label: f.label, value: f.perHour, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }))

  switch (tab) {
    case 'production':
      return {
        segments: bySegment('producer'),
        total: scale,
        value: `${fmt(s.productionPerHour)}/h`,
        detail: `Usage ${fmt(s.usagePerHour)}/h`,
        emptyText: 'No production',
      }
    case 'usage':
      return {
        segments: bySegment('consumer'),
        total: scale,
        value: `${fmt(s.usagePerHour)}/h`,
        detail: s.productionPerHour > 0 ? `Production ${fmt(s.productionPerHour)}/h` : '',
        emptyText: 'Nothing is consuming this',
      }
    case 'budget':
      return {
        segments: [
          { label: 'Next 24h', value: s.committed24h, color },
          { label: 'Free', value: s.free, color: `${color}66` },
          { label: 'Empty', value: s.empty, color: 'rgba(255, 255, 255, 0.06)' },
        ],
        total: store.capacity,
        value: `${fmt(store.stock)} / ${fmt(store.capacity)}`,
        detail: '',
        emptyText: '',
      }
  }
}
