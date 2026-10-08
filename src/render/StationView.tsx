import { useGLTF } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useMemo, useRef, useState } from 'react'
import { Group, Quaternion, Vector3 } from 'three'
import { CELL_SIZE, buildSites, cellKey, connections, type Cell, type ModuleDef, type ModuleInstance } from '../core/station'
import { formatDistance, length, sub } from '../core/units'
import { MODULE_DEFS, STATION_FOCUS, useGame } from '../state/store'
import { frame, toLocal } from './frame'
import { WorldLabel } from './WorldLabel'

const cellToVec = (c: Cell) => new Vector3(c[0] * CELL_SIZE, c[1] * CELL_SIZE, c[2] * CELL_SIZE)

export function StationView() {
  const group = useRef<Group>(null)
  const station = useGame((s) => s.station)
  const focused = useGame((s) => s.focus === STATION_FOCUS)
  const buildType = useGame((s) => s.buildType)
  const setFocus = useGame((s) => s.setFocus)
  // From further out the station label would sit on top of its planet's label.
  const showLabel = useGame((s) => s.focus === s.system.stationOrbit.parentId)

  useFrame(() => group.current && toLocal(STATION_FOCUS, group.current.position))

  const links = useMemo(() => connections(station), [station])
  const sites = useMemo(() => (buildType ? buildSites(station) : []), [station, buildType])

  return (
    <group ref={group}>
      {station.modules.map((m) => (
        <ModuleView key={m.id} module={m} />
      ))}
      {links.map(([a, b]) => (
        <Connector key={`${a.id}-${b.id}`} from={a.cell} to={b.cell} />
      ))}
      {focused && sites.map((cell) => <BuildSite key={cellKey(cell)} cell={cell} />)}
      <WorldLabel
        name={station.name}
        kind="station"
        focused={false}
        hidden={!showLabel}
        onClick={() => setFocus(STATION_FOCUS)}
        distance={() => formatDistance(length(sub(frame.positions.get(STATION_FOCUS)!, frame.origin)))}
      />
    </group>
  )
}

function ModuleView({ module }: { module: ModuleInstance }) {
  const def = MODULE_DEFS.get(module.type)!
  const selected = useGame((s) => s.selectedModuleId === module.id)
  const selectModule = useGame((s) => s.selectModule)
  const buildMode = useGame((s) => s.buildType !== null)
  const [hovered, setHovered] = useState(false)

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!buildMode) selectModule(module.id)
  }

  return (
    <group
      position={cellToVec(module.cell)}
      onClick={onClick}
      onPointerOver={(e) => (e.stopPropagation(), setHovered(true))}
      onPointerOut={() => setHovered(false)}
    >
      {def.model ? (
        <Suspense fallback={<Primitive def={def} highlight={0} />}>
          <GltfModule url={import.meta.env.BASE_URL + def.model} />
        </Suspense>
      ) : (
        <Primitive def={def} highlight={selected ? 0.55 : hovered && !buildMode ? 0.2 : 0} />
      )}
    </group>
  )
}

/** Placeholder geometry until a real .glb is set via `model` in modules.json. */
function Primitive({ def, highlight }: { def: ModuleDef; highlight: number }) {
  const material = (
    <meshStandardMaterial
      color={def.color}
      metalness={0.55}
      roughness={0.38}
      emissive="#7fd4ff"
      emissiveIntensity={highlight}
    />
  )
  const s = CELL_SIZE
  switch (def.shape) {
    case 'cylinder':
      return (
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[s * 0.32, s * 0.32, s * 0.86, 32]} />
          {material}
        </mesh>
      )
    case 'sphere':
      return (
        <mesh>
          <sphereGeometry args={[s * 0.4, 32, 16]} />
          {material}
        </mesh>
      )
    case 'panel':
      return (
        <group>
          <mesh>
            <boxGeometry args={[s * 0.12, s * 0.12, s * 0.9]} />
            <meshStandardMaterial color="#9aa3ad" metalness={0.7} roughness={0.4} emissive="#7fd4ff" emissiveIntensity={highlight} />
          </mesh>
          <mesh position={[0, s * 0.08, 0]}>
            <boxGeometry args={[s * 0.96, s * 0.03, s * 0.7]} />
            {material}
          </mesh>
        </group>
      )
    case 'box':
      return (
        <mesh>
          <boxGeometry args={[s * 0.8, s * 0.8, s * 0.8]} />
          {material}
        </mesh>
      )
  }
}

function GltfModule({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const clone = useMemo(() => scene.clone(), [scene])
  return <primitive object={clone} />
}

const UP = new Vector3(0, 1, 0)

function Connector({ from, to }: { from: Cell; to: Cell }) {
  const a = cellToVec(from)
  const b = cellToVec(to)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const quat = new Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize())
  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[CELL_SIZE * 0.12, CELL_SIZE * 0.12, CELL_SIZE * 0.5, 16]} />
      <meshStandardMaterial color="#6d7682" metalness={0.8} roughness={0.35} />
    </mesh>
  )
}

function BuildSite({ cell }: { cell: Cell }) {
  const build = useGame((s) => s.build)
  const [hovered, setHovered] = useState(false)
  return (
    <mesh
      position={cellToVec(cell)}
      onClick={(e) => (e.stopPropagation(), build(cell))}
      onPointerOver={(e) => (e.stopPropagation(), setHovered(true))}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[CELL_SIZE * 0.8, CELL_SIZE * 0.8, CELL_SIZE * 0.8]} />
      <meshBasicMaterial color="#7fd4ff" transparent opacity={hovered ? 0.35 : 0.08} wireframe={!hovered} depthWrite={false} />
    </mesh>
  )
}
