import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { RESOURCE_IDS, summarize, type Flow, type ResourceId, type ResourceStore } from '../core/resources'
import { computeFlows } from '../core/sim'
import { formatHours, type Speed } from '../core/time'
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
  // The resource whose IN/OUT breakdown is open; the others dim.
  const [focused, setFocused] = useState<ResourceId | null>(null)

  return (
    <section className="panel resource-panel">
      <div className="resource-panel__row">
        {RESOURCE_IDS.map((id) => (
          <BudgetGauge
            key={id}
            id={id}
            minute={sim.minute}
            emptyAt={forecast[id]}
            store={sim.resources[id]}
            flows={flows.filter((f) => f.resource === id)}
            dimmed={focused !== null && focused !== id}
            onFocusChange={(on) => setFocused((current) => (on ? id : current === id ? null : current))}
          />
        ))}
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

/** Warm palette for consumers (OUT), green palette for producers (IN). */
const RATIO_COLORS: Record<Flow['kind'], string[]> = {
  consumer: ['#ff3b30', '#ff7a45', '#ffa43b', '#ffd166', '#c9302c', '#ff9e80'],
  producer: ['#39ff6a', '#b4ff5c', '#1fbf5a', '#7dffc0', '#0f8a3a', '#d8ff9e'],
}

/**
 * Hover breakdown of IN and OUT together, macOS-storage style. Both ratio bars share the
 * flow meter's scale (the larger of the two rates), so their lengths compare directly.
 */
function FlowBreakdown({ flows, scale, anchor, color }: { flows: Flow[]; scale: number; anchor: DOMRect; color: string }) {
  // Rendered into <body> so the panel's scroll area can't crop it; flips above near the bottom.
  const below = anchor.bottom < window.innerHeight * 0.65
  const position = below
    ? { left: anchor.left, width: anchor.width, top: anchor.bottom + 9 }
    : { left: anchor.left, width: anchor.width, bottom: window.innerHeight - anchor.top + 9 }
  return createPortal(
    <div className={`ratio-tooltip ratio-tooltip--${below ? 'below' : 'above'}`} role="tooltip" style={{ ...position, ...({ '--res-color': color } as React.CSSProperties) }}>
      <span className="ratio-tooltip__caret" aria-hidden />
      {(['producer', 'consumer'] as const).map((kind) => {
        const items = flows.filter((f) => f.kind === kind && f.perHour > 0).sort((a, b) => b.perHour - a.perHour)
        const total = items.reduce((sum, f) => sum + f.perHour, 0)
        const colors = RATIO_COLORS[kind]
        return (
          <div key={kind} className={`ratio-section ratio-section--${kind}`}>
            <div className="ratio-tooltip__title">
              <span>{kind === 'consumer' ? 'Usage' : 'Production'}</span>
              <span>{fmt(total)}/h</span>
            </div>
            <div className="ratio-bar">
              {items.map((f, i) => (
                <span key={f.id} className="ratio-bar__segment" style={{ width: `${(f.perHour / scale) * 100}%`, background: colors[i % colors.length] }} />
              ))}
            </div>
            {items.length === 0 && <span className="muted">{kind === 'consumer' ? 'Nothing is consuming this' : 'No production'}</span>}
            {items.map((f, i) => (
              <div key={f.id} className="ratio-legend">
                <span className="ratio-legend__swatch" style={{ background: colors[i % colors.length] }} />
                <span className="ratio-legend__label">{f.label}</span>
                <span className="ratio-legend__value">{fmt(f.perHour)}/h</span>
                <span className="ratio-legend__share">{Math.round((f.perHour / total) * 100)}%</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>,
    document.body,
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

/** Time left while depleting, ∞ on surplus or balance, 0H when out. */
function Runway({ level, draining, hoursLeft }: { level: Urgency; draining: boolean; hoursLeft: number }) {
  const text = level === 'depleted' ? '0h' : draining && Number.isFinite(hoursLeft) ? formatHours(hoursLeft) : draining ? '7d+' : '∞'
  return (
    <span className="runway" title={draining ? 'Time until empty' : 'Not depleting'}>
      {text}
    </span>
  )
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
  dimmed,
  onFocusChange,
}: {
  id: ResourceId
  minute: number
  /** Forecast minute of depletion; undefined = lasts beyond the forecast horizon. */
  emptyAt: number | undefined
  store: ResourceStore
  flows: Flow[]
  dimmed: boolean
  onFocusChange: (focused: boolean) => void
}) {
  const meta = RESOURCES[id]
  const speed = useGameStore((st) => st.speed)
  const s = summarize(id, store, flows)
  /** Viewport rect of the whole gauge while its breakdown is open. */
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const open = (e: { currentTarget: HTMLElement }) => {
    setAnchor(e.currentTarget.getBoundingClientRect())
    onFocusChange(true)
  }
  const close = () => {
    setAnchor(null)
    onFocusChange(false)
  }
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
    <div
      className={`gauge gauge--${level}${dimmed ? ' is-dimmed' : ''}`}
      style={{ '--res-color': meta.color } as React.CSSProperties}
      tabIndex={0}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      <div className="gauge__header">
        <span className="gauge__title">
          <span className="gauge__code">{meta.code}</span> {meta.label}
        </span>
        <span className="gauge__value">
          {tenth(store.stock)} / {whole(store.capacity)}
        </span>
      </div>

      <div className="stock-row">
      <div className={`stock-bar${ghost > 0 ? ' is-dropping' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={store.capacity} aria-valuenow={store.stock} aria-label={`${meta.label} stock`}>
        <div className="stock-bar__fill" style={{ width: pct(store.stock), background: meta.color }} />
        <div className="stock-bar__ghost" style={{ left: pct(store.stock), width: pct(ghost) }} />
        {draining && <div className="stock-bar__drain" style={{ left: pct(store.stock), ...motion }} />}
        {filling && <div className="stock-bar__charge" style={{ left: pct(store.stock), ...motion }} />}
      </div>
      <Runway level={level} draining={draining} hoursLeft={hoursLeft} />
      </div>

      <div className="flow">
        <div className="flow__bars">
          {(
            [
              { kind: 'producer', label: 'In', value: s.productionPerHour, flowing: s.productionPerHour > 0 },
              { kind: 'consumer', label: 'Out', value: s.usagePerHour, flowing: store.stock > 0 && s.usagePerHour > 0 },
            ] as const
          ).map((row) => (
            <div key={row.kind} className="flow__row" title={row.label}>
              <span className="flow__track">
                <span
                  className={`flow__fill flow__fill--${row.kind === 'consumer' ? 'out' : 'in'}${row.flowing ? ' is-flowing' : ''}`}
                  style={{ width: `${(row.value / flowScale) * 100}%`, ...motion }}
                />
              </span>
            </div>
          ))}
        </div>
        {/* Net replaces the per-row rates; exact OUT / IN rates live in the hover breakdown. */}
        {level === 'depleted' && net < 0 ? (
          <span className="flow__net flow__net--unmet negative" title={`Unmet demand: ${fmt(-net)}/h (stock is empty)`}>
            {formatNet(net)}
          </span>
        ) : (
          <span className={`flow__net ${net < 0 ? 'negative' : net > 0 ? 'positive' : 'muted'}`}>{formatNet(net)}</span>
        )}
        {anchor && <FlowBreakdown flows={flows} scale={flowScale} anchor={anchor} color={meta.color} />}
      </div>

    </div>
  )
}
