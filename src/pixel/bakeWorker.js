// Bakes the big sprites (facades, fog, street mist) so the frame never
// waits on one. The pixels come back as a transferred buffer.
import { runJob } from './bakes.js'

self.onmessage = ({ data: { key, version, job } }) => {
  const b = runJob(job)
  self.postMessage({ key, version, w: b.w, h: b.h, data: b.data }, [b.data.buffer])
}
