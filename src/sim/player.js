// Side-on runner physics. Pure and deterministic: no DOM, no rendering.
// The player auto-runs toward +x; the world is a set of axis-aligned solids.
//
// Position (x, y) is the bottom-center of the body (the feet).

import { PHYS } from './config.js'

const EPS = 0.001
const LOW_STATES = new Set(['slide', 'roll', 'stumble'])
const KINEMATIC_STATES = new Set(['vault', 'mantle'])

export function createPlayer(x, y) {
  return {
    x, y,
    vy: 0,
    speed: PHYS.SPEED_START,
    state: 'run',
    t: 0,
    alive: true,
    cause: null,
    jumpBuffer: 0,
    jumpHoldActive: false,
    jumpHoldT: 0,
    rollTimer: 0,
    coyote: 0,
    climbUsed: false,
    climbT: 0,
    wall: null,
    kin: null,
    panel: null,
    lastPanel: null,
    zip: null,
    zipV: 0,
    lastZip: null,
    support: null,
  }
}

export function clonePlayer(p) {
  return { ...p, kin: p.kin ? { ...p.kin } : null }
}

export function bodyHeight(p) {
  return LOW_STATES.has(p.state) ? PHYS.H_LOW : PHYS.H
}

export function isGrounded(p) {
  return p.state === 'run' || p.state === 'slide' || p.state === 'roll' ||
    p.state === 'stumble' || p.state === 'blocked'
}

function setState(p, state) {
  p.state = state
  p.t = 0
}

function emit(events, type, p, extra) {
  if (events) events.push({ type, x: p.x, y: p.y, ...extra })
}

function solidsAround(level, p) {
  return level.solidsIn(p.x - 3, p.x + 3 + p.speed * 0.1)
}

function hasHeadroom(p, solids, h = PHYS.H) {
  const hw = PHYS.W / 2
  for (const s of solids) {
    if (s.x0 >= p.x + hw || s.x1 <= p.x - hw) continue
    if (s.y1 <= p.y + 0.01 || s.y0 >= p.y + h) continue
    return false
  }
  return true
}

function findSupport(p, solids) {
  const hw = PHYS.W / 2
  let best = null
  for (const s of solids) {
    if (s.x0 >= p.x + hw - EPS || s.x1 <= p.x - hw + EPS) continue
    if (Math.abs(s.y1 - p.y) > 0.05) continue
    if (!best || s.y1 > best.y1) best = s
  }
  return best
}

function gainSpeed(p, amount) {
  p.speed = Math.min(PHYS.SPEED_MAX, p.speed + amount)
}

function accelerate(p, dt) {
  if (p.speed < PHYS.SPEED_MIN) {
    p.speed = Math.min(PHYS.SPEED_MIN, p.speed + PHYS.RECOVER_ACCEL * dt)
  } else {
    const headroom = 1 - 0.6 * (p.speed - PHYS.SPEED_MIN) / (PHYS.SPEED_MAX - PHYS.SPEED_MIN)
    p.speed = Math.min(PHYS.SPEED_MAX, p.speed + PHYS.ACCEL * headroom * dt)
  }
}

// Advance x; returns the nearest solid face crossed (player is NOT clamped).
function sweepX(p, dt, solids) {
  const hw = PHYS.W / 2
  const h = bodyHeight(p)
  const nx = p.x + p.speed * dt
  let hit = null
  for (const s of solids) {
    if (s.y1 <= p.y + EPS || s.y0 >= p.y + h - EPS) continue
    if (s.x0 < p.x + hw - 0.01) continue
    if (s.x0 >= nx + hw) continue
    if (!hit || s.x0 < hit.x0) hit = s
  }
  p.x = nx
  return hit
}

// Advance y; returns a landed-on solid when falling onto a top.
function sweepY(p, dt, solids) {
  const hw = PHYS.W / 2
  const h = bodyHeight(p)
  const ny = p.y + p.vy * dt
  if (p.vy <= 0) {
    let land = null
    for (const s of solids) {
      if (s.x0 >= p.x + hw || s.x1 <= p.x - hw) continue
      if (s.y1 > p.y + EPS || s.y1 < ny) continue
      if (!land || s.y1 > land.y1) land = s
    }
    if (land) return land
    p.y = ny
    return null
  }
  let ceil = null
  for (const s of solids) {
    if (s.x0 >= p.x + hw || s.x1 <= p.x - hw) continue
    if (s.y0 < p.y + h - EPS || s.y0 > ny + h) continue
    if (!ceil || s.y0 < ceil.y0) ceil = s
  }
  if (ceil) {
    p.y = ceil.y0 - h
    p.vy = 0
    p.jumpHoldActive = false
  } else {
    p.y = ny
  }
  return null
}

function startJump(p, vy, events, type = 'jump') {
  p.vy = vy
  p.jumpBuffer = 0
  p.coyote = 0
  p.jumpHoldActive = true
  p.jumpHoldT = 0
  p.support = null
  setState(p, 'air')
  emit(events, type, p)
}

function launchSpring(p, s, events) {
  p.y = s.y1
  p.vy = PHYS.SPRING_V
  p.jumpHoldActive = false
  p.coyote = 0
  p.support = null
  gainSpeed(p, PHYS.BONUS_SPRING)
  setState(p, 'air')
  emit(events, 'spring', p)
}

function startKinematic(p, state, kin) {
  p.kin = { t: 0, sx: p.x, sy: p.y, ...kin }
  p.vy = 0
  setState(p, state)
}

function startMantle(p, s, events) {
  const hw = PHYS.W / 2
  p.x = s.x0 - hw
  startKinematic(p, 'mantle', {
    ex: s.x0 + hw + 0.05,
    ey: s.y1,
    T: PHYS.MANTLE_TIME,
    mode: 'mantle',
    end: 'run',
  })
  p.speed = Math.max(PHYS.SPEED_MIN * 0.85, p.speed * 0.8)
  p.wall = null
  emit(events, 'grab', p, { top: s.y1 })
}

function startClimb(p, s, events) {
  p.x = s.x0 - PHYS.W / 2
  p.wall = s
  p.vy = PHYS.CLIMB_V
  p.climbT = 0
  p.climbUsed = true
  p.jumpBuffer = 0
  p.speed = 0
  setState(p, 'climb')
  emit(events, 'climb', p)
}

function land(p, s, events) {
  const impact = -p.vy
  p.y = s.y1
  p.vy = 0
  p.climbUsed = false
  p.jumpHoldActive = false
  p.support = s
  if (s.kind === 'spring') {
    launchSpring(p, s, events)
    return
  }
  if (impact >= PHYS.HARD_LAND_V) {
    if (p.rollTimer > 0) {
      setState(p, 'roll')
      gainSpeed(p, PHYS.BONUS_ROLL)
      emit(events, 'roll', p, { impact })
    } else {
      setState(p, 'stumble')
      p.speed = Math.min(p.speed, PHYS.STUMBLE_SPEED)
      emit(events, 'hardland', p, { impact })
    }
  } else {
    setState(p, 'run')
    emit(events, 'land', p, { impact })
  }
  p.rollTimer = 0
}

// Ran into a solid face while on the ground.
function groundFace(p, s, input, events) {
  const hw = PHYS.W / 2
  const dh = s.y1 - p.y
  if (s.kind === 'spring') {
    launchSpring(p, s, events)
    return
  }
  if (s.kind === 'beam') {
    p.x = s.x0 - hw
    if (s.y0 - p.y >= PHYS.H_LOW) {
      setState(p, 'stumble')
      p.speed = Math.min(p.speed, PHYS.STUMBLE_SPEED)
      emit(events, 'bonk', p, { beam: true })
    } else {
      p.speed = 0
      setState(p, 'blocked')
      p.wall = s
    }
    return
  }
  if (dh <= PHYS.STEP) {
    p.y = s.y1
    return
  }
  p.x = s.x0 - hw
  if (dh <= PHYS.CLAMBER_MAX) {
    const clamber = dh > PHYS.VAULT_MAX
    const width = s.x1 - s.x0
    const speed = Math.max(p.speed, PHYS.SPEED_MIN)
    if (width <= 2.5) {
      const ex = s.x1 + hw + 0.15
      startKinematic(p, 'vault', {
        ex, ey: p.y, peak: s.y1 + 0.12,
        T: Math.max(0.2, (ex - p.x) / speed) * (clamber ? 1.35 : 1),
        mode: 'arc', end: 'air', top: s.y1,
      })
    } else {
      startKinematic(p, 'vault', {
        ex: s.x0 + hw + 0.4 + speed * 0.1, ey: s.y1,
        T: PHYS.VAULT_STEP_TIME * (clamber ? 1.6 : 1),
        mode: 'step', end: 'run', top: s.y1,
      })
    }
    if (clamber) {
      p.speed = Math.max(PHYS.SPEED_MIN * 0.8, p.speed * 0.75)
      emit(events, 'clamber', p)
    } else {
      gainSpeed(p, PHYS.BONUS_VAULT)
      emit(events, 'vault', p)
    }
    return
  }
  if (p.jumpBuffer > 0 || input.jumpPressed) {
    startClimb(p, s, events)
    return
  }
  p.speed = 0
  p.wall = s
  setState(p, 'blocked')
  emit(events, 'bonk', p)
}

// Ran into a solid face while airborne (or wall-running).
function airFace(p, s, input, events) {
  const hw = PHYS.W / 2
  const dh = s.y1 - p.y
  if (s.kind === 'spring' && dh <= 0.6) {
    launchSpring(p, s, events)
    return
  }
  if (s.kind !== 'beam' && dh <= 0.5) {
    p.vy = Math.min(p.vy, 0)
    land(p, s, events)
    return
  }
  p.x = s.x0 - hw
  if (s.kind === 'beam') {
    p.speed = 0
    p.jumpHoldActive = false
    emit(events, 'bonk', p, { beam: true })
    return
  }
  const hands = p.y + bodyHeight(p) + PHYS.REACH
  if (hands >= s.y1) {
    startMantle(p, s, events)
    return
  }
  if (input.jump && !p.climbUsed) {
    startClimb(p, s, events)
    return
  }
  p.wall = s
  p.speed = 0
  setState(p, 'wallslide')
  emit(events, 'bonk', p, { air: true })
}

function airGravity(p, input) {
  let g = PHYS.G
  if (!input.jump) p.jumpHoldActive = false
  if (p.jumpHoldActive && p.vy > 0 && p.jumpHoldT < PHYS.JUMP_HOLD_TIME) {
    g *= PHYS.JUMP_HOLD_GRAVITY
  }
  return g
}

function tryAttach(p, level, events) {
  for (const panel of level.wallrunsIn(p.x - 1, p.x + 1)) {
    if (panel.id === p.lastPanel) continue
    if (p.x < panel.x0 || p.x > panel.x1 || p.y < panel.y0 || p.y > panel.y1) continue
    p.panel = panel
    p.lastPanel = panel.id
    p.vy = Math.max(-1, Math.min(p.vy, PHYS.WALLRUN_ENTER_VY))
    p.jumpHoldActive = false
    gainSpeed(p, PHYS.BONUS_WALLRUN)
    setState(p, 'wallrun')
    emit(events, 'wallrun', p)
    return true
  }
  for (const zip of level.ziplinesIn(p.x - 1, p.x + 1)) {
    if (zip.id === p.lastZip) continue
    if (p.x < zip.ax + 0.2 || p.x > zip.bx - 2) continue
    const ly = zipY(zip, p.x)
    if (Math.abs(p.y + PHYS.ZIP_HANG - ly) > PHYS.ZIP_CATCH) continue
    p.zip = zip
    p.lastZip = zip.id
    p.zipV = Math.max(p.speed, PHYS.ZIP_MIN)
    p.y = ly - PHYS.ZIP_HANG
    p.vy = 0
    p.jumpHoldActive = false
    setState(p, 'zip')
    emit(events, 'zip', p)
    return true
  }
  return false
}

export function zipY(zip, x) {
  return zip.ay + (x - zip.ax) * (zip.by - zip.ay) / (zip.bx - zip.ax)
}

function stepKinematic(p, dt) {
  const k = p.kin
  k.t += dt
  const u = Math.min(1, k.t / k.T)
  if (k.mode === 'arc') {
    p.x = k.sx + (k.ex - k.sx) * u
    const rise = u < 0.35 ? u / 0.35 : u > 0.7 ? (1 - u) / 0.3 : 1
    p.y = k.sy + (k.peak - k.sy) * (1 - (1 - rise) * (1 - rise))
  } else if (k.mode === 'step') {
    p.x = k.sx + (k.ex - k.sx) * u
    const e = Math.min(1, u * 1.6)
    p.y = k.sy + (k.ey - k.sy) * (1 - (1 - e) * (1 - e))
  } else {
    const uy = Math.min(1, u / 0.7)
    const ux = Math.max(0, (u - 0.35) / 0.65)
    p.y = k.sy + (k.ey - k.sy) * (1 - (1 - uy) * (1 - uy))
    p.x = k.sx + (k.ex - k.sx) * ux * ux * (3 - 2 * ux)
  }
  if (u >= 1) {
    p.x = k.ex
    p.y = k.ey
    p.kin = null
    p.vy = 0
    setState(p, k.end)
  }
}

export function stepPlayer(p, input, dt, level, events) {
  if (!p.alive) return
  p.t += dt
  if (input.jumpPressed) p.jumpBuffer = PHYS.JUMP_BUFFER
  else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt)
  if (input.downPressed && !isGrounded(p)) p.rollTimer = PHYS.ROLL_WINDOW
  else p.rollTimer = Math.max(0, p.rollTimer - dt)
  p.coyote = Math.max(0, p.coyote - dt)

  if (KINEMATIC_STATES.has(p.state)) {
    stepKinematic(p, dt)
    finish(p, level, events)
    return
  }

  const solids = solidsAround(level, p)

  switch (p.state) {
    case 'run':
    case 'slide':
    case 'roll':
    case 'stumble':
      stepGround(p, input, dt, solids, events)
      break
    case 'blocked':
      p.speed = 0
      if (p.jumpBuffer > 0 && p.wall) {
        startClimb(p, p.wall, events)
      } else if (input.downPressed && p.wall && p.wall.kind === 'beam') {
        setState(p, 'slide')
        p.speed = PHYS.STUMBLE_SPEED
        emit(events, 'slide', p)
      } else if (!findSupport(p, solids)) {
        setState(p, 'air')
      }
      break
    case 'air':
      stepAir(p, input, dt, solids, level, events)
      break
    case 'climb':
      stepClimb(p, input, dt, solids, events)
      break
    case 'wallslide':
      stepWallslide(p, input, dt, solids, events)
      break
    case 'wallrun':
      stepWallrun(p, input, dt, solids, events)
      break
    case 'zip':
      stepZip(p, input, dt, solids, events)
      break
  }
  finish(p, level, events)
}

function finish(p, level, events) {
  if (p.y < level.killY(p.x)) {
    p.alive = false
    p.cause = 'fell'
    setState(p, 'dead')
    emit(events, 'dead', p, { cause: 'fell' })
  }
}

function stepGround(p, input, dt, solids, events) {
  const st = p.state
  if (st === 'run') accelerate(p, dt)
  else if (st === 'slide') p.speed = Math.max(Math.min(p.speed, PHYS.SPEED_MIN * 0.85), p.speed - PHYS.SLIDE_DECEL * dt, PHYS.STUMBLE_SPEED)
  else if (st === 'stumble') p.speed = Math.min(PHYS.STUMBLE_SPEED, p.speed + PHYS.RECOVER_ACCEL * dt)

  const canJump = st === 'run' || st === 'slide' || (st === 'roll' && p.t > 0.2) || (st === 'stumble' && p.t > 0.25)
  if (p.jumpBuffer > 0 && canJump && hasHeadroom(p, solids)) {
    startJump(p, PHYS.JUMP_V, events, st === 'slide' ? 'slidejump' : 'jump')
    stepAir(p, input, dt, solids, null, events)
    return
  }
  if (st === 'run' && input.downPressed) {
    setState(p, 'slide')
    emit(events, 'slide', p)
  }

  const hit = sweepX(p, dt, solids)
  if (hit) {
    groundFace(p, hit, input, events)
    if (p.state !== 'run' && p.state !== 'slide' && p.state !== 'roll' && p.state !== 'stumble') return
  }

  const support = findSupport(p, solids)
  if (!support) {
    p.coyote = PHYS.COYOTE
    p.support = null
    setState(p, 'air')
    p.vy = 0
    return
  }
  p.support = support
  p.y = support.y1

  if (p.state === 'slide' && p.t >= PHYS.SLIDE_TIME && hasHeadroom(p, solids)) setState(p, 'run')
  else if (p.state === 'roll' && p.t >= PHYS.ROLL_TIME && hasHeadroom(p, solids)) setState(p, 'run')
  else if (p.state === 'stumble' && p.t >= PHYS.STUMBLE_TIME && hasHeadroom(p, solids)) setState(p, 'run')
}

function stepAir(p, input, dt, solids, level, events) {
  if (p.coyote > 0 && p.jumpBuffer > 0) {
    startJump(p, PHYS.JUMP_V, events)
  }
  const g = airGravity(p, input)
  if (p.jumpHoldActive && p.vy > 0) p.jumpHoldT += dt
  p.vy = Math.max(p.vy - g * dt, -PHYS.MAX_FALL)

  const hit = sweepX(p, dt, solids)
  if (hit) {
    airFace(p, hit, input, events)
    if (p.state !== 'air') return
  }
  const landed = sweepY(p, dt, solids)
  if (landed) {
    land(p, landed, events)
    return
  }
  if (level) tryAttach(p, level, events)
}

function stepClimb(p, input, dt, solids, events) {
  const s = p.wall
  p.climbT += dt
  const g = p.climbT < PHYS.CLIMB_TIME ? PHYS.CLIMB_G : PHYS.G
  p.vy -= g * dt
  const landed = sweepY(p, dt, solids)
  if (landed) {
    land(p, landed, events)
    return
  }
  if (p.y + PHYS.H + PHYS.REACH >= s.y1) {
    startMantle(p, s, events)
    return
  }
  if (p.vy <= 0 && p.climbT > PHYS.CLIMB_TIME) setState(p, 'wallslide')
}

function stepWallslide(p, input, dt, solids, events) {
  const s = p.wall
  p.speed = 0
  if (!s || s.y1 <= p.y) {
    setState(p, 'air')
    return
  }
  if (p.jumpBuffer > 0 && !p.climbUsed) {
    startClimb(p, s, events)
    return
  }
  p.vy = Math.max(p.vy - PHYS.G * dt, -PHYS.WALLSLIDE_V)
  const landed = sweepY(p, dt, solids)
  if (landed) land(p, landed, events)
}

function stepWallrun(p, input, dt, solids, events) {
  const panel = p.panel
  if (p.jumpBuffer > 0) {
    p.panel = null
    startJump(p, PHYS.WALLRUN_JUMP_V, events, 'walljump')
    return
  }
  p.vy = Math.max(p.vy - PHYS.WALLRUN_G * dt, -PHYS.WALLRUN_MAX_FALL)
  const hit = sweepX(p, dt, solids)
  if (hit) {
    p.panel = null
    setState(p, 'air')
    airFace(p, hit, input, events)
    return
  }
  const landed = sweepY(p, dt, solids)
  if (landed) {
    p.panel = null
    land(p, landed, events)
    emit(events, 'wallrunEnd', p)
    return
  }
  if (p.x > panel.x1 || p.y < panel.y0) {
    p.panel = null
    setState(p, 'air')
    emit(events, 'wallrunEnd', p)
  }
}

function stepZip(p, input, dt, solids, events) {
  const z = p.zip
  const len = Math.hypot(z.bx - z.ax, z.by - z.ay)
  const cos = (z.bx - z.ax) / len
  const sin = (z.by - z.ay) / len
  p.zipV = Math.min(PHYS.ZIP_MAX, p.zipV + PHYS.ZIP_ACCEL * dt)
  p.speed = Math.min(PHYS.SPEED_MAX, p.zipV * cos)
  p.x += p.zipV * cos * dt
  p.y = zipY(z, p.x) - PHYS.ZIP_HANG
  const release = p.jumpBuffer > 0 || p.x >= z.bx - 1.2
  if (!release) return
  p.zip = null
  p.speed = Math.max(PHYS.SPEED_MIN, Math.min(PHYS.SPEED_MAX, p.zipV * cos))
  if (p.jumpBuffer > 0) {
    startJump(p, PHYS.JUMP_V * 0.7, events, 'zipjump')
  } else {
    p.vy = p.zipV * sin * 0.3
    setState(p, 'air')
    emit(events, 'zipEnd', p)
  }
}

// True when the player can no longer land anywhere: used by tests and the planner.
export function isDoomed(p, level) {
  if (!p.alive) return true
  if (p.state === 'wallslide' && level.roofAt(p.x) === null) return true
  if (p.state !== 'air' && p.state !== 'wallslide' && p.state !== 'climb') return false
  return p.y < level.lowestRoofAhead(p.x) - 1.5
}
