// Records a run as compact samples and plays it back as a ghost.

const STATES = ['run', 'air', 'slide', 'roll', 'stumble', 'blocked', 'vault', 'mantle', 'climb', 'wallslide', 'wallrun', 'zip', 'dead']
const STRIDE = 6
const r2 = (v) => Math.round(v * 100) / 100

export class GhostRecorder {
  constructor(rate = 20) {
    this.rate = rate
    this.samples = []
    this.next = 0
  }

  sample(t, p) {
    if (t < this.next) return
    this.next = t + 1 / this.rate
    this.samples.push(r2(t), r2(p.x), r2(p.y), Math.max(0, STATES.indexOf(p.state)), r2(p.speed), r2(p.vy))
  }

  data() { return { rate: this.rate, samples: this.samples } }
}

export class GhostPlayer {
  constructor(data) {
    this.s = data.samples
    this.n = Math.floor(this.s.length / STRIDE)
    this.i = 0
    this.stateStart = 0
    this.lastState = null
  }

  get duration() { return this.n ? this.s[(this.n - 1) * STRIDE] : 0 }

  // Interpolated pseudo-player at time t (monotonic playback).
  at(t) {
    if (!this.n) return null
    const s = this.s
    if (t < s[this.i * STRIDE]) this.i = 0
    while (this.i < this.n - 2 && s[(this.i + 1) * STRIDE] <= t) this.i++
    const a = this.i * STRIDE, b = Math.min(this.n - 1, this.i + 1) * STRIDE
    const span = s[b] - s[a]
    const u = span > 0 ? Math.max(0, Math.min(1, (t - s[a]) / span)) : 0
    const state = STATES[s[a + 3]]
    if (state !== this.lastState) { this.lastState = state; this.stateStart = s[a] }
    // teleports (respawns) shouldn't smear across the screen
    const jump = Math.abs(s[b + 1] - s[a + 1]) > 8
    return {
      x: jump ? s[a + 1] : s[a + 1] + (s[b + 1] - s[a + 1]) * u,
      y: jump ? s[a + 2] : s[a + 2] + (s[b + 2] - s[a + 2]) * u,
      state, speed: s[a + 4], vy: s[a + 5], t: t - this.stateStart, kin: null,
      done: t > this.duration,
    }
  }
}
