import type { Expression } from '../core/vitals'

interface Props {
  expression: Expression
  skin: string
  hair: string
  hairStyle: number
  suit: string
  size?: number
}

/**
 * Procedural face. Placeholder for per-character sprite sheets:
 * in Unity each Expression maps to one sprite.
 */
export function Avatar({ expression, skin, hair, hairStyle, suit, size = 64 }: Props) {
  return (
    <svg className={`avatar avatar--${expression}`} width={size} height={size} viewBox="0 0 64 64" aria-label={expression}>
      <rect width="64" height="64" rx="8" fill="#0d1a2e" />
      <path d="M10 64 C12 50 22 46 32 46 C42 46 52 50 54 64 Z" fill={suit} />
      <path d="M26 46 L32 52 L38 46" fill="none" stroke="#0d1a2e" strokeWidth="2" />
      <ellipse cx="32" cy="30" rx="14" ry="16" fill={skin} />
      <Hair style={hairStyle} color={hair} />
      <Eyes expression={expression} />
      <Brows expression={expression} />
      <Mouth expression={expression} />
      {expression === 'distressed' && <path d="M47 24 q2 4 0 6 q-2 -2 0 -6 Z" fill="#7fd4ff" />}
    </svg>
  )
}

function Hair({ style, color }: { style: number; color: string }) {
  switch (style % 4) {
    case 0:
      return <path d="M17 28 C16 12 48 12 47 28 C44 20 38 17 32 18 C26 17 20 20 17 28 Z" fill={color} />
    case 1:
      return <path d="M18 24 C18 13 46 13 46 24 L46 21 C40 17 24 17 18 21 Z" fill={color} />
    case 2:
      return <path d="M16 36 C12 12 52 12 48 36 C47 26 44 20 32 19 C20 20 17 26 16 36 Z" fill={color} />
    default:
      return <path d="M18 26 C17 14 30 10 40 14 C46 16 48 22 46 27 C42 20 30 22 18 26 Z" fill={color} />
  }
}

function Eyes({ expression }: { expression: Expression }) {
  if (expression === 'dead') {
    const x = (cx: number) => (
      <g key={cx} stroke="#1a1a1a" strokeWidth="1.8" strokeLinecap="round">
        <line x1={cx - 2.5} y1="27.5" x2={cx + 2.5} y2="32.5" />
        <line x1={cx + 2.5} y1="27.5" x2={cx - 2.5} y2="32.5" />
      </g>
    )
    return <>{[26, 38].map(x)}</>
  }
  if (expression === 'unconscious') {
    return (
      <g stroke="#1a1a1a" strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M23 30 q3 2 6 0" />
        <path d="M35 30 q3 2 6 0" />
      </g>
    )
  }
  const r = expression === 'distressed' ? 2.6 : 2
  return (
    <g fill="#1a1a1a">
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

function Brows({ expression }: { expression: Expression }) {
  const d = BROWS[expression]
  return d ? <path d={d} stroke="#1a1a1a" strokeWidth="1.6" strokeLinecap="round" fill="none" /> : null
}

const MOUTHS: Record<Expression, string> = {
  calm: 'M27 38 q5 4 10 0',
  worried: 'M28 39 q4 -1 8 0',
  distressed: 'M27 40 q5 -5 10 0 q-5 2 -10 0 Z',
  unconscious: 'M30 39 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0',
  dead: 'M28 39 h8',
}

function Mouth({ expression }: { expression: Expression }) {
  const filled = expression === 'distressed' || expression === 'unconscious'
  return (
    <path
      d={MOUTHS[expression]}
      stroke="#1a1a1a"
      strokeWidth="1.6"
      strokeLinecap="round"
      fill={filled ? '#3a1414' : 'none'}
    />
  )
}
