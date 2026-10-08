import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BufferGeometry, CanvasTexture, Group, LineLoop, Vector3 } from 'three'
import { length, sub, formatDistance } from '../core/units'
import type { Body } from '../core/universe'
import { STATION_FOCUS, useGame } from '../state/store'
import { frame, toLocal } from './frame'
import { WorldLabel } from './WorldLabel'

export function Bodies() {
  const system = useGame((s) => s.system)
  const focus = useGame((s) => s.focus)
  return (
    <>
      {system.bodies.map((body) => (
        <BodyView key={body.id} body={body} />
      ))}
      {system.bodies
        .filter((b) => b.parentId)
        .map((b) => (
          <OrbitLine key={b.id} centerId={b.parentId!} radius={b.orbitRadius} color="#3b5a80" />
        ))}
      {focus !== STATION_FOCUS && (
        <OrbitLine centerId={system.stationOrbit.parentId} radius={system.stationOrbit.radius} color="#7fd4ff" />
      )}
    </>
  )
}

function BodyView({ body }: { body: Body }) {
  const group = useRef<Group>(null)
  const setFocus = useGame((s) => s.setFocus)
  const focused = useGame((s) => s.focus === body.id)

  useFrame(() => group.current && toLocal(body.id, group.current.position))

  return (
    <group ref={group}>
      <mesh scale={body.radius} onClick={(e) => (e.stopPropagation(), setFocus(body.id))}>
        <sphereGeometry args={[1, 64, 32]} />
        {body.kind === 'star' ? (
          <meshBasicMaterial color={body.color} toneMapped={false} />
        ) : (
          <meshStandardMaterial color={body.color} roughness={0.9} metalness={0} />
        )}
      </mesh>
      {body.kind === 'star' && <StarGlow />}
      <WorldLabel
        name={body.name}
        kind={body.kind}
        focused={focused}
        onClick={() => setFocus(body.id)}
        distance={() => formatDistance(length(sub(frame.positions.get(body.id)!, frame.origin)))}
      />
    </group>
  )
}

/** Screen-space halo so the star stays visible from the outer system. */
function StarGlow() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')!
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,245,215,1)')
    g.addColorStop(0.2, 'rgba(255,220,160,0.5)')
    g.addColorStop(1, 'rgba(255,200,120,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    return new CanvasTexture(canvas)
  }, [])
  return (
    <sprite scale={0.12}>
      <spriteMaterial map={texture} sizeAttenuation={false} depthWrite={false} transparent toneMapped={false} />
    </sprite>
  )
}

const UNIT_CIRCLE = new BufferGeometry().setFromPoints(
  Array.from({ length: 256 }, (_, i) => {
    const a = (i / 256) * Math.PI * 2
    return new Vector3(Math.cos(a), 0, Math.sin(a))
  }),
)

function OrbitLine({ centerId, radius, color }: { centerId: string; radius: number; color: string }) {
  const line = useRef<LineLoop>(null)
  useFrame(() => line.current && toLocal(centerId, line.current.position))
  return (
    <lineLoop ref={line} geometry={UNIT_CIRCLE} scale={radius}>
      <lineBasicMaterial color={color} transparent opacity={0.45} depthWrite={false} />
    </lineLoop>
  )
}
