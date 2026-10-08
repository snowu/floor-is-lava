import { css, mix } from './pixels.js'

// Short, bright droplets and a spreading surface ripple, in world metres.
// Shared by the game and the art lab so wet-foot contact can be inspected.
export class RoofWater {
  constructor() { this.drops = []; this.ripples = [] }

  splash(x, y, speed, wet, impact = 0) {
    if (wet < 0.1) return
    const strength = Math.min(2.2, 1 + impact / 16)
    const count = Math.ceil((4 + wet * 4) * strength)
    this.ripples.push({ x, y, t: 0, strength })
    for (let i = 0; i < count; i++) {
      this.drops.push({
        x, y: y + 0.03, floor: y, t: 0,
        vx: (Math.random() - 0.5) * 5 * strength - speed * 0.08,
        vy: (1.7 + Math.random() * 2.8) * strength,
      })
    }
    this.drops = this.drops.slice(-120)
    this.ripples = this.ripples.slice(-24)
  }

  update(dt) {
    this.drops = this.drops.filter((q) => {
      q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy -= dt * 26
      return q.t < 0.5 && q.y >= q.floor
    })
    this.ripples = this.ripples.filter((q) => { q.t += dt; return q.t < 0.23 })
  }

  draw(ctx, sx, sy, pal) {
    const water = mix(pal.light, [157, 217, 239], 0.72)
    ctx.fillStyle = css(water)
    for (const q of this.drops) {
      const x = Math.round(sx(q.x)), y = Math.round(sy(q.y))
      ctx.fillRect(x, y, 1, q.vy > 2 ? 2 : 1)
    }
    for (const q of this.ripples) {
      const x = Math.round(sx(q.x)), y = Math.round(sy(q.y))
      const r = Math.round(2 + q.t * 24 * q.strength)
      ctx.fillStyle = css(water, 0.65 * (1 - q.t / 0.23))
      ctx.fillRect(x - r, y, 2, 1); ctx.fillRect(x + r - 1, y, 2, 1)
    }
  }
}
