// mulberry32 — small, fast, deterministic
export function createRng(seed) {
  let state = (seed >>> 0) || 0x9e3779b9
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  next.range = (min, max) => min + next() * (max - min)
  next.int = (min, max) => Math.floor(min + next() * (max - min + 1))
  next.pick = (list) => list[Math.floor(next() * list.length)]
  next.chance = (p) => next() < p
  next.weighted = (entries) => {
    let total = 0
    for (const [, w] of entries) total += Math.max(0, w)
    let r = next() * total
    for (const [value, w] of entries) {
      r -= Math.max(0, w)
      if (r <= 0) return value
    }
    return entries[entries.length - 1][0]
  }
  return next
}
