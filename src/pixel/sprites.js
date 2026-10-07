// Procedural pixel-art sprites: facades, rooftop props, decor, skyline,
// clouds. Everything is drawn into PixelBuffers with the current palette.
import { PixelBuffer, pack, mix, hash, dither } from './pixels.js'
import { ACCENT } from './palette.js'

export const PPU = 14              // pixels per meter
export const FACADE_DEPTH = 26     // meters of facade below a roof line

const RED = pack(ACCENT)
const RED_DARK = pack(mix(ACCENT, [60, 10, 20], 0.45))
const WHITE = pack([245, 240, 235])
const CLEAR = 0

function tones(base, pal) {
  return {
    base: pack(base),
    shade: pack(mix(base, pal.shadow, 0.32)),
    deep: pack(mix(base, pal.shadow, 0.62)),
    light: pack(mix(base, pal.light, 0.38)),
    raw: base,
  }
}

// ── tiny bitmap font (3x5) for signage ──────────────────────────────────

const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', K: '101101110101101', L: '100100100100111', M: '101111111101101',
  N: '110101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010',
  X: '101101010101101', Y: '101101010010010', Z: '111001010100111', ' ': '000000000000000',
  0: '111101101101111', 2: '110001010100111', 4: '101101111001001', 7: '111001010010010', 9: '111101111001110',
}

export function drawText(buf, text, x, y, c, scale = 1) {
  let cx = x
  for (const ch of text) {
    const g = GLYPHS[ch] || GLYPHS[' ']
    for (let i = 0; i < 15; i++) if (g[i] === '1') buf.rect(cx + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale, c)
    cx += 4 * scale
  }
}

export const BRANDS = ['NOVA', 'HELIX', 'PULSE', 'ORBIT', 'KITE', 'VOLT', 'ZEN 24', 'STRATA']

// ── course building facade ──────────────────────────────────────────────

// roofH: pixel height of the visible rooftop strip above the front edge.
export function bakeBuilding({ w, roofH, style, seed, pal, wall, accentCap, mural }) {
  const H = roofH + FACADE_DEPTH * PPU
  const b = new PixelBuffer(w, H)
  const t = tones(pal.walls[wall % pal.walls.length], pal)
  const roof = tones(pal.roof, pal)
  const sunLeft = pal.sunX < 0.5
  const night = pal.night

  // rooftop strip with a back parapet
  b.rect(0, 0, w, roofH, roof.base)
  b.rect(0, 0, w, 2, t.shade)
  b.rect(0, 2, w, 1, roof.shade)
  for (let x = 0; x < w; x += 9) b.rect(x, 3, 1, roofH - 4, roof.shade)    // tile joints
  b.rect(0, roofH - 1, w, 1, roof.light)

  // cornice
  const top = roofH
  b.rect(0, top, w, 2, accentCap ? pack(mix(t.raw, pal.lit[0], 0.55)) : t.light)
  b.rect(0, top + 2, w, 2, t.base)
  b.rect(0, top + 4, w, 1, t.deep)

  const bodyTop = top + 5
  const bodyH = H - bodyTop
  // wall texture
  for (let y = bodyTop; y < H; y++) {
    const ry = y - bodyTop
    for (let x = 0; x < w; x++) {
      let c = t.base
      if (style === 0) {
        const row = Math.floor(ry / 3)
        if (ry % 3 === 2) c = t.shade
        else if ((x + (row & 1) * 4) % 8 === 7) c = t.shade
        else if (hash(Math.floor((x + (row & 1) * 4) / 8), row, seed) < 0.18) c = t.light
      } else if (style === 3) {
        if ((x >> 1) & 1) c = t.shade
      } else if (style === 2) {
        if (x % 24 === 23) c = t.shade
      }
      b.data[y * w + x] = c
    }
  }

  // windows per floor
  const floorH = 48
  // foreground facades stay a notch quieter than the skyline so the lane reads
  const lit = pal.lit.map((c) => pack(mix(c, pal.winDark, 0.38)))
  const glassL = pack(pal.glass[0]), glassD = pack(pal.glass[1]), winDark = pack(pal.winDark)
  const isLit = (cx, cy) => night > 0.12 && hash(cx, cy, seed + 7) < 0.06 + night * 0.26
  const litColor = (cx, cy) => lit[Math.floor(hash(cy, cx, seed + 3) * lit.length)]
  const margin = 7
  for (let f = 0; ; f++) {
    const fy = bodyTop + 6 + f * floorH
    if (fy > H) break
    if (style === 1) {
      // curtain wall: spandrel + glass band with mullions and reflections
      b.rect(0, fy + 34, w, 2, t.light)
      b.rect(0, fy + 36, w, 8, t.base)
      for (let y = fy; y < fy + 34 && y < H; y++) {
        for (let x = margin - 3; x < w - margin + 3; x++) {
          const cell = Math.floor(x / 12)
          let c = (y - fy) < 10 ? glassL : glassD
          if (dither(x, y, (y - fy) / 34)) c = glassD
          else if (((x + y * 1.2) | 0) % 41 < 3) c = glassL
          if (isLit(cell, f)) c = (y - fy) % 17 === 2 ? glassL : litColor(cell, f)
          if (x % 12 === 0) c = t.deep
          b.set(x, y, c)
        }
      }
      continue
    }
    const ww = style === 2 ? 12 : style === 3 ? 6 : 10
    const wh = style === 2 ? 16 : style === 3 ? 6 : 18
    const pitch = style === 2 ? 18 : style === 3 ? 8 : 20
    const wy = fy + (style === 3 ? 6 : 12)
    const cols = Math.floor((w - margin * 2 + (pitch - ww)) / pitch)
    const x0 = Math.floor((w - (cols * pitch - (pitch - ww))) / 2)
    for (let cI = 0; cI < cols; cI++) {
      const wx = x0 + cI * pitch
      if (style !== 3) {
        b.rect(wx - 1, wy - 2, ww + 2, 2, t.light)       // lintel
        b.rect(wx - 1, wy + wh, ww + 2, 2, t.light)      // sill
        b.rect(wx - 1, wy + wh + 2, ww + 2, 1, t.deep)
      }
      b.rect(wx, wy, ww, wh, t.deep)
      const on = isLit(cI, f)
      for (let y = 1; y < wh; y++) {
        for (let x = 1; x < ww; x++) {
          let c = on ? litColor(cI, f) : (y < wh * 0.35 || ((x + y) % 9 === 0) ? glassL : winDark)
          if (!on && dither(x + wx, y + wy, y / wh * 0.8)) c = winDark
          if (on && y === 1) c = glassL
          b.set(wx + x, wy + y, c)
        }
      }
      if (style === 0 && ww > 6) b.rect(wx + (ww >> 1), wy, 1, wh, t.deep)  // mullion
      // window AC unit
      if (style !== 1 && hash(cI, f, seed + 11) < 0.12) {
        b.rect(wx + 1, wy + wh + 3, 8, 5, pack(mix(pal.roof, pal.shadow, 0.15)))
        b.rect(wx + 1, wy + wh + 3, 8, 1, WHITE)
        b.rect(wx + 2, wy + wh + 5, 6, 1, t.deep)
      }
    }
  }

  // fire escape on brick buildings
  if (style === 0 && w > 90 && hash(seed, 99) < 0.6) {
    const fx = Math.floor(w * (0.2 + hash(seed, 5) * 0.5))
    const metal = pack(mix(pal.shadow, [20, 20, 30], 0.4))
    for (let f = 0; f < 7; f++) {
      const py = bodyTop + 6 + f * floorH + 32
      if (py > H) break
      b.rect(fx - 14, py, 30, 2, metal)
      for (let x = fx - 14; x < fx + 16; x += 3) b.rect(x, py - 6, 1, 6, metal)
      b.rect(fx - 14, py - 6, 30, 1, metal)
      const dir = f % 2 ? 1 : -1
      for (let s = 0; s < 22; s++) b.set(fx + dir * (s - 11) * 1.2, py + 2 + s * 2.1, metal)
    }
  }

  // mural: the red chevron band used by wall-run walls
  if (mural) {
    const [m0, m1] = mural
    b.rect(0, m0, w, m1 - m0, WHITE)
    for (let y = m0 + 2; y < m1 - 2; y++) {
      const mid = (m0 + m1) / 2
      const off = Math.abs(y - mid)
      for (let x = 0; x < w; x++) {
        const u = (x + off * 1.0) % 22
        if (u < 9) b.set(x, y, RED)
      }
    }
    b.rect(0, m0, w, 2, RED_DARK)
    b.rect(0, m1 - 2, w, 2, RED_DARK)
  }

  // light falls across the corners
  b.rect(sunLeft ? w - 2 : 0, top, 2, H - top, t.deep)
  b.rect(sunLeft ? 0 : w - 1, top, 1, H - top, t.light)
  return b
}

// ── rooftop obstacles ───────────────────────────────────────────────────
// Obstacles use their own high-contrast look so they never melt into the
// rooftops: dark steel bodies, a bright top face, a hard outline (added by
// the view) and a runner-vision red edge.

const STEEL = [44, 46, 62]
const STEEL_TOP = [170, 178, 200]
const HAZARD = pack([255, 214, 51])
const INK = pack([10, 8, 16])

export function bakeObstacle(sub, w, h, pal, seed = 0) {
  const body = pack(mix(STEEL, pal.shadow, 0.25))
  const bodyL = pack(mix(STEEL, STEEL_TOP, 0.25))
  const bodyD = pack(mix(STEEL, [0, 0, 0], 0.35))
  const top = pack(mix(STEEL_TOP, pal.light, 0.2))
  if (sub === 'vent') {
    const b = new PixelBuffer(w, h + 3)
    b.rect(0, 3, w, h, body)
    b.rect(0, 0, w, 3, top)
    b.rect(0, 3, w, 2, RED)
    for (let y = 8; y < h; y += 3) b.rect(2, y, w - 4, 1, bodyD)
    b.rect(1, 6, 1, h - 4, bodyL)
    b.rect(w - 2, 3, 2, h, bodyD)
    return b
  }
  if (sub === 'highbox') {
    const b = new PixelBuffer(w, h + 3)
    const n = Math.max(1, Math.round(h / 10))
    const bh = Math.floor(h / n)
    for (let i = 0; i < n; i++) {
      const y = 3 + h - (i + 1) * bh
      b.rect(0, y, w, bh, body)
      b.rect(0, y, w, 1, bodyL)
      b.rect(0, y + bh - 1, w, 1, bodyD)
      for (let x = 0; x < w; x++) if (((x + y) >> 2) & 1) b.set(x, y + bh - 3, HAZARD)
    }
    b.rect(0, 0, w, 3, top)
    b.rect(0, 3, w, 2, RED)
    b.rect(w - 2, 3, 2, h, bodyD)
    return b
  }
  if (sub === 'housing') {
    const b = new PixelBuffer(w, h + 4)
    b.rect(0, 4, w, h, body)
    b.rect(0, 0, w, 4, top)
    b.rect(0, 4, w, 2, RED)                     // grab ledge
    b.rect(0, 4, 4, 4, RED)
    for (let y = 12; y < h; y += 6) b.rect(2, y, w - 4, 1, bodyD)
    const dx = Math.min(10, w - 24)
    b.rect(dx, h + 4 - 28, 14, 28, INK)
    b.rect(dx + 1, h + 4 - 27, 12, 1, bodyL)
    b.rect(dx + 10, h + 4 - 14, 2, 2, HAZARD)
    const neon = pack(pal.neon[seed % pal.neon.length | 0])
    b.rect(dx - 1, h + 4 - 33, 16, 2, neon)    // lit strip over the door
    b.rect(w - 2, 4, 2, h, bodyD)
    return b
  }
  if (sub === 'beam') {
    const b = new PixelBuffer(w, h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.set(x, y, ((x + y) % 8) < 4 ? HAZARD : INK)
    b.rect(0, 0, w, 1, pack([255, 240, 170]))
    b.rect(0, h - 2, w, 2, RED)
    return b
  }
  if (sub === 'spring') {
    const b = new PixelBuffer(w, h + 2)
    for (let x = 0; x < w; x++) {
      const t = Math.round((1 - Math.min(1, x / (w * 0.85))) * (h - 2))
      for (let y = t; y < h; y++) b.set(x, y + 2, y === t ? WHITE : RED)
    }
    for (let i = 0; i < 3; i++) b.line(4 + i * 6, h, 7 + i * 6, h - 3, WHITE)
    b.rect(0, h + 1, w, 1, INK)
    return b
  }
  return new PixelBuffer(1, 1)
}

// A hard dark outline around a sprite (grows it by 1px on every side).
export function outlined(src, color = INK) {
  const b = new PixelBuffer(src.w + 2, src.h + 2)
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (!(src.data[y * src.w + x] >>> 24)) continue
      for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) b.set(x + dx, y + dy, color)
    }
  }
  b.blit(src, 1, 1)
  return b
}

// Dithered halo around the opaque pixels (optionally only the top rows).
export function glow(src, color, r = 3, rows = Infinity) {
  const b = new PixelBuffer(src.w + r * 2, src.h + r * 2)
  const c = pack(color)
  const solid = (x, y) => x >= 0 && y >= 0 && x < src.w && y < Math.min(src.h, rows) && (src.data[y * src.w + x] >>> 24)
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      let best = Infinity
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (solid(x - r + dx, y - r + dy)) best = Math.min(best, Math.hypot(dx, dy))
      }
      if (best <= r && dither(x, y, (1 - best / (r + 0.5)) * 0.9)) b.data[y * b.w + x] = c
    }
  }
  return b
}

// ── neon signs ──────────────────────────────────────────────────────────

function glyph(seed) {
  const g = new Array(25).fill(0)
  const set = (x, y) => { if (x >= 0 && y >= 0 && x < 5 && y < 5) g[y * 5 + x] = 1 }
  const n = 2 + Math.floor(hash(seed, 1) * 3)
  for (let i = 0; i < n; i++) {
    const k = hash(seed, i, 2)
    const at = Math.floor(hash(seed, i, 3) * 5)
    if (k < 0.45) for (let x = 0; x < 5; x++) set(x, at)
    else if (k < 0.85) for (let y = 0; y < 5; y++) set(at, y)
    else for (let j = 0; j < 4; j++) set(j, at + j - 2)
  }
  set(Math.floor(hash(seed, 9) * 5), Math.floor(hash(seed, 10) * 5))
  return g
}

// Returns [on, dim] buffers for a neon sign with a soft halo.
export function bakeSign(seed, pal, vertical) {
  const neonC = pal.neon[Math.floor(hash(seed, 4) * pal.neon.length)]
  const count = vertical ? 3 + Math.floor(hash(seed, 5) * 4) : 3 + Math.floor(hash(seed, 6) * 6)
  const pw = vertical ? 9 : count * 7 + 3
  const ph = vertical ? count * 7 + 3 : 11
  const pad = 3
  const make = (lit) => {
    const b = new PixelBuffer(pw + pad * 2, ph + pad * 2)
    const tube = pack(lit ? neonC : mix(neonC, [20, 16, 30], 0.7))
    const core = pack(lit ? mix(neonC, [255, 255, 255], 0.6) : mix(neonC, [20, 16, 30], 0.6))
    if (lit) {
      const halo = glow(Object.assign(new PixelBuffer(pw, ph), { data: new Uint32Array(pw * ph).fill(0xff000000) }), mix(neonC, pal.shadow, 0.35), pad)
      b.blit(halo, 0, 0)
    }
    b.rect(pad, pad, pw, ph, pack(mix(pal.shadow, [16, 12, 26], 0.5)))
    b.rect(pad, pad, pw, 1, tube); b.rect(pad, pad + ph - 1, pw, 1, tube)
    b.rect(pad, pad, 1, ph, tube); b.rect(pad + pw - 1, pad, 1, ph, tube)
    for (let i = 0; i < count; i++) {
      const g = glyph(seed * 31 + i)
      const ox = pad + (vertical ? 2 : 2 + i * 7), oy = pad + (vertical ? 2 + i * 7 : 3)
      for (let k = 0; k < 25; k++) if (g[k]) b.set(ox + (k % 5), oy + Math.floor(k / 5), (k + i) % 4 === 0 ? core : tube)
    }
    return b
  }
  return [make(true), make(false)]
}

export function bakeCar(dir, pal, seed) {
  const b = new PixelBuffer(9, 4)
  const body = pack(mix([40, 40, 56], pal.shadow, 0.3))
  const under = pack(pal.neon[Math.floor(hash(seed, 2) * pal.neon.length)])
  b.rect(1, 1, 7, 2, body)
  b.rect(3, 0, 3, 1, body)
  b.rect(2, 3, 5, 1, under)
  b.set(dir > 0 ? 8 : 0, 1, pack([255, 250, 220]))
  b.set(dir > 0 ? 0 : 8, 1, pack([255, 40, 40]))
  return b
}

export function bakeHolo(seed, pal) {
  const w = 30 + Math.floor(hash(seed, 1) * 20), h = 16 + Math.floor(hash(seed, 2) * 8)
  const b = new PixelBuffer(w, h + 6)
  const c = pal.neon[Math.floor(hash(seed, 3) * pal.neon.length)]
  const fill = pack(mix(c, pal.shadow, 0.35)), edge = pack(c), bright = pack(mix(c, [255, 255, 255], 0.5))
  for (let y = 0; y < h; y++) {
    if (y % 3 === 2) continue                       // scanlines
    for (let x = 0; x < w; x++) if ((x + y) % 2 === 0) b.set(x, y, fill)
  }
  b.rect(0, 0, w, 1, edge); b.rect(0, h - 1, w, 1, edge)
  b.rect(0, 0, 1, h, edge); b.rect(w - 1, 0, 1, h, edge)
  drawText(b, BRANDS[Math.floor(hash(seed, 4) * BRANDS.length)].slice(0, Math.floor((w - 4) / 4)), 3, Math.floor(h / 2) - 2, bright)
  b.rect(Math.floor(w / 2), h, 1, 6, edge)
  return b
}

// Push decor colors toward the backdrop so foreground obstacles read first.
export function recede(b, color, t) {
  for (let i = 0; i < b.data.length; i++) {
    const v = b.data[i]
    if (!(v >>> 24)) continue
    const r = v & 255, g = (v >> 8) & 255, bl = (v >> 16) & 255
    b.data[i] = pack([r + (color[0] - r) * t, g + (color[1] - g) * t, bl + (color[2] - bl) * t])
  }
  return b
}

// ── decor standing on roofs ─────────────────────────────────────────────

export function bakeDecor(type, variant, pal) {
  const metal = tones(mix(pal.roof, [120, 130, 145], 0.45), pal)
  const dark = pack(mix(pal.shadow, [25, 25, 35], 0.3))
  if (type === 'tank') {
    const b = new PixelBuffer(30, 52)
    const wood = tones(mix(pal.walls[1], [150, 110, 80], 0.55), pal)
    for (const x of [4, 13, 22]) b.rect(x, 28, 2, 24, dark)
    b.line(4, 50, 22, 32, dark); b.line(4, 32, 22, 50, dark)
    b.rect(2, 10, 26, 20, wood.base)
    for (let x = 4; x < 28; x += 4) b.rect(x, 10, 1, 20, wood.shade)
    b.rect(2, 14, 26, 1, dark); b.rect(2, 24, 26, 1, dark)
    b.rect(25, 10, 3, 20, wood.deep)
    for (let y = 0; y < 10; y++) b.rect(15 - y * 1.4, y, y * 2.8, 1, dark)
    return b
  }
  if (type === 'antenna') {
    const h = 34 + Math.floor(variant * 26)
    const b = new PixelBuffer(13, h)
    b.rect(6, 2, 1, h - 2, dark)
    b.rect(2, Math.floor(h * 0.35), 9, 1, dark)
    b.rect(3, Math.floor(h * 0.55), 7, 1, dark)
    b.line(6, h - 1, 1, h - 1, dark); b.line(6, h - 8, 1, h - 1, dark); b.line(6, h - 8, 11, h - 1, dark)
    return b
  }
  if (type === 'ac') {
    const b = new PixelBuffer(24, 15)
    b.rect(0, 2, 24, 13, metal.base)
    b.rect(0, 2, 24, 1, metal.light)
    b.rect(0, 0, 24, 2, metal.light)
    b.disc(15, 8.5, 4.5, metal.deep)
    b.disc(15, 8.5, 3, metal.shade)
    b.rect(14, 5, 2, 7, metal.deep); b.rect(11, 8, 8, 1, metal.deep)
    for (let y = 5; y < 13; y += 2) b.rect(2, y, 6, 1, metal.shade)
    b.rect(22, 2, 2, 13, metal.deep)
    return b
  }
  if (type === 'dish') {
    const b = new PixelBuffer(16, 18)
    b.rect(7, 10, 2, 8, dark)
    for (let i = 0; i < 9; i++) b.rect(2 + i * 0.4, 1 + i, 12 - i * 1.1, 1, i < 2 ? metal.light : metal.base)
    b.line(8, 5, 13, 1, dark)
    return b
  }
  if (type === 'skylight') {
    const b = new PixelBuffer(30, 10)
    const glassL = pack(pal.glass[0]), glassD = pack(pal.glass[1])
    b.rect(0, 6, 30, 4, metal.base)
    for (let y = 0; y < 6; y++) b.rect(3 + y, y, 24 - y * 2, 1, y < 2 ? glassL : glassD)
    return b
  }
  if (type === 'vents') {
    const b = new PixelBuffer(20, 14)
    for (const [x, h] of [[1, 12], [8, 9], [14, 13]]) {
      b.rect(x, 14 - h, 4, h, metal.base)
      b.rect(x - 1, 14 - h, 6, 2, metal.light)
      b.rect(x + 3, 14 - h + 2, 1, h - 2, metal.deep)
    }
    return b
  }
  if (type === 'solar') {
    const b = new PixelBuffer(40, 12)
    const panel = pack(mix([30, 45, 90], pal.glass[1], 0.3))
    const shine = pack(mix([90, 130, 200], pal.glass[0], 0.5))
    for (let i = 0; i < 3; i++) {
      for (let y = 0; y < 7; y++) b.rect(i * 13 + y * 0.6, 1 + y, 11, 1, y === 0 ? shine : panel)
      b.rect(i * 13 + 6, 8, 1, 4, dark)
    }
    return b
  }
  if (type === 'sign') {
    const brand = BRANDS[Math.floor(variant * BRANDS.length)]
    const w = brand.length * 8 + 12
    const b = new PixelBuffer(w, 34)
    const bgs = [[20, 18, 30], ACCENT, [240, 236, 228], [30, 90, 140]]
    const bg = bgs[Math.floor(variant * 97) % bgs.length]
    const fg = bg === bgs[2] ? [20, 18, 30] : [255, 248, 240]
    b.rect(4, 18, 2, 16, dark); b.rect(w - 6, 18, 2, 16, dark)
    b.rect(0, 0, w, 20, dark)
    b.rect(1, 1, w - 2, 18, pack(bg))
    drawText(b, brand, 6, 5, pack(fg), 2)
    return b
  }
  if (type === 'plant') {
    const b = new PixelBuffer(16, 20)
    const leaf = pack(mix([60, 140, 80], pal.shadow, 0.3)), leafL = pack(mix([120, 190, 100], pal.light, 0.25))
    b.rect(5, 14, 6, 6, pack(mix(pal.walls[1], [160, 80, 60], 0.5)))
    b.disc(8, 8, 6, leaf)
    b.disc(6, 6, 3, leafL)
    return b
  }
  return new PixelBuffer(1, 1)
}

export function bakeBird(frame) {
  const b = new PixelBuffer(5, 3)
  const c = pack([25, 20, 30])
  if (frame === 0) { b.rect(1, 1, 3, 1, c); b.set(4, 0, c) }
  else if (frame === 1) { b.set(0, 0, c); b.set(1, 1, c); b.set(2, 1, c); b.set(3, 0, c); b.set(4, 0, c) }
  else { b.set(0, 2, c); b.set(1, 1, c); b.set(2, 1, c); b.set(3, 2, c) }
  return b
}

// ── skyline silhouettes ─────────────────────────────────────────────────

export function bakeSkyline(w, h, color, winColor, pal, seed, detail) {
  const extra = 200
  const b = new PixelBuffer(w, h + extra)
  const c = pack(color)
  const edge = pack(mix(color, pal.light, 0.12 * detail))
  b.rect(0, 0, w, h + extra, c)
  // roof silhouettes
  const r = hash(seed, 1)
  if (r < 0.25) {                   // stepped crown
    b.rect(0, 0, w, 8, CLEAR)
    b.rect(Math.floor(w * 0.2), 0, Math.ceil(w * 0.6), 8, c)
  } else if (r < 0.4) {             // spire
    for (let y = 0; y < 10; y++) b.rect(0, y, w, 1, CLEAR)
    b.rect(Math.floor(w / 2) - 3, 2, 6, 8, c)
  }
  if (hash(seed, 2) < 0.35) b.rect(Math.floor(w * hash(seed, 3)), 0, 1, 6, c)
  b.rect(0, 0, w, 1, edge)
  // neon strip running down one side of some towers
  if (detail > 0.5 && hash(seed, 7) < 0.3 && pal.neon) {
    const n = pack(pal.neon[Math.floor(hash(seed, 8) * pal.neon.length)])
    const sx = hash(seed, 9) < 0.5 ? 1 : w - 2
    b.rect(sx, 4, 1, Math.floor(h * 0.7), n)
  }
  // windows
  const lit = pal.lit.map((x) => pack(x))
  const win = pack(winColor)
  const night = pal.night
  for (let y = 6; y < h + extra; y += 5) {
    for (let x = 2; x < w - 2; x += 4) {
      const hsh = hash(x, y, seed)
      if (night > 0.3 && hsh < night * 0.28) b.rect(x, y, 2, 2, lit[Math.floor(hsh * 97) % lit.length])
      else if (hsh > 0.55) b.rect(x, y, 2, 2, win)
    }
  }
  return b
}

export function bakeCloud(w, h, pal, seed) {
  const b = new PixelBuffer(w, h)
  const light = pack(pal.cloudLight), dark = pack(pal.cloudDark)
  const blobs = []
  const n = 3 + Math.floor(hash(seed, 1) * 4)
  for (let i = 0; i < n; i++) {
    const r = h * (0.3 + hash(seed, i, 2) * 0.25)
    blobs.push([w * (0.15 + 0.7 * (i + 0.5) / n) + (hash(seed, i, 3) - 0.5) * 6, h - r - 1, r])
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inside = false
      for (const [cx, cy, r] of blobs) if ((x - cx) ** 2 + (y - cy) ** 2 * 1.6 < r * r) { inside = true; break }
      if (!inside) continue
      b.set(x, y, dither(x, y, (y / h - 0.35) * 1.8) ? dark : light)
    }
  }
  return b
}
