// Service worker: keeps the game playable offline. The build fills in the
// release ID and the files to precache (see vite.config.js); nothing here is
// bundled by Vite.
//
// - Pages: network first (so updates arrive), the cached page when offline.
// - version.json: always the network, so the update checker never sees a
//   stale release.
// - Built assets: cache first; their names carry a content hash.
// - Google Fonts: cached on install and refreshed in the background.

const RELEASE = self.__RELEASE__
const PRECACHE = self.__PRECACHE__
const ASSETS = `packet-loss-${RELEASE}`
const FONTS = 'packet-loss-fonts'
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&family=Silkscreen:wght@400;700&display=swap'
const scope = new URL(self.registration.scope)

async function cacheFonts() {
  const cache = await caches.open(FONTS)
  const response = await fetch(FONT_CSS)
  if (!response.ok) return
  const css = await response.clone().text()
  await cache.put(FONT_CSS, response)
  const files = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1])
  await Promise.all(files.map((url) => cache.add(url).catch(() => {})))
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(ASSETS)
    await cache.addAll(PRECACHE.map((path) => new URL(path, scope).href))
    // fonts are a nicety: never fail the install over them
    await cacheFonts().catch(() => {})
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('packet-loss-') && key !== ASSETS && key !== FONTS) await caches.delete(key)
    await self.clients.claim()
  })())
})

async function networkFirstPage(request) {
  const cache = await caches.open(ASSETS)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(new URL('./', scope).href, response.clone())
    return response
  } catch {
    return (await cache.match(new URL('./', scope).href)) ?? Response.error()
  }
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name)
  const hit = await cache.match(request, { ignoreSearch: name === ASSETS })
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok || response.type === 'opaque') await cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(FONTS)
  const hit = await cache.match(request)
  const fresh = fetch(request).then((response) => {
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone())
    return response
  }).catch(() => hit)
  return hit ?? fresh
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request))
    return
  }
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return
  const path = url.pathname.slice(scope.pathname.length)
  if (path === 'version.json') return
  if (path === '' || path === 'index.html') {
    event.respondWith(networkFirstPage(request))
    return
  }
  // other pages (the local art lab) are never cached
  if (request.mode === 'navigate') return
  event.respondWith(cacheFirst(request, ASSETS))
})
