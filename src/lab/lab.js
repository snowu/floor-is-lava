// Style lab: the real physics and autopilot drive a course while the runner
// and obstacles are drawn in whichever style is picked, plus side-by-side
// close-ups, a pose sheet and an obstacle sheet for comparing looks.
import { Level } from '../sim/level.js'
import { Bot } from '../sim/bot.js'
import { createPlayer, stepPlayer, bodyHeight } from '../sim/player.js'
import { PHYS } from '../sim/config.js'
import { RunnerSprite, RUNNER_STYLES, RUNNERS, ORIGIN_X, ORIGIN_Y } from '../pixel/runner.js'
import { bakeObstacle, lipOf, bakePipe, bakePipeFront, pipeFrame, bakeFence, drawFenceLive } from '../pixel/obstacles.js'
import { bakeDecor, recede } from '../pixel/sprites.js'
import { specFor, bakeBillboard, billboardLight } from '../pixel/billboard.js'
import { bakeFacade } from '../pixel/city.js'
import { paletteAt, pinPalette, PALETTE_NAMES } from '../pixel/palette.js'
import { PPU } from '../pixel/sprites.js'
import { toCanvas, css, mix, pack, PixelBuffer } from '../pixel/pixels.js'
import { ACCENT } from '../pixel/palette.js'
import { RoofWater } from '../pixel/water.js'
import { bakeLightHalo, drawLightHalo, drawSteam, ParkourFX } from '../pixel/effects.js'
import { drawRoofSurface, drawContactShadow, drawRunnerContact, equipmentLight } from '../pixel/roof.js'

const $ = (id) => document.getElementById(id)
const runnerName = (id) => RUNNER_STYLES[id].name
const makeRunner = (id) => new RunnerSprite(id)
const state = { runner: 'courier', palette: 1, speed: 1, seed: 20261008, zoom: 2, paused: false, hitboxes: false, grid: false, pipeCount: 3, pipeSlide: false, wet: false }
let water = new RoofWater()
let motion = new ParkourFX()
const previewFX = new ParkourFX()
const closeupWater = RUNNERS.map(() => new RoofWater())
let stepRequested = false, visible = true
const gridOn = (ctx, W, H) => {
  if (!state.grid) return
  ctx.fillStyle = '#ffffff18'
  for (let x = 0; x < W; x += 8) ctx.fillRect(x, 0, 1, H)
  for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 1)
}
function collisionBox(ctx, x, y, w, h) {
  ctx.fillStyle = '#75dded22'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = '#75dded'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

// ── simulation ───────────────────────────────────────────────────────────

let level, bot, player, acc = 0, prev = { x: 0, y: 0 }
function reset() {
  water = new RoofWater()
  motion = new ParkourFX()
  closeupWater.forEach((fx) => { fx.drops = []; fx.ripples = [] })
  level = new Level(state.seed, { tutorial: false })
  level.ensure(300)
  player = createPlayer(0, level.roofAt(0))
  player.speed = PHYS.SPEED_MIN
  bot = new Bot(level)
  prev = { x: player.x, y: player.y }
  acc = 0
  cam.x = player.x * PPU + main.width * 0.18
  cam.y = (player.y + 1.5) * PPU
  for (const s of sprites.values()) s.chains = null
}

function step(dt) {
  acc += dt
  while (acc >= PHYS.FIXED_DT) {
    acc -= PHYS.FIXED_DT
    prev = { x: player.x, y: player.y }
    level.ensure(player.x + 150)
    const events = []
    stepPlayer(player, bot.input(player), PHYS.FIXED_DT, level, events)
    for (const e of events) motion.event(e.type, player, e)
    if (state.wet) for (const e of events) if (['land', 'hardland', 'landslide'].includes(e.type)) {
      water.splash(player.x, player.y, player.speed, 0.85, e.impact ?? 12)
      closeupWater.forEach((fx) => fx.splash(0, 0, player.speed, 0.85, e.impact ?? 12))
    }
    level.prune(player.x - 80)
    if (!player.alive) {
      const r = level.respawnPoint(player.x)
      player = createPlayer(r.x, r.y)
      player.speed = PHYS.SPEED_MIN
      prev = { x: r.x, y: r.y }
    }
    if (player.x > 3000) reset()
  }
}

// One RunnerSprite per (style, view) so each keeps its own springs and cloth.
const sprites = new Map()
function sprite(key, style) {
  if (!sprites.has(key)) sprites.set(key, makeRunner(style))
  return sprites.get(key)
}

// ── shared drawing ───────────────────────────────────────────────────────

const cache = new Map()
function baked(key, make) {
  if (!cache.has(key)) cache.set(key, toCanvas(make()))
  return cache.get(key)
}

function drawSky(ctx, W, H, pal) {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  pal.sky.forEach((c, i) => g.addColorStop(i / (pal.sky.length - 1), css(c)))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // a flat far skyline for depth
  ctx.fillStyle = css(pal.far)
  for (let x = 0, i = 0; x < W; i++) {
    const w = 14 + ((i * 37) % 30), h = 30 + ((i * 53) % 60)
    ctx.fillRect(x, H * 0.62 - h, w, H)
    x += w + ((i * 11) % 6)
  }
}

function drawWorld(ctx, W, H, cam, pal, t) {
  const foreground = [], boxes = []
  const sx = (x) => Math.round(x * PPU - cam.x + W / 2)
  const sy = (y) => Math.round(H / 2 - (y * PPU - cam.y))
  const left = (cam.x - W / 2) / PPU - 4, right = (cam.x + W / 2) / PPU + 4
  const chunks = [...level.chunksIn(left, right)]
  // wall-run walls stand behind the gap, as in the game
  for (const c of chunks) {
    for (const e of c.extras) {
      if (e.type !== 'wallrunWall') continue
      const panel = c.wallruns[0]
      const w = Math.round((e.x1 - e.x0) * PPU), rh = 6
      const m0 = rh + 5 + Math.round((e.top - panel.y1) * PPU), m1 = rh + 5 + Math.round((e.top - panel.y0 + 0.4) * PPU)
      const cv = baked(`w${c.id}:${pal.version}`, () => bakeFacade({ w, roofH: rh, style: (c.seed >> 3) % 2 === 0 ? 0 : 2, seed: c.seed + 5, pal, wall: 2, mural: [m0, m1] }))
      ctx.drawImage(cv, sx(e.x0), sy(e.top) - rh)
    }
  }
  for (const c of chunks) {
    const w = Math.round((c.x1 - c.x0) * PPU)
    const roofH = 10
    const cv = baked(`f${c.id}:${pal.version}`, () => bakeFacade({ w, roofH, style: c.style, seed: c.seed, pal, wall: c.tint % 5 }))
    ctx.drawImage(cv, sx(c.x0), sy(c.roof) - roofH)
    drawRoofSurface(ctx, { x: sx(c.x0), y: sy(c.roof), w, depth: roofH, seed: c.seed, pal, wet: state.wet ? 0.85 : 0, rain: state.wet ? 0.85 : 0, time: t })
    for (const z of c.ziplines) {
      ctx.fillStyle = css(ACCENT)
      const x0 = sx(z.ax), y0 = sy(z.ay), x1 = sx(z.bx), y1 = sy(z.by)
      for (let i = 0; i <= x1 - x0; i++) ctx.fillRect(x0 + i, Math.round(y0 + (y1 - y0) * i / (x1 - x0)), 1, 1)
    }
    for (const q of c.pads ?? []) {
      ctx.fillStyle = css(ACCENT)
      ctx.fillRect(sx(q.x0), sy(q.y) - 4, sx(q.x1) - sx(q.x0), 3)
    }
    for (const s of c.solids) {
      if (s.kind === 'roof') continue
      const layer = drawObstacle(ctx, s, sx(s.x0), sy(s.y1), sy(c.roof), pal)
      if (layer) foreground.push(layer)
      if (state.hitboxes) boxes.push({ x: sx(s.x0), y: sy(s.y1), w: Math.round((s.x1 - s.x0) * PPU), h: Math.round((s.y1 - s.y0) * PPU) })
    }
    for (const f of c.fences ?? []) fence(ctx, sx(f.x0), sx(f.x1), sy(f.y1), sy(f.y0), t, f.x0, pal)
  }
  return { sx, sy, foreground, boxes }
}

function drawObstacle(ctx, s, x, top, roofY, pal) {
  const w = Math.max(2, Math.round((s.x1 - s.x0) * PPU))
  const h = Math.max(2, Math.round((s.y1 - s.y0) * PPU))
  const lip = lipOf(s.sub)
  const cv = s.kind === 'beam' ? null : baked(`o:${s.sub}:${w}:${h}:${s.id}:${pal.version}`, () => bakeObstacle(s.sub, w, h, pal, s.id))
  drawContactShadow(ctx, x, roofY, w, pal)
  if (s.kind === 'beam') {
    const drop = roofY - (top + h) - 2
    const f = pipeFrame('beam', w, h, drop, s.id)
    ctx.drawImage(baked(`p:${w}:${h}:${drop}:${s.id}:${pal.version}`, () => bakePipe('beam', w, h, drop, pal, s.id)), x - f.ox, top - f.oy)
    return { cv: baked(`pf:${w}:${h}:${drop}:${s.id}:${pal.version}`, () => bakePipeFront('beam', w, h, drop, pal, s.id)), x: x - f.ox, y: top - f.oy }
  }
  ctx.drawImage(cv, x - 1, top - lip - 1)
}

function fence(ctx, x0, x1, top, base, t, key, pal, depth = 7) {
  const x = x0 + 2, h = base - top
  const cv = baked(`fe:${h}:${depth}:${pal.version}`, () => bakeFence(h, depth, pal))
  ctx.drawImage(cv, x - 2, base - cv.height + 1)
  drawFenceLive(ctx, x, base, h, depth, t, key)
}

// Rasterize a runner at its style's frame rate into a per-key canvas.
const rasters = new Map()
function runnerCanvas(key, r, dt) {
  let e = rasters.get(key)
  if (!e) rasters.set(key, (e = { canvas: document.createElement('canvas'), clock: 0 }))
  e.clock -= dt
  if (e.clock <= 0 && r.joints) {
    e.clock = 1 / r.style.fps
    toCanvas(r.raster(), e.canvas)
  }
  return e.canvas
}

// ── views ────────────────────────────────────────────────────────────────

const main = $('main')
const mctx = main.getContext('2d')
const cam = { x: 0, y: 0 }
const closeups = RUNNERS.map((id) => {
  const cv = document.createElement('canvas')
  cv.width = 96; cv.height = 72
  const fig = document.createElement('figure')
  const cap = document.createElement('figcaption')
  cap.textContent = runnerName(id)
  fig.append(cv, cap)
  fig.dataset.style = id
  fig.tabIndex = 0
  fig.setAttribute('role', 'button')
  fig.setAttribute('aria-label', `Select ${runnerName(id)}`)
  fig.addEventListener('click', () => pick('runner', id))
  fig.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); pick('runner', id) } })
  $('closeups').append(fig)
  return { id, cv, ctx: cv.getContext('2d'), fig }
})

let last = performance.now(), time = 0
function frame(now) {
  requestAnimationFrame(frame)
  const raw = Math.min(0.05, (now - last) / 1000)
  last = now
  if (!visible) return
  const dt = stepRequested ? 1 / 60 : state.paused ? 0 : raw * state.speed
  stepRequested = false
  time += dt
  step(dt)
  const pal = paletteAt(0)
  const a = acc / PHYS.FIXED_DT
  const rx = prev.x + (player.x - prev.x) * a, ry = prev.y + (player.y - prev.y) * a
  const W = main.width, H = main.height
  cam.x += (rx * PPU + W * 0.18 - cam.x) * Math.min(1, dt * 8)
  cam.y += ((ry + 1.5) * PPU - cam.y) * Math.min(1, dt * 4)
  drawSky(mctx, W, H, pal)
  const { sx, sy, foreground, boxes } = drawWorld(mctx, W, H, cam, pal, time)
  const rim = pal.rim
  // every style follows the same player, so the close-ups stay in sync
  for (const id of RUNNERS) {
    const r = sprite(`live:${id}`, id)
    const fx = closeupWater[RUNNERS.indexOf(id)]
    r.onStep = (kind) => {
      if (!state.wet || kind !== 'run') return
      const foot = r.joints?.[(r.lastStep & 1) ? 'ankleB' : 'ankleA']
      const dx = (foot?.[0] ?? 0) / PPU
      fx.splash(dx, 0, player.speed, 0.85)
      if (id === state.runner) water.splash(rx + dx, ry, player.speed, 0.85)
    }
    r.rim = rim
    r.rimDir = pal.sunX < 0.5 ? [-1, 1] : [1, 1]
    r.update(dt, player, rx * PPU, ry * PPU, null)
  }
  const sel = sprite(`live:${state.runner}`, state.runner)
  motion.update(dt, player, rx, ry)
  motion.draw(mctx, sx, sy)
  const floor = level.roofAt(rx), chunk = level.chunks.find((c) => rx >= c.x0 && rx <= c.x1)
  if (floor !== null) drawRunnerContact(mctx, { x: sx(rx), y: sy(ry), floor: sy(floor), pal, joints: sel.joints, span: chunk && [sx(chunk.x0), sx(chunk.x1)] })
  mctx.drawImage(runnerCanvas(`m:${state.runner}`, sel, dt), sx(rx) - ORIGIN_X, sy(ry) - ORIGIN_Y)
  water.update(dt)
  water.draw(mctx, sx, sy, pal)
  for (const f of foreground) mctx.drawImage(f.cv, f.x, f.y)
  for (const b of boxes) collisionBox(mctx, b.x, b.y, b.w, b.h)
  if (state.hitboxes) collisionBox(mctx, sx(rx) - PHYS.W * PPU / 2, sy(ry) - bodyHeight(player) * PPU, PHYS.W * PPU, bodyHeight(player) * PPU)
  gridOn(mctx, W, H)
  $('readout').textContent = `${player.state.toUpperCase()} · ${Math.round(player.speed * 3.6)} km/h`
  for (const c of closeups) {
    const r = sprite(`live:${c.id}`, c.id)
    c.ctx.fillStyle = css(mix(pal.sky[2], pal.shadow, 0.4))
    c.ctx.fillRect(0, 0, c.cv.width, c.cv.height)
    c.ctx.fillStyle = css(pal.roof)
    c.ctx.fillRect(0, 48, c.cv.width, 24)
    drawRoofSurface(c.ctx, { x: 0, y: 58, w: c.cv.width, depth: 10, seed: state.seed, pal, wet: state.wet ? 0.85 : 0, rain: state.wet ? 0.85 : 0, time })
    drawRunnerContact(c.ctx, { x: 48, y: 58, floor: 58, pal, joints: r.joints })
    c.ctx.drawImage(runnerCanvas(`c:${c.id}`, r, dt), 48 - ORIGIN_X, 58 - ORIGIN_Y)
    const fx = closeupWater[RUNNERS.indexOf(c.id)]
    fx.update(dt)
    fx.draw(c.ctx, (x) => 48 + x * PPU, (y) => 58 - y * PPU, pal)
    c.fig.classList.toggle('on', c.id === state.runner)
    c.fig.setAttribute('aria-pressed', String(c.id === state.runner))
    gridOn(c.ctx, c.cv.width, c.cv.height)
  }
  drawEffectsPreview(pal, dt)
}

function drawEffectsPreview(pal, dt) {
  const cv = $('effects'), ctx = cv.getContext('2d'), base = 100
  drawSky(ctx, cv.width, cv.height, pal)
  ctx.drawImage(baked(`fx:roof:${pal.version}`, () => bakeFacade({ w: cv.width, roofH: 15, style: 2, seed: state.seed, pal, wall: 1 })), 0, base - 15)
  let spec = specFor(state.seed, 'roof')
  for (let i = 1; spec.kind !== 'board'; i++) spec = specFor(state.seed + i, 'roof')
  const hue = billboardLight(spec, pal)
  const halo = baked(`fx:halo:${pal.version}`, () => bakeLightHalo(spec.w + 64, spec.ph + 52, hue))
  drawLightHalo(ctx, halo, 450 + spec.w / 2, base - 12 - spec.h + spec.ph / 2, pal.night * 0.9)
  ctx.drawImage(baked(`fx:sign:${pal.version}`, () => bakeBillboard(spec, pal, 0)), 450, base - 12 - spec.h)
  ctx.drawImage(baked(`fx:vent:${pal.version}`, () => bakeDecor('vents', 0.5, pal)), 320, base - 20)
  drawSteam(ctx, 332, base - 20, state.seed, time, pal)
  const r = sprite(`fx:${state.runner}`, state.runner)
  const p = { ...createPlayer(0, 0), state: 'slide', speed: 12 }
  r.rim = pal.rim; r.update(dt, p, time * 12 * PPU, 0)
  previewFX.update(dt, p, 0, 0)
  previewFX.draw(ctx, x => Math.round(190 + x * PPU), y => Math.round(base - y * PPU))
  drawRunnerContact(ctx, { x: 190, y: base, floor: base, pal, joints: r.joints })
  ctx.drawImage(runnerCanvas(`fx:${state.runner}`, r, dt), 190 - ORIGIN_X, base - ORIGIN_Y)
  gridOn(ctx, cv.width, cv.height)
}

// ── pose sheet ───────────────────────────────────────────────────────────

const POSES = [
  ['idle', { state: 'idle' }, 'idle'],
  ['run', { state: 'run', speed: 12 }, null, 0.18],
  ['sprint', { state: 'run', speed: 17 }, null, 0.33],
  ['jump', { state: 'air', vy: 9 }],
  ['apex', { state: 'air', vy: 0 }],
  ['fall', { state: 'air', vy: -14 }],
  ['slide', { state: 'slide' }],
  ['roll', { state: 'roll', t: 0.18 }],
  ['vault', { state: 'vault', kin: { t: 0.11, T: 0.22, mode: 'vault' } }],
  ['climb', { state: 'climb' }],
  ['wallrun', { state: 'wallrun', speed: 13 }],
  ['zipline', { state: 'zip' }],
  ['mantle', { state: 'mantle', kin: { t: 0.16, T: 0.32, mode: 'mantle' } }],
  ['stumble', { state: 'stumble' }],
]

function drawPoseSheet() {
  const pal = paletteAt(0)
  const cellW = 52, cellH = 60
  const cv = $('poses')
  cv.width = cellW * POSES.length
  cv.height = cellH * RUNNERS.length
  const ctx = cv.getContext('2d')
  ctx.fillStyle = css(mix(pal.sky[1], pal.shadow, 0.5))
  ctx.fillRect(0, 0, cv.width, cv.height)
  RUNNERS.forEach((id, row) => {
    POSES.forEach(([, o, mode, settle = 0.6], col) => {
      const r = makeRunner(id)
      r.rim = pal.rim
      const p = { ...createPlayer(0, 0), speed: 12, vy: 0, t: 0.1, ...o }
      for (let i = 0; i < 90; i++) {
        if (o.state === 'roll') p.t = o.t
        r.update(settle / 90, p, i * (p.speed ?? 0) * 0.2, 0, mode)
      }
      const x = col * cellW, y = row * cellH
      ctx.fillStyle = css(pal.roof)
      ctx.fillRect(x, y + 50, cellW, 1)
      ctx.drawImage(toCanvas(r.raster()), x + cellW / 2 - ORIGIN_X, y + 50 - ORIGIN_Y)
    })
  })
  $('pose-labels').innerHTML = POSES.map(([n]) => `<span>${n}</span>`).join('')
  $('pose-rows').innerHTML = RUNNERS.map((id) => `<span>${runnerName(id)}</span>`).join('')
  gridOn(ctx, cv.width, cv.height)
}

// ── obstacle sheet ───────────────────────────────────────────────────────

const OBS = [
  { sub: 'vent', kind: 'block', w: 1.4, h: 1.1, id: 3 },
  { sub: 'vent', kind: 'block', w: 1.1, h: 0.8, id: 1 },
  { sub: 'highbox', kind: 'block', w: 1.2, h: 2.0, id: 2 },
  { sub: 'beam', kind: 'beam', w: 2.2, h: 0.45, y0: 1.1, id: 5 },
  { sub: 'housing', kind: 'block', w: 5.5, h: 3, id: 4 },
  { sub: 'vent', kind: 'block', w: 1.6, h: 1.0, id: 2 },
  { sub: 'highbox', kind: 'block', w: 1.0, h: 1.6, id: 7 },
  { sub: 'beam', kind: 'beam', w: 1.6, h: 0.45, y0: 1.1, id: 6 },
  { sub: 'spring', kind: 'spring', w: 1.6, h: 0.5, id: 9 },
]


function drawObstacleSheet() {
  const host = $('obstacles')
  host.innerHTML = ''
  for (let pi = 0; pi < PALETTE_NAMES.length; pi++) {
    pinPalette(pi)
    const pal = paletteAt(0)
    const cv = document.createElement('canvas')
    cv.width = 720; cv.height = 90
    cv.style.width = `calc(${cv.width}px * var(--zoom))`
    const ctx = cv.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, 0, 90)
    pal.sky.forEach((c, i) => g.addColorStop(i / (pal.sky.length - 1), css(c)))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, cv.width, cv.height)
    ctx.drawImage(toCanvas(bakeFacade({ w: cv.width, roofH: 12, style: 0, seed: state.seed, pal, wall: 1 })), 0, 66)
    let x = 10
    for (const o of OBS) {
      const w = Math.round(o.w * PPU), h = Math.round(o.h * PPU)
      const top = 78 - Math.round((o.y0 ?? 0) * PPU) - h
      const id = o.id + state.seed
      const frame = o.kind === 'beam' ? pipeFrame('beam', w, h, 78 - top - h - 2, id) : null
      const pad = frame?.ox ?? 0
      drawObstacle(ctx, { ...o, id, x0: 0, x1: o.w, y0: 0, y1: o.h }, x + pad, top, 78, pal)
      if (state.hitboxes) collisionBox(ctx, x + pad, top, w, h)
      x += (frame?.W ?? w) + 14
    }
    fence(ctx, x + 4, x + 12, 78 - 36, 78, 1.3, state.seed, pal, 9)
    const r = makeRunner(state.runner)
    for (let i = 0; i < 40; i++) r.update(0.02, { ...createPlayer(0, 0), state: 'run', speed: 12 }, i * 3, 0, null)
    ctx.drawImage(toCanvas(r.raster()), 690 - ORIGIN_X, 78 - ORIGIN_Y)
    gridOn(ctx, cv.width, cv.height)
    const fig = document.createElement('figure')
    const cap = document.createElement('figcaption')
    cap.textContent = PALETTE_NAMES[pi]
    fig.append(cv, cap)
    host.append(fig)
  }
  pinPalette(state.palette)
}

// ── controls ─────────────────────────────────────────────────────────────

function seg(host, items, current, onPick) {
  host.innerHTML = ''
  for (const [value, label] of items) {
    const b = document.createElement('button')
    b.textContent = label
    b.setAttribute('aria-pressed', String(value === current))
    b.addEventListener('click', () => onPick(value))
    host.append(b)
  }
}

function render() {
  seg($('pick-runner'), RUNNERS.map((id) => [id, runnerName(id)]), state.runner, (v) => pick('runner', v))
  seg($('pick-palette'), PALETTE_NAMES.map((n, i) => [i, n]), state.palette, (v) => { state.palette = v; pinPalette(v); cache.clear(); render(); redrawSheets() })
  seg($('pick-speed'), [[1, '1×'], [0.5, '½×'], [0.25, '¼×'], [0.1, '⅒×']], state.speed, (v) => { state.speed = v; render() })
  seg($('pick-zoom'), [[1, '1×'], [2, '2×'], [3, '3×']], state.zoom, (v) => { state.zoom = v; document.documentElement.style.setProperty('--zoom', v); render() })
  $('pause').textContent = state.paused ? 'Play' : 'Pause'
  $('pause').setAttribute('aria-pressed', String(state.paused))
  $('runner-note').textContent = NOTES.runner[state.runner]
}

function pick(kind, v) {
  state[kind] = v
  render()
  if (kind === 'runner') { drawObstacleSheet(); drawPipeSheet() }
}

const NOTES = {
  runner: {
    classic: 'Today’s runner: dark top, white pants, red shoes, ponytail. Rasterized at 24 fps.',
    courier: 'Compact athletic runner: white training top, dark trousers, red gloves and shoes. Clear face profile, tapered ponytail and a relaxed arm swing. 30 fps.',
    windbreaker: 'Unlocks with gold on any trial. Same compact height in an orange windbreaker, with a loose hem, cyan scarf and soft ponytail. 60 fps.',
    techwear: 'Unlocks with gold on Sprint, Relay and Gauntlet. Same compact height, dark long coat, red scarf, cyan trim and white ponytail. 60 fps.',
  },
}

function sampleRunner(pal, pose = 'run') {
  const r = makeRunner(state.runner)
  r.rim = pal.rim
  r.rimDir = pal.sunX < 0.5 ? [-1, 1] : [1, 1]
  for (let i = 0; i < 40; i++) r.update(0.02, { ...createPlayer(0, 0), state: pose, speed: 12 }, i * 3, 0, null)
  return toCanvas(r.raster())
}

function roofSample(ctx, W, H, pal, base) {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  pal.sky.forEach((c, i) => g.addColorStop(i / (pal.sky.length - 1), css(c)))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.drawImage(toCanvas(bakeFacade({ w: W, roofH: 15, style: 0, seed: state.seed, pal, wall: 1 })), 0, base - 15)
  drawRoofSurface(ctx, { x: 0, y: base, w: W, depth: 15, seed: state.seed, pal, wet: state.wet ? 0.85 : 0 })
}

function drawPipeSheet() {
  const pal = paletteAt(0), host = $('pipes')
  host.replaceChildren()
  for (const count of [state.pipeCount, state.pipeCount === 2 ? 3 : 2]) {
    const cv = document.createElement('canvas')
    cv.width = 240; cv.height = 104
    const ctx = cv.getContext('2d'), w = count === 3 ? 38 : 28, h = 6, drop = 14
    const options = { count }
    const f = pipeFrame('beam', w, h, drop, state.seed, options)
    const laneX = 90 - w / 2
    const x = laneX - f.ox, y = 76 - drop - h - f.oy
    roofSample(ctx, cv.width, cv.height, pal, 78)
    ctx.drawImage(toCanvas(bakePipe('beam', w, h, drop, pal, state.seed, options)), x, y)
    if (state.pipeSlide) ctx.drawImage(sampleRunner(pal, 'slide'), 90 - ORIGIN_X, 78 - ORIGIN_Y)
    ctx.drawImage(toCanvas(bakePipeFront('beam', w, h, drop, pal, state.seed, options)), x, y)
    ctx.drawImage(sampleRunner(pal), 184 - ORIGIN_X, 78 - ORIGIN_Y)
    if (state.hitboxes) collisionBox(ctx, laneX, 76 - drop - h, w, h)
    gridOn(ctx, cv.width, cv.height)
    const fig = document.createElement('figure'), cap = document.createElement('figcaption')
    cap.textContent = `${count} parallel pipes / rear vent · scenery`
    fig.append(cv, cap)
    host.append(fig)
  }
}

function drawScenerySheet() {
  const pal = paletteAt(0), host = $('scenery')
  host.replaceChildren()
  const items = ['tank', 'antenna', 'ac', 'dish', 'skylight', 'vents', 'solar', 'sign'].map((type, i) => ({ name: type === 'ac' ? 'Rear AC · scenery' : type, asset: recede(bakeDecor(type, ((state.seed + i * 17) % 100) / 100, pal), pal.mid, 0.32) }))
  const facades = $('facades')
  facades.replaceChildren()
  for (let style = 0; style < 4; style++) {
    const cv = document.createElement('canvas')
    cv.width = 240; cv.height = 136
    const ctx = cv.getContext('2d')
    drawSky(ctx, cv.width, cv.height, pal)
    ctx.drawImage(toCanvas(bakeFacade({ w: cv.width, roofH: 10, style, seed: state.seed, pal, wall: style })), 0, 32)
    ctx.drawImage(sampleRunner(pal), 194 - ORIGIN_X, 42 - ORIGIN_Y)
    gridOn(ctx, cv.width, cv.height)
    const fig = document.createElement('figure'), cap = document.createElement('figcaption')
    cap.textContent = ['Brick / recessed windows', 'Glass / curtain wall', 'Concrete / panel bays', 'Metal / ribbed cladding'][style]
    fig.append(cv, cap)
    facades.append(fig)
  }
  for (let i = 0; i < 3; i++) items.push({ name: 'Wall billboard', asset: bakeBillboard(specFor(state.seed + i * 19, 'facade'), pal, 0) })
  // Use the same generator as the world and include each advertising mount.
  const seen = new Set()
  for (let i = 0; i < 120 && seen.size < 5; i++) {
    const spec = specFor(state.seed + i, i % 2 ? 'near' : 'facade')
    if (seen.has(spec.kind)) continue
    seen.add(spec.kind)
    items.push({ name: spec.kind, asset: bakeBillboard(spec, pal, 0) })
  }
  for (const { name, asset } of items) {
    const cv = document.createElement('canvas')
    cv.width = 128; cv.height = 90
    const ctx = cv.getContext('2d')
    ctx.fillStyle = css(mix(pal.sky[1], pal.shadow, 0.4))
    ctx.fillRect(0, 0, cv.width, cv.height)
    ctx.fillStyle = css(pal.roof)
    ctx.fillRect(0, 78, cv.width, 12)
    ctx.drawImage(toCanvas(asset), Math.floor((cv.width - asset.w) / 2), name.includes('facade') ? 20 : 78 - asset.h)
    gridOn(ctx, cv.width, cv.height)
    const fig = document.createElement('figure'), cap = document.createElement('figcaption')
    cap.textContent = name
    fig.append(cv, cap)
    host.append(fig)
  }
}

function redrawSheets() {
  drawPoseSheet()
  drawObstacleSheet()
  drawPipeSheet()
  drawScenerySheet()
  drawLightingSheet()
}

// The same lighting functions as the game, with identical dry/wet geometry.
function drawLightingSheet() {
  const host = $('lighting'), pal = paletteAt(0)
  host.replaceChildren()
  let spec = specFor(state.seed, 'roof')
  for (let i = 1; spec.kind !== 'board'; i++) spec = specFor(state.seed + i, 'roof')
  for (const wet of [0, 0.9]) {
    const cv = document.createElement('canvas'); cv.width = 340; cv.height = 132
    const ctx = cv.getContext('2d'), base = 96
    drawSky(ctx, cv.width, cv.height, pal)
    ctx.drawImage(toCanvas(bakeFacade({ w: cv.width, roofH: 15, style: 2, seed: state.seed, pal, wall: 1 })), 0, base - 15)
    const light = { x: 210 + spec.w / 2, w: spec.w, color: billboardLight(spec, pal), strength: 1 }
    drawRoofSurface(ctx, { x: 0, y: base, w: cv.width, depth: 15, seed: state.seed, pal, wet, rain: wet, time: 0.15, lights: [light] })
    ctx.drawImage(toCanvas(bakeBillboard(spec, pal, 0)), 210, base - 12 - spec.h)
    const w = 28, h = 6, drop = 14, f = pipeFrame('beam', w, h, drop, state.seed, { count: 2 })
    const x = 78 - w / 2 - f.ox, y = base - drop - h - 2 - f.oy
    drawContactShadow(ctx, 64, base, w, pal)
    ctx.drawImage(toCanvas(bakePipe('beam', w, h, drop, pal, state.seed, { count: 2 })), x, y)
    drawContactShadow(ctx, 246, base, 24, pal)
    ctx.drawImage(toCanvas(bakeObstacle('vent', 24, 12, equipmentLight(pal, 258, [light]), state.seed)), 245, base - 14)
    const r = makeRunner(state.runner); r.rim = pal.rim; r.rimDir = pal.sunX < 0.5 ? [-1, 1] : [1, 1]
    for (let i = 0; i < 40; i++) r.update(0.02, { ...createPlayer(0, 0), speed: 12 }, i * 3, 0)
    drawRunnerContact(ctx, { x: 155, y: base, floor: base, pal, joints: r.joints })
    ctx.drawImage(toCanvas(r.raster()), 155 - ORIGIN_X, base - ORIGIN_Y)
    ctx.drawImage(toCanvas(bakePipeFront('beam', w, h, drop, pal, state.seed, { count: 2 })), x, y)
    gridOn(ctx, cv.width, cv.height)
    const fig = document.createElement('figure'), cap = document.createElement('figcaption')
    cap.textContent = `${PALETTE_NAMES[state.palette]} / ${wet ? 'wet roof · neon reflections' : 'dry roof · contact shadows'}`
    fig.append(cv, cap); host.append(fig)
  }
}

function exportPNG(cv, name) {
  const link = document.createElement('a')
  link.download = `packet-loss-${name}.png`
  link.href = cv.toDataURL('image/png')
  link.click()
}

function pause() { state.paused = !state.paused; render() }
function singleStep() { state.paused = true; stepRequested = true; render() }
function applySeed() {
  const value = Number($('seed').value)
  if (!Number.isSafeInteger(value) || $('seed').value.trim() === '') { $('seed').setCustomValidity('Enter a whole-number seed.'); $('seed').reportValidity(); return }
  $('seed').setCustomValidity('')
  state.seed = value >>> 0
  $('seed').value = state.seed
  cache.clear()
  sprites.clear()
  rasters.clear()
  time = 0
  reset()
  redrawSheets()
}
function closeLab() {
  if (window.parent !== window) window.parent.postMessage({ type: 'close-art-lab' }, location.origin)
  else location.href = import.meta.env.BASE_URL
}
$('close-lab').addEventListener('click', closeLab)
$('pause').addEventListener('click', pause)
$('step').addEventListener('click', singleStep)
$('apply-seed').addEventListener('click', applySeed)
$('seed').addEventListener('input', () => $('seed').setCustomValidity(''))
$('seed').addEventListener('keydown', (e) => { if (e.code === 'Enter') applySeed() })
$('shuffle-seed').addEventListener('click', () => { $('seed').value = crypto.getRandomValues(new Uint32Array(1))[0]; applySeed() })
for (const key of ['hitboxes', 'grid']) $(key).addEventListener('change', () => { state[key] = $(key).checked; redrawSheets() })
$('pipe-count').addEventListener('change', () => { state.pipeCount = Number($('pipe-count').value); drawPipeSheet() })
for (const [id, type] of [['fx-landing', 'landslide'], ['fx-launch', 'spring'], ['fx-pickup', 'shard']]) {
  $(id).addEventListener('click', () => previewFX.event(type, { x: 0, y: 0 }, { quality: 1, y: type === 'shard' ? 2 : 0 }))
}
$('wet-roof').addEventListener('change', (e) => { state.wet = e.target.checked; redrawSheets() })
$('preview-slide').addEventListener('click', () => {
  state.pipeSlide = !state.pipeSlide
  $('preview-slide').setAttribute('aria-pressed', String(state.pipeSlide))
  drawPipeSheet()
})
$('export-poses').addEventListener('click', () => exportPNG($('poses'), 'poses'))
$('export-pipe').addEventListener('click', () => exportPNG(toCanvas(bakePipe('beam', state.pipeCount === 3 ? 38 : 28, 6, 14, paletteAt(0), state.seed, { count: state.pipeCount })), `pipes-${state.pipeCount}-vent-${state.seed}`))
window.addEventListener('keydown', (e) => {
  if (e.code === 'F3' || e.code === 'Escape') { e.preventDefault(); if (!e.repeat) closeLab(); return }
  if (e.target.closest('input, select, button, [role=button]')) return
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) pause() }
  if (e.code === 'Period') { e.preventDefault(); singleStep() }
})
window.addEventListener('message', (e) => {
  if (e.origin === location.origin && e.source === window.parent && e.data?.type === 'lab-visibility') visible = e.data.open
})
document.addEventListener('visibilitychange', () => { visible = !document.hidden })
window.__artLab = { state, get player() { return player }, get time() { return time }, get effects() { return previewFX } }

pinPalette(state.palette)
render()
reset()
redrawSheets()
requestAnimationFrame(frame)
