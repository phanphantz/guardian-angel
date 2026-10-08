/**
 * Resource economy. Every rate is per game hour; the sim integrates per minute.
 */

export const RESOURCE_IDS = ['energy', 'water', 'food', 'materials'] as const
export type ResourceId = (typeof RESOURCE_IDS)[number]

export interface ResourceStore {
  stock: number
  capacity: number
}

export type Resources = Record<ResourceId, ResourceStore>

/** How a consumer's base rate scales with the crew. */
export type FlowScale = 'fixed' | 'perCrew' | 'perCrewMetabolism'

export interface FlowDef {
  id: string
  label: string
  resource: ResourceId
  perHour: number
  scale: FlowScale
  /** Rate is multiplied by `degradedMultiplier` while this resource is empty. */
  degradedWithout?: ResourceId
}

/** A producer or consumer with its current per-hour rate resolved. */
export interface Flow {
  id: string
  label: string
  resource: ResourceId
  kind: 'producer' | 'consumer'
  perHour: number
}

export interface ResourceSummary {
  productionPerHour: number
  usagePerHour: number
  /** Stock that current net usage will burn in the next 24 h. */
  committed24h: number
  free: number
  empty: number
  /** Infinity when production covers usage. */
  hoursLeft: number
}

export function summarize(resource: ResourceId, store: ResourceStore, flows: Flow[]): ResourceSummary {
  let productionPerHour = 0
  let usagePerHour = 0
  for (const f of flows) {
    if (f.resource !== resource) continue
    if (f.kind === 'producer') productionPerHour += f.perHour
    else usagePerHour += f.perHour
  }
  const net = usagePerHour - productionPerHour
  const committed24h = Math.min(store.stock, Math.max(0, net) * 24)
  return {
    productionPerHour,
    usagePerHour,
    committed24h,
    free: store.stock - committed24h,
    empty: store.capacity - store.stock,
    hoursLeft: net > 0 ? store.stock / net : Infinity,
  }
}

/**
 * Advance stocks by `minutes` and return how well each resource's demand was met (0..1).
 * Shortfalls are shared proportionally by every consumer of that resource.
 */
export function applyFlows(resources: Resources, flows: Flow[], minutes: number): Record<ResourceId, number> {
  const satisfaction = {} as Record<ResourceId, number>
  for (const id of RESOURCE_IDS) {
    const store = resources[id]
    const s = summarize(id, store, flows)
    const supply = store.stock + (s.productionPerHour * minutes) / 60
    const demand = (s.usagePerHour * minutes) / 60
    const met = demand > 0 ? Math.min(1, supply / demand) : 1
    satisfaction[id] = met
    store.stock = Math.min(store.capacity, Math.max(0, supply - demand * met))
  }
  return satisfaction
}
