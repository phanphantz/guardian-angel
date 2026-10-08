import { describe, expect, it } from 'vitest'
import { AU, length, sub } from './units'
import { bodyPosition, generateSystem, stationPosition } from './universe'

describe('universe', () => {
  it('is deterministic for a seed', () => {
    expect(generateSystem(42)).toEqual(generateSystem(42))
    expect(generateSystem(42)).not.toEqual(generateSystem(43))
  })

  it('places the home planet roughly 1 AU out with the station in low orbit', () => {
    const system = generateSystem(42)
    const home = bodyPosition(system, system.homeId, 0)
    expect(length(home) / AU).toBeGreaterThan(0.8)
    expect(length(home) / AU).toBeLessThan(1.4)

    const altitude = length(sub(stationPosition(system, 1234), bodyPosition(system, system.homeId, 1234)))
    expect(altitude).toBeCloseTo(system.stationOrbit.radius, 0)
  })
})
