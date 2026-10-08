/**
 * Survival scenario simulation: resources -> cabin environment -> crew condition -> vitals.
 *
 * `tick` advances exactly one game minute. Everything is plain data so the whole
 * state can be cloned, saved, or ported to C# unchanged.
 */
import { RESOURCE_IDS, applyFlows, summarize, type Flow, type FlowDef, type ResourceId, type Resources } from './resources'
import { rngNext } from './rng'
import { bloodOxygen, expression, vitals, type Cabin, type Condition, type Vitals } from './vitals'

// ---------- Config (loaded from src/data/*.json) ----------

export interface ScenarioConfig {
  id: string
  name: string
  location: string
  startHour: number
  stockVariance: number
  resources: Resources
  producers: FlowDef[]
  consumers: FlowDef[]
  degradedMultiplier: number
  cabin: Cabin & {
    o2DropPerCrewHour: number
    co2RisePerCrewHour: number
    coldTemp: number
    coolingRate: number
    recoveryRate: number
  }
  crew: {
    traitVariance: number
    hydrationLossPerHour: number
    satietyLossPerHour: number
    recoveryPerHour: number
    healthRegenPerHour: number
  }
  damage: {
    hypoxiaPerSpo2Below90: number
    co2PerThousandPpmAbove5000: number
    coldPerDegreeBelow35: number
    dehydrationPerPointBelow50: number
    starvationPerPointBelow30: number
  }
  idleChatterHours: [number, number]
  historyIntervalMinutes: number
  historyLength: number
}

export interface CrewDef {
  id: string
  name: string
  role: string
  color: string
  skin: string
  hair: string
  hairStyle: number
  baseHr: number
}

export interface DialogueConfig {
  speakers: Partial<Record<ResourceId, string>>
  lines: Record<string, Record<string, string[]>>
}

export interface SimConfig {
  scenario: ScenarioConfig
  crew: CrewDef[]
  dialogue: DialogueConfig
}

// ---------- State ----------

export interface Message {
  minute: number
  text: string
}

export interface CrewState extends CrewDef, Condition {
  location: string
  /** Multiplies health damage taken; < 1 is tougher. */
  frailty: number
  metabolism: number
  diedAt: number | null
  messages: Message[]
  /** Vital samples, oldest first, every `historyIntervalMinutes`. */
  history: Vitals[]
}

export interface SimState {
  seed: number
  rng: number
  minute: number
  startMinute: number
  resources: Resources
  cabin: Cabin
  crew: CrewState[]
  /** One-shot triggers that already fired, e.g. "cold:mira". */
  fired: Record<string, true>
  /** Producers / consumers currently switched off, by flow id. */
  disabledFlows: Record<string, true>
  nextIdleMinute: number
  over: boolean
}

export type SimEvent =
  | { type: 'say'; minute: number; crewId: string; text: string }
  | { type: 'depleted'; minute: number; resource: ResourceId }
  | { type: 'critical'; minute: number; crewId: string }
  | { type: 'death'; minute: number; crewId: string }
  | { type: 'gameOver'; minute: number }

// ---------- Setup ----------

function random(state: SimState): number {
  const [value, next] = rngNext(state.rng)
  state.rng = next
  return value
}

const vary = (state: SimState, amount: number) => 1 + (random(state) * 2 - 1) * amount

export function createSim(config: SimConfig, seed: number): SimState {
  const { scenario } = config
  const state: SimState = {
    seed,
    rng: seed >>> 0,
    minute: scenario.startHour * 60,
    startMinute: scenario.startHour * 60,
    resources: {} as Resources,
    cabin: { o2: scenario.cabin.o2, co2: scenario.cabin.co2, temp: scenario.cabin.temp },
    crew: [],
    fired: {},
    disabledFlows: Object.fromEntries(
      [...scenario.producers, ...scenario.consumers].filter((f) => f.enabled === false).map((f) => [f.id, true as const]),
    ),
    nextIdleMinute: 0,
    over: false,
  }
  for (const id of RESOURCE_IDS) {
    const r = scenario.resources[id]
    state.resources[id] = { capacity: r.capacity, stock: Math.min(r.capacity, Math.round(r.stock * vary(state, scenario.stockVariance))) }
  }
  state.crew = config.crew.map((def) => ({
    ...def,
    location: scenario.location,
    alive: true,
    health: 100,
    hydration: 100,
    satiety: 100,
    coreTemp: 36.9,
    frailty: vary(state, scenario.crew.traitVariance),
    metabolism: vary(state, scenario.crew.traitVariance),
    diedAt: null,
    messages: [],
    history: [],
  }))
  state.nextIdleMinute = state.minute + 30
  for (const c of state.crew) c.history.push(vitals(c, state.cabin))
  return state
}

// ---------- Flows ----------

export function computeFlows(state: SimState, config: SimConfig): Flow[] {
  const { scenario } = config
  const alive = state.crew.filter((c) => c.alive)
  const resolve = (def: FlowDef, kind: Flow['kind']): Flow => {
    let perHour = def.perHour
    if (def.scale === 'perCrew') perHour *= alive.length
    if (def.scale === 'perCrewMetabolism') perHour *= alive.reduce((sum, c) => sum + c.metabolism, 0)
    if (def.degradedWithout && state.resources[def.degradedWithout].stock <= 0) perHour *= scenario.degradedMultiplier
    return { id: def.id, label: def.label, resource: def.resource, kind, perHour }
  }
  return [
    ...scenario.producers.filter((p) => !state.disabledFlows[p.id]).map((p) => resolve(p, 'producer')),
    ...scenario.consumers.filter((c) => !state.disabledFlows[c.id]).map((c) => resolve(c, 'consumer')),
  ]
}

/** Switch producers / consumers on or off. Returns a new state. */
export function setFlowsEnabled(state: SimState, ids: string[], enabled: boolean): SimState {
  const disabledFlows = { ...state.disabledFlows }
  for (const id of ids) {
    if (enabled) delete disabledFlows[id]
    else disabledFlows[id] = true
  }
  return { ...state, disabledFlows }
}

// ---------- Tick ----------

const approach = (value: number, target: number, ratePerHour: number) => value + (target - value) * Math.min(1, ratePerHour / 60)

export function tick(state: SimState, config: SimConfig): SimEvent[] {
  if (state.over) return []
  const { scenario } = config
  const events: SimEvent[] = []
  const flows = computeFlows(state, config)
  const hoursLeftBefore = Object.fromEntries(
    RESOURCE_IDS.map((id) => [id, summarize(id, state.resources[id], flows).hoursLeft]),
  ) as Record<ResourceId, number>
  const met = applyFlows(state.resources, flows, 1)
  state.minute += 1

  // Resources running low / out.
  for (const id of RESOURCE_IDS) {
    if (hoursLeftBefore[id] < 12 && once(state, `low:${id}`)) {
      speakAbout(state, config, id, 'resourceLow', events)
    }
    if (state.resources[id].stock <= 0 && once(state, `out:${id}`)) {
      events.push({ type: 'depleted', minute: state.minute, resource: id })
      speakAbout(state, config, id, id === 'materials' ? 'materialsOut' : 'resourceOut', events)
    }
  }

  // Cabin: powered life support pulls air and temperature back to nominal; unpowered it drifts.
  const alive = state.crew.filter((c) => c.alive)
  const c = scenario.cabin
  const lifeSupport = met.energy
  const cabin = state.cabin
  cabin.o2 = Math.max(0, approach(cabin.o2, c.o2, c.recoveryRate * lifeSupport) - ((1 - lifeSupport) * c.o2DropPerCrewHour * alive.length) / 60)
  cabin.co2 = approach(cabin.co2, c.co2, c.recoveryRate * lifeSupport) + ((1 - lifeSupport) * c.co2RisePerCrewHour * alive.length) / 60
  cabin.temp = approach(cabin.temp, lifeSupport > 0 ? c.temp : c.coldTemp, lifeSupport > 0 ? c.recoveryRate * 0.5 * lifeSupport : c.coolingRate)

  // Crew condition.
  const k = scenario.crew
  for (const member of alive) {
    member.hydration = clamp100(member.hydration + (met.water * k.recoveryPerHour - (1 - met.water) * k.hydrationLossPerHour * member.metabolism) / 60)
    member.satiety = clamp100(member.satiety + (met.food * k.recoveryPerHour - (1 - met.food) * k.satietyLossPerHour * member.metabolism) / 60)
    const coreTarget = 37 - Math.max(0, 12 - cabin.temp) * 0.25
    member.coreTemp = approach(member.coreTemp, coreTarget, 0.5)

    const spo2 = bloodOxygen(cabin, member.health)
    const d = scenario.damage
    const damagePerHour =
      Math.max(0, 90 - spo2) * d.hypoxiaPerSpo2Below90 +
      (Math.max(0, cabin.co2 - 5000) / 1000) * d.co2PerThousandPpmAbove5000 +
      Math.max(0, 35 - member.coreTemp) * d.coldPerDegreeBelow35 +
      Math.max(0, 50 - member.hydration) * d.dehydrationPerPointBelow50 +
      Math.max(0, 30 - member.satiety) * d.starvationPerPointBelow30
    member.health = damagePerHour > 0
      ? member.health - (damagePerHour * member.frailty) / 60
      : Math.min(100, member.health + k.healthRegenPerHour / 60)

    // Traits shift symptom thresholds so the crew doesn't complain in unison.
    const tolerance = member.frailty - 1
    const appetite = member.metabolism - 1
    if (member.coreTemp < 36.2 + tolerance && once(state, `cold:${member.id}`)) say(state, config, member, 'cold', {}, events)
    if (spo2 < 90 + tolerance * 15 && once(state, `breathless:${member.id}`)) say(state, config, member, 'breathless', {}, events)
    if (member.hydration < 70 + appetite * 40 && once(state, `thirsty:${member.id}`)) say(state, config, member, 'thirsty', {}, events)
    if (member.satiety < 80 + appetite * 40 && once(state, `hungry:${member.id}`)) say(state, config, member, 'hungry', {}, events)
    if (member.health < 40 && once(state, `critical:${member.id}`)) {
      events.push({ type: 'critical', minute: state.minute, crewId: member.id })
      say(state, config, member, 'fading', {}, events)
    }
    if (member.health <= 0) {
      member.health = 0
      member.alive = false
      member.diedAt = state.minute
      events.push({ type: 'death', minute: state.minute, crewId: member.id })
      const witness = pickAlive(state)
      if (witness) say(state, config, witness, 'crewDied', { name: member.name.split(' ')[0] }, events)
    }
  }

  // Idle chatter while things are still fine.
  if (state.minute >= state.nextIdleMinute) {
    const [min, max] = scenario.idleChatterHours
    state.nextIdleMinute = state.minute + Math.round((min + random(state) * (max - min)) * 60)
    const speaker = pickAlive(state)
    if (speaker && expression(speaker, vitals(speaker, cabin)) === 'calm') say(state, config, speaker, 'idle', {}, events)
  }

  if ((state.minute - state.startMinute) % scenario.historyIntervalMinutes === 0) {
    for (const member of state.crew) {
      member.history.push(vitals(member, cabin))
      if (member.history.length > scenario.historyLength) member.history.shift()
    }
  }

  if (state.crew.every((m) => !m.alive)) {
    state.over = true
    events.push({ type: 'gameOver', minute: state.minute })
  }
  return events
}

export interface AdvanceResult {
  state: SimState
  events: SimEvent[]
  /** Set when `stopOnEvents` cut the advance short. */
  stoppedBy?: Exclude<SimEvent, { type: 'say' }>
}

/** Advance up to `minutes` on a copy of `state`. Skips use `stopOnEvents` so nothing important happens off-screen. */
export function advance(state: SimState, config: SimConfig, minutes: number, stopOnEvents = false): AdvanceResult {
  const next = structuredClone(state)
  const events: SimEvent[] = []
  for (let i = 0; i < minutes && !next.over; i++) {
    const tickEvents = tick(next, config)
    events.push(...tickEvents)
    const important = tickEvents.find((e): e is NonNullable<AdvanceResult['stoppedBy']> => e.type !== 'say')
    if (stopOnEvents && important) return { state: next, events, stoppedBy: important }
  }
  return { state: next, events }
}

export type Forecast = Partial<Record<ResourceId, number>>

/**
 * Minute at which each resource will hit zero, by running a copy of the sim forward.
 * Unlike a linear "stock / rate" estimate this accounts for knock-on effects
 * (degraded life support, crew deaths). Resources that last past the horizon are omitted.
 */
export function forecastDepletion(state: SimState, config: SimConfig, horizonMinutes = 7 * 1440): Forecast {
  const sim = structuredClone(state)
  const forecast: Forecast = {}
  for (const id of RESOURCE_IDS) if (sim.resources[id].stock <= 0) forecast[id] = sim.minute
  for (let i = 0; i < horizonMinutes && !sim.over && Object.keys(forecast).length < RESOURCE_IDS.length; i++) {
    tick(sim, config)
    for (const id of RESOURCE_IDS) {
      if (forecast[id] === undefined && sim.resources[id].stock <= 0) forecast[id] = sim.minute
    }
  }
  return forecast
}

// ---------- Helpers ----------

const clamp100 = (v: number) => Math.min(100, Math.max(0, v))

function once(state: SimState, key: string): boolean {
  if (state.fired[key]) return false
  state.fired[key] = true
  return true
}

function pickAlive(state: SimState): CrewState | undefined {
  const alive = state.crew.filter((c) => c.alive)
  return alive.length ? alive[Math.floor(random(state) * alive.length)] : undefined
}

const RESOURCE_NAMES: Record<ResourceId, string> = { energy: 'energy', water: 'water', food: 'food', materials: 'materials' }

function speakAbout(state: SimState, config: SimConfig, resource: ResourceId, trigger: string, events: SimEvent[]) {
  const role = config.dialogue.speakers[resource]
  const speaker = state.crew.find((c) => c.alive && c.role === role) ?? pickAlive(state)
  if (speaker) say(state, config, speaker, trigger, { resource: RESOURCE_NAMES[resource] }, events)
}

function say(state: SimState, config: SimConfig, member: CrewState, trigger: string, vars: Record<string, string>, events: SimEvent[]) {
  const table = config.dialogue.lines[trigger]
  const options = table?.[member.role] ?? table?.default
  if (!options?.length) return
  let text = options[Math.floor(random(state) * options.length)]
  for (const [key, value] of Object.entries(vars)) text = text.replaceAll(`{${key}}`, value)
  text = text[0].toUpperCase() + text.slice(1)
  member.messages.push({ minute: state.minute, text })
  if (member.messages.length > 20) member.messages.shift()
  events.push({ type: 'say', minute: state.minute, crewId: member.id, text })
}
