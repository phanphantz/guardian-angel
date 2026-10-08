import type { CrewState, SimState } from '../core/sim'
import { formatClock } from '../core/time'
import { expression, vitalStatus, vitals, type VitalKey, type Vitals } from '../core/vitals'
import { useGameStore } from '../state/gameStore'
import { Avatar } from './Avatar'
import { EcgTrace, Soundwave, Sparkline } from './Charts'

const VITAL_ROWS: { key: VitalKey; icon: string; label: string; format: (v: number) => string }[] = [
  { key: 'hr', icon: '🫀', label: 'HR', format: (v) => `${Math.round(v)} bpm` },
  { key: 'spo2', icon: '🫁', label: 'O₂', format: (v) => `${Math.round(v)}%` },
  { key: 'temp', icon: '🌡️', label: 'Temp', format: (v) => `${v.toFixed(1)}°C` },
  { key: 'co2', icon: '🧠', label: 'CO₂', format: (v) => `${Math.round(v).toLocaleString()} ppm` },
]

export function CrewGrid() {
  const sim = useGameStore((s) => s.sim)
  return (
    <section className="crew-grid">
      {sim.crew.map((c) => (
        <CrewSlot key={c.id} crew={c} sim={sim} />
      ))}
    </section>
  )
}

function CrewSlot({ crew, sim }: { crew: CrewState; sim: SimState }) {
  const speaking = useGameStore((s) => (s.speaking?.crewId === crew.id ? s.speaking.text : null))
  const unread = useGameStore((s) => s.unread[crew.id] ?? 0)
  const open = useGameStore((s) => s.openCrewId === crew.id)
  const toggleCrew = useGameStore((s) => s.toggleCrew)
  const v = vitals(crew, sim.cabin)
  const face = expression(crew, v)

  return (
    <article
      className={`panel crew-slot${speaking ? ' is-speaking' : ''}${crew.alive ? '' : ' is-dead'}${open ? ' is-open' : ''}`}
      style={{ '--crew-color': crew.color } as React.CSSProperties}
      onClick={() => toggleCrew(crew.id)}
    >
      <header className="crew-slot__header">
        <Avatar expression={face} skin={crew.skin} hair={crew.hair} hairStyle={crew.hairStyle} suit={crew.color} size={56} />
        <div className="crew-slot__identity">
          <span className="crew-slot__name">{crew.name}</span>
          <span className="muted">
            {crew.role} · {crew.location}
          </span>
          {crew.alive ? (
            <Soundwave active={speaking !== null} />
          ) : (
            <span className="crew-slot__deceased">Deceased · {formatClock(crew.diedAt!)}</span>
          )}
        </div>
        {unread > 0 && <span className="badge" title="New messages">{unread}</span>}
      </header>

      <div className={`crew-slot__line${speaking ? ' is-speaking' : ''}`}>
        {speaking ?? (crew.messages.at(-1) ? `“${crew.messages.at(-1)!.text}”` : '')}
      </div>

      <div className="vitals">
        {VITAL_ROWS.map((row) => (
          <VitalRow key={row.key} row={row} value={v[row.key]} history={crew.history} alive={crew.alive} />
        ))}
      </div>

      {open && <MessageLog crew={crew} />}
    </article>
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
      <span className="vital__icon" aria-hidden>
        {row.icon}
      </span>
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
