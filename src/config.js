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

  // ── momentum ────────────────────────────────────────────────────────────
  MOMENTUM_MIN:            8,
  MOMENTUM_MAX:            25,
  MOMENTUM_ACCEL:          3,
  MOMENTUM_DECAY:          0.15,
  MOMENTUM_GROUND_FRICTION: 0.08,
  GRIND_SPEED_BOOST:       3,
  CHAIN_WINDOW:            1.0,
  CHAIN_MULTIPLIER:        1.2,

  // ── player dimensions ─────────────────────────────────────────────────────
  PLAYER_WIDTH:   0.4,
  PLAYER_HEIGHT:  2.0,
  PLAYER_SCALE:   1.4,
  HAND_OFFSET_Y:  1.5,
  LEDGE_REACH:    0.4,
  LEDGE_H_MARGIN: 0.3,
  LEDGE_GRAB_EXTEND: 0.8,
  LEDGE_PULLUP_TIME: 1.0,
  LEDGE_PULLUP_SPEED: 7,

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
  SEGMENT_DEPTH:   120,
  WALL_THICKNESS:  0.5,

  // ── fog / generation ──────────────────────────────────────────────────────
  FOG_START:            80,
  FOG_END:              200,
  GENERATE_TIME_AHEAD:  2,

  // ── rails ───────────────────────────────────────────────────────────────
  RAIL_RADIUS:             0.15,
  RAIL_SNAP_RADIUS:        1.2,
  RAIL_SNAP_Y_TOLERANCE:   1.5,
  RAIL_TRACK_SPACING:      0.3,
  RAIL_TIE_SPACING:        1.5,
  RAIL_EDGE_CHANCE:        0.5,
  CURVED_RAILS_PER_SEGMENT: 2.5,
  RAILS_FIRST_MODE:        true,
  RAILS_PER_SEGMENT:       6,
  RAIL_GAP_MIN:            10,
  RAIL_GAP_MAX:            20,
  RAIL_HEIGHT_VAR:         4,
  RAIL_LANDING_PAD_SIZE:   3,
  RAIL_MIN_LENGTH:         10,
  RAIL_COLOR_STRAIGHT:     0x00ffcc,
  RAIL_COLOR_CURVED:       0x00ccff,
  RAIL_EMISSIVE_INTENSITY: 0.4,

  // ── wall run ──────────────────────────────────────────────────────────
  WALLRUN_GRAVITY:         10,
  WALLRUN_JUMP_SPEED:      14,
  WALLRUN_KICK_SPEED:      6,
  WALLRUN_KICK_DURATION:   0.3,
  WALLRUN_SPEED_BOOST:     2,
  WALLRUN_MAX_BOOST:       8,
  WALLRUN_MIN_HEIGHT:      1.5,
  WALLRUN_GRACE_TIME:      1.0,
  WALLRUN_STICK_SPEED:     2,
  WALLRUN_MIN_ENTRY_SPEED: 6,
  WALLRUN_MAX_DURATION:    2.0,
  WALLRUN_CAMERA_ROLL:     0.26,
  WALLRUN_SLIDE_SPEED:     2,
  BILLBOARD_WIDTH:         0.5,
  BILLBOARD_HITBOX_PAD:    1.0,
  BILLBOARD_HEIGHT:        10,
  BILLBOARD_DEPTH:         15,
  BILLBOARD_GAP_EVERY:     4,
  BILLBOARD_GAP_SIZE:      12,
  BILLBOARD_Y_OFFSET:      1,
  BILLBOARD_X_OFFSET:      8,
  BILLBOARD_MIN_CLEARANCE: 2,

  // ── building facades ──────────────────────────────────────────────────
  FACADE_HEIGHT_MIN:       8,
  FACADE_HEIGHT_MAX:       15,
  FACADE_WIDTH:            0.5,
  FACADE_X_OFFSET:         8,
  FACADE_GAP_EVERY:        2,
  FACADE_DEPTH:            15,
  FACADE_HITBOX_PAD:       1.0,
  FACADE_MIN_CLEARANCE:    2,

  // ── platform generation ────────────────────────────────────────────────────
  MAX_DROP:               6,
  MIN_PLATFORM_SPACING:   5,
  FIRST_PLATFORM_GAP:     3,
  PLAT_HEIGHT_FRAC:       0.5,
  PLAT_RANGE_FRAC:        0.5,
  PLAT_MIN_GAP:           4,
  PLAT_MAX_GAP:           10,
  PLAT_DOUBLE_JUMP_CHANCE: 0.1,
  PLAT_MIN_PER_SEGMENT:   6,
  PLAT_MAX_PER_SEGMENT:   10,
  BOX_WIDTH_MIN:          3,
  BOX_WIDTH_MAX:          6,
  BOX_WIDTH:              4,
  BOX_HEIGHT:             1.1,
  BOX_DEPTH_MIN:          8,
  BOX_DEPTH_MAX:          30,
  BOX_DEPTH:              15,

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
  AUTO_AIM_LOOK_AHEAD:    30,
  AUTO_AIM_SKIP_PLATFORMS: 2,
  AUTO_AIM_LERP_SPEED:    0.6,
  AUTO_AIM_STRAFE_BIAS:   0.6,

  // ── momentum camera ───────────────────────────────────────────────────
  MOMENTUM_FOV_MIN:       90,
  MOMENTUM_FOV_MAX:       100,

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
  LAVA_POP_AMP:           1.2,
  LAVA_POP_FREQ:          3.0,
  LAVA_POP_SPEED:         0.8,
  LAVA_POP_EXP:           3.0,
  LAVA_WARP_STRENGTH:     1.0,
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
  LAVA_CRACK_INTENSITY:   25.0,
  LAVA_GLOW_BASE:         1.4,
  LAVA_GLOW_PULSE:        0.4,

  // ── lava rocks ─────────────────────────────────────────────────────────────
  ROCK_POOL_SIZE:         20,
  ROCK_MIN_SIZE:          0.4,
  ROCK_MAX_SIZE:          1.2,
  ROCK_ERUPT_SPEED_MIN:   10,
  ROCK_ERUPT_SPEED_MAX:   20,
  ROCK_ERUPT_RADIUS:      30,
  ROCK_ERUPT_INTERVAL:    0.2,
  ROCK_HAZARD_CHANCE:     0.08,
  ROCK_HAZARD_LIFETIME:   6,
  ROCK_SPIN_SPEED:        4,
  ROCK_LATERAL_SPEED:     4,
  ROCK_TRAIL_COUNT:       6,

  // ── distant mountains ─────────────────────────────────────────────────────
  MOUNTAIN_LAYER_COUNT:    3,
  MOUNTAIN_RADIUS_INNER:   120,
  MOUNTAIN_RADIUS_STEP:    30,
  MOUNTAIN_HEIGHT_MIN:     80,
  MOUNTAIN_HEIGHT_MAX:     140,
  MOUNTAIN_SEGMENTS:       128,

  // ── spawn platform ────────────────────────────────────────────────────────
  SPAWN_PLAT_SIZE:        3,
  WARMUP_COUNT:           2,
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
  MOVE_SPEED:          { get() { return this.MOMENTUM_MIN }, enumerable: true },
  SPAWN_POS:           { get() { return { x: this.SPAWN_X, y: this.SPAWN_Y, z: this.SPAWN_Z } }, enumerable: true },
  SINGLE_JUMP_HEIGHT:  { get() { return (this.JUMP_SPEED * this.JUMP_SPEED) / (2 * this.GRAVITY) }, enumerable: true },
  SINGLE_JUMP_TIME:    { get() { return (2 * this.JUMP_SPEED) / this.GRAVITY }, enumerable: true },
  DOUBLE_JUMP_HEIGHT:  { get() { return this.SINGLE_JUMP_HEIGHT * 2 }, enumerable: true },
  DOUBLE_JUMP_TIME:    { get() { return this.SINGLE_JUMP_TIME * 2 }, enumerable: true },
  MAX_H_RANGE_SINGLE:  { get() { return this.MOVE_SPEED * this.SINGLE_JUMP_TIME }, enumerable: true },
  MAX_H_RANGE_DOUBLE:  { get() { return this.MOVE_SPEED * this.DOUBLE_JUMP_TIME }, enumerable: true },
})

export default config
