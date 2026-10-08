import { useEffect, useRef } from 'react'
import type { VitalStatus } from '../core/vitals'

const STATUS_COLOR: Record<VitalStatus, string> = {
  normal: '#7be3a5',
  warning: '#ffd27f',
  critical: '#ff7a7a',
}

/** Trend line of the last 24 game hours. */
export function Sparkline({ values, status, width = 96, height = 22 }: { values: number[]; status: VitalStatus; width?: number; height?: number }) {
  if (values.length < 2) return <svg className="chart" width={width} height={height} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(' ')
  return (
    <svg className="chart" width={width} height={height}>
      <polyline points={points} fill="none" stroke={STATUS_COLOR[status]} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

/** PQRST-ish shape for one heartbeat, phase 0..1. */
function beat(p: number): number {
  if (p < 0.08) return Math.sin((p / 0.08) * Math.PI) * 0.12
  if (p < 0.16) return 0
  if (p < 0.18) return -0.15
  if (p < 0.21) return 1
  if (p < 0.24) return -0.3
  if (p < 0.36) return 0
  if (p < 0.5) return Math.sin(((p - 0.36) / 0.14) * Math.PI) * 0.22
  return 0
}

/** Scrolling ECG trace in real time at the given heart rate. Flatlines at 0 bpm. */
export function EcgTrace({ hr, status, width = 96, height = 22 }: { hr: number; status: VitalStatus; width?: number; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const hrRef = useRef(hr)
  const colorRef = useRef(STATUS_COLOR[status])
  useEffect(() => {
    hrRef.current = hr
    colorRef.current = hr > 0 ? STATUS_COLOR[status] : '#5a6577'
  }, [hr, status])

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.canvas.width = width * dpr
    ctx.canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    const samples = new Array<number>(width).fill(0)
    const pxPerSecond = 40
    let phase = 0
    let carry = 0
    let last = performance.now()
    let raf = 0

    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      carry += dt * pxPerSecond
      while (carry >= 1) {
        carry -= 1
        phase += hrRef.current / 60 / pxPerSecond
        samples.push(hrRef.current > 0 ? beat(phase % 1) : 0)
        samples.shift()
      }
      ctx.clearRect(0, 0, width, height)
      ctx.strokeStyle = colorRef.current
      ctx.lineWidth = 1.5
      ctx.beginPath()
      samples.forEach((v, x) => {
        const y = height * 0.65 - v * height * 0.55
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [width, height])

  return <canvas ref={canvas} className="chart" style={{ width, height }} />
}

/** Speech activity bars. Animate while speaking, flat otherwise. */
export function Soundwave({ active }: { active: boolean }) {
  return (
    <span className={`soundwave${active ? ' is-active' : ''}`} aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className="soundwave__bar" style={{ animationDelay: `${(i * 97) % 400}ms` }} />
      ))}
    </span>
  )
}
