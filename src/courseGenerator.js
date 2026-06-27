import {
  MOVE_SPEED, CORRIDOR_WIDTH, CORRIDOR_HEIGHT, SEGMENT_DEPTH,
  FOG_END, GENERATE_TIME_AHEAD,
  SINGLE_JUMP_HEIGHT, DOUBLE_JUMP_HEIGHT,
  MAX_H_RANGE_SINGLE, MAX_H_RANGE_DOUBLE,
  BILLBOARD_WIDTH, BILLBOARD_HEIGHT, BILLBOARD_DEPTH,
  BILLBOARD_INTERVAL, BILLBOARD_SKIP_FIRST, BILLBOARD_X_OFFSET,
} from './config.js'

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
        plat.y = Math.round(clamp(plat.y + push * 0.3, plat.h / 2 + 0.5, CORRIDOR_HEIGHT - 2) * 10) / 10
      }
    }
  }
}

function generateSegmentPlatforms(prevPlatform, segmentStartZ, difficulty = 'medium', isFirstSegment = false) {
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.medium
  const count = randInt(diff.platformsPerSegment[0], diff.platformsPerSegment[1])
  const platforms = []

  const halfW = CORRIDOR_WIDTH / 2 - 1
  const segmentEndZ = segmentStartZ - SEGMENT_DEPTH

  let prev = prevPlatform
  if (!prev) {
    prev = { w: 3, h: 1, d: 3, x: 0, y: 0.5, z: segmentStartZ - 3, isSpawn: true }
    platforms.push(prev)
  }

  const WARMUP_COUNT = isFirstSegment ? 4 : 0

  // Distribute z positions evenly across this segment, with jitter
  const slotDepth = SEGMENT_DEPTH / count
  for (let i = 0; i < count; i++) {
    const prevTopY = prev.y + prev.h / 2

    // Warmup ramp: first N platforms in first segment are tamer
    const warmupT = (isFirstSegment && i < WARMUP_COUNT) ? (i + 1) / WARMUP_COUNT : 1.0

    const needsDoubleJump = warmupT < 1 ? false : Math.random() < diff.doubleJumpChance
    const maxHeight = needsDoubleJump ? DOUBLE_JUMP_HEIGHT : SINGLE_JUMP_HEIGHT

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
    const w = rand(1.5, 3) * sizeScale * warmupSizeBonus
    const h = rand(0.5, 2)
    const d = rand(1.5, 3) * sizeScale * warmupSizeBonus

    // Z: evenly spaced slot with random jitter within slot
    const zOffset = isFirstSegment ? FIRST_PLATFORM_GAP : 0
    const slotStart = segmentStartZ - zOffset - i * slotDepth
    const slotEnd = segmentStartZ - zOffset - (i + 1) * slotDepth
    const pz = rand(slotEnd + d / 2 + 0.5, slotStart - d / 2 - 0.5)

    // X: lateral offset from prev, clamped to corridor
    const baseLateralRange = Math.min(6, CORRIDOR_WIDTH / 2 - 1)
    const lateralRange = baseLateralRange * warmupT
    const px = clamp(prev.x + rand(-lateralRange, lateralRange), -halfW + w / 2, halfW - w / 2)

    const newTopY = prevTopY + dy
    const py = clamp(Math.max(h / 2, newTopY), h / 2 + 0.5, CORRIDOR_HEIGHT - h / 2 - 1)

    const plat = {
      w: Math.round(w * 10) / 10,
      h: Math.round(h * 10) / 10,
      d: Math.round(d * 10) / 10,
      x: Math.round(px * 10) / 10,
      y: Math.round(py * 10) / 10,
      z: Math.round(pz * 10) / 10,
    }

    // Height reachability check
    const platTopY = plat.y + plat.h / 2
    const heightDiff = platTopY - prevTopY
    const maxReachHeight = (needsDoubleJump ? DOUBLE_JUMP_HEIGHT : SINGLE_JUMP_HEIGHT) * diff.heightFraction
    if (heightDiff > maxReachHeight) {
      plat.y = Math.round(clamp(prevTopY + maxReachHeight * 0.8, h / 2 + 0.5, CORRIDOR_HEIGHT - 2) * 10) / 10
    }

    // Nudge away from overlapping platforms
    nudgeAwayFromAll(plat, platforms, halfW)

    platforms.push(plat)
    prev = plat
  }

  return { platforms, lastPlatform: prev }
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
    const speed = Math.max(currentSpeed, MOVE_SPEED)
    const generateDist = FOG_END + SEGMENT_DEPTH + speed * GENERATE_TIME_AHEAD
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
      new THREE.BoxGeometry(BILLBOARD_WIDTH, BILLBOARD_HEIGHT, BILLBOARD_DEPTH),
      billboardMat
    )
    bbMesh.position.set(this._xOffset + side * this._billboardSpacing, BILLBOARD_HEIGHT / 2, midZ)
    meshes.push(bbMesh)
    obstacles.push({ mesh: bbMesh, aabb: new THREE.Box3().setFromObject(bbMesh), isBillboard: true, wallNormalX: -side })

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
    const speed = Math.max(currentSpeed, MOVE_SPEED)
    const generateDist = FOG_END + SEGMENT_DEPTH + speed * GENERATE_TIME_AHEAD
    const targetZ = this._furthestZ - generateDist

    const targetSegment = Math.floor(-targetZ / SEGMENT_DEPTH)
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
    const startZ = -index * SEGMENT_DEPTH

    const { platforms, lastPlatform } = generateSegmentPlatforms(
      this._lastPlatform, startZ, this._difficulty, index === 0
    )
    this._lastPlatform = lastPlatform

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

    // Billboards — alternating sides on a regular rhythm
    if (index >= BILLBOARD_SKIP_FIRST && index % BILLBOARD_INTERVAL === 0) {
      const side = ((index / BILLBOARD_INTERVAL) % 2 === 0) ? -1 : 1
      const billboardMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.7 })
      const midZ = startZ - SEGMENT_DEPTH / 2
      const zPos = midZ
      const yPos = BILLBOARD_HEIGHT / 2
      const xPos = side * BILLBOARD_X_OFFSET

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(BILLBOARD_WIDTH, BILLBOARD_HEIGHT, BILLBOARD_DEPTH),
        billboardMat
      )
      mesh.position.set(xPos, yPos, zPos)
      const aabb = new THREE.Box3().setFromObject(mesh)
      meshes.push(mesh)
      obstacles.push({ mesh, aabb, isBillboard: true, wallNormalX: -side })
    }

    return { index, startZ, platforms, meshes, obstacles }
  }

}
