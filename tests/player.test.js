import { describe, it, expect } from 'vitest'
import { createPlayer, stepPlayer, predictLanding } from '../src/sim/player.js'
import { PHYS, WORLD } from '../src/sim/config.js'

const NONE = { jump: false, jumpPressed: false, down: false, downPressed: false }

// A tiny hand-built world: roofs and obstacles as raw solids.
function world(solids, extra = {}) {
  solids = solids.map((s, i) => ({ id: i + 1, kind: 'roof', y0: -70, ...s }))
  return {
    solidsIn: () => solids,
    wallrunsIn: () => extra.wallruns ?? [],
    ziplinesIn: () => extra.ziplines ?? [],
    padsIn: () => extra.pads ?? [],
    fencesIn: () => extra.fences ?? [],
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

  describe('landing slide', () => {
    const flat = () => world([{ x0: -10, x1: 1000, y1: 0 }])
    const hop = (downAt) => (p, i) => {
      if (i === 10) return { ...NONE, jump: true, jumpPressed: true }
      if (i === downAt) return { ...NONE, down: true, downPressed: true }
      return NONE
    }
    // the step on which a plain hop touches down
    const touchdown = (() => {
      const p = createPlayer(0, 0)
      const level = flat()
      for (let i = 0; i < 400; i++) {
        const events = []
        stepPlayer(p, hop(-1)(p, i), PHYS.FIXED_DT, level, events)
        if (events.some((e) => e.type === 'land')) return i
      }
      return -1
    })()
    const step = (s) => Math.round(s / PHYS.FIXED_DT)

    const landing = (at, speed) => {
      const p = createPlayer(0, 0)
      p.speed = speed
      const events = []
      const level = flat()
      let before = 0, after = 0
      for (let i = 0; i < step(1.5); i++) {
        if (i === Math.min(at, touchdown) - 1) before = p.speed
        const n = events.length
        stepPlayer(p, hop(at)(p, i), PHYS.FIXED_DT, level, events)
        if (events.slice(n).some((e) => e.type === 'slide' || e.type === 'landslide')) after = p.speed
      }
      return { types: events.map((e) => e.type), before, after }
    }

    it('boosts a perfectly timed landing slide at high speed', () => {
      expect(touchdown).toBeGreaterThan(10)
      for (const at of [touchdown - 1, touchdown, touchdown + 1]) {
        const r = landing(at, PHYS.SPEED_MAX - 1)
        expect(r.types).toContain('landslide')
        expect(r.after).toBeGreaterThan(r.before)
      }
    })

    it('is a plain slide that holds your speed when sloppy or slow', () => {
      const sloppy = landing(touchdown - step(PHYS.LANDSLIDE_PRE) + 1, PHYS.SPEED_MAX - 1)
      expect(sloppy.types).not.toContain('landslide')
      expect(sloppy.types).toContain('slide')
      const slow = landing(touchdown - 2, PHYS.SPEED_MIN)
      expect(slow.types).not.toContain('landslide')
      for (const r of [sloppy, slow]) expect(Math.abs(r.after - r.before)).toBeLessThan(0.05)
    })

    it('continues the chain only out of a landing slide', () => {
      // jump out of a perfect landing slide: a slide jump
      const p = createPlayer(0, 0)
      p.speed = PHYS.SPEED_MAX - 1
      const events = []
      for (let i = 0; i < step(1.2); i++) {
        const input = i === touchdown + 12 ? { ...NONE, jump: true, jumpPressed: true } : hop(touchdown)(p, i)
        stepPlayer(p, input, PHYS.FIXED_DT, flat(), events)
      }
      const types = events.map((e) => e.type)
      expect(types).toContain('landslide')
      expect(types).toContain('slidejump')
      // out of a plain slide pressed on flat roof, it's an ordinary jump
      const q = createPlayer(0, 0)
      q.speed = 12
      const plain = run(q, flat(), 1, (_, i) => (i === 5 ? { ...NONE, down: true, downPressed: true } : i === 30 ? { ...NONE, jump: true, jumpPressed: true } : NONE))
      expect(plain).toContain('slide')
      expect(plain).not.toContain('slidejump')
      expect(plain).toContain('jump')
    })

    it('holds speed through a whole slide', () => {
      const p = createPlayer(0, 0)
      p.speed = 12
      run(p, flat(), 0.5, (q, i) => (i === 1 ? { ...NONE, down: true, downPressed: true } : NONE))
      expect(p.state).toBe('slide')
      expect(p.speed).toBeCloseTo(12, 1)
    })

    it('does nothing when the press is far too early, and is a plain slide when late', () => {
      const early = run(createPlayer(0, 0), flat(), 1.5, hop(touchdown - step(PHYS.LANDSLIDE_PRE) - 3))
      expect(early).not.toContain('landslide')
      expect(early).not.toContain('slide')
      const late = run(createPlayer(0, 0), flat(), 1.5, hop(touchdown + step(PHYS.LANDSLIDE_POST) + 3))
      expect(late).not.toContain('landslide')
      expect(late).toContain('slide')
    })

    it('predicts the touchdown the cue shows', () => {
      const p = createPlayer(0, 0)
      const level = flat()
      for (let i = 0; i <= 20; i++) stepPlayer(p, hop(-1)(p, i), PHYS.FIXED_DT, level, [])
      while (p.vy > 0) stepPlayer(p, NONE, PHYS.FIXED_DT, level, [])
      const hit = predictLanding(p, level)
      let steps = 0
      const events = []
      while (!events.some((e) => e.type === 'land')) { stepPlayer(p, NONE, PHYS.FIXED_DT, level, events); steps++ }
      expect(hit.hard).toBe(false)
      expect(Math.round(hit.t / PHYS.FIXED_DT) + 1).toBe(steps)
      expect(hit.x).toBeCloseTo(p.x, 3)
    })

    it('keeps the roll for hard landings', () => {
      const drop = world([{ x0: -10, x1: 3, y1: 12 }, { x0: 3, x1: 1000, y1: 0 }])
      const p = createPlayer(0, 12)
      const events = run(p, drop, 3, (q) => (q.state === 'air' && q.vy < -12 ? { ...NONE, down: true, downPressed: true } : NONE))
      expect(events).toContain('roll')
      expect(events).not.toContain('landslide')
    })
  })

  describe('jump pads', () => {
    // a roof ending at x=10 with a pad at its edge, then a tall wall at x=12.5
    const pad = { x0: 8.5, x1: 9.9, y: 0, wallX: 12.5, top: 4.4 }
    const level = () => world([{ x0: -10, x1: 10, y1: 0 }, { x0: 12.5, x1: 1000, y1: 4.4 }], { pads: [pad] })
    const tapAt = (x) => {
      let done = false
      return (p) => {
        if (!done && p.x >= x && p.state === 'run') { done = true; return { ...NONE, jump: true, jumpPressed: true } }
        return p.state === 'air' || p.state === 'climb' ? { ...NONE, jump: true } : NONE
      }
    }

    it('clears a tall wall when you jump on the pad', () => {
      for (const speed of [PHYS.SPEED_MIN, PHYS.SPEED_MAX]) {
        const p = createPlayer(4, 0)
        p.speed = speed
        const events = run(p, level(), 2, tapAt(8.6))
        expect(events).toContain('padjump')
        expect(events).not.toContain('grab')
        expect(events).not.toContain('climb')
        expect(p.y).toBeCloseTo(4.4, 2)
        expect(p.speed).toBeGreaterThanOrEqual(speed)
      }
    })

    it('leaves you to grab the ledge when you jump before the pad', () => {
      const p = createPlayer(4, 0)
      p.speed = PHYS.SPEED_MAX
      const events = run(p, level(), 2, tapAt(7.5))
      expect(events).not.toContain('padjump')
      expect(events.some((e) => e === 'grab' || e === 'climb')).toBe(true)
    })
  })

  describe('electrified fences', () => {
    const fence = { id: 'f', x0: 8, x1: 9.5, y0: 0, y1: 1 }
    const level = () => world([{ x0: -10, x1: 1000, y1: 0 }], { fences: [fence] })

    it('shocks you once if you run into it', () => {
      const p = createPlayer(0, 0)
      p.speed = 12
      const events = run(p, level(), 2)
      expect(events.filter((e) => e === 'shock')).toHaveLength(1)
      expect(events).toContain('shock')
      expect(p.x).toBeGreaterThan(9.5)
    })

    it('needs a full, well-timed jump at real height', () => {
      const tall = { id: 't', x0: 19.7, x1: 20.3, y0: 0, y1: WORLD.FENCE_H }
      const lvl = world([{ x0: -10, x1: 1000, y1: 0 }], { fences: [tall] })
      const attempt = (at, hold) => {
        const p = createPlayer(0, 0)
        p.speed = 13.5
        let jumped = false
        return run(p, lvl, 2.5, (q) => {
          if (!jumped && q.x >= at && q.state === 'run') { jumped = true; return { ...NONE, jump: true, jumpPressed: true } }
          return jumped && hold && q.state === 'air' ? { ...NONE, jump: true } : NONE
        })
      }
      const clean = [...Array(80).keys()].map((i) => 12 + i * 0.1).filter((at) => !attempt(at, true).includes('shock'))
      expect(clean.length).toBeGreaterThan(0)
      const window = (clean.at(-1) - clean[0]) / 13.5
      expect(window).toBeGreaterThan(0.1)
      expect(window).toBeLessThan(0.3)
      expect(attempt(clean[Math.floor(clean.length / 2)], false)).toContain('shock')
    })

    it('lets you through if you jump it', () => {
      const p = createPlayer(0, 0)
      p.speed = 12
      let jumped = false
      const events = run(p, level(), 2, (q) => {
        if (!jumped && q.x > 5.8) { jumped = true; return { ...NONE, jump: true, jumpPressed: true } }
        return q.state === 'air' ? { ...NONE, jump: true } : NONE
      })
      expect(events).not.toContain('shock')
    })
  })
})

