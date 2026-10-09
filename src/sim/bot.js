// A lookahead autopilot built on the real physics. Tests use it to prove
// generated courses are traversable; the title screen uses it as a demo run.

import { PHYS } from './config.js'
import { stepPlayer, clonePlayer, isDoomed, padUnder } from './player.js'
import { HazardProbe } from './heist.js'

const PENALTY_HORIZON = 1.2
const NONE = { jump: false, jumpPressed: false, down: false, downPressed: false }

// Each plan is a list of [ticks, input] spans; after it ends the reflex policy takes over.
const PLANS = [
  [],
  [[1, { jump: true, jumpPressed: true }], [40, { jump: true }]],
  [[1, { jump: true, jumpPressed: true }], [14, { jump: true }]],
  [[1, { jump: true, jumpPressed: true }]],
  [[1, { down: true, downPressed: true }]],
]

function planInput(plan, tick) {
  let t = tick
  for (const [len, input] of plan) {
    if (t < len) return { ...NONE, ...input }
    t -= len
  }
  return null
}

// Cheap instincts used after a plan runs out: roll before hard landings,
// slide under beams, climb walls, hop low obstacles that would stop us.
function landsHard(start, level) {
  const p = clonePlayer(start)
  const events = []
  for (let i = 0; i < 40 && p.state === 'air'; i++) stepPlayer(p, NONE, PHYS.FIXED_DT, level, events)
  return events.some((e) => e.type === 'hardland')
}

function reflex(p, level) {
  if (p.state === 'air' && p.vy < -12) {
    // only for landings that will really be hard; pressing before a soft one
    // would start a slide we don't need
    const roof = level.roofAt(p.x)
    if (roof !== null && p.y - roof < 3.5 && landsHard(p, level)) return { ...NONE, down: true, downPressed: true }
  }
  if (p.state === 'run' && padUnder(p, level)) return { ...NONE, jump: true, jumpPressed: true }
  if (p.state === 'blocked' || p.state === 'wallslide') return { ...NONE, jump: true, jumpPressed: true }
  if (p.state === 'climb' || p.state === 'air') return { ...NONE, jump: true }
  if (p.state === 'run') {
    for (const s of level.solidsIn(p.x, p.x + 2.2)) {
      if (s.kind !== 'beam' || s.x0 <= p.x || s.x0 - p.x >= 1.4 + p.speed * 0.05) continue
      return { ...NONE, down: true, downPressed: true }
    }
  }
  return NONE
}

function simulate(start, plan, level, ticks, dt, heist = false) {
  const p = clonePlayer(start)
  const probe = heist ? new HazardProbe() : null
  let penalty = 0
  let trouble = Infinity
  const events = []
  for (let i = 0; i < ticks; i++) {
    const input = planInput(plan, i) ?? reflex(p, level)
    events.length = 0
    stepPlayer(p, input, dt, level, events)
    // Mistakes far down the horizon can still be fixed by later decisions.
    if (i * dt < PENALTY_HORIZON) {
      for (const e of events) {
        if (e.type === 'hardland' || e.type === 'bonk' || e.type === 'trip' || e.type === 'shock') penalty += 3
        if (e.type === 'clamber') penalty += 0.5
      }
      if (probe) penalty += probe.cost(p, level)
    }
    if (penalty > 0) trouble = Math.min(trouble, i * dt)
    if (isDoomed(p, level)) return { ok: false, x: p.x, penalty, trouble: Math.min(trouble, i * dt) }
  }
  // Surviving while stuck in place is not a plan.
  const ok = p.x - start.x > ticks * dt * 2
  return { ok, x: p.x, penalty, trouble: ok ? trouble : Math.min(trouble, ticks * dt) }
}

function better(a, b) {
  if (a.ok !== b.ok) return a.ok
  if (a.penalty !== b.penalty) return a.penalty < b.penalty
  if (a.trouble !== b.trouble) return a.trouble > b.trouble
  return a.x > b.x
}

export class Bot {
  // heist: also steer clear of laser grids and under-drone scans
  constructor(level, { horizon = 2.2, dt = PHYS.FIXED_DT, decideEvery = 3, heist = false } = {}) {
    this.level = level
    this.heist = heist
    this.dt = dt
    this.ticks = Math.round(horizon / dt)
    this.decideEvery = decideEvery
    this.plan = null
    this.planTick = 0
    this.counter = 0
  }

  input(p) {
    if (this.plan) {
      const input = planInput(this.plan, this.planTick++)
      if (input) return input
      this.plan = null
    }
    if (this.counter++ % this.decideEvery !== 0) return reflex(p, this.level)

    this.level.ensure(p.x + 120)
    const idle = simulate(p, PLANS[0], this.level, this.ticks, this.dt, this.heist)
    const clean = (r) => r.ok && r.penalty === 0
    if (clean(idle)) return reflex(p, this.level)

    // Act at the last moment: if a clean move still exists after a short
    // wait, keep running.
    const wait = this.decideEvery * 2
    for (let i = 1; i < PLANS.length; i++) {
      if (clean(simulate(p, [[wait, {}], ...PLANS[i]], this.level, this.ticks, this.dt, this.heist))) return reflex(p, this.level)
    }

    let best = { result: idle, plan: PLANS[0] }
    for (let i = 1; i < PLANS.length; i++) {
      const result = simulate(p, PLANS[i], this.level, this.ticks, this.dt, this.heist)
      if (better(result, best.result)) best = { result, plan: PLANS[i] }
    }
    if (best.plan === PLANS[0]) return reflex(p, this.level)
    // Nothing clean and trouble still a while off: keep going, the reflexes
    // may get us somewhere a clean move exists.
    if (!clean(best.result) && idle.trouble > 0.5) return reflex(p, this.level)
    this.plan = best.plan
    this.planTick = 0
    return this.input(p)
  }
}
