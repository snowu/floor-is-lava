// City advertising. A billboard is a mount (rooftop board, round sign, holo
// projection, cloth banner, neon tube sign, screen, LED ticker or a cluster of
// street posters) carrying one or two ads: a product or mascot sprite, a
// brand, a slogan and a background treatment. specFor() decides the shape from
// a seed alone; bakeBillboard() paints it with the current palette; the view
// animates screens, tickers, holos and ad rotation on top.
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
const BGS = ['bands', 'burst', 'halftone', 'split']
const SCREENS = ['ekg', 'stock', 'bars']
const TICKERS = ['CURFEW 22.00', 'SLEEP IS OPTIONAL', 'NKO +3.2%', 'YOUR DATA OUR FUTURE', 'RAIN 80%', 'REPORT UNLICENSED RUNNERS']

// Which mounts appear where, with weights.
const KINDS = {
  far: [['board', 3], ['holo', 2], ['round', 1], ['screen', 1], ['banner', 1]],
  near: [['board', 3], ['holo', 2], ['round', 1], ['screen', 2], ['banner', 2], ['ticker', 1]],
  facade: [['neon', 3], ['poster', 3], ['screen', 2], ['round', 2], ['ticker', 1]],
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
  const big = place === 'roof' ? 2 : place === 'near' || place === 'facade' ? 1 : 0
  const s = { kind, seed, place, ads: [adFor(seed * 3 + 1), adFor(seed * 3 + 2)] }
  if (kind === 'board') {
    s.pw = [38, 56, 76][big] + Math.floor(r(2) * [8, 14, 18][big])
    s.ph = [17, 25, 32][big] + Math.floor(r(3) * 4)
    s.legs = [8, 10, 14][big]
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
  } else if (kind === 'neon') {
    s.glyphs = 2 + Math.floor(r(4) * 3)
    s.vertical = r(5) < 0.65
    s.w = s.vertical ? 15 : s.glyphs * 10 + 5; s.h = s.vertical ? s.glyphs * 10 + 5 : 15
  } else if (kind === 'screen') {
    s.show = SCREENS[Math.floor(r(6) * SCREENS.length)]
    s.w = [30, 44, 60][big]; s.h = [20, 28, 34][big]
  } else if (kind === 'ticker') {
    s.text = TICKERS[Math.floor(r(7) * TICKERS.length)]
    s.w = place === 'facade' ? 70 + Math.floor(r(8) * 40) : 48; s.h = 11
  } else if (kind === 'poster') {
    s.count = 2 + Math.floor(r(9) * 2)
    s.w = 18 * s.count + 8; s.h = 42
  }
  return s
}

// ── palettes ─────────────────────────────────────────────────────────────

export function inks(a, pal) {
  const hue = pal.neon[a.hue % pal.neon.length]
  const other = pal.neon[(a.hue + 1) % pal.neon.length]
  return {
    hue, other,
    glow: pack(hue),
    ink: pack(mix(hue, [255, 255, 255], 0.82)),
    shade: pack(mix(hue, [0, 0, 0], 0.8)),
    dark: pack(mix(hue, [8, 6, 16], 0.82)),
    top: mix(hue, [8, 6, 16], 0.5),
    bottom: mix(hue, [8, 6, 16], 0.84),
    art: artColors(hue, pal, other),
  }
}

const METAL = (pal) => pack(mix(pal.shadow, [46, 44, 60], 0.5))
const METAL_L = (pal) => pack(mix(pal.shadow, [96, 94, 116], 0.5))
const smallW = (s) => s.length * 4 - 1

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
  if (style === 'burst') {
    const cx = x + (a.flip ? w * 0.75 : w * 0.25), cy = y + h * 0.55
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const ang = Math.atan2(y + yy - cy, x + xx - cx)
      b.set(x + xx, y + yy, Math.floor((ang + Math.PI) / (Math.PI / 8)) & 1 ? t : m)
    }
    return
  }
  if (style === 'halftone') {
    b.rect(x, y, w, h, d)
    for (let yy = 1; yy < h; yy += 3) for (let xx = 1 + (Math.floor(yy / 3) & 1); xx < w; xx += 3) {
      const k = 1 - yy / h
      if (k > 0.66) b.rect(x + xx - 1, y + yy - 1, 2, 2, t)
      else if (k > 0.25) b.set(x + xx, y + yy, t)
    }
    return
  }
  if (style === 'split') {
    const o = pack(mix(c.other, [8, 6, 16], 0.55))
    for (let yy = 0; yy < h; yy++) {
      const cut = Math.max(0, Math.min(w, Math.round(w * 0.58 - yy * 0.5)))
      b.rect(x, y + yy, w, 1, t)
      if (a.flip) b.rect(x, y + yy, cut, 1, o)
      else b.rect(x + cut, y + yy, w - cut, 1, o)
    }
    return
  }
  const bands = [t, m, d]
  for (let yy = 0; yy < h; yy++) b.rect(x, y + yy, w, 1, bands[Math.min(2, Math.floor((yy / h) * 3))])
}

function paintAd(b, a, pal, x, y, w, h) {
  const c = inks(a, pal)
  background(b, a, c, x, y, w, h)
  const text = (s, tx, ty, room) => {
    if (h >= 15 && bigW(s) <= room) { drawBig(b, s, tx + ((room - bigW(s)) >> 1), ty, c.ink, null, c.shade); return 8 }
    const cut = s.slice(0, Math.max(1, Math.floor((room + 1) / 4)))
    drawText(b, cut, tx + ((room - smallW(cut)) >> 1), ty + 1, c.ink)
    return 6
  }
  const tag = (s, tx, ty, room) => {
    if (smallW(s) <= room && ty + 5 <= y + h) drawText(b, s, tx + ((room - smallW(s)) >> 1), ty, c.glow)
  }

  if (!a.art) {
    // pure type: brand, slogan and a kanji column
    const kx = a.flip ? x + 2 : x + w - 9
    if (h >= 18) for (let i = 0; i * 8 + 7 < h - 2; i++) drawKanji(b, a.hue * 13 + i, kx, y + 2 + i * 8, c.glow, 7)
    const room = w - 13
    const tx = a.flip ? x + 11 : x + 2
    const ty = y + Math.max(2, (h >> 1) - 7)
    const used = text(a.brand, tx, ty, room)
    tag(a.tag, tx, ty + used + 2, room)
    return
  }
  const [aw, ah] = artSize(a.art)
  if (a.layout === 1 && h >= ah + 11) {
    // hero: the sprite large, the brand on a strip along the bottom
    const sc = h >= ah * 2 + 11 && w >= aw * 2 + 4 ? 2 : 1
    drawArt(b, a.art, x + ((w - aw * sc) >> 1), y + 1, c.art, sc, a.flip)
    const sy = y + h - 9
    b.rect(x, sy, w, 9, c.glow)
    const s = bigW(a.brand) <= w - 4 ? a.brand : a.brand.split(' ')[0]
    if (bigW(s) <= w - 4) drawBig(b, s, x + ((w - bigW(s)) >> 1), sy + 1, c.dark)
    else drawText(b, s.slice(0, Math.floor((w - 3) / 4)), x + 2, sy + 2, c.dark)
    return
  }
  // side: sprite on one side, copy on the other
  const sc = h >= ah * 2 + 4 && w >= aw * 2 + bigW(a.brand) + 8 ? 2 : 1
  const artW = aw * sc
  const ax = a.flip ? x + w - artW - 2 : x + 2
  if (ah * sc <= h && artW <= w >> 1) drawArt(b, a.art, ax, y + ((h - ah * sc) >> 1), c.art, sc, a.flip)
  const room = w - Math.min(artW, w >> 1) - 6
  const tx = a.flip ? x + 2 : x + Math.min(artW, w >> 1) + 4
  const ty = y + Math.max(1, (h >> 1) - 7)
  const used = text(a.brand, tx, ty, room)
  if (ty + used + 1 < y + h) b.rect(tx + 2, ty + used + 1, room - 4, 1, c.glow)
  tag(a.tag, tx, ty + used + 3, room)
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
    for (const lx of [Math.floor(s.w * 0.2), Math.floor(s.w * 0.75)]) b.rect(lx, ph + 7, 2, legs, metal)
    b.rect(Math.floor(s.w * 0.2), ph + 7 + (legs >> 1), Math.floor(s.w * 0.55) + 2, 1, metal)
    b.rect(0, ph + 8, s.w, 1, metalL)                             // catwalk
    b.rect(0, 3, s.w, ph + 4, metal)
    b.rect(0, 3, s.w, 1, metalL)
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

  if (s.kind === 'neon') {
    // tube sign with faux kanji: frame 0 lit, frame 1 a dead flicker
    const lit = frame === 0
    const c = inks(a, pal)
    const tube = lit ? c.glow : pack(mix(c.hue, [20, 16, 30], 0.7))
    const core = lit ? c.ink : pack(mix(c.hue, [20, 16, 30], 0.6))
    if (lit) {
      const halo = pack(mix(c.hue, pal.shadow, 0.55))
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (dither(x, y, 0.45)) b.set(x, y, halo)
    }
    b.rect(2, 2, s.w - 4, s.h - 4, pack(mix(pal.shadow, [16, 12, 26], 0.5)))
    for (let i = 0; i < s.glyphs; i++) {
      const gx = s.vertical ? 4 : 4 + i * 10, gy = s.vertical ? 4 + i * 10 : 4
      drawKanji(b, s.seed * 7 + i, gx, gy, tube, 7, core)
    }
    b.rect(2, 2, s.w - 4, 1, tube); b.rect(2, s.h - 3, s.w - 4, 1, tube)
    return b
  }

  if (s.kind === 'screen') {
    // bezel and a dark panel; the view draws the live chart inside
    const c = inks(a, pal)
    b.rect(0, 0, s.w, s.h, metal)
    b.rect(0, 0, s.w, 1, metalL)
    b.rect(2, 2, s.w - 4, s.h - 4, pack(mix(c.hue, [4, 4, 10], 0.9)))
    const grid = pack(mix(c.hue, [4, 4, 10], 0.78))
    for (let x = 6; x < s.w - 2; x += 6) b.rect(x, 3, 1, s.h - 6, grid)
    for (let y = 6; y < s.h - 2; y += 5) b.rect(3, y, s.w - 6, 1, grid)
    drawText(b, s.show === 'stock' ? 'NKO' : s.show === 'ekg' ? 'BPM' : 'VOL', 4, 4, c.ink)
    return b
  }

  if (s.kind === 'ticker') {
    const c = inks(a, pal)
    b.rect(0, 0, s.w, s.h, metal)
    const off = pack(mix(c.hue, [6, 4, 12], 0.82))
    for (let y = 2; y < s.h - 2; y++) for (let x = 2; x < s.w - 2; x++) if ((x + y) & 1) b.set(x, y, off)
    return b
  }

  if (s.kind === 'poster') {
    // street posters pasted over each other, corners torn, tagged over
    const papers = [[236, 228, 210], [40, 36, 52], [255, 214, 90], [200, 222, 236]]
    for (let i = 0; i < s.count; i++) {
      const ad = s.ads[i & 1]
      const c = inks({ ...ad, hue: ad.hue + i }, pal)
      const px = 3 + i * 18 + Math.floor(hash(s.seed, i, 1) * 4) - 2, py = 2 + Math.floor(hash(s.seed, i, 2) * 4)
      const pw = 20, ph = 28
      const paper = papers[Math.floor(hash(s.seed, i, 3) * papers.length)]
      const dark = paper[0] < 100
      b.rect(px, py, pw, ph, pack(paper))
      b.rect(px + 2, py + 2, pw - 4, 13, c.glow)
      const fits = ad.art && artSize(ad.art)[0] <= pw - 4 && artSize(ad.art)[1] <= 13
      if (fits) { const [aw, ah] = artSize(ad.art); drawArt(b, ad.art, px + ((pw - aw) >> 1), py + 2 + ((13 - ah) >> 1), c.art) }
      else drawKanji(b, ad.hue * 3 + i + s.seed, px + 6, py + 5, c.dark, 7)
      const word = ad.brand.split(' ')[0].slice(0, 4)
      drawText(b, word, px + ((pw - smallW(word)) >> 1), py + 18, pack(dark ? [236, 228, 210] : [30, 26, 40]))
      b.rect(px + 3, py + 25, pw - 6, 1, c.glow)
      const corner = Math.floor(hash(s.seed, i, 4) * 4)                          // torn corner
      for (let k = 0; k < 4; k++) for (let j = 0; j < 4 - k; j++) {
        b.set(corner & 1 ? px + pw - 1 - j : px + j, corner & 2 ? py + ph - 1 - k : py + k, 0)
      }
      b.rect(px + 7, py - 1, 6, 2, pack([220, 214, 190]))                         // tape
    }
    // a graffiti tag sprayed on the wall under the posters
    if (hash(s.seed, 8) < 0.7) {
      const tagC = pack(pal.neon[Math.floor(hash(s.seed, 9) * pal.neon.length)])
      const base = s.h - 6
      let gy = base
      for (let gx = 6; gx < s.w - 8; gx++) {
        const ny = base + Math.round(3 * Math.sin(gx * 0.9 + s.seed) * Math.sin(gx * 0.31))
        b.line(gx, gy, gx + 1, ny, tagC)
        gy = ny
      }
      b.rect(s.w - 9, base - 4, 1, 6, tagC)
      b.set(s.w - 9, base + 3, tagC)
    }
    return b
  }
  return b
}
