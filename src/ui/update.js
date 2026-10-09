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

// A timeout signal, for browsers without AbortSignal.timeout (Safari < 16).
function timeoutSignal(ms) {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms)
  return controller.signal
}

class CheckError extends Error {
  constructor(message, transient = false) { super(message); this.transient = transient }
}

// What to tell the player when a check fails. Only an offline device is told
// to go online: anything else names what went wrong, so a failure is never
// mistaken for a lost connection.
function explain(error, online) {
  if (!online) return 'You’re offline. Updates are checked when you reconnect.'
  if (error instanceof CheckError) return error.message
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'The update server didn’t answer in time. Try again.'
  return 'Couldn’t reach the update server. Try again.'
}

export function createUpdateChecker({ current = APP_RELEASE, base = BASE, href = location.href, fetcher = fetch, navigate = url => location.replace(url), onChange = () => {}, online = () => navigator.onLine !== false, retryDelay = 1500 } = {}) {
  const state = { pending: null, checking: false, updating: false, status: '' }
  const notify = () => onChange(state)
  let inflight = null, report = false
  async function fetchRelease() {
    const response = await fetcher(`${base}version.json?t=${Date.now()}`, { cache: 'no-store', signal: timeoutSignal(8000) })
    if (!response.ok) throw new CheckError(`The update server returned ${response.status ?? 'an error'}. Try again shortly.`)
    const release = readRelease(await response.json())
    if (!release) throw new CheckError('The release file was incomplete. Try again shortly.')
    return release
  }
  async function run() {
    try {
      let release
      try { release = await fetchRelease() } catch (error) {
        // a network hiccup or timeout gets one more try; a bad answer doesn't
        if (error instanceof CheckError || !online()) throw error
        await new Promise(done => setTimeout(done, retryDelay))
        release = await fetchRelease()
      }
      state.pending = isNewerBuild(current, release) ? release : null
      state.status = state.pending ? 'New version available' : 'Up to date'
    } catch (error) {
      // A failed check never removes an already-discovered update, and only
      // a check the player asked for reports its failure.
      if (report) state.status = explain(error, online())
    } finally { state.checking = false; inflight = null; report = false; notify() }
  }
  // A manual check during an automatic one joins it and reports its outcome.
  function check(manual = false) {
    if (state.updating) return Promise.resolve()
    if (manual) { report = true; state.status = 'Checking…' }
    if (inflight) { notify(); return inflight }
    state.checking = true
    notify()
    inflight = run()
    return inflight
  }
  // Coming back online: drop a stale offline message and check once the
  // connection has settled (phones report "online" a moment early).
  function reconnected() {
    if (state.status.startsWith('You’re offline')) { state.status = ''; notify() }
    setTimeout(() => void check(), retryDelay)
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
  return { state, check, apply, reconnected }
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
  // The version line and the update notice live inside whichever screen's
  // card is showing, as its footer: pinned to a corner of the viewport they
  // landed on the card's buttons wherever a card reached that corner.
  const host = () => document.querySelector('.screen:not(.is-hidden) .card')
  function render() {
    const safe = canShow()
    shown = safe
    const card = host()
    if (safe && card && release.parentElement !== card) card.append(notice, release)
    release.hidden = !safe
    notice.hidden = !safe || !checker.state.pending
    status.textContent = checker.state.status
    // stays live during automatic checks: a press joins the one in flight
    checkButton.disabled = checker.state.updating
    button.disabled = checker.state.updating
    button.textContent = checker.state.updating ? 'UPDATING…' : 'UPDATE NOW'
    document.getElementById('update-message').textContent = checker.state.updating ? 'Downloading the new version…' : checker.state.status.startsWith('Update ') ? checker.state.status : 'A new version of Packet Loss is ready.'
  }
  checkButton.addEventListener('click', e => { e.stopPropagation(); if (!import.meta.env.DEV) void checker.check(true); else { checker.state.status = 'Updates are checked in the release build.'; render() } })
  button.addEventListener('click', e => { e.stopPropagation(); void checker.apply() })
  if (!import.meta.env.DEV) {
    void checker.check()
    setInterval(() => { if (!document.hidden) void checker.check() }, 60000)
    window.addEventListener('online', () => checker.reconnected())
    window.addEventListener('focus', () => void checker.check())
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void checker.check() })
  }
  for (const element of [release, notice]) element.addEventListener('keydown', e => e.stopPropagation())
  render()
  return { sync() { if (shown !== canShow() || (shown && release.parentElement !== host())) render() } }
}
