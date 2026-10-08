import { describe, it, expect, vi } from 'vitest'
import { readRelease, isNewerBuild, buildUpdateUrl, createUpdateChecker } from '../src/ui/update.js'

const current = { id: 'old-build', version: '1.0.0', builtAt: '2026-10-08T12:00:00Z' }
const next = { ...current, id: 'new-build', builtAt: '2026-10-08T13:00:00Z' }
const json = value => ({ ok: true, json: async () => value })
const page = id => ({ ok: true, text: async () => `<head><meta name="packet-loss-build" content="${id}" /></head>` })
function setup(fetcher) {
  const navigate = vi.fn()
  return { ...createUpdateChecker({ current, base: '/packet-loss/', href: 'https://snowu.github.io/packet-loss/?seed=123#game', fetcher, navigate }), navigate }
}

describe('release discovery', () => {
  it('accepts build metadata and rejects malformed release responses', () => {
    expect(readRelease(next)).toEqual(next)
    for (const value of [null, {}, { ...next, id: 'bad"html' }, { ...next, version: 'latest' }, { ...next, builtAt: 'yesterday' }]) expect(readRelease(value)).toBeNull()
  })
  it('detects a new build even when the package version stays the same, but ignores stale builds', () => {
    expect(isNewerBuild(current, next)).toBe(true)
    expect(isNewerBuild(current, current)).toBe(false)
    expect(isNewerBuild(current, { ...next, builtAt: '2026-10-07T13:00:00Z' })).toBe(false)
  })
  it('bypasses cached release metadata and retains an update after an offline check', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(next)).mockRejectedValueOnce(new TypeError('offline'))
    const checker = setup(fetcher)
    await checker.check()
    expect(fetcher.mock.calls[0][0]).toMatch(/^\/packet-loss\/version.json\?t=/)
    expect(fetcher.mock.calls[0][1].cache).toBe('no-store')
    expect(checker.state.pending).toEqual(next)
    await checker.check(true)
    expect(checker.state.pending).toEqual(next)
    expect(checker.state.status).toContain('Try again online')
    expect(checker.navigate).not.toHaveBeenCalled()
  })
  it('reports up-to-date and malformed or unsuccessful release checks', async () => {
    const checker = setup(vi.fn().mockResolvedValueOnce(json(current)).mockResolvedValueOnce(json({})).mockResolvedValueOnce({ ok: false }))
    await checker.check(true)
    expect(checker.state.status).toBe('Up to date')
    await checker.check(true)
    expect(checker.state.status).toContain('Can’t check')
    await checker.check(true)
    expect(checker.state.checking).toBe(false)
    expect(checker.state.pending).toBeNull()
  })
  it('coalesces concurrent release checks', async () => {
    let resolve
    const fetcher = vi.fn(() => new Promise(done => { resolve = done }))
    const checker = setup(fetcher)
    const check = checker.check()
    await checker.check()
    expect(fetcher).toHaveBeenCalledTimes(1)
    resolve(json(next))
    await check
  })
})

describe('manual update', () => {
  it('preserves the course seed and hash while replacing an earlier update parameter', () => {
    expect(buildUpdateUrl('https://example.com/packet-loss/?seed=123&v=old#game', 'new-build')).toBe('https://example.com/packet-loss/?seed=123&v=new-build#game')
  })
  it('navigates only after the player applies a coherent release', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(next)).mockResolvedValueOnce(page(next.id))
    const checker = setup(fetcher)
    await checker.check()
    expect(checker.navigate).not.toHaveBeenCalled()
    await checker.apply()
    expect(fetcher.mock.calls[1][1].cache).toBe('reload')
    expect(checker.navigate).toHaveBeenCalledWith('https://snowu.github.io/packet-loss/?seed=123&v=new-build#game')
  })
  it('keeps the old session and allows retries when HTML and release metadata disagree', async () => {
    const checker = setup(vi.fn().mockResolvedValueOnce(json(next)).mockResolvedValueOnce(page(current.id)).mockResolvedValueOnce(page(next.id)))
    await checker.check()
    await checker.apply()
    expect(checker.navigate).not.toHaveBeenCalled()
    expect(checker.state.status).toContain('still arriving')
    expect(checker.state.updating).toBe(false)
    await checker.apply()
    expect(checker.navigate).toHaveBeenCalledTimes(1)
  })
  it('keeps the discovered update available after a download fails', async () => {
    const checker = setup(vi.fn().mockResolvedValueOnce(json(next)).mockRejectedValueOnce(new TypeError('offline')))
    await checker.check()
    await checker.apply()
    expect(checker.navigate).not.toHaveBeenCalled()
    expect(checker.state.pending).toEqual(next)
    expect(checker.state.updating).toBe(false)
    expect(checker.state.status).toContain('Try again online')
  })
})
