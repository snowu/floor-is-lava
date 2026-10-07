import './ui/style.css'
import { PHYS, FOCUS, RUN } from './sim/config.js'
import { Level } from './sim/level.js'
import { createPlayer, stepPlayer } from './sim/player.js'
import { Bot } from './sim/bot.js'
import { ScoreKeeper, COMBO_WINDOW } from './sim/score.js'
import { GhostRecorder, GhostPlayer } from './sim/ghost.js'
import { TRACKS, dailyTrack, levelOptions } from './sim/tracks.js'
import { Input } from './input.js'
import { Audio } from './audio.js'
import { Hud, formatTime, medalFor } from './ui/hud.js'
import { PixelView } from './pixel/view.js'

const DEMO_SEED = 20261007
const TOAST = {
  vault: 'SPEED VAULT', clamber: 'CLAMBER', roll: 'ROLL', wallrun: 'WALLRUN', walljump: 'WALL KICK',
  zip: 'ZIPLINE', spring: 'LAUNCH', grab: 'LEDGE', climb: 'WALL CLIMB', slidejump: 'SLIDE JUMP',
}

const store = {
  get(key, fallback) { try { return localStorage.getItem(key) ?? fallback } catch { return fallback } },
  set(key, value) { try { localStorage.setItem(key, value) } catch { /* storage unavailable */ } },
  json(key) { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } },
}

const isTouch = window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0
const params = new URLSearchParams(location.search)
const fixedSeed = params.has('seed') ? Number(params.get('seed')) : null

const view = new PixelView()
const input = new Input()
const audio = new Audio()
const hud = new Hud(isTouch)
hud.setMuted(audio.muted)

const MODES = [{ kind: 'endless' }, ...TRACKS.map((track) => ({ kind: 'trial', track })), { kind: 'trial', track: dailyTrack() }]

const g = {
  mode: 'title',            // title | countdown | run | respawn | finish | over | paused
  pausedFrom: null,
  sel: Math.min(MODES.length - 1, Number(store.get('fil.sel', 0)) || 0),
  kind: 'endless',
  track: null,
  level: null,
  player: null,
  bot: null,
  prevX: 0, prevY: 0,
  acc: 0,
  clock: 0,
  phaseT: 0,
  topSpeed: 0,
  moves: 0,
  falls: 0,
  focus: 0,
  focusActive: false,
  focusVis: 0,
  flash: 0,
  fade: 1,
  district: '',
  hintsShown: new Set(),
  cpNext: 0,
  splits: [],
  pb: null,
  ghost: null,
  recorder: null,
  score: null,
  lives: 0,
  overAt: 0,
  tutorialDone: store.get('fil.tutorial', '0') === '1',
  focusHinted: store.get('fil.focusHint', '0') === '1',
  comboHinted: store.get('fil.comboHint', '0') === '1',
}

// ── records ──────────────────────────────────────────────────────────────

const endlessBest = () => Number(store.get('fil.best.endless', 0)) || 0
const trialPB = (track) => store.json(`fil.pb.${track.id}`)

function menuItems() {
  return MODES.map((m) => {
    if (m.kind === 'endless') {
      return { name: 'ENDLESS', sub: 'combo score attack', best: `${endlessBest().toLocaleString()} PTS`, medal: -1 }
    }
    const pb = trialPB(m.track)
    const sub = m.track.daily ? `${m.track.daily.slice(4, 6)}/${m.track.daily.slice(6)} · ${m.track.length} M` : `time trial · ${m.track.length} M`
    return { name: m.track.name.toUpperCase(), sub, best: pb ? formatTime(pb.time) : '—', medal: pb ? medalFor(pb.time, m.track.medals) : -1 }
  })
}

function renderMenu() {
  hud.menu(menuItems(), g.sel, (i) => start(i))
}

// ── worlds and runs ──────────────────────────────────────────────────────

function buildWorld(level, demo) {
  g.level = level
  level.ensure(260)
  view.bind(level)
  g.player = createPlayer(0, level.roofAt(0))
  g.prevX = g.player.x
  g.prevY = g.player.y
  g.bot = demo ? new Bot(level) : null
  g.acc = 0
  g.focus = 0
  g.focusActive = false
  g.district = ''
  view.snap(g.player.x, g.player.y)
}

function toTitle() {
  buildWorld(new Level(DEMO_SEED), true)
  g.mode = 'title'
  hud.showHud(false)
  hud.showOver(false)
  hud.showPaused(false)
  hud.showTitle(true)
  renderMenu()
}

function start(i) {
  g.sel = i
  store.set('fil.sel', String(i))
  newRun()
}

function newRun() {
  audio.start()
  const m = MODES[g.sel]
  g.kind = m.kind
  g.track = m.track ?? null
  const level = g.kind === 'trial'
    ? new Level(g.track.seed, levelOptions(g.track))
    : new Level(fixedSeed ?? (Math.random() * 2 ** 32) >>> 0)
  buildWorld(level, false)
  g.clock = 0
  g.phaseT = 0
  g.topSpeed = 0
  g.moves = 0
  g.falls = 0
  g.cpNext = 0
  g.splits = []
  g.hintsShown.clear()
  g.score = new ScoreKeeper()
  g.score.teleport(g.player.x)
  g.lives = RUN.LIVES
  g.fade = 1
  view.passed = 0

  if (g.kind === 'trial') {
    level.ensure(g.track.length + 120)
    g.pb = trialPB(g.track)
    g.ghost = g.pb?.ghost ? new GhostPlayer(g.pb.ghost) : null
    g.recorder = new GhostRecorder()
    hud.setupRun('trial', {
      title: g.track.name.toUpperCase(),
      best: g.pb ? `PB ${formatTime(g.pb.time)}` : 'NO TIME YET',
      checkpoints: level.checkpoints,
      length: level.finish.x,
    })
    g.mode = 'countdown'
    g.countShown = -1
  } else {
    g.pb = null
    g.ghost = null
    g.recorder = null
    hud.setupRun('endless', { title: '', best: `BEST ${endlessBest().toLocaleString()}`, lives: RUN.LIVES })
    g.mode = 'run'
    if (!g.comboHinted && g.tutorialDone) {
      g.comboHinted = true
      store.set('fil.comboHint', '1')
      hud.hint('combo')
    }
  }
  input.clearEdges()
  hud.showTitle(false)
  hud.showOver(false)
  hud.showPaused(false)
  hud.showHud(true)
  hud.showZones()
  setTimeout(() => hud.hideZones(), 3500)
}

function toMenu() {
  audio.ctx?.resume()
  toTitle()
}

function setPaused(on) {
  if (on && (g.mode === 'run' || g.mode === 'countdown' || g.mode === 'respawn')) {
    g.pausedFrom = g.mode
    g.mode = 'paused'
    hud.showPaused(true)
    audio.ctx?.suspend()
  } else if (!on && g.mode === 'paused') {
    g.mode = g.pausedFrom
    hud.showPaused(false)
    input.clearEdges()
    audio.ctx?.resume()
  }
}

function toggleMute() {
  audio.start()
  audio.setMuted(!audio.muted)
  hud.setMuted(audio.muted)
}

const playing = () => ['countdown', 'run', 'respawn', 'finish', 'paused', 'over'].includes(g.mode)

input.on('nav', (d) => {
  if (g.mode !== 'title') return
  g.sel = (g.sel + d + MODES.length) % MODES.length
  renderMenu()
})
input.on('confirm', () => {
  if (g.mode === 'title') start(g.sel)
  else if (g.mode === 'over' && performance.now() - g.overAt > 400) newRun()
})
input.on('enter', () => {
  if (g.mode === 'title') start(g.sel)
  else if (g.mode === 'paused') { hud.showPaused(false); toMenu() }
  else if (g.mode === 'over') newRun()
})
input.on('restart', () => {
  if (!playing()) return
  audio.ctx?.resume()
  newRun()
})
input.on('back', () => {
  if (g.mode === 'paused') setPaused(false)
  else if (g.mode === 'over') toMenu()
  else setPaused(true)
})
input.on('pause', () => setPaused(g.mode !== 'paused'))
input.on('mute', toggleMute)

const click = (id, fn) => document.getElementById(id).addEventListener('click', fn)
click('btn-pause', () => setPaused(g.mode !== 'paused'))
click('btn-mute', toggleMute)
click('btn-retry', () => newRun())
click('btn-menu', () => toMenu())
click('btn-resume', () => setPaused(false))
click('btn-restart', () => { audio.ctx?.resume(); newRun() })
click('btn-quit', () => toMenu())
document.getElementById('btn-focus').addEventListener('touchstart', (e) => { e.preventDefault(); input.focusPressed = true }, { passive: false })
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true) })

if (import.meta.env.DEV) {
  input.on('debug', async () => {
    if (g.gui) { g.gui.destroy(); g.gui = null; return }
    const { default: GUI } = await import('lil-gui')
    g.gui = new GUI({ title: 'Tuning' })
    const phys = g.gui.addFolder('Physics')
    for (const k of Object.keys(PHYS)) if (typeof PHYS[k] === 'number' && k !== 'FIXED_DT') phys.add(PHYS, k)
  })
}

// ── game events ──────────────────────────────────────────────────────────

function onEvent(e) {
  const p = g.player
  const live = g.mode === 'run'
  if (live || g.mode === 'title') audio.event(e.type, e)
  view.event(e, p)
  if (e.type === 'bonk') g.flash = 0.12
  if (e.type === 'dead') {
    if (g.mode === 'title') toTitle()
    else if (live) startRespawn()
    return
  }
  if (!live) return
  if (e.type === 'hardland') hud.toast('HARD LANDING', 'ROLL IT NEXT TIME')
  if (TOAST[e.type]) {
    g.moves++
    if (g.kind === 'trial') hud.toast(TOAST[e.type])
  }
  if (g.kind === 'endless') {
    const result = g.score.event(e.type, p.speed)
    if (result === 'bail') { hud.comboResult('bail', g.score.log.at(-1).points); audio.event('bail') }
  }
  const gain = FOCUS.GAIN[e.type]
  if (gain) g.focus = Math.min(1, g.focus + gain)
}

function startRespawn() {
  g.mode = 'respawn'
  g.phaseT = 0
  g.falls++
  g.focusActive = false
  view.setFloor(g.player.y + 2)
  audio.event('dead')
  if (g.kind === 'endless') {
    if (g.score.bail() === 'bail') hud.comboResult('bail', g.score.log.at(-1).points)
    g.lives--
  }
}

function respawn() {
  const r = g.level.respawnPoint(g.prevX)
  g.player = createPlayer(r.x, r.y)
  g.player.speed = PHYS.SPEED_MIN
  g.prevX = r.x
  g.prevY = r.y
  g.acc = 0
  g.score.teleport(r.x)
  view.snap(r.x, r.y)
  g.fade = 0.8
  g.mode = 'run'
  audio.event('respawn')
}

function passCheckpoint(i) {
  view.passed = i + 1
  audio.event('checkpoint')
  if (g.kind !== 'trial') {
    hud.toast('CHECKPOINT')
    return
  }
  g.splits.push(g.clock)
  const pbSplit = g.pb?.splits?.[i]
  hud.split(pbSplit != null ? g.clock - pbSplit : null)
}

function finishTrial() {
  g.splits.push(g.clock)
  const time = g.clock
  const prev = g.pb
  const newBest = !prev || time < prev.time
  if (newBest) {
    store.set(`fil.pb.${g.track.id}`, JSON.stringify({ time, splits: g.splits, ghost: g.recorder.data() }))
  }
  g.result = {
    kind: 'trial', track: g.track.name, time, newBest, prevBest: prev?.time ?? null, prevSplits: prev?.splits ?? null,
    medals: g.track.medals, splits: g.splits, falls: g.falls, topSpeed: g.topSpeed, moves: g.moves,
  }
  const pbSplit = prev?.time
  hud.split(pbSplit != null ? time - pbSplit : null)
  audio.event(newBest ? 'best' : 'finish')
  g.mode = 'finish'
  g.phaseT = 0
}

function endEndless() {
  const best = endlessBest()
  const score = Math.floor(g.score.total)
  const newBest = score > best
  if (newBest) store.set('fil.best.endless', String(score))
  g.result = {
    kind: 'endless', score, best: Math.max(best, score), newBest, distance: Math.max(0, g.player.x),
    bestCombo: g.score.bestCombo, topSpeed: g.topSpeed,
  }
  if (newBest) audio.event('best')
  showResults()
}

function showResults() {
  g.mode = 'over'
  g.overAt = performance.now()
  input.clearEdges()
  hud.showHud(false)
  hud.showOver(true, g.result)
}

// ── per-frame systems ────────────────────────────────────────────────────

const events = []
const IDLE = { jump: false, jumpPressed: false, down: false, downPressed: false }

function stepPhysics(dt) {
  g.acc += dt
  let steps = 0
  while (g.acc >= PHYS.FIXED_DT && steps < 12) {
    g.acc -= PHYS.FIXED_DT
    steps++
    const p = g.player
    g.prevX = p.x
    g.prevY = p.y
    g.level.ensure(p.x + 200)
    const control = g.bot ? g.bot.input(p) : g.mode === 'run' ? input.consume() : IDLE
    events.length = 0
    stepPlayer(p, control, PHYS.FIXED_DT, g.level, events)
    for (const e of events) onEvent(e)
    if (g.mode !== 'run' && g.mode !== 'title' && g.mode !== 'finish') break
  }
  if (g.acc > PHYS.FIXED_DT * 4) g.acc = 0
}

function updateFocus(dt) {
  const p = g.player
  if (p.speed >= 15) g.focus = Math.min(1, g.focus + FOCUS.GAIN_AT_SPEED * dt)
  if (input.takeFocus()) {
    if (g.focusActive) g.focusActive = false
    else if (g.focus >= FOCUS.MIN_TO_START) {
      g.focusActive = true
      audio.event('focus')
    }
  }
  if (g.focusActive) {
    g.focus = Math.max(0, g.focus - FOCUS.DRAIN * dt)
    if (g.focus <= 0) g.focusActive = false
  }
  if (!g.focusHinted && g.focus >= FOCUS.MIN_TO_START && p.x > 400) {
    g.focusHinted = true
    store.set('fil.focusHint', '1')
    hud.hint('focus')
  }
}

function updateHints() {
  if (g.tutorialDone || g.kind !== 'endless') return
  const p = g.player
  for (const h of g.level.hintsIn(p.x + 2, p.x + 8 + p.speed * 1.1)) {
    if (g.hintsShown.has(h)) continue
    g.hintsShown.add(h)
    hud.hint(h.key)
  }
  const tutorialEnd = g.level.chunks.find((c) => c.id === 6)
  if (tutorialEnd && p.x > tutorialEnd.x0 + 20) {
    g.tutorialDone = true
    store.set('fil.tutorial', '1')
  }
}

const COUNT = ['3', '2', '1', 'GO']

let last = performance.now()
let time = 0

function frame(now) {
  requestAnimationFrame(frame)
  const raw = Math.min(0.1, (now - last) / 1000)
  last = now
  time += raw
  input.pollGamepad()
  if (g.mode === 'title' && input.takeAny()) start(g.sel)
  else input.takeAny()

  const p = g.player
  let scale = 1
  if (g.mode === 'run') {
    updateFocus(raw)
    scale = g.focusActive ? FOCUS.TIME_SCALE : 1
  } else if (g.mode === 'respawn') {
    scale = 0.6
  }
  const dt = g.mode === 'paused' ? 0 : raw * scale

  if (g.mode === 'countdown') {
    const beat = Math.min(3, Math.floor(g.phaseT / 0.6))
    if (beat !== g.countShown) {
      g.countShown = beat
      hud.countdown(COUNT[beat])
      audio.event(beat === 3 ? 'go' : 'count')
    }
    g.phaseT += raw
    if (g.phaseT >= 1.8) {
      g.mode = 'run'
      input.clearEdges()
      setTimeout(() => { if (g.mode !== 'countdown') hud.countdown('') }, 500)
    }
  } else if (g.mode === 'run' || g.mode === 'title' || g.mode === 'finish') {
    stepPhysics(dt)
    if (g.mode === 'run' || g.mode === 'respawn') {
      g.clock += dt
      g.topSpeed = Math.max(g.topSpeed, p.speed)
      updateHints()
    }
  } else if (g.mode === 'respawn') {
    g.clock += raw
    g.phaseT += raw
    p.vy = Math.max(p.vy - PHYS.G * dt, -PHYS.MAX_FALL)
    p.y += p.vy * dt
    if (g.phaseT >= RUN.RESPAWN_TIME) {
      if (g.kind === 'endless' && g.lives <= 0) endEndless()
      else respawn()
    }
  }

  if (g.mode === 'finish') {
    g.phaseT += raw
    if (g.phaseT > 1.3) showResults()
  }

  const cur = g.player
  if (g.mode === 'run') {
    const cps = g.level.checkpoints
    while (g.cpNext < cps.length && cur.x >= cps[g.cpNext].x) passCheckpoint(g.cpNext++)
    if (g.kind === 'trial' && g.level.finish && cur.x >= g.level.finish.x) finishTrial()
    if (g.kind === 'endless') {
      const r = g.score.update(dt, cur)
      if (r === 'bank') { hud.comboResult('bank', g.score.log.at(-1).points); audio.event('bank', { mult: g.score.log.at(-1).mult }) }
    }
    if (g.recorder) g.recorder.sample(g.clock, cur)
  }
  if (g.mode !== 'paused') g.level.prune(cur.x - 90)

  const alpha = g.mode === 'run' || g.mode === 'title' || g.mode === 'finish' ? g.acc / PHYS.FIXED_DT : 1
  const distance = Math.max(0, cur.x)
  g.focusVis += ((g.focusActive ? 1 : 0) - g.focusVis) * Math.min(1, raw * 6)
  g.flash = Math.max(0, g.flash - raw * 2)
  g.fade = Math.max(0, g.fade - raw * 2.5)
  const ghost = g.ghost && (g.mode === 'run' || g.mode === 'respawn' || g.mode === 'finish') ? g.ghost.at(g.clock) : null

  view.frame({
    raw, dt, time, mode: g.mode === 'countdown' ? 'run' : g.mode, p: cur, level: g.level, distance,
    rx: g.prevX + (cur.x - g.prevX) * alpha,
    ry: g.prevY + (cur.y - g.prevY) * alpha,
    idle: g.mode === 'countdown',
    ghost: ghost && !ghost.done ? ghost : null,
    speedK: smoothstep(cur.speed, 11, PHYS.SPEED_MAX),
    focusVis: g.focusVis, flash: g.flash, fade: g.fade,
  })

  if (['run', 'respawn', 'countdown', 'finish'].includes(g.mode)) {
    const name = view.districtName(distance)
    const base = {
      speed: cur.speed,
      focus: g.focus,
      focusActive: g.focusActive,
      focusReady: g.focus >= FOCUS.MIN_TO_START,
    }
    if (g.kind === 'trial') {
      const finishX = g.level.finish?.x ?? 1
      hud.update({ ...base, score: Math.max(0, finishX - cur.x), time: g.clock, progress: Math.min(1, cur.x / finishX) })
    } else {
      const s = g.score
      hud.update({
        ...base,
        score: s.total,
        lives: g.lives,
        sub: `${Math.floor(distance).toLocaleString()} M · ${name.toUpperCase()}`,
        combo: { mult: s.mult, points: s.pending, moves: s.moves.join(' · '), timer: s.timer / COMBO_WINDOW },
      })
    }
    if (name !== g.district) {
      g.district = name
      hud.district(name)
    }
  }

  audio.update(raw, {
    speed: g.mode === 'run' || g.mode === 'title' ? cur.speed : 0,
    zip: cur.state === 'zip' && g.mode === 'run',
    focus: g.focusVis,
    playing: g.mode === 'run',
  })
}

function smoothstep(x, a, b) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

view.onStep = (kind) => {
  if (g.mode === 'run') audio.step(kind)
}

toTitle()
requestAnimationFrame(frame)
if (import.meta.env.DEV) window.__game = { g, view, start, newRun }
