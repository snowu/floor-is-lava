// Procedural rooftop course. Pure and deterministic for a given seed.
//
// The course is a chain of chunks. Each chunk is one building plus the gap
// that follows it; the gap type decides how the next roof is reached.

import { PHYS, WORLD } from './config.js'
import { createRng } from './rng.js'

export const GAP_TYPES = ['jump', 'climb', 'wallrun', 'zip', 'spring']
export const OBSTACLE_TYPES = ['vent', 'highbox', 'beam', 'housing']

// Scripted onboarding: each entry introduces one move.
const TUTORIAL = [
  { obstacles: ['vent'], gap: 'jump', dh: [0, 0.5], hints: { vent: 'vault', gap: 'jump' } },
  { obstacles: ['beam'], gap: 'jump', dh: [-5.5, -5], hints: { beam: 'slide', gap: 'roll' } },
  { obstacles: ['housing'], gap: 'climb', hints: { housing: 'grab', gap: 'climb' } },
  { obstacles: [], gap: 'wallrun', hints: { gap: 'wallrun' } },
  { obstacles: ['highbox'], gap: 'zip', hints: { gap: 'zip' } },
  { obstacles: ['vent'], gap: 'spring', hints: { gap: 'spring' } },
]

const DECOR_TYPES = [
  ['ac', 5], ['antenna', 2], ['tank', 1.2], ['dish', 1.2], ['skylight', 1.5],
  ['vents', 2], ['solar', 1.5], ['sign', 0.6],
]

let jumpProfileCache = null

// Trajectory of a held jump from flat ground, sampled finely.
function jumpProfile() {
  if (jumpProfileCache) return jumpProfileCache
  const dt = 1 / 480
  const pts = []
  let y = 0, vy = PHYS.JUMP_V, t = 0, hold = 0
  while (t < 4) {
    let g = PHYS.G
    if (vy > 0 && hold < PHYS.JUMP_HOLD_TIME) { g *= PHYS.JUMP_HOLD_GRAVITY; hold += dt }
    vy -= g * dt
    y += vy * dt
    t += dt
    pts.push({ t, y, vy })
    if (y < -30) break
  }
  jumpProfileCache = pts
  return pts
}

export function jumpApex() {
  return jumpProfile().reduce((m, p) => Math.max(m, p.y), 0)
}

// Horizontal distance covered before a held jump descends through height dh.
export function jumpDistance(dh, speed = PHYS.SPEED_MIN) {
  const pts = jumpProfile()
  for (const p of pts) {
    if (p.vy < 0 && p.y <= dh) return p.t * speed
  }
  return 0
}

// Widest gap clearable when taking off right at the edge.
export function maxGap(dh, speed = PHYS.SPEED_MIN) {
  if (dh > jumpApex() - 0.3) return 0
  return jumpDistance(dh, speed) + PHYS.W - 0.3
}

export function difficultyAt(x) {
  return Math.max(0, Math.min(1, x / WORLD.DIFFICULTY_DISTANCE))
}

const round = (v) => Math.round(v * 100) / 100

export class CourseGenerator {
  // options.tutorial: open with the scripted onboarding chunks
  // options.length: place a finish line once the course reaches this distance
  // options.checkpointEvery: spacing of respawn checkpoints
  // options.difficulty: { start, ramp } — difficulty grows from start to 1 over ramp meters
  // options.heist: add data shards, laser grids and drones (from their own rng,
  //   so the buildings are identical to the same seed without them)
  constructor(seed, { tutorial = true, length = Infinity, checkpointEvery = 250, difficulty = null, heist = false } = {}) {
    this.seed = seed >>> 0
    this.rng = createRng(this.seed)
    this.index = 0
    this.cursor = -30
    this.roof = 8
    this.entryClear = 0
    this.lastGap = null
    this.nextSolidId = 1
    this.tutorial = tutorial
    this.length = length
    this.checkpointEvery = checkpointEvery
    this.nextCheckpoint = checkpointEvery
    this.checkpointCount = 0
    this.finished = false
    this.difficulty = difficulty
    this.heist = heist
  }

  difficultyAt(x) {
    if (!this.difficulty) return difficultyAt(x)
    const { start = 0, ramp = WORLD.DIFFICULTY_DISTANCE } = this.difficulty
    return Math.min(1, start + (1 - start) * Math.max(0, x) / ramp)
  }

  next() {
    const rng = this.rng
    const id = this.index++
    const tutorial = this.tutorial ? TUTORIAL[id] : null
    const x0 = this.cursor
    const roof = this.roof
    const d = this.difficultyAt(x0)
    // the roof that crosses the finish distance is long and clear
    const finish = !this.finished && x0 >= this.length - 25
    if (finish) this.finished = true
    const width = round(id === 0 ? 75 : finish ? 70 : tutorial ? rng.range(46, 52) : rng.range(24, 54) * (1 - 0.2 * d))
    const x1 = round(x0 + width)
    const depth = round(rng.range(14, 30))

    const chunk = {
      id,
      x0, x1, roof, depth,
      style: rng.int(0, 3),
      tint: rng.int(0, 5),
      seed: rng.int(1, 1e9),
      solids: [],
      wallruns: [],
      ziplines: [],
      decor: [],
      hints: [],
      extras: [],
      shards: [],
      lasers: [],
      drones: [],
      gap: null,
      xEnd: 0,
      span: [x0, x1],
      checkpoint: null,
      finish: null,
    }
    if (finish) {
      chunk.finish = { x: round(x0 + 14), y: roof }
    } else if (id > 0 && x0 >= this.nextCheckpoint && !this.finished) {
      chunk.checkpoint = { x: round(x0 + 3), y: roof, index: ++this.checkpointCount }
      this.nextCheckpoint = x0 + this.checkpointEvery
    }
    chunk.solids.push(this.solid('roof', 'building', x0, x1, WORLD.STREET_Y, roof, {
      z0: WORLD.BUILDING_FRONT_Z - depth, z1: WORLD.BUILDING_FRONT_Z,
    }))

    const gapType = tutorial ? tutorial.gap : finish ? 'jump' : this.pickGap(roof, d)
    const gap = this.buildGap(chunk, gapType, d, tutorial)
    chunk.gap = gap

    const obstacleEnd = gap.runwayStart - 10
    const obstacleStart = x0 + (id === 0 ? 46 : this.entryClear)
    if (!finish) this.placeObstacles(chunk, obstacleStart, obstacleEnd, d, tutorial)
    this.placeDecor(chunk)
    if (this.heist && id > 0 && !finish) placeHeist(chunk, gap, d)
    if (tutorial?.hints.gap) chunk.hints.push({ x: x1 - 14, key: tutorial.hints.gap })

    chunk.xEnd = gap.nextX0
    let spanEnd = gap.nextX0
    for (const w of chunk.wallruns) spanEnd = Math.max(spanEnd, w.x1)
    for (const z of chunk.ziplines) spanEnd = Math.max(spanEnd, z.bx)
    chunk.span = [x0, spanEnd]

    this.cursor = gap.nextX0
    this.roof = gap.nextRoof
    this.entryClear = gap.entryClear
    this.lastGap = gapType
    return chunk
  }

  solid(kind, sub, x0, x1, y0, y1, extra = {}) {
    return { id: this.nextSolidId++, kind, sub, x0: round(x0), x1: round(x1), y0: round(y0), y1: round(y1), ...extra }
  }

  pickGap(roof, d) {
    const high = roof > 20
    const low = roof < 4
    const canZip = roof - 7 >= WORLD.ROOF_MIN
    const canRise = roof + 5.5 <= WORLD.ROOF_MAX
    const weights = [
      ['jump', 5],
      ['climb', canRise ? (1.4 + d) * (low ? 2.5 : 1) : 0],
      ['wallrun', 1 + d],
      ['zip', canZip ? (high ? 3 : 0.9) : 0],
      ['spring', canRise ? (low ? 2.2 : 0.9) : 0],
    ]
    let type = this.rng.weighted(weights)
    if (type === this.lastGap && type !== 'jump' && this.rng.chance(0.6)) type = 'jump'
    return type
  }

  buildGap(chunk, type, d, tutorial) {
    const rng = this.rng
    const { x1, roof } = chunk
    const clampRoof = (y) => round(Math.max(WORLD.ROOF_MIN, Math.min(WORLD.ROOF_MAX, y)))
    let dh, width, entryClear = 10, runwayStart = x1

    switch (type) {
      case 'jump': {
        if (tutorial) dh = rng.range(...tutorial.dh)
        else {
          const up = roof < 6 ? 0.45 : roof > 22 ? 0.1 : 0.28
          dh = rng.chance(up) ? rng.range(0, 1.2) : rng.range(-5.5, -0.5)
        }
        dh = clampRoof(roof + dh) - roof
        const reach = maxGap(dh)
        const frac = tutorial ? 0.4 : rng.range(0.35, 0.55 + 0.25 * d)
        width = Math.max(2.5, reach * frac)
        entryClear = 9 + Math.max(0, -dh) * 0.6
        break
      }
      case 'climb': {
        dh = rng.range(3, 4.6)
        width = rng.range(1.5, 3.2)
        entryClear = 8
        chunk.extras.push({ type: 'ledge', x: x1 + width, y: round(roof + dh) })
        break
      }
      case 'wallrun': {
        dh = rng.range(-2.5, 0.3)
        width = rng.range(8.5, 10.5 + 2 * d)
        const nextX0 = x1 + width
        const panel = {
          id: `w${chunk.id}`,
          x0: round(x1 - 1.5), x1: round(nextX0 + 1),
          y0: round(roof + 0.3), y1: round(roof + 4.5),
          z: -0.9,
        }
        chunk.wallruns.push(panel)
        chunk.extras.push({
          type: 'wallrunWall',
          x0: round(x1 - 2), x1: round(nextX0 + 2),
          top: round(Math.max(roof, roof + dh) + rng.range(6, 14)),
        })
        entryClear = 9
        break
      }
      case 'zip': {
        dh = -rng.range(7, 13)
        dh = clampRoof(roof + dh) - roof
        width = rng.range(14, 24)
        const nextX0 = x1 + width
        chunk.ziplines.push({
          id: `z${chunk.id}`,
          ax: round(x1 - 1), ay: round(roof + 3.4),
          bx: round(nextX0 + 4), by: round(roof + dh + 2.6),
        })
        entryClear = 11
        break
      }
      case 'spring': {
        dh = rng.range(3.5, 5.2)
        width = rng.range(1.5, 2.8)
        const sx = x1 + width - 5
        chunk.solids.push(this.solid('spring', 'spring', sx, sx + 1.6, roof, roof + 0.5, { z0: -1.2, z1: 1.2 }))
        chunk.extras.push({ type: 'ledge', x: x1 + width, y: round(roof + dh) })
        runwayStart = sx
        entryClear = 8
        break
      }
    }
    width = round(width)
    return {
      type,
      width,
      dh: round(dh),
      nextX0: round(x1 + width),
      nextRoof: clampRoof(roof + dh),
      entryClear,
      runwayStart,
    }
  }

  placeObstacles(chunk, start, end, d, tutorial) {
    const rng = this.rng
    const { roof } = chunk
    let x = start + rng.range(0, 4)
    let queue = tutorial ? [...tutorial.obstacles] : null
    while (x < end) {
      let type
      if (queue) {
        if (!queue.length) break
        type = queue.shift()
      } else {
        if (rng.chance(0.25 - 0.15 * d)) { x += rng.range(6, 12); continue }
        type = rng.weighted([['vent', 3], ['highbox', 1 + d], ['beam', 2], ['housing', 1.3]])
      }
      let obstacle, after
      if (type === 'vent') {
        const w = rng.range(0.8, 1.8)
        obstacle = this.solid('block', 'vent', x, x + w, roof, roof + rng.range(0.6, 1.15), { z0: -0.9, z1: 0.9 })
        after = 7
      } else if (type === 'highbox') {
        const w = rng.range(0.8, 1.4)
        obstacle = this.solid('block', 'highbox', x, x + w, roof, roof + rng.range(1.4, 2.0), { z0: -0.8, z1: 0.8 })
        after = 8
      } else if (type === 'beam') {
        const w = rng.range(0.5, 2.2)
        const bottom = roof + rng.range(1.0, 1.15)
        obstacle = this.solid('beam', 'beam', x, x + w, bottom, bottom + 0.45, { z0: -4, z1: 1.4 })
        after = 7
      } else {
        const w = rng.range(4, 9)
        obstacle = this.solid('block', 'housing', x, x + w, roof, roof + rng.range(2.4, 3.6), { z0: -3.2, z1: 1.0 })
        after = 10
      }
      if (obstacle.x1 > end) break
      chunk.solids.push(obstacle)
      const hint = tutorial?.hints[type]
      if (hint) chunk.hints.push({ x: obstacle.x0, key: hint })
      x = obstacle.x1 + after * (1 - 0.3 * d) + rng.range(0, 10 * (1 - d) + 2)
    }
  }

  placeDecor(chunk) {
    const rng = this.rng
    const count = Math.floor((chunk.x1 - chunk.x0) / 5)
    const backZ = WORLD.BUILDING_FRONT_Z - chunk.depth
    for (let i = 0; i < count; i++) {
      chunk.decor.push({
        type: rng.weighted(DECOR_TYPES),
        x: round(rng.range(chunk.x0 + 1.5, chunk.x1 - 1.5)),
        z: round(rng.range(backZ + 2, -4.5)),
        s: round(rng.range(0.7, 1.3)),
        r: round(rng.range(0, Math.PI * 2)),
        v: rng(),
      })
    }
    if (rng.chance(0.55)) chunk.extras.push({ type: 'birds', x: round(rng.range(chunk.x0 + 10, chunk.x1 - 4)), count: rng.int(3, 7) })
  }
}

// ── heist layer ─────────────────────────────────────────────────────────
// Shards trace the lines a runner actually takes (over gaps, along cables
// and wall-runs); lasers and drones sit on clear stretches of roof.

const SHARD_RING = 0x5a17

function placeHeist(chunk, gap, d) {
  const rng = createRng(chunk.seed ^ SHARD_RING)
  const { x0, x1, roof } = chunk
  let n = 0
  const shard = (x, y) => chunk.shards.push({ id: `${chunk.id}:${n++}`, x: round(x), y: round(y), taken: false })
  const addLaser = (x, len, low) => {
    const y0 = low ? roof + 0.05 : roof + 1.05
    chunk.lasers.push({ id: `${chunk.id}:L${chunk.lasers.length}`, x0: round(x), x1: round(x + len), y0: round(y0), y1: round(y0 + 0.22), low, tripped: false })
  }

  // clear roof intervals between obstacles, away from the gap runway
  const blocks = chunk.solids.filter((s) => s.kind !== 'roof').sort((a, b) => a.x0 - b.x0)
  const free = []
  let cursor = x0 + 9
  for (const s of blocks) {
    if (s.x0 - 5 > cursor) free.push([cursor, s.x0 - 5])
    cursor = Math.max(cursor, s.x1 + 5)
  }
  const end = gap.runwayStart - 6
  if (end > cursor) free.push([cursor, end])
  const take = (len) => {
    const fits = free.filter(([a, b]) => b - a >= len)
    if (!fits.length) return null
    const iv = rng.pick(fits)
    const at = rng.range(iv[0], iv[1] - len)
    // split what remains so later placements don't overlap
    free.splice(free.indexOf(iv), 1)
    if (at - iv[0] > 4) free.push([iv[0], at - 2])
    if (iv[1] - (at + len) > 4) free.push([at + len + 2, iv[1]])
    return at
  }

  // gap lines
  switch (gap.type) {
    case 'jump': {
      for (const u of [0.2, 0.5, 0.8]) {
        const base = roof + (gap.dh < 0 ? gap.dh * u * u : gap.dh * u)
        shard(x1 - 1 + (gap.width + 2) * u, base + 2.3 + 0.7 * Math.sin(Math.PI * u))
      }
      break
    }
    case 'zip': {
      const z = chunk.ziplines[0]
      for (let i = 1; i <= 5; i++) {
        const x = z.ax + 3 + (z.bx - z.ax - 6) * (i - 1) / 4
        shard(x, z.ay + (x - z.ax) * (z.by - z.ay) / (z.bx - z.ax) - 1)
      }
      break
    }
    case 'wallrun':
      for (const u of [0.2, 0.5, 0.8]) shard(x1 + gap.width * u, roof + 2.3)
      break
    case 'climb':
      shard(x1 + gap.width - 0.5, roof + gap.dh * 0.6)
      break
    case 'spring':
      shard(x1 + gap.width + 2, roof + gap.dh + 1)
      shard(x1 + gap.width + 3.6, roof + gap.dh + 1)
      break
  }

  // laser grids: low ones are jumped, high ones are slid under. Some take
  // the place of a vent or pipe that asked for the same move, so the spacing
  // the obstacle pass designed for reaction time still holds.
  const swap = 0.2 + 0.35 * d
  for (const s of blocks) {
    if ((s.sub !== 'vent' && s.sub !== 'beam') || !rng.chance(swap)) continue
    const low = s.sub === 'vent'
    const len = Math.max(low ? 1.8 : 1.4, s.x1 - s.x0 + 0.6)
    chunk.solids.splice(chunk.solids.indexOf(s), 1)
    addLaser(s.x0 - 0.3, len, low)
  }
  if (rng.chance(0.15 + 0.3 * d)) {
    const low = rng.chance(0.5)
    const len = low ? rng.range(1.8, 3.2) : rng.range(1.4, 2.8)
    const at = take(len + 8)
    if (at !== null) addLaser(at + 5, len, low)
  }

  // drones hover just above head height: kick them out of the air, or get spotted
  if (rng.chance(0.25 + 0.35 * d)) {
    const at = take(6)
    if (at !== null) chunk.drones.push({ id: `${chunk.id}:D`, x: round(at + 3), y: round(roof + 2.75), down: false, spotted: false })
  }

  // a line of shards along the roof: low ones are free, high ones need a jump
  if (rng.chance(0.65)) {
    const count = rng.int(3, 5)
    const at = take(count * 1.6 + 1)
    if (at !== null) {
      const high = rng.chance(0.4)
      for (let i = 0; i < count; i++) shard(at + 0.5 + i * 1.6, roof + (high ? 2.9 : 0.9))
    }
  }
}
