import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { CrewState, SimState } from '../core/sim'
import { formatClock } from '../core/time'
import { expression, vitalStatus, vitals, type VitalKey, type VitalStatus, type Vitals } from '../core/vitals'
import { useGameStore, visibleRequest } from '../state/gameStore'
import { Avatar } from './Avatar'
import { EcgTrace, Soundwave, Sparkline } from './Charts'
import { RequestCard } from './Requests'

const VITAL_ROWS: { key: VitalKey; label: string; format: (v: number) => string }[] = [
  { key: 'hr', label: 'HR', format: (v) => `${Math.round(v)} BPM` },
  { key: 'spo2', label: 'SPO₂', format: (v) => `${Math.round(v)}%` },
  { key: 'temp', label: 'TEMP', format: (v) => `${v.toFixed(1)}°C` },
  { key: 'co2', label: 'CO₂', format: (v) => `${Math.round(v).toLocaleString()} PPM` },
]

const TOOLTIP_WIDTH = 288

/** Bottom-of-screen strip of crew slots. */
export function CrewStrip() {
  const sim = useGameStore((s) => s.sim)
  return (
    <section className="crew-strip">
      {sim.crew.map((c, i) => (
        <CrewSlot key={c.id} crew={c} sim={sim} align={i < sim.crew.length / 2 ? 'left' : 'right'} />
      ))}
    </section>
  )
}

/** Worst status across all vitals, so the slot can flag trouble while vitals are hidden. */
function worstStatus(v: Vitals): VitalStatus {
  const statuses = VITAL_ROWS.map((r) => vitalStatus(r.key, v[r.key]))
  return statuses.includes('critical') ? 'critical' : statuses.includes('warning') ? 'warning' : 'normal'
}

function CrewSlot({ crew, sim, align }: { crew: CrewState; sim: SimState; align: 'left' | 'right' }) {
  const speaking = useGameStore((s) => (s.speaking?.crewId === crew.id ? s.speaking.text : null))
  const unread = useGameStore((s) => s.unread[crew.id] ?? 0)
  const open = useGameStore((s) => s.openCrewId === crew.id)
  const toggleCrew = useGameStore((s) => s.toggleCrew)
  const focusRequest = useGameStore((s) => s.focusRequest)
  const shown = useGameStore((s) => visibleRequest(s.sim, s.focusedRequestId))
  const myRequest = sim.requests.find((r) => r.status === 'pending' && r.crewId === crew.id)
  const showCard = shown !== null && shown.crewId === crew.id
  /** Viewport rect of the slot while its vitals tooltip is shown. */
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const v = vitals(crew, sim.cabin)
  const face = expression(crew, v)
  const status = crew.alive ? worstStatus(v) : 'normal'

  return (
    <article
      className={`panel crew-slot crew-slot--${status}${myRequest ? ' has-request' : ''}${speaking ? ' is-speaking' : ''}${crew.alive ? '' : ' is-dead'}${open ? ' is-open' : ''}`}
      onClick={() => (myRequest && !showCard ? focusRequest(myRequest.id) : toggleCrew(crew.id))}
      onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setAnchor(null)}
    >
      <header className="crew-slot__header">
        <Avatar expression={face} hairStyle={crew.hairStyle} size={44} />
        <div className="crew-slot__identity">
          <span className="crew-slot__name">{crew.name}</span>
          <span className="muted">{crew.role}</span>
          <span className="muted crew-slot__location">Loc: {crew.location}</span>
        </div>
      </header>

      <div className="crew-slot__status">
        {crew.alive ? (
          <Soundwave active={speaking !== null} />
        ) : (
          <span className="crew-slot__deceased">Deceased · {formatClock(crew.diedAt!)}</span>
        )}
        <span className="crew-slot__badges">
          {myRequest && <span className="badge badge--request" title="Pending request">REQ</span>}
          {unread > 0 && <span className="badge" title="New messages">MSG {unread}</span>}
        </span>
      </div>

      <div className={`crew-slot__line${speaking ? ' is-speaking' : crew.messages.length ? '' : ' crew-slot__line--idle'}`}>
        {speaking ?? (crew.messages.at(-1) ? `“${crew.messages.at(-1)!.text}”` : '— No transmission —')}
      </div>

      {showCard && <RequestCard request={shown} align={align} />}
      {open && !showCard && <MessageLog crew={crew} />}
      {anchor && !open && !showCard && <VitalsTooltip crew={crew} vitals={v} anchor={anchor} />}
    </article>
  )
}

/** Vitals float above the hovered slot, rendered into <body> so nothing crops them. */
function VitalsTooltip({ crew, vitals: v, anchor }: { crew: CrewState; vitals: Vitals; anchor: DOMRect }) {
  const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - TOOLTIP_WIDTH / 2), window.innerWidth - TOOLTIP_WIDTH - 8)
  return createPortal(
    <div className="vitals-tooltip" role="tooltip" style={{ left, width: TOOLTIP_WIDTH, bottom: window.innerHeight - anchor.top + 6 }}>
      <div className="vitals-tooltip__title">
        <span>Vitals · {crew.name}</span>
        {!crew.alive && <span className="negative">Flatline</span>}
      </div>
      <div className="vitals">
        {VITAL_ROWS.map((row) => (
          <VitalRow key={row.key} row={row} value={v[row.key]} history={crew.history} alive={crew.alive} />
        ))}
      </div>
    </div>,
    document.body,
  )
}

function VitalRow({
  row,
  value,
  history,
  alive,
}: {
  row: (typeof VITAL_ROWS)[number]
  value: number
  history: Vitals[]
  alive: boolean
}) {
  const status = alive ? vitalStatus(row.key, value) : 'critical'
  return (
    <div className={`vital vital--${status}`}>
      <span className="vital__label">{row.label}</span>
      <span className="vital__value">{alive || row.key === 'co2' ? row.format(value) : '—'}</span>
      {row.key === 'hr' ? (
        <EcgTrace hr={value} status={status} />
      ) : (
        <Sparkline values={[...history.map((h) => h[row.key]), value]} status={status} />
      )}
    </div>
  )
}

function MessageLog({ crew }: { crew: CrewState }) {
  const messages = crew.messages.slice(-6).reverse()
  return (
    <div className="message-log" onClick={(e) => e.stopPropagation()}>
      <div className="panel__header">Messages · {crew.name.split(' ')[0]}</div>
      <div className="message-log__list">
        {messages.length === 0 && <span className="muted">No messages yet.</span>}
        {messages.map((m, i) => (
          <div key={i} className="message">
            <span className="message__time">{formatClock(m.minute)}</span>
            <span>{m.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
