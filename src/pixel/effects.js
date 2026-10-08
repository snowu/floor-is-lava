import { PixelBuffer, pack, mix, css, hash } from './pixels.js'

// Colored air around an emitter, separate from its crisp luminous core.
export function bakeLightHalo(w, h, color) {
  const b = new PixelBuffer(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2))
    if (d >= 1) continue
    b.set(x, y, pack(color, Math.round((1 - d) ** 2 * 160)))
  }
  return b
}

export function drawLightHalo(ctx, halo, x, y, strength = 1) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = strength
  ctx.drawImage(halo, Math.round(x - halo.width / 2), Math.round(y - halo.height / 2))
  ctx.restore()
}

export function drawSteam(ctx, x, y, seed, time, pal) {
  for (let i = 0; i < 3; i++) {
    const t = (time * 0.22 + hash(seed, i, 43)) % 1
    const drift = Math.sin(t * 5 + seed) * 3 - t * 5
    const width = 2 + Math.floor(t * 7)
    ctx.fillStyle = css(mix(pal.haze, pal.light, 0.45), Math.sin(t * Math.PI) * 0.16)
    ctx.fillRect(Math.round(x + drift - width / 2), Math.round(y - t * 20), width, 2)
    ctx.fillStyle = css(pal.light, Math.sin(t * Math.PI) * 0.06)
    ctx.fillRect(Math.round(x + drift), Math.round(y - t * 20), Math.max(1, width - 3), 1)
  }
}

// Small action accents in world space. No particles are emitted by plain runs.
export class ParkourFX {
  constructor() { this.pulses = []; this.sparks = []; this.clock = 0 }

  event(type, p, e = {}) {
    const launch = ['spring', 'padjump', 'airjump'].includes(type)
    const perfect = type === 'landslide' && e.quality >= 0.9
    const pickup = type === 'shard'
    if (!launch && !perfect && !pickup) return
    this.pulses.push({ x: e.x ?? p.x, y: e.y ?? p.y, t: 0, launch, pickup, color: type === 'spring' || type === 'padjump' ? [255, 103, 68] : [97, 236, 255] })
    this.pulses = this.pulses.slice(-12)
  }

  update(dt, p, x, y) {
    if (!dt) return
    this.pulses = this.pulses.filter(q => { q.t += dt; return q.t < 0.38 })
    this.sparks = this.sparks.filter(q => {
      q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy -= dt * 12
      return q.t < 0.28 && q.y >= q.floor
    })
    this.clock = Math.max(0, this.clock - dt)
    if (['slide', 'wallrun'].includes(p.state) && p.speed > 9 && !this.clock) {
      this.clock = 0.07
      for (let i = 0; i < 2; i++) this.sparks.push({ x: x - 0.15, y: y + 0.1, floor: y, t: 0, vx: -2 - i * 1.5, vy: 0.8 + i * 0.4 })
    }
    this.sparks = this.sparks.slice(-24)
  }

  draw(ctx, sx, sy) {
    for (const q of this.pulses) {
      const t = q.t / 0.38, x = sx(q.x), y = sy(q.y)
      const r = 6 + Math.round(t * (q.pickup ? 13 : 21))
      ctx.fillStyle = css(q.color, (1 - t) ** 2 * 0.75)
      if (q.pickup) {
        for (const dir of [-1, 1]) { ctx.fillRect(x + dir * r, y - 1, 1, 3); ctx.fillRect(x - 1, y + dir * r, 3, 1) }
      } else {
        const lift = q.launch ? Math.round(t * 14) : Math.round(Math.sin(t * Math.PI) * 2)
        ctx.fillRect(x - r, y - lift - 3, 7, 1); ctx.fillRect(x + r - 6, y - lift - 3, 7, 1)
        if (t < 0.35) ctx.fillRect(x - 3, y - 1, 7, 1)
      }
    }
    for (const q of this.sparks) {
      const x = sx(q.x), y = sy(q.y), fade = 1 - q.t / 0.28
      ctx.fillStyle = css([255, 163, 83], fade * 0.7)
      ctx.fillRect(x - 3, y, 3, 1)
      ctx.fillStyle = css([255, 236, 183], fade)
      ctx.fillRect(x, y, 1, 1)
    }
  }
}
