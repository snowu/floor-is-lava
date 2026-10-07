import { describe, it, expect } from 'vitest'
import { CourseGenerator, maxGap, jumpApex } from '../src/sim/generator.js'
import { WORLD, PHYS } from '../src/sim/config.js'

function chunks(seed, count) {
  const gen = new CourseGenerator(seed)
  return Array.from({ length: count }, () => gen.next())
}

describe('course generator', () => {
  it('is deterministic per seed', () => {
    expect(JSON.stringify(chunks(42, 40))).toEqual(JSON.stringify(chunks(42, 40)))
    expect(JSON.stringify(chunks(42, 10))).not.toEqual(JSON.stringify(chunks(43, 10)))
  })

  it('chains buildings left to right with roofs in bounds', () => {
    for (const seed of [1, 7, 99, 1234]) {
      const list = chunks(seed, 120)
      for (let i = 0; i < list.length; i++) {
        const c = list[i]
        expect(c.x1).toBeGreaterThan(c.x0)
        expect(c.roof).toBeGreaterThanOrEqual(WORLD.ROOF_MIN)
        expect(c.roof).toBeLessThanOrEqual(WORLD.ROOF_MAX)
        if (i > 0) {
          expect(c.x0).toBeCloseTo(list[i - 1].xEnd, 5)
          expect(c.roof).toBeCloseTo(list[i - 1].gap.nextRoof, 5)
        }
      }
    }
  })

  it('keeps plain jump gaps inside physical reach at minimum speed', () => {
    for (const seed of [3, 5, 8]) {
      for (const c of chunks(seed, 150)) {
        if (c.gap.type !== 'jump') continue
        expect(c.gap.dh).toBeLessThan(jumpApex() - 0.3)
        expect(c.gap.width).toBeLessThanOrEqual(maxGap(c.gap.dh, PHYS.SPEED_MIN) * 0.81 + 0.01)
      }
    }
  })

  it('places rooftop obstacles on the roof, apart, and clear of the edge', () => {
    for (const seed of [11, 12, 13]) {
      for (const c of chunks(seed, 120)) {
        const obstacles = c.solids.filter((s) => s.kind === 'block' || s.kind === 'beam').sort((a, b) => a.x0 - b.x0)
        for (let i = 0; i < obstacles.length; i++) {
          const o = obstacles[i]
          expect(o.x0).toBeGreaterThanOrEqual(c.x0)
          expect(o.x1).toBeLessThanOrEqual(c.gap.runwayStart - 10 + 1e-6)
          if (o.kind === 'block') expect(o.y0).toBeCloseTo(c.roof, 5)
          if (i > 0) expect(o.x0 - obstacles[i - 1].x1).toBeGreaterThan(4)
        }
      }
    }
  })

  it('gives every special gap the feature it needs', () => {
    const seen = new Set()
    for (const c of chunks(21, 200)) {
      seen.add(c.gap.type)
      if (c.gap.type === 'wallrun') expect(c.wallruns).toHaveLength(1)
      if (c.gap.type === 'zip') {
        const [z] = c.ziplines
        expect(z.ay).toBeGreaterThan(z.by)
        expect(z.bx).toBeGreaterThan(c.xEnd)
      }
      if (c.gap.type === 'spring') expect(c.solids.some((s) => s.kind === 'spring')).toBe(true)
    }
    expect([...seen].sort()).toEqual(['climb', 'jump', 'spring', 'wallrun', 'zip'])
  })
})
