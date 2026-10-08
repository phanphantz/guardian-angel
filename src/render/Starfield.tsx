import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Color, Group } from 'three'
import { mulberry32 } from '../core/rng'

const COUNT = 9000
const RADIUS = 1e15

/** Background stars on a huge sphere that follows the camera (never reachable). */
export function Starfield() {
  const group = useRef<Group>(null)
  const geometry = useMemo(() => {
    const rand = mulberry32(1337)
    const positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    const color = new Color()
    for (let i = 0; i < COUNT; i++) {
      // A third of the stars hug a tilted galactic band.
      const band = i % 3 === 0
      const theta = rand() * Math.PI * 2
      const y = band ? (rand() - 0.5) * 0.25 : rand() * 2 - 1
      const r = Math.sqrt(1 - y * y)
      const x = Math.cos(theta) * r
      const z = Math.sin(theta) * r
      positions.set([x * RADIUS, (y * 0.9 + x * 0.4) * RADIUS, z * RADIUS], i * 3)
      color.setHSL(0.55 + rand() * 0.15 - (rand() > 0.85 ? 0.5 : 0), 0.5, 0.55 + rand() * 0.4)
      colors.set([color.r, color.g, color.b], i * 3)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(positions, 3))
    g.setAttribute('color', new BufferAttribute(colors, 3))
    return g
  }, [])

  useFrame(({ camera }) => group.current?.position.copy(camera.position))

  return (
    <group ref={group}>
      <points geometry={geometry} renderOrder={-1}>
        <pointsMaterial size={1.6} sizeAttenuation={false} vertexColors depthWrite={false} transparent opacity={0.9} />
      </points>
    </group>
  )
}
