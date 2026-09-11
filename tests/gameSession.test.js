import { describe, expect, it } from 'vitest'
import { GameSession, getDefaultStorage } from '../src/gameSession.js'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  }
}

describe('GameSession', () => {
  it('scores each platform once and persists a new best', () => {
    const storage = createStorage()
    const session = new GameSession(storage)
    const platform = {}

    expect(session.landOn({ isSpawn: true })).toBe(false)
    expect(session.landOn(platform)).toBe(true)
    expect(session.landOn(platform)).toBe(false)
    expect(session.score).toBe(1)
    expect(session.bestScore).toBe(1)
    expect(storage.values.get('floor-is-lava.bestScore')).toBe('1')
  })

  it('accumulates and banks trick points with the active multiplier', () => {
    const session = new GameSession(createStorage())

    session.startTrick()
    session.update(2, 'grinding', 10)

    expect(session.trickMultiplier).toBe(2)
    expect(session.trickScore).toBe(100)
    expect(session.pendingTrickPoints).toBe(200)
    expect(session.land()).toBe(200)
    expect(session.score).toBe(200)
    expect(session.trickMultiplier).toBe(1)
    expect(session.inTrick).toBe(false)
  })

  it('resets the run while preserving persisted records', () => {
    const storage = createStorage({
      'floor-is-lava.bestScore': '42',
      'floor-is-lava.bestMultiplier': '5',
    })
    const session = new GameSession(storage)

    session.landOn({})
    session.update(3, 'airborne', 10)
    session.reset()

    expect(session.score).toBe(0)
    expect(session.runTime).toBe(0)
    expect(session.bestScore).toBe(42)
    expect(session.bestMultiplier).toBe(5)
  })

  it('continues when browser storage is unavailable', () => {
    const storage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    const session = new GameSession(storage)

    expect(() => session.landOn({})).not.toThrow()
    expect(session.bestScore).toBe(1)
  })

  it('guards access to a restricted localStorage property', () => {
    const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('restricted') },
    })

    try {
      expect(getDefaultStorage()).toBeNull()
      expect(() => new GameSession()).not.toThrow()
    } finally {
      if (previousDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', previousDescriptor)
      } else {
        delete globalThis.localStorage
      }
    }
  })
})
