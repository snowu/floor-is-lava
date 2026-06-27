import config from './config.js'

const MAX_DROP = 8
const MIN_PLATFORM_SPACING = 1.5
const FIRST_PLATFORM_GAP = 6

const DIFFICULTY = {
  easy:   { heightFraction: 0.5, rangeFraction: 0.5, minGap: 2, maxGap: 4, doubleJumpChance: 0,   platformsPerSegment: [4, 7] },
  medium: { heightFraction: 0.7, rangeFraction: 0.7, minGap: 3, maxGap: 6, doubleJumpChance: 0.2, platformsPerSegment: [5, 8] },
  hard:   { heightFraction: 0.9, rangeFraction: 0.9, minGap: 4, maxGap: 8, doubleJumpChance: 0.4, platformsPerSegment: [6, 10] },
}

function rand(min, max) {
  return min + Math.random() * (max - min)
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1))
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function nudgeAwayFromAll(plat, allPlatforms, halfW) {
  for (let pass = 0; pass < 3; pass++) {
    for (const other of allPlatforms) {
      const gapX = Math.max(0, Math.abs(plat.x - other.x) - plat.w / 2 - other.w / 2)
      const gapZ = Math.max(0, Math.abs(plat.z - other.z) - plat.d / 2 - other.d / 2)
      const gapY = Math.max(0, Math.abs(plat.y - other.y) - plat.h / 2 - other.h / 2)
      const dist = Math.sqrt(gapX * gapX + gapZ * gapZ + gapY * gapY)
      if (dist < MIN_PLATFORM_SPACING) {
        const push = MIN_PLATFORM_SPACING - dist + 0.5
        // Push forward (-z) and laterally away
        plat.z = Math.round((plat.z - push * 0.7) * 10) / 10
        const lateralDir = plat.x >= other.x ? 1 : -1
        plat.x = Math.round(clamp(plat.x + lateralDir * push * 0.5, -halfW, halfW) * 10) / 10
        plat.y = Math.round(clamp(plat.y + push * 0.3, plat.h / 2 + 0.5, config.CORRIDOR_HEIGHT - 2) * 10) / 10
      }
    }
  }
}

function generateSegmentPlatforms(prevPlatform, segmentStartZ, difficulty = 'medium', isFirstSegment = false, platformCounter = 0) {
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.medium
  const count = randInt(diff.platformsPerSegment[0], diff.platformsPerSegment[1])
  const platforms = []
  const billboards = []

  const halfW = config.CORRIDOR_WIDTH / 2 - 1

  let prev = prevPlatform
  if (!prev) {
    prev = { w: 3, h: 1, d: 3, x: 0, y: 0.5, z: segmentStartZ - 3, isSpawn: true }
    platforms.push(prev)
  }

  const WARMUP_COUNT = isFirstSegment ? 4 : 0
  let nextZ = segmentStartZ - (isFirstSegment ? FIRST_PLATFORM_GAP : 0)
  const slotDepth = config.SEGMENT_DEPTH / count
  let platIndex = platformCounter

  let afterGapSide = 0 // 0 = no constraint, -1/1 = force next platform to this side

  for (let i = 0; i < count; i++) {
    // Insert billboard gap before this platform?
    if (platIndex > 0 && platIndex % config.BILLBOARD_GAP_EVERY === 0 && !isFirstSegment) {
      const prevTopY = prev.y + prev.h / 2
      const side = prev.x >= 0 ? 1 : -1
      const gapMidZ = nextZ - config.BILLBOARD_GAP_SIZE / 2
      billboards.push({
        x: side * config.BILLBOARD_X_OFFSET,
        y: prevTopY - config.BILLBOARD_Y_OFFSET,
        z: gapMidZ,
        side,
      })
      nextZ -= config.BILLBOARD_GAP_SIZE
      afterGapSide = side
    }

    const prevTopY = prev.y + prev.h / 2
    const warmupT = (isFirstSegment && i < WARMUP_COUNT) ? (i + 1) / WARMUP_COUNT : 1.0

    const needsDoubleJump = warmupT < 1 ? false : Math.random() < diff.doubleJumpChance
    const maxHeight = needsDoubleJump ? config.DOUBLE_JUMP_HEIGHT : config.SINGLE_JUMP_HEIGHT

    const maxUp   = maxHeight * diff.heightFraction * warmupT
    const maxDown = Math.min(MAX_DROP, prevTopY - 0.5) * warmupT

    const heightRoll = Math.random()
    let dy
    if (heightRoll < 0.3) {
      dy = rand(-maxDown * 0.5, -maxDown * 0.1)
    } else if (heightRoll < 0.7) {
      dy = rand(maxUp * 0.2, maxUp * 0.7)
    } else {
      dy = rand(maxUp * 0.7, maxUp)
    }

    const sizeScale = needsDoubleJump ? 0.8 : 1.0
    const warmupSizeBonus = warmupT < 1 ? 1 + (1 - warmupT) * 0.5 : 1.0
    const w = rand(2, 4) * sizeScale * warmupSizeBonus
    const h = rand(0.3, 0.8)
    const d = rand(2, 4) * sizeScale * warmupSizeBonus

    const pz = nextZ - slotDepth / 2 + rand(-slotDepth * 0.2, slotDepth * 0.2)
    nextZ -= slotDepth

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

    nudgeAwayFromAll(plat, platforms, halfW)

    platforms.push(plat)
    prev = plat
    platIndex++
  }

  return { platforms, billboards, lastPlatform: prev, platformCounter: platIndex }
}

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
      const plat = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 3), platMat)
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

    const { platforms, billboards, lastPlatform, platformCounter } = generateSegmentPlatforms(
      this._lastPlatform, startZ, this._difficulty, index === 0, this._platformCounter
    )
    this._lastPlatform = lastPlatform
    this._platformCounter = platformCounter

    const PALETTE = [0x4fc3f7, 0x81c784, 0xff8a65, 0xffd54f, 0xce93d8]
    const meshes = []
    const obstacles = []

    platforms.forEach((b, i) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, b.h, b.d),
        new THREE.MeshStandardMaterial({ color: PALETTE[i % PALETTE.length] })
      )
      mesh.position.set(b.x, b.y, b.z)
      const aabb = new THREE.Box3().setFromObject(mesh)
      meshes.push(mesh)
      obstacles.push({ mesh, aabb, isSpawn: !!b.isSpawn })
    })

    // Billboards placed in gaps between platforms
    const billboardMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.7 })
    for (const bb of billboards) {
      const bbH = config.BILLBOARD_HEIGHT
      const bbY = bb.y + bbH / 2
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(config.BILLBOARD_WIDTH, bbH, config.BILLBOARD_DEPTH),
        billboardMat
      )
      mesh.position.set(bb.x, bbY, bb.z)
      const aabb = new THREE.Box3().setFromObject(mesh)
      // Extend hitbox toward course center
      if (bb.side > 0) aabb.min.x -= config.BILLBOARD_HITBOX_PAD
      else aabb.max.x += config.BILLBOARD_HITBOX_PAD
      meshes.push(mesh)
      obstacles.push({ mesh, aabb, isBillboard: true, wallNormalX: -bb.side })
    }

    return { index, startZ, platforms, meshes, obstacles }
  }

}
