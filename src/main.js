import * as THREE from 'three'
import { scene, camera, renderer, timer, updateSky } from './scene.js'
import { createHumanoid } from './humanoid.js'
import { Movement } from './movement.js'
import { CameraController } from './cameraController.js'
import { createGround, updateGround } from './ground.js'
import { CourseManager, BillboardTestCourse } from './obstacles.js'
import { Physics } from './physics.js'
import { HumanoidAnimator } from './humanoidAnimator.js'
import { createDebugMenu } from './debugMenu.js'
import config from './config.js'

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, config.AMBIENT_INTENSITY)
scene.add(ambientLight)

const dirLight = new THREE.DirectionalLight(0xffffff, 1)
dirLight.position.set(config.DIR_LIGHT_X, config.DIR_LIGHT_Y, config.DIR_LIGHT_Z)
scene.add(dirLight)

// Death floor
const ground = createGround()
scene.add(ground)

// Course manager — generates corridor + platforms on the fly
const course = new CourseManager('medium')
const courses = [course]

if (window.DEV_MODE) {
  courses.push(new BillboardTestCourse(30))
}

const { group: humanoid, joints } = createHumanoid()
humanoid.position.set(config.SPAWN_POS.x, config.SPAWN_POS.y, config.SPAWN_POS.z)
scene.add(humanoid)

// Controllers
const movement = new Movement()
const physics  = new Physics()
const cameraController = new CameraController(camera, renderer.domElement, humanoid, scene)
const animator = new HumanoidAnimator(joints, physics)
cameraController.animator = animator
createDebugMenu(animator, scene, courses, { camera, ambientLight, dirLight })

// HUD elements
const scoreEl = document.getElementById('score-current')
const bestEl = document.getElementById('score-best')
const speedEl = document.getElementById('speed-meter')
const airJumpsEl = document.getElementById('air-jumps')
const stateEl = document.getElementById('player-state')
let score = 0
let bestScore = 0
const touchedBoxes = new Set()

physics.onBoxLand = (obs) => {
  if (obs.isSpawn || touchedBoxes.has(obs)) return
  touchedBoxes.add(obs)
  score++
  scoreEl.textContent = score
  if (score > bestScore) {
    bestScore = score
    bestEl.textContent = bestScore
  }
}

physics.onWallRun = () => {
  score++
  scoreEl.textContent = score
  if (score > bestScore) {
    bestScore = score
    bestEl.textContent = bestScore
  }
}

physics.onGroundHit = () => {
  score = 0
  scoreEl.textContent = score
  touchedBoxes.clear()
  if (cameraController.mode === 'first-person') {
    physics._respawn(humanoid)
  }
}

// Debug hitboxes — toggle with H

function makeWireBox(w, h, d, color) {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d))
  const mat = new THREE.LineBasicMaterial({ color, depthTest: false })
  const mesh = new THREE.LineSegments(geo, mat)
  mesh.renderOrder = 999
  mesh.visible = false
  return mesh
}

let obstacleHelpers = []
let hitboxesVisible = false
let kickHelper = null
let _prevPW = config.PLAYER_WIDTH, _prevPH = config.PLAYER_HEIGHT

const upperH = config.PLAYER_HEIGHT - config.KICK_HIP_Y
let upperHelper = makeWireBox(config.PLAYER_WIDTH, upperH, config.PLAYER_WIDTH, 0x00ff00)
let lowerHelper = makeWireBox(config.PLAYER_WIDTH, config.KICK_HIP_Y, config.PLAYER_WIDTH, 0x44ff44)
scene.add(upperHelper)
scene.add(lowerHelper)

function rebuildPlayerHelper() {
  const vis = upperHelper.visible
  scene.remove(upperHelper)
  scene.remove(lowerHelper)
  upperHelper.geometry.dispose()
  lowerHelper.geometry.dispose()
  const uH = config.PLAYER_HEIGHT - config.KICK_HIP_Y
  upperHelper = makeWireBox(config.PLAYER_WIDTH, uH, config.PLAYER_WIDTH, 0x00ff00)
  lowerHelper = makeWireBox(config.PLAYER_WIDTH, config.KICK_HIP_Y, config.PLAYER_WIDTH, 0x44ff44)
  upperHelper.visible = vis
  lowerHelper.visible = vis
  scene.add(upperHelper)
  scene.add(lowerHelper)
  _prevPW = config.PLAYER_WIDTH
  _prevPH = config.PLAYER_HEIGHT
}

function rebuildObstacleHelpers() {
  obstacleHelpers.forEach(h => scene.remove(h))
  const allObs = courses.flatMap(c => c.allObstacles)
  obstacleHelpers = allObs.map(({ aabb }) => {
    const size   = new THREE.Vector3()
    const center = new THREE.Vector3()
    aabb.getSize(size)
    aabb.getCenter(center)
    const h = makeWireBox(size.x, size.y, size.z, 0xffffff)
    h.position.copy(center)
    h.visible = hitboxesVisible
    scene.add(h)
    return h
  })
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    hitboxesVisible = !hitboxesVisible
    obstacleHelpers.forEach(h => { h.visible = hitboxesVisible })
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
  let anyAdded = false
  for (const c of courses) {
    const { added } = c.update(humanoid.position.z, currentSpeed, scene, THREE)
    if (added.length > 0) anyAdded = true
  }
  if (anyAdded) rebuildObstacleHelpers()

  if (config.PLAYER_WIDTH !== _prevPW || config.PLAYER_HEIGHT !== _prevPH) {
    rebuildPlayerHelper()
  }

  const moveDir     = movement.getMoveDir(cameraController.cameraYaw)
  const jumpPressed = movement.jumpPressed
  movement.clearJump()

  const allObstacles = courses.flatMap(c => c.allObstacles)
  const allWallAABBs = courses.flatMap(c => c.allWallAABBs)
  physics.update(humanoid, moveDir, movement.wDown, movement.sDown, movement.eDown, jumpPressed, delta,
    allObstacles, allWallAABBs)
  animator.update(delta)
  cameraController.update()

  const uH = config.PLAYER_HEIGHT - config.KICK_HIP_Y
  upperHelper.position.set(
    humanoid.position.x,
    humanoid.position.y + config.KICK_HIP_Y + uH / 2,
    humanoid.position.z
  )
  lowerHelper.position.set(
    humanoid.position.x,
    humanoid.position.y + config.KICK_HIP_Y / 2,
    humanoid.position.z
  )
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

  speedEl.textContent = physics.horizontalSpeed.toFixed(1)
  airJumpsEl.textContent = physics._airJumpsLeft
  stateEl.textContent = physics.state
  updateGround(timestamp * 0.001, humanoid.position.x, humanoid.position.z)
  updateSky(timestamp * 0.001, humanoid.position.x, humanoid.position.z)
  renderer.render(scene, camera)
}
animate()
