// City advertising. A billboard is a mount (rooftop board, round sign, holo
// projection, cloth banner or LED ticker) carrying one or two ads: a product or mascot sprite, a
// brand, a slogan and a background treatment. specFor() decides the shape from
// a seed alone; bakeBillboard() paints it with the current palette; the view
// animates tickers, holos and ad rotation on top.
import { PixelBuffer, pack, mix, hash, dither } from './pixels.js'
import { drawText } from './sprites.js'
import { artSize, artColors, drawArt, drawBig, bigW, drawKanji } from './art.js'

const ADS = [
  { brand: 'NEON COLA', tag: 'STAY AWAKE', art: 'can' },
  { brand: 'RAMEN 24', tag: 'HOT NOW', art: 'bowl' },
  { brand: 'HELIX', tag: 'SEE MORE', art: 'face' },
  { brand: 'LUCKY', tag: 'LOANS 0%', art: 'cat' },
  { brand: 'ICE KILLS', tag: 'VIRA GUARD', art: 'skull' },
  { brand: 'WATCHER', tag: 'WE SEE YOU', art: 'eye' },
  { brand: 'CALM+', tag: 'FEEL NOTHING', art: 'pill' },
  { brand: 'KOI BANK', tag: 'GROW', art: 'koi' },
  { brand: 'KITE', tag: 'RUN FASTER', art: 'shoe' },
  { brand: 'MARS', tag: 'NEW COLONY', art: null, bg: 'sunset' },
  { brand: 'ORBIT AIR', tag: 'FLY HIGH', art: 'planet' },
  { brand: 'SYNTH', tag: 'UPGRADE NOW', art: 'face' },
  { brand: 'OKAMI', tag: 'SAKE', art: null },
  { brand: 'NEXA', tag: 'TRUST US', art: 'eye' },
]
const BGS = ['plain', 'bands']
const TICKERS = ['CURFEW 22.00', 'SLEEP IS OPTIONAL', 'NKO +3.2%', 'YOUR DATA OUR FUTURE', 'RAIN 80%', 'REPORT UNLICENSED RUNNERS']

// Which mounts appear where, with weights.
const KINDS = {
  far: [['board', 3], ['holo', 2], ['round', 1], ['banner', 1]],
  near: [['board', 3], ['holo', 2], ['round', 1], ['banner', 2], ['ticker', 1]],
  facade: [['board', 1]],
  roof: [['board', 3], ['round', 1]],
}

function weighted(list, h) {
  const total = list.reduce((s, [, w]) => s + w, 0)
  let x = h * total
  for (const [k, w] of list) { if ((x -= w) < 0) return k }
  return list[0][0]
}

const adFor = (seed) => ({
  ...ADS[Math.floor(hash(seed, 1) * ADS.length)],
  hue: Math.floor(hash(seed, 2) * 16),
  bgStyle: BGS[Math.floor(hash(seed, 3) * BGS.length)],
  layout: Math.floor(hash(seed, 4) * 3),
  flip: hash(seed, 5) < 0.5,
})

// Shape of a billboard from its seed and placement: kind and pixel size.
export function specFor(seed, place) {
  const r = (k) => hash(seed, k, 71)
  const kind = weighted(KINDS[place], r(1))
  const big = place === 'roof' || place === 'facade' ? 2 : place === 'near' ? 1 : 0
  const s = { kind, seed, place, ads: [adFor(seed * 3 + 1), adFor(seed * 3 + 2)] }
  if (kind === 'board') {
    s.pw = [38, 62, 112][big] + Math.floor(r(2) * [8, 12, 10][big])
    s.ph = [17, 28, 42][big] + Math.floor(r(3) * 4)
    s.legs = place === 'facade' ? 0 : [8, 10, 14][big]
    s.w = s.pw + 4; s.h = s.ph + 7 + s.legs
  } else if (kind === 'round') {
    s.r = [8, 11, 13][big]
    s.pole = place === 'facade' ? 0 : [8, 12, 18][big]
    s.w = s.r * 2 + 2 + (place === 'facade' ? 6 : 0); s.h = s.r * 2 + 2 + s.pole
  } else if (kind === 'holo') {
    s.w = big ? 44 : 32; s.h = big ? 30 : 22
  } else if (kind === 'banner') {
    s.glyphs = 3 + Math.floor(r(4) * (big ? 3 : 2))
    s.kanji = r(5) < 0.55
    s.w = 13; s.h = s.glyphs * 9 + 10
  } else if (kind === 'ticker') {
    s.text = TICKERS[Math.floor(r(7) * TICKERS.length)]
    s.w = place === 'facade' ? 70 + Math.floor(r(8) * 40) : 48; s.h = 11

  }
  return s
}

// ── palettes ─────────────────────────────────────────────────────────────

export function inks(a, pal) {
  const hue = mix(pal.neon[a.hue % pal.neon.length], [148, 163, 177], 0.2)
  const other = mix(pal.neon[(a.hue + 1) % pal.neon.length], hue, 0.65)
  return {
    hue, other,
    glow: pack(hue),
    ink: pack(mix(hue, [255, 255, 255], 0.82)),
    shade: pack(mix(hue, [0, 0, 0], 0.8)),
    dark: pack(mix(hue, [8, 6, 16], 0.82)),
    top: mix(hue, [8, 6, 16], 0.76),
    bottom: mix(hue, [8, 6, 16], 0.88),
    art: artColors(hue, pal, other),
  }
}

const METAL = (pal) => pack(mix(pal.shadow, [46, 44, 60], 0.5))
const METAL_L = (pal) => pack(mix(pal.shadow, [96, 94, 116], 0.5))
const smallW = (s) => s.length * 4 - 1

// Crisp luminous cores with a colored falloff baked into the sign's panel.
// Take the strongest contribution so neighbouring strokes keep their gaps.
function neon(b, source, x, y, hue) {
  const glow = new Float32Array(b.w * b.h)
  for (let sy = 0; sy < source.h; sy++) for (let sx = 0; sx < source.w; sx++) {
    if (!(source.get(sx, sy) >>> 24)) continue
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const distance = Math.hypot(dx, dy)
      if (distance > 3) continue
      const px = x + sx + dx, py = y + sy + dy
      if (px < 0 || py < 0 || px >= b.w || py >= b.h) continue
      const i = py * b.w + px
      glow[i] = Math.max(glow[i], distance < 1.1 ? 0.55 : distance < 2.1 ? 0.23 : 0.08)
    }
  }
  for (let i = 0; i < glow.length; i++) if (glow[i]) {
    const c = b.data[i]
    b.data[i] = pack(mix([c & 255, (c >>> 8) & 255, (c >>> 16) & 255], hue, glow[i]))
  }
  const core = pack(mix(hue, [255, 255, 255], 0.86))
  for (let sy = 0; sy < source.h; sy++) for (let sx = 0; sx < source.w; sx++) {
    if (source.get(sx, sy) >>> 24) b.set(x + sx, y + sy, core)
  }
}

// ── ad panel ─────────────────────────────────────────────────────────────

function background(b, a, c, x, y, w, h) {
  const style = a.bg ?? a.bgStyle
  const t = pack(c.top), m = pack(mix(c.top, c.bottom, 0.5)), d = pack(c.bottom)
  if (style === 'sunset') {
    const sky = [mix(c.hue, [20, 8, 40], 0.75), mix(c.hue, [20, 8, 40], 0.5), mix(c.hue, [255, 200, 120], 0.15)]
    const horizon = y + Math.floor(h * 0.62)
    for (let yy = y; yy < horizon; yy++) b.rect(x, yy, w, 1, pack(sky[Math.min(2, Math.floor((yy - y) / (horizon - y) * 3))]))
    const sun = pack([255, 214, 120]), cx = x + Math.floor(w * 0.7), r = Math.floor(h * 0.3)
    for (let yy = -r; yy <= 0; yy++) for (let xx = -r; xx <= r; xx++) {
      if (xx * xx + yy * yy <= r * r && !(yy > -r * 0.6 && (yy & 1))) b.set(cx + xx, horizon - 1 + yy, sun)
    }
    for (let xx = 0; xx < w; xx++) {                               // mountains
      const mh = Math.max(1, Math.round(3 + 3 * Math.abs(Math.sin(xx * 0.21 + a.hue)) + 2 * Math.sin(xx * 0.07)))
      b.rect(x + xx, horizon - mh, 1, mh, pack(mix(c.hue, [10, 6, 20], 0.7)))
    }
    b.rect(x, horizon, w, y + h - horizon, pack(mix(c.hue, [10, 6, 20], 0.86)))
    const grid = pack(mix(c.hue, [10, 6, 20], 0.3))
    for (let yy = horizon, k = 1; yy < y + h; yy += k, k++) b.rect(x, yy, w, 1, grid)
    for (let i = -6; i <= 6; i++) {
      const x0 = x + (w >> 1) + i * 3, x1 = x + (w >> 1) + i * 12
      for (let yy = horizon; yy < y + h; yy++) {
        const px = Math.round(x0 + (x1 - x0) * (yy - horizon) / Math.max(1, y + h - 1 - horizon))
        if (px >= x && px < x + w) b.set(px, yy, grid)
      }
    }
    return
  }
  if (style === 'plain') { b.rect(x, y, w, h, d); return }
  const bands = [t, m, d]
  for (let yy = 0; yy < h; yy++) b.rect(x, y + yy, w, 1, bands[Math.min(2, Math.floor((yy / h) * 3))])
}

function paintAd(b, a, pal, x, y, w, h) {
  const c = inks(a, pal)
  const big = w >= 90 && h >= 38
  if (!big) {
    background(b, a, c, x, y, w, h)
    const word = a.brand.split(' ')[0]
    if (bigW(word) <= w - 8) drawBig(b, word, x + 4, y + Math.floor((h - 7) / 2), c.ink)
    else drawText(b, word.slice(0, Math.floor((w - 7) / 4)), x + 4, y + Math.floor((h - 5) / 2), c.ink)
    return
  }
  // Printed campaigns have their own brand colors. District lighting nudges
  // the paper and frame, instead of turning every ad into the same dark UI.
  const themes = {
    can: [[226, 238, 84], [35, 28, 51]],
    face: [[127, 214, 230], [20, 38, 56]],
    bowl: [[255, 177, 88], [66, 27, 36]],
    cat: [[245, 204, 118], [47, 41, 63]],
    skull: [[236, 119, 131], [42, 28, 48]],
    eye: [[169, 195, 235], [28, 32, 62]],
    pill: [[180, 216, 169], [27, 49, 51]],
    koi: [[246, 166, 130], [36, 49, 61]],
    shoe: [[238, 152, 94], [38, 29, 52]],
    planet: [[137, 196, 233], [28, 30, 64]],
  }
  const [accent, ground] = themes[a.art] ?? [[236, 210, 165], [46, 32, 56]]
  const base = mix(ground, pal.shadow, 0.12)
  const paper = mix([241, 235, 220], pal.light, 0.06)
  const copy = pack(paper), secondary = pack(mix(paper, accent, 0.4))
  b.rect(x, y, w, h, pack(base))
  const [aw, ah] = a.art ? artSize(a.art) : [0, 0]
  const sc = a.art && ah * 2 <= h - 6 ? 2 : 1
  const heroW = a.art ? Math.max(32, aw * sc + 10) : 0
  if (a.art) {
    b.rect(x, y, heroW, h, pack(mix(base, accent, 0.22)))
    b.rect(x + heroW - 1, y, 1, h, pack(mix(base, accent, 0.42)))
    const art = artColors(accent, pal, [70, 58, 83])
    art.e = pack(paper)
    drawArt(b, a.art, x + Math.floor((heroW - aw * sc) / 2), y + Math.floor((h - ah * sc) / 2), art, sc)
    b.rect(x + 5, y + h - 3, heroW - 10, 1, pack(mix(base, accent, 0.38)))
  }
  const tx = x + heroW + 6, room = w - heroW - 12
  const lines = a.art === 'can' ? a.brand.split(' ') : bigW(a.brand) <= room ? [a.brand] : a.brand.split(' ')
  const fontScale = Math.max(...lines.map(bigW)) * 2 <= room ? 2 : 1
  const lineH = 7 * fontScale
  const titleH = lines.length * (lineH + 2) - 2
  const tagFits = smallW(a.tag) <= room && titleH + 14 <= h - 4
  const totalH = titleH + (tagFits ? 10 : 0)
  const ty = y + Math.floor((h - totalH) / 2) - 1
  lines.forEach((line, i) => {
    if (bigW(line) <= room) {
      const glyphs = new PixelBuffer(bigW(line), 7)
      drawBig(glyphs, line, 0, 0, copy)
      const title = new PixelBuffer(glyphs.w * fontScale, 7 * fontScale)
      for (let yy = 0; yy < glyphs.h; yy++) for (let xx = 0; xx < glyphs.w; xx++) {
        if (glyphs.get(xx, yy) >>> 24) title.rect(xx * fontScale, yy * fontScale, fontScale, fontScale, copy)
      }
      neon(b, title, tx, ty + i * (lineH + 2), accent)
    } else drawText(b, line.slice(0, Math.floor((room + 1) / 4)), tx, ty + i * (lineH + 2), copy)
  })
  if (tagFits) drawText(b, a.tag, tx, ty + titleH + 5, secondary)
  const tube = new PixelBuffer(Math.min(room, 22), 1)
  tube.rect(0, 0, tube.w, 1, pack(accent))
  neon(b, tube, tx, y + h - 4, accent)

}

// ── mounts ───────────────────────────────────────────────────────────────

export function bakeBillboard(s, pal, frame) {
  const metal = METAL(pal), metalL = METAL_L(pal)
  const a = s.ads[frame & 1]

  if (s.kind === 'ticker' && frame === 1) {
    // the lit text strip the view scrolls through the housing
    const c = inks(a, pal)
    const strip = new PixelBuffer(bigW(s.text) + s.w, 7)
    drawBig(strip, s.text, s.w, 0, pack(mix(c.hue, [255, 220, 120], 0.35)))
    return strip
  }
  const b = new PixelBuffer(s.w, s.h)

  if (s.kind === 'board') {
    const { pw, ph, legs } = s
    const shadow = pack(mix(pal.shadow, [6, 8, 15], 0.55))
    if (s.place === 'facade') {
      // Four wall brackets and a shadow along the lower/right frame edge.
      for (const lx of [4, s.w - 6]) b.rect(lx, 1, 2, ph + 6, metalL)
      b.rect(2, 5, s.w - 2, ph + 2, shadow)
    }
    for (const lx of [Math.floor(s.w * 0.2), Math.floor(s.w * 0.75)]) b.rect(lx, ph + 7, 2, legs, metal)
    b.rect(Math.floor(s.w * 0.2), ph + 7 + (legs >> 1), Math.floor(s.w * 0.55) + 2, 1, metal)
    if (legs) b.rect(0, ph + 8, s.w, 1, metalL)                             // catwalk
    b.rect(0, 3, s.w, ph + 4, metal)
    b.rect(0, 3, s.w, 1, metalL)
    b.rect(0, 4, 1, ph + 2, metalL)
    b.rect(s.w - 1, 4, 1, ph + 3, shadow)
    paintAd(b, a, pal, 2, 5, pw, ph)
    const lamps = pw > 50 ? 3 : 2
    const c = inks(a, pal)
    const beam = pack(mix(c.top, [255, 244, 214], 0.3))
    for (let i = 0; i < lamps; i++) {
      const lx = 2 + Math.round((pw - 4) * (i + 0.5) / lamps)
      b.rect(lx - 1, 0, 3, 1, metal); b.rect(lx, 1, 1, 2, metal)
      b.set(lx, 2, pack([255, 244, 214]))
      for (let x = lx - 4; x <= lx + 4; x++) if (dither(x, 5, 0.5)) b.set(x, 5, beam)
    }
    return b
  }

  if (s.kind === 'round') {
    const r = s.r, side = s.place === 'facade' ? 6 : 0
    const cx = side + r + 1, cy = r + 1
    const c = inks(a, pal)
    if (s.pole) b.rect(cx - 1, cy + r, 3, s.pole + 1, metal)
    if (side) { b.rect(0, cy - 1, side + 2, 2, metal); b.rect(0, cy - 4, 2, 8, metalL) }
    b.disc(cx + 0.5, cy + 0.5, r + 1, metal)
    b.disc(cx + 0.5, cy + 0.5, r, c.glow)
    b.disc(cx + 0.5, cy + 0.5, r - 2, pack(c.bottom))
    for (let y = -r; y < 0; y++) for (let x = -r; x <= r; x++) {     // lit upper half
      if (x * x + y * y < (r - 2) ** 2 && dither(cx + x, cy + y, 0.4)) b.set(cx + x, cy + y, pack(c.top))
    }
    const room = r * 2 - 3
    const [aw, ah] = a.art ? artSize(a.art) : [99, 99]
    if (aw <= room && ah <= room) drawArt(b, a.art, cx - (aw >> 1), cy - (ah >> 1), c.art, 1, a.flip)
    else drawKanji(b, a.hue * 5 + s.seed, cx - 3, cy - 3, c.ink, 7)
    return b
  }

  if (s.kind === 'holo') {
    // a monochrome projection of the ad's sprite and brand; the view spins it
    const c = inks(a, pal)
    const tones = [pack(mix(c.hue, [255, 255, 255], 0.75)), pack(c.hue), pack(mix(c.hue, [0, 0, 0], 0.35))]
    const mono = {}
    for (const [k, v] of Object.entries(c.art)) {
      const l = (v & 255) * 0.3 + ((v >> 8) & 255) * 0.59 + ((v >> 16) & 255) * 0.11
      mono[k] = k === 'k' ? tones[2] : tones[l > 170 ? 0 : l > 90 ? 1 : 2]
    }
    const name = a.art ?? 'eye'
    const [aw, ah] = artSize(name)
    const sc = s.w >= aw * 2 + 2 && s.h >= ah * 2 + 8 ? 2 : 1
    drawArt(b, name, (s.w - aw * sc) >> 1, Math.max(0, s.h - 8 - ah * sc), mono, sc, a.flip)
    const word = a.brand.split(' ')[0]
    if (smallW(word) <= s.w) drawText(b, word, (s.w - smallW(word)) >> 1, s.h - 6, tones[0])
    for (let y = 1; y < s.h; y += 3) for (let x = 0; x < s.w; x++) if (b.get(x, y) >>> 24) b.set(x, y, tones[2])
    return b
  }

  if (s.kind === 'banner') {
    // cloth banner hung off a tower side, glyphs running down it
    const c = inks(a, pal)
    b.rect(0, 0, s.w, 2, metal)
    b.rect(1, 2, s.w - 2, s.h - 7, pack(c.bottom))
    b.rect(1, 2, 1, s.h - 7, c.glow); b.rect(s.w - 2, 2, 1, s.h - 7, c.glow)
    const letters = (a.brand.replace(/[^A-Z0-9]/g, '') + 'XXXXX')
    for (let i = 0; i < s.glyphs; i++) {
      const gy = 5 + i * 9
      if (s.kanji) drawKanji(b, s.seed * 11 + i, 3, gy, c.ink, 7, c.glow)
      else drawBig(b, letters[i], 4, gy, c.ink, c.shade)
    }
    for (let x = 1; x < s.w - 1; x += 2) b.rect(x, s.h - 5, 1, 2 + ((x >> 1) & 1) * 2, c.glow)    // tassels
    return b
  }

  if (s.kind === 'ticker') {
    const c = inks(a, pal)
    b.rect(0, 0, s.w, s.h, metal)
    const off = pack(mix(c.hue, [6, 4, 12], 0.82))
    for (let y = 2; y < s.h - 2; y++) for (let x = 2; x < s.w - 2; x++) if ((x + y) & 1) b.set(x, y, off)
    return b
  }


  return b
}
