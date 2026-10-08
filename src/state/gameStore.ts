import { create } from 'zustand'
import crew from '../data/crew.json'
import dialogue from '../data/dialogue.json'
import scenario from '../data/scenario.json'
import { advance, createSim, forecastDepletion, type AdvanceResult, type Forecast, type SimConfig, type SimEvent, type SimState } from '../core/sim'
import { SPEED_RATE, type Speed } from '../core/time'

/**
 * Presentation state around the pure sim: time speed, speech queue, unread badges,
 * notices and restart. Unity equivalent: a GameManager MonoBehaviour raising C# events.
 */

export const SIM_CONFIG = { scenario, crew, dialogue } as unknown as SimConfig

export type ResourceTab = 'production' | 'budget'

interface Speech {
  crewId: string
  text: string
}

const MAX_QUEUED_SPEECH = 3
const RESTART_DELAY_MS = 10_000
const speechDuration = (text: string) => Math.min(5000, 1400 + text.length * 45)

interface GameStore {
  sim: SimState
  /** When each resource will actually run out. Refreshed once per game hour. */
  forecast: Forecast
  speed: Speed
  resourceTab: ResourceTab
  notice: { text: string; id: number } | null
  speaking: (Speech & { until: number }) | null
  speechQueue: Speech[]
  unread: Record<string, number>
  openCrewId: string | null
  /** performance.now() timestamp of the automatic restart, while the game-over screen is up. */
  restartAt: number | null

  setSpeed: (speed: Speed) => void
  setResourceTab: (tab: ResourceTab) => void
  skip: (minutes: number) => void
  toggleCrew: (id: string) => void
  restart: () => void
  /** Called every animation frame with real elapsed seconds. */
  frame: (dtSeconds: number, now: number) => void
}

let minuteAccumulator = 0

const hourOf = (sim: SimState) => Math.floor(sim.minute / 60)

export const useGameStore = create<GameStore>((set, get) => {
  function apply(result: AdvanceResult, skipped: boolean) {
    const { sim, speechQueue, unread, openCrewId } = get()
    const queue = [...speechQueue]
    const nextUnread = { ...unread }
    let notice: string | null = null

    for (const e of result.events) {
      if (e.type === 'say') {
        queue.push({ crewId: e.crewId, text: e.text })
        if (e.crewId !== openCrewId) nextUnread[e.crewId] = (nextUnread[e.crewId] ?? 0) + 1
      } else {
        notice = describe(e, result.state)
      }
    }
    if (skipped && result.stoppedBy) notice = `Skip stopped: ${describe(result.stoppedBy, result.state)}`

    const { forecast } = get()
    const stale = hourOf(result.state) !== hourOf(sim) || result.events.some((e) => e.type !== 'say')
    set({
      sim: result.state,
      forecast: stale ? forecastDepletion(result.state, SIM_CONFIG) : forecast,
      speechQueue: queue.slice(-MAX_QUEUED_SPEECH),
      unread: nextUnread,
      ...(notice ? { notice: { text: notice, id: Date.now() } } : {}),
      ...(result.state.over && !sim.over ? { restartAt: performance.now() + RESTART_DELAY_MS } : {}),
    })
  }

  const initial = createSim(SIM_CONFIG, 1)
  return {
    sim: initial,
    forecast: forecastDepletion(initial, SIM_CONFIG),
    speed: 'normal',
    resourceTab: 'budget',
    notice: null,
    speaking: null,
    speechQueue: [],
    unread: {},
    openCrewId: null,
    restartAt: null,

    setSpeed: (speed) => set({ speed }),
    setResourceTab: (resourceTab) => set({ resourceTab }),

    skip: (minutes) => {
      const { sim } = get()
      if (sim.over) return
      apply(advance(sim, SIM_CONFIG, minutes, true), true)
    },

    toggleCrew: (id) => {
      const { openCrewId, unread } = get()
      set({ openCrewId: openCrewId === id ? null : id, unread: { ...unread, [id]: 0 } })
    },

    restart: () => {
      minuteAccumulator = 0
      const sim = createSim(SIM_CONFIG, get().sim.seed + 1)
      set({
        sim,
        forecast: forecastDepletion(sim, SIM_CONFIG),
        speaking: null,
        speechQueue: [],
        unread: {},
        openCrewId: null,
        restartAt: null,
        notice: null,
      })
    },

    frame: (dt, now) => {
      const { sim, speed, speaking, speechQueue, restartAt } = get()

      if (restartAt !== null && now >= restartAt) return get().restart()

      if (!sim.over) {
        minuteAccumulator += Math.min(dt, 0.25) * SPEED_RATE[speed]
        const minutes = Math.floor(minuteAccumulator)
        if (minutes > 0) {
          minuteAccumulator -= minutes
          apply(advance(sim, SIM_CONFIG, minutes), false)
        }
      }

      if ((!speaking || now >= speaking.until) && (speaking || speechQueue.length)) {
        // Lines queued by crew who have since died are dropped, not played over a dead slot.
        const queue = speechQueue.filter((q) => sim.crew.find((c) => c.id === q.crewId)?.alive)
        const [next, ...rest] = queue
        set({ speaking: next ? { ...next, until: now + speechDuration(next.text) } : null, speechQueue: rest })
      }
    },
  }
})

const RESOURCE_LABEL = { energy: 'Energy', water: 'Water', food: 'Food', materials: 'Materials' } as const

export function describe(e: Exclude<SimEvent, { type: 'say' }>, sim: SimState): string {
  const name = (id: string) => sim.crew.find((c) => c.id === id)?.name ?? id
  switch (e.type) {
    case 'depleted':
      return `${RESOURCE_LABEL[e.resource]} depleted`
    case 'critical':
      return `${name(e.crewId)} is in critical condition`
    case 'death':
      return `${name(e.crewId)} has died`
    case 'gameOver':
      return 'All crew lost'
  }
}
