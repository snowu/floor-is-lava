import { describe, it, expect } from 'vitest'
import { dailyTrack, TRACKS } from '../src/sim/tracks.js'
import { autopilotTime, medalsFrom } from '../src/sim/medals.js'

describe('daily medals', () => {
  it('changes course with the date and keeps it for the day', () => {
    const a = dailyTrack(new Date(2026, 9, 8, 0, 5))
    const b = dailyTrack(new Date(2026, 9, 8, 23, 55))
    const c = dailyTrack(new Date(2026, 9, 9, 0, 5))
    expect(a.id).toBe(b.id)
    expect(a.seed).toBe(b.seed)
    expect(c.seed).not.toBe(a.seed)
  })

  it('times the daily course with the autopilot and orders the medals', () => {
    const time = autopilotTime(dailyTrack(new Date(2026, 9, 8)))
    expect(time).toBeGreaterThan(20)
    const [gold, silver, bronze] = medalsFrom(time)
    expect(gold).toBeLessThan(silver)
    expect(silver).toBeGreaterThanOrEqual(time)
    expect(bronze).toBeGreaterThan(silver)
  }, 60000)

  it('matches the fixed trials medal times', () => {
    expect(medalsFrom(autopilotTime(TRACKS[0]))[1]).toBe(TRACKS[0].medals[1])
  }, 60000)
})
