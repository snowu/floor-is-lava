import { describe, expect, it } from 'vitest'
import { bakePipeLayers, pipeFrame } from '../src/pixel/obstacles.js'
import { paletteAt, pinPalette, ACCENT } from '../src/pixel/palette.js'
import { pack } from '../src/pixel/pixels.js'

describe.each([2, 3])('%i-pipe bank layering', (count) => {
  const w = count === 3 ? 38 : 28, h = 6, drop = 14, seed = 123
  pinPalette(1)
  const pal = paletteAt(0)
  pinPalette(null)
  const f = pipeFrame('beam', w, h, drop, seed, { count })
  const { back, front } = bakePipeLayers('beam', w, h, drop, pal, seed, { count })
  // from the outer edge of the first pipe to the outer edge of the last
  const span = (count - 1) * f.bankW / count + 2 * f.r

  it('occludes the runner below the overhead beam, down to the riser feet', () => {
    // The previous crop only covered the beam's top strip, leaving the
    // sliding runner painted over every upright pipe.
    for (const y of [f.oy + h + 3, f.H - 4]) {
      const pixels = front.data.slice(y * front.w, (y + 1) * front.w)
      expect([...pixels].filter((c) => c >>> 24).length).toBeGreaterThanOrEqual(count * 2)
    }
  })

  it('keeps the AC and fan housings behind the runner', () => {
    const upper = (f.oy - 10) * back.w
    expect([...back.data.slice(0, upper)].some((c) => c >>> 24)).toBe(true)
    expect([...front.data.slice(0, upper)].every((c) => !(c >>> 24))).toBe(true)
  })

  it('marks the head-height band with one unbroken red edge in front of the runner', () => {
    // the run you slide under is end-on, so the strap is what says "duck"
    const red = pack(ACCENT)
    const rows = []
    for (let y = 0; y < front.h; y++) {
      let run = 0, best = 0
      for (let x = 0; x < front.w; x++) { run = front.data[y * front.w + x] === red ? run + 1 : 0; best = Math.max(best, run) }
      if (best >= span) rows.push(y)
    }
    expect(rows.length).toBeGreaterThan(0)
    // within the collision band's reach, not down at the riser feet
    expect(Math.abs(rows[0] - (f.oy + h))).toBeLessThanOrEqual(4)
  })

  it('keeps the master look behind the legacy option', () => {
    const legacy = bakePipeLayers('beam', w, h, drop, pal, seed, { count, legacy: true }).front
    const red = pack(ACCENT)
    for (let y = 0; y < legacy.h; y++) {
      let run = 0, best = 0
      for (let x = 0; x < legacy.w; x++) { run = legacy.data[y * legacy.w + x] === red ? run + 1 : 0; best = Math.max(best, run) }
      expect(best).toBeLessThan(span)
    }
  })

  it('does not add a dark seam where the pipe crosses the runner plane', () => {
    for (let i = 0; i < front.data.length; i++) {
      if (front.data[i] >>> 24) expect(front.data[i]).toBe(back.data[i])
    }
  })
})
