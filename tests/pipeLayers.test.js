import { describe, expect, it } from 'vitest'
import { bakePipeLayers, pipeFrame } from '../src/pixel/obstacles.js'
import { paletteAt, pinPalette } from '../src/pixel/palette.js'

describe.each([2, 3])('%i-pipe bank layering', (count) => {
  const w = count === 3 ? 38 : 28, h = 6, drop = 14, seed = 123
  pinPalette(1)
  const pal = paletteAt(0)
  pinPalette(null)
  const f = pipeFrame('beam', w, h, drop, seed, { count })
  const { back, front } = bakePipeLayers('beam', w, h, drop, pal, seed, { count })

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

  it('does not add a dark seam where the pipe crosses the runner plane', () => {
    for (let i = 0; i < front.data.length; i++) {
      if (front.data[i] >>> 24) expect(front.data[i]).toBe(back.data[i])
    }
  })
})
