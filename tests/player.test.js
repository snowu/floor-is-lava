import { describe, it, expect } from 'vitest'
import { createPlayer, stepPlayer } from '../src/sim/player.js'
import { PHYS } from '../src/sim/config.js'

const NONE = { jump: false, jumpPressed: false, down: false, downPressed: false }

// A tiny hand-built world: roofs and obstacles as raw solids.
function world(solids, extra = {}) {
  solids = solids.map((s, i) => ({ id: i + 1, kind: 'roof', y0: -70, ...s }))
  return {
    solidsIn: () => solids,
    wallrunsIn: () => extra.wallruns ?? [],
    ziplinesIn: () => extra.ziplines ?? [],
    killY: () => -20,
    roofAt: () => 0,
    lowestRoofAhead: () => -5,
  }
}

function run(p, level, seconds, inputFn = () => NONE) {
  const events = []
  const steps = Math.round(seconds / PHYS.FIXED_DT)
  for (let i = 0; i < steps; i++) stepPlayer(p, inputFn(p, i), PHYS.FIXED_DT, level, events)
  return events.map((e) => e.type)
}

const press = (n) => (p, i) => (i === n ? { ...NONE, jump: true, jumpPressed: true } : i > n ? { ...NONE, jump: true } : NONE)

describe('player physics', () => {
  it('auto-runs and builds speed toward the cap', () => {
    const p = createPlayer(0, 0)
    run(p, world([{ x0: -10, x1: 1000, y1: 0 }]), 6)
    expect(p.state).toBe('run')
    expect(p.speed).toBeGreaterThan(PHYS.SPEED_MIN)
    expect(p.speed).toBeLessThanOrEqual(PHYS.SPEED_MAX)
  })

  it('jumps higher when the button is held', () => {
    const flat = world([{ x0: -10, x1: 1000, y1: 0 }])
    const apex = (inputFn) => {
      const p = createPlayer(0, 0)
      let top = 0
      run(p, flat, 1.2, (q, i) => { top = Math.max(top, q.y); return inputFn(q, i) })
      return top
    }
    const tap = apex((p, i) => (i === 0 ? { ...NONE, jump: true, jumpPressed: true } : NONE))
    const held = apex(press(0))
    expect(held).toBeGreaterThan(tap + 0.5)
  })

  it('falls to its death off an edge', () => {
    const p = createPlayer(0, 0)
    const events = run(p, world([{ x0: -10, x1: 5, y1: 0 }]), 3)
    expect(events).toContain('dead')
    expect(p.alive).toBe(false)
  })

  it('vaults low obstacles when jump is pressed on approach', () => {
    const p = createPlayer(0, 0)
    p.speed = 12
    const level = world([{ x0: -10, x1: 1000, y1: 0 }, { kind: 'block', x0: 6, x1: 7, y0: 0, y1: 1 }])
    // pressed ~1m out: inside the vault window, so it's a vault rather than a hop
    const events = run(p, level, 1.5, (q, i) => (q.x > 4.4 && q.x < 4.6 ? { ...NONE, jump: true, jumpPressed: true } : NONE))
    expect(events).toContain('vault')
    expect(events).not.toContain('jump')
    expect(p.x).toBeGreaterThan(15)
    expect(p.speed).toBeGreaterThanOrEqual(12)
  })

  it('trips over low obstacles run into without a jump', () => {
    const p = createPlayer(0, 0)
    p.speed = 12
    const events = run(p, world([{ x0: -10, x1: 1000, y1: 0 }, { kind: 'block', x0: 6, x1: 7, y0: 0, y1: 1 }]), 1.5)
    expect(events).toContain('trip')
    expect(events).not.toContain('vault')
    expect(p.x).toBeGreaterThan(8)
    expect(p.speed).toBeLessThan(12)
  })

  it('is stopped by chest-high crates unless it jumps', () => {
    const p = createPlayer(0, 0)
    p.speed = 12
    const crate = { kind: 'block', x0: 6, x1: 7, y0: 0, y1: 1.8 }
    expect(run(p, world([{ x0: -10, x1: 1000, y1: 0 }, crate]), 1)).toContain('bonk')
    expect(p.state).toBe('blocked')
  })

  it('stumbles into an overhead beam unless sliding', () => {
    const beam = { kind: 'beam', x0: 8, x1: 9, y0: 1.1, y1: 1.5 }
    const floor = { x0: -10, x1: 1000, y1: 0 }
    const standing = createPlayer(0, 0)
    standing.speed = 12
    expect(run(standing, world([floor, beam]), 1.5)).toContain('bonk')

    const sliding = createPlayer(0, 0)
    sliding.speed = 12
    const events = run(sliding, world([floor, beam]), 1.5, (p, i) => (i === 30 ? { ...NONE, down: true, downPressed: true } : NONE))
    expect(events).toContain('slide')
    expect(events).not.toContain('bonk')
    expect(sliding.speed).toBeGreaterThan(9)
  })

  it('rolls out of a big drop when down is timed, stumbles otherwise', () => {
    const level = world([{ x0: -10, x1: 2, y1: 8 }, { x0: 2, x1: 1000, y1: 0 }])
    const roll = createPlayer(0, 8)
    roll.speed = 12
    const rollEvents = run(roll, level, 2, (p) => (p.state === 'air' && p.y < 2.5 && p.vy < 0 ? { ...NONE, down: true, downPressed: true } : NONE))
    expect(rollEvents).toContain('roll')
    expect(roll.speed).toBeGreaterThan(12)

    const flop = createPlayer(0, 8)
    flop.speed = 12
    expect(run(flop, level, 1)).toContain('hardland')
    expect(flop.speed).toBeLessThan(PHYS.SPEED_MIN)
  })

  it('grabs a ledge and mantles onto a taller roof', () => {
    const p = createPlayer(0, 0)
    p.speed = 10
    const level = world([{ x0: -10, x1: 6, y1: 0 }, { x0: 8, x1: 1000, y1: 3.5 }])
    const events = run(p, level, 2.5, press(Math.round(0.45 / PHYS.FIXED_DT)))
    expect(events).toContain('grab')
    expect(p.y).toBeCloseTo(3.5, 3)
    expect(p.alive).toBe(true)
  })

  it('climbs a wall too tall to jump onto', () => {
    const p = createPlayer(0, 0)
    p.speed = 10
    const level = world([{ x0: -10, x1: 1000, y1: 0 }, { kind: 'block', x0: 6, x1: 20, y0: 0, y1: 4.8 }])
    const events = run(p, level, 2.5, (q) => (q.state === 'blocked' ? { ...NONE, jump: true, jumpPressed: true } : { ...NONE, jump: true }))
    expect(events).toContain('climb')
    expect(events).toContain('grab')
    expect(p.y).toBeCloseTo(4.8, 3)
  })

  it('wall-runs across a panel and can kick off it', () => {
    const p = createPlayer(0, 0)
    p.speed = 10
    const panel = { id: 'w', x0: 3, x1: 18, y0: 0.3, y1: 4.5 }
    const level = world([{ x0: -10, x1: 4, y1: 0 }, { x0: 16, x1: 1000, y1: 0 }], { wallruns: [panel] })
    const events = run(p, level, 3, (q, i) => (i === 40 ? { ...NONE, jump: true, jumpPressed: true } : NONE))
    expect(events).toContain('wallrun')
    expect(p.alive).toBe(true)
    expect(p.x).toBeGreaterThan(20)
  })

  it('rides a zipline down across a wide gap', () => {
    const p = createPlayer(0, 10)
    p.speed = 10
    const zip = { id: 'z', ax: 4, ay: 13.4, bx: 34, by: 2.6 }
    const level = world([{ x0: -10, x1: 5, y1: 10 }, { x0: 30, x1: 1000, y1: 0 }], { ziplines: [zip] })
    const events = run(p, level, 4, press(Math.round(0.4 / PHYS.FIXED_DT)))
    expect(events).toContain('zip')
    expect(p.alive).toBe(true)
    expect(p.x).toBeGreaterThan(36)
  })

  it('launches off springboards', () => {
    const p = createPlayer(0, 0)
    p.speed = 10
    const level = world([{ x0: -10, x1: 1000, y1: 0 }, { kind: 'spring', x0: 5, x1: 6.6, y0: 0, y1: 0.5 }])
    let top = 0
    const events = run(p, level, 1.5, (q) => { top = Math.max(top, q.y); return NONE })
    expect(events).toContain('spring')
    expect(top).toBeGreaterThan(4)
  })
})
