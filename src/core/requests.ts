/**
 * Requests and plans. Crew members ask the player to approve a plan; an approved plan
 * adds per-hour items to the resource flows (for a fixed duration or until disposed)
 * and may cost or grant a one-time amount up front.
 */
import type { Flow, ResourceId, Resources } from './resources'

/** Positive = produces, negative = consumes. */
export interface PlanItem {
  label: string
  resource: ResourceId
  perHour: number
}

/** Positive = gained, negative = spent, once on approval. */
export interface OneTimeItem {
  label: string
  resource: ResourceId
  amount: number
}

export interface PlanDef {
  name: string
  /** null = runs until paused or disposed. */
  durationHours: number | null
  items: PlanItem[]
  oneTime: OneTimeItem[]
}

export type RequestTrigger =
  | { type: 'atHour'; hour: number }
  /** Fires when the resource's linear time-left estimate drops below `hours`. */
  | { type: 'hoursLeftBelow'; resource: ResourceId; hours: number }

export interface RequestDef {
  id: string
  /** Crew role that sends it. */
  from: string
  text: string
  trigger: RequestTrigger
  expiresHours: number
  /** Hours after a decline / expiry / plan end before it can be asked again. null = never. */
  repeatAfterHours: number | null
  plan: PlanDef
}

export type RequestStatus = 'pending' | 'approved' | 'declined' | 'expired'

export interface RequestState {
  id: string
  defId: string
  crewId: string
  createdAt: number
  expiresAt: number
  status: RequestStatus
}

export interface PlanState {
  id: string
  defId: string
  name: string
  crewId: string
  items: PlanItem[]
  startedAt: number
  /** null = ongoing. */
  remainingMinutes: number | null
  paused: boolean
}

/** Flows contributed by running (not paused) plans. */
export function planFlows(plans: PlanState[]): Flow[] {
  return plans
    .filter((p) => !p.paused)
    .flatMap((p) =>
      p.items.map((item, i) => ({
        id: `plan:${p.id}:${i}`,
        label: item.label,
        resource: item.resource,
        kind: item.perHour >= 0 ? ('producer' as const) : ('consumer' as const),
        perHour: Math.abs(item.perHour),
      })),
    )
}

/** Why a plan's one-time costs can't be paid right now, or null if they can. */
export function unaffordable(plan: PlanDef, resources: Resources): string | null {
  for (const item of plan.oneTime) {
    if (item.amount < 0 && resources[item.resource].stock < -item.amount) return `Not enough ${item.resource} for ${item.label.toLowerCase()}`
  }
  return null
}

/** Net per-hour effect of a set of plan items, by resource. */
export function netByResource(items: PlanItem[]): Partial<Record<ResourceId, number>> {
  const net: Partial<Record<ResourceId, number>> = {}
  for (const item of items) net[item.resource] = (net[item.resource] ?? 0) + item.perHour
  return net
}
