// Queue for the bake worker. A sprite asked for here is baked in the
// background; the result is handed to `done` only if that version is still
// the one wanted. Without workers (or if the worker fails) `ready` is false
// and callers bake on the main thread as before.
export class Baker {
  constructor(done) {
    this.pending = new Map()      // key -> version being baked
    this.done = done
    try {
      this.worker = new Worker(new URL('./bakeWorker.js', import.meta.url), { type: 'module' })
      this.worker.onmessage = ({ data }) => {
        if (this.pending.get(data.key) !== data.version) return
        this.pending.delete(data.key)
        this.done(data.key, data.version, data)
      }
      this.worker.onerror = () => { this.worker = null; this.pending.clear() }
    } catch {
      this.worker = null
    }
  }

  get ready() { return !!this.worker }

  want(key, version, job) {
    if (this.pending.get(key) === version) return
    this.pending.set(key, version)
    this.worker.postMessage({ key, version, job })
  }

  // stop waiting on keys that no longer matter (their chunk scrolled away)
  drop(test) {
    for (const key of this.pending.keys()) if (test(key)) this.pending.delete(key)
  }
}
