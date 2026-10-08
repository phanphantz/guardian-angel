/**
 * Modular station as a 3D grid of cells. Pure data + pure functions:
 * no React, no three.js — this file is meant to be ported to C# as-is.
 */

export type ModuleShape = 'box' | 'cylinder' | 'sphere' | 'panel'

export interface ModuleDef {
  id: string
  name: string
  description: string
  shape: ModuleShape
  color: string
  cost: number
  /** positive = produces, negative = consumes */
  power: number
  crew: number
  storage: number
  buildable: boolean
  /** Optional glTF path under public/, e.g. "models/hab.glb". Falls back to primitive shape. */
  model?: string
}

export type Cell = readonly [number, number, number]

export interface ModuleInstance {
  id: string
  type: string
  cell: Cell
}

export interface Station {
  name: string
  credits: number
  modules: ModuleInstance[]
  nextId: number
}

export type Result = { ok: true; station: Station } | { ok: false; reason: string }

/** Edge length of one grid cell, meters. */
export const CELL_SIZE = 12
export const CORE_ID = 'm0'
export const DEMOLISH_REFUND = 0.5

const DIRS: Cell[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

export const cellKey = (c: Cell) => `${c[0]},${c[1]},${c[2]}`
const neighbors = (c: Cell): Cell[] => DIRS.map((d) => [c[0] + d[0], c[1] + d[1], c[2] + d[2]] as const)

export function createStation(name: string, credits = 5000): Station {
  return { name, credits, modules: [{ id: CORE_ID, type: 'core', cell: [0, 0, 0] }], nextId: 1 }
}

function occupancy(station: Station): Map<string, ModuleInstance> {
  return new Map(station.modules.map((m) => [cellKey(m.cell), m]))
}

/** Empty cells adjacent to at least one existing module. */
export function buildSites(station: Station): Cell[] {
  const occupied = occupancy(station)
  const sites = new Map<string, Cell>()
  for (const m of station.modules) {
    for (const n of neighbors(m.cell)) {
      const key = cellKey(n)
      if (!occupied.has(key)) sites.set(key, n)
    }
  }
  return [...sites.values()]
}

/** Pairs of adjacent modules, each pair once. Used to draw connector tubes. */
export function connections(station: Station): [ModuleInstance, ModuleInstance][] {
  const occupied = occupancy(station)
  const pairs: [ModuleInstance, ModuleInstance][] = []
  for (const m of station.modules) {
    for (const d of DIRS.filter((d) => d[0] + d[1] + d[2] > 0)) {
      const other = occupied.get(cellKey([m.cell[0] + d[0], m.cell[1] + d[1], m.cell[2] + d[2]]))
      if (other) pairs.push([m, other])
    }
  }
  return pairs
}

export function placeModule(station: Station, def: ModuleDef, cell: Cell): Result {
  if (!def.buildable) return { ok: false, reason: `${def.name} cannot be built` }
  if (station.credits < def.cost) return { ok: false, reason: 'Not enough credits' }
  const occupied = occupancy(station)
  if (occupied.has(cellKey(cell))) return { ok: false, reason: 'Cell is occupied' }
  if (!neighbors(cell).some((n) => occupied.has(cellKey(n)))) {
    return { ok: false, reason: 'Must attach to an existing module' }
  }
  return {
    ok: true,
    station: {
      ...station,
      credits: station.credits - def.cost,
      modules: [...station.modules, { id: `m${station.nextId}`, type: def.id, cell }],
      nextId: station.nextId + 1,
    },
  }
}

export function removeModule(station: Station, moduleId: string, defs: ReadonlyMap<string, ModuleDef>): Result {
  if (moduleId === CORE_ID) return { ok: false, reason: 'The Command Core cannot be removed' }
  const target = station.modules.find((m) => m.id === moduleId)
  if (!target) return { ok: false, reason: 'Module not found' }

  const remaining = station.modules.filter((m) => m.id !== moduleId)
  if (!isConnected(remaining)) return { ok: false, reason: 'Removing this would split the station' }

  const refund = Math.floor((defs.get(target.type)?.cost ?? 0) * DEMOLISH_REFUND)
  return { ok: true, station: { ...station, credits: station.credits + refund, modules: remaining } }
}

/** Every module reachable from the core through face-adjacent cells. */
function isConnected(modules: ModuleInstance[]): boolean {
  const byCell = new Map(modules.map((m) => [cellKey(m.cell), m]))
  const core = modules.find((m) => m.id === CORE_ID)
  if (!core) return false
  const seen = new Set([cellKey(core.cell)])
  const queue: Cell[] = [core.cell]
  while (queue.length) {
    for (const n of neighbors(queue.pop()!)) {
      const key = cellKey(n)
      if (byCell.has(key) && !seen.has(key)) {
        seen.add(key)
        queue.push(n)
      }
    }
  }
  return seen.size === modules.length
}

export interface StationStats {
  powerProduced: number
  powerConsumed: number
  crew: number
  storage: number
  moduleCount: number
}

export function stationStats(station: Station, defs: ReadonlyMap<string, ModuleDef>): StationStats {
  const stats: StationStats = { powerProduced: 0, powerConsumed: 0, crew: 0, storage: 0, moduleCount: 0 }
  for (const m of station.modules) {
    const def = defs.get(m.type)
    if (!def) continue
    if (def.power >= 0) stats.powerProduced += def.power
    else stats.powerConsumed -= def.power
    stats.crew += def.crew
    stats.storage += def.storage
    stats.moduleCount++
  }
  return stats
}
