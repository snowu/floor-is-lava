// The pixel-art renderer: a low-resolution canvas scaled up crisp.
import { toCanvas, pack, mix, css, dither, hash, PixelBuffer } from './pixels.js'
import { paletteAt, districtName, ACCENT } from './palette.js'
import { RunnerSprite, ORIGIN_X, ORIGIN_Y } from './runner.js'
import { PPU, bakeBuilding, bakeObstacle, bakeDecor, bakeBird, bakeSkyline, bakeCloud, bakeSign, bakeCar, bakeHolo, outlined, glow, recede } from './sprites.js'
import { PHYS } from '../sim/config.js'
import { createRng } from '../sim/rng.js'

const H = 270
const RASTER_FPS = 24

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const LAYERS = [
  { f: 0.08, fy: 0.06, w: [16, 44], h: [60, 150], gap: [0, 6], color: 'far', win: 'farWin', offset: -4, detail: 0.4 },
  { f: 0.2, fy: 0.14, w: [24, 60], h: [40, 120], gap: [0, 10], color: 'mid', win: 'midWin', offset: 18, detail: 0.7 },
  { f: 0.4, fy: 0.28, w: [34, 86], h: [26, 96], gap: [2, 18], color: 'near', win: 'midWin', offset: 40, detail: 1 },
]

export class PixelView {
  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'pixel-canvas'
    document.getElementById('app').appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d', { alpha: false })
    this.W = 480

    this.runner = new RunnerSprite()
    this.runnerCanvas = document.createElement('canvas')
    this.rasterClock = 0
    this.after = []
    this.afterClock = 0
    this.afterPool = Array.from({ length: 4 }, () => document.createElement('canvas'))
    this.afterIndex = 0

    this.cam = { x: 0, y: 0, lead: 6, floor: -Infinity, trauma: 0, time: 0 }
    this.cache = new Map()
    this.budget = 0
    this.views = new Map()
    this.birds = []
    this.particles = []
    this.lines = []
    this.drops = []
    this.lightning = 0
    this.lightningClock = 8
    this.layers = LAYERS.map((L) => ({ ...L, items: [], cursor: null, rng: createRng(Math.floor(L.f * 1e4)) }))
    this.clouds = { items: [], cursor: null, rng: createRng(77) }
    this.cars = []
    this.carRng = createRng(404)
    this.birdFrames = [0, 1, 2].map((i) => toCanvas(bakeBird(i)))
    this.onStep = null
    this.runner.onStep = (k) => this.onStep?.(k)
    this.ghostRunner = new RunnerSprite()
    this.ghostCanvas = document.createElement('canvas')
    this.ghostClock = 0
    this.passed = 0

    window.addEventListener('resize', () => this.resize())
    this.resize()
  }

  resize() {
    const aspect = window.innerWidth / window.innerHeight
    this.W = clamp(Math.round(H * aspect), 320, 720)
    this.canvas.width = this.W
    this.canvas.height = H
    const scale = Math.min(window.innerWidth / this.W, window.innerHeight / H)
    this.canvas.style.width = `${Math.round(this.W * scale)}px`
    this.canvas.style.height = `${Math.round(H * scale)}px`
    this.ctx.imageSmoothingEnabled = false
    this.cache.delete('sky')
    this.cache.delete('haze')
    this.cache.delete('mist')
    this.cache.delete('vignette')
  }

  // ── cached sprites, re-baked when the palette steps ─────────────────────

  sprite(key, version, bake) {
    const hit = this.cache.get(key)
    if (hit && (hit.version === version || this.budget <= 0)) return hit.canvas
    this.budget--
    const canvas = toCanvas(bake(), hit?.canvas)
    this.cache.set(key, { canvas, version })
    return canvas
  }

  // ── course binding ──────────────────────────────────────────────────────

  bind(level) {
    for (const key of [...this.cache.keys()]) if (key.startsWith('c')) this.cache.delete(key)
    this.views.clear()
    this.birds = []
    this.particles = []
    level.on('add', (c) => this.addChunk(c))
    level.on('remove', (c) => this.removeChunk(c))
    for (const c of level.chunks) this.addChunk(c)
    for (const L of this.layers) { L.items = []; L.cursor = null }
  }

  addChunk(c) {
    const rng = createRng(c.seed)
    const view = {
      wall: rng.int(0, 4),
      cap: rng.chance(0.3),
      roofH: clamp(Math.round(c.depth * 0.55), 8, 16),
      decor: [...c.decor].sort((a, b) => a.z - b.z),
      signs: [],
    }
    const wpx = (c.x1 - c.x0) * PPU
    const signCount = wpx > 160 ? rng.int(1, 3) : wpx > 90 ? 1 : 0
    for (let i = 0; i < signCount; i++) {
      view.signs.push({
        vertical: rng.chance(0.6),
        dx: Math.round(rng.range(4, wpx - 40)),
        dy: rng.int(14, 70),
        seed: rng.int(1, 1e6),
        flicker: rng.chance(0.3),
      })
    }
    for (const e of c.extras) {
      if (e.type !== 'birds') continue
      for (let i = 0; i < e.count; i++) {
        this.birds.push({ chunk: c, x: e.x + rng.range(-2.5, 2.5), y: c.roof, back: view.roofH, vx: 0, vy: 0, flying: false, t: rng() * 5, rng })
      }
    }
    this.views.set(c, view)
  }

  removeChunk(c) {
    this.views.delete(c)
    for (const key of [...this.cache.keys()]) if (key.startsWith(`c${c.id}:`)) this.cache.delete(key)
    this.birds = this.birds.filter((b) => b.chunk !== c)
  }

  // ── camera ──────────────────────────────────────────────────────────────

  snap(x, y) {
    this.cam.x = x + 6
    this.cam.y = y + 2
    this.cam.floor = -Infinity
    this.runner.hair = null
  }

  setFloor(y) { this.cam.floor = y }
  shake(a) { this.cam.trauma = Math.min(1, this.cam.trauma + a) }

  sx(x) { return Math.round(x * PPU) - this.camPX + (this.W >> 1) }
  sy(y) { return (H >> 1) - (Math.round(y * PPU) - this.camPY) }

  updateCamera(dt, s) {
    const c = this.cam
    c.time += dt
    const W = this.W
    const lead = s.mode === 'title' ? -(W * 0.12) / PPU : (W * 0.22) / PPU + s.p.speed * 0.25
    c.lead = damp(c.lead, lead, 2.5, dt)
    let ty = s.ry + 1.6
    const ahead = s.level.roofAt(s.rx + 10 + s.p.speed * 0.5)
    if (ahead !== null && s.p.state !== 'dead') ty = ty * 0.7 + (ahead + 1.6) * 0.3
    ty = Math.max(ty, c.floor)
    c.x = damp(c.x, s.rx + c.lead, 8, dt)
    c.y = damp(c.y, ty, 2.6 + Math.abs(ty - c.y) * 0.6, dt)
    c.trauma = Math.max(0, c.trauma - dt * 1.8)
    const k = c.trauma * c.trauma * 4
    this.shakeX = Math.round(Math.sin(c.time * 53) * k)
    this.shakeY = Math.round(Math.sin(c.time * 71 + 1) * k)
    this.camPX = Math.round(c.x * PPU) + this.shakeX
    this.camPY = Math.round(c.y * PPU) + this.shakeY
  }

  // ── events → effects ────────────────────────────────────────────────────

  burst(x, y, n, { spread = 1.2, up = 1.5, forward = 0, life = 0.6, color = null } = {}) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 0.6, y: y + Math.random() * 0.15,
        vx: forward + (Math.random() - 0.5) * spread * 2, vy: Math.random() * up,
        life: life * (0.6 + Math.random() * 0.6), max: life, color, size: Math.random() < 0.3 ? 2 : 1,
      })
    }
  }

  event(e, p) {
    switch (e.type) {
      case 'land':
        this.runner.land(e.impact ?? 0)
        this.burst(p.x, p.y, Math.min(10, 2 + Math.floor((e.impact ?? 0) / 3)), { up: 1.2, forward: p.speed * 0.3 })
        if ((e.impact ?? 0) > 12) this.shake(0.15)
        break
      case 'hardland':
        this.runner.land(18)
        this.burst(p.x, p.y, 18, { spread: 2, up: 2.5 })
        this.shake(0.6)
        break
      case 'roll':
        this.burst(p.x, p.y, 12, { spread: 1.4, up: 1.4, forward: p.speed * 0.6 })
        this.shake(0.15)
        break
      case 'slide':
        this.burst(p.x, p.y, 8, { up: 0.8, forward: p.speed * 0.8 })
        break
      case 'vault': case 'clamber':
        this.burst(p.x + 0.3, p.y, 4, { up: 1, forward: p.speed * 0.4 })
        break
      case 'bonk':
        this.shake(0.5)
        break
      case 'spring':
        this.shake(0.25)
        this.burst(p.x, p.y, 10, { up: 3, color: ACCENT })
        break
      case 'grab':
        this.burst(p.x + 0.3, p.y + PHYS.H, 4, { up: 0.6, spread: 0.6 })
        break
    }
  }

  districtName(d) { return districtName(d) }

  // ── frame ───────────────────────────────────────────────────────────────

  frame(s) {
    const pal = paletteAt(s.distance)
    this.pal = pal
    this.budget = 2
    const { ctx } = this
    const W = this.W
    this.runner.rim = pal.rim
    this.runner.rimDir = pal.sunX < 0.5 ? [-1, 1] : [1, 1]
    if (s.mode !== 'paused') {
      this.runner.update(s.dt, s.p, s.rx * PPU, s.ry * PPU, s.idle ? 'idle' : null)
      this.updateCamera(s.raw, s)
    }

    this.drawSky(pal, s.time)
    this.drawClouds(pal, s.time)
    this.drawLayers(pal)
    ctx.drawImage(this.sprite('haze', pal.version, () => bakeHaze(W, pal)), 0, Math.round(H * 0.62))
    this.drawCourse(pal, s)
    this.drawBirds(s.dt, s.rx)
    this.drawGates(s, pal)
    this.drawGhost(s)
    this.drawRunner(s, pal)
    this.drawBeams()
    this.drawParticles(s.dt, pal)
    this.drawMist(pal, s.time)
    this.drawWeather(s, pal)
    this.drawSpeedLines(s, pal)
    ctx.drawImage(this.sprite('vignette', pal.version, () => bakeVignette(W, pal)), 0, 0)
    ctx.fillStyle = 'rgba(0,0,0,0.07)'
    for (let y = 1; y < H; y += 2) ctx.fillRect(0, y, W, 1)
    if (s.focusVis > 0.02) this.postFocus(s.focusVis)
    const flash = Math.max(s.flash, this.lightning)
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.9, flash)})`; ctx.fillRect(0, 0, W, H) }
    if (s.fade > 0) { ctx.fillStyle = `rgba(8,6,16,${s.fade})`; ctx.fillRect(0, 0, W, H) }
  }

  drawSky(pal, time) {
    const { ctx } = this
    ctx.drawImage(this.sprite('sky', pal.version, () => bakeSky(this.W, pal)), 0, 0)
    if (pal.stars > 0.05) {
      for (let i = 0; i < 70; i++) {
        const x = Math.floor(hash(i, 1) * this.W), y = Math.floor(hash(i, 2) * H * 0.5)
        const tw = Math.sin(time * (1 + hash(i, 3) * 3) + i)
        if (tw < 0.2 - pal.stars * 0.6) continue
        ctx.fillStyle = tw > 0.8 ? '#ffffff' : '#c9c3ff'
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }

  drawClouds(pal, time) {
    if (pal.clouds < 0.05) return
    const C = this.clouds
    const f = 0.03
    const off = this.camPX * f + time * 2
    if (C.cursor === null || C.cursor < off - 200) C.cursor = off - 60
    while (C.items.length && C.items[0].u + C.items[0].w - off < -40) C.items.shift()
    while (C.cursor - off < this.W + 40) {
      const w = C.rng.int(30, 80), h = C.rng.int(10, 22)
      C.cursor += C.rng.range(30, 140) / pal.clouds
      C.items.push({ u: C.cursor, w, h, y: C.rng.int(8, Math.round(H * 0.42)), seed: C.rng.int(1, 1e6) })
      C.cursor += w
    }
    for (const it of C.items) {
      if (it.u - off > this.W) break
      const cv = this.sprite(`cl${it.seed}`, pal.version, () => bakeCloud(it.w, it.h, pal, it.seed))
      this.ctx.drawImage(cv, Math.round(it.u - off), it.y)
    }
  }

  drawLayers(pal) {
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li]
      const off = this.camPX * L.f
      const base = Math.round(H * 0.7 + L.offset + (this.camPY / PPU - 8) * PPU * L.fy)
      if (L.cursor === null || L.cursor < off - 200) L.cursor = off - 40
      while (L.items.length && L.items[0].u + L.items[0].w - off < -20) L.items.shift()
      while (L.cursor - off < this.W + 40) {
        const w = L.rng.int(...L.w)
        L.cursor += L.rng.int(...L.gap)
        L.items.push({ u: L.cursor, w, h: L.rng.int(...L.h), seed: L.rng.int(1, 1e6) })
        L.cursor += w
      }
      for (const it of L.items) {
        if (it.u - off > this.W) break
        const cv = this.sprite(`L${li}:${it.seed}`, pal.version, () => bakeSkyline(it.w, it.h, pal[L.color], pal[L.win], pal, it.seed, L.detail))
        const x = Math.round(it.u - off)
        this.ctx.drawImage(cv, x, base - it.h)
        if (li > 0 && hash(it.seed, 77) < 0.2 && hash(Math.floor(this.cam.time * 9), it.seed) > 0.06) {
          const holo = this.sprite(`H${it.seed}`, pal.version, () => bakeHolo(it.seed, pal))
          this.ctx.globalAlpha = 0.85
          this.ctx.drawImage(holo, x + ((it.w - holo.width) >> 1), base - it.h - holo.height - 2)
          this.ctx.globalAlpha = 1
        }
      }
      if (li === 0) this.drawCars(pal)
    }
  }

  // Sky traffic between the far and mid skyline.
  drawCars(pal) {
    const f = 0.15
    const off = this.camPX * f
    const dt = Math.min(0.1, this.cam.time - (this.carTime ?? this.cam.time))
    this.carTime = this.cam.time
    const r = this.carRng
    while (this.cars.length < 12) {
      const dir = r.chance(0.5) ? 1 : -1
      this.cars.push({ u: off + r.range(-60, this.W + 60), y: Math.round(H * r.range(0.14, 0.42)), v: dir * r.range(25, 90), dir, seed: r.int(1, 1e6) })
    }
    for (const c of this.cars) {
      c.u += c.v * dt
      const x = Math.round(c.u - off)
      if (x < -80 || x > this.W + 80) {
        c.u = off + (c.dir > 0 ? -40 : this.W + 40) + r.range(-20, 20)
        continue
      }
      const cv = this.sprite(`car${c.seed}`, pal.version, () => bakeCar(c.dir, pal, c.seed))
      this.ctx.drawImage(cv, x, c.y)
      this.ctx.fillStyle = 'rgba(255,60,60,0.35)'
      this.ctx.fillRect(c.dir > 0 ? x - 6 : x + 9, c.y + 1, 6, 1)
    }
  }

  drawCourse(pal, s) {
    const { ctx } = this
    const level = s.level
    const left = this.cam.x - this.W / 2 / PPU - 4
    const right = this.cam.x + this.W / 2 / PPU + 4
    const ver = pal.version
    const visible = []
    for (const c of level.chunksIn(left, right)) {
      const v = this.views.get(c)
      if (v) visible.push([c, v])
    }
    // wall-run walls behind the gap
    for (const [c] of visible) {
      for (const e of c.extras) {
        if (e.type !== 'wallrunWall') continue
        const panel = c.wallruns[0]
        const w = Math.round((e.x1 - e.x0) * PPU)
        const rh = 6
        const m0 = rh + 5 + Math.round((e.top - panel.y1) * PPU)
        const m1 = rh + 5 + Math.round((e.top - panel.y0 + 0.4) * PPU)
        const cv = this.sprite(`c${c.id}:wall`, ver, () => bakeBuilding({ w, roofH: rh, style: (c.seed >> 3) % 2 === 0 ? 0 : 2, seed: c.seed + 5, pal, wall: 2, mural: [m0, m1] }))
        ctx.drawImage(cv, this.sx(e.x0), this.sy(e.top) - rh)
      }
    }
    // zipline poles behind everything in the lane
    ctx.fillStyle = css(mix(pal.shadow, [20, 20, 30], 0.4))
    for (const [c] of visible) {
      for (const z of c.ziplines) {
        for (const [x, top, base] of [[z.ax, z.ay, c.roof], [z.bx, z.by, c.roof + c.gap.dh]]) {
          const px = this.sx(x)
          ctx.fillRect(px - 1, this.sy(top) - 3, 2, this.sy(base) - this.sy(top) + 3)
          ctx.fillRect(px - 3, this.sy(top) - 3, 6, 2)
        }
      }
    }
    // buildings, then what stands on them
    for (const [c, v] of visible) {
      const w = Math.round((c.x1 - c.x0) * PPU)
      const cv = this.sprite(`c${c.id}:b`, ver, () => bakeBuilding({ w, roofH: v.roofH, style: c.style, seed: c.seed, pal, wall: v.wall, accentCap: v.cap }))
      ctx.drawImage(cv, this.sx(c.x0), this.sy(c.roof) - v.roofH)
    }
    // neon signage bolted to the facades
    const t = this.cam.time
    for (const [c, v] of visible) {
      v.signs.forEach((sg, i) => {
        const off = sg.flicker && hash(Math.floor(t * 11), sg.seed) < 0.18
        const key = `c${c.id}:s${i}:${off ? 'dim' : 'on'}`
        const cv = this.sprite(key, ver, () => bakeSign(sg.seed, pal, sg.vertical)[off ? 1 : 0])
        ctx.drawImage(cv, this.sx(c.x0) + sg.dx, this.sy(c.roof) + sg.dy)
      })
    }
    this.beams = []
    for (const [c, v] of visible) {
      const depth = Math.max(4, c.depth - 6)
      for (const d of v.decor) {
        const bucket = Math.floor(d.v * 8) / 8
        const cv = this.sprite(`d:${d.type}:${bucket}`, ver, () => recede(bakeDecor(d.type, bucket, pal), pal.mid, 0.32))
        const back = clamp((-d.z - 4) / depth, 0, 1)
        const bx = this.sx(d.x) - (cv.width >> 1)
        const by = this.sy(c.roof) - Math.round(back * (v.roofH - 3)) - cv.height
        if (bx > this.W || bx + cv.width < 0) continue
        ctx.drawImage(cv, bx, by)
        if (d.type === 'vents' && Math.random() < 0.06) {
          this.particles.push({ x: d.x + (Math.random() - 0.5) * 0.8, y: c.roof + back * (v.roofH - 3) / PPU + 1, vx: -0.3, vy: 1 + Math.random(), life: 1.4, max: 1.4, color: mix(pal.haze, pal.light, 0.35), size: 2 })
        }
        if (d.type === 'antenna' && Math.sin(this.cam.time * 3 + d.x) > 0.4) {
          ctx.fillStyle = css(ACCENT)
          ctx.fillRect(bx + 5, by - 1, 3, 3)
        }
      }
      for (const sd of c.solids) {
        if (sd.kind === 'roof') continue
        const w = Math.max(2, Math.round((sd.x1 - sd.x0) * PPU))
        const h = Math.max(2, Math.round((sd.y1 - sd.y0) * PPU))
        const cv = this.sprite(`c${c.id}:o${sd.id}`, ver, () => outlined(bakeObstacle(sd.sub, w, h, pal, sd.id)))
        const gl = this.sprite(`c${c.id}:g${sd.id}`, ver, () => glow(bakeObstacle(sd.sub, w, h, pal, sd.id), ACCENT, 3, sd.sub === 'housing' ? 8 : Infinity))
        const lip = sd.sub === 'housing' ? 4 : sd.sub === 'spring' ? 2 : sd.kind === 'beam' ? 0 : 3
        const ox = this.sx(sd.x0), oy = this.sy(sd.y1) - lip
        // pulsing runner-vision halo so obstacles read against busy rooftops
        ctx.globalAlpha = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(t * 5 + sd.id))
        ctx.drawImage(gl, ox - 3, oy - 3)
        ctx.globalAlpha = 1
        if (sd.kind === 'beam') {
          this.beams.push({ cv, x: ox, y: oy, w, base: this.sy(c.roof) })
          continue
        }
        ctx.drawImage(cv, ox - 1, oy - 1)
      }
      for (const e of c.extras) {
        if (e.type !== 'ledge') continue
        ctx.fillStyle = css(ACCENT)
        ctx.fillRect(this.sx(e.x), this.sy(e.y), 5, 2)
      }
    }
    // beam posts sit behind the runner
    ctx.fillStyle = css(mix(pal.shadow, [30, 30, 40], 0.3))
    for (const b of this.beams) {
      ctx.fillRect(b.x + 1, b.y, 1, b.base - b.y)
      ctx.fillRect(b.x + b.w - 2, b.y, 1, b.base - b.y)
    }
    // zip cables
    for (const [c] of visible) {
      for (const z of c.ziplines) {
        const x0 = this.sx(z.ax), y0 = this.sy(z.ay), x1 = this.sx(z.bx), y1 = this.sy(z.by)
        ctx.fillStyle = css(ACCENT)
        const n = Math.max(1, x1 - x0)
        for (let i = 0; i <= n; i++) {
          const x = x0 + i, y = Math.round(y0 + (y1 - y0) * (i / n))
          if (x < -2 || x > this.W + 2) continue
          ctx.fillRect(x, y, 1, 1)
        }
      }
    }
  }

  // Checkpoint pylons and the finish gate, standing at the front edge of the roof.
  drawGates(s, pal) {
    const { ctx } = this
    const left = this.cam.x - this.W / 2 / PPU - 4, right = this.cam.x + this.W / 2 / PPU + 4
    const t = this.cam.time
    for (const c of s.level.chunksIn(left, right)) {
      const gate = c.checkpoint || c.finish
      if (!gate) continue
      const finish = !!c.finish
      const passed = !finish && c.checkpoint.index <= this.passed
      const key = finish ? 'gate:finish' : `gate:${passed ? 'on' : 'off'}`
      const cv = this.sprite(key, pal.version, () => bakeGate(finish, passed))
      const x = this.sx(gate.x), y = this.sy(gate.y)
      // light column
      const col = finish ? [255, 47, 160] : passed ? [93, 255, 138] : [41, 243, 255]
      ctx.fillStyle = css(col)
      const h = 64 + Math.round(Math.sin(t * 3) * 3)
      for (let yy = 0; yy < h; yy++) {
        for (let xx = -2; xx <= 2; xx++) {
          if (dither(x + xx, y - yy + Math.floor(t * 20), (1 - yy / h) * (xx === 0 ? 0.9 : 0.35))) ctx.fillRect(x + xx, y - yy, 1, 1)
        }
      }
      ctx.drawImage(cv, x - (cv.width >> 1), y - cv.height)
    }
  }

  drawGhost(s) {
    const gst = s.ghost
    if (!gst) return
    const r = this.ghostRunner
    r.update(s.dt, gst, gst.x * PPU, gst.y * PPU, null)
    this.ghostClock -= s.raw
    if (this.ghostClock <= 0 && r.joints) {
      this.ghostClock = 1 / RASTER_FPS
      toCanvas(tint(r.raster(), [41, 243, 255]), this.ghostCanvas)
    }
    if (!r.joints) return
    this.ctx.globalAlpha = 0.45
    this.ctx.drawImage(this.ghostCanvas, this.sx(gst.x) - ORIGIN_X, this.sy(gst.y) - ORIGIN_Y)
    this.ctx.globalAlpha = 1
  }

  drawBeams() {
    for (const b of this.beams || []) this.ctx.drawImage(b.cv, b.x - 1, b.y - 1)
  }

  drawBirds(dt, px) {
    for (const b of this.birds) {
      b.t += dt
      if (!b.flying) {
        if (px > b.x - 10 && px < b.x + 4) {
          b.flying = true
          b.vx = b.rng.range(4, 9)
          b.vy = b.rng.range(3, 6)
        }
      } else {
        b.vy += dt * 0.8
        b.x += b.vx * dt
        b.y += b.vy * dt
      }
      const frame = b.flying ? 1 + (Math.floor(b.t * 14) & 1) : 0
      const x = this.sx(b.x), y = this.sy(b.y) - (b.flying ? 0 : b.back + 2)
      if (x < -6 || x > this.W + 6 || y < -6 || y > H) continue
      this.ctx.drawImage(this.birdFrames[frame], x, y)
    }
  }

  drawRunner(s, pal) {
    const { ctx } = this
    const r = this.runner
    if (s.mode !== 'paused') {
      this.rasterClock -= s.raw
      if (this.rasterClock <= 0 || !r.joints) {
        this.rasterClock = 1 / RASTER_FPS
        if (r.joints) {
          const buf = r.raster()
          toCanvas(buf, this.runnerCanvas)
          this.lastBuf = buf
        }
      }
    }
    if (!r.joints) return
    const x = this.sx(s.rx) - ORIGIN_X
    const y = this.sy(s.ry) - ORIGIN_Y
    // afterimages at speed and in focus
    const streak = (s.p.speed > 14 && s.mode === 'run') || s.focusVis > 0.3
    this.afterClock -= s.raw
    if (streak && this.afterClock <= 0 && this.lastBuf) {
      this.afterClock = 0.045
      const cv = this.afterPool[this.afterIndex++ % this.afterPool.length]
      toCanvas(tint(this.lastBuf, s.focusVis > 0.3 ? [120, 210, 255] : ACCENT), cv)
      this.after.unshift({ cv, wx: s.rx, wy: s.ry })
      if (this.after.length > 3) this.after.pop()
    }
    if (!streak) this.after.length = 0
    this.after.forEach((a, i) => {
      ctx.globalAlpha = 0.32 - i * 0.09
      ctx.drawImage(a.cv, this.sx(a.wx) - ORIGIN_X, this.sy(a.wy) - ORIGIN_Y)
    })
    ctx.globalAlpha = 1
    ctx.drawImage(this.runnerCanvas, x, y)
    if (s.p.state === 'zip') {
      ctx.fillStyle = css(mix(pal.shadow, [20, 20, 30], 0.5))
      ctx.fillRect(this.sx(s.rx) - 1, this.sy(s.ry + PHYS.ZIP_HANG) - 1, 4, 3)
    }
    if (s.p.state === 'wallrun' && Math.random() < 0.6) {
      this.particles.push({ x: s.rx - 0.2, y: s.ry + 0.1, vx: -2 - Math.random() * 2, vy: Math.random() * 1.5, life: 0.25, max: 0.25, color: [255, 200, 90], size: 1 })
    }
  }

  drawParticles(dt, pal) {
    const { ctx } = this
    const keep = []
    for (const q of this.particles) {
      q.life -= dt
      if (q.life <= 0) continue
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.vx *= 1 - dt * 3
      q.vy = q.vy * (1 - dt * 2) - dt * 2
      ctx.fillStyle = css(q.color || pal.dust)
      if (q.life / q.max < 0.35 && dither(Math.round(q.x * 7), Math.round(q.y * 7), 0.5)) continue
      ctx.fillRect(this.sx(q.x), this.sy(q.y), q.size, q.size)
      keep.push(q)
    }
    this.particles = keep.length > 400 ? keep.slice(-400) : keep
  }

  drawMist(pal, time) {
    const top = this.sy(-4)
    if (top >= H) return
    const cv = this.sprite('mist', pal.version, () => bakeMist(this.W, pal))
    this.ctx.drawImage(cv, 0, top)
    const bottom = top + cv.height
    if (bottom < H) {
      this.ctx.fillStyle = css(pal.lava)
      this.ctx.fillRect(0, bottom, this.W, H - bottom)
    }
    // heat shimmer sparks rising from the lava streets
    this.ctx.fillStyle = css(mix(pal.lava, [255, 230, 160], 0.5))
    for (let i = 0; i < 24; i++) {
      const x = Math.floor((hash(i, 9) * this.W + time * 10 * (0.5 + hash(i, 4))) % this.W)
      const rise = (time * (8 + hash(i, 5) * 10) + hash(i, 6) * 60) % 60
      const y = top + cv.height - rise
      if (y < H && y > top + cv.height * 0.4) this.ctx.fillRect(x, Math.round(y), 1, 1)
    }
  }

  drawWeather(s, pal) {
    const { ctx } = this
    if (pal.rain < 0.05) { this.drops.length = 0; return }
    const n = Math.floor(160 * pal.rain)
    while (this.drops.length < n) this.drops.push({ x: Math.random() * this.W, y: Math.random() * H, v: 260 + Math.random() * 160, near: Math.random() < 0.3 })
    const drift = -(s.p.speed * PPU * 0.5 + 30)
    for (const d of this.drops) {
      d.y += d.v * s.dt
      d.x += drift * s.dt * (d.near ? 1.4 : 1)
      if (d.y > H || d.x < -4) { d.y = -4; d.x = Math.random() * (this.W + 60) }
      ctx.fillStyle = d.near ? 'rgba(210,235,245,0.75)' : 'rgba(170,200,215,0.45)'
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, d.near ? 4 : 3)
    }
    this.lightningClock -= s.raw
    if (this.lightningClock <= 0) {
      this.lightningClock = 5 + Math.random() * 9
      this.lightning = 0.55
    }
    this.lightning = Math.max(0, this.lightning - s.raw * 3)
  }

  drawSpeedLines(s, pal) {
    const { ctx } = this
    const k = s.mode === 'run' ? s.speedK : 0
    if (k > 0 && Math.random() < k * 0.9) this.lines.push({ x: this.W + 4, y: Math.floor(Math.random() * H * 0.85), len: 8 + Math.random() * 26 })
    ctx.fillStyle = css(pal.light, 0.55)
    const v = s.p.speed * PPU * 2.2
    this.lines = this.lines.filter((l) => {
      l.x -= v * s.raw
      if (l.x + l.len < 0) return false
      ctx.fillRect(Math.round(l.x), l.y, Math.round(l.len), 1)
      return true
    })
  }

  // Focus drains color from everything that isn't runner-vision red.
  postFocus(amount) {
    const img = this.ctx.getImageData(0, 0, this.W, H)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2]
      if (r > 150 && r > g * 1.6 && r > b * 1.6) continue
      const l = r * 0.3 + g * 0.59 + b * 0.11
      d[i] = r + (l * 0.85 - r) * amount
      d[i + 1] = g + (l * 0.92 - g) * amount
      d[i + 2] = b + (l * 1.15 - b) * amount
    }
    this.ctx.putImageData(img, 0, 0)
  }
}

// ── whole-screen bakes ─────────────────────────────────────────────────────

function bakeSky(W, pal) {
  const b = new PixelBuffer(W, H)
  const horizon = Math.round(H * 0.66)
  const bands = pal.sky
  const n = bands.length
  for (let y = 0; y < H; y++) {
    const t = Math.min(0.9999, y / horizon) * (n - 1)
    const i = Math.floor(t), f = t - i
    for (let x = 0; x < W; x++) {
      let c
      if (y >= horizon) c = bands[n - 1]
      else c = dither(x, y, (f - 0.55) / 0.45) ? bands[Math.min(n - 1, i + 1)] : bands[i]
      b.data[y * W + x] = pack(c)
    }
  }
  if (pal.sunSize > 0) {
    const cx = pal.sunX * W, cy = pal.sunY * H, r = pal.sunSize
    for (let y = Math.floor(cy - r * 2.2); y < cy + r * 2.2; y++) {
      for (let x = Math.floor(cx - r * 2.2); x < cx + r * 2.2; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        const idx = y * W + x
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        if (d < r) {
          let c = pal.sun
          if (pal.moon && hash(Math.floor(x / 3), Math.floor(y / 3)) < 0.18) c = mix(pal.sun, pal.sky[2], 0.35)
          // sunsets slice the disc with horizontal gaps
          if (!pal.moon && y > cy + r * 0.25 && ((y - Math.floor(cy)) % 5 === 0)) continue
          b.data[idx] = pack(c)
        } else if (d < r * 1.6 && dither(x, y, 0.5 * (1 - (d - r) / (r * 0.6)))) {
          b.data[idx] = pack(mix(pal.sun, pal.sky[Math.min(n - 1, Math.floor(y / horizon * (n - 1)))], 0.55))
        }
      }
    }
  }
  return b
}

function bakeHaze(W, pal) {
  const h = H - Math.round(H * 0.62)
  const b = new PixelBuffer(W, h)
  const c = pack(pal.haze)
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) if (dither(x, y, (y / h) * 1.3 - 0.15)) b.data[y * W + x] = c
  return b
}

function bakeMist(W, pal) {
  const h = 20 * PPU
  const b = new PixelBuffer(W, h)
  const haze = pack(pal.haze), lava = pack(pal.lava), lavaD = pack(mix(pal.lava, pal.haze, 0.5))
  for (let y = 0; y < h; y++) {
    const t = y / h
    for (let x = 0; x < W; x++) {
      let c = 0
      if (dither(x, y, t * 2.2)) c = haze
      if (t > 0.55 && dither(x, y, (t - 0.55) * 2.6)) c = lavaD
      if (t > 0.75 && dither(x, y, (t - 0.75) * 4)) c = lava
      b.data[y * W + x] = c
    }
  }
  return b
}

function bakeVignette(W, pal) {
  const b = new PixelBuffer(W, H)
  const c = pack(mix(pal.shadow, [0, 0, 0], 0.4))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2
      const r = Math.sqrt(dx * dx * 0.7 + dy * dy)
      if (dither(x, y, (r - 1.05) * 1.6)) b.data[y * W + x] = c
    }
  }
  return b
}

function tint(buf, color) {
  const out = new PixelBuffer(buf.w, buf.h)
  const c = pack(color)
  for (let i = 0; i < buf.data.length; i++) if (buf.data[i] >>> 24) out.data[i] = c
  return out
}

function bakeGate(finish, passed) {
  const b = new PixelBuffer(finish ? 22 : 13, finish ? 74 : 26)
  const post = pack([30, 28, 44]), dark = pack([12, 10, 20])
  if (finish) {
    b.rect(1, 0, 3, 74, post)
    b.rect(18, 0, 3, 74, post)
    for (let y = 2; y < 22; y++) for (let x = 4; x < 18; x++) b.set(x, y, ((x >> 1) + (y >> 1)) & 1 ? dark : pack([245, 245, 250]))
    b.rect(4, 22, 14, 2, pack([255, 47, 160]))
    b.rect(0, 72, 22, 2, dark)
    return b
  }
  const c = pack(passed ? [93, 255, 138] : [41, 243, 255])
  b.rect(5, 6, 3, 18, post)
  b.rect(2, 24, 9, 2, dark)
  // a hovering diamond beacon
  for (let i = 0; i < 4; i++) b.rect(6 - i, i, 1 + i * 2, 1, c)
  for (let i = 0; i < 3; i++) b.rect(4 + i, 4 + i, 5 - i * 2, 1, c)
  b.rect(5, 12, 3, 1, c)
  return b
}
