// Times the daily course with the autopilot off the main thread.
import { dailyTrack } from './sim/tracks.js'
import { autopilotTime, medalsFrom } from './sim/medals.js'

self.onmessage = (e) => {
  const track = dailyTrack(new Date(e.data.date))
  const time = autopilotTime(track)
  self.postMessage({ id: track.id, medals: time ? medalsFrom(time) : null })
}
