// Sprite bakers that can run off the main thread: pure functions of plain
// data that return a PixelBuffer. The bake worker and the view share this
// table, so a job means the same thing on either side.
import { bakeFacade, bakeFog, bakeMist } from './city.js'
import { bakeSky, bakeHaze, bakeVignette, bakeAlarm } from './screen.js'
import { bakePipe, bakePipeFront } from './obstacles.js'

export const JOBS = {
  facade: bakeFacade, fog: bakeFog, mist: bakeMist,
  sky: bakeSky, haze: bakeHaze, vignette: bakeVignette, alarm: bakeAlarm,
  pipe: bakePipe, pipeFront: bakePipeFront,
}

export function runJob([name, args]) {
  return JOBS[name](...args)
}
