import * as THREE from 'three'
import { scene, camera, renderer, timer, updateSky } from './scene.js'
import { createHumanoid } from './humanoid.js'
import { Movement } from './movement.js'
import { CameraController } from './cameraController.js'
import { createGround, updateGround } from './ground.js'
import { createRocks, updateRocks, getRockHazards, createMountains, updateMountains } from './environment.js'
import { CourseManager, BillboardTestCourse } from './obstacles.js'
import { updatePlatformMaterials } from './platformStyles.js'
import { updateBillboardMaterials, initSurveillance, createSkyScreens, updateSkyScreens } from './billboardStyles.js'
import { Physics } from './physics.js'
import { RailGrinder } from './railSystem.js'
import { HumanoidAnimator } from './humanoidAnimator.js'
import { makeWireBox, createPlayerHitboxHelpers, updatePlayerHitboxPositions, createObstacleHitboxHelper } from './hitboxes.js'
import { createDebugMenu } from './debugMenu.js'
import config from './config.js'
import { isMobile } from './mobile.js'

const mobileOverlay = document.getElementById('mobile-overlay')

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, config.AMBIENT_INTENSITY)
scene.add(ambientLight)

const dirLight = new THREE.DirectionalLight(0xffffff, 1)
dirLight.position.set(config.DIR_LIGHT_X, config.DIR_LIGHT_Y, config.DIR_LIGHT_Z)
scene.add(dirLight)

// Death floor
const ground = createGround()
scene.add(ground)

// Environment: rocks + mountains
createRocks(scene)
createMountains(scene)

// Surveillance billboard system
initSurveillance(renderer, scene)
createSkyScreens(scene)

// Course manager — generates corridor + platforms on the fly
const course = new CourseManager('medium')
const courses = [course]

// if (window.DEV_MODE) {
//   courses.push(new BillboardTestCourse(30))
// }

const { group: humanoid, joints } = createHumanoid()
humanoid.position.set(config.SPAWN_POS.x, config.SPAWN_POS.y, config.SPAWN_POS.z)
scene.add(humanoid)

// Controllers
const physics  = new Physics()
const cameraController = new CameraController(camera, renderer.domElement, humanoid, scene)
const movement = new Movement(physics, cameraController.joystick)
const animator = new HumanoidAnimator(joints, physics)
const railGrinder = new RailGrinder()
cameraController.animator = animator
createDebugMenu(animator, scene, courses, { camera, ambientLight, dirLight })

const MODE_LABELS = { 'first-person': 'FP', 'third-person': 'TP', 'free': 'Free' }
const camModeBtn = document.getElementById('cam-mode-btn')
if (camModeBtn) {
  const handler = (e) => {
    e.preventDefault()
    e.stopPropagation()
    cameraController.cycleMode()
    camModeBtn.textContent = MODE_LABELS[cameraController.mode] || cameraController.mode
    if (isMobile && mobileOverlay) {
      if (cameraController.mode === 'first-person' && !movement.started) {
        mobileOverlay.style.display = 'flex'
      } else {
        mobileOverlay.style.display = 'none'
      }
    }
  }
  camModeBtn.addEventListener('click', handler)
  camModeBtn.addEventListener('touchend', handler)
}

// HUD elements
const scoreEl = document.getElementById('score-current')
const bestEl = document.getElementById('score-best')
const speedEl = document.getElementById('speed-meter')
const airJumpsEl = document.getElementById('air-jumps')
const stateEl = document.getElementById('player-state')
const timerEl = document.getElementById('timer')
const momentumBar = document.getElementById('momentum-bar')
const chainCounterEl = document.getElementById('chain-counter')
const bestMultEl = document.getElementById('best-multiplier')
let score = 0
let bestScore = 0
let bestMultiplier = 1
let runTime = 0
let timerStarted = false
let chainDisplayTimer = 0
const touchedBoxes = new Set()
let cachedObstacles = []
let cachedWallAABBs = []
let cachedRails = []

// Tony Hawk-style scoring: points accumulate during grinds/wall runs,
// multiplier increases with each grind/wall run without touching a platform
let trickScore = 0
let trickMultiplier = 1
let inTrick = false
let trickScoreTimer = 0
const TRICK_POINTS_PER_SEC_GRIND = 50
const TRICK_POINTS_PER_SEC_WALLRUN = 30

function updateScoreDisplay() {
  scoreEl.textContent = score
  if (score > bestScore) {
    bestScore = score
    bestEl.textContent = bestScore
  }
}

function bankTrickScore() {
  if (trickScore > 0) {
    const banked = Math.floor(trickScore * trickMultiplier)
    score += banked
    updateScoreDisplay()
    trickScore = 0
  }
  trickMultiplier = 1
  inTrick = false
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

physics.onBoxLand = (obs) => {
  if (obs.isSpawn || touchedBoxes.has(obs)) return
  touchedBoxes.add(obs)
  score++
  updateScoreDisplay()
}

const _originalOnLand = physics.onLand
physics.onLand = () => {
  if (_originalOnLand) _originalOnLand()
  bankTrickScore()
  trickMultiplier = 1
  inTrick = false
  railGrinder.resetCooldown()
}

function updateBestMultiplier() {
  if (trickMultiplier > bestMultiplier) {
    bestMultiplier = trickMultiplier
    bestMultEl.textContent = bestMultiplier
  }
}

physics.onWallRun = () => {
  trickMultiplier++
  inTrick = true
  updateBestMultiplier()
  chainCounterEl.textContent = `x${trickMultiplier}`
  chainCounterEl.style.opacity = '1'
  chainDisplayTimer = 2.0
}

physics.onGrind = () => {
  trickMultiplier++
  inTrick = true
  updateBestMultiplier()
  chainCounterEl.textContent = `x${trickMultiplier}`
  chainCounterEl.style.opacity = '1'
  chainDisplayTimer = 2.0
}

physics.onChain = (combo) => {
  chainDisplayTimer = 2.0
}

physics.onGroundHit = () => {
  score = 0
  runTime = 0
  timerStarted = false
  trickScore = 0
  trickMultiplier = 1
  inTrick = false
  scoreEl.textContent = score
  timerEl.textContent = formatTime(0)
  touchedBoxes.clear()
  chainDisplayTimer = 0
  chainCounterEl.style.opacity = '0'
  if (railGrinder.isGrinding) railGrinder.dismount()
  if (cameraController.mode === 'first-person') {
    physics._respawn(humanoid)
    cameraController.resetLook()
  }
  if (cameraController.mode === 'first-person') {
    movement.resetForDeath()
    if (isMobile && mobileOverlay) mobileOverlay.style.display = 'flex'
  }
}

// Debug hitboxes — toggle with H

let obstacleHelpers = []
let ledgeHelpers = []
let seamHelpers = []
let issueHelpers = []
let railHelpers = []
let hitboxesVisible = false
let kickHelper = null
let _prevPW = config.PLAYER_WIDTH, _prevPH = config.PLAYER_HEIGHT

let playerHitboxHelpers = createPlayerHitboxHelpers()
let upperHelper = playerHitboxHelpers.upper
let lowerHelper = playerHitboxHelpers.lower
scene.add(upperHelper)
scene.add(lowerHelper)

function rebuildPlayerHelper() {
  const vis = upperHelper.visible
  scene.remove(upperHelper)
  scene.remove(lowerHelper)
  upperHelper.geometry.dispose()
  lowerHelper.geometry.dispose()
  playerHitboxHelpers = createPlayerHitboxHelpers()
  upperHelper = playerHitboxHelpers.upper
  lowerHelper = playerHitboxHelpers.lower
  upperHelper.visible = vis
  lowerHelper.visible = vis
  scene.add(upperHelper)
  scene.add(lowerHelper)
  _prevPW = config.PLAYER_WIDTH
  _prevPH = config.PLAYER_HEIGHT
}

function disposeHelper(h) {
  scene.remove(h)
  if (h.geometry) h.geometry.dispose()
  if (h.material && !h.material._shared) h.material.dispose()
}

function rebuildObstacleHelpers() {
  obstacleHelpers.forEach(disposeHelper)
  ledgeHelpers.forEach(disposeHelper)
  seamHelpers.forEach(disposeHelper)
  const allObs = cachedObstacles
  obstacleHelpers = allObs.map(({ aabb }) => {
    const h = createObstacleHitboxHelper(aabb, 0xffffff)
    h.visible = hitboxesVisible
    scene.add(h)
    return h
  })
  ledgeHelpers = allObs.filter(o => o.ledgeAABB).map(({ ledgeAABB }) => {
    const h = createObstacleHitboxHelper(ledgeAABB, 0x00ffff)
    h.visible = hitboxesVisible
    scene.add(h)
    return h
  })
  // Segment zone rectangles on the ground between seams
  seamHelpers = []
  for (const c of courses) {
    if (!c.segmentBoundaries) continue
    const bounds = c.segmentBoundaries()
    for (let i = 0; i < bounds.length; i++) {
      const z0 = bounds[i]
      const z1 = i + 1 < bounds.length ? bounds[i + 1] : z0 - config.SEGMENT_DEPTH
      const depth = Math.abs(z0 - z1)
      const midZ = (z0 + z1) / 2
      const seamMat = new THREE.LineBasicMaterial({ color: 0xff00ff, depthTest: false })
      const seamGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(config.CORRIDOR_WIDTH, depth))
      const seam = new THREE.LineSegments(seamGeo, seamMat)
      seam.rotation.x = -Math.PI / 2
      seam.position.set(0, 0.05, midZ)
      seam.renderOrder = 999
      seam.visible = hitboxesVisible
      scene.add(seam)
      seamHelpers.push(seam)
    }
  }
  // Rail snap radius visualization — tube showing snap zone
  railHelpers.forEach(h => { scene.remove(h); h.geometry.dispose() })
  railHelpers = []
  const railSnapMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, transparent: true, opacity: 0.25, depthWrite: false })
  for (const railData of cachedRails) {
    const rd = railData.railDef
    const segments = Math.max(8, Math.floor(rd.length))
    const snapTube = new THREE.TubeGeometry(rd.spline, segments, config.RAIL_SNAP_RADIUS, 8, false)
    const mesh = new THREE.Mesh(snapTube, railSnapMat)
    mesh.visible = hitboxesVisible
    scene.add(mesh)
    railHelpers.push(mesh)
  }

  // Issue markers — red for overlap/clip, yellow for unreachable
  issueHelpers.forEach(disposeHelper)
  issueHelpers = []
  for (const c of courses) {
    if (!c._segments) continue
    for (const seg of c._segments) {
      if (!seg.issues || seg.issues.length === 0) continue
      const flagged = new Set()
      for (const issue of seg.issues) {
        const color = issue.type === 'unreachable' ? 0xffff00 : 0xff0000
        for (const idx of issue.platIndices) {
          if (idx >= seg.platforms.length || flagged.has(`${idx}-${color}`)) continue
          flagged.add(`${idx}-${color}`)
          const p = seg.platforms[idx]
          const marker = makeWireBox(p.w + 0.3, p.h + 0.3, p.d + 0.3, color)
          marker.position.set(p.x, p.y, p.z)
          marker.visible = hitboxesVisible
          scene.add(marker)
          issueHelpers.push(marker)
        }
      }
    }
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    hitboxesVisible = !hitboxesVisible
    obstacleHelpers.forEach(h => { h.visible = hitboxesVisible })
    ledgeHelpers.forEach(h => { h.visible = hitboxesVisible })
    seamHelpers.forEach(h => { h.visible = hitboxesVisible })
    issueHelpers.forEach(h => { h.visible = hitboxesVisible })
    railHelpers.forEach(h => { h.visible = hitboxesVisible })
    upperHelper.visible = hitboxesVisible
    lowerHelper.visible = hitboxesVisible
  }
})

function animate(timestamp) {
  requestAnimationFrame(animate)
  timer.update(timestamp)
  const delta = timer.getDelta()

  // Generate segments for all courses
  const currentSpeed = Math.sqrt(physics.velocity.x ** 2 + physics.velocity.z ** 2)
  let anyChanged = false
  for (const c of courses) {
    const { added, visChanged } = c.update(humanoid.position.z, currentSpeed, scene, THREE)
    if (added.length > 0 || visChanged) anyChanged = true
  }
  if (anyChanged) {
    cachedObstacles = courses.flatMap(c => c.allObstacles)
    cachedWallAABBs = courses.flatMap(c => c.allWallAABBs)
    cachedRails = courses.flatMap(c => c.allRails)
    rebuildObstacleHelpers()
  }

  if (config.PLAYER_WIDTH !== _prevPW || config.PLAYER_HEIGHT !== _prevPH) {
    rebuildPlayerHelper()
  }

  const moveDir     = movement.getMoveDir(cameraController.cameraYaw)
  const jumpPressed = movement.jumpPressed
  movement.clearJump()

  const allObstacles = cachedObstacles
  const allWallAABBs = cachedWallAABBs
  physics.update(humanoid, moveDir, movement.wDown, movement.sDown, movement.eDown, jumpPressed, delta,
    allObstacles, allWallAABBs)

  // Rail grinding — detect jump-from-grind (physics already transitioned state)
  if (physics.state !== 'grinding' && railGrinder.isGrinding) {
    const tangent = railGrinder.dismount()
    if (tangent) {
      physics.velocity.set(
        tangent.x * physics.momentum,
        physics.velocity.y,
        tangent.z * physics.momentum
      )
    }
  }

  // Rail grinding — update position along rail or try to mount
  if (railGrinder.isGrinding) {
    const result = railGrinder.update(delta, physics.momentum)
    if (result) {
      if (result.ended) {
        // Push player forward past rail end so they don't land on the platform
        humanoid.position.copy(result.position)
        humanoid.position.addScaledVector(result.tangent, 1.5)
        physics.exitGrinding(result.tangent)
      } else {
        humanoid.position.copy(result.position)
        // Orient humanoid along rail tangent
        const lookTarget = result.position.clone().add(result.tangent)
        const yaw = Math.atan2(-(lookTarget.x - result.position.x), -(lookTarget.z - result.position.z))
        humanoid.rotation.y = yaw
      }
    }
  } else if (physics.state === 'airborne' && physics.velocity.y <= 0) {
    // Try to mount a rail
    for (const railData of cachedRails) {
      if (railGrinder.tryMount(railData, humanoid.position, physics.velocity.y, physics.velocity)) {
        physics.enterGrinding()
        break
      }
    }
  }

  movement.updateMobileState()
  cameraController.updateAutoAim(allObstacles)
  animator.update(delta)
  cameraController.update()

  updatePlayerHitboxPositions(playerHitboxHelpers, humanoid.position)
  lowerHelper.visible = hitboxesVisible && !physics.legsExtended

  // Show kick hitbox when legs extended
  if (physics.legsExtended && hitboxesVisible) {
    if (!kickHelper) {
      kickHelper = makeWireBox(config.PLAYER_WIDTH, config.KICK_LEG_HEIGHT, config.KICK_LEG_REACH, 0xff8800)
      kickHelper.renderOrder = 999
      scene.add(kickHelper)
    }
    kickHelper.visible = true
    const yaw = humanoid.rotation.y
    kickHelper.position.set(
      humanoid.position.x + (-Math.sin(yaw)) * config.KICK_LEG_REACH / 2,
      humanoid.position.y + config.KICK_HIP_Y,
      humanoid.position.z + (-Math.cos(yaw)) * config.KICK_LEG_REACH / 2
    )
    kickHelper.rotation.y = yaw
  } else if (kickHelper) {
    kickHelper.visible = false
  }

  if (isMobile && movement.started && mobileOverlay && mobileOverlay.style.display !== 'none') {
    mobileOverlay.style.display = 'none'
  }
  // Trick score accumulation during grinds/wall runs
  if (physics.state === 'grinding') {
    trickScore += TRICK_POINTS_PER_SEC_GRIND * delta
    inTrick = true
  } else if (physics.state === 'wallrunning') {
    trickScore += TRICK_POINTS_PER_SEC_WALLRUN * delta
    inTrick = true
  }

  // Show active trick score + multiplier
  if (inTrick && trickScore > 0) {
    const pending = Math.floor(trickScore * trickMultiplier)
    chainCounterEl.textContent = `${Math.floor(trickScore)} x${trickMultiplier} = +${pending}`
    chainCounterEl.style.opacity = '1'
    chainDisplayTimer = 2.0
  }

  if (!timerStarted && physics.horizontalSpeed > 0.1) timerStarted = true
  if (timerStarted) runTime += delta
  timerEl.textContent = formatTime(runTime)
  speedEl.textContent = physics.horizontalSpeed.toFixed(1)
  airJumpsEl.textContent = physics._airJumpsLeft
  stateEl.textContent = physics.state

  const momentumPct = ((physics.momentum - config.MOMENTUM_MIN) / (config.MOMENTUM_MAX - config.MOMENTUM_MIN)) * 100
  momentumBar.style.width = `${Math.min(100, Math.max(0, momentumPct))}%`
  if (chainDisplayTimer > 0) {
    chainDisplayTimer -= delta
    if (chainDisplayTimer <= 0) {
      chainCounterEl.style.opacity = '0'
    }
  }

  updateGround(timestamp * 0.001, humanoid.position.x, humanoid.position.z)
  updateSky(timestamp * 0.001, humanoid.position.x, humanoid.position.y, humanoid.position.z)
  updateRocks(delta, timestamp * 0.001, humanoid.position.x, humanoid.position.z, allObstacles)
  updateMountains(timestamp * 0.001, humanoid.position.x, humanoid.position.z)
  updatePlatformMaterials(timestamp * 0.001)
  updateBillboardMaterials(timestamp * 0.001, score, runTime)
  updateSkyScreens(timestamp * 0.001, humanoid.position, score, runTime)

  // Rock hazard collision
  const halfW = config.PLAYER_WIDTH / 2
  for (const rock of getRockHazards()) {
    const rp = rock.mesh.position
    const pp = humanoid.position
    const dx = Math.abs(rp.x - pp.x)
    const dz = Math.abs(rp.z - pp.z)
    const dy = rp.y - pp.y
    const rSize = rock.mesh.scale.x
    if (dx < halfW + rSize && dz < halfW + rSize && dy >= 0 && dy < config.PLAYER_HEIGHT) {
      physics.onGroundHit()
      break
    }
  }
  renderer.render(scene, camera)
}
animate()
