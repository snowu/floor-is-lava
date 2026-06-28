import config from './config.js'
import { createPlatformMeshes } from './platformStyles.js'
import { createBillboardMeshes, BILLBOARD_STYLE_COUNT, PRODUCT_AD_STYLE_INDEX, isProductAdStyle, registerProductAdMaterial } from './billboardStyles.js'
import { buildPlatformAABBs } from './hitboxes.js'
import { createRailMeshes, RailDefinition } from './railSystem.js'
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

function bbOverlapsZRange(plat, bb) {
  const bbHalfD = config.FACADE_DEPTH / 2
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

function generateRailsFirstSegment(prevPlatform, segmentStartZ, isFirstSegment, platformCounter, lastBillboardZ) {
  const platforms = []
  const billboards = []
  const rails = []
  const halfW = config.CORRIDOR_WIDTH / 2 - 1

  let prev = prevPlatform
  if (!prev) {
    const sp = config.SPAWN_PLAT_SIZE
    prev = { w: sp, h: 1, d: sp, x: 0, y: 0.5, z: segmentStartZ - 3, isSpawn: true }
    platforms.push(prev)
  }

  const count = config.RAILS_PER_SEGMENT
  let nextZ = segmentStartZ - (isFirstSegment ? config.FIRST_PLATFORM_GAP : 0)
  let platIndex = platformCounter
  let afterGapSide = 0

  // Generate rail waypoints — these are potential rail positions, not all connected
  const waypoints = []
  for (let i = 0; i < count; i++) {
    // Billboard walls
    if (platIndex > 0 && platIndex % config.FACADE_GAP_EVERY === 0 && (!isFirstSegment || i >= config.WARMUP_COUNT)) {
      const gapMidZ = nextZ - config.BILLBOARD_GAP_SIZE / 2
      const tooClose = lastBillboardZ !== null &&
        Math.abs(gapMidZ - lastBillboardZ) < config.FACADE_DEPTH + config.MIN_PLATFORM_SPACING
      if (!tooClose) {
        const prevTopY = prev.y + prev.h / 2
        const side = prev.x >= 0 ? 1 : -1
        const facadeHeight = rand(config.FACADE_HEIGHT_MIN, config.FACADE_HEIGHT_MAX)
        billboards.push({
          x: side * config.FACADE_X_OFFSET,
          y: prevTopY - 1,
          z: gapMidZ,
          side,
          height: facadeHeight,
          width: config.FACADE_WIDTH,
        })
        lastBillboardZ = gapMidZ
        nextZ -= config.BILLBOARD_GAP_SIZE
        afterGapSide = side
      }
    }

    const prevTopY = prev.y + prev.h / 2
    const gap = rand(config.RAIL_GAP_MIN, config.RAIL_GAP_MAX)
    const dy = rand(-config.RAIL_HEIGHT_VAR, config.RAIL_HEIGHT_VAR)
    const wpY = clamp(prevTopY + dy, 1.5, config.CORRIDOR_HEIGHT - 3)
    const wpZ = nextZ - gap

    let wpX
    if (afterGapSide !== 0) {
      wpX = clamp(afterGapSide * (config.FACADE_X_OFFSET - 3) + rand(-1, 1), -halfW, halfW)
      afterGapSide = 0
    } else if (Math.random() < 0.35) {
      // Force opposite side — break same-side tendency
      wpX = clamp(-prev.x + rand(-2, 2), -halfW, halfW)
    } else {
      wpX = clamp(prev.x + rand(-halfW * 0.6, halfW * 0.6), -halfW, halfW)
    }

    waypoints.push({ x: Math.round(wpX * 10) / 10, y: Math.round(wpY * 10) / 10, z: Math.round(wpZ * 10) / 10 })
    nextZ = wpZ

    // Landing pad under this waypoint
    const padSize = config.RAIL_LANDING_PAD_SIZE
    const pad = {
      w: padSize, h: config.BOX_HEIGHT, d: padSize,
      x: Math.round(wpX * 10) / 10,
      y: Math.round((wpY - 0.5) * 10) / 10,
      z: Math.round(wpZ * 10) / 10,
    }
    platforms.push(pad)
    prev = pad
    platIndex++
  }

  // Helper to push a curved rail between two points
  function pushCurvedRail(a, b, yOffset) {
    const dist = Math.abs(a.z - b.z)
    const midX = (a.x + b.x) / 2 + rand(-1.5, 1.5)
    const avgY = (a.y + b.y) / 2
    const arcHeight = rand(1.5, 3) * Math.min(1, dist / 12)
    const midY = avgY + arcHeight + yOffset
    const midZ = (a.z + b.z) / 2
    const sz = a.z, ez = b.z
    const startRY = a.y + yOffset, endRY = b.y + yOffset
    rails.push({
      points: [
        { x: a.x, y: startRY, z: sz },
        { x: a.x + (midX - a.x) * 0.35, y: startRY + (midY - startRY) * 0.35, z: sz + (ez - sz) * 0.25 },
        { x: midX, y: midY, z: midZ },
        { x: midX + (b.x - midX) * 0.65, y: endRY + (midY - endRY) * 0.35, z: sz + (ez - sz) * 0.75 },
        { x: b.x, y: endRY, z: ez },
      ],
      isCurved: true,
    })
  }

  // Only connect ~50% of consecutive pairs — rest are airborne gaps
  // But never leave more than 2 consecutive gaps (unfair)
  let gapStreak = 0
  for (let i = 0; i < waypoints.length - 1; i++) {
    const forceRail = gapStreak >= 2 || (isFirstSegment && i === 0)
    const makeRail = forceRail || Math.random() < 0.45

    if (makeRail) {
      gapStreak = 0
      const a = waypoints[i]
      const b = waypoints[i + 1]
      const dist = Math.abs(a.z - b.z)
      const heightDiff = Math.abs(a.y - b.y)

      if (dist < 16 && heightDiff < 2) {
        rails.push({
          points: [
            { x: a.x, y: a.y + 0.8, z: a.z },
            { x: b.x, y: b.y + 0.8, z: b.z },
          ],
          isCurved: false,
        })
      } else {
        pushCurvedRail(a, b, 0.8)
      }
    } else {
      gapStreak++
    }
  }

  // Standalone rails — scattered at offset positions for discovery
  for (let i = 1; i < waypoints.length - 1; i++) {
    if (Math.random() > 0.45) continue
    const wp = waypoints[i]
    // Push far from waypoint X — opposite side or far lateral
    const side = Math.random() < 0.5 ? 1 : -1
    const offsetX = clamp(side * rand(3, halfW), -halfW, halfW)
    const railLen = rand(6, 12)
    const rY = wp.y + rand(-1, 2) + 0.8
    rails.push({
      points: [
        { x: offsetX, y: rY, z: wp.z + railLen / 2 },
        { x: offsetX, y: rY, z: wp.z - railLen / 2 },
      ],
      isCurved: false,
    })
    // 30% chance of parallel rail nearby
    if (Math.random() < 0.3) {
      const pX = clamp(offsetX + rand(-3, 3), -halfW, halfW)
      rails.push({
        points: [
          { x: pX, y: rY + rand(-0.5, 0.5), z: wp.z + railLen / 2 },
          { x: pX, y: rY + rand(-0.5, 0.5), z: wp.z - railLen / 2 },
        ],
        isCurved: false,
      })
    }
  }

  return { platforms, billboards, rails, lastPlatform: prev, platformCounter: platIndex, lastBillboardZ }
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
    if (platIndex > 0 && platIndex % config.FACADE_GAP_EVERY === 0 && i >= WARMUP_COUNT) {
      const gapMidZ = nextZ - config.BILLBOARD_GAP_SIZE / 2
      const tooClose = lastBillboardZ !== null &&
        Math.abs(gapMidZ - lastBillboardZ) < config.FACADE_DEPTH + config.MIN_PLATFORM_SPACING
      if (!tooClose) {
        const prevTopY = prev.y + prev.h / 2
        const side = prev.x >= 0 ? 1 : -1
        const facadeHeight = rand(config.FACADE_HEIGHT_MIN, config.FACADE_HEIGHT_MAX)
        billboards.push({
          x: side * config.FACADE_X_OFFSET,
          y: prevTopY - 1,
          z: gapMidZ,
          side,
          height: facadeHeight,
          width: config.FACADE_WIDTH,
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
    const baseWidth = rand(config.BOX_WIDTH_MIN, config.BOX_WIDTH_MAX)
    const baseDepth = rand(config.BOX_DEPTH_MIN, config.BOX_DEPTH_MAX)
    const w = baseWidth * sizeScale * warmupSizeBonus
    const h = config.BOX_HEIGHT
    const d = baseDepth * sizeScale * warmupSizeBonus

    const edgeGap = rand(diff.minGap, diff.maxGap)
    const prevHalfD = prev.d / 2
    const pz = nextZ - prevHalfD - edgeGap - d / 2
    nextZ = pz

    let px
    if (afterGapSide !== 0) {
      // First platform after gap: spawn on same side as billboard wall
      const targetX = afterGapSide * (config.FACADE_X_OFFSET - 3)
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

  // Generate rails
  const rails = []

  // Straight rails on platform edges
  for (const plat of platforms) {
    if (plat.isSpawn) continue
    if (plat.d < 10) continue
    if (Math.random() > config.RAIL_EDGE_CHANCE) continue

    const railX = plat.x
    const railY = plat.y + plat.h / 2 + 0.3
    const railZ1 = plat.z + plat.d / 2 - 0.5
    const railZ2 = plat.z - plat.d / 2 + 0.5

    rails.push({
      points: [
        { x: railX, y: railY, z: railZ1 },
        { x: railX, y: railY, z: railZ2 },
      ],
      isCurved: false,
    })
  }

  // Curved rails bridging gaps between platforms
  const curvedCount = Math.floor(config.CURVED_RAILS_PER_SEGMENT + (Math.random() < (config.CURVED_RAILS_PER_SEGMENT % 1) ? 1 : 0))
  const usedPairs = new Set()

  for (let c = 0; c < curvedCount && platforms.length > 2; c++) {
    const startIdx = randInt(0, platforms.length - 2)
    const endIdx = startIdx + 1
    const pairKey = `${startIdx}-${endIdx}`
    if (usedPairs.has(pairKey)) continue
    usedPairs.add(pairKey)

    const startPlat = platforms[startIdx]
    const endPlat = platforms[endIdx]
    if (startPlat.isSpawn || endPlat.isSpawn) continue

    const gap = Math.abs(startPlat.z - endPlat.z) - startPlat.d / 2 - endPlat.d / 2
    if (gap < 8) continue

    const startY = startPlat.y + startPlat.h / 2 + 1.0
    const endY = endPlat.y + endPlat.h / 2 + 1.0
    const avgY = (startY + endY) / 2
    const arcHeight = rand(1.5, 3) * Math.min(1, gap / 12)
    const midY = avgY + arcHeight
    const midX = (startPlat.x + endPlat.x) / 2 + rand(-1, 1)
    const midZ = (startPlat.z + endPlat.z) / 2

    const sz = startPlat.z - startPlat.d / 2
    const ez = endPlat.z + endPlat.d / 2

    // Quarter-points with gentle Y progression — match Z fraction to avoid vertical starts
    const qZ1 = sz + (ez - sz) * 0.25
    const qZ2 = sz + (ez - sz) * 0.75
    const qX1 = startPlat.x + (midX - startPlat.x) * 0.35
    const qX2 = midX + (endPlat.x - midX) * 0.65
    const qY1 = startY + (midY - startY) * 0.35
    const qY2 = endY + (midY - endY) * 0.35

    rails.push({
      points: [
        { x: startPlat.x, y: startY, z: sz },
        { x: qX1, y: qY1, z: qZ1 },
        { x: midX, y: midY, z: midZ },
        { x: qX2, y: qY2, z: qZ2 },
        { x: endPlat.x, y: endY, z: ez },
      ],
      isCurved: true,
    })
  }

  // Unified post-processing: billboard clearance → overlap resolution → reachability clamp
  // Iterate until stable (max 10 passes)
  const absMaxReach = config.DOUBLE_JUMP_HEIGHT * config.PLAT_HEIGHT_FRAC
  const finalClearance = config.FACADE_MIN_CLEARANCE
  for (let pass = 0; pass < 8; pass++) {
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

  return { platforms, billboards, rails, lastPlatform: prev, platformCounter: platIndex, lastBillboardZ: lastBillboardZ }
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
      const bbD = config.FACADE_DEPTH
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

  get allRails() {
    const out = []
    for (const seg of this._segments) {
      if (seg._visible === false) continue
      if (seg.railData) for (const r of seg.railData) out.push(r)
    }
    return out
  }

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

    // Hide/show segments based on distance — keep all for respawn
    const activeRange = config.FOG_END + config.SEGMENT_DEPTH * 2
    let visChanged = false
    for (const seg of this._segments) {
      const segEnd = seg.startZ - config.SEGMENT_DEPTH
      const dist = Math.abs(playerZ - (seg.startZ + segEnd) / 2)
      const shouldShow = dist < activeRange
      if (seg._visible !== shouldShow) {
        seg._visible = shouldShow
        visChanged = true
        for (const m of seg.meshes) m.visible = shouldShow
      }
    }
    return { added, removed: [], visChanged }
  }


  _createSegment(THREE) {
    const index = this._nextSegmentIndex++
    const startZ = -index * config.SEGMENT_DEPTH

    let result
    if (config.RAILS_FIRST_MODE) {
      result = generateRailsFirstSegment(
        this._lastPlatform, startZ, index === 0, this._platformCounter, this._lastBillboardZ
      )
    } else {
      result = generateSegmentPlatforms(
        this._lastPlatform, startZ, this._difficulty, index === 0, this._platformCounter,
        this._prevSegmentPlatforms, this._lastBillboardZ
      )
    }
    const { platforms, billboards, rails, lastPlatform, platformCounter, lastBillboardZ } = result
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

    // Billboards placed in gaps between platforms
    for (const bb of billboards) {
      const styleIdx = Math.random() < 0.75
        ? PRODUCT_AD_STYLE_INDEX
        : Math.floor(Math.random() * (BILLBOARD_STYLE_COUNT - 1))
      const result = createBillboardMeshes(bb, config, styleIdx)
      for (const m of result.meshes) meshes.push(m)
      const aabb = new THREE.Box3().setFromObject(result.mainMesh)
      if (bb.side > 0) aabb.min.x -= config.FACADE_HITBOX_PAD
      else aabb.max.x += config.FACADE_HITBOX_PAD
      obstacles.push({ mesh: result.mainMesh, aabb, isBillboard: true, wallNormalX: -bb.side })
      if (isProductAdStyle(styleIdx)) {
        registerProductAdMaterial(result.mainMesh.material)
      }
    }

    // Rails
    const segmentRails = []
    for (const railData of rails) {
      const railDef = new RailDefinition(railData.points, railData.isCurved)
      if (railDef.isCurved && railDef.length < config.RAIL_MIN_LENGTH) continue
      const result = createRailMeshes(railDef)
      meshes.push(result.group)
      segmentRails.push(result)
    }

    const allIssues = validateSegment(platforms, billboards, prevNeighbors)
    const issues = allIssues.filter(i => i.type === 'overlap' || i.type === 'clip')

    return { index, startZ, platforms, meshes, obstacles, issues, railData: segmentRails }
  }

  segmentBoundaries() {
    return this._segments.map(s => s.startZ)
  }

  updatePlatforms() {
    // no-op — material updates are now global via updatePlatformMaterials()
  }
}
