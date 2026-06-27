import * as THREE from 'three'
import { scene, camera, renderer, timer } from './scene.js'
import { createHumanoid } from './humanoid.js'
import { Movement } from './movement.js'
import { CameraController } from './cameraController.js'
import { createGround } from './ground.js'
import { CourseManager } from './obstacles.js'
import { Physics } from './physics.js'
import { HumanoidAnimator } from './humanoidAnimator.js'
import { PLAYER_WIDTH, PLAYER_HEIGHT, SPAWN_POS } from './config.js'

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
scene.add(ambientLight)

const dirLight = new THREE.DirectionalLight(0xffffff, 1)
dirLight.position.set(10, 20, 10)
scene.add(dirLight)

// Death floor
const ground = createGround()
scene.add(ground)

// Course manager — generates corridor + platforms on the fly
const course = new CourseManager('medium')

const { group: humanoid, joints } = createHumanoid()
humanoid.position.set(SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z)
scene.add(humanoid)

// Controllers
const movement = new Movement()
const physics  = new Physics()
const cameraController = new CameraController(camera, renderer.domElement, humanoid, scene)
const animator = new HumanoidAnimator(joints, physics)

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

const playerHelper = makeWireBox(PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_WIDTH, 0x00ff00)
scene.add(playerHelper)

function rebuildObstacleHelpers() {
  obstacleHelpers.forEach(h => scene.remove(h))
  obstacleHelpers = course.allObstacles.map(({ aabb }) => {
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
    playerHelper.visible = hitboxesVisible
  }
})

function animate(timestamp) {
  requestAnimationFrame(animate)
  timer.update(timestamp)
  const delta = timer.getDelta()

  // Generate corridor segments based on player position and speed
  const currentSpeed = Math.sqrt(physics.velocity.x ** 2 + physics.velocity.z ** 2)
  const { added, removed } = course.update(humanoid.position.z, currentSpeed, scene, THREE)
  if (added.length > 0 || removed.length > 0) {
    rebuildObstacleHelpers()
  }

  const moveDir     = movement.getMoveDir(cameraController.cameraYaw)
  const jumpPressed = movement.jumpPressed
  movement.clearJump()

  physics.update(humanoid, moveDir, movement.wDown, movement.sDown, jumpPressed, delta,
    course.allObstacles, course.allWallAABBs)
  animator.update(delta)
  cameraController.update()

  playerHelper.position.set(
    humanoid.position.x,
    humanoid.position.y + PLAYER_HEIGHT / 2,
    humanoid.position.z
  )

  renderer.render(scene, camera)
}
animate()
