import type { Expression } from '../core/vitals'

interface Props {
  expression: Expression
  hairStyle: number
  size?: number
}

/** Phosphor-terminal palette. Line color dims as the crew member fades. */
const BG = '#000'
const FILL = '#031a0a'
const HAIR = '#0d4a1e'
const LINE: Record<Expression, string> = {
  calm: '#39ff6a',
  worried: '#39ff6a',
  distressed: '#39ff6a',
  unconscious: '#22b84a',
  dead: '#127a2f',
}

/**
 * Procedural face, drawn as monochrome line art. Placeholder for per-character
 * sprite sheets: in Unity each Expression maps to one sprite.
 */
export function Avatar({ expression, hairStyle, size = 64 }: Props) {
  const line = LINE[expression]
  return (
    <svg className={`avatar avatar--${expression}`} width={size} height={size} viewBox="0 0 64 64" aria-label={expression}>
      <rect width="64" height="64" fill={BG} />
      <path d="M10 64 C12 50 22 46 32 46 C42 46 52 50 54 64" fill={FILL} stroke={line} strokeWidth="1.2" />
      <path d="M26 46 L32 52 L38 46" fill="none" stroke={line} strokeWidth="1.2" />
      <ellipse cx="32" cy="30" rx="14" ry="16" fill={FILL} stroke={line} strokeWidth="1.2" />
      <Hair style={hairStyle} color={HAIR} stroke={line} />
      <g stroke={line} fill={line}>
        <Eyes expression={expression} color={line} />
        <Brows expression={expression} color={line} />
        <Mouth expression={expression} color={line} />
      </g>
      {expression === 'distressed' && <path d="M47 24 q2 4 0 6 q-2 -2 0 -6 Z" fill="none" stroke={line} strokeWidth="1" />}
    </svg>
  )
}

function Hair({ style, color, stroke }: { style: number; color: string; stroke: string }) {
  switch (style % 4) {
    case 0:
      return <path d="M17 28 C16 12 48 12 47 28 C44 20 38 17 32 18 C26 17 20 20 17 28 Z" fill={color} stroke={stroke} strokeWidth="1" />
    case 1:
      return <path d="M18 24 C18 13 46 13 46 24 L46 21 C40 17 24 17 18 21 Z" fill={color} stroke={stroke} strokeWidth="1" />
    case 2:
      return <path d="M16 36 C12 12 52 12 48 36 C47 26 44 20 32 19 C20 20 17 26 16 36 Z" fill={color} stroke={stroke} strokeWidth="1" />
    default:
      return <path d="M18 26 C17 14 30 10 40 14 C46 16 48 22 46 27 C42 20 30 22 18 26 Z" fill={color} stroke={stroke} strokeWidth="1" />
  }
}

function Eyes({ expression, color }: { expression: Expression; color: string }) {
  if (expression === 'dead') {
    const x = (cx: number) => (
      <g key={cx} stroke={color} strokeWidth="1.8" strokeLinecap="round">
        <line x1={cx - 2.5} y1="27.5" x2={cx + 2.5} y2="32.5" />
        <line x1={cx + 2.5} y1="27.5" x2={cx - 2.5} y2="32.5" />
      </g>
    )
    return <>{[26, 38].map(x)}</>
  }
  if (expression === 'unconscious') {
    return (
      <g stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M23 30 q3 2 6 0" />
        <path d="M35 30 q3 2 6 0" />
      </g>
    )
  }
  const r = expression === 'distressed' ? 2.6 : 2
  return (
    <g fill={color}>
      <circle cx="26" cy="30" r={r} />
      <circle cx="38" cy="30" r={r} />
    </g>
  )
}

const BROWS: Partial<Record<Expression, string>> = {
  calm: 'M22 25 q4 -2 8 0 M34 25 q4 -2 8 0',
  worried: 'M22 25 l8 -2 M34 23 l8 2',
  distressed: 'M22 26 l8 -4 M34 22 l8 4',
}

function Brows({ expression, color }: { expression: Expression; color: string }) {
  const d = BROWS[expression]
  return d ? <path d={d} stroke={color} strokeWidth="1.6" strokeLinecap="round" fill="none" /> : null
}

const MOUTHS: Record<Expression, string> = {
  calm: 'M27 38 q5 4 10 0',
  worried: 'M28 39 q4 -1 8 0',
  distressed: 'M27 40 q5 -5 10 0 q-5 2 -10 0 Z',
  unconscious: 'M30 39 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0',
  dead: 'M28 39 h8',
}

function Mouth({ expression, color }: { expression: Expression; color: string }) {
  const filled = expression === 'distressed' || expression === 'unconscious'
  return (
    <path
      d={MOUTHS[expression]}
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      fill={filled ? '#000' : 'none'}
    />
  )
}
