import { useEffect } from 'react'
import { SpaceScene } from './render/SpaceScene'
import { useGameStore } from './state/gameStore'
import { CrewGrid } from './ui/CrewSlot'
import { GameOver } from './ui/GameOver'
import { ResourcePanel } from './ui/ResourcePanel'
import { Notice, TimeBar } from './ui/TimeBar'

/** Drives sim time and the speech queue from real time. */
function useGameLoop() {
  useEffect(() => {
    let last = performance.now()
    let raf = 0
    const loop = (now: number) => {
      useGameStore.getState().frame((now - last) / 1000, now)
      last = now
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
}

export default function App() {
  useGameLoop()
  return (
    <div className="app">
      <SpaceScene />
      <div className="scene-dim" />
      <div className="hud">
        <TimeBar />
        <div className="hud__body">
          <ResourcePanel />
          <CrewGrid />
        </div>
      </div>
      <Notice />
      <GameOver />
      <div className="crt" aria-hidden />
    </div>
  )
}
