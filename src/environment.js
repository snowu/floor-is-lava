import * as THREE from 'three'
import config from './config.js'

// ── Lava Rocks ──────────────────────────────────────────────────────────────

const rockGeo = new THREE.IcosahedronGeometry(1, 1)
const rockMat = new THREE.MeshStandardMaterial({
  color: 0x2a1a0a,
  roughness: 0.9,
  emissive: 0xff4400,
  emissiveIntensity: 0.4,
})

const trailMat = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    varying vec2 vUv;
    void main() {
      float fade = 1.0 - vUv.y;
      fade = pow(fade, 1.5);
      float flicker = sin(vUv.y * 15.0 - time * 8.0) * 0.3 + 0.7;
      float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
      vec3 fire = mix(vec3(1.0, 0.8, 0.1), vec3(1.0, 0.2, 0.0), vUv.y);
      fire = mix(fire, vec3(0.3, 0.05, 0.0), vUv.y * vUv.y);
      float alpha = fade * flicker * edge;
      gl_FragColor = vec4(fire * 2.0, alpha);
    }
  `,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
})

const trailGeo = new THREE.PlaneGeometry(1, 1, 1, 8)

const rocks = []
let eruptTimer = 0
let globalTime = 0

function createRock() {
  const mesh = new THREE.Mesh(rockGeo, rockMat.clone())
  mesh.visible = false

  const trail = new THREE.Mesh(trailGeo, trailMat)
  trail.visible = false
  mesh.add(trail)

  return {
    mesh,
    trail,
    velocity: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    active: false,
    isHazard: false,
    hazardTimer: 0,
    landed: false,
    landedOnPlatform: null,
  }
}

export function createRocks(scene) {
  for (let i = 0; i < config.ROCK_POOL_SIZE; i++) {
    const rock = createRock()
    rocks.push(rock)
    scene.add(rock.mesh)
  }
}

function eruptRock(playerX, playerZ) {
  const rock = rocks.find(r => !r.active)
  if (!rock) return

  const angle = Math.random() * Math.PI * 2
  const dist = 5 + Math.random() * config.ROCK_ERUPT_RADIUS
  const x = playerX + Math.cos(angle) * dist
  const z = playerZ + Math.sin(angle) * dist

  const size = config.ROCK_MIN_SIZE + Math.random() * (config.ROCK_MAX_SIZE - config.ROCK_MIN_SIZE)
  rock.mesh.scale.setScalar(size)
  rock.mesh.position.set(x, -0.1, z)
  rock.mesh.visible = true
  rock.mesh.material.emissiveIntensity = 0.4

  rock.trail.visible = true
  rock.trail.scale.set(size * 0.8, size * 3, 1)
  rock.trail.position.set(0, -size * 1.5, 0)

  const speed = config.ROCK_ERUPT_SPEED_MIN + Math.random() * (config.ROCK_ERUPT_SPEED_MAX - config.ROCK_ERUPT_SPEED_MIN)
  rock.velocity.set(
    (Math.random() - 0.5) * config.ROCK_LATERAL_SPEED,
    speed,
    (Math.random() - 0.5) * config.ROCK_LATERAL_SPEED
  )
  rock.spin.set(
    (Math.random() - 0.5) * config.ROCK_SPIN_SPEED,
    (Math.random() - 0.5) * config.ROCK_SPIN_SPEED,
    (Math.random() - 0.5) * config.ROCK_SPIN_SPEED
  )

  rock.active = true
  rock.landed = false
  rock.isHazard = Math.random() < config.ROCK_HAZARD_CHANCE
  rock.hazardTimer = 0
  rock.landedOnPlatform = null
}

export function updateRocks(delta, time, playerX, playerZ, obstacles) {
  globalTime = time
  trailMat.uniforms.time.value = time

  eruptTimer += delta
  while (eruptTimer >= config.ROCK_ERUPT_INTERVAL) {
    eruptTimer -= config.ROCK_ERUPT_INTERVAL
    eruptRock(playerX, playerZ)
  }

  for (const rock of rocks) {
    if (!rock.active) continue

    if (!rock.landed) {
      rock.velocity.y -= config.GRAVITY * delta
      rock.mesh.position.x += rock.velocity.x * delta
      rock.mesh.position.y += rock.velocity.y * delta
      rock.mesh.position.z += rock.velocity.z * delta
      rock.mesh.rotation.x += rock.spin.x * delta
      rock.mesh.rotation.y += rock.spin.y * delta
      rock.mesh.rotation.z += rock.spin.z * delta

      // Trail always faces up (billboard-style relative to rock rotation)
      rock.trail.rotation.set(-rock.mesh.rotation.x, -rock.mesh.rotation.y, -rock.mesh.rotation.z)

      // Emissive fades as rock rises and cools
      const heightFade = Math.max(0, 1.0 - rock.mesh.position.y / 15)
      rock.mesh.material.emissiveIntensity = 0.3 + heightFade * 0.5

      // Trail shrinks as velocity decreases
      const speed = rock.velocity.length()
      const trailScale = Math.min(1, speed / 10)
      const s = rock.mesh.scale.x
      rock.trail.scale.set(s * 0.8 * trailScale, s * 3 * trailScale, 1)
      rock.trail.visible = trailScale > 0.1

      if (rock.isHazard && rock.velocity.y < 0) {
        for (const obs of obstacles) {
          if (obs.isBillboard || obs.isSpawn) continue
          const rp = rock.mesh.position
          if (rp.x >= obs.aabb.min.x && rp.x <= obs.aabb.max.x &&
              rp.z >= obs.aabb.min.z && rp.z <= obs.aabb.max.z &&
              rp.y <= obs.aabb.max.y + 0.1 && rp.y >= obs.aabb.max.y - 0.5) {
            rock.landed = true
            rock.mesh.position.y = obs.aabb.max.y + rock.mesh.scale.x * 0.5
            rock.landedOnPlatform = obs
            rock.velocity.set(0, 0, 0)
            rock.spin.set(0, 0, 0)
            rock.mesh.material.emissiveIntensity = 0.8
            rock.trail.visible = false
            break
          }
        }
      }

      if (rock.mesh.position.y < -1) {
        rock.active = false
        rock.mesh.visible = false
        rock.trail.visible = false
      }
    } else {
      rock.hazardTimer += delta
      const pulse = 0.5 + 0.5 * Math.sin(rock.hazardTimer * 6)
      rock.mesh.material.emissiveIntensity = 0.4 + pulse * 0.6
      if (rock.hazardTimer >= config.ROCK_HAZARD_LIFETIME) {
        rock.active = false
        rock.mesh.visible = false
        rock.trail.visible = false
        rock.landed = false
      }
    }
  }
}

export function getRockHazards() {
  return rocks.filter(r => r.active && r.landed && r.isHazard)
}

// ── Neon Colosseum ──────────────────────────────────────────────────────────

const colosseumGroup = new THREE.Group()
let crowdInstances = null
let crowdCount = 0
let searchlightPivots = []

const TIER_COUNT = 8
const PILLAR_COUNT = 32
const SPECTATORS_PER_TIER = 200
const SEARCHLIGHT_COUNT = 6

export function createMountains(scene) {
  const baseRadius = config.MOUNTAIN_RADIUS_INNER
  const totalHeight = config.MOUNTAIN_HEIGHT_MAX

  const tierHeight = totalHeight / TIER_COUNT
  const rakePerTier = 4

  // ── Structural materials ────────────────────────────────────────────────
  const structureMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a18,
    roughness: 0.7,
    metalness: 0.9,
  })

  const tierFaceMat = new THREE.MeshStandardMaterial({
    color: 0x0c0c20,
    roughness: 0.8,
    metalness: 0.6,
  })

  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x151530,
    roughness: 0.9,
    metalness: 0.3,
  })

  const neonColors = [0x0066ff, 0xff0066, 0x7700ff, 0x00ffaa, 0xff4400, 0x00aaff, 0xff00ff, 0xffaa00]

  // ── Tiered seating — concentric stepped rings ───────────────────────────
  for (let t = 0; t < TIER_COUNT; t++) {
    const innerR = baseRadius + t * rakePerTier
    const outerR = innerR + rakePerTier - 0.5
    const y = t * tierHeight

    // Tier floor — flat ring
    const floorGeo = new THREE.RingGeometry(innerR, outerR, 64)
    const floor = new THREE.Mesh(floorGeo, seatMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = y
    colosseumGroup.add(floor)

    // Tier face wall — vertical cylinder band (the riser)
    const riserGeo = new THREE.CylinderGeometry(innerR, innerR, tierHeight, 64, 1, true)
    const riser = new THREE.Mesh(riserGeo, tierFaceMat)
    riser.position.y = y - tierHeight / 2
    colosseumGroup.add(riser)

    // Neon edge strip at front of each tier
    const neonGeo = new THREE.TorusGeometry(innerR + 0.1, 0.12, 6, 64)
    const neonMat = new THREE.MeshBasicMaterial({
      color: neonColors[t % neonColors.length],
      transparent: true,
      opacity: 0.8,
    })
    const neonRing = new THREE.Mesh(neonGeo, neonMat)
    neonRing.rotation.x = Math.PI / 2
    neonRing.position.y = y + 0.05
    colosseumGroup.add(neonRing)
  }

  // ── Back wall — tall cylinder behind top tier ───────────────────────────
  const backWallR = baseRadius + TIER_COUNT * rakePerTier + 2
  const backWallH = totalHeight * 0.6
  const backWallGeo = new THREE.CylinderGeometry(backWallR, backWallR * 1.01, backWallH, 64, 1, true)
  const backWall = new THREE.Mesh(backWallGeo, structureMat)
  backWall.position.y = TIER_COUNT * tierHeight + backWallH / 2
  colosseumGroup.add(backWall)

  // Neon accent rings on back wall
  for (let i = 0; i < 3; i++) {
    const ringY = TIER_COUNT * tierHeight + backWallH * (0.25 + i * 0.25)
    const ringGeo = new THREE.TorusGeometry(backWallR - 0.5, 0.15, 6, 64)
    const ringMat = new THREE.MeshBasicMaterial({
      color: neonColors[(TIER_COUNT + i) % neonColors.length],
      transparent: true,
      opacity: 0.5,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = ringY
    colosseumGroup.add(ring)
  }

  // ── Arch pillars — thick structural columns with neon edges ─────────────
  const pillarGeo = new THREE.CylinderGeometry(1.2, 1.5, totalHeight + backWallH * 0.8, 8)
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x0e0e25,
    roughness: 0.5,
    metalness: 0.95,
  })

  for (let i = 0; i < PILLAR_COUNT; i++) {
    const angle = (i / PILLAR_COUNT) * Math.PI * 2
    const r = baseRadius - 1.5
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    const pillarH = totalHeight + backWallH * 0.8

    const pillar = new THREE.Mesh(pillarGeo, pillarMat)
    pillar.position.set(x, pillarH / 2 - 2, z)
    colosseumGroup.add(pillar)

    // Neon strip running up each pillar
    const stripGeo = new THREE.BoxGeometry(0.08, pillarH, 0.08)
    const stripColor = neonColors[i % neonColors.length]
    const stripMat = new THREE.MeshBasicMaterial({
      color: stripColor,
      transparent: true,
      opacity: 0.7,
    })
    const strip = new THREE.Mesh(stripGeo, stripMat)
    strip.position.set(x + Math.cos(angle) * 1.3, pillarH / 2 - 2, z + Math.sin(angle) * 1.3)
    colosseumGroup.add(strip)

    // Arch between pillars — curved beam connecting tops
    if (i % 2 === 0) {
      const nextAngle = ((i + 1) / PILLAR_COUNT) * Math.PI * 2
      const midAngle = (angle + nextAngle) / 2
      const archR = r
      const archX = Math.cos(midAngle) * archR
      const archZ = Math.sin(midAngle) * archR
      const archSpan = 2 * archR * Math.sin((nextAngle - angle) / 2)

      const archGeo = new THREE.BoxGeometry(archSpan, 1.5, 2)
      const arch = new THREE.Mesh(archGeo, structureMat)
      arch.position.set(archX, pillarH - 3, archZ)
      arch.rotation.y = -midAngle + Math.PI / 2
      colosseumGroup.add(arch)
    }
  }

  // ── VIP boxes — larger enclosed sections every few pillars ──────────────
  const vipCount = 8
  for (let i = 0; i < vipCount; i++) {
    const angle = (i / vipCount) * Math.PI * 2
    const r = baseRadius + 2
    const vipW = 8
    const vipH = tierHeight * 2
    const vipD = rakePerTier * 1.5

    const vipGeo = new THREE.BoxGeometry(vipW, vipH, vipD)
    const vipMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a1a,
      roughness: 0.6,
      metalness: 0.8,
    })
    const vip = new THREE.Mesh(vipGeo, vipMat)
    const vipY = tierHeight * 3 + vipH / 2
    vip.position.set(Math.cos(angle) * r, vipY, Math.sin(angle) * r)
    vip.rotation.y = -angle + Math.PI / 2
    colosseumGroup.add(vip)

    // VIP neon frame
    const edges = new THREE.EdgesGeometry(vipGeo)
    const edgeLine = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color: neonColors[i % neonColors.length],
      transparent: true,
      opacity: 0.9,
    }))
    edgeLine.position.copy(vip.position)
    edgeLine.rotation.copy(vip.rotation)
    colosseumGroup.add(edgeLine)

    // VIP window glow — emissive face
    const windowGeo = new THREE.PlaneGeometry(vipW * 0.8, vipH * 0.6)
    const windowMat = new THREE.MeshBasicMaterial({
      color: neonColors[i % neonColors.length],
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    })
    const window = new THREE.Mesh(windowGeo, windowMat)
    window.position.set(
      Math.cos(angle) * (r - vipD / 2 + 0.1),
      vipY,
      Math.sin(angle) * (r - vipD / 2 + 0.1)
    )
    window.rotation.y = -angle + Math.PI / 2
    colosseumGroup.add(window)
  }

  // ── Instanced spectators — small capsule shapes in the stands ──────────
  crowdCount = TIER_COUNT * SPECTATORS_PER_TIER
  const spectatorGeo = new THREE.CapsuleGeometry(0.6, 1.4, 2, 4)
  const spectatorMat = new THREE.MeshBasicMaterial()

  spectatorMat.fog = false
  crowdInstances = new THREE.InstancedMesh(spectatorGeo, spectatorMat, crowdCount)
  crowdInstances.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(crowdCount * 3), 3
  )

  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  let idx = 0

  for (let t = 0; t < TIER_COUNT; t++) {
    const tierR = baseRadius + t * rakePerTier + rakePerTier * 0.5
    const tierY = t * tierHeight + 0.5

    for (let s = 0; s < SPECTATORS_PER_TIER; s++) {
      const angle = (s / SPECTATORS_PER_TIER) * Math.PI * 2 + (Math.random() - 0.5) * 0.02
      const rJitter = (Math.random() - 0.5) * (rakePerTier * 0.6)

      dummy.position.set(
        Math.cos(angle) * (tierR + rJitter),
        tierY + Math.random() * 0.3,
        Math.sin(angle) * (tierR + rJitter)
      )
      dummy.scale.setScalar(1.2 + Math.random() * 0.6)
      dummy.rotation.y = -angle + Math.PI + (Math.random() - 0.5) * 0.3
      dummy.updateMatrix()
      crowdInstances.setMatrixAt(idx, dummy.matrix)

      // Random crowd colors — clothes
      const hue = Math.random()
      const sat = 0.5 + Math.random() * 0.4
      const light = 0.25 + Math.random() * 0.25
      color.setHSL(hue, sat, light)
      crowdInstances.setColorAt(idx, color)
      idx++
    }
  }

  crowdInstances.instanceMatrix.needsUpdate = true
  crowdInstances.instanceColor.needsUpdate = true
  colosseumGroup.add(crowdInstances)

  // ── Searchlights — cone geometry from rim ──────────────────────────────
  const beamGeo = new THREE.ConeGeometry(8, 60, 16, 1, true)
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.04,
    side: THREE.DoubleSide,
    depthWrite: false,
  })

  for (let i = 0; i < SEARCHLIGHT_COUNT; i++) {
    const angle = (i / SEARCHLIGHT_COUNT) * Math.PI * 2
    const r = backWallR - 2
    const pivot = new THREE.Group()
    pivot.position.set(
      Math.cos(angle) * r,
      TIER_COUNT * tierHeight + backWallH * 0.8,
      Math.sin(angle) * r
    )

    const beam = new THREE.Mesh(beamGeo, beamMat)
    beam.rotation.x = Math.PI * 0.75
    beam.position.y = -25
    pivot.add(beam)

    // Light source glow at searchlight origin
    const bulbGeo = new THREE.SphereGeometry(0.5, 8, 8)
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffcc })
    const bulb = new THREE.Mesh(bulbGeo, bulbMat)
    pivot.add(bulb)

    colosseumGroup.add(pivot)
    searchlightPivots.push({ pivot, baseAngle: angle, speed: 0.3 + Math.random() * 0.4 })
  }

  // ── Top crown — ornamental ring of spikes ──────────────────────────────
  const crownR = backWallR + 1
  const crownY = TIER_COUNT * tierHeight + backWallH
  const spikeCount = 48
  const spikeGeo = new THREE.ConeGeometry(0.6, 6, 4)
  const spikeMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a20,
    roughness: 0.4,
    metalness: 0.95,
    emissive: 0x110033,
    emissiveIntensity: 0.3,
  })

  for (let i = 0; i < spikeCount; i++) {
    const angle = (i / spikeCount) * Math.PI * 2
    const spike = new THREE.Mesh(spikeGeo, spikeMat)
    spike.position.set(Math.cos(angle) * crownR, crownY + 3, Math.sin(angle) * crownR)
    colosseumGroup.add(spike)
  }

  // Top crown neon ring
  const crownRingGeo = new THREE.TorusGeometry(crownR, 0.25, 6, 64)
  const crownRingMat = new THREE.MeshBasicMaterial({
    color: 0xff0066,
    transparent: true,
    opacity: 0.7,
  })
  const crownRing = new THREE.Mesh(crownRingGeo, crownRingMat)
  crownRing.rotation.x = Math.PI / 2
  crownRing.position.y = crownY
  colosseumGroup.add(crownRing)

  // ── Floor-level lava glow ring ─────────────────────────────────────────
  const lavaGlowGeo = new THREE.RingGeometry(baseRadius - 3, baseRadius + 2, 64)
  const lavaGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const lavaGlow = new THREE.Mesh(lavaGlowGeo, lavaGlowMat)
  lavaGlow.rotation.x = -Math.PI / 2
  lavaGlow.position.y = 0.1
  colosseumGroup.add(lavaGlow)

  scene.add(colosseumGroup)
}

export function updateMountains(time, playerX, playerZ) {
  colosseumGroup.position.set(playerX, 0, playerZ)

  // Animate searchlights
  for (const sl of searchlightPivots) {
    const swing = Math.sin(time * sl.speed) * 0.4
    sl.pivot.rotation.y = swing
    sl.pivot.rotation.z = Math.sin(time * sl.speed * 0.7 + sl.baseAngle) * 0.15
  }

  // Animate crowd — wave effect via instance matrices
  if (crowdInstances) {
    const dummy = new THREE.Object3D()
    const matrix = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scale = new THREE.Vector3()

    for (let i = 0; i < crowdCount; i++) {
      crowdInstances.getMatrixAt(i, matrix)
      matrix.decompose(pos, quat, scale)

      // Stadium wave — sinusoidal Y offset based on angle and time
      const angle = Math.atan2(pos.z, pos.x)
      const wavePhase = angle * 2 + time * 2.5
      const waveHeight = Math.max(0, Math.sin(wavePhase)) * 0.6

      // Arms-up effect by scaling Y when in wave
      const scaleBoost = 1.0 + waveHeight * 0.3
      dummy.position.copy(pos)
      dummy.position.y = pos.y + waveHeight
      dummy.quaternion.copy(quat)
      dummy.scale.set(scale.x, scale.y * scaleBoost, scale.z)
      dummy.updateMatrix()

      crowdInstances.setMatrixAt(i, dummy.matrix)
    }
    crowdInstances.instanceMatrix.needsUpdate = true
  }
}
