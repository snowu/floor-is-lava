// Registers the service worker that keeps the game playable offline. Only
// production builds ship one; the dev server never registers it.
export function installOffline() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {})
  })
}
