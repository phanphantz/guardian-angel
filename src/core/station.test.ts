import { describe, expect, it } from 'vitest'
import modulesJson from '../data/modules.json'
import { CORE_ID, buildSites, connections, createStation, placeModule, removeModule, type ModuleDef, type Station } from './station'

const defs = new Map((modulesJson as ModuleDef[]).map((d) => [d.id, d]))
const def = (id: string) => defs.get(id)!

function build(station: Station, type: string, cell: [number, number, number]): Station {
  const result = placeModule(station, def(type), cell)
  if (!result.ok) throw new Error(result.reason)
  return result.station
}

describe('station', () => {
  it('starts with a core and six build sites', () => {
    const s = createStation('Test')
    expect(s.modules).toHaveLength(1)
    expect(buildSites(s)).toHaveLength(6)
  })

  it('places an adjacent module and charges credits', () => {
    const s = build(createStation('Test', 1000), 'hab', [1, 0, 0])
    expect(s.modules).toHaveLength(2)
    expect(s.credits).toBe(600)
    expect(connections(s)).toHaveLength(1)
  })

  it('rejects detached, occupied and unaffordable placements', () => {
    const s = createStation('Test', 100)
    expect(placeModule(s, def('solar'), [3, 0, 0])).toMatchObject({ ok: false })
    expect(placeModule(s, def('solar'), [0, 0, 0])).toMatchObject({ ok: false })
    expect(placeModule(s, def('reactor'), [1, 0, 0])).toMatchObject({ ok: false, reason: 'Not enough credits' })
  })

  it('refuses to remove the core or split the station', () => {
    let s = build(createStation('Test'), 'hab', [1, 0, 0])
    s = build(s, 'solar', [2, 0, 0])
    expect(removeModule(s, CORE_ID, defs)).toMatchObject({ ok: false })
    expect(removeModule(s, 'm1', defs)).toMatchObject({ ok: false, reason: 'Removing this would split the station' })

    const result = removeModule(s, 'm2', defs)
    expect(result.ok && result.station.modules).toHaveLength(2)
  })
})

describe('architecture', () => {
  it('keeps src/core engine-agnostic (no React / three.js imports)', async () => {
    const files = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    for (const [path, source] of Object.entries(files)) {
      expect(source, path).not.toMatch(/from ['"](react|three|@react-three)/)
    }
  })
})
