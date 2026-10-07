// The runner as a pixel sprite. A small skeleton is posed procedurally from
// the physics state (springy joints, squash on landing, a simulated ponytail)
// and rasterized into chunky outlined pixels at a stepped frame rate.
//
// Sprite space: pixels, y up, origin at the feet, facing +x.
// Hanging limbs point along (sin a, -cos a): positive angles swing forward.

import { PixelBuffer, hex, mix, pack } from './pixels.js'
import { PHYS } from '../sim/config.js'

export const SPRITE_W = 64
export const SPRITE_H = 64
export const ORIGIN_X = 32
export const ORIGIN_Y = 52

const L = {
  thigh: 6.3, shin: 6.1, foot: 3.1,
  torso: 6.9, neck: 1.2, head: 2.75,
  upper: 4.9, fore: 4.5,
  hip: 12.4,
}

const COLORS = {
  skin: hex(0xf0b089), skinFar: hex(0xc27a5c),
  top: hex(0x231c2e), topFar: hex(0x181320),
  pants: hex(0xe9e4ee), pantsFar: hex(0xa79eb8),
  shoe: hex(0xff3b30), shoeFar: hex(0xb3261f),
  hair: hex(0x2b1a17), glove: hex(0x2c2638), gloveFar: hex(0x1d1926),
  band: hex(0xff3b30),
  visor: hex(0x29f3ff),
  outline: hex(0x140c1c),
}

const GROUNDED = new Set(['run', 'idle', 'blocked', 'stumble', 'slide', 'vault'])

const JOINTS = ['torso', 'head', 'thighA', 'shinA', 'footA', 'thighB', 'shinB', 'footB', 'armA', 'foreA', 'armB', 'foreB', 'hip', 'hipX']

function pose(o) {
  const p = { torso: 0, head: 0, thighA: 0, shinA: 0, footA: 0, thighB: 0, shinB: 0, footB: 0, armA: 0, foreA: 0, armB: 0, foreB: 0, hip: 0, hipX: 0 }
  return Object.assign(p, o)
}

const smooth = (u) => u * u * (3 - 2 * u)
const clamp01 = (u) => Math.max(0, Math.min(1, u))

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const len = dx * dx + dy * dy
  let t = len > 0 ? ((px - ax) * dx + (py - ay) * dy) / len : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const x = ax + dx * t - px, y = ay + dy * t - py
  return x * x + y * y
}

export class RunnerSprite {
  constructor() {
    this.cur = pose({})
    this.vel = pose({})
    this.spin = 0
    this.phase = 0
    this.time = 0
    this.landT = 0
    this.landAmt = 0
    this.lastStep = 0
    this.onStep = null
    this.buf = new PixelBuffer(SPRITE_W, SPRITE_H)
    this.ids = new Uint8Array(SPRITE_W * SPRITE_H)
    this.hair = null
    this.rim = hex(0xffd98a)
    this.rimDir = [-1, 1]
    this.state = 'idle'
  }

  land(impact) {
    this.landT = 0
    this.landAmt = Math.min(1, impact / 16)
  }

  // ── posing ──────────────────────────────────────────────────────────────

  runPose(phase, k) {
    const leg = (ph) => {
      const swing = Math.sin(ph)
      const recover = Math.max(0, Math.cos(ph + 0.45))
      const stance = Math.max(0, -Math.cos(ph + 0.2))
      return {
        thigh: 0.22 + swing * (0.78 + 0.32 * k),
        shin: -(0.18 + Math.pow(recover, 1.3) * (1.5 + 0.55 * k) + stance * 0.28),
        foot: -0.15 + Math.sin(ph + 0.9) * 0.45,
      }
    }
    const a = leg(phase), b = leg(phase + Math.PI)
    const pump = 0.85 + 0.35 * k
    const lean = -0.2 - 0.24 * k
    return pose({
      torso: lean - 0.05 * Math.cos(phase * 2),
      head: -lean * 0.55 + 0.04,
      thighA: a.thigh, shinA: a.shin, footA: a.foot,
      thighB: b.thigh, shinB: b.shin, footB: b.foot,
      armA: -Math.sin(phase) * pump + 0.2, foreA: 1.45 + Math.max(0, -Math.sin(phase)) * 0.5,
      armB: Math.sin(phase) * pump + 0.2, foreB: 1.45 + Math.max(0, Math.sin(phase)) * 0.5,
      hip: -0.4 + Math.abs(Math.sin(phase + 0.35)) * 1.3,
      hipX: 0.3 * k,
    })
  }

  target(p, dt) {
    const k = clamp01((p.speed - PHYS.SPEED_MIN) / (PHYS.SPEED_MAX - PHYS.SPEED_MIN))
    const t = this.time
    switch (p.state) {
      case 'run':
      case 'wallrun': {
        this.phase += dt * Math.PI * 2 * (p.speed / (3.3 + p.speed * 0.13)) * (p.state === 'wallrun' ? 1.15 : 1)
        const o = this.runPose(this.phase, k)
        if (p.state === 'wallrun') { o.torso += 0.18; o.hip += 0.6 }
        return o
      }
      case 'climb': {
        this.phase += dt * Math.PI * 2 * 2.6
        const s = Math.sin(this.phase)
        return pose({
          torso: 0.05, head: 0.35,
          thighA: 1.25 + s * 0.55, shinA: -1.5 + s * 0.5, footA: -0.6,
          thighB: 1.25 - s * 0.55, shinB: -1.5 - s * 0.5, footB: -0.6,
          armA: 2.75 + s * 0.4, foreA: 0.25, armB: 2.75 - s * 0.4, foreB: 0.25,
        })
      }
      case 'air': {
        const v = p.vy / PHYS.JUMP_V
        if (v > 0.15) {
          // rising: lead knee driven up, trail leg extended, arms thrown
          return pose({
            torso: -0.28, head: 0.25,
            thighA: 1.35, shinA: -1.7, footA: 0.2,
            thighB: -0.45, shinB: -0.55, footB: -0.6,
            armA: -0.85, foreA: 1.2, armB: 2.1, foreB: 0.7,
            hip: 0.4,
          })
        }
        if (v > -0.35) {
          // apex: gathered, legs cycling
          return pose({
            torso: -0.12, head: 0.15,
            thighA: 1.0, shinA: -1.6, footA: 0.1,
            thighB: 0.35, shinB: -1.75, footB: -0.2,
            armA: 0.8 + Math.sin(t * 14) * 0.25, foreA: 1.0, armB: 1.6, foreB: 0.6,
            hip: 0.6,
          })
        }
        // falling: reaching for the ground, arms out for balance
        const reach = clamp01(-v / 1.4)
        return pose({
          torso: -0.05 + reach * 0.12, head: 0.3,
          thighA: 0.75 - reach * 0.25, shinA: -0.7 + reach * 0.35, footA: 0.3,
          thighB: 0.2 + reach * 0.2, shinB: -1.1 + reach * 0.5, footB: 0.1,
          armA: 1.9 + Math.sin(t * 9) * 0.35 * reach, foreA: 0.5, armB: -0.6 + reach * 0.9 - Math.sin(t * 9) * 0.3 * reach, foreB: 0.8,
          hip: 0.3,
        })
      }
      case 'slide':
        return pose({
          torso: 1.05, head: -0.75,
          thighA: 1.5, shinA: -0.05, footA: -0.45,
          thighB: 0.55, shinB: -2.35, footB: 0.5,
          armA: -1.6, foreA: 0.2, armB: -0.2, foreB: 1.3,
          hip: -7.2, hipX: -0.5,
        })
      case 'roll':
        return pose({
          torso: -1.0, head: -0.7,
          thighA: 2.2, shinA: -2.5, footA: 0.4, thighB: 2.0, shinB: -2.4, footB: 0.4,
          armA: 1.7, foreA: 1.7, armB: 1.5, foreB: 1.8,
          hip: -4.2,
        })
      case 'stumble':
        return pose({
          torso: -1.05 + Math.sin(t * 18) * 0.08, head: 0.7,
          thighA: 1.25, shinA: -1.7, footA: 0.2, thighB: -0.25, shinB: -1.1, footB: -0.3,
          armA: 1.6 + Math.sin(t * 22) * 0.5, foreA: 0.5, armB: 0.9 - Math.sin(t * 22) * 0.5, foreB: 0.6,
          hip: -3.2,
        })
      case 'vault': {
        const kin = p.kin
        const u = kin ? clamp01(kin.t / kin.T) : 0
        if (kin && kin.mode === 'step') {
          return pose({
            torso: -0.75, head: 0.5,
            thighA: 1.9, shinA: -2.1, footA: 0.3, thighB: 0.1, shinB: -0.9, footB: -0.4,
            armA: 0.9, foreA: 0.3, armB: 0.2, foreB: 0.6, hip: -1.2,
          })
        }
        // speed vault: plant a hand, swing the legs through
        const s = Math.sin(u * Math.PI)
        return pose({
          torso: -0.55 - s * 0.55, head: 0.5 + s * 0.3,
          thighA: 1.0 + s * 0.85, shinA: -1.1 - s * 0.6, footA: 0.3,
          thighB: 0.7 + s * 0.9, shinB: -1.6 + s * 0.4, footB: 0.1,
          armA: 0.55 + s * 0.6, foreA: 0.05, armB: 1.5 - u * 1.2, foreB: 0.5,
          hip: s * 1.5,
        })
      }
      case 'mantle': {
        const kin = p.kin
        const u = kin ? clamp01(kin.t / kin.T) : 1
        return pose({
          torso: -0.15 - smooth(u) * 0.75, head: 0.4,
          armA: 2.95 - smooth(u) * 2.4, foreA: 0.15 + u * 1.1, armB: 2.85 - smooth(u) * 2.2, foreB: 0.2 + u * 1.0,
          thighA: 0.3 + smooth(u) * 1.6, shinA: -0.4 - u * 1.8, footA: 0.2,
          thighB: 0.15, shinB: -0.3 - u * 0.6, footB: -0.2,
        })
      }
      case 'wallslide':
        return pose({
          torso: 0.12, head: 0.45,
          thighA: 0.9, shinA: -1.15, footA: -0.5, thighB: 0.55, shinB: -0.8, footB: -0.4,
          armA: 2.7, foreA: 0.35, armB: 2.3, foreB: 0.5,
        })
      case 'blocked':
        return pose({
          torso: -0.25, head: 0.2 + Math.sin(t * 5) * 0.06,
          thighA: 0.4, shinA: -0.5, footA: 0, thighB: -0.3, shinB: -0.2, footB: -0.2,
          armA: 1.45, foreA: 0.55, armB: 1.3, foreB: 0.7,
          hip: -0.6 + Math.sin(t * 5) * 0.35,
        })
      case 'zip': {
        const sway = Math.sin(t * 2.6) * 0.12
        return pose({
          torso: 0.18 + sway, head: -0.2,
          armA: 2.98 - sway, foreA: 0.05, armB: 2.92 - sway, foreB: 0.12,
          thighA: 0.75 + sway, shinA: -0.35, footA: 0.35, thighB: 0.55 + sway, shinB: -0.55, footB: 0.3,
          hip: 0,
        })
      }
      case 'dead':
        return pose({
          torso: Math.sin(t * 6) * 0.6, head: 0.5,
          thighA: Math.sin(t * 8) * 1.1, shinA: -0.9, thighB: -Math.sin(t * 8) * 1.1, shinB: -0.9,
          armA: 2.4 + Math.sin(t * 10) * 0.8, foreA: 0.4, armB: 2.0 - Math.sin(t * 10) * 0.8, foreB: 0.5,
        })
      default: {
        // idle: breathing, weight on the back foot, an occasional glance
        const b = Math.sin(t * 2.2)
        return pose({
          torso: -0.04 + b * 0.025, head: 0.08 + Math.max(0, Math.sin(t * 0.7)) * 0.25,
          thighA: 0.18, shinA: -0.12, footA: 0, thighB: -0.12, shinB: -0.08, footB: 0,
          armA: 0.12 + b * 0.04, foreA: 0.35, armB: -0.15 - b * 0.04, foreB: 0.4,
          hip: b * 0.25 - 0.2,
        })
      }
    }
  }

  // ── per-frame ───────────────────────────────────────────────────────────

  update(dt, p, wx, wy, mode) {
    this.time += dt
    const state = mode === 'idle' ? 'idle' : p.state
    this.state = state
    const target = this.target(state === p.state ? p : { ...p, state }, dt)

    // land squash overlay
    this.landT += dt
    if (this.landT < 0.22 && (state === 'run' || state === 'stumble')) {
      const u = Math.sin((this.landT / 0.22) * Math.PI) * this.landAmt
      target.hip -= 2.6 * u
      target.thighA += 0.5 * u; target.shinA -= 0.9 * u
      target.thighB += 0.4 * u; target.shinB -= 0.8 * u
      target.torso -= 0.3 * u
    }

    // springy joints: a touch of overshoot keeps motion loose
    const fast = state === 'run' || state === 'wallrun' || state === 'climb'
    const k = fast ? 900 : 420
    const c = 2 * Math.sqrt(k) * (fast ? 0.85 : 0.62)
    // substep so long frames can't blow the springs up
    const n = Math.max(1, Math.ceil(dt / (1 / 240)))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      for (const j of JOINTS) {
        const a = k * (target[j] - this.cur[j]) - c * this.vel[j]
        this.vel[j] += a * h
        this.cur[j] += this.vel[j] * h
      }
    }

    if (state === 'roll') {
      const u = clamp01(p.t / PHYS.ROLL_TIME)
      this.spin = -Math.PI * 2 * smooth(u)
    } else if (state === 'dead') {
      this.spin -= dt * 2.4
    } else {
      this.spin = Math.atan2(Math.sin(this.spin), Math.cos(this.spin)) * Math.exp(-dt * 14)
    }

    if (fast) {
      const step = Math.floor(this.phase / Math.PI)
      if (step !== this.lastStep) {
        this.lastStep = step
        this.onStep?.(state)
      }
    }
    this.joints = this.solve()
    this.simulateHair(dt, wx, wy)
  }

  // Joint positions in sprite space.
  solve() {
    const c = this.cur
    const dir = (a) => [Math.sin(a), -Math.cos(a)]
    const up = (a) => [-Math.sin(a), Math.cos(a)]
    const add = (p, d, l) => [p[0] + d[0] * l, p[1] + d[1] * l]
    const pelvis = [c.hipX, L.hip + c.hip]
    const chest = add(pelvis, up(c.torso), L.torso * 0.55)
    const shoulder = add(pelvis, up(c.torso), L.torso)
    const neck = add(shoulder, up(c.torso), L.neck)
    const head = add(neck, up(c.torso + c.head), L.head * 0.95)
    const arm = (a, f) => {
      const elbow = add(shoulder, dir(c.torso + a), L.upper)
      const hand = add(elbow, dir(c.torso + a + f), L.fore)
      return [elbow, hand]
    }
    const leg = (th, sh, fo) => {
      const knee = add(pelvis, dir(th), L.thigh)
      const ankle = add(knee, dir(th + sh), L.shin)
      const fa = th + sh + fo
      const toe = [ankle[0] + Math.cos(fa) * L.foot, ankle[1] + Math.sin(fa) * L.foot]
      return [knee, ankle, toe]
    }
    const [elbowA, handA] = arm(c.armA, c.foreA)
    const [elbowB, handB] = arm(c.armB, c.foreB)
    const [kneeA, ankleA, toeA] = leg(c.thighA, c.shinA, c.footA)
    const [kneeB, ankleB, toeB] = leg(c.thighB, c.shinB, c.footB)
    const hairRoot = add(head, [-Math.cos(c.torso + c.head) * 1.0 - Math.sin(c.torso + c.head) * 1.9, -Math.sin(c.torso + c.head) * 1.0 + Math.cos(c.torso + c.head) * 1.4], 1)
    const j = { pelvis, chest, shoulder, neck, head, elbowA, handA, elbowB, handB, kneeA, ankleA, toeA, kneeB, ankleB, toeB, hairRoot }
    // grounded poses never sink below the floor
    if (GROUNDED.has(this.state)) {
      const low = Math.min(ankleA[1] - 0.6, toeA[1] - 0.5, ankleB[1] - 0.6, toeB[1] - 0.5)
      if (low < 0) for (const key of Object.keys(j)) j[key] = [j[key][0], j[key][1] - low]
    }
    if (this.spin !== 0) {
      const cx = 0, cy = 4.5
      const s = Math.sin(this.spin), co = Math.cos(this.spin)
      for (const key of Object.keys(j)) {
        const [x, y] = j[key]
        j[key] = [cx + (x - cx) * co - (y - cy) * s, cy + (x - cx) * s + (y - cy) * co]
      }
      if (this.state === 'roll') {
        let low = Infinity
        for (const key of Object.keys(j)) low = Math.min(low, j[key][1] - 1.6)
        for (const key of Object.keys(j)) j[key] = [j[key][0], j[key][1] - low]
      }
    }
    return j
  }

  // Ponytail: a short verlet chain in world pixels, so it trails real motion.
  simulateHair(dt, wx, wy) {
    const root = [wx + this.joints.hairRoot[0], wy + this.joints.hairRoot[1]]
    const n = 4, seg = 1.9
    if (!this.hair || Math.abs(this.hair[0].x - root[0]) > 40 || Math.abs(this.hair[0].y - root[1]) > 40) {
      this.hair = Array.from({ length: n }, (_, i) => ({ x: root[0] - i * seg, y: root[1] - i * 0.6, px: root[0] - i * seg, py: root[1] - i * 0.6 }))
    }
    const h = this.hair
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
    const sdt = Math.min(dt, 0.05) / steps
    for (let s = 0; s < steps; s++) {
      h[0].x = root[0]; h[0].y = root[1]
      for (let i = 1; i < n; i++) {
        const q = h[i]
        const vx = (q.x - q.px) * 0.93, vy = (q.y - q.py) * 0.93
        q.px = q.x; q.py = q.y
        q.x += vx
        q.y += vy - 70 * sdt * sdt * 60
      }
      for (let it = 0; it < 3; it++) {
        for (let i = 1; i < n; i++) {
          const a = h[i - 1], b = h[i]
          const dx = b.x - a.x, dy = b.y - a.y
          const d = Math.hypot(dx, dy) || 1
          const diff = (d - seg) / d
          if (i === 1) { b.x -= dx * diff; b.y -= dy * diff }
          else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5 }
        }
      }
    }
    this.hairLocal = h.map((q) => [q.x - wx, q.y - wy])
  }

  // ── raster ─────────────────────────────────────────────────────────────

  parts() {
    const j = this.joints
    const C = COLORS
    const out = []
    const seg = (a, b, r, col, far = false) => out.push({ a, b, r, col, far })
    // far side (B) first
    seg(j.shoulder, j.elbowB, 1.15, C.skinFar, true)
    seg(j.elbowB, j.handB, 0.95, C.skinFar, true)
    seg(j.handB, j.handB, 1.15, C.gloveFar, true)
    seg(j.pelvis, j.kneeB, 1.75, C.pantsFar, true)
    seg(j.kneeB, j.ankleB, 1.3, C.pantsFar, true)
    seg(j.ankleB, j.toeB, 1.0, C.shoeFar, true)
    // ponytail
    const hl = this.hairLocal || []
    for (let i = 1; i < hl.length; i++) seg(hl[i - 1], hl[i], 1.15 - i * 0.12, C.hair)
    // torso
    seg(j.pelvis, j.chest, 2.05, C.pants)
    seg([j.pelvis[0] * 0.5 + j.chest[0] * 0.5, j.pelvis[1] * 0.5 + j.chest[1] * 0.5], j.shoulder, 2.4, C.top)
    seg(j.shoulder, j.neck, 1.0, C.skin)
    // head + hair cap
    seg(j.head, j.head, 2.75, C.skin)
    out.push({ hairCap: true, c: j.head, r: 2.95, col: C.hair })
    // near side (A)
    seg(j.pelvis, j.kneeA, 1.8, C.pants)
    seg(j.kneeA, j.ankleA, 1.35, C.pants)
    seg(j.ankleA, j.toeA, 1.05, C.shoe)
    seg(j.shoulder, j.elbowA, 1.2, C.skin)
    seg([j.shoulder[0] * 0.45 + j.elbowA[0] * 0.55, j.shoulder[1] * 0.45 + j.elbowA[1] * 0.55], [j.shoulder[0] * 0.4 + j.elbowA[0] * 0.6, j.shoulder[1] * 0.4 + j.elbowA[1] * 0.6], 1.2, C.band)
    seg(j.elbowA, j.handA, 1.0, C.skin)
    seg(j.handA, j.handA, 1.2, C.glove)
    return out
  }

  raster() {
    const W = SPRITE_W, H = SPRITE_H
    const ids = this.ids
    ids.fill(0)
    const parts = this.parts()
    const face = this.cur.torso + this.cur.head + this.spin
    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi]
      if (part.hairCap) {
        const [cx, cy] = part.c
        const fx = Math.sin(-face), fy = Math.cos(-face)  // head "up" vector
        for (let y = Math.floor(cy - 4); y <= cy + 4; y++) {
          for (let x = Math.floor(cx - 4); x <= cx + 4; x++) {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy
            if (dx * dx + dy * dy > part.r * part.r) continue
            // hair covers the back and the crown; the face stays clear
            const along = dx * fy - dy * fx         // + toward the face (forward)
            const upward = dx * fx + dy * fy
            if (along > 0.9 && upward < 1.1) continue
            const px = x + ORIGIN_X, py = ORIGIN_Y - y - 1
            if (px >= 0 && py >= 0 && px < W && py < H) ids[py * W + px] = pi + 1
          }
        }
        continue
      }
      const [ax, ay] = part.a, [bx, by] = part.b, r = part.r
      const x0 = Math.floor(Math.min(ax, bx) - r), x1 = Math.ceil(Math.max(ax, bx) + r)
      const y0 = Math.floor(Math.min(ay, by) - r), y1 = Math.ceil(Math.max(ay, by) + r)
      const r2 = r * r
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (segDist2(x + 0.5, y + 0.5, ax, ay, bx, by) > r2) continue
          const px = x + ORIGIN_X, py = ORIGIN_Y - y - 1
          if (px >= 0 && py >= 0 && px < W && py < H) ids[py * W + px] = pi + 1
        }
      }
    }

    // colorize, rim light toward the light source, outline the silhouette
    const buf = this.buf
    buf.data.fill(0)
    const outline = pack(COLORS.outline)
    const [rdx, rdy] = this.rimDir
    const packed = parts.map((p) => pack(p.col))
    const rimmed = parts.map((p) => (p.far ? pack(p.col) : pack(mix(p.col, this.rim, 0.45))))
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const id = ids[y * W + x]
        if (!id) continue
        const nx = x + rdx, ny = y - rdy
        const lit = nx < 0 || ny < 0 || nx >= W || ny >= H || ids[ny * W + nx] === 0
        buf.data[y * W + x] = lit ? rimmed[id - 1] : packed[id - 1]
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (ids[y * W + x]) continue
        if ((x > 0 && ids[y * W + x - 1]) || (x < W - 1 && ids[y * W + x + 1]) ||
            (y > 0 && ids[(y - 1) * W + x]) || (y < H - 1 && ids[(y + 1) * W + x])) {
          buf.data[y * W + x] = outline
        }
      }
    }
    // eye: one dark pixel on the face side
    const [hx, hy] = this.joints.head
    const ex = Math.round(hx + Math.cos(face) * 1.3 - Math.sin(face) * 0.5)
    const ey = Math.round(hy + Math.sin(face) * 1.3 + Math.cos(face) * 0.5)
    const epx = ex + ORIGIN_X, epy = ORIGIN_Y - ey - 1
    // a glowing visor in place of an eye
    const visor = pack(COLORS.visor)
    if (ids[epy * W + epx]) {
      buf.set(epx, epy, visor)
      if (ids[epy * W + epx - 1]) buf.set(epx - 1, epy, visor)
    }
    return buf
  }
}
