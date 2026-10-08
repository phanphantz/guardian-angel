import { create } from 'zustand'
import modulesJson from '../data/modules.json'
import { createStation, placeModule, removeModule, type Cell, type ModuleDef, type Station } from '../core/station'
import { generateSystem, type StarSystem } from '../core/universe'

/**
 * UI-facing game state. Equivalent to a GameManager + events in Unity:
 * views read from here, and every mutation goes through a core/ function.
 */

export const MODULE_DEFS: ReadonlyMap<string, ModuleDef> = new Map(
  (modulesJson as ModuleDef[]).map((d) => [d.id, d]),
)

export const STATION_FOCUS = 'station'
export const TIME_SCALES = [0, 1, 60, 3600, 86400, 604800] as const

interface GameState {
  system: StarSystem
  station: Station
  /** 'station' or a body id. The focused object sits at the floating origin. */
  focus: string
  buildType: string | null
  selectedModuleId: string | null
  timeScale: number
  message: { text: string; id: number } | null

  setFocus: (focus: string) => void
  setBuildType: (type: string | null) => void
  selectModule: (id: string | null) => void
  setTimeScale: (scale: number) => void
  build: (cell: Cell) => void
  demolish: (moduleId: string) => void
  notify: (text: string) => void
}

export const useGame = create<GameState>((set, get) => ({
  system: generateSystem(7),
  station: createStation('Guardian Station'),
  focus: STATION_FOCUS,
  buildType: null,
  selectedModuleId: null,
  timeScale: 60,
  message: null,

  setFocus: (focus) => set({ focus, buildType: null, selectedModuleId: null }),
  setBuildType: (buildType) => set({ buildType, selectedModuleId: null }),
  selectModule: (selectedModuleId) => set({ selectedModuleId }),
  setTimeScale: (timeScale) => set({ timeScale }),

  build: (cell) => {
    const { buildType, station } = get()
    const def = buildType ? MODULE_DEFS.get(buildType) : undefined
    if (!def) return
    const result = placeModule(station, def, cell)
    if (result.ok) set({ station: result.station })
    else get().notify(result.reason)
  },

  demolish: (moduleId) => {
    const result = removeModule(get().station, moduleId, MODULE_DEFS)
    if (result.ok) set({ station: result.station, selectedModuleId: null })
    else get().notify(result.reason)
  },

  notify: (text) => set({ message: { text, id: Date.now() } }),
}))

/** Sim clock lives outside React state so it can advance every frame without re-rendering the UI. */
export const simClock = { t: 0 }
