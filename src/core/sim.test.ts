import { describe, expect, it } from 'vitest'
import crew from '../data/crew.json'
import dialogue from '../data/dialogue.json'
import requests from '../data/requests.json'
import scenario from '../data/scenario.json'
import { advance, approveRequest, computeFlows, createSim, declineRequest, disposePlan, forecastDepletion, togglePlanPaused, type SimConfig, type SimEvent, type SimState } from './sim'
import { summarize } from './resources'

const config = { scenario, crew, dialogue, requests } as unknown as SimConfig

function runToEnd(seed: number) {
  const result = advance(createSim(config, seed), config, 10 * 1440)
  const start = scenario.startHour * 60
  const hourOf = (e: SimEvent) => (e.minute - start) / 60
  return { ...result, hourOf }
}

describe('scenario pacing', () => {
  it.each([1, 2, 3])('seed %i: materials, water, food, energy run out in order, then everyone dies', (seed) => {
    const { state, events, hourOf } = runToEnd(seed)
    const depleted = Object.fromEntries(
      events.filter((e) => e.type === 'depleted').map((e) => [e.type === 'depleted' && e.resource, hourOf(e)]),
    )
    expect(depleted.materials).toBeGreaterThan(12)
    expect(depleted.materials).toBeLessThan(depleted.water)
    expect(depleted.water).toBeLessThan(depleted.food)
    expect(depleted.food).toBeLessThan(depleted.energy)

    const deaths = events.filter((e) => e.type === 'death').map(hourOf)
    expect(deaths).toHaveLength(6)
    expect(Math.min(...deaths)).toBeGreaterThan(depleted.energy)
    expect(Math.max(...deaths) - depleted.energy).toBeLessThan(18)
    // Traits stagger the deaths rather than killing everyone in the same minute.
    expect(new Set(deaths).size).toBeGreaterThan(3)
    expect(state.over).toBe(true)
    expect(events.at(-1)?.type).toBe('gameOver')
  })

  it('is deterministic per seed', () => {
    expect(runToEnd(5).state).toEqual(runToEnd(5).state)
  })
})

describe('advance', () => {
  it('stops a skip at the first important event', () => {
    const sim = createSim(config, 1)
    const { state, stoppedBy } = advance(sim, config, 3 * 1440, true)
    expect(stoppedBy).toMatchObject({ type: 'request' })
    expect(state.minute).toBe(stoppedBy!.minute)
  })

  it('does not mutate the input state', () => {
    const sim = createSim(config, 1)
    const before = structuredClone(sim)
    advance(sim, config, 120)
    expect(sim).toEqual(before)
  })
})

describe('production', () => {
  it('offsets usage and extends hours left', () => {
    const withSolar = {
      ...config,
      scenario: {
        ...config.scenario,
        producers: [{ id: 'solar', label: 'Solar', resource: 'energy', perHour: 9, scale: 'fixed' }],
      },
    } as SimConfig
    const sim = createSim(withSolar, 1)
    const s = summarize('energy', sim.resources.energy, computeFlows(sim, withSolar))
    expect(s.productionPerHour).toBe(9)
    expect(s.usagePerHour).toBe(18)
    expect(s.hoursLeft).toBeCloseTo(sim.resources.energy.stock / 9)

    const after = advance(sim, withSolar, 60).state
    expect(sim.resources.energy.stock - after.resources.energy.stock).toBeCloseTo(9, 5)
  })
})

describe('forecastDepletion', () => {
  it('matches when the run actually depletes each resource, unlike a linear estimate', () => {
    const sim = createSim(config, 1)
    const forecast = forecastDepletion(sim, config)
    const { events } = advance(sim, config, 7 * 1440)
    for (const e of events) {
      if (e.type === 'depleted') expect(forecast[e.resource]).toBe(e.minute)
    }
    const linear = summarize('energy', sim.resources.energy, computeFlows(sim, config)).hoursLeft
    expect((forecast.energy! - sim.minute) / 60).toBeLessThan(linear - 12)
  })
})

/** Advance until the first pending request from `defId` appears. */
function untilRequest(sim: SimState, defId: string): SimState {
  for (let i = 0; i < 3 * 1440; i++) {
    if (sim.requests.some((r) => r.defId === defId && r.status === 'pending')) return sim
    sim = advance(sim, config, 1).state
  }
  throw new Error(`no ${defId} request`)
}

const pending = (sim: SimState, defId: string) => sim.requests.find((r) => r.defId === defId && r.status === 'pending')!

describe('requests and plans', () => {
  it('every plan has a single output; its other items are costs', () => {
    for (const def of config.requests) {
      expect(def.plan.items.filter((i) => i.perHour > 0), def.id).toHaveLength(1)
    }
  })

  it('the engineer asks to restart the fusion generator at hour 3', () => {
    const sim = untilRequest(createSim(config, 1), 'fusion')
    expect((sim.minute - sim.startMinute) / 60).toBe(3)
    expect(sim.crew.find((c) => c.id === pending(sim, 'fusion').crewId)?.role).toBe('Engineer')
  })

  it('approving pays one-time costs and adds the plan to the flows', () => {
    const sim = untilRequest(createSim(config, 1), 'fusion')
    const result = approveRequest(sim, config, pending(sim, 'fusion').id)
    if (!result.ok) throw new Error(result.reason)
    expect(result.state.resources.materials.stock).toBeCloseTo(sim.resources.materials.stock - 15)
    expect(result.state.plans).toHaveLength(1)
    const planFlows = computeFlows(result.state, config).filter((f) => f.id.startsWith('plan:'))
    expect(planFlows.map((f) => [f.resource, f.kind, f.perHour])).toEqual([
      ['energy', 'producer', 30],
      ['materials', 'consumer', 1.5],
    ])
    // Fusion out-produces usage, so energy rises instead of draining.
    const later = advance(result.state, config, 60).state
    expect(later.resources.energy.stock).toBeGreaterThan(result.state.resources.energy.stock)
  })

  it('paused plans stop contributing; disposed plans are gone', () => {
    const sim = untilRequest(createSim(config, 1), 'fusion')
    const approved = approveRequest(sim, config, pending(sim, 'fusion').id)
    if (!approved.ok) throw new Error(approved.reason)
    const planId = approved.state.plans[0].id
    const paused = togglePlanPaused(approved.state, planId)
    if (!paused.ok) throw new Error(paused.reason)
    expect(computeFlows(paused.state, config).some((f) => f.id.startsWith('plan:'))).toBe(false)
    const disposed = disposePlan(paused.state, planId)
    if (!disposed.ok) throw new Error(disposed.reason)
    expect(disposed.state.plans).toHaveLength(0)
  })

  it('declined requests come back after their cooldown; ignored ones expire', () => {
    let sim = untilRequest(createSim(config, 1), 'fusion')
    const declined = declineRequest(sim, config, pending(sim, 'fusion').id)
    if (!declined.ok) throw new Error(declined.reason)
    sim = untilRequest(declined.state, 'fusion')
    expect(sim.minute - declined.state.minute).toBe(8 * 60)

    const { events } = advance(sim, config, 6 * 60)
    expect(events.some((e) => e.type === 'requestExpired')).toBe(true)
  })

  it('timed plans end on their own', () => {
    const sim = untilRequest(createSim(config, 1), 'hydroponics')
    const approved = approveRequest(sim, config, pending(sim, 'hydroponics').id)
    if (!approved.ok) throw new Error(approved.reason)
    const { events, state } = advance(approved.state, config, 6 * 60)
    expect(events.some((e) => e.type === 'planEnded')).toBe(true)
    expect(state.plans.some((p) => p.defId === 'hydroponics')).toBe(false)
  })

  it('approving every request keeps the crew alive much longer', () => {
    let sim = createSim(config, 1)
    for (let hour = 0; hour < 10 * 24 && !sim.over; hour++) {
      for (const r of sim.requests.filter((r) => r.status === 'pending')) {
        const result = approveRequest(sim, config, r.id)
        if (result.ok) sim = result.state
      }
      sim = advance(sim, config, 60).state
    }
    expect(sim.crew.filter((c) => c.alive).length).toBeGreaterThan(0)
  })
})
