import { describe, expect, it } from 'vitest'
import { serviceWorker } from '../vite.config.js'

describe('offline service worker', () => {
  const files = ['index.html', 'lab.html', 'assets/game-abc.js', 'assets/game-abc.css', 'assets/lab-def.js', 'assets/lab-ghi.css', 'assets/medalWorker-1.js', 'assets/game-abc.js.map', 'version.json']
  const source = serviceWorker('release-1', files)
  const precache = JSON.parse(source.match(/self\.__PRECACHE__ = (.*)\n/)[1])

  it('precaches the game, its worker and the install icons', () => {
    for (const f of ['./', 'manifest.webmanifest', 'icon-192.png', 'assets/game-abc.js', 'assets/game-abc.css', 'assets/medalWorker-1.js']) expect(precache).toContain(f)
  })

  it('leaves out the local art lab, source maps and the release file', () => {
    for (const f of ['lab.html', 'assets/lab-def.js', 'assets/lab-ghi.css', 'assets/game-abc.js.map', 'index.html', 'version.json']) expect(precache).not.toContain(f)
    // version.json is served from the network so update checks stay honest
    expect(source).toMatch(/path === 'version\.json'\) return/)
  })

  it('names its cache after the release, so a new deploy replaces it', () => {
    expect(source.startsWith('self.__RELEASE__ = "release-1"')).toBe(true)
  })
})
