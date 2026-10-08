// A whole heist driven by the autopilot, for balance checks: the tests use
// it to prove careful play extracts, the art lab charts the trace with it.
// No chrome and no repairs, so it shows the raw economy.

import { PHYS, HEIST } from './config.js'
import { Level } from './level.js'
import { Bot } from './bot.js'
import { createPlayer, stepPlayer } from './player.js'
import { HeistState, heistOptions } from './heist.js'

// careful: the autopilot steers around lasers and drone scans; otherwise it
// runs the course as if they weren't there. every: seconds between samples.
export function simulateHeist(seed, { careful = true, every = 0.25, maxTime = 600 } = {}) {
  const level = new Level(seed, heistOptions())
  level.ensure(HEIST.SECTORS * HEIST.SECTOR_LEN + 120)
  const net = new HeistState(seed)
  const bot = new Bot(level, { heist: careful })
  let p = createPlayer(0, level.roofAt(0))
  const events = []
  const samples = [], marks = []
  const sectors = [0, ...level.checkpoints.map((c) => c.x), level.finish.x]
  let t = 0, nextSample = 0, falls = 0
  while (p.x < level.finish.x && t < maxTime) {
    events.length = 0
    stepPlayer(p, bot.input(p), PHYS.FIXED_DT, level, events)
    net.step(PHYS.FIXED_DT, p, level, events)
    t += PHYS.FIXED_DT
    for (const e of events) {
      net.move(e.type)
      if (e.type === 'zap' || e.type === 'spotted' || e.type === 'traced' || e.type === 'takedown') marks.push({ type: e.type, x: p.x, t })
    }
    if (net.sector < level.checkpoints.length && p.x >= level.checkpoints[net.sector].x) net.advance()
    if (!p.alive) {
      falls++
      net.hurt()
      const r = level.roofStartBehind(p.x)
      p = createPlayer(r.x, r.y)
      p.speed = PHYS.SPEED_MIN
    }
    level.prune(p.x - 90)
    if (t >= nextSample) {
      samples.push({ x: p.x, t, trace: Math.min(1, net.trace), speed: p.speed })
      nextSample += every
    }
  }
  net.dispose()
  return {
    seed, careful, time: t, falls, sectors, samples, marks,
    stats: { ...net.stats }, integrity: net.integrity, maxIntegrity: net.maxIntegrity,
    extracted: p.x >= level.finish.x && net.integrity > 0,
  }
}
