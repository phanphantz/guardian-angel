import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { useGame } from '../state/sceneStore'

interface Props {
  name: string
  kind: string
  focused: boolean
  /** Toggle instead of unmounting: unmounting drei <Html> mid-render upsets React 19. */
  hidden?: boolean
  onClick: () => void
  /** Called every frame; written straight to the DOM to avoid React re-renders. */
  distance: () => string
}

/** HTML label pinned to a 3D object. In Unity: a UI Toolkit element positioned via WorldToScreenPoint. */
export function WorldLabel({ name, kind, focused, hidden = false, onClick, distance }: Props) {
  const distanceEl = useRef<HTMLSpanElement>(null)
  const labelsVisible = useGame((s) => s.labelsVisible)
  useFrame(() => {
    if (distanceEl.current) distanceEl.current.textContent = focused ? '' : distance()
  })
  return (
    <Html zIndexRange={[10, 0]} style={{ pointerEvents: 'none', display: hidden || !labelsVisible ? 'none' : undefined }}>
      <button className={`world-label world-label--${kind}${focused ? ' is-focused' : ''}`} onClick={onClick}>
        <span className="world-label__dot" />
        <span className="world-label__name">{name}</span>
        <span className="world-label__distance" ref={distanceEl} />
      </button>
    </Html>
  )
}
