// Seeded PRNG (mulberry32). Pure; the whole run replays from one seed.

export type Rng = () => number

export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seedFromString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function randomSeedString(): string {
  const words = ['PETROV', 'ABLE', 'ARCHER', 'GLINT', 'BARENTS', 'NORAD', 'TAPE', 'SVALBARD', 'LOOKING', 'GLASS']
  const w = words[Math.floor(Math.random() * words.length)]
  const n = Math.floor(Math.random() * 9000) + 1000
  return `${w}-${n}`
}
