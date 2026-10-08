// Tuning constants for the simulation. Units are meters and seconds.
// Values are mutable at runtime through the dev tuning panel (F2).

export const PHYS = {
  FIXED_DT: 1 / 120,

  // body
  W: 0.6,
  H: 1.8,
  H_LOW: 0.9,
  REACH: 0.45,          // hands above head when grabbing a ledge
  STEP: 0.3,            // ledges this small are walked over

  // gravity and jumping
  G: 34,
  JUMP_V: 11,
  JUMP_HOLD_TIME: 0.25,
  JUMP_HOLD_GRAVITY: 0.5,
  COYOTE: 0.1,
  JUMP_BUFFER: 0.12,
  MAX_FALL: 40,
  AIR_JUMPS: 0,         // mid-air jumps per airtime (chrome can add one)
  AIR_JUMP_V: 10,

  // running speed
  SPEED_START: 7,
  SPEED_MIN: 9,
  SPEED_MAX: 17,
  ACCEL: 0.42,
  RECOVER_ACCEL: 7,

  // ground moves
  SLIDE_TIME: 0.7,
  SLIDE_DECEL: 1.0,
  ROLL_TIME: 0.5,
  ROLL_WINDOW: 0.45,
  HARD_LAND_V: 17,
  STUMBLE_TIME: 0.45,
  STUMBLE_SPEED: 5.5,

  // obstacles
  VAULT_MAX: 1.25,
  VAULT_REACH: 1.6,     // jump this close to a low obstacle and you vault it
  CLAMBER_MAX: 2.1,
  VAULT_STEP_TIME: 0.22,
  MANTLE_TIME: 0.32,

  // walls
  CLIMB_V: 10,
  CLIMB_G: 16,
  CLIMB_TIME: 0.45,
  WALLSLIDE_V: 4,
  WALLRUN_G: 7,
  WALLRUN_ENTER_VY: 4,
  WALLRUN_MAX_FALL: 2.5,
  WALLRUN_JUMP_V: 11.5,

  // ziplines and springboards
  ZIP_HANG: 1.95,       // line height above feet while hanging
  ZIP_CATCH: 0.5,
  ZIP_ACCEL: 9,
  ZIP_MIN: 10,
  ZIP_MAX: 21,
  SPRING_V: 16,

  // speed rewards for clean moves
  BONUS_VAULT: 0.5,
  BONUS_ROLL: 0.8,
  BONUS_WALLRUN: 1.2,
  BONUS_SPRING: 0.3,
}

export const WORLD = {
  ROOF_MIN: -2,
  ROOF_MAX: 30,
  KILL_DEPTH: 12,       // fall this far below the lowest nearby roof and you're gone
  BUILDING_FRONT_Z: 2,
  STREET_Y: -70,
  DIFFICULTY_DISTANCE: 3500,
}

export const RUN = {
  CHECKPOINT_EVERY: 250,
  RESPAWN_TIME: 0.9,
  LIVES: 3,
}

export const HEIST = {
  SECTORS: 5,
  SECTOR_LEN: 450,
  INTEGRITY: 3,
  TRACE_RATE: 0.022,     // per second, before moves pull it back down
  TRACE_PER_SECTOR: 0.25,
  TRACE_MOVE: 0.014,     // each clean move jams the trace a little
  TRACE_SHARD: 0.004,
  TRACE_ZAP: 0.22,
  TRACE_SPOT: 0.14,
  TRACE_TAKEDOWN: 0.08,
  TRACE_AFTER_BURN: 0.4, // where the meter drops after ICE burns you
  SHARD_RADIUS: 0.45,
  SHARD_EDDIES: 5,
  DRONE_W: 1.1,
  DRONE_H: 0.5,
  TAKEDOWN_VY: 9,
  REPAIR_COST: 60,
  REPAIR_STEP: 30,
  REROLL_COST: 30,
}

export const FOCUS = {
  TIME_SCALE: 0.4,
  DRAIN: 0.33,
  MIN_TO_START: 0.25,
  GAIN: { vault: 0.08, clamber: 0.04, roll: 0.15, wallrun: 0.18, walljump: 0.1, zip: 0.1, spring: 0.05, grab: 0.04, airjump: 0.05, takedown: 0.2 },
  GAIN_AT_SPEED: 0.03,
}

// Run-scoped overrides on top of PHYS (chrome upgrades). Each entry maps a
// PHYS key to a function of its current value; calling again first restores
// whatever the previous call changed, so setPhysMods({}) undoes everything.
const physSaved = {}

export function setPhysMods(mods) {
  for (const k of Object.keys(physSaved)) {
    PHYS[k] = physSaved[k]
    delete physSaved[k]
  }
  for (const [k, fn] of Object.entries(mods)) {
    physSaved[k] = PHYS[k]
    PHYS[k] = fn(PHYS[k])
  }
}
