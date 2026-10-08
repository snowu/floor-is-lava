// Medal times from the autopilot: silver is its time on the course (so it is
// provably reachable), gold asks for real flow, bronze is a comfortable finish.
import { Level } from './level.js'
import { Bot } from './bot.js'
import { createPlayer, stepPlayer } from './player.js'
import { PHYS } from './config.js'
import { levelOptions } from './tracks.js'

// Seconds the autopilot takes to finish a trial, or null if it doesn't.
export function autopilotTime(track, limit = 600) {
  const level = new Level(track.seed, levelOptions(track))
  level.ensure(300)
  let p = createPlayer(0, level.roofAt(0))
  const bot = new Bot(level)
  let t = 0
  while (t < limit) {
    level.ensure(p.x + 150)
    stepPlayer(p, bot.input(p), PHYS.FIXED_DT, level, [])
    t += PHYS.FIXED_DT
    if (level.finish && p.x >= level.finish.x) return t
    if (!p.alive) {
      // back to the last checkpoint with the clock running, like a player
      const r = level.respawnPoint(p.x)
      p = createPlayer(r.x, r.y)
      p.speed = PHYS.SPEED_MIN
    }
  }
  return null
}

export function medalsFrom(time) {
  return [Math.round(time * 0.86), Math.ceil(time), Math.round(time * 1.2)]
}
