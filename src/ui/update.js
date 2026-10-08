export const APP_RELEASE = typeof __APP_RELEASE__ === 'undefined' ? { id: 'dev', version: 'dev', builtAt: '' } : __APP_RELEASE__
const BASE = import.meta.env.BASE_URL

export function readRelease(value) {
  if (!value || typeof value.id !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(value.id)) return null
  if (typeof value.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(value.version)) return null
  if (typeof value.builtAt !== 'string' || !Number.isFinite(Date.parse(value.builtAt))) return null
  return { id: value.id, version: value.version, builtAt: value.builtAt }
}

export function isNewerBuild(current, next) {
  return !!next && next.id !== current.id && Date.parse(next.builtAt) >= Date.parse(current.builtAt)
}

export function buildUpdateUrl(href, id) {
  const url = new URL(href)
  url.searchParams.set('v', id)
  return url.href
}

export function createUpdateChecker({ current = APP_RELEASE, base = BASE, href = location.href, fetcher = fetch, navigate = url => location.replace(url), onChange = () => {} } = {}) {
  const state = { pending: null, checking: false, updating: false, status: '' }
  const notify = () => onChange(state)
  async function check(manual = false) {
    if (state.checking || state.updating) return
    state.checking = true
    if (manual) state.status = 'Checking…'
    notify()
    try {
      const response = await fetcher(`${base}version.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error('Release unavailable')
      const release = readRelease(await response.json())
      if (!release) throw new Error('Invalid release')
      state.pending = isNewerBuild(current, release) ? release : null
      state.status = state.pending ? 'New version available' : 'Up to date'
    } catch {
      // A failed check never removes an already-discovered update.
      if (manual) state.status = 'Can’t check right now. Try again online.'
    } finally { state.checking = false; notify() }
  }

  async function apply() {
    if (!state.pending || state.updating) return
    const target = state.pending
    state.updating = true; state.status = 'Updating…'; notify()
    try {
      const url = buildUpdateUrl(href, target.id)
      const response = await fetcher(url, { cache: 'reload', signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new Error('Page unavailable')
      const html = await response.text()
      // Pages can briefly expose the release file before the matching HTML.
      // Wait for a coherent release instead of reloading into an old page.
      if (!html.includes(`<meta name="packet-loss-build" content="${target.id}"`)) {
        state.status = 'Update is still arriving. Try again shortly.'
        return
      }
      navigate(url)
    } catch { state.status = 'Update couldn’t download. Try again online.' }
    finally { state.updating = false; notify() }
  }
  return { state, check, apply }
}

export function installAppUpdates({ canShow }) {
  const release = document.getElementById('app-release')
  const notice = document.getElementById('app-update')
  const badge = document.getElementById('app-version')
  const status = document.getElementById('update-status')
  const button = document.getElementById('update-now')
  const checkButton = document.getElementById('check-updates')
  badge.textContent = import.meta.env.DEV ? 'DEV' : `v${APP_RELEASE.version}`
  const checker = createUpdateChecker({ onChange: render })
  let shown = null
  function render() {
    const safe = canShow()
    shown = safe
    release.hidden = !safe
    notice.hidden = !safe || !checker.state.pending
    status.textContent = checker.state.status
    checkButton.disabled = checker.state.checking || checker.state.updating
    button.disabled = checker.state.updating
    button.textContent = checker.state.updating ? 'UPDATING…' : 'UPDATE NOW'
    document.getElementById('update-message').textContent = checker.state.updating ? 'Downloading the new version…' : checker.state.status.startsWith('Update ') ? checker.state.status : 'A new version of Packet Loss is ready.'
  }
  checkButton.addEventListener('click', e => { e.stopPropagation(); if (!import.meta.env.DEV) void checker.check(true); else { checker.state.status = 'Updates are checked in the release build.'; render() } })
  button.addEventListener('click', e => { e.stopPropagation(); void checker.apply() })
  if (!import.meta.env.DEV) {
    void checker.check()
    setInterval(() => { if (!document.hidden) void checker.check() }, 60000)
    window.addEventListener('online', () => void checker.check())
    window.addEventListener('focus', () => void checker.check())
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void checker.check() })
  }
  for (const element of [release, notice]) element.addEventListener('keydown', e => e.stopPropagation())
  render()
  return { sync() { if (shown !== canShow()) render() } }
}
