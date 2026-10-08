import { describe, expect, it } from 'vitest'
import { RoofWater } from '../src/pixel/water.js'

describe('wet roof contact', () => {
  it('only splashes on a wet roof', () => {
    const water = new RoofWater()
    water.splash(10, 4, 12, 0)
    expect(water.drops).toHaveLength(0)
    expect(water.ripples).toHaveLength(0)
    water.splash(10, 4, 12, 0.8)
    expect(water.drops.length).toBeGreaterThan(0)
    expect(water.ripples).toHaveLength(1)
  })

  it('makes a landing splash larger than a footstep', () => {
    const step = new RoofWater(), land = new RoofWater()
    step.splash(0, 0, 12, 1)
    land.splash(0, 0, 12, 1, 18)
    expect(land.drops.length).toBeGreaterThan(step.drops.length)
    expect(land.ripples[0].strength).toBeGreaterThan(step.ripples[0].strength)
  })

  it('freezes when paused and clears droplets when they hit the roof', () => {
    const water = new RoofWater()
    water.splash(0, 5, 12, 1, 18)
    const snapshot = JSON.stringify(water)
    water.update(0)
    expect(JSON.stringify(water)).toBe(snapshot)
    for (let i = 0; i < 60; i++) water.update(1 / 60)
    expect(water.drops).toHaveLength(0)
    expect(water.ripples).toHaveLength(0)
  })
})
