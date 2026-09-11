import { describe, it, expect } from 'vitest'
import { createSeededRandom, generateSegmentPlatforms, validateSegment } from '../src/courseGenerator.js'
import config from '../src/config.js'

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
    const maxGap = config.PLAT_MAX_GAP + config.BILLBOARD_GAP_SIZE
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
})
