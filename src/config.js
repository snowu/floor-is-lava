// Single source of truth for all physics and world constants.
// Import from here — never redeclare these values in other files.

// ── player physics ───────────────────────────────────────────────────────────
export const GRAVITY       = 50    // m/s² downward acceleration
export const JUMP_SPEED    = 18     // m/s initial upward velocity on jump
export const MOVE_SPEED_MIN = 10    // m/s starting horizontal speed
export const MOVE_SPEED_MAX = 15    // m/s cap after acceleration
export const MOVE_ACCEL     = 0.5   // m/s² speed increase while moving
export const MOVE_SPEED     = MOVE_SPEED_MIN // alias for derived calculations
export const COYOTE_TIME   = 0.50  // seconds after walking off edge where jump still works
export const MAX_AIR_JUMPS = 1     // extra jumps allowed while airborne (double jump)

// ── player dimensions ────────────────────────────────────────────────────────
export const PLAYER_WIDTH  = 0.4   // AABB width and depth for collision
export const PLAYER_HEIGHT = 2.0   // AABB height (feet to top of head)
export const HAND_OFFSET_Y = 1.5   // y above feet where hands are (for ledge detection)
export const LEDGE_REACH   = 0.4   // max distance below box top where hands can grab
export const LEDGE_H_MARGIN = 0.3  // horizontal margin outside box footprint still counts

// ── world ────────────────────────────────────────────────────────────────────
export const GROUND_Y       = 0    // y of the ground/death plane
export const SPAWN_POS      = { x: 0, y: 1, z: -3 }

// ── corridor ─────────────────────────────────────────────────────────────────
export const CORRIDOR_WIDTH  = 14
export const CORRIDOR_HEIGHT = 12
export const SEGMENT_DEPTH   = 40
export const WALL_THICKNESS  = 0.5

// ── fog / generation ─────────────────────────────────────────────────────────
export const FOG_START          = 60
export const FOG_END            = 100
export const GENERATE_TIME_AHEAD = 2

// ── derived (computed once at import time) ───────────────────────────────────
export const SINGLE_JUMP_HEIGHT = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY)
export const SINGLE_JUMP_TIME   = (2 * JUMP_SPEED) / GRAVITY
export const DOUBLE_JUMP_HEIGHT = SINGLE_JUMP_HEIGHT * 2
export const DOUBLE_JUMP_TIME   = SINGLE_JUMP_TIME * 2
export const MAX_H_RANGE_SINGLE = MOVE_SPEED * SINGLE_JUMP_TIME
export const MAX_H_RANGE_DOUBLE = MOVE_SPEED * DOUBLE_JUMP_TIME

// ── wall run ─────────────────────────────────────────────────────────────
export const WALLRUN_SLIDE_SPEED = 2      // constant downward slide speed
export const WALLRUN_JUMP_SPEED = 12     // vertical kick off wall
export const WALLRUN_KICK_SPEED = 6      // horizontal push away from wall
export const WALLRUN_KICK_DURATION = 0.3 // seconds the kick overrides input
export const WALLRUN_SPEED_BOOST  = 3   // extra m/s added on wall jump
export const WALLRUN_MAX_BOOST    = 8   // cap on accumulated boost
export const WALLRUN_MIN_HEIGHT = 1.5    // min Y above ground to start wall run
export const BILLBOARD_WIDTH    = 0.5    // thickness of billboard panels
export const BILLBOARD_HEIGHT   = 10     // how tall they are
export const BILLBOARD_DEPTH    = 15     // how long along Z
export const BILLBOARD_GAP_EVERY  = 3    // insert a billboard gap every N platforms
export const BILLBOARD_GAP_SIZE  = 12   // Z distance of the gap (no boxes)
export const BILLBOARD_Y_OFFSET  = 1    // billboard bottom relative to departure platform top
export const BILLBOARD_X_OFFSET = 8      // distance from center on X axis

// ── animation ────────────────────────────────────────────────────────────────
export const ANIM_IDLE_BOB_SPEED    = 2      // radians/s for idle breathing
export const ANIM_IDLE_BOB_AMOUNT   = 0.02   // metres of vertical bob
export const ANIM_IDLE_ARM_ANGLE    = 0.09   // ~5° rest splay

export const ANIM_RUN_LEG_AMPLITUDE = 0.8    // radians max leg swing
export const ANIM_RUN_ARM_AMPLITUDE = 0.6    // radians max arm swing
export const ANIM_RUN_FREQ_SCALE    = 1.2    // multiplied by horizontal speed
export const ANIM_LANDING_DURATION  = 0.15   // seconds
export const ANIM_PULLUP_DURATION   = 0.3    // seconds
