/**
 * Deterministic PRNG (mulberry32). Same seed -> same universe on web and in Unity,
 * as long as the C# port uses identical uint32 math.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const range = (rand: () => number, min: number, max: number) => min + rand() * (max - min)
export const pick = <T>(rand: () => number, items: readonly T[]): T => items[Math.floor(rand() * items.length)]
