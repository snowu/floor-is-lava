// Roof lighting stays in native pixels. Stable patches follow the building,
// while only the small rain rings move; the front edge remains unobscured.
import { css, hash, mix } from './pixels.js'

export function roofPuddles(seed, w, depth) {
  const patches = []
  if (depth < 7) return patches
  for (let x = 9, i = 0; x < w - 14; i++) {
    const width = Math.min(w - x - 7, 16 + Math.floor(hash(seed, i, 2) * 30))
    if (width < 10) break
    const h = Math.min(depth - 6, 2 + Math.floor(hash(seed, i, 4) * 2))
    patches.push({ x, w: width, back: 3 + Math.floor(hash(seed, i, 3) * Math.max(1, depth - h - 5)), h, phase: hash(seed, i, 5) })
    x += width + 24 + Math.floor(hash(seed, i, 6) * 32)
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
  if (wet > 0.05) for (const [i, q] of roofPuddles(seed, w, depth).entries()) {
    const px = x + q.x, py = y - q.back - q.h
    ctx.fillStyle = css(mix(pal.roof, pal.shadow, 0.45), wet * 0.85)
    ctx.fillRect(px + 3, py - 1, q.w - 8, 1)
    ctx.fillRect(px, py, q.w, q.h)
    const sheen = mix(pal.rim, [126, 178, 197], 0.65)
    ctx.fillStyle = css(mix(pal.roof, sheen, 0.65), wet * 0.8)
    ctx.fillRect(px + 4, py + q.h - 1, Math.floor(q.w * 0.35), 1)
    ctx.fillRect(px + Math.floor(q.w * 0.7), py, Math.max(2, Math.floor(q.w * 0.12)), 1)
    for (const light of lights) {
      const strength = Math.max(0, 1 - Math.abs(px + q.w / 2 - light.x) / (light.w / 2 + 65))
      if (!strength) continue
      ctx.fillStyle = css(light.color, wet * strength * light.strength * pal.night * 0.65)
      ctx.fillRect(px + 3, py, q.w - 7, 1)
      ctx.fillRect(px + Math.floor(q.w * 0.48), py + q.h - 1, Math.floor(q.w * 0.25), 1)
    }
    // One short expanding ring per patch, with a quiet interval between hits.
    const phase = (time * 0.65 + q.phase) % 1
    if (rain > 0.15 && phase < 0.22) {
      const r = 1 + Math.floor(phase * 12), cx = px + 5 + Math.floor(hash(seed, i, 9) * (q.w - 10))
      ctx.fillStyle = css(pal.light, rain * 0.3 * (1 - phase / 0.22))
      ctx.fillRect(cx - r, py + 1, 1, 1); ctx.fillRect(cx + r, py + 1, 1, 1)
    }
  }
  ctx.restore()
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
