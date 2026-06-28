import config from './config.js'
import { createPlatformMeshes } from './platformStyles.js'
import { createBillboardMeshes } from './billboardStyles.js'
import * as THREE from 'three'

function rand(min, max) {
  return min + Math.random() * (max - min)
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1))
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function hasOverlap(plat, other) {
  const overlapX = (plat.w / 2 + other.w / 2) - Math.abs(plat.x - other.x)
  const overlapZ = (plat.d / 2 + other.d / 2) - Math.abs(plat.z - other.z)
  const overlapY = (plat.h / 2 + other.h / 2) - Math.abs(plat.y - other.y)
  return overlapX > 0 && overlapZ > 0 && overlapY > 0
}

function nudgeAwayFromAll(plat, allPlatforms, neighborPlatforms, halfW) {
  const checkList = neighborPlatforms ? allPlatforms.concat(neighborPlatforms) : allPlatforms
  for (let pass = 0; pass < 5; pass++) {
    for (const other of checkList) {
      if (other === plat) continue
      const overlapX = (plat.w / 2 + other.w / 2) - Math.abs(plat.x - other.x)
      const overlapZ = (plat.d / 2 + other.d / 2) - Math.abs(plat.z - other.z)
      const overlapY = (plat.h / 2 + other.h / 2) - Math.abs(plat.y - other.y)
      if (overlapX > 0 && overlapZ > 0 && overlapY > 0) {
        const pushZ = overlapZ + config.MIN_PLATFORM_SPACING * 0.5
        plat.z = Math.round((plat.z - pushZ) * 10) / 10
        const lateralDir = plat.x >= other.x ? 1 : -1
        plat.x = Math.round(clamp(plat.x + lateralDir * overlapX * 0.5, -halfW, halfW) * 10) / 10
        continue
      }
      const gapX = Math.max(0, Math.abs(plat.x - other.x) - plat.w / 2 - other.w / 2)
      const gapZ = Math.max(0, Math.abs(plat.z - other.z) - plat.d / 2 - other.d / 2)
      const gapY = Math.max(0, Math.abs(plat.y - other.y) - plat.h / 2 - other.h / 2)
      const dist = Math.sqrt(gapX * gapX + gapZ * gapZ + gapY * gapY)
      if (dist < config.MIN_PLATFORM_SPACING) {
        const push = config.MIN_PLATFORM_SPACING - dist + 0.5
        plat.z = Math.round((plat.z - push * 0.7) * 10) / 10
        const lateralDir = plat.x >= other.x ? 1 : -1
        plat.x = Math.round(clamp(plat.x + lateralDir * push * 0.5, -halfW, halfW) * 10) / 10
        plat.y = Math.round(clamp(plat.y + push * 0.3, plat.h / 2 + 0.5, config.CORRIDOR_HEIGHT - 2) * 10) / 10
      }
    }
  }
  // Final guarantee: if any overlap remains, find the furthest-back
  // conflicting platform and clear past all of them in one shot
  let needsClear = true
  while (needsClear) {
    needsClear = false
    for (const other of checkList) {
      if (other === plat) continue
      if (hasOverlap(plat, other)) {
        const clearZ = other.z - other.d / 2 - plat.d / 2 - config.MIN_PLATFORM_SPACING
        if (clearZ < plat.z) {
          plat.z = Math.round(clearZ * 10) / 10
          needsClear = true
        }
      }
    }
  }
}

function generateSegmentPlatforms(prevPlatform, segmentStartZ, difficulty = 'medium', isFirstSegment = false, platformCounter = 0, neighborPlatforms = null, lastBillboardZ = null) {
  const diff = {
    heightFraction: config.PLAT_HEIGHT_FRAC,
    rangeFraction: config.PLAT_RANGE_FRAC,
    minGap: config.PLAT_MIN_GAP,
    maxGap: config.PLAT_MAX_GAP,
    doubleJumpChance: config.PLAT_DOUBLE_JUMP_CHANCE,
  }
  const count = randInt(config.PLAT_MIN_PER_SEGMENT, config.PLAT_MAX_PER_SEGMENT)
  const platforms = []
  const billboards = []

  const halfW = config.CORRIDOR_WIDTH / 2 - 1

  let prev = prevPlatform
  if (!prev) {
    const sp = config.SPAWN_PLAT_SIZE
    prev = { w: sp, h: 1, d: sp, x: 0, y: 0.5, z: segmentStartZ - 3, isSpawn: true }
    platforms.push(prev)
  }

  const WARMUP_COUNT = isFirstSegment ? config.WARMUP_COUNT : 0
  let nextZ = segmentStartZ - (isFirstSegment ? config.FIRST_PLATFORM_GAP : 0)
  let platIndex = platformCounter

  let afterGapSide = 0 // 0 = no constraint, -1/1 = force next platform to this side

  for (let i = 0; i < count; i++) {
    // Insert billboard gap before this platform?
    if (platIndex > 0 && platIndex % config.BILLBOARD_GAP_EVERY === 0 && i >= WARMUP_COUNT) {
      const gapMidZ = nextZ - config.BILLBOARD_GAP_SIZE / 2
      const tooClose = lastBillboardZ !== null &&
        Math.abs(gapMidZ - lastBillboardZ) < config.BILLBOARD_DEPTH + config.MIN_PLATFORM_SPACING
      if (!tooClose) {
        const prevTopY = prev.y + prev.h / 2
        const side = prev.x >= 0 ? 1 : -1
        billboards.push({
          x: side * config.BILLBOARD_X_OFFSET,
          y: prevTopY - config.BILLBOARD_Y_OFFSET,
          z: gapMidZ,
          side,
        })
        lastBillboardZ = gapMidZ
        nextZ -= config.BILLBOARD_GAP_SIZE
        afterGapSide = side
      }
    }

    const prevTopY = prev.y + prev.h / 2
    const warmupT = (isFirstSegment && i < WARMUP_COUNT) ? (i + 1) / WARMUP_COUNT : 1.0

    const needsDoubleJump = warmupT < 1 ? false : Math.random() < diff.doubleJumpChance
    const maxHeight = needsDoubleJump ? config.DOUBLE_JUMP_HEIGHT : config.SINGLE_JUMP_HEIGHT

    const maxUp   = maxHeight * diff.heightFraction * warmupT
    const maxDown = Math.min(config.MAX_DROP, prevTopY - 0.5) * warmupT

    const heightRoll = Math.random()
    let dy
    if (heightRoll < 0.3) {
      dy = rand(-maxDown * 0.5, -maxDown * 0.1)
    } else if (heightRoll < 0.7) {
      dy = rand(maxUp * 0.2, maxUp * 0.7)
    } else {
      dy = rand(maxUp * 0.7, maxUp)
    }

    const sizeScale = needsDoubleJump ? config.DOUBLE_JUMP_SIZE_SCALE : 1.0
    const warmupSizeBonus = warmupT < 1 ? 1 + (1 - warmupT) * 0.5 : 1.0
    const w = config.BOX_WIDTH * sizeScale * warmupSizeBonus
    const h = config.BOX_HEIGHT
    const d = config.BOX_DEPTH * sizeScale * warmupSizeBonus

    const gap = rand(diff.minGap, diff.maxGap)
    const pz = nextZ - gap
    nextZ = pz

    let px
    if (afterGapSide !== 0) {
      // First platform after gap: spawn on same side as billboard wall
      const targetX = afterGapSide * (config.BILLBOARD_X_OFFSET - 3)
      px = clamp(targetX + rand(-1, 1), -halfW + w / 2, halfW - w / 2)
      afterGapSide = 0
    } else {
      const baseLateralRange = Math.min(6, config.CORRIDOR_WIDTH / 2 - 1)
      const lateralRange = baseLateralRange * warmupT
      px = clamp(prev.x + rand(-lateralRange, lateralRange), -halfW + w / 2, halfW - w / 2)
    }

    const newTopY = prevTopY + dy
    const py = clamp(Math.max(h / 2, newTopY), h / 2 + 0.5, config.CORRIDOR_HEIGHT - h / 2 - 1)

    const plat = {
      w: Math.round(w * 10) / 10,
      h: Math.round(h * 10) / 10,
      d: Math.round(d * 10) / 10,
      x: Math.round(px * 10) / 10,
      y: Math.round(py * 10) / 10,
      z: Math.round(pz * 10) / 10,
    }

    const platTopY = plat.y + plat.h / 2
    const heightDiff = platTopY - prevTopY
    const maxReachHeight = (needsDoubleJump ? config.DOUBLE_JUMP_HEIGHT : config.SINGLE_JUMP_HEIGHT) * diff.heightFraction
    if (heightDiff > maxReachHeight) {
      plat.y = Math.round(clamp(prevTopY + maxReachHeight * 0.8, h / 2 + 0.5, config.CORRIDOR_HEIGHT - 2) * 10) / 10
    }

    // Prevent platform from clipping into any billboard
    for (const bb of billboards) {
      const bbMinZ = bb.z - config.BILLBOARD_DEPTH / 2
      const bbMaxZ = bb.z + config.BILLBOARD_DEPTH / 2
      const platMinZ = plat.z - plat.d / 2
      const platMaxZ = plat.z + plat.d / 2
      if (platMaxZ <= bbMinZ || platMinZ >= bbMaxZ) continue
      const bbInnerEdge = bb.side * config.BILLBOARD_X_OFFSET - bb.side * (config.BILLBOARD_WIDTH / 2 + config.BILLBOARD_HITBOX_PAD)
      const margin = 0.5
      if (bb.side > 0) {
        const limit = bbInnerEdge - margin - plat.w / 2
        if (plat.x > limit) plat.x = Math.round(limit * 10) / 10
      } else {
        const limit = bbInnerEdge + margin + plat.w / 2
        if (plat.x < limit) plat.x = Math.round(limit * 10) / 10
      }
    }

    nudgeAwayFromAll(plat, platforms, neighborPlatforms, halfW)

    platforms.push(plat)
    prev = plat
    platIndex++
  }

  return { platforms, billboards, lastPlatform: prev, platformCounter: platIndex, lastBillboardZ: lastBillboardZ }
}

export function validateSegment(platforms, billboards, neighborPlatforms) {
  const issues = []

  for (let i = 0; i < platforms.length; i++) {
    const a = platforms[i]
    for (let j = i + 1; j < platforms.length; j++) {
      const b = platforms[j]
      if (hasOverlap(a, b)) {
        const overlapX = (a.w / 2 + b.w / 2) - Math.abs(a.x - b.x)
        const overlapZ = (a.d / 2 + b.d / 2) - Math.abs(a.z - b.z)
        const overlapY = (a.h / 2 + b.h / 2) - Math.abs(a.y - b.y)
        issues.push({ type: 'overlap', platIndices: [i, j], msg: `OVERLAP plat ${i} & ${j} (${overlapX.toFixed(1)}x ${overlapZ.toFixed(1)}z ${overlapY.toFixed(1)}y)` })
      }
    }
  }

  // Cross-segment overlap check
  if (neighborPlatforms) {
    for (let i = 0; i < platforms.length; i++) {
      const a = platforms[i]
      for (let j = 0; j < neighborPlatforms.length; j++) {
        const b = neighborPlatforms[j]
        if (hasOverlap(a, b)) {
          const overlapX = (a.w / 2 + b.w / 2) - Math.abs(a.x - b.x)
          const overlapZ = (a.d / 2 + b.d / 2) - Math.abs(a.z - b.z)
          const overlapY = (a.h / 2 + b.h / 2) - Math.abs(a.y - b.y)
          issues.push({ type: 'overlap', platIndices: [i], msg: `CROSS-SEG OVERLAP plat ${i} & neighbor ${j} (${overlapX.toFixed(1)}x ${overlapZ.toFixed(1)}z ${overlapY.toFixed(1)}y)` })
        }
      }
    }
  }

  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i]
    for (let j = 0; j < billboards.length; j++) {
      const bb = billboards[j]
      const bbW = config.BILLBOARD_WIDTH
      const bbH = config.BILLBOARD_HEIGHT
      const bbD = config.BILLBOARD_DEPTH
      const bbY = bb.y + bbH / 2
      if (hasOverlap(p, { w: bbW, d: bbD, h: bbH, x: bb.x, z: bb.z, y: bbY })) {
        const overlapX = (p.w / 2 + bbW / 2) - Math.abs(p.x - bb.x)
        const overlapZ = (p.d / 2 + bbD / 2) - Math.abs(p.z - bb.z)
        const overlapY = (p.h / 2 + bbH / 2) - Math.abs(p.y - bbY)
        issues.push({ type: 'clip', platIndices: [i], msg: `CLIP plat ${i} into billboard ${j}` })
      }
    }
  }

  return issues
}

export { generateSegmentPlatforms }

export class BillboardTestCourse {
  constructor(xOffset = 0, billboardSpacing = 4, zSpacing = 12) {
    this._xOffset = xOffset
    this._billboardSpacing = billboardSpacing
    this._zSpacing = zSpacing
    this._segments = []
    this._nextSegmentIndex = 0
    this._furthestZ = 0
  }

  get allObstacles() {
    const out = []
    for (const seg of this._segments) {
      for (const obs of seg.obstacles) out.push(obs)
    }
    return out
  }

  get allWallAABBs() { return [] }

  destroyAll(scene) {
    for (const seg of this._segments) {
      for (const m of seg.meshes) {
        scene.remove(m)
        m.geometry.dispose()
        if (m.material.dispose) m.material.dispose()
      }
    }
    this._segments = []
    this._nextSegmentIndex = 0
    this._furthestZ = 0
  }

  update(playerZ, currentSpeed, scene, THREE) {
    if (playerZ < this._furthestZ) this._furthestZ = playerZ
    const speed = Math.max(currentSpeed, config.MOVE_SPEED)
    const generateDist = config.FOG_END + config.SEGMENT_DEPTH + speed * config.GENERATE_TIME_AHEAD
    const targetZ = this._furthestZ - generateDist
    const targetSegment = Math.floor(-targetZ / this._zSpacing)
    const added = []

    while (this._nextSegmentIndex <= targetSegment) {
      const seg = this._createSegment(THREE)
      this._segments.push(seg)
      for (const m of seg.meshes) { scene.add(m); added.push(m) }
    }
    return { added, removed: [] }
  }

  _createSegment(THREE) {
    const index = this._nextSegmentIndex++
    const startZ = -index * this._zSpacing
    const meshes = []
    const obstacles = []
    const billboardMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.7 })

    // Spawn platform + bridge from main course
    if (index === 0) {
      const platMat = new THREE.MeshStandardMaterial({ color: 0x4fc3f7 })
      const sp = config.SPAWN_PLAT_SIZE
      const plat = new THREE.Mesh(new THREE.BoxGeometry(sp, 1, sp), platMat)
      plat.position.set(this._xOffset, 0.5, startZ - 3)
      meshes.push(plat)
      obstacles.push({ mesh: plat, aabb: new THREE.Box3().setFromObject(plat), isSpawn: true })

      const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x888899 })
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(this._xOffset + 2, 0.5, 3), bridgeMat)
      bridge.position.set(this._xOffset / 2, 0.25, startZ - 3)
      meshes.push(bridge)
      obstacles.push({ mesh: bridge, aabb: new THREE.Box3().setFromObject(bridge), isSpawn: true })
    }

    // Billboard alternating sides
    const side = (index % 2 === 0) ? -1 : 1
    const midZ = startZ - this._zSpacing / 2
    const bbMesh = new THREE.Mesh(
      new THREE.BoxGeometry(config.BILLBOARD_WIDTH, config.BILLBOARD_HEIGHT, config.BILLBOARD_DEPTH),
      billboardMat
    )
    bbMesh.position.set(this._xOffset + side * this._billboardSpacing, config.BILLBOARD_HEIGHT / 2, midZ)
    meshes.push(bbMesh)
    const bbAABB = new THREE.Box3().setFromObject(bbMesh)
    bbAABB.min.x -= side < 0 ? 0 : config.BILLBOARD_HITBOX_PAD
    bbAABB.max.x += side > 0 ? 0 : config.BILLBOARD_HITBOX_PAD
    obstacles.push({ mesh: bbMesh, aabb: bbAABB, isBillboard: true, wallNormalX: -side })

    return { index, startZ, meshes, obstacles }
  }
}

export class CourseManager {
  constructor(difficulty = 'medium') {
    this._difficulty = difficulty
    this._segments = []
    this._nextSegmentIndex = 0
    this._lastPlatform = null
    this._furthestZ = 0
    this._platformCounter = 0
    this._lastBillboardZ = null
    this._prevSegmentPlatforms = null
  }

  get allObstacles() {
    const out = []
    for (const seg of this._segments) {
      for (const obs of seg.obstacles) out.push(obs)
    }
    return out
  }

  get allWallAABBs() {
    return []
  }

  destroyAll(scene) {
    for (const seg of this._segments) {
      for (const m of seg.meshes) {
        scene.remove(m)
      }
    }
    this._segments = []
    this._nextSegmentIndex = 0
    this._lastPlatform = null
    this._furthestZ = 0
    this._platformCounter = 0
    this._lastBillboardZ = null
    this._prevSegmentPlatforms = null
  }

  update(playerZ, currentSpeed, scene, THREE) {
    if (playerZ < this._furthestZ) this._furthestZ = playerZ

    // Always past fog + speed-scaled buffer so fast players don't outrun generation
    const speed = Math.max(currentSpeed, config.MOVE_SPEED)
    const generateDist = config.FOG_END + config.SEGMENT_DEPTH + speed * config.GENERATE_TIME_AHEAD
    const targetZ = this._furthestZ - generateDist

    const targetSegment = Math.floor(-targetZ / config.SEGMENT_DEPTH)
    const added = []

    while (this._nextSegmentIndex <= targetSegment) {
      const seg = this._createSegment(THREE)
      this._segments.push(seg)
      for (const m of seg.meshes) { scene.add(m); added.push(m) }
    }

    return { added, removed: [] }
  }


  _createSegment(THREE) {
    const index = this._nextSegmentIndex++
    const startZ = -index * config.SEGMENT_DEPTH

    const { platforms, billboards, lastPlatform, platformCounter, lastBillboardZ } = generateSegmentPlatforms(
      this._lastPlatform, startZ, this._difficulty, index === 0, this._platformCounter,
      this._prevSegmentPlatforms, this._lastBillboardZ
    )
    this._lastPlatform = lastPlatform
    this._platformCounter = platformCounter
    this._lastBillboardZ = lastBillboardZ
    this._prevSegmentPlatforms = platforms.slice(-3)

    const meshes = []
    const obstacles = []

    platforms.forEach((b, i) => {
      const globalIndex = this._platformCounter - platforms.length + i
      const result = createPlatformMeshes(b, globalIndex)

      for (const m of result.meshes) meshes.push(m)

      const aabb = new THREE.Box3().setFromObject(result.mainMesh)
      const ext = config.LEDGE_GRAB_EXTEND
      const ledgeAABB = aabb.clone()
      ledgeAABB.max.z += ext
      obstacles.push({ mesh: result.mainMesh, aabb, ledgeAABB, isSpawn: !!b.isSpawn })
    })

    // Billboards placed in gaps between platforms
    for (const bb of billboards) {
      const result = createBillboardMeshes(bb, config)
      for (const m of result.meshes) meshes.push(m)
      const aabb = new THREE.Box3().setFromObject(result.mainMesh)
      if (bb.side > 0) aabb.min.x -= config.BILLBOARD_HITBOX_PAD
      else aabb.max.x += config.BILLBOARD_HITBOX_PAD
      obstacles.push({ mesh: result.mainMesh, aabb, isBillboard: true, wallNormalX: -bb.side })
    }

    const issues = validateSegment(platforms, billboards, this._prevSegmentPlatforms)

    return { index, startZ, platforms, meshes, obstacles, issues }
  }

  segmentBoundaries() {
    return this._segments.map(s => s.startZ)
  }

  updatePlatforms() {
    // no-op — material updates are now global via updatePlatformMaterials()
  }
}
