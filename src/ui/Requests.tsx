import { netByResource, unaffordable, type PlanItem, type RequestState } from '../core/requests'
import type { ResourceId } from '../core/resources'
import { formatHours } from '../core/time'
import { SIM_CONFIG, useGameStore } from '../state/gameStore'
import { RESOURCES, signed } from './resourceMeta'

const defOf = (defId: string) => SIM_CONFIG.requests.find((d) => d.id === defId)!

function ResourceCode({ id }: { id: ResourceId }) {
  return (
    <span className="res-code" style={{ color: RESOURCES[id].color }}>
      {RESOURCES[id].code}
    </span>
  )
}

/** Request from one crew member: what the plan costs / yields, approve or decline. */
export function RequestCard({ request, align }: { request: RequestState; align: 'left' | 'right' }) {
  const sim = useGameStore((s) => s.sim)
  const approve = useGameStore((s) => s.approve)
  const decline = useGameStore((s) => s.decline)
  const def = defOf(request.defId)
  const sender = sim.crew.find((c) => c.id === request.crewId)!
  const blocked = unaffordable(def.plan, sim.resources)
  const othersPending = sim.requests.filter((r) => r.status === 'pending').length - 1
  const { plan } = def

  return (
    <div className={`request-card request-card--${align}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Request from ${sender.name}`}>
      <div className="panel__header request-card__header">
        <span>Request · {sender.name}</span>
        <span>Expires {formatHours((request.expiresAt - sim.minute) / 60)}</span>
      </div>
      <div className="request-card__body">
        <p className="request-card__quote">“{def.text}”</p>
        <div className="request-card__plan">
          <span>Plan · {plan.name}</span>
          <span className="muted">{plan.durationHours === null ? 'Ongoing' : `${plan.durationHours}h`}</span>
        </div>
        {plan.items.map((item) => (
          <ItemRow key={item.label} resource={item.resource} label={item.label} value={`${signed(item.perHour)}/h`} positive={item.perHour > 0} />
        ))}
        {plan.oneTime.length > 0 && <div className="request-card__section muted">One-time</div>}
        {plan.oneTime.map((item) => (
          <ItemRow key={item.label} resource={item.resource} label={item.label} value={signed(item.amount)} positive={item.amount > 0} />
        ))}
        {blocked && <div className="negative request-card__blocked">{blocked}</div>}
        <div className="request-card__actions">
          <button className="button" disabled={!!blocked} onClick={() => approve(request.id)}>
            Approve
          </button>
          <button className="button button--decline" onClick={() => decline(request.id)}>
            Decline
          </button>
        </div>
        {othersPending > 0 && <div className="muted">+{othersPending} more pending · click a REQ slot</div>}
      </div>
    </div>
  )
}

function ItemRow({ resource, label, value, positive }: { resource: ResourceId; label: string; value: string; positive: boolean }) {
  return (
    <div className="plan-item">
      <ResourceCode id={resource} />
      <span className="plan-item__label">{label}</span>
      <span className={positive ? 'positive' : 'negative'}>{value}</span>
    </div>
  )
}

function itemsTitle(items: PlanItem[]): string {
  return items.map((i) => `${i.label}: ${signed(i.perHour)}/h ${RESOURCES[i.resource].code}`).join('\n')
}

/** Active plans under the time controls: status, net effect, pause / dispose. */
export function PlansPanel() {
  const plans = useGameStore((s) => s.sim.plans)
  const over = useGameStore((s) => s.sim.over)
  const togglePlan = useGameStore((s) => s.togglePlan)
  const dispose = useGameStore((s) => s.disposePlan)

  return (
    <section className="plans">
      <div className="plans__title">Plans</div>
      {plans.length === 0 && <div className="muted">No active plans</div>}
      {plans.map((plan) => (
        <div key={plan.id} className={`plan${plan.paused ? ' is-paused' : ''}`} title={itemsTitle(plan.items)}>
          <div className="plan__head">
            <span className="plan__name">{plan.name}</span>
            <span className="muted">
              {plan.paused ? 'Paused' : plan.remainingMinutes === null ? 'Ongoing' : `${formatHours(plan.remainingMinutes / 60)} left`}
            </span>
          </div>
          <div className="plan__foot">
            <span className="plan__net">
              {Object.entries(netByResource(plan.items)).map(([res, v]) => (
                <span key={res} className="plan__chip">
                  <span className={v! > 0 ? 'positive' : 'negative'}>{signed(v!)}</span>
                  <ResourceCode id={res as ResourceId} />
                </span>
              ))}
            </span>
            <span className="plan__actions">
              <button className="icon-button" title={plan.paused ? 'Resume' : 'Pause'} disabled={over} onClick={() => togglePlan(plan.id)}>
                {plan.paused ? '▶' : '❚❚'}
              </button>
              <button className="icon-button icon-button--danger" title="Dispose plan" disabled={over} onClick={() => dispose(plan.id)}>
                ✕
              </button>
            </span>
          </div>
        </div>
      ))}
    </section>
  )
}
