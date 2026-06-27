import GUI from 'lil-gui'
import config from './config.js'

const DERIVED_KEYS = new Set()
for (const key of Object.keys(config)) {
  const desc = Object.getOwnPropertyDescriptor(config, key)
  if (desc && desc.get) DERIVED_KEYS.add(key)
}
const DEFAULTS = {}
for (const key of Object.keys(config)) {
  if (!DERIVED_KEYS.has(key)) DEFAULTS[key] = config[key]
}

const ANIM_STATES = ['auto', 'idle', 'running', 'jumping', 'falling', 'landing', 'hanging', 'pullUp', 'wallrun']

export function createDebugMenu(animator, scene, courses, { camera, ambientLight, dirLight } = {}) {
  const gui = new GUI({ title: 'Debug (F2)', width: 400 })
  gui.domElement.style.fontSize = '14px'
  gui.domElement.style.display = 'none'

  const state = { animOverride: 'auto' }

  function rebuildCourses() {
    for (const c of courses) c.destroyAll(scene)
  }

  // ── Player Physics ────────────────────────────────────────────────────────
  const physics = gui.addFolder('Player Physics')
  physics.add(config, 'GRAVITY', 0, 200, 1)
  physics.add(config, 'JUMP_SPEED', 0, 50, 0.5)
  physics.add(config, 'MOVE_SPEED_MIN', 0, 50, 0.5)
  physics.add(config, 'MOVE_SPEED_MAX', 0, 80, 0.5)
  physics.add(config, 'MOVE_ACCEL', 0, 5, 0.1)
  physics.add(config, 'COYOTE_TIME', 0, 2, 0.05)
  physics.add(config, 'GROUND_STICK', 0, 10, 0.5)
  physics.add(config, 'MAX_AIR_JUMPS', 0, 5, 1)
  physics.close()

  // ── Player Dimensions ─────────────────────────────────────────────────────
  const dims = gui.addFolder('Player Dimensions')
  dims.add(config, 'PLAYER_WIDTH', 0.1, 3, 0.05)
  dims.add(config, 'PLAYER_HEIGHT', 0.5, 5, 0.1)
  dims.add(config, 'HAND_OFFSET_Y', 0, 4, 0.1)
  dims.add(config, 'LEDGE_REACH', 0, 2, 0.05)
  dims.add(config, 'LEDGE_H_MARGIN', 0, 2, 0.05)
  dims.close()

  // ── World ─────────────────────────────────────────────────────────────────
  const world = gui.addFolder('World')
  world.add(config, 'GROUND_Y', -10, 10, 0.5)
  world.add(config, 'SPAWN_X', -20, 20, 0.5)
  world.add(config, 'SPAWN_Y', -5, 20, 0.5)
  world.add(config, 'SPAWN_Z', -50, 50, 1)
  world.close()

  // ── Corridor ──────────────────────────────────────────────────────────────
  const corridor = gui.addFolder('Corridor')
  corridor.add(config, 'CORRIDOR_WIDTH', 4, 40, 1).onFinishChange(rebuildCourses)
  corridor.add(config, 'CORRIDOR_HEIGHT', 4, 40, 1).onFinishChange(rebuildCourses)
  corridor.add(config, 'SEGMENT_DEPTH', 10, 100, 5).onFinishChange(rebuildCourses)
  corridor.add(config, 'WALL_THICKNESS', 0.1, 3, 0.1)
  corridor.close()

  // ── Fog / Generation ──────────────────────────────────────────────────────
  const fog = gui.addFolder('Fog / Generation')
  fog.add(config, 'FOG_START', 0, 200, 5).onChange(v => { if (scene.fog) scene.fog.near = v })
  fog.add(config, 'FOG_END', 10, 500, 5).onChange(v => { if (scene.fog) scene.fog.far = v })
  fog.add(config, 'GENERATE_TIME_AHEAD', 0, 10, 0.5)
  fog.close()

  // ── Wall Run ──────────────────────────────────────────────────────────────
  const wallrun = gui.addFolder('Wall Run')
  wallrun.add(config, 'WALLRUN_SLIDE_SPEED', 0, 20, 0.5)
  wallrun.add(config, 'WALLRUN_JUMP_SPEED', 0, 30, 0.5)
  wallrun.add(config, 'WALLRUN_KICK_SPEED', 0, 20, 0.5)
  wallrun.add(config, 'WALLRUN_KICK_DURATION', 0, 2, 0.05)
  wallrun.add(config, 'WALLRUN_SPEED_BOOST', 0, 20, 0.5)
  wallrun.add(config, 'WALLRUN_MAX_BOOST', 0, 30, 1)
  wallrun.add(config, 'WALLRUN_MIN_HEIGHT', 0, 10, 0.5)
  wallrun.add(config, 'WALLRUN_GRACE_TIME', 0, 5, 0.1)
  wallrun.add(config, 'WALLRUN_STICK_SPEED', 0, 10, 0.5)
  wallrun.close()

  // ── Billboard ─────────────────────────────────────────────────────────────
  const billboard = gui.addFolder('Billboard')
  billboard.add(config, 'BILLBOARD_WIDTH', 0.1, 5, 0.1).onFinishChange(rebuildCourses)
  billboard.add(config, 'BILLBOARD_HITBOX_PAD', 0, 5, 0.1).onFinishChange(rebuildCourses)
  billboard.add(config, 'BILLBOARD_HEIGHT', 1, 30, 1).onFinishChange(rebuildCourses)
  billboard.add(config, 'BILLBOARD_DEPTH', 1, 40, 1).onFinishChange(rebuildCourses)
  billboard.add(config, 'BILLBOARD_GAP_EVERY', 1, 10, 1).onFinishChange(rebuildCourses)
  billboard.add(config, 'BILLBOARD_GAP_SIZE', 1, 30, 1).onFinishChange(rebuildCourses)
  billboard.add(config, 'BILLBOARD_Y_OFFSET', -5, 10, 0.5).onFinishChange(rebuildCourses)
  billboard.add(config, 'BILLBOARD_X_OFFSET', 1, 20, 0.5).onFinishChange(rebuildCourses)
  billboard.close()

  // ── Platform Generation ────────────────────────────────────────────────────
  const plat = gui.addFolder('Platform Generation')
  plat.add(config, 'MAX_DROP', 1, 20, 0.5).onFinishChange(rebuildCourses)
  plat.add(config, 'MIN_PLATFORM_SPACING', 0.5, 5, 0.25).onFinishChange(rebuildCourses)
  plat.add(config, 'FIRST_PLATFORM_GAP', 1, 20, 1).onFinishChange(rebuildCourses)
  plat.add(config, 'PLAT_HEIGHT_FRAC', 0, 1, 0.05).name('Height Fraction').onFinishChange(rebuildCourses)
  plat.add(config, 'PLAT_RANGE_FRAC', 0, 1, 0.05).name('Range Fraction').onFinishChange(rebuildCourses)
  plat.add(config, 'PLAT_MIN_GAP', 1, 15, 0.5).name('Min Gap').onFinishChange(rebuildCourses)
  plat.add(config, 'PLAT_MAX_GAP', 1, 20, 0.5).name('Max Gap').onFinishChange(rebuildCourses)
  plat.add(config, 'PLAT_DOUBLE_JUMP_CHANCE', 0, 1, 0.05).name('Double Jump %').onFinishChange(rebuildCourses)
  plat.add(config, 'PLAT_MIN_PER_SEGMENT', 1, 15, 1).name('Min Per Segment').onFinishChange(rebuildCourses)
  plat.add(config, 'PLAT_MAX_PER_SEGMENT', 1, 20, 1).name('Max Per Segment').onFinishChange(rebuildCourses)
  plat.add(config, 'BOX_MIN_WIDTH', 0.5, 10, 0.25).name('Box Min Width').onFinishChange(rebuildCourses)
  plat.add(config, 'BOX_MAX_WIDTH', 0.5, 15, 0.25).name('Box Max Width').onFinishChange(rebuildCourses)
  plat.add(config, 'BOX_MIN_HEIGHT', 0.1, 3, 0.05).name('Box Min Height').onFinishChange(rebuildCourses)
  plat.add(config, 'BOX_MAX_HEIGHT', 0.1, 5, 0.1).name('Box Max Height').onFinishChange(rebuildCourses)
  plat.add(config, 'BOX_MIN_DEPTH', 0.5, 10, 0.25).name('Box Min Depth').onFinishChange(rebuildCourses)
  plat.add(config, 'BOX_MAX_DEPTH', 0.5, 15, 0.25).name('Box Max Depth').onFinishChange(rebuildCourses)
  plat.add(config, 'SPAWN_PLAT_SIZE', 1, 10, 0.5).name('Spawn Platform').onFinishChange(rebuildCourses)
  plat.add(config, 'WARMUP_COUNT', 0, 10, 1).name('Warmup Platforms').onFinishChange(rebuildCourses)
  plat.add(config, 'DOUBLE_JUMP_SIZE_SCALE', 0.1, 1.5, 0.05).name('DblJump Size Scale').onFinishChange(rebuildCourses)
  plat.close()

  // ── Camera ────────────────────────────────────────────────────────────────
  const cam = gui.addFolder('Camera')
  cam.add(config, 'CAMERA_FOV', 30, 120, 1).name('FOV').onChange(v => {
    if (camera) { camera.fov = v; camera.updateProjectionMatrix() }
  })
  cam.add(config, 'CAMERA_SENSITIVITY', 0.0005, 0.01, 0.0005).name('Sensitivity')
  cam.add(config, 'FREE_CAM_HEIGHT', 10, 200, 5).name('Free Cam Height')
  cam.add(config, 'FREE_CAM_DISTANCE', 1, 50, 1).name('Free Cam Distance')
  cam.add(config, 'FP_HAND_X', 0, 1, 0.05).name('Hand X Offset')
  cam.add(config, 'FP_HAND_Y', -1, 0, 0.05).name('Hand Y Offset')
  cam.add(config, 'FP_HAND_Z', -1, 0, 0.05).name('Hand Z Offset')
  cam.add(config, 'TP_CAM_DISTANCE', 1, 20, 0.5).name('3P Distance')
  cam.add(config, 'TP_CAM_HEIGHT', 0, 10, 0.5).name('3P Height')
  cam.close()

  // ── Lighting ──────────────────────────────────────────────────────────────
  const light = gui.addFolder('Lighting')
  light.add(config, 'AMBIENT_INTENSITY', 0, 2, 0.05).name('Ambient').onChange(v => {
    if (ambientLight) ambientLight.intensity = v
  })
  light.add(config, 'DIR_LIGHT_X', -50, 50, 1).name('Dir X').onChange(() => {
    if (dirLight) dirLight.position.set(config.DIR_LIGHT_X, config.DIR_LIGHT_Y, config.DIR_LIGHT_Z)
  })
  light.add(config, 'DIR_LIGHT_Y', -50, 50, 1).name('Dir Y').onChange(() => {
    if (dirLight) dirLight.position.set(config.DIR_LIGHT_X, config.DIR_LIGHT_Y, config.DIR_LIGHT_Z)
  })
  light.add(config, 'DIR_LIGHT_Z', -50, 50, 1).name('Dir Z').onChange(() => {
    if (dirLight) dirLight.position.set(config.DIR_LIGHT_X, config.DIR_LIGHT_Y, config.DIR_LIGHT_Z)
  })
  light.close()

  // ── Lava ──────────────────────────────────────────────────────────────────
  const lava = gui.addFolder('Lava')
  lava.add(config, 'LAVA_SPEED', 0, 0.2, 0.005).name('Speed')
  lava.add(config, 'LAVA_UV_SCALE', 0.01, 0.3, 0.005).name('UV Scale')
  lava.add(config, 'LAVA_HEAVE_AMP', 0, 3, 0.1).name('Heave Amp')
  lava.add(config, 'LAVA_HEAVE_FREQ', 0, 3, 0.1).name('Heave Freq')
  lava.add(config, 'LAVA_HEAVE_SPEED', 0, 1, 0.05).name('Heave Speed')
  lava.add(config, 'LAVA_BUBBLE_AMP1', 0, 2, 0.05).name('Bubble Amp 1')
  lava.add(config, 'LAVA_BUBBLE_FREQ1', 0, 10, 0.5).name('Bubble Freq 1')
  lava.add(config, 'LAVA_BUBBLE_SPEED1', 0, 2, 0.1).name('Bubble Speed 1')
  lava.add(config, 'LAVA_BUBBLE_AMP2', 0, 1, 0.05).name('Bubble Amp 2')
  lava.add(config, 'LAVA_BUBBLE_FREQ2', 0, 10, 0.5).name('Bubble Freq 2')
  lava.add(config, 'LAVA_BUBBLE_SPEED2', 0, 2, 0.1).name('Bubble Speed 2')
  lava.add(config, 'LAVA_POP_AMP', 0, 3, 0.1).name('Pop Amp')
  lava.add(config, 'LAVA_POP_FREQ', 0, 10, 0.5).name('Pop Freq')
  lava.add(config, 'LAVA_POP_SPEED', 0, 3, 0.1).name('Pop Speed')
  lava.add(config, 'LAVA_POP_EXP', 1, 10, 0.5).name('Pop Exp')
  lava.add(config, 'LAVA_WARP_STRENGTH', 0, 10, 0.5).name('Warp Strength')
  lava.add(config, 'LAVA_FLOW_SPEED1', 0, 1, 0.01).name('Flow 1')
  lava.add(config, 'LAVA_FLOW_SPEED2', 0, 1, 0.01).name('Flow 2')
  lava.add(config, 'LAVA_FLOW_SPEED3', 0, 1, 0.01).name('Flow 3')
  lava.add(config, 'LAVA_FLOW_SPEED4', 0, 1, 0.01).name('Flow 4')
  lava.add(config, 'LAVA_DETAIL_NEAR', 0, 30, 1).name('Detail Near')
  lava.add(config, 'LAVA_DETAIL_RANGE', 0, 60, 1).name('Detail Range')
  lava.add(config, 'LAVA_OCTAVES_MIN', 1, 6, 0.5).name('Octaves Min')
  lava.add(config, 'LAVA_OCTAVES_MAX', 1, 6, 0.5).name('Octaves Max')
  lava.add(config, 'LAVA_CRUST_THRESHOLD', 0, 1, 0.05).name('Crust Threshold')
  lava.add(config, 'LAVA_ORANGE_THRESHOLD', 0, 1, 0.05).name('Orange Threshold')
  lava.add(config, 'LAVA_PULSE_FREQ', 0, 5, 0.1).name('Pulse Freq')
  lava.add(config, 'LAVA_PULSE_SPEED', 0, 3, 0.1).name('Pulse Speed')
  lava.add(config, 'LAVA_PULSE_EXP', 1, 10, 0.5).name('Pulse Exp')
  lava.add(config, 'LAVA_PULSE_INTENSITY', 0, 1, 0.05).name('Pulse Intensity')
  lava.add(config, 'LAVA_CRACK_FREQ', 0, 10, 0.5).name('Crack Freq')
  lava.add(config, 'LAVA_CRACK_WARP', 0, 5, 0.1).name('Crack Warp')
  lava.add(config, 'LAVA_CRACK_WIDTH_NEAR', 0, 1, 0.01).name('Crack Width Near')
  lava.add(config, 'LAVA_CRACK_WIDTH_FAR', 0, 2, 0.05).name('Crack Width Far')
  lava.add(config, 'LAVA_CRACK_INTENSITY', 0, 2, 0.05).name('Crack Intensity')
  lava.add(config, 'LAVA_GLOW_BASE', 0, 5, 0.1).name('Glow Base')
  lava.add(config, 'LAVA_GLOW_PULSE', 0, 2, 0.05).name('Glow Pulse')
  lava.close()

  // ── Animation ─────────────────────────────────────────────────────────────
  const anim = gui.addFolder('Animation')
  anim.add(config, 'ANIM_IDLE_BOB_SPEED', 0, 10, 0.1)
  anim.add(config, 'ANIM_IDLE_BOB_AMOUNT', 0, 0.2, 0.005)
  anim.add(config, 'ANIM_IDLE_ARM_ANGLE', 0, 1, 0.01)
  anim.add(config, 'ANIM_RUN_LEG_AMPLITUDE', 0, 2, 0.05)
  anim.add(config, 'ANIM_RUN_ARM_AMPLITUDE', 0, 2, 0.05)
  anim.add(config, 'ANIM_RUN_FREQ_SCALE', 0, 5, 0.1)
  anim.add(config, 'ANIM_LANDING_DURATION', 0.01, 1, 0.01)
  anim.add(config, 'ANIM_PULLUP_DURATION', 0.01, 1, 0.01)
  anim.close()

  // ── Animation State Override ──────────────────────────────────────────────
  const animState = gui.addFolder('Animation State')
  animState.add(state, 'animOverride', ANIM_STATES).name('Force State').onChange(v => {
    animator.forcedState = v === 'auto' ? null : v
  })
  animState.close()

  // ── Reset ─────────────────────────────────────────────────────────────────
  gui.add({ reset() {
    for (const key of Object.keys(DEFAULTS)) {
      config[key] = DEFAULTS[key]
    }
    state.animOverride = 'auto'
    animator.forcedState = null
    if (scene.fog) {
      scene.fog.near = config.FOG_START
      scene.fog.far = config.FOG_END
    }
    rebuildCourses()
    gui.controllersRecursive().forEach(c => c.updateDisplay())
  }}, 'reset').name('Reset All')

  // F2 toggle
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F2') {
      e.preventDefault()
      const opening = gui.domElement.style.display === 'none'
      gui.domElement.style.display = opening ? '' : 'none'
      if (opening && document.pointerLockElement) {
        document.exitPointerLock()
      }
    }
  })

  return gui
}
