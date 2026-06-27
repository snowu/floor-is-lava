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

  // ── kick (E mid-air) ──────────────────────────────────────────────────────
  KICK_LEG_REACH:   1.2,   // how far legs extend forward from player center
  KICK_LEG_HEIGHT:  0.5,   // Y height of the leg hitbox (centered at hip level)
  KICK_HIP_Y:       0.7,   // Y offset from feet where kick hitbox starts

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

  // ── camera ─────────────────────────────────────────────────────────────────
  CAMERA_FOV:             90,
  CAMERA_SENSITIVITY:     0.002,
  FREE_CAM_HEIGHT:        80,
  FREE_CAM_DISTANCE:      10,
  FP_HAND_X:              0.3,
  FP_HAND_Y:              -0.35,
  FP_HAND_Z:              -0.45,
  TP_CAM_DISTANCE:        5,
  TP_CAM_HEIGHT:          3,

  // ── lighting ──────────────────────────────────────────────────────────────
  AMBIENT_INTENSITY:      0.4,
  DIR_LIGHT_X:            10,
  DIR_LIGHT_Y:            20,
  DIR_LIGHT_Z:            10,

  // ── lava ──────────────────────────────────────────────────────────────────
  LAVA_SPEED:             0.045,
  LAVA_UV_SCALE:          0.06,
  LAVA_HEAVE_AMP:         0.6,
  LAVA_HEAVE_FREQ:        0.5,
  LAVA_HEAVE_SPEED:       0.15,
  LAVA_BUBBLE_AMP1:       0.3,
  LAVA_BUBBLE_FREQ1:      2.0,
  LAVA_BUBBLE_SPEED1:     0.4,
  LAVA_BUBBLE_AMP2:       0.15,
  LAVA_BUBBLE_FREQ2:      4.0,
  LAVA_BUBBLE_SPEED2:     0.5,
  LAVA_POP_AMP:           0.8,
  LAVA_POP_FREQ:          3.0,
  LAVA_POP_SPEED:         0.8,
  LAVA_POP_EXP:           3.0,
  LAVA_WARP_STRENGTH:     3.0,
  LAVA_FLOW_SPEED1:       0.15,
  LAVA_FLOW_SPEED2:       0.1,
  LAVA_FLOW_SPEED3:       0.05,
  LAVA_FLOW_SPEED4:       0.04,
  LAVA_DETAIL_NEAR:       8.0,
  LAVA_DETAIL_RANGE:      25.0,
  LAVA_OCTAVES_MIN:       2.0,
  LAVA_OCTAVES_MAX:       5.0,
  LAVA_CRUST_THRESHOLD:   0.35,
  LAVA_ORANGE_THRESHOLD:  0.65,
  LAVA_PULSE_FREQ:        1.5,
  LAVA_PULSE_SPEED:       0.6,
  LAVA_PULSE_EXP:         4.0,
  LAVA_PULSE_INTENSITY:   0.25,
  LAVA_CRACK_FREQ:        4.0,
  LAVA_CRACK_WARP:        1.5,
  LAVA_CRACK_WIDTH_NEAR:  0.1,
  LAVA_CRACK_WIDTH_FAR:   0.5,
  LAVA_CRACK_INTENSITY:   0.4,
  LAVA_GLOW_BASE:         1.4,
  LAVA_GLOW_PULSE:        0.4,

  // ── spawn platform ────────────────────────────────────────────────────────
  SPAWN_PLAT_SIZE:        3,
  WARMUP_COUNT:           4,
  DOUBLE_JUMP_SIZE_SCALE: 0.8,

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
