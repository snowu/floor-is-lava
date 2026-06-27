// Single source of truth for all physics and world constants.
// Import `config` — values are mutable at runtime via debug menu (F5).

const config = {
  // ── player physics ──────────────────────────────────────────────────────────
  GRAVITY:        50,
  JUMP_SPEED:     18,
  MOVE_SPEED_MIN: 8,
  MOVE_SPEED_MAX: 15,
  MOVE_ACCEL:     0.3,
  COYOTE_TIME:    0.50,
  GROUND_STICK:   2,
  MAX_AIR_JUMPS:  1,

  // ── player dimensions ─────────────────────────────────────────────────────
  PLAYER_WIDTH:   0.4,
  PLAYER_HEIGHT:  2.0,
  HAND_OFFSET_Y:  1.5,
  LEDGE_REACH:    0.4,
  LEDGE_H_MARGIN: 0.3,

  // ── world ─────────────────────────────────────────────────────────────────
  GROUND_Y:       0,
  SPAWN_X:        0,
  SPAWN_Y:        1,
  SPAWN_Z:        -3,

  // ── corridor ──────────────────────────────────────────────────────────────
  CORRIDOR_WIDTH:  14,
  CORRIDOR_HEIGHT: 12,
  SEGMENT_DEPTH:   40,
  WALL_THICKNESS:  0.5,

  // ── fog / generation ──────────────────────────────────────────────────────
  FOG_START:            60,
  FOG_END:              100,
  GENERATE_TIME_AHEAD:  2,

  // ── wall run ──────────────────────────────────────────────────────────────
  WALLRUN_SLIDE_SPEED:   2,
  WALLRUN_JUMP_SPEED:    12,
  WALLRUN_KICK_SPEED:    6,
  WALLRUN_KICK_DURATION: 0.3,
  WALLRUN_SPEED_BOOST:   3,
  WALLRUN_MAX_BOOST:     8,
  WALLRUN_MIN_HEIGHT:    1.5,
  WALLRUN_GRACE_TIME:    1.0,
  WALLRUN_STICK_SPEED:   2,
  BILLBOARD_WIDTH:       0.5,
  BILLBOARD_HITBOX_PAD:  1.0,
  BILLBOARD_HEIGHT:      10,
  BILLBOARD_DEPTH:       15,
  BILLBOARD_GAP_EVERY:   3,
  BILLBOARD_GAP_SIZE:    12,
  BILLBOARD_Y_OFFSET:    1,
  BILLBOARD_X_OFFSET:    8,

  // ── platform generation ────────────────────────────────────────────────────
  MAX_DROP:               8,
  MIN_PLATFORM_SPACING:   1.5,
  FIRST_PLATFORM_GAP:     6,
  PLAT_HEIGHT_FRAC:       0.7,
  PLAT_RANGE_FRAC:        0.7,
  PLAT_MIN_GAP:           3,
  PLAT_MAX_GAP:           6,
  PLAT_DOUBLE_JUMP_CHANCE: 0.2,
  PLAT_MIN_PER_SEGMENT:   5,
  PLAT_MAX_PER_SEGMENT:   8,
  BOX_MIN_WIDTH:          2,
  BOX_MAX_WIDTH:          4,
  BOX_MIN_HEIGHT:         0.3,
  BOX_MAX_HEIGHT:         0.8,
  BOX_MIN_DEPTH:          2,
  BOX_MAX_DEPTH:          4,

  // ── animation ─────────────────────────────────────────────────────────────
  ANIM_IDLE_BOB_SPEED:    2,
  ANIM_IDLE_BOB_AMOUNT:   0.02,
  ANIM_IDLE_ARM_ANGLE:    0.09,
  ANIM_RUN_LEG_AMPLITUDE: 0.8,
  ANIM_RUN_ARM_AMPLITUDE: 0.6,
  ANIM_RUN_FREQ_SCALE:    1.2,
  ANIM_LANDING_DURATION:  0.15,
  ANIM_PULLUP_DURATION:   0.3,
}

// Derived values — recalculated on access
Object.defineProperties(config, {
  MOVE_SPEED:          { get() { return this.MOVE_SPEED_MIN }, enumerable: true },
  SPAWN_POS:           { get() { return { x: this.SPAWN_X, y: this.SPAWN_Y, z: this.SPAWN_Z } }, enumerable: true },
  SINGLE_JUMP_HEIGHT:  { get() { return (this.JUMP_SPEED * this.JUMP_SPEED) / (2 * this.GRAVITY) }, enumerable: true },
  SINGLE_JUMP_TIME:    { get() { return (2 * this.JUMP_SPEED) / this.GRAVITY }, enumerable: true },
  DOUBLE_JUMP_HEIGHT:  { get() { return this.SINGLE_JUMP_HEIGHT * 2 }, enumerable: true },
  DOUBLE_JUMP_TIME:    { get() { return this.SINGLE_JUMP_TIME * 2 }, enumerable: true },
  MAX_H_RANGE_SINGLE:  { get() { return this.MOVE_SPEED * this.SINGLE_JUMP_TIME }, enumerable: true },
  MAX_H_RANGE_DOUBLE:  { get() { return this.MOVE_SPEED * this.DOUBLE_JUMP_TIME }, enumerable: true },
})

export default config
