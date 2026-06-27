// Constraint-solver procedural platform generator with infinite corridor.
// Generates corridor segments with platforms inside them.
// New segments spawn as player advances; old ones get cleaned up.

const GRAVITY    = 20
const JUMP_SPEED = 8
const MOVE_SPEED = 10

const SINGLE_JUMP_HEIGHT = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY)
const SINGLE_JUMP_TIME   = (2 * JUMP_SPEED) / GRAVITY
const DOUBLE_JUMP_HEIGHT = SINGLE_JUMP_HEIGHT * 2
const DOUBLE_JUMP_TIME   = SINGLE_JUMP_TIME * 2
const MAX_H_RANGE_SINGLE = MOVE_SPEED * SINGLE_JUMP_TIME
const MAX_H_RANGE_DOUBLE = MOVE_SPEED * DOUBLE_JUMP_TIME
const MAX_DROP = 8

const CORRIDOR_WIDTH  = 14
const CORRIDOR_HEIGHT = 12
const SEGMENT_DEPTH   = 40
const WALL_THICKNESS  = 0.5
const GENERATE_AHEAD  = 3   // segments ahead of player to keep generated
const CLEANUP_BEHIND  = 2   // segments behind player to keep before removing

const DIFFICULTY = {
  easy:   { heightFraction: 0.5, rangeFraction: 0.5, minGap: 2, maxGap: 4, doubleJumpChance: 0,   platformsPerSegment: [3, 5] },
  medium: { heightFraction: 0.7, rangeFraction: 0.7, minGap: 3, maxGap: 6, doubleJumpChance: 0.2, platformsPerSegment: [4, 6] },
  hard:   { heightFraction: 0.9, rangeFraction: 0.9, minGap: 4, maxGap: 8, doubleJumpChance: 0.4, platformsPerSegment: [5, 8] },
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

// Generate platforms for one corridor segment.
// prevPlatform: last platform from previous segment (or null for first).
// segmentStartZ: z where this segment starts (going into -z).
function generateSegmentPlatforms(prevPlatform, segmentStartZ, difficulty = 'medium') {
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.medium
  const count = randInt(diff.platformsPerSegment[0], diff.platformsPerSegment[1])
  const platforms = []

  const halfW = CORRIDOR_WIDTH / 2 - 1 // keep platforms away from walls

  let prev = prevPlatform
  if (!prev) {
    // First segment — spawn platform
    prev = { w: 3, h: 1, d: 3, x: 0, y: 0.5, z: segmentStartZ - 3 }
    platforms.push(prev)
  }

  const segmentEndZ = segmentStartZ - SEGMENT_DEPTH

  for (let i = 0; i < count; i++) {
    const prevTopY = prev.y + prev.h / 2

    const needsDoubleJump = Math.random() < diff.doubleJumpChance
    const maxHeight = needsDoubleJump ? DOUBLE_JUMP_HEIGHT : SINGLE_JUMP_HEIGHT
    const maxRange  = needsDoubleJump ? MAX_H_RANGE_DOUBLE : MAX_H_RANGE_SINGLE

    const maxUp   = maxHeight * diff.heightFraction
    const maxDown = Math.min(MAX_DROP, prevTopY - 0.5)
    const dy = rand(-maxDown * 0.3, maxUp)

    const gap = rand(diff.minGap, diff.maxGap)
    const hDist = Math.min(gap, maxRange * diff.rangeFraction)

    // Bias forward (-z) within corridor
    const forwardDist = rand(hDist * 0.5, hDist)
    const lateralDist = rand(-hDist * 0.6, hDist * 0.6)

    const sizeScale = needsDoubleJump ? 0.8 : 1.0
    const w = rand(1.5, 3) * sizeScale
    const h = rand(0.5, 2)
    const d = rand(1.5, 3) * sizeScale

    const newTopY = prevTopY + dy

    let px = clamp(prev.x + lateralDist, -halfW + w / 2, halfW - w / 2)
    let pz = prev.z - forwardDist
    let py = Math.max(h / 2, newTopY)

    // Keep within segment bounds
    pz = clamp(pz, segmentEndZ + d / 2, segmentStartZ - d / 2)

    // Clamp height within corridor
    py = clamp(py, h / 2, CORRIDOR_HEIGHT - h / 2 - 1)

    const plat = {
      w: Math.round(w * 10) / 10,
      h: Math.round(h * 10) / 10,
      d: Math.round(d * 10) / 10,
      x: Math.round(px * 10) / 10,
      y: Math.round(py * 10) / 10,
      z: Math.round(pz * 10) / 10,
    }

    // Verify reachability
    const edgeDistX = Math.max(0, Math.abs(plat.x - prev.x) - prev.w / 2 - plat.w / 2)
    const edgeDistZ = Math.max(0, Math.abs(plat.z - prev.z) - prev.d / 2 - plat.d / 2)
    const edgeDist = Math.sqrt(edgeDistX * edgeDistX + edgeDistZ * edgeDistZ)
    const limit = (needsDoubleJump ? MAX_H_RANGE_DOUBLE : MAX_H_RANGE_SINGLE) * diff.rangeFraction

    if (edgeDist > limit) {
      const scale = (limit * 0.8) / edgeDist
      plat.x = Math.round(clamp(prev.x + lateralDist * scale, -halfW + w / 2, halfW - w / 2) * 10) / 10
      plat.z = Math.round((prev.z - forwardDist * scale) * 10) / 10
    }

    // Height reachability
    const platTopY = plat.y + plat.h / 2
    const heightDiff = platTopY - prevTopY
    if (heightDiff > maxHeight * diff.heightFraction) {
      plat.y = Math.round(clamp(prevTopY + maxHeight * diff.heightFraction * 0.8, h / 2, CORRIDOR_HEIGHT - 2) * 10) / 10
    }

    // Don't overlap previous
    const overlapX = (prev.w / 2 + plat.w / 2) - Math.abs(plat.x - prev.x)
    const overlapZ = (prev.d / 2 + plat.d / 2) - Math.abs(plat.z - prev.z)
    if (overlapX > 0 && overlapZ > 0) {
      if (overlapX < overlapZ) {
        plat.x = Math.round(clamp(plat.x + (plat.x >= prev.x ? 1 : -1) * (overlapX + 0.5), -halfW, halfW) * 10) / 10
      } else {
        plat.z = Math.round((plat.z + (plat.z <= prev.z ? -1 : 1) * (overlapZ + 0.5)) * 10) / 10
      }
    }

    platforms.push(plat)
    prev = plat
  }

  return { platforms, lastPlatform: prev }
}

export class CourseManager {
  constructor(difficulty = 'medium') {
    this._difficulty = difficulty
    this._segments = []          // { index, startZ, platforms, meshes, walls, obstacles }
    this._nextSegmentIndex = 0
    this._lastPlatform = null
  }

  get allObstacles() {
    const out = []
    for (const seg of this._segments) {
      for (const obs of seg.obstacles) out.push(obs)
    }
    return out
  }

  get allWallAABBs() {
    const out = []
    for (const seg of this._segments) {
      for (const w of seg.wallAABBs) out.push(w)
    }
    return out
  }

  // Call each frame with player z position. Returns { added, removed } mesh arrays.
  update(playerZ, scene, THREE) {
    const playerSegment = Math.floor(-playerZ / SEGMENT_DEPTH)
    const added = []
    const removed = []

    // Generate segments ahead
    while (this._nextSegmentIndex <= playerSegment + GENERATE_AHEAD) {
      const seg = this._createSegment(THREE)
      this._segments.push(seg)
      for (const m of seg.meshes) { scene.add(m); added.push(m) }
      for (const m of seg.walls) { scene.add(m); added.push(m) }
    }

    // Cleanup old segments
    while (this._segments.length > 0) {
      const oldest = this._segments[0]
      if (oldest.index < playerSegment - CLEANUP_BEHIND) {
        this._segments.shift()
        for (const m of oldest.meshes) { scene.remove(m); removed.push(m) }
        for (const m of oldest.walls) { scene.remove(m); removed.push(m) }
      } else {
        break
      }
    }

    return { added, removed }
  }

  _createSegment(THREE) {
    const index = this._nextSegmentIndex++
    const startZ = -index * SEGMENT_DEPTH

    const { platforms, lastPlatform } = generateSegmentPlatforms(
      this._lastPlatform, startZ, this._difficulty
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
      obstacles.push({ mesh, aabb })
    })

    // Corridor walls
    const walls = []
    const wallAABBs = []
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.9 })
    const midZ = startZ - SEGMENT_DEPTH / 2

    // Left wall
    const leftWall = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, CORRIDOR_HEIGHT, SEGMENT_DEPTH),
      wallMat
    )
    leftWall.position.set(-CORRIDOR_WIDTH / 2 - WALL_THICKNESS / 2, CORRIDOR_HEIGHT / 2, midZ)
    walls.push(leftWall)
    wallAABBs.push(new THREE.Box3().setFromObject(leftWall))

    // Right wall
    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, CORRIDOR_HEIGHT, SEGMENT_DEPTH),
      wallMat
    )
    rightWall.position.set(CORRIDOR_WIDTH / 2 + WALL_THICKNESS / 2, CORRIDOR_HEIGHT / 2, midZ)
    walls.push(rightWall)
    wallAABBs.push(new THREE.Box3().setFromObject(rightWall))

    // Back wall only on first segment
    if (index === 0) {
      const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(CORRIDOR_WIDTH + WALL_THICKNESS * 2, CORRIDOR_HEIGHT, WALL_THICKNESS),
        wallMat
      )
      backWall.position.set(0, CORRIDOR_HEIGHT / 2, startZ + WALL_THICKNESS / 2)
      walls.push(backWall)
      wallAABBs.push(new THREE.Box3().setFromObject(backWall))
    }

    return { index, startZ, platforms, meshes, walls, wallAABBs, obstacles }
  }

  getSpawnPosition() {
    return { x: 0, y: 1, z: -3 }
  }
}
