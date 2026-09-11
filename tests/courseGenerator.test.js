import { describe, it, expect } from 'vitest'
import { createSeededRandom, generateSegmentPlatforms, validateSegment } from '../src/courseGenerator.js'
import config from '../src/config.js'
import { RailDefinition } from '../src/railSystem.js'

const RUNS = 25000

describe('segment generation', { timeout: 60000 }, () => {
  it('produces no platform-platform overlaps across many runs', () => {
    const allIssues = []
    for (let run = 0; run < RUNS; run++) {
      const rng = createSeededRandom(run + 1)
      let prevPlat = null
      let counter = 0
      let lastBillboardZ = null
      let neighborPlatforms = null
      for (let seg = 0; seg < 3; seg++) {
        const startZ = -seg * 120
        const { platforms, billboards, lastPlatform, platformCounter, lastBillboardZ: lbz } =
          generateSegmentPlatforms(prevPlat, startZ, 'medium', seg === 0, counter, neighborPlatforms, lastBillboardZ, rng)
        prevPlat = lastPlatform
        counter = platformCounter
        lastBillboardZ = lbz

        const issues = validateSegment(platforms, billboards, neighborPlatforms)
        const overlaps = issues.filter(i => i.type === 'overlap')
        for (const o of overlaps) {
          allIssues.push({ run, seg, ...o })
        }
        neighborPlatforms = platforms.slice(-3)
      }
    }
    expect(allIssues, `Found ${allIssues.length} overlaps:\n${allIssues.slice(0, 20).map(i => `  run ${i.run} seg ${i.seg}: ${i.msg}`).join('\n')}`).toHaveLength(0)
  })

  it('produces no platform-billboard clips across many runs', () => {
    const allIssues = []
    for (let run = 0; run < RUNS; run++) {
      const rng = createSeededRandom(run + 1)
      let prevPlat = null
      let counter = 0
      let lastBillboardZ = null
      let neighborPlatforms = null
      for (let seg = 0; seg < 3; seg++) {
        const startZ = -seg * 120
        const { platforms, billboards, lastPlatform, platformCounter, lastBillboardZ: lbz } =
          generateSegmentPlatforms(prevPlat, startZ, 'medium', seg === 0, counter, neighborPlatforms, lastBillboardZ, rng)
        prevPlat = lastPlatform
        counter = platformCounter
        lastBillboardZ = lbz

        const issues = validateSegment(platforms, billboards, neighborPlatforms)
        const clips = issues.filter(i => i.type === 'clip')
        for (const c of clips) {
          allIssues.push({ run, seg, ...c })
        }
        neighborPlatforms = platforms.slice(-3)
      }
    }
    expect(allIssues, `Found ${allIssues.length} clips:\n${allIssues.slice(0, 20).map(i => `  run ${i.run} seg ${i.seg}: ${i.msg}`).join('\n')}`).toHaveLength(0)
  })

  it('generates expected platform count per segment', () => {
    for (let run = 0; run < RUNS; run++) {
      const { platforms } = generateSegmentPlatforms(null, 0, 'medium', true, 0, null, null, createSeededRandom(run + 1))
      expect(platforms.length).toBeGreaterThanOrEqual(2)
      expect(platforms.length).toBeLessThanOrEqual(25)
    }
  })

  it('no platform violates billboard clearance zone across many runs', () => {
    const allIssues = []
    for (let run = 0; run < RUNS; run++) {
      const rng = createSeededRandom(run + 1)
      let prevPlat = null
      let counter = 0
      let lastBillboardZ = null
      let neighborPlatforms = null
      for (let seg = 0; seg < 3; seg++) {
        const startZ = -seg * 120
        const { platforms, billboards, lastPlatform, platformCounter, lastBillboardZ: lbz } =
          generateSegmentPlatforms(prevPlat, startZ, 'medium', seg === 0, counter, neighborPlatforms, lastBillboardZ, rng)
        prevPlat = lastPlatform
        counter = platformCounter
        lastBillboardZ = lbz

        const issues = validateSegment(platforms, billboards, neighborPlatforms)
        const tooClose = issues.filter(i => i.type === 'too_close_billboard')
        for (const c of tooClose) {
          allIssues.push({ run, seg, ...c })
        }
        neighborPlatforms = platforms.slice(-3)
      }
    }
    expect(allIssues, `Found ${allIssues.length} too-close:\n${allIssues.slice(0, 20).map(i => `  run ${i.run} seg ${i.seg}: ${i.msg}`).join('\n')}`).toHaveLength(0)
  })

  it('all platform pairs maintain minimum spacing', () => {
    const failures = []
    for (let run = 0; run < RUNS; run++) {
      const rng = createSeededRandom(run + 1)
      let prevPlat = null
      let counter = 0
      let lastBillboardZ = null
      let neighborPlatforms = null
      for (let seg = 0; seg < 3; seg++) {
        const startZ = -seg * 120
        const { platforms, lastPlatform, platformCounter, lastBillboardZ: lbz } =
          generateSegmentPlatforms(prevPlat, startZ, 'medium', seg === 0, counter, neighborPlatforms, lastBillboardZ, rng)
        prevPlat = lastPlatform
        counter = platformCounter
        lastBillboardZ = lbz

        const all = neighborPlatforms ? platforms.concat(neighborPlatforms) : platforms
        for (let i = 0; i < platforms.length; i++) {
          const a = platforms[i]
          for (let j = i + 1; j < all.length; j++) {
            const b = all[j]
            if (a === b) continue
            const gapX = Math.max(0, Math.abs(a.x - b.x) - a.w / 2 - b.w / 2)
            const gapZ = Math.max(0, Math.abs(a.z - b.z) - a.d / 2 - b.d / 2)
            const gapY = Math.max(0, Math.abs(a.y - b.y) - a.h / 2 - b.h / 2)
            const dist = Math.sqrt(gapX * gapX + gapZ * gapZ + gapY * gapY)
            if (dist > 0 && dist < config.MIN_PLATFORM_SPACING) {
              failures.push({ run, seg, i, j, dist: dist.toFixed(2) })
            }
          }
        }
        neighborPlatforms = platforms.slice(-3)
      }
    }
    expect(failures, `Found ${failures.length} spacing violations:\n${failures.slice(0, 20).map(f => `  run ${f.run} seg ${f.seg}: plat ${f.i}&${f.j} dist=${f.dist}`).join('\n')}`).toHaveLength(0)
  })

  it('platforms are reachable from previous platform', () => {
    const unreachable = []
    for (let run = 0; run < 5000; run++) {
      const rng = createSeededRandom(run + 1)
      let prevPlat = null
      let counter = 0
      let lastBillboardZ = null
      let neighborPlatforms = null
      for (let seg = 0; seg < 3; seg++) {
        const startZ = -seg * 120
        const { platforms, lastPlatform, platformCounter, lastBillboardZ: lbz } =
          generateSegmentPlatforms(prevPlat, startZ, 'medium', seg === 0, counter, neighborPlatforms, lastBillboardZ, rng)
        prevPlat = lastPlatform
        counter = platformCounter
        lastBillboardZ = lbz

        for (let i = 1; i < platforms.length; i++) {
          const prev = platforms[i - 1]
          const cur = platforms[i]
          const prevTopY = prev.y + prev.h / 2
          const curTopY = cur.y + cur.h / 2
          const heightDiff = curTopY - prevTopY
          const maxJump = config.DOUBLE_JUMP_HEIGHT * config.PLAT_HEIGHT_FRAC
          if (heightDiff > maxJump * 1.2) {
            unreachable.push({ run, seg, i, heightDiff: heightDiff.toFixed(2), max: maxJump.toFixed(2) })
          }
        }
        neighborPlatforms = platforms.slice(-3)
      }
    }
    expect(unreachable, `Found ${unreachable.length} unreachable:\n${unreachable.slice(0, 20).map(u => `  run ${u.run} seg ${u.seg}: plat ${u.i} dy=${u.heightDiff} max=${u.max}`).join('\n')}`).toHaveLength(0)
  })

  it('is reproducible and moves monotonically forward across segments', () => {
    const generateRun = () => {
      const rng = createSeededRandom(12345)
      const all = []
      let prev = null
      let counter = 0
      let neighbors = null
      let lastBillboardZ = null
      for (let seg = 0; seg < 5; seg++) {
        const result = generateSegmentPlatforms(prev, -seg * config.SEGMENT_DEPTH, 'medium', seg === 0, counter, neighbors, lastBillboardZ, rng)
        all.push(...result.platforms)
        prev = result.lastPlatform
        counter = result.platformCounter
        neighbors = result.platforms.slice(-3)
        lastBillboardZ = result.lastBillboardZ
      }
      return all
    }

    const first = generateRun()
    expect(generateRun()).toEqual(first)
    for (let i = 1; i < first.length; i++) {
      expect(first[i].z).toBeLessThan(first[i - 1].z)
    }
  })

  it('builds rails from final platform positions', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const { platforms, rails } = generateSegmentPlatforms(null, 0, 'medium', true, 0, null, null, createSeededRandom(seed))
      for (const rail of rails) {
        const endpoints = [rail.points[0], rail.points.at(-1)]
        for (const endpoint of endpoints) {
          const anchored = platforms.some(p =>
            Math.abs(endpoint.x - p.x) < 0.001 &&
            endpoint.z >= p.z - p.d / 2 - 0.001 &&
            endpoint.z <= p.z + p.d / 2 + 0.001
          )
          expect(anchored, `Seed ${seed} has detached rail endpoint`).toBe(true)
        }
      }
    }
  })

  it('keeps every forward gap within the traversal budget', () => {
    const maxGap = config.PLAT_MAX_GAP
    for (let seed = 1; seed <= 5000; seed++) {
      const { platforms } = generateSegmentPlatforms(null, 0, 'medium', true, 0, null, null, createSeededRandom(seed))
      for (let i = 1; i < platforms.length; i++) {
        const previous = platforms[i - 1]
        const current = platforms[i]
        const edgeGap = previous.z - previous.d / 2 - (current.z + current.d / 2)
        expect(edgeGap, `Seed ${seed} has an excessive gap`).toBeLessThanOrEqual(maxGap + 0.1)
      }
    }
  })

  it('occasionally creates long connector rails without making them common', () => {
    let longCount = 0
    for (let seed = 1; seed <= 2000; seed++) {
      const { platforms, rails } = generateSegmentPlatforms(null, 0, 'medium', true, 0, null, null, createSeededRandom(seed))
      for (const rail of rails.filter(candidate => candidate.isCurved)) {
        if (!rail.isLong) continue
        longCount++
        expect(rail.platformSpan).toBeGreaterThanOrEqual(2)
        expect(rail.platformSpan).toBeLessThanOrEqual(config.RAIL_LONG_MAX_SPAN)

        const railDef = new RailDefinition(rail.points, true, true)
        let previousZ = Infinity
        for (let sample = 0; sample <= 100; sample++) {
          const point = railDef.getPointAt(sample / 100)
          expect(point.z, `Seed ${seed} has a reversing long rail`).toBeLessThanOrEqual(previousZ + 0.001)
          previousZ = point.z

          for (let i = rail.startPlatformIndex + 1; i < rail.endPlatformIndex; i++) {
            const platform = platforms[i]
            const radius = config.RAIL_RADIUS * 1.25
            const intersects =
              point.x >= platform.x - platform.w / 2 - radius &&
              point.x <= platform.x + platform.w / 2 + radius &&
              point.y >= platform.y - platform.h / 2 - radius &&
              point.y <= platform.y + platform.h / 2 + radius &&
              point.z >= platform.z - platform.d / 2 - radius &&
              point.z <= platform.z + platform.d / 2 + radius
            expect(intersects, `Seed ${seed} has a long rail intersecting platform ${i}`).toBe(false)
          }
        }
      }
    }

    expect(longCount / 2000).toBeGreaterThan(0.1)
    expect(longCount / 2000).toBeLessThan(0.3)
  })

  it('creates mostly continuous rooftops with rare explicit traversal gaps', () => {
    let transitions = 0
    let traversalGaps = 0
    for (let seed = 1; seed <= 5000; seed++) {
      const { platforms, rails } = generateSegmentPlatforms(null, 0, 'medium', true, 0, null, null, createSeededRandom(seed))
      for (let i = 1; i < platforms.length; i++) {
        const previous = platforms[i - 1]
        const current = platforms[i]
        const edgeGap = previous.z - previous.d / 2 - (current.z + current.d / 2)
        transitions++
        if (current.isTraversalGap) {
          traversalGaps++
          expect(edgeGap).toBeGreaterThanOrEqual(config.PLAT_MIN_GAP - 0.1)
        } else {
          expect(edgeGap).toBeLessThanOrEqual(config.PLAT_SEAM_GAP_MAX + 0.1)
          expect(current.y + current.h / 2).toBeCloseTo(previous.y + previous.h / 2)
        }
      }

      for (const rail of rails.filter(candidate => candidate.isCurved)) {
        const crossedPlatforms = platforms.slice(rail.startPlatformIndex + 1, rail.endPlatformIndex + 1)
        expect(crossedPlatforms.some(platform => platform.isTraversalGap)).toBe(true)
      }
    }

    const gapRate = traversalGaps / transitions
    expect(gapRate).toBeGreaterThan(0.1)
    expect(gapRate).toBeLessThan(0.3)
  })

  it('places readable jump and slide obstacles inside their host rooftops', () => {
    let hurdleCount = 0
    let overheadCount = 0
    for (let seed = 1; seed <= 2000; seed++) {
      const { platforms, courseObstacles } = generateSegmentPlatforms(null, 0, 'medium', true, 0, null, null, createSeededRandom(seed))
      for (const obstacle of courseObstacles) {
        const platform = platforms[obstacle.platformIndex]
        const platformTop = platform.y + platform.h / 2
        expect(obstacle.z - obstacle.d / 2).toBeGreaterThan(platform.z - platform.d / 2)
        expect(obstacle.z + obstacle.d / 2).toBeLessThan(platform.z + platform.d / 2)
        expect(obstacle.w).toBeLessThan(platform.w)

        if (obstacle.type === 'hurdle') {
          hurdleCount++
          expect(obstacle.y - obstacle.h / 2).toBeCloseTo(platformTop)
        } else {
          overheadCount++
          const bottom = obstacle.y - obstacle.h / 2 - platformTop
          expect(bottom).toBeGreaterThan(config.SLIDE_HEIGHT)
          expect(bottom).toBeLessThan(config.PLAYER_HEIGHT)
        }
      }
    }
    expect(hurdleCount).toBeGreaterThan(100)
    expect(overheadCount).toBeGreaterThan(100)
  })
})
