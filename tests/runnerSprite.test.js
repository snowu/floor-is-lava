import { describe, it, expect } from 'vitest'
import { RunnerSprite } from '../src/pixel/runner.js'
import { paletteAt } from '../src/pixel/palette.js'

const STATES = ['run', 'air', 'slide', 'roll', 'vault', 'mantle', 'climb', 'wallslide', 'wallrun', 'zip', 'stumble', 'blocked', 'dead']

describe('pixel runner sprite', () => {
  it('stays stable through long frames in every state', () => {
    const r = new RunnerSprite()
    let x = 0
    for (const state of STATES) {
      for (let i = 0; i < 30; i++) {
        x += 1.5
        r.update(0.1, { state, speed: 14, vy: -6, t: i * 0.02, kin: { t: i * 0.01, T: 0.3, mode: 'arc' } }, x * 14, 100, null)
      }
      for (const [jx, jy] of Object.values(r.joints)) {
        expect(Number.isFinite(jx) && Number.isFinite(jy)).toBe(true)
        expect(Math.abs(jx)).toBeLessThan(40)
        expect(Math.abs(jy)).toBeLessThan(40)
      }
    }
  })

  it('rasterizes an outlined figure', () => {
    const r = new RunnerSprite()
    for (let i = 0; i < 20; i++) r.update(1 / 60, { state: 'run', speed: 12, vy: 0, t: 0 }, i * 3, 100, null)
    const buf = r.raster()
    const opaque = buf.data.filter((c) => c >>> 24).length
    expect(opaque).toBeGreaterThan(120)
    expect(opaque).toBeLessThan(900)
  })
})

describe('pixel palettes', () => {
  it('quantize blends into stable versions', () => {
    expect(paletteAt(100).version).toBe(paletteAt(200).version)
    expect(paletteAt(1400).version).not.toBe(paletteAt(100).version)
    for (const d of [0, 1300, 1450, 3000, 6000, 9000]) expect(paletteAt(d).sky.length).toBeGreaterThan(3)
  })
})
