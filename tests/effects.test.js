import { describe, expect, it } from 'vitest'
import { bakeLightHalo, ParkourFX } from '../src/pixel/effects.js'

describe('decorative city effects', () => {
  it('keeps light local, transparent at its border and strongest at the source', () => {
    const halo = bakeLightHalo(40, 20, [90, 220, 255])
    expect(halo.get(0, 0)).toBe(0)
    expect(halo.get(20, 10) >>> 24).toBeGreaterThan(halo.get(8, 10) >>> 24)
    expect(halo.get(20, 10) >>> 24).toBeLessThan(170)
  })

  it('reserves movement bursts for launches, pickups and perfect landings', () => {
    const fx = new ParkourFX(), p = { x: 0, y: 0, speed: 12, state: 'run' }
    fx.event('land', p); fx.event('landslide', p, { quality: 0.6 }); fx.update(1, p, 0, 0)
    expect(fx.pulses).toHaveLength(0); expect(fx.sparks).toHaveLength(0)
    fx.event('landslide', p, { quality: 1 })
    expect(fx.pulses).toHaveLength(1)
    const before = JSON.stringify(fx)
    fx.update(0, p, 0, 0)
    expect(JSON.stringify(fx)).toBe(before)
    fx.update(0.4, p, 0, 0)
    expect(fx.pulses).toHaveLength(0)
  })

  it('bounds sustained slide sparks and clears them when movement stops', () => {
    const fx = new ParkourFX(), p = { state: 'slide', speed: 15 }
    for (let i = 0; i < 600; i++) fx.update(1 / 60, p, i / 10, 0)
    expect(fx.sparks.length).toBeGreaterThan(0)
    expect(fx.sparks.length).toBeLessThanOrEqual(24)
    fx.update(0.5, { ...p, state: 'run' }, 60, 0)
    expect(fx.sparks).toHaveLength(0)
  })
})
