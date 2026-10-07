// Endless scoring: moves feed a combo whose multiplier grows with every
// chained move. Keep moving to bank it; a mistake throws the whole combo away.

import { PHYS } from './config.js'

export const MOVE_POINTS = {
  vault: 100, clamber: 40, roll: 150, wallrun: 200, walljump: 150, zip: 120, zipjump: 80,
  spring: 80, grab: 60, climb: 60, slide: 40, slidejump: 120, jump: 10,
}
export const MOVE_NAMES = {
  vault: 'VAULT', clamber: 'CLAMBER', roll: 'ROLL', wallrun: 'WALLRUN', walljump: 'WALL KICK', zip: 'ZIPLINE',
  zipjump: 'ZIP DROP', spring: 'LAUNCH', grab: 'LEDGE', climb: 'CLIMB', slide: 'SLIDE', slidejump: 'SLIDE JUMP',
}
const BREAKERS = new Set(['hardland', 'bonk'])
const SUSTAINED = { wallrun: 60, zip: 40 }   // points per second while doing it

export const COMBO_WINDOW = 2.6
export const MAX_MULT = 10

export function speedFactor(speed) {
  return 0.5 + Math.max(0, speed) / PHYS.SPEED_MAX
}

export class ScoreKeeper {
  constructor() {
    this.total = 0
    this.combo = 0        // pending points in the current chain
    this.mult = 0         // chain length, capped
    this.timer = 0        // time left to extend the chain
    this.moves = []       // names in the current chain (for display)
    this.bestCombo = 0
    this.lastX = null
    this.log = []         // banked/lost results for the HUD
  }

  get pending() { return Math.round(this.combo * Math.max(1, this.mult)) }

  // Returns 'bank' | 'bail' | null to let the HUD react.
  event(type, speed) {
    if (BREAKERS.has(type)) return this.bail()
    const base = MOVE_POINTS[type]
    if (!base) return null
    if (type === 'jump') { this.combo += base; return null }
    this.combo += base * speedFactor(speed)
    this.mult = Math.min(MAX_MULT, this.mult + 1)
    this.timer = COMBO_WINDOW
    if (MOVE_NAMES[type]) this.moves.push(MOVE_NAMES[type])
    if (this.moves.length > 4) this.moves.shift()
    return null
  }

  bail() {
    if (this.mult === 0) return null
    const lost = this.pending
    this.log.push({ type: 'bail', points: lost })
    this.reset()
    return 'bail'
  }

  bank() {
    if (this.mult === 0) return null
    const pts = this.pending
    this.total += pts
    this.bestCombo = Math.max(this.bestCombo, pts)
    this.log.push({ type: 'bank', points: pts, mult: this.mult })
    this.reset()
    return 'bank'
  }

  reset() {
    this.combo = 0
    this.mult = 0
    this.timer = 0
    this.moves = []
  }

  // Distance always scores (faster = more); sustained moves feed the combo.
  update(dt, p) {
    if (this.lastX !== null && p.x > this.lastX) this.total += (p.x - this.lastX) * speedFactor(p.speed)
    this.lastX = p.x
    const sustain = SUSTAINED[p.state]
    if (sustain) {
      this.combo += sustain * speedFactor(p.speed) * dt
      this.timer = COMBO_WINDOW
    } else if (this.mult > 0) {
      this.timer -= dt
      if (this.timer <= 0) return this.bank()
    }
    return null
  }

  teleport(x) { this.lastX = x }
}
