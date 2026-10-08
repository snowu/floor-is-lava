// Runs a full heist with the autopilot off the main thread, for the trace chart.
import { simulateHeist } from '../sim/heistSim.js'

self.onmessage = (e) => {
  const { seed, careful } = e.data
  self.postMessage(simulateHeist(seed, { careful }))
}
