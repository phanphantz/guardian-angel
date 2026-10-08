import { describe, expect, it } from 'vitest'
import crew from '../data/crew.json'
import dialogue from '../data/dialogue.json'
import scenario from '../data/scenario.json'
import { advance, computeFlows, createSim, type SimConfig, type SimEvent } from './sim'
import { summarize } from './resources'

const config = { scenario, crew, dialogue } as unknown as SimConfig

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
    expect(stoppedBy).toMatchObject({ type: 'depleted', resource: 'materials' })
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
