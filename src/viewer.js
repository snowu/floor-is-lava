import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createHumanoid } from './humanoid.js'
import { createPlatformMeshes, updatePlatformMaterials } from './platformStyles.js'
import { createGround, updateGround } from './ground.js'
import { createBillboardMeshes, updateBillboardMaterials, BILLBOARD_STYLE_COUNT, getBillboardStyleName } from './billboardStyles.js'
import { createPlayerHitboxHelpers, updatePlayerHitboxPositions, createObstacleHitboxHelper, makeWireBox, buildPlatformAABBs } from './hitboxes.js'
import config from './config.js'

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1a1a1a)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500)
camera.position.set(5, 4, 5)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2
document.body.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.target.set(0, 1, 0)

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
scene.add(ambientLight)
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
dirLight.position.set(10, 20, 10)
scene.add(dirLight)
const fillLight = new THREE.DirectionalLight(0x4488ff, 0.3)
fillLight.position.set(-5, 5, -5)
scene.add(fillLight)

const gridHelper = new THREE.GridHelper(20, 20, 0x333333, 0x222222)
scene.add(gridHelper)

let currentGroup = null
let currentUpdateFn = null
let wireframeOn = false
let hitboxOn = false
const activeHitboxHelpers = []

const PLATFORM_TEMPLATE = { x: 0, y: 0.55, z: 0, w: config.BOX_WIDTH, h: config.BOX_HEIGHT, d: config.BOX_DEPTH }

const assets = {
  'Humanoid (Player)': {
    create() {
      const { group } = createHumanoid()
      return { group, update: null }
    },
    camDist: 4,
    camTarget: [0, 1, 0],
    buildHitboxes() {
      const helpers = createPlayerHitboxHelpers()
      updatePlayerHitboxPositions(helpers, new THREE.Vector3(0, 0, 0))
      helpers.upper.visible = true
      helpers.lower.visible = true
      const kick = makeWireBox(config.PLAYER_WIDTH, config.KICK_LEG_HEIGHT, config.KICK_LEG_REACH, 0xff8800)
      kick.position.set(0, config.KICK_HIP_Y, -config.KICK_LEG_REACH / 2)
      kick.visible = true
      return [helpers.upper, helpers.lower, kick]
    },
  },
  'Platform — Volcanic': {
    create() {
      const result = createPlatformMeshes(PLATFORM_TEMPLATE, 0)
      const group = new THREE.Group()
      result.meshes.forEach(m => group.add(m))
      return { group, update: (t) => updatePlatformMaterials(t), mainMesh: result.mainMesh }
    },
    camDist: 8,
    camTarget: [0, 0.5, 0],
    buildHitboxes(ctx) { return platformHitboxes(ctx.mainMesh) },
  },
  'Platform — Ruins': {
    create() {
      const result = createPlatformMeshes(PLATFORM_TEMPLATE, 1)
      const group = new THREE.Group()
      result.meshes.forEach(m => group.add(m))
      return { group, update: null, mainMesh: result.mainMesh }
    },
    camDist: 8,
    camTarget: [0, 0.5, 0],
    buildHitboxes(ctx) { return platformHitboxes(ctx.mainMesh) },
  },
  'Platform — Metal': {
    create() {
      const result = createPlatformMeshes(PLATFORM_TEMPLATE, 2)
      const group = new THREE.Group()
      result.meshes.forEach(m => group.add(m))
      return { group, update: (t) => updatePlatformMaterials(t), mainMesh: result.mainMesh }
    },
    camDist: 8,
    camTarget: [0, 0.5, 0],
    buildHitboxes(ctx) { return platformHitboxes(ctx.mainMesh) },
  },
  ...Object.fromEntries(Array.from({ length: BILLBOARD_STYLE_COUNT }, (_, i) => {
    const styleName = getBillboardStyleName(i)
    return [`Billboard — ${styleName}`, {
      create() {
        const result = createBillboardMeshes({ x: 0, y: 0, z: 0 }, config, i)
        const group = new THREE.Group()
        result.meshes.forEach(m => group.add(m))
        return { group, update: (t) => updateBillboardMaterials(t), mainMesh: result.mainMesh }
      },
      camDist: 15,
      camTarget: [0, 5, 0],
      buildHitboxes(ctx) {
        const aabb = new THREE.Box3().setFromObject(ctx.mainMesh)
        aabb.min.x -= config.BILLBOARD_HITBOX_PAD
        const h = createObstacleHitboxHelper(aabb, 0xffffff)
        h.visible = true
        return [h]
      },
    }]
  })),
  'Lava Ground': {
    create() {
      const group = createGround()
      group.scale.setScalar(0.05)
      return { group, update: (t) => updateGround(t, 0, 0) }
    },
    camDist: 6,
    camTarget: [0, 0, 0],
  },
  'Lava Rock': {
    create() {
      const geo = new THREE.IcosahedronGeometry(1, 1)
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2a1a0a, roughness: 0.9, emissive: 0xff4400, emissiveIntensity: 0.4,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.scale.setScalar(0.8)
      mesh.position.y = 0.8
      const group = new THREE.Group()
      group.add(mesh)
      return { group, update: null, mainMesh: mesh }
    },
    camDist: 4,
    camTarget: [0, 0.8, 0],
    buildHitboxes(ctx) { return [hitboxFromMesh(ctx.mainMesh)] },
  },
}

function hitboxFromMesh(mesh, color = 0xffffff) {
  const aabb = new THREE.Box3().setFromObject(mesh)
  const h = createObstacleHitboxHelper(aabb, color)
  h.visible = true
  return h
}

function platformHitboxes(mainMesh) {
  const { aabb, ledgeAABB } = buildPlatformAABBs(mainMesh)
  const collision = createObstacleHitboxHelper(aabb, 0xffffff)
  collision.visible = true
  const ledge = createObstacleHitboxHelper(ledgeAABB, 0x00ffff)
  ledge.visible = true
  return [collision, ledge]
}

const picker = document.getElementById('asset-picker')
const wireBtn = document.getElementById('wireframe-btn')
const hitboxBtn = document.getElementById('hitbox-btn')

Object.keys(assets).forEach(name => {
  const opt = document.createElement('option')
  opt.value = name
  opt.textContent = name
  picker.appendChild(opt)
})

function removeHitboxes() {
  for (const h of activeHitboxHelpers) {
    scene.remove(h)
    h.geometry.dispose()
  }
  activeHitboxHelpers.length = 0
}

function showHitboxes(name, ctx) {
  removeHitboxes()
  const def = assets[name]
  if (!def.buildHitboxes) return
  const helpers = def.buildHitboxes(ctx)
  for (const h of helpers) {
    scene.add(h)
    activeHitboxHelpers.push(h)
  }
}

let currentCtx = null

function clearCurrent() {
  removeHitboxes()
  if (currentGroup) {
    scene.remove(currentGroup)
    currentGroup.traverse(child => {
      if (child.isMesh) {
        child.geometry?.dispose()
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
        else child.material?.dispose()
      }
    })
    currentGroup = null
    currentUpdateFn = null
    currentCtx = null
  }
}

function loadAsset(name) {
  clearCurrent()
  const def = assets[name]
  const ctx = def.create()
  currentGroup = ctx.group
  currentUpdateFn = ctx.update
  currentCtx = ctx
  scene.add(ctx.group)

  if (wireframeOn) setWireframe(ctx.group, true)
  if (hitboxOn) showHitboxes(name, ctx)

  const d = def.camDist
  camera.position.set(d * 0.7, d * 0.5, d * 0.7)
  controls.target.set(...def.camTarget)
  controls.update()
}

function setWireframe(group, on) {
  group.traverse(child => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach(m => {
        if ('wireframe' in m) m.wireframe = on
      })
    }
  })
}

picker.addEventListener('change', () => loadAsset(picker.value))

function toggleWireframe() {
  wireframeOn = !wireframeOn
  wireBtn.classList.toggle('active', wireframeOn)
  if (currentGroup) setWireframe(currentGroup, wireframeOn)
}

function toggleHitbox() {
  hitboxOn = !hitboxOn
  hitboxBtn.classList.toggle('active', hitboxOn)
  if (hitboxOn) showHitboxes(picker.value, currentCtx)
  else removeHitboxes()
}

wireBtn.addEventListener('click', toggleWireframe)
hitboxBtn.addEventListener('click', toggleHitbox)

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT') return
  if (e.key === 'w' || e.key === 'W') toggleWireframe()
  if (e.key === 'h' || e.key === 'H') toggleHitbox()
})

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

const clock = new THREE.Clock()

function animate() {
  requestAnimationFrame(animate)
  const elapsed = clock.getElapsedTime()
  controls.update()
  if (currentUpdateFn) currentUpdateFn(elapsed)
  renderer.render(scene, camera)
}

loadAsset(Object.keys(assets)[0])
animate()
