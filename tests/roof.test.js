import { describe, expect, it } from 'vitest'
import { roofPuddles, roofRainHits, drawRunnerContact, equipmentLight } from '../src/pixel/roof.js'
import { bakeObstacle } from '../src/pixel/obstacles.js'
import { paletteAt } from '../src/pixel/palette.js'
import { ACCENT } from '../src/pixel/palette.js'
import { pack } from '../src/pixel/pixels.js'

describe('roof surface placement', () => {
  it('leaves most ordinary roof sections without a puddle', () => {
    const layouts = Array.from({ length: 100 }, (_, seed) => roofPuddles(seed, 320, 15))
    expect(layouts.filter(q => q.length === 0).length).toBeGreaterThan(50)
    expect(layouts.flat().length).toBeLessThan(60)
  })

  it('connects occasional falling drops to small splashes at the same roof position', () => {
    expect(roofRainHits(5, 480, 15, 10, 0)).toEqual([])
    let visible = 0, falling = 0, splashing = 0
    for (let i = 0; i < 600; i++) {
      const hits = roofRainHits(5, 480, 15, i / 10, 1)
      expect(hits).toEqual(roofRainHits(5, 480, 15, i / 10, 1))
      if (hits.length) visible++
      for (const hit of hits) {
        expect(hit.x).toBeGreaterThanOrEqual(10)
        expect(hit.x).toBeLessThan(470)
        expect(hit.back).toBeGreaterThanOrEqual(3)
        expect(hit.back).toBeLessThanOrEqual(12)
        if (hit.t < 0.18) falling++; else splashing++
      }
    }
    expect(falling).toBeGreaterThan(0)
    expect(splashing).toBeGreaterThan(0)
    expect(visible).toBeLessThan(100)
  })

  it('keeps seeded puddles inside the roof and leaves its front edge clear', () => {
    for (const depth of [8, 10, 15, 16]) for (const width of [20, 80, 320, 720]) for (let seed = 0; seed < 40; seed++) {
      const patches = roofPuddles(seed, width, depth)
      expect(patches).toEqual(roofPuddles(seed, width, depth))
      for (const q of patches) {
        expect(q.x).toBeGreaterThanOrEqual(7)
        expect(q.x + q.w).toBeLessThanOrEqual(width - 7)
        expect(q.back).toBeGreaterThanOrEqual(3)
        expect(q.back + q.h).toBeLessThanOrEqual(depth - 3)
      }
    }
  })

  it('does not project a runner shadow upward onto a roof above her or from a distant fall', () => {
    const ctx = { save() { throw new Error('Should not draw') } }
    const joints = { ankleA: [0, 0], ankleB: [5, 3] }
    drawRunnerContact(ctx, { x: 10, y: 90, floor: 80, joints })
    drawRunnerContact(ctx, { x: 10, y: 20, floor: 80, joints })
  })

  it('tints nearby metal without changing the red interaction markings', () => {
    const pal = paletteAt(0), lights = [{ x: 20, w: 60, color: [90, 220, 255], strength: 1 }]
    expect(equipmentLight(pal, 500, lights)).toBe(pal)
    const lit = equipmentLight(pal, 20, lights)
    expect(lit.light).not.toEqual(pal.light)
    const count = (p) => bakeObstacle('vent', 24, 12, p, 8).data.filter(c => c === pack(ACCENT)).length
    expect(count(pal)).toBeGreaterThan(0)
    expect(count(lit)).toBe(count(pal))
  })
})
