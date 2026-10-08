// Roof lighting stays in native pixels. Stable patches follow the building,
// with occasional falling drops and tiny impacts; the front edge stays clear.
import { css, hash, mix } from './pixels.js'

export function roofPuddles(seed, w, depth) {
  const patches = []
  if (depth < 7) return patches
  // Most roof sections stay empty; a rare patch sits away from the edges.
  for (let i = 0; i < Math.ceil(w / 210); i++) {
    if (hash(seed, i, 21) > 0.3) continue
    const x = 12 + i * 210 + Math.floor(hash(seed, i, 22) * 100)
    const width = Math.min(w - x - 12, 20 + Math.floor(hash(seed, i, 23) * 16))
    if (width < 16) continue
    const h = Math.min(depth - 6, 3 + Math.floor(hash(seed, i, 24) * 2))
    patches.push({ x, w: width, back: 3 + Math.floor(hash(seed, i, 25) * Math.max(1, depth - h - 5)), h })
  }
  return patches
}

export function drawRoofSurface(ctx, { x, y, w, depth, seed, pal, wet = 0, rain = 0, time = 0, lights = [] }) {
  ctx.save()
  ctx.beginPath(); ctx.rect(x + 2, y - depth + 3, w - 4, depth - 5); ctx.clip()
  ctx.fillStyle = css(pal.shadow, 0.12 + wet * 0.12)
  ctx.fillRect(x, y - depth + 3, w, Math.max(1, Math.floor(depth / 3)))
  // Broad, stepped spill rather than blurred halos or another bright cue.
  for (const light of lights) {
    for (let band = 3; band >= 1; band--) {
      ctx.fillStyle = css(light.color, light.strength * pal.night * (0.025 + wet * 0.035))
      ctx.fillRect(Math.round(light.x - light.w / 2 - band * 9), y - depth + 3, Math.round(light.w + band * 18), depth - 5)
    }
  }
  if (wet > 0.05) for (const q of roofPuddles(seed, w, depth)) {
    const px = x + q.x, py = y - q.back - q.h
    // Stepped rounded edges, a cool shallow body, and a short broken glint.
    ctx.fillStyle = css(mix(pal.roof, pal.shadow, 0.25), wet * 0.75)
    ctx.fillRect(px + 5, py, q.w - 10, 1)
    ctx.fillRect(px + 2, py + 1, q.w - 4, Math.max(1, q.h - 2))
    ctx.fillRect(px + 6, py + q.h - 1, q.w - 13, 1)
    const sheen = mix(pal.rim, [126, 178, 197], 0.65)
    ctx.fillStyle = css(mix(pal.roof, sheen, 0.55), wet * 0.65)
    ctx.fillRect(px + 6, py + q.h - 1, Math.floor(q.w * 0.2), 1)
    ctx.fillRect(px + Math.floor(q.w * 0.7), py + 1, 2, 1)
    for (const light of lights) {
      const strength = Math.max(0, 1 - Math.abs(px + q.w / 2 - light.x) / (light.w / 2 + 65))
      if (!strength) continue
      ctx.fillStyle = css(light.color, wet * strength * light.strength * pal.night * 0.55)
      ctx.fillRect(px + 7, py + 1, Math.floor(q.w * 0.28), 1)
      ctx.fillRect(px + Math.floor(q.w * 0.65), py + q.h - 1, 3, 1)
    }
  }
  ctx.restore()
  // Sparse drops reach the actual roof plane, then kick up two tiny droplets.
  // Draw behind the equipment and runner, independently of puddle placement.
  for (const hit of roofRainHits(seed, w, depth, time, rain)) {
    const hx = x + hit.x, hy = y - hit.back
    ctx.fillStyle = css(mix(pal.light, [171, 213, 229], 0.75), 0.65)
    if (hit.t < 0.18) {
      const fall = 1 - hit.t / 0.18
      ctx.fillRect(Math.round(hx + fall * 3), Math.round(hy - fall * 16) - 2, 1, 3)
    } else {
      const t = (hit.t - 0.18) / 0.26, r = 1 + Math.floor(t * 4)
      const lift = Math.round(Math.sin(t * Math.PI) * 2)
      ctx.fillStyle = css(mix(pal.light, [171, 213, 229], 0.75), (1 - t) * 0.6)
      ctx.fillRect(hx - r, hy - lift, 1, 1); ctx.fillRect(hx + r, hy - lift, 1, 1)
      if (t < 0.3) ctx.fillRect(hx - 1, hy, 3, 1)
    }
  }

}

export function roofRainHits(seed, w, depth, time, rain) {
  const hits = []
  if (rain < 0.15 || depth < 7) return hits
  for (let i = 0; i < Math.ceil(w / 180); i++) {
    if (hash(seed, i, 32) > rain * 0.65) continue
    const period = 4.5 + hash(seed, i, 33) * 4
    const cycle = Math.floor(time / period + hash(seed, i, 34))
    const t = (time / period + hash(seed, i, 34) - cycle) * period
    const x = 10 + i * 180 + Math.floor(hash(seed, i + cycle, 35) * 140)
    if (t < 0.44 && x < w - 10) hits.push({ x, back: 3 + Math.floor(hash(seed, i + cycle, 36) * (depth - 6)), t })
  }
  return hits
}

export function drawContactShadow(ctx, x, y, w, pal, depth = 3) {
  ctx.fillStyle = css(pal.shadow, 0.35)
  ctx.fillRect(Math.round(x - 3), Math.round(y - depth), Math.round(w + 6), depth)
  ctx.fillStyle = css(pal.shadow, 0.65)
  ctx.fillRect(Math.round(x), Math.round(y - 2), Math.round(w), 2)
}

export function equipmentLight(pal, x, lights) {
  let strongest = 0, color = pal.light
  for (const light of lights) {
    const strength = light.strength * Math.max(0, 1 - Math.abs(x - light.x) / (light.w / 2 + 55))
    if (strength > strongest) { strongest = strength; color = light.color }
  }
  const amount = Math.floor(strongest * 4) / 4 * pal.night * 0.4
  return amount ? { ...pal, light: mix(pal.light, color, amount) } : pal
}

export function drawRunnerContact(ctx, { x, y, floor, pal, joints, span }) {
  const above = floor - y
  if (!joints || above < -2 || above > 36) return
  ctx.save()
  if (span) { ctx.beginPath(); ctx.rect(span[0], floor - 4, span[1] - span[0], 4); ctx.clip() }
  const fade = 1 - Math.max(0, above) / 40
  const width = 12 + Math.floor(Math.max(0, above) * 0.2)
  ctx.fillStyle = css(pal.shadow, fade * 0.3)
  ctx.fillRect(Math.round(x - width / 2), floor - 2, width, 2)
  if (above <= 2) for (const foot of [joints.ankleA, joints.ankleB]) {
    if (!foot || foot[1] > 3) continue
    ctx.fillStyle = css(pal.shadow, 0.7)
    ctx.fillRect(Math.round(x + foot[0] - 2), floor - 1, 5, 1)
  }
  ctx.restore()
}
