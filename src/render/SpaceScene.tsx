import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PointLight, Vector3 } from 'three'
import { AU } from '../core/units'
import { bodyPosition, getBody, stationPosition } from '../core/universe'
import { STATION_FOCUS, simClock, useGame } from '../state/sceneStore'
import { Bodies } from './Bodies'
import { frame, toLocal } from './frame'
import { Starfield } from './Starfield'
import { StationView } from './StationView'

export function SpaceScene() {
  const selectModule = useGame((s) => s.selectModule)
  return (
    <Canvas
      className="scene"
      // Log depth lets a 12 m module and a 1e12 m orbit share one depth buffer without z-fighting.
      gl={{ logarithmicDepthBuffer: true, antialias: true }}
      camera={{ fov: 55, near: 0.1, far: 1e16, position: [70, 35, 90] }}
      onPointerMissed={() => selectModule(null)}
    >
      <color attach="background" args={['#02030a']} />
      <SimDriver />
      <ambientLight intensity={0.05} />
      {/* Cheap stand-in for planet-shine so the night side of the station stays readable. */}
      <hemisphereLight args={['#9fc4ff', '#0b1630', 0.35]} />
      <SunLight />
      <Starfield />
      <Bodies />
      <StationView />
      <CameraRig />
    </Canvas>
  )
}

/** Advances sim time and rebuilds the float64 position table before anything renders. */
function SimDriver() {
  useFrame((_, dt) => {
    const { system, focus, timeScale } = useGame.getState()
    simClock.t += Math.min(dt, 0.1) * timeScale
    for (const body of system.bodies) frame.positions.set(body.id, bodyPosition(system, body.id, simClock.t))
    frame.positions.set(STATION_FOCUS, stationPosition(system, simClock.t))
    frame.origin = frame.positions.get(focus) ?? frame.origin
  }, -1)
  return null
}

function SunLight() {
  const light = useRef<PointLight>(null)
  useFrame(() => light.current && toLocal('star', light.current.position))
  return <pointLight ref={light} intensity={3.2} decay={0} />
}

interface FocusRange {
  min: number
  max: number
  initial: number
}

function focusRange(focus: string): FocusRange {
  if (focus === STATION_FOCUS) return { min: 15, max: 5000, initial: 110 }
  const body = getBody(useGame.getState().system, focus)
  if (body.kind === 'star') return { min: body.radius * 1.5, max: 120 * AU, initial: 4 * AU }
  return { min: body.radius * 1.2, max: body.radius * 400, initial: body.radius * 4 }
}

/** Orbit camera around the focused object, which is always at the local origin. */
function CameraRig() {
  const focus = useGame((s) => s.focus)
  const camera = useThree((s) => s.camera)
  const range = focusRange(focus)

  useEffect(() => {
    const { initial } = focusRange(focus)
    const dir = camera.position.lengthSq() > 0 ? camera.position.clone().normalize() : new Vector3(0.6, 0.35, 0.7)
    if (Math.abs(dir.y) < 0.2) dir.y = 0.3
    camera.position.copy(dir.normalize().multiplyScalar(initial))
    camera.lookAt(0, 0, 0)
  }, [focus, camera])

  return (
    <OrbitControls
      makeDefault
      target={[0, 0, 0]}
      enablePan={false}
      minDistance={range.min}
      maxDistance={range.max}
      zoomSpeed={1.4}
      enableDamping
    />
  )
}
