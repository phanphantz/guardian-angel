import { mulberry32, pick, range } from './rng'
import { AU, G, add, type Vec3 } from './units'

export type BodyKind = 'star' | 'planet'

export interface Body {
  id: string
  name: string
  kind: BodyKind
  /** meters */
  radius: number
  /** kg */
  mass: number
  color: string
  parentId: string | null
  /** meters, circular orbit around parent */
  orbitRadius: number
  /** seconds */
  orbitPeriod: number
  /** radians at t = 0 */
  orbitPhase: number
}

export interface Orbit {
  parentId: string
  radius: number
  period: number
  phase: number
}

export interface StarSystem {
  seed: number
  name: string
  bodies: Body[]
  homeId: string
  /** The player's station orbits the home planet. */
  stationOrbit: Orbit
}

const STAR_NAMES = ['Seraph', 'Elysia', 'Ophan', 'Halo', 'Aureole', 'Cherub'] as const
const PLANET_SUFFIX = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const
const ROCKY = ['#a0826d', '#c2b280', '#8b6f5a', '#b5651d', '#7a8b99'] as const
const GAS = ['#d9b38c', '#c7a27c', '#9fb4c7', '#7fa7d9', '#e3c9a1'] as const
const SOLAR_MASS = 1.989e30

export const orbitalPeriod = (radius: number, parentMass: number) =>
  2 * Math.PI * Math.sqrt(radius ** 3 / (G * parentMass))

export function generateSystem(seed: number): StarSystem {
  const rand = mulberry32(seed)
  const starName = pick(rand, STAR_NAMES)
  const starMass = range(rand, 0.8, 1.3) * SOLAR_MASS
  const star: Body = {
    id: 'star',
    name: starName,
    kind: 'star',
    radius: range(rand, 5.5e8, 8e8),
    mass: starMass,
    color: '#fff1c9',
    parentId: null,
    orbitRadius: 0,
    orbitPeriod: 1,
    orbitPhase: 0,
  }

  const planetCount = 5 + Math.floor(rand() * 3)
  const homeIndex = 2
  const planets: Body[] = []
  for (let i = 0; i < planetCount; i++) {
    const gasGiant = i > 3 && rand() > 0.3
    const radius = gasGiant ? range(rand, 2.4e7, 7e7) : range(rand, 2.5e6, 7e6)
    const density = gasGiant ? 1300 : 5500
    const orbitRadius = 0.4 * AU * 1.65 ** i * range(rand, 0.9, 1.1)
    planets.push({
      id: `planet-${i}`,
      name: i === homeIndex ? 'Haven' : `${starName} ${PLANET_SUFFIX[i]}`,
      kind: 'planet',
      radius,
      mass: density * (4 / 3) * Math.PI * radius ** 3,
      color: i === homeIndex ? '#4f8fd6' : pick(rand, gasGiant ? GAS : ROCKY),
      parentId: star.id,
      orbitRadius,
      orbitPeriod: orbitalPeriod(orbitRadius, starMass),
      orbitPhase: rand() * Math.PI * 2,
    })
  }

  const home = planets[homeIndex]
  const stationRadius = home.radius + 420e3
  return {
    seed,
    name: `${starName} System`,
    bodies: [star, ...planets],
    homeId: home.id,
    stationOrbit: {
      parentId: home.id,
      radius: stationRadius,
      period: orbitalPeriod(stationRadius, home.mass),
      phase: 0,
    },
  }
}

export function getBody(system: StarSystem, id: string): Body {
  const body = system.bodies.find((b) => b.id === id)
  if (!body) throw new Error(`Unknown body ${id}`)
  return body
}

/** Circular orbit in the XZ plane. */
export function orbitOffset(radius: number, period: number, phase: number, t: number): Vec3 {
  const angle = phase + (2 * Math.PI * t) / period
  return { x: Math.cos(angle) * radius, y: 0, z: -Math.sin(angle) * radius }
}

/** Absolute (system-space, float64) position of a body at sim time t (seconds). */
export function bodyPosition(system: StarSystem, id: string, t: number): Vec3 {
  const body = getBody(system, id)
  if (!body.parentId) return { x: 0, y: 0, z: 0 }
  return add(
    bodyPosition(system, body.parentId, t),
    orbitOffset(body.orbitRadius, body.orbitPeriod, body.orbitPhase, t),
  )
}

export function stationPosition(system: StarSystem, t: number): Vec3 {
  const o = system.stationOrbit
  return add(bodyPosition(system, o.parentId, t), orbitOffset(o.radius, o.period, o.phase, t))
}
