import config from './config.js'
import { createPlatformMeshes } from './platformStyles.js'
import { createBillboardMeshes, BILLBOARD_STYLE_COUNT, PRODUCT_AD_STYLE_INDEX, PRODUCT_AD_VARIANT_COUNT, isProductAdStyle, registerProductAdMaterial } from './billboardStyles.js'
import { buildPlatformAABBs } from './hitboxes.js'
import { createRailMeshes, RailDefinition } from './railSystem.js'
import * as THREE from 'three'

const courseObstacleGeometry = new THREE.BoxGeometry(1, 1, 1)
const hurdleMaterial = new THREE.MeshStandardMaterial({
  color: 0xffb000,
  emissive: 0xff5500,
  emissiveIntensity: 0.35,
  roughness: 0.55,
  metalness: 0.45,
})
const overheadMaterial = new THREE.MeshStandardMaterial({
  color: 0x00d8ff,
  emissive: 0x0066ff,
  emissiveIntensity: 0.4,
  roughness: 0.4,
  metalness: 0.65,
})
const obstaclePostMaterial = new THREE.MeshStandardMaterial({
  color: 0x303844,
  roughness: 0.6,
  metalness: 0.7,
})

function createCourseObstacleMeshes(descriptor, platform) {
  const material = descriptor.type === 'hurdle' ? hurdleMaterial : overheadMaterial
  const mainMesh = new THREE.Mesh(courseObstacleGeometry, material)
  mainMesh.scale.set(descriptor.w, descriptor.h, descriptor.d)
  mainMesh.position.set(descriptor.x, descriptor.y, descriptor.z)
  const meshes = [mainMesh]

  if (descriptor.type === 'overhead') {
    const platformTop = platform.y + platform.h / 2
    const postHeight = descriptor.y - descriptor.h / 2 - platformTop
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(courseObstacleGeometry, obstaclePostMaterial)
      post.scale.set(0.18, postHeight, descriptor.d)
      post.position.set(
        descriptor.x + side * (descriptor.w / 2 - 0.09),
        platformTop + postHeight / 2,
        descriptor.z,
      )
      meshes.push(post)
    }
  }

  return { meshes, mainMesh }
}

function isLongRailValid(points, intermediatePlatforms) {
  const rail = new RailDefinition(points, true, true)
  const radius = config.RAIL_RADIUS * 1.25
  let previousZ = Infinity
  for (let i = 0; i <= 100; i++) {
    const point = rail.getPointAt(i / 100)
    if (point.z > previousZ + 0.001) return false
    previousZ = point.z
    for (const platform of intermediatePlatforms) {
      if (point.x < platform.x - platform.w / 2 - radius ||
          point.x > platform.x + platform.w / 2 + radius ||
          point.y < platform.y - platform.h / 2 - radius ||
          point.y > platform.y + platform.h / 2 + radius ||
          point.z < platform.z - platform.d / 2 - radius ||
          point.z > platform.z + platform.d / 2 + radius) continue
      return false
    }
  }
  return true
}

export function createSeededRandom(seed) {
  let state = seed >>> 0 || 0x6d2b79f5
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function rand(min, max, rng) {
  return min + rng() * (max - min)
}

function randInt(min, max, rng) {
  return Math.floor(rand(min, max + 1, rng))
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

function bbOverlapsZRange(plat, bb) {
  const bbHalfD = (bb.depth || config.FACADE_DEPTH) / 2
  return (plat.d / 2 + bbHalfD) - Math.abs(plat.z - bb.z) > 0
}

function clampXAwayFromBillboards(plat, billboards, halfW) {
  let xMin = -halfW
  let xMax = halfW
  for (const bb of billboards) {
    if (!bbOverlapsZRange(plat, bb)) continue
    const bbHalfW = (bb.width || config.FACADE_WIDTH) / 2
    const innerEdge = bb.side * config.FACADE_X_OFFSET - bb.side * (bbHalfW + config.FACADE_HITBOX_PAD)
    if (bb.side > 0) {
      xMax = Math.min(xMax, innerEdge - config.FACADE_MIN_CLEARANCE - plat.w / 2)
    } else {
      xMin = Math.max(xMin, innerEdge + config.FACADE_MIN_CLEARANCE + plat.w / 2)
    }
  }
  if (xMin > xMax) return
  plat.x = Math.round(clamp(plat.x, xMin, xMax) * 10) / 10
}

function nudgeAwayFromAll(plat, allPlatforms, neighborPlatforms, halfW, billboards) {
  const checkList = neighborPlatforms ? allPlatforms.concat(neighborPlatforms) : allPlatforms
  for (let pass = 0; pass < 10; pass++) {
    let moved = false
    for (const other of checkList) {
      if (other === plat) continue
      if (hasOverlap(plat, other)) {
        const overlapX = (plat.w / 2 + other.w / 2) - Math.abs(plat.x - other.x)
        const lateralDir = plat.x >= other.x ? 1 : -1
        plat.x = Math.round(clamp(plat.x + lateralDir * (overlapX + 0.1), -halfW, halfW) * 10) / 10
        if (billboards) clampXAwayFromBillboards(plat, billboards, halfW)
        if (!hasOverlap(plat, other)) { moved = true; continue }
        const clearZ = other.z - other.d / 2 - plat.d / 2 - config.MIN_PLATFORM_SPACING
        plat.z = Math.round(Math.min(plat.z, clearZ) * 10) / 10
        moved = true
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
        if (billboards) clampXAwayFromBillboards(plat, billboards, halfW)
        plat.y = Math.round(clamp(plat.y + push * 0.3, plat.h / 2 + 0.5, config.CORRIDOR_HEIGHT - 2) * 10) / 10
        moved = true
      }
    }
    if (!moved) break
  }
  // Final guarantee: keep pushing Z backward until no overlaps remain
  for (let safetyIter = 0; safetyIter < 40; safetyIter++) {
    let worstClearZ = plat.z
    for (const other of checkList) {
      if (other === plat) continue
      if (hasOverlap(plat, other)) {
        const clearZ = other.z - other.d / 2 - plat.d / 2 - config.MIN_PLATFORM_SPACING
        worstClearZ = Math.min(worstClearZ, clearZ)
      }
    }
    if (worstClearZ >= plat.z) break
    plat.z = Math.round(worstClearZ * 10) / 10
  }
}

function generateSegmentPlatforms(prevPlatform, segmentStartZ, difficulty = 'medium', isFirstSegment = false, platformCounter = 0, neighborPlatforms = null, lastBillboardZ = null, rng = Math.random) {
  const previousBillboardZ = lastBillboardZ
  const diff = {
    heightFraction: config.PLAT_HEIGHT_FRAC,
    rangeFraction: config.PLAT_RANGE_FRAC,
    minGap: config.PLAT_MIN_GAP,
    maxGap: config.PLAT_MAX_GAP,
    doubleJumpChance: config.PLAT_DOUBLE_JUMP_CHANCE,
  }
  const count = randInt(config.PLAT_MIN_PER_SEGMENT, config.PLAT_MAX_PER_SEGMENT, rng)
  const platforms = []
  const billboards = []
  const courseObstacles = []

  const halfW = config.CORRIDOR_WIDTH / 2 - 1

  let prev = prevPlatform
  if (!prev) {
    const sp = config.SPAWN_PLAT_SIZE
    prev = { w: sp, h: 1, d: sp, x: 0, y: 0.5, z: segmentStartZ - 3, isSpawn: true }
    platforms.push(prev)
  }
  const entryPlatform = prev

  const WARMUP_COUNT = isFirstSegment ? config.WARMUP_COUNT : 0
  let nextZ = prev.z - (isFirstSegment ? config.FIRST_PLATFORM_GAP : 0)
  let platIndex = platformCounter

  let afterGapSide = 0 // 0 = no constraint, -1/1 = force next platform to this side

  for (let i = 0; i < count; i++) {
    const isTraversalGap = i >= WARMUP_COUNT && rng() < config.PLAT_GAP_CHANCE
    const hasFacade = isTraversalGap && rng() < config.FACADE_GAP_CHANCE

    if (hasFacade) {
      const gapMidZ = nextZ - config.BILLBOARD_GAP_SIZE / 2
      const tooClose = lastBillboardZ !== null &&
        Math.abs(gapMidZ - lastBillboardZ) < config.FACADE_DEPTH + config.MIN_PLATFORM_SPACING
      if (!tooClose) {
        const prevTopY = prev.y + prev.h / 2
        const side = prev.x >= 0 ? 1 : -1
        const facadeHeight = rand(config.FACADE_HEIGHT_MIN, config.FACADE_HEIGHT_MAX, rng)
        billboards.push({
          x: side * config.FACADE_X_OFFSET,
          y: prevTopY - 1,
          z: gapMidZ,
          side,
          height: facadeHeight,
          width: config.FACADE_WIDTH,
        })
        billboards.at(-1).beforePlatformId = platIndex
        lastBillboardZ = gapMidZ
        afterGapSide = side
      }
    }

    const prevTopY = prev.y + prev.h / 2
    const warmupT = (isFirstSegment && i < WARMUP_COUNT) ? (i + 1) / WARMUP_COUNT : 1.0

    const needsDoubleJump = warmupT < 1 ? false : rng() < diff.doubleJumpChance
    const maxHeight = needsDoubleJump ? config.DOUBLE_JUMP_HEIGHT : config.SINGLE_JUMP_HEIGHT

    const maxUp   = maxHeight * diff.heightFraction * warmupT
    const maxDown = Math.min(config.MAX_DROP, prevTopY - 0.5) * warmupT

    const heightRoll = rng()
    let dy
    if (!isTraversalGap) {
      dy = 0
    } else if (heightRoll < 0.3) {
      dy = rand(-maxDown * 0.5, -maxDown * 0.1, rng)
    } else if (heightRoll < 0.7) {
      dy = rand(maxUp * 0.2, maxUp * 0.7, rng)
    } else {
      dy = rand(maxUp * 0.7, maxUp, rng)
    }

    const sizeScale = needsDoubleJump ? config.DOUBLE_JUMP_SIZE_SCALE : 1.0
    const warmupSizeBonus = warmupT < 1 ? 1 + (1 - warmupT) * 0.5 : 1.0
    const baseWidth = rand(config.BOX_WIDTH_MIN, config.BOX_WIDTH_MAX, rng)
    const baseDepth = rand(config.BOX_DEPTH_MIN, config.BOX_DEPTH_MAX, rng)
    const w = baseWidth * sizeScale * warmupSizeBonus
    const h = config.BOX_HEIGHT
    const d = baseDepth * sizeScale * warmupSizeBonus

    const edgeGap = isTraversalGap
      ? rand(diff.minGap, diff.maxGap, rng)
      : rand(config.PLAT_SEAM_GAP_MIN, config.PLAT_SEAM_GAP_MAX, rng)
    const prevHalfD = prev.d / 2
    const pz = nextZ - prevHalfD - edgeGap - d / 2
    nextZ = pz

    let px
    if (afterGapSide !== 0) {
      // First platform after gap: spawn on same side as billboard wall
      const targetX = afterGapSide * (config.FACADE_X_OFFSET - 3)
      px = clamp(targetX + rand(-1, 1, rng), -halfW + w / 2, halfW - w / 2)
      afterGapSide = 0
    } else {
      const baseLateralRange = Math.min(6, config.CORRIDOR_WIDTH / 2 - 1)
      const lateralRange = baseLateralRange * warmupT
      px = clamp(prev.x + rand(-lateralRange, lateralRange, rng), -halfW + w / 2, halfW - w / 2)
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
      platformId: platIndex,
      isTraversalGap,
      gapBefore: edgeGap,
    }

    const platTopY = plat.y + plat.h / 2
    const heightDiff = platTopY - prevTopY
    const maxReachHeight = (needsDoubleJump ? config.DOUBLE_JUMP_HEIGHT : config.SINGLE_JUMP_HEIGHT) * diff.heightFraction
    if (heightDiff > maxReachHeight) {
      plat.y = Math.round(clamp(prevTopY + maxReachHeight * 0.8, h / 2 + 0.5, config.CORRIDOR_HEIGHT - 2) * 10) / 10
    }
    // Hard cap: platform must always be reachable via double jump
    const absMaxReach = config.DOUBLE_JUMP_HEIGHT * diff.heightFraction
    const finalTopY = plat.y + plat.h / 2
    if (finalTopY - prevTopY > absMaxReach) {
      plat.y = Math.round(clamp(prevTopY + absMaxReach * 0.8, h / 2 + 0.5, config.CORRIDOR_HEIGHT - 2) * 10) / 10
    }

    // Prevent platform from being too close to any billboard
    const clearance = config.FACADE_MIN_CLEARANCE
    for (const bb of billboards) {
      if (!bbOverlapsZRange(plat, bb)) continue
      const bbHalfW = (bb.width || config.FACADE_WIDTH) / 2
      const bbHalfD = config.FACADE_DEPTH / 2
      const xOverlap = (plat.w / 2 + bbHalfW + config.FACADE_HITBOX_PAD + clearance) - Math.abs(plat.x - bb.x)
      if (xOverlap > 0) {
        const bbInnerEdge = bb.side * config.FACADE_X_OFFSET - bb.side * (bbHalfW + config.FACADE_HITBOX_PAD)
        if (bb.side > 0) {
          plat.x = Math.round(Math.min(plat.x, bbInnerEdge - clearance - plat.w / 2) * 10) / 10
        } else {
          plat.x = Math.round(Math.max(plat.x, bbInnerEdge + clearance + plat.w / 2) * 10) / 10
        }
        const xStillOverlap = (plat.w / 2 + bbHalfW + config.FACADE_HITBOX_PAD + clearance) - Math.abs(plat.x - bb.x)
        if (xStillOverlap > 0) {
          plat.z = Math.round((bb.z - bbHalfD - plat.d / 2 - clearance) * 10) / 10
          nextZ = plat.z
        }
      }
    }

    nudgeAwayFromAll(plat, platforms, neighborPlatforms, halfW, billboards)

    platforms.push(plat)
    prev = plat
    platIndex++
  }

  // Unified post-processing: billboard clearance → overlap resolution → reachability clamp
  // Iterate until stable (max 10 passes)
  const absMaxReach = config.DOUBLE_JUMP_HEIGHT * config.PLAT_HEIGHT_FRAC
  const finalClearance = config.FACADE_MIN_CLEARANCE
  for (let pass = 0; pass < 20; pass++) {
    let anyChange = false

    // 1. Push platforms out of billboard hitboxes
    for (const plat of platforms) {
      if (plat.isSpawn) continue
      for (const bb of billboards) {
        if (!bbOverlapsZRange(plat, bb)) continue
        const bbHalfW = (bb.width || config.FACADE_WIDTH) / 2
        const bbHalfD = config.FACADE_DEPTH / 2
        const xOverlap = (plat.w / 2 + bbHalfW + config.FACADE_HITBOX_PAD + finalClearance) - Math.abs(plat.x - bb.x)
        if (xOverlap > 0) {
          const oldX = plat.x, oldZ = plat.z
          const bbInnerEdge = bb.side * config.FACADE_X_OFFSET - bb.side * (bbHalfW + config.FACADE_HITBOX_PAD)
          if (bb.side > 0) {
            plat.x = Math.round(Math.min(plat.x, bbInnerEdge - finalClearance - plat.w / 2) * 10) / 10
          } else {
            plat.x = Math.round(Math.max(plat.x, bbInnerEdge + finalClearance + plat.w / 2) * 10) / 10
          }
          const xStill = (plat.w / 2 + bbHalfW + config.FACADE_HITBOX_PAD + finalClearance) - Math.abs(plat.x - bb.x)
          if (xStill > 0) {
            plat.z = Math.round((bb.z - bbHalfD - plat.d / 2 - finalClearance) * 10) / 10
          }
          if (plat.x !== oldX || plat.z !== oldZ) anyChange = true
        }
      }
    }

    // 2. Resolve platform-platform overlaps (nudge respects billboard zones via clampX)
    for (const plat of platforms) {
      if (plat.isSpawn) continue
      const oldZ = plat.z
      nudgeAwayFromAll(plat, platforms, neighborPlatforms, halfW, billboards)
      if (plat.z !== oldZ) anyChange = true
    }

    // 3. Reachability clamp (only lower Y, never raise — so won't create new billboard issues)
    for (let i = 1; i < platforms.length; i++) {
      const prevP = platforms[i - 1]
      const curP = platforms[i]
      if (curP.isSpawn) continue
      const prevTopY = prevP.y + prevP.h / 2
      const curTopY = curP.y + curP.h / 2
      if (curTopY - prevTopY > absMaxReach) {
        const newY = Math.round(clamp(prevTopY + absMaxReach * 0.8, curP.h / 2 + 0.5, config.CORRIDOR_HEIGHT - 2) * 10) / 10
        if (newY !== curP.y) { curP.y = newY; anyChange = true }
      }
    }

    if (!anyChange) break
  }

  // Correction passes can move an earlier platform behind a later one. Establish
  // one canonical traversal order and guarantee edge-to-edge spacing in that order.
  platforms.sort((a, b) => b.z - a.z)
  let previous = isFirstSegment ? null : entryPlatform
  for (const current of platforms) {
    if (previous && current !== previous) {
      const minGap = current.isTraversalGap
        ? config.PLAT_MIN_GAP
        : config.PLAT_SEAM_GAP_MIN + 0.1
      const maxGap = current.isTraversalGap
        ? config.PLAT_MAX_GAP
        : config.PLAT_SEAM_GAP_MAX
      const nearestZ = previous.z - previous.d / 2 - minGap - current.d / 2
      const furthestZ = previous.z - previous.d / 2 - maxGap - current.d / 2
      current.z = Math.round(clamp(current.z, furthestZ, nearestZ) * 10) / 10
    }

    if (!previous || current === previous) {
      previous = current
      continue
    }
    const previousTopY = previous.y + previous.h / 2
    const currentTopY = current.y + current.h / 2
    if (!current.isTraversalGap) {
      current.y = previousTopY - current.h / 2
    } else if (currentTopY - previousTopY > absMaxReach) {
      current.y = Math.round(clamp(previousTopY + absMaxReach * 0.8, current.h / 2 + 0.5, config.CORRIDOR_HEIGHT - 2) * 10) / 10
    }
    previous = current
  }
  prev = platforms.at(-1)

  for (const bb of billboards) {
    const endIndex = platforms.findIndex(platform => platform.platformId === bb.beforePlatformId)
    if (endIndex < 0) continue
    const startPlatform = endIndex === 0 ? entryPlatform : platforms[endIndex - 1]
    const endPlatform = platforms[endIndex]
    const startEdge = startPlatform.z - startPlatform.d / 2
    const endEdge = endPlatform.z + endPlatform.d / 2
    bb.z = (startEdge + endEdge) / 2
    bb.y = Math.min(
      startPlatform.y + startPlatform.h / 2,
      endPlatform.y + endPlatform.h / 2,
    ) - 1
    bb.depth = Math.max(2, startEdge - endEdge + 1)
    const wallOffset = config.FACADE_HITBOX_PAD + bb.width / 2 + 0.5
    bb.x = bb.side > 0
      ? Math.max(startPlatform.x + startPlatform.w / 2, endPlatform.x + endPlatform.w / 2) + wallOffset
      : Math.min(startPlatform.x - startPlatform.w / 2, endPlatform.x - endPlatform.w / 2) - wallOffset
  }

  // Facades are optional traversal features. Drop one when platform correction
  // leaves no safe placement rather than moving the required path out of reach.
  for (let i = billboards.length - 1; i >= 0; i--) {
    const bb = billboards[i]
    const clearanceBox = {
      x: bb.x,
      y: bb.y + bb.height / 2,
      z: bb.z,
      w: bb.width + config.FACADE_HITBOX_PAD * 2 + 0.4,
      h: bb.height,
      d: (bb.depth || config.FACADE_DEPTH) + 0.4,
    }
    if (platforms.some(platform => hasOverlap(platform, clearanceBox))) billboards.splice(i, 1)
  }
  lastBillboardZ = billboards.at(-1)?.z ?? previousBillboardZ

  for (let platformIndex = 0; platformIndex < platforms.length; platformIndex++) {
    const platform = platforms[platformIndex]
    if (platform.isSpawn || platform.d < config.COURSE_OBSTACLE_EDGE_MARGIN * 2 + 2) continue
    if (rng() > config.COURSE_OBSTACLE_CHANCE) continue

    const obstacleCount = rng() < config.COURSE_SECOND_OBSTACLE_CHANCE ? 2 : 1
    const usedZ = []
    for (let obstacleIndex = 0; obstacleIndex < obstacleCount; obstacleIndex++) {
      let z = 0
      let placed = false
      for (let attempt = 0; attempt < 8; attempt++) {
        z = rand(
          platform.z - platform.d / 2 + config.COURSE_OBSTACLE_EDGE_MARGIN,
          platform.z + platform.d / 2 - config.COURSE_OBSTACLE_EDGE_MARGIN,
          rng,
        )
        if (usedZ.every(otherZ => Math.abs(z - otherZ) >= config.COURSE_OBSTACLE_MIN_SPACING)) {
          placed = true
          break
        }
      }
      if (!placed) continue
      usedZ.push(z)

      const type = rng() < 0.5 ? 'hurdle' : 'overhead'
      const platformTop = platform.y + platform.h / 2
      const height = type === 'hurdle' ? config.HURDLE_HEIGHT : config.OVERHEAD_BEAM_HEIGHT
      const bottom = type === 'hurdle' ? platformTop : platformTop + config.OVERHEAD_BEAM_BOTTOM
      courseObstacles.push({
        type,
        platformIndex,
        x: platform.x,
        y: bottom + height / 2,
        z: Math.round(z * 10) / 10,
        w: Math.max(2, platform.w - 0.8),
        h: height,
        d: type === 'hurdle' ? config.HURDLE_DEPTH : config.OVERHEAD_BEAM_DEPTH,
      })
    }
  }

  // Rails depend on final platform transforms and must be generated last.
  const rails = []
  for (let platformIndex = 0; platformIndex < platforms.length; platformIndex++) {
    const plat = platforms[platformIndex]
    if (courseObstacles.some(obstacle => obstacle.platformIndex === platformIndex)) continue
    if (plat.isSpawn || plat.d < 10 || rng() > config.RAIL_EDGE_CHANCE) continue
    const railY = plat.y + plat.h / 2 + 0.3
    rails.push({
      points: [
        { x: plat.x, y: railY, z: plat.z + plat.d / 2 - 0.5 },
        { x: plat.x, y: railY, z: plat.z - plat.d / 2 + 0.5 },
      ],
      isCurved: false,
    })
  }

  const curvedCount = Math.floor(config.CURVED_RAILS_PER_SEGMENT + (rng() < (config.CURVED_RAILS_PER_SEGMENT % 1) ? 1 : 0))
  const usedPairs = new Set()
  for (let c = 0; c < curvedCount && platforms.length > 2; c++) {
    const wantsLongRail = platforms.length > 3 && rng() < config.RAIL_LONG_CHANCE
    const span = wantsLongRail
      ? randInt(2, Math.min(config.RAIL_LONG_MAX_SPAN, platforms.length - 1), rng)
      : 1
    const startIdx = randInt(0, platforms.length - 1 - span, rng)
    const endIdx = startIdx + span
    const pairKey = `${startIdx}-${endIdx}`
    if (usedPairs.has(pairKey)) continue
    usedPairs.add(pairKey)

    const startPlat = platforms[startIdx]
    const endPlat = platforms[endIdx]
    if (startPlat.isSpawn || endPlat.isSpawn) continue
    if (!platforms.slice(startIdx + 1, endIdx + 1).some(platform => platform.isTraversalGap)) continue
    const gap = Math.abs(startPlat.z - endPlat.z) - startPlat.d / 2 - endPlat.d / 2
    if (gap < 8) continue

    const startY = startPlat.y + startPlat.h / 2 + 1
    const endY = endPlat.y + endPlat.h / 2 + 1
    const intermediateTopY = span > 1
      ? Math.max(...platforms.slice(startIdx + 1, endIdx).map(p => p.y + p.h / 2))
      : -Infinity
    const arcHeight = wantsLongRail ? rand(4, 7, rng) : rand(1.5, 3, rng)
    const midY = Math.max(
      (startY + endY) / 2 + arcHeight * Math.min(1, gap / 12),
      intermediateTopY + 2,
    )
    const midX = (startPlat.x + endPlat.x) / 2 + rand(-1, 1, rng)
    const sz = startPlat.z - startPlat.d / 2
    const ez = endPlat.z + endPlat.d / 2
    const midZ = sz + (ez - sz) * 0.5

    let points
    if (wantsLongRail) {
      const bridgeY = Math.max(midY, intermediateTopY + 3)
      const lateralOffset = midX - (startPlat.x + endPlat.x) / 2
      const bridgePoint = (z, y = bridgeY) => {
        const fraction = (sz - z) / (sz - ez)
        return {
          x: startPlat.x + (endPlat.x - startPlat.x) * fraction + Math.sin(fraction * Math.PI) * lateralOffset,
          y,
          z,
        }
      }
      points = [{ x: startPlat.x, y: startY, z: sz }]
      for (const intermediate of platforms.slice(startIdx + 1, endIdx)) {
        const clearance = config.RAIL_RADIUS * 1.25 + 0.3
        points.push(bridgePoint(intermediate.z + intermediate.d / 2 + clearance))
        points.push(bridgePoint(intermediate.z, bridgeY + 1))
        points.push(bridgePoint(intermediate.z - intermediate.d / 2 - clearance))
      }
      points.push({ x: endPlat.x, y: endY, z: ez })
    } else {
      points = [
        { x: startPlat.x, y: startY, z: sz },
        { x: startPlat.x + (midX - startPlat.x) * 0.35, y: startY + (midY - startY) * 0.35, z: sz + (ez - sz) * 0.25 },
        { x: midX, y: midY, z: midZ },
        { x: midX + (endPlat.x - midX) * 0.65, y: endY + (midY - endY) * 0.35, z: sz + (ez - sz) * 0.75 },
        { x: endPlat.x, y: endY, z: ez },
      ]
    }

    if (wantsLongRail && !isLongRailValid(points, platforms.slice(startIdx + 1, endIdx))) continue

    rails.push({
      points,
      isCurved: true,
      isLong: wantsLongRail,
      platformSpan: span,
      startPlatformIndex: startIdx,
      endPlatformIndex: endIdx,
    })
  }

  return { platforms, billboards, courseObstacles, rails, lastPlatform: prev, platformCounter: platIndex, lastBillboardZ: lastBillboardZ }
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
      const bbW = bb.width || config.FACADE_WIDTH
      const bbH = bb.height || config.FACADE_HEIGHT_MIN
      const bbD = bb.depth || config.FACADE_DEPTH
      const bbY = bb.y + bbH / 2
      if (hasOverlap(p, { w: bbW, d: bbD, h: bbH, x: bb.x, z: bb.z, y: bbY })) {
        issues.push({ type: 'clip', platIndices: [i], msg: `CLIP plat ${i} into billboard ${j}` })
      }
      // Check actual geometric overlap with billboard (including hitbox pad)
      const padded = { w: bbW + config.FACADE_HITBOX_PAD * 2, d: bbD, h: bbH, x: bb.x, z: bb.z, y: bbY }
      if (hasOverlap(p, padded)) {
        issues.push({ type: 'too_close_billboard', platIndices: [i], msg: `TOO CLOSE plat ${i} to billboard ${j}` })
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

    let generated = 0
    while (this._nextSegmentIndex <= targetSegment && generated < 3) {
      const seg = this._createSegment(THREE)
      this._segments.push(seg)
      for (const m of seg.meshes) { scene.add(m); added.push(m) }
      generated++
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
  constructor(difficulty = 'medium', seed = Math.floor(Math.random() * 0xffffffff)) {
    this._difficulty = difficulty
    this._seed = seed >>> 0
    this._segments = []
    this._nextSegmentIndex = 0
    this._lastPlatform = null
    this._furthestZ = 0
    this._platformCounter = 0
    this._lastBillboardZ = null
    this._prevSegmentPlatforms = null
  }

  get allRails() {
    const out = []
    for (const seg of this._segments) {
      if (seg._visible === false) continue
      if (seg.railData) for (const r of seg.railData) out.push(r)
    }
    return out
  }

  get seed() { return this._seed }

  get allObstacles() {
    const out = []
    for (const seg of this._segments) {
      if (seg._visible === false) continue
      for (const obs of seg.obstacles) out.push(obs)
    }
    return out
  }

  get allWallAABBs() {
    return []
  }

  destroyAll(scene) {
    for (const seg of this._segments) {
      this._disposeSegment(seg, scene)
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

    const added = []
    const removed = []

    let generated = 0
    while ((!this._lastPlatform || this._lastPlatform.z > targetZ) && generated < 3) {
      const seg = this._createSegment(THREE)
      this._segments.push(seg)
      for (const m of seg.meshes) { scene.add(m); added.push(m) }
      generated++
    }

    // Keep only the active render window. A seeded run can be regenerated on death.
    const activeRange = config.FOG_END + config.SEGMENT_DEPTH * 2
    let visChanged = false
    for (let i = this._segments.length - 1; i >= 0; i--) {
      const seg = this._segments[i]
      if (seg.minZ > playerZ + activeRange) {
        this._disposeSegment(seg, scene)
        this._segments.splice(i, 1)
        removed.push(seg)
        visChanged = true
        continue
      }
      const dist = Math.abs(playerZ - (seg.minZ + seg.maxZ) / 2)
      const shouldShow = dist < activeRange + (seg.maxZ - seg.minZ) / 2
      if (seg._visible !== shouldShow) {
        seg._visible = shouldShow
        visChanged = true
        for (const m of seg.meshes) m.visible = shouldShow
      }
    }
    return { added, removed, visChanged }
  }

  _disposeSegment(seg, scene) {
    const disposedGeometries = new Set()
    const disposedMaterials = new Set()
    for (const root of seg.meshes) {
      scene.remove(root)
      root.traverse((obj) => {
        const ownsTree = root.userData.segmentOwned
        if (ownsTree && obj.geometry && !disposedGeometries.has(obj.geometry)) {
          obj.geometry.dispose()
          disposedGeometries.add(obj.geometry)
        }
        const objectMaterials = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const material of objectMaterials) {
          if (!material || disposedMaterials.has(material)) continue
          if (ownsTree || material.userData.segmentOwned) {
            material.dispose()
            disposedMaterials.add(material)
          }
        }
      })
    }
  }


  _createSegment(THREE) {
    const index = this._nextSegmentIndex++
    const startZ = -index * config.SEGMENT_DEPTH
    const rng = createSeededRandom(this._seed + index)

    const { platforms, billboards, courseObstacles, rails, lastPlatform, platformCounter, lastBillboardZ } = generateSegmentPlatforms(
      this._lastPlatform, startZ, this._difficulty, index === 0, this._platformCounter,
      this._prevSegmentPlatforms, this._lastBillboardZ, rng
    )
    this._lastPlatform = lastPlatform
    this._platformCounter = platformCounter
    this._lastBillboardZ = lastBillboardZ
    const prevNeighbors = this._prevSegmentPlatforms
    this._prevSegmentPlatforms = platforms.slice(-3)

    const meshes = []
    const obstacles = []

    platforms.forEach((b, i) => {
      const globalIndex = this._platformCounter - platforms.length + i
      const result = createPlatformMeshes(b, globalIndex)

      for (const m of result.meshes) meshes.push(m)

      const { aabb, ledgeAABB } = buildPlatformAABBs(result.mainMesh)
      obstacles.push({ mesh: result.mainMesh, aabb, ledgeAABB, isSpawn: !!b.isSpawn })
    })

    for (const descriptor of courseObstacles) {
      const result = createCourseObstacleMeshes(descriptor, platforms[descriptor.platformIndex])
      for (const mesh of result.meshes) meshes.push(mesh)
      for (const mesh of result.meshes) {
        obstacles.push({
          mesh,
          aabb: new THREE.Box3().setFromObject(mesh),
          isCourseObstacle: true,
          obstacleType: descriptor.type,
          noLedgeGrab: true,
        })
      }
    }

    // Billboards placed in gaps between platforms
    for (const bb of billboards) {
      const styleIdx = rng() < 0.75
        ? PRODUCT_AD_STYLE_INDEX
        : Math.floor(rng() * (BILLBOARD_STYLE_COUNT - 1))
      const adVariant = Math.floor(rng() * PRODUCT_AD_VARIANT_COUNT)
      const result = createBillboardMeshes(bb, config, styleIdx, adVariant)
      for (const m of result.meshes) meshes.push(m)
      const aabb = new THREE.Box3().setFromObject(result.mainMesh)
      if (bb.side > 0) aabb.min.x -= config.FACADE_HITBOX_PAD
      else aabb.max.x += config.FACADE_HITBOX_PAD
      obstacles.push({ mesh: result.mainMesh, aabb, isBillboard: true, wallNormalX: -bb.side })
      if (isProductAdStyle(styleIdx)) {
        registerProductAdMaterial(result.mainMesh.material, result.mainMesh)
      }
    }

    // Rails
    const segmentRails = []
    for (const railData of rails) {
      const railDef = new RailDefinition(railData.points, railData.isCurved, railData.isLong)
      const result = createRailMeshes(railDef)
      meshes.push(result.group)
      segmentRails.push(result)
    }

    const allIssues = validateSegment(platforms, billboards, prevNeighbors)
    const issues = allIssues.filter(i => i.type === 'overlap' || i.type === 'clip')

    const minZ = Math.min(...platforms.map(p => p.z - p.d / 2))
    const maxZ = Math.max(...platforms.map(p => p.z + p.d / 2))
    return { index, startZ, minZ, maxZ, platforms, courseObstacles, meshes, obstacles, issues, railData: segmentRails }
  }

  segmentBoundaries() {
    return this._segments.map(s => s.maxZ)
  }

  updatePlatforms() {
    // no-op — material updates are now global via updatePlatformMaterials()
  }
}
