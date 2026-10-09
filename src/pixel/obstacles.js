// Obstacles as rooftop equipment: several designs per obstacle type, picked
// by seed. The part you use is always solid red (the top you vault or grab,
// the underside of what you slide under) so the action still reads at a
// glance. Sprites keep the solid's footprint plus a red cap `lip` above it,
// so they line up with the physics.
import { PixelBuffer, pack, mix, dither, css, hash } from './pixels.js'
import { ACCENT } from './palette.js'
import { outlined, recede } from './sprites.js'

const RED = pack(ACCENT)
const RED_D = pack(mix(ACCENT, [40, 6, 14], 0.45))
const WHITE = pack([246, 242, 236])
const INK = pack([10, 8, 16])
const HAZ = pack([255, 214, 51])

export const LIPS = { housing: 4, spring: 2, beam: 0 }
export const lipOf = (sub) => LIPS[sub] ?? 3

const METAL = [128, 134, 150], CONCRETE = [150, 144, 140], RUST = [150, 92, 60]
const tone = (c, pal, k = 0.25) => {
  const base = mix(c, pal.shadow, k)
  return { l: pack(mix(base, [255, 255, 255], 0.22)), b: pack(base), d: pack(mix(base, [0, 0, 0], 0.3)), dd: pack(mix(base, [0, 0, 0], 0.55)) }
}
const hash01 = (a, b = 0) => {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function capTop(b, w, lip) {
  b.rect(0, 0, w, lip, RED)
  b.rect(0, lip - 1, w, 1, RED_D)
}

const VENTS = [
  // AC condenser: a round fan grille on the front, louvered side
  (b, w, h, lip, pal) => {
    const t = tone(METAL, pal)
    b.rect(0, lip, w, h, t.b)
    b.rect(0, lip, w, 1, t.l)
    b.rect(w - 3, lip, 3, h, t.d)
    for (let y = lip + 2; y < lip + h - 1; y += 2) b.rect(w - 3, y, 3, 1, t.dd)
    const r = Math.min((w - 5) / 2, (h - 3) / 2)
    const cx = (w - 3) / 2, cy = lip + h / 2
    if (r >= 2.5) {
      b.disc(cx, cy, r, t.dd)
      b.disc(cx, cy, r - 1, t.d)
      for (let a = 0; a < 3; a++) b.line(cx, cy, cx + Math.cos(a * 2.1) * (r - 1), cy + Math.sin(a * 2.1) * (r - 1), t.dd)
      b.disc(cx, cy, 1, t.l)
    }
  },
  // galvanized duct box with seams and rivets
  (b, w, h, lip, pal) => {
    const t = tone([160, 166, 176], pal, 0.2)
    b.rect(0, lip, w, h, t.b)
    for (let x = 0; x < w; x += 6) b.rect(x, lip, 1, h, t.d)
    for (let x = 3; x < w; x += 6) { b.set(x, lip + 2, t.dd); b.set(x, lip + h - 2, t.dd) }
    b.rect(0, lip + h - 1, w, 1, t.dd)
    if (h > 9) { b.rect(2, lip + 3, Math.min(8, w - 4), 4, t.dd); for (let x = 3; x < Math.min(10, w - 2); x += 2) b.rect(x, lip + 3, 1, 4, t.d) }
  },
  // yellow generator with an exhaust stack and a warning label
  (b, w, h, lip, pal) => {
    const t = tone([214, 170, 52], pal, 0.2)
    b.rect(0, lip, w, h, t.b)
    b.rect(0, lip, w, 1, t.l)
    b.rect(0, lip + h - 2, w, 2, t.dd)
    for (let y = lip + 3; y < lip + h - 3; y += 2) b.rect(w - 6, y, 4, 1, t.d)
    if (w > 10) { b.rect(2, lip + 3, 5, 4, pack([30, 26, 34])); b.rect(3, lip + 4, 3, 2, pack([255, 214, 51])) }
  },
  // low skylight: steel frame, slanted glass catching the sky
  (b, w, h, lip, pal) => {
    const t = tone(METAL, pal, 0.35)
    b.rect(0, lip, w, h, t.d)
    const glass = pack(mix(pal.glass[0], [255, 255, 255], 0.15)), glassD = pack(pal.glass[1])
    for (let y = lip + 1; y < lip + h - 2; y++) for (let x = 1; x < w - 1; x++) b.set(x, y, (x + (y - lip) * 2) % 11 < 2 ? glass : glassD)
    for (let x = Math.floor(w / 2); x < w; x += 99) b.rect(x, lip, 1, h, t.dd)
    b.rect(0, lip + h - 2, w, 2, t.b)
  },
  // data relay box: dark casing, rows of status LEDs, a stub antenna
  (b, w, h, lip, pal) => {
    const t = tone([52, 54, 70], pal, 0.2)
    b.rect(0, lip, w, h, t.b)
    b.rect(0, lip, w, 1, t.l)
    b.rect(w - 3, lip, 3, h, t.d)
    const leds = [pack(pal.neon[1 % pal.neon.length]), pack(pal.neon[0]), pack([93, 255, 138])]
    for (let y = lip + 3, r = 0; y < lip + h - 2; y += 3, r++) {
      for (let x = 2; x < w - 4; x += 2) if ((x * 7 + r * 3) % 5 < 3) b.set(x, y, leds[(x + r) % leds.length])
    }
    b.rect(1, lip + h - 2, w - 4, 1, t.dd)
  },
]

const HIGHBOXES = [
  // electrical cabinet: doors, louvers, a hazard sticker, conduit
  (b, w, h, lip, pal) => {
    const t = tone([118, 124, 132], pal)
    b.rect(0, lip, w, h, t.b)
    b.rect(Math.floor(w / 2), lip + 1, 1, h - 2, t.dd)
    for (let y = lip + h - 7; y < lip + h - 2; y += 2) b.rect(2, y, w - 4, 1, t.d)
    const sx = Math.floor(w / 2) - 3, sy = lip + 4
    for (let i = 0; i < 4; i++) b.rect(sx + 3 - i, sy + i, 1 + i * 2, 1, HAZ)
    b.set(sx + 3, sy + 1, INK); b.set(sx + 3, sy + 2, INK)
    b.rect(w - 3, lip, 3, h, t.d)
  },
  // stacked crates, strapped
  (b, w, h, lip, pal) => {
    const n = Math.max(2, Math.round(h / 10))
    for (let i = 0; i < n; i++) {
      const t = tone(i % 2 ? [168, 120, 70] : [92, 118, 160], pal, 0.25)
      const y0 = lip + Math.round((h * i) / n), y1 = lip + Math.round((h * (i + 1)) / n)
      const inset = i === 0 ? 1 : 0
      b.rect(inset, y0, w - inset * 2, y1 - y0, t.b)
      b.rect(inset, y0, w - inset * 2, 1, t.l)
      b.rect(inset, y1 - 1, w - inset * 2, 1, t.dd)
      b.line(inset + 1, y0 + 1, w - inset - 2, y1 - 2, t.d)
    }
    b.rect(Math.floor(w * 0.7), lip, 1, h, pack([30, 26, 34]))
  },
  // air handler: big louvers and a duct dropping into the roof
  (b, w, h, lip, pal) => {
    const t = tone([150, 156, 168], pal, 0.25)
    b.rect(0, lip, w, h, t.b)
    b.rect(0, lip, w, 1, t.l)
    for (let y = lip + 3; y < lip + h * 0.6; y += 2) b.rect(2, y, w - 4, 1, t.dd)
    b.rect(2, lip + Math.round(h * 0.68), w - 4, Math.round(h * 0.25), t.d)
    b.rect(w - 3, lip, 3, h, t.d)
  },
  // water heater: a rounded tank on legs
  (b, w, h, lip, pal) => {
    const t = tone([196, 190, 180], pal, 0.25)
    b.rect(1, lip, w - 2, h - 3, t.b)
    b.rect(1, lip, 2, h - 3, t.l)
    b.rect(w - 4, lip, 3, h - 3, t.d)
    for (const y of [lip + 4, lip + h - 8]) b.rect(1, y, w - 2, 1, t.dd)
    b.rect(2, lip + h - 3, 2, 3, t.dd); b.rect(w - 4, lip + h - 3, 2, 3, t.dd)
    b.rect(Math.floor(w / 2) - 1, lip + 7, 3, 3, pack([255, 214, 51]))
  },
]

const HOUSINGS = [
  // stairwell bulkhead: door, a lit lamp, a small window
  (b, w, h, lip, pal) => {
    const t = tone(CONCRETE, pal, 0.3)
    b.rect(0, lip, w, h, t.b)
    for (let y = lip + 4; y < lip + h; y += 6) b.rect(0, y, w, 1, t.d)
    b.rect(w - 3, lip, 3, h, t.d)
    const dx = Math.min(10, w - 24), dh = Math.min(26, h - 6)
    b.rect(dx, lip + h - dh, 14, dh, pack(mix(RUST, pal.shadow, 0.4)))
    b.rect(dx + 1, lip + h - dh + 1, 12, 1, t.l)
    b.rect(dx + 10, lip + h - dh / 2, 2, 2, HAZ)
    b.rect(dx + 4, lip + h - dh - 4, 6, 2, pack([255, 238, 190]))
    if (w > 46) { b.rect(w - 22, lip + 7, 10, 6, t.dd); b.rect(w - 21, lip + 8, 8, 4, pack(pal.glass[1])) }
  },
  // elevator machine room: louver bank, pipes, a warning sign
  (b, w, h, lip, pal) => {
    const t = tone([120, 118, 128], pal, 0.3)
    b.rect(0, lip, w, h, t.b)
    b.rect(w - 3, lip, 3, h, t.d)
    const lw = Math.min(30, w - 16)
    for (let y = lip + 5; y < lip + 5 + Math.min(18, h - 10); y += 2) b.rect(6, y, lw, 1, t.dd)
    b.rect(6, lip + 4, lw, 1, t.l)
    for (const px of [w - 10, w - 7]) { b.rect(px, lip, 2, h, pack(mix([90, 96, 110], pal.shadow, 0.3))) }
    b.rect(w - 22, lip + h - 14, 8, 6, HAZ); b.rect(w - 21, lip + h - 13, 6, 1, INK)
  },
  // corrugated shed with a roller door
  (b, w, h, lip, pal) => {
    const t = tone([110, 132, 128], pal, 0.3)
    for (let x = 0; x < w; x++) b.rect(x, lip, 1, h, x % 3 === 0 ? t.d : x % 3 === 1 ? t.b : t.l)
    const dw = Math.min(28, w - 16), dx = Math.floor((w - dw) / 2)
    b.rect(dx, lip + h - Math.min(28, h - 6), dw, Math.min(28, h - 6), t.dd)
    for (let y = lip + h - Math.min(28, h - 6) + 2; y < lip + h; y += 3) b.rect(dx, y, dw, 1, t.d)
  },
]

// ── pipes ───────────────────────────────────────────────────────────────
// A pipe comes up out of the roof, bends through an elbow, runs straight, and
// connects into a background vent unit. Overhead runs cross the lane at
// slide height; red bands mark the near end. Tubes use a 3D mesh
// looking straight along their length, which recedes into the roof.

const PIPE_METALS = [[178, 184, 196], [214, 208, 196], [186, 120, 80], [128, 136, 158]]

// The bank faces the camera: X carries the width, Z carries the length.
// The collision anchor stays in screen space; the pipes themselves are
// projected from cylinders and elbows in three dimensions.
export function pipeFrame(sub, w, h, drop, seed, options = {}) {
  const count = options.count ?? (w < 29 || hash01(seed, 17) < 0.5 ? 2 : 3)
  const bankW = Math.max(w, count * 8)
  const r = Math.min(2.5, (bankW / count - 3) / 2)
  const W = Math.max(70, Math.ceil(bankW + 8)), unitW = 66
  const ox = (W - w) / 2, oy = 36
  const unitX = (W - unitW) / 2
  return { ox, oy, W, H: Math.ceil(oy + h + drop + 4), count, r, depth: 12, unitX, unitW, bankW }

}

function airHandler(f, pal, profiles) {
  const base = f.H - 2 - f.depth
  const unit = new PixelBuffer(f.unitW, base + 1)
  const t = tone([120, 139, 143], pal, 0.35)
  const edge = pack(mix(pal.shadow, [57, 74, 78], 0.45))
  // Two roof-mounted axial fans in strict side elevation: shallow drums,
  // raised cages and visible edge-on rotors, rather than front-facing discs.
  for (const x of [8, 39]) {
    unit.rect(x + 2, 4, 16, 1, t.l)
    unit.rect(x, 6, 20, 5, t.dd)
    unit.rect(x + 1, 5, 18, 1, t.b)
    unit.rect(x + 1, 7, 18, 2, t.d)
    for (let rib = 2; rib < 20; rib += 3) unit.rect(x + rib, 6, 1, 4, t.b)
    unit.rect(x + 8, 6, 3, 4, t.l)
    unit.rect(x + 3, 10, 14, 2, t.d)
  }
  // Deep cabinet, broad louver bank, bolted service panel and a rear plinth.
  unit.rect(0, 12, f.unitW, base - 15, t.b)
  unit.rect(0, 12, f.unitW, 2, t.l)
  unit.rect(0, 14, 2, base - 17, t.d)
  unit.rect(f.unitW - 2, 14, 2, base - 17, t.d)
  unit.rect(5, 18, 40, base - 25, t.dd)
  for (let y = 19; y < base - 9; y += 3) {
    unit.rect(6, y, 38, 1, t.b)
    unit.rect(6, y + 1, 38, 1, t.d)
  }
  unit.rect(48, 18, 13, base - 25, t.d)
  unit.rect(49, 19, 11, base - 27, t.b)
  for (const x of [50, 58]) for (const y of [20, base - 10]) unit.set(x, y, t.l)
  unit.rect(56, 29, 2, 5, t.dd)
  unit.rect(3, base - 3, f.unitW - 6, 2, t.dd)
  unit.rect(6, base - 1, 9, 2, edge)
  unit.rect(f.unitW - 15, base - 1, 9, 2, edge)
  // Connections land on the unit's left side, at three distinct heights.
  for (const p of profiles) {
    unit.rect(0, p.cy - 4, 4, 8, t.dd)
    unit.rect(1, p.cy - 3, 3, 6, t.d)
  }
  return recede(outlined(unit, edge), pal.mid, 0.43)
}

// Orthographic, head-on camera: parallel pipes keep a constant width and
// never converge. X is bank width, Y is height, Z goes away from the player.
// Cylindrical geometry supplies the rounded elbow shading and occlusion.
function endOnPipes(f, w, h, pal, metal, legacy = false) {
  const result = new PixelBuffer(f.W, f.H)
  const zbuffer = new Float64Array(f.W * f.H).fill(Infinity)
  const roofDepth = new Float64Array(f.W * f.H).fill(Infinity)
  const base = f.H - 2, center = f.W / 2
  // Almost level: a compact elbow and parallel sides let the lighting carry
  // the depth instead of an exaggerated projected bend.
  const tilt = 0.08, cos = Math.sqrt(1 - tilt * tilt)
  const height = (base - f.oy - h / 2) / cos
  const length = 42, R = 3
  // The run you duck under heads straight away from the camera, so end-on it
  // has no area. Everything from the collision band up is painted action red
  // instead, and the risers below it sink back, so the bank reads as a red
  // bar at head height with room underneath.
  const band = height - h / 2
  const project = (v) => {
    const depth = v.z * cos - v.y * tilt
    return { x: v.x, y: base - (v.y * cos + v.z * tilt), z: depth, roofZ: v.z }
  }
  const color = (normal, paint, straightRun, collar, contact, low = false) => {
    const magnitude = Math.hypot(...normal)
    const [nx, ny, nz] = normal.map((n) => n / magnitude)
    // A broad lit face, a narrow glint and a cool shadow side describe the
    // round section at five pixels wide. The same light wraps over the elbow;
    // all the volume comes from color, without changing its silhouette.
    const light = nx * -0.82 + ny * 0.54 - nz * 0.18
    const levels = [-0.86, -0.74, -0.54, -0.24, 0.16, 0.42]
    const k = levels[Math.max(0, Math.min(5, Math.floor((light + 1) * 3)))]
    const shadow = mix(pal.shadow, [19, 30, 49], 0.55)
    const material = collar ? [110, 123, 131] : paint ? ACCENT : straightRun ? mix(metal, shadow, 0.38) : metal
    let shaded = mix(material, k < 0 ? shadow : [255, 241, 215], Math.abs(k))
    // Keep painted markers saturated; bare metal catches a sharper warm glint.
    const reflection = nx * -0.45 + ny * 0.2 - nz * 0.87
    if (reflection > 0.94) shaded = mix(shaded, [246, 247, 240], paint ? 0.18 : collar ? 0.48 : 0.76)
    // Contact shadow below the elbow socket and beside the roof mounting.
    if (contact) shaded = mix(shaded, shadow, 0.38)
    if (low) shaded = mix(shaded, shadow, 0.5)
    return pack(mix(shaded, pal.mid, 0.03))
  }
  const triangle = (a, b, c, ink) => {
    const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    if (Math.abs(area) < 0.001) return
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))), x1 = Math.min(f.W - 1, Math.ceil(Math.max(a.x, b.x, c.x)))
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))), y1 = Math.min(f.H - 1, Math.ceil(Math.max(a.y, b.y, c.y)))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5
      const u = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) / area
      const v = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) / area
      const t = 1 - u - v
      if (u < -0.001 || v < -0.001 || t < -0.001) continue
      const z = a.z * u + b.z * v + c.z * t, index = y * f.W + x
      if (z >= zbuffer[index]) continue
      zbuffer[index] = z
      roofDepth[index] = a.roofZ * u + b.roofZ * v + c.roofZ * t
      result.set(x, y, ink)
    }
  }
  const tube = (x, path, radius, collar = false) => {
    const sides = 12
    const rings = path.map((p) => Array.from({ length: sides }, (_, j) => {
      const angle = j * Math.PI * 2 / sides
      const normal = [Math.cos(angle), Math.sin(angle) * p.dz, -Math.sin(angle) * p.dy]
      const vertex = project({ x: x + normal[0] * radius, y: p.y + normal[1] * radius, z: p.z + normal[2] * radius })
      return { vertex, normal }
    }))
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides, a = rings[i][j], b = rings[i][k], c = rings[i + 1][k], d = rings[i + 1][j]
      const normal = a.normal.map((n, axis) => (n + b.normal[axis] + c.normal[axis] + d.normal[axis]) / 4)
      const upright = path[i].dy === 1 && path[i + 1].dy === 1
      const midY = (path[i].y + path[i + 1].y) / 2
      const paint = legacy
        ? !collar && upright && midY >= height - R - 2 && midY < height - R - 1
        : !collar && path[i].dy > 0.3 && midY >= band - 1
      const contact = !collar && upright && (midY < 4 || (legacy && midY >= height - R - 1))
      const low = !legacy && !collar && upright && midY < band - 2
      const ink = color(normal, paint, path[i].dy === 0, collar, contact, low)
      triangle(a.vertex, b.vertex, c.vertex, ink)
      triangle(a.vertex, c.vertex, d.vertex, ink)
    }
  }
  // Keep the action stripe on the upright, where it remains a clear pixel
  // band even when the rear run is viewed almost perfectly end-on.
  const path = [0, 4, height - R - 2, height - R - 1, height - R].map((y) => ({ y, z: 0, dy: 1, dz: 0 }))
  for (let i = 1; i <= 10; i++) {
    const a = i * Math.PI / 20
    path.push({ y: height - R + R * Math.sin(a), z: R * (1 - Math.cos(a)), dy: Math.cos(a), dz: Math.sin(a) })
  }
  path.push({ y: height, z: R, dy: 0, dz: 1 })
  path.push({ y: height, z: length, dy: 0, dz: 1 })
  for (let i = 0; i < f.count; i++) {
    // Give every pipe the same pixel phase so their bends rasterize alike.
    const x = Math.round(center + (i - (f.count - 1) / 2) * (f.bankW / f.count)) + 0.5
    tube(x, path, f.r)
    // A narrow socket seam separates the upright from the rounded elbow.
    tube(x, [{ y: height - R - 0.5, z: 0, dy: 1, dz: 0 }, { y: height - R + 0.5, z: 0, dy: 1, dz: 0 }], f.r, true)
    tube(x, [{ y: 1, z: 0, dy: 1, dz: 0 }, { y: 3, z: 0, dy: 1, dz: 0 }], f.r + 0.8, true)
    tube(x, [{ y: height, z: length - 2, dy: 0, dz: 1 }, { y: height, z: length, dy: 0, dz: 1 }], f.r + 0.6, true)
  }
  // A clamp strap ties the bank together along the underside of the band:
  // one unbroken red edge to slide beneath, in front of the runner.
  if (!legacy) {
    const first = Math.round(center - (f.count - 1) / 2 * (f.bankW / f.count)) + 0.5
    const last = Math.round(center + (f.count - 1) / 2 * (f.bankW / f.count)) + 0.5
    const y = Math.round(base - band * cos)
    const x0 = Math.floor(first - f.r - 1), x1 = Math.ceil(last + f.r + 1)
    for (let x = x0; x < x1; x++) {
      for (const [dy, c] of [[-1, pack(mix(ACCENT, [255, 241, 215], 0.35))], [0, pack(ACCENT)], [1, pack(mix(ACCENT, [40, 6, 14], 0.45))]]) {
        const index = (y + dy) * f.W + x
        if (index < 0 || index >= zbuffer.length) continue
        zbuffer[index] = -1
        roofDepth[index] = 0
        result.set(x, y + dy, c)
      }
    }
  }
  // The runner occupies a plane through the bank. Near faces (including
  // the complete risers) cover her; the rear run and AC remain behind her.
  const near = new PixelBuffer(f.W, f.H)
  for (let i = 0; i < result.data.length; i++) if (roofDepth[i] <= 12) near.data[i] = result.data[i]
  const full = outlined(result), mask = outlined(near)
  // Use the full sprite's edge colors, avoiding a false black seam where
  // the near/far split cuts through a continuous pipe.
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i] >>> 24) mask.data[i] = full.data[i]
  return { full, near: mask }
}

export function bakePipeLayers(sub, w, h, drop, pal, seed, options = {}) {
  const f = pipeFrame(sub, w, h, drop, seed, options)
  const back = new PixelBuffer(f.W, f.H), front = new PixelBuffer(f.W, f.H)
  const metal = PIPE_METALS[Math.floor(hash01(seed, 21) * PIPE_METALS.length)]
  // Preserve the approved AC pixel art behind every pipe bank.
  const ports = Array.from({ length: f.count }, (_, i) => ({ cy: f.oy + h / 2 - (f.count - 1 - i) * 9 }))
  back.blit(airHandler(f, pal, ports), f.unitX - 1, -1)
  const pipe = endOnPipes(f, w, h, pal, metal, options.legacy)
  back.blit(pipe.full, -1, -1)
  front.blit(pipe.near, -1, -1)
  return { back, front }
}

export function bakePipe(sub, w, h, drop, pal, seed, options = {}) {
  return bakePipeLayers(sub, w, h, drop, pal, seed, options).back
}

export function bakePipeFront(sub, w, h, drop, pal, seed, options = {}) {
  return bakePipeLayers(sub, w, h, drop, pal, seed, options).front
}

function rooftop(sub, w, h, pal, seed) {
  const pickFrom = (list) => list[Math.floor(hash01(seed, 7) * list.length)]
  if (sub === 'spring') {
    const b = new PixelBuffer(w, h + 2)
    const plate = tone(METAL, pal, 0.2)
    for (let x = 0; x < w; x++) {
      const t = Math.round((1 - Math.min(1, x / (w * 0.85))) * (h - 2))
      for (let y = t; y < h; y++) b.set(x, y + 2, y === t ? WHITE : (x + y) % 4 === 0 ? plate.l : RED)
    }
    b.rect(0, h + 1, w, 1, INK)
    return b
  }
  const lip = lipOf(sub)
  const b = new PixelBuffer(w, h + lip)
  const list = sub === 'vent' ? VENTS : sub === 'highbox' ? HIGHBOXES : HOUSINGS
  pickFrom(list)(b, w, h, lip, pal)
  capTop(b, w, lip)
  if (sub === 'housing') for (let x = 2; x < w - 2; x += 3) b.set(x, lip + 1, RED_D)
  return b
}

export function bakeObstacle(sub, w, h, pal, seed = 0) {
  return outlined(rooftop(sub, w, h, pal, seed))
}

// Soft contact shadow so obstacles sit on the roof instead of floating.
export function bakeShadow(w) {
  const b = new PixelBuffer(w + 6, 3)
  const c = pack([0, 0, 0])
  for (let y = 0; y < 3; y++) for (let x = 0; x < w + 6; x++) {
    const edge = Math.min(x, w + 5 - x) / 3
    if (dither(x, y, Math.min(1, edge) * (0.6 - y * 0.2))) b.set(x, y, c)
  }
  return b
}

// A live fence across the roof, seen from the side: it runs from the lane at
// the front edge back across the roof, so it is drawn edge-on in a slight
// oblique, with posts receding toward the back and wires between them. The
// front post sits at the lane, where it can shock you.
//
// Geometry shared by the baked part and the animated live wire: the front
// post at (0, 0), the back post `skew` px right and `depth` px up; `h` tall.
export function fenceGeometry(h, depth) {
  const skew = Math.max(8, Math.round(depth * 1.1))
  return { h, depth, skew, w: skew + 8, H: h + depth + 4 }
}

export function bakeFence(h, depth, pal) {
  const g = fenceGeometry(h, depth)
  const b = new PixelBuffer(g.w, g.H)
  const ox = 2, oy = g.H - 1                      // front post foot inside the sprite
  const post = tone([84, 86, 102], pal, 0.25)
  const back = (u) => [ox + Math.round(g.skew * u), oy - Math.round(g.depth * u)]
  const mesh = (u) => pack(mix(mix([160, 166, 180], pal.shadow, 0.35), pal.mid, 0.5 * u))
  // mesh panel between front and back, fading with distance
  for (let i = 0; i <= g.skew * 2; i++) {
    const u = i / (g.skew * 2)
    const [x, y] = back(u)
    for (let k = 2; k < g.h - 1; k++) if (((k + i) & 3) === 0 || ((k - i + 400) & 3) === 0) b.set(x, y - k, mesh(u))
  }
  // posts: back (faded), middle, front (crisp), each with an insulator cap
  for (const u of [1, 0.5, 0]) {
    const [x, y] = back(u)
    const c = u ? pack(mix(mix([84, 86, 102], pal.shadow, 0.25), pal.mid, 0.45 * u)) : post.b
    b.rect(x, y - g.h, u ? 2 : 3, g.h + 1, c)
    if (!u) { b.rect(x, y - g.h, 1, g.h + 1, post.l); b.rect(x + 2, y - g.h, 1, g.h + 1, post.d) }
    b.rect(x - (u ? 0 : 1), y - g.h - 1, u ? 2 : 4, 2, pack(mix([236, 232, 240], pal.mid, 0.45 * u)))
  }
  // a small warning plate on the front post
  const py = oy - Math.round(g.h * 0.6)
  b.rect(ox - 2, py, 7, 7, INK)
  b.rect(ox - 1, py + 1, 5, 5, HAZ)
  b.rect(ox + 1, py + 2, 1, 2, INK); b.set(ox, py + 3, INK); b.set(ox + 2, py + 4, INK)
  return b
}

// The live wires, animated over the baked fence: they run from the front
// post back to the back post at three heights, the top one glowing, with arcs.
export function drawFenceLive(ctx, x, base, h, depth, t, key) {
  const g = fenceGeometry(h, depth)
  const live = [125, 248, 255]
  const line = (k, color) => {
    ctx.fillStyle = color
    for (let i = 0; i <= g.skew * 2; i++) {
      const u = i / (g.skew * 2)
      ctx.fillRect(x + 1 + Math.round(g.skew * u), base - k - Math.round(g.depth * u), 1, 1)
    }
  }
  line(h, css(live, 0.35))
  line(h - 1, css(live, 0.9 + 0.1 * Math.sin(t * 31 + key)))
  line(Math.round(h * 0.6), css(live, 0.45))
  line(Math.round(h * 0.25), css(live, 0.45))
  // glow around the front post where it can bite
  ctx.fillStyle = css(live, 0.16 + 0.08 * Math.sin(t * 23 + key))
  ctx.fillRect(x - 3, base - h - 3, 9, h + 3)
  ctx.fillStyle = css(live, 0.22)
  ctx.fillRect(x - 5, base - 1, 13, 2)                   // light spilling on the roof
  const seed = Math.floor(t * 20)
  for (let k = 0; k < 2; k++) {
    if (hash(seed, k, Math.round(key * 10)) > 0.5) continue
    const u = hash(seed, k, 4)
    let ax = x + 1 + Math.round(g.skew * u), ay = base - h - Math.round(g.depth * u)
    ctx.fillStyle = k ? css(live) : '#ffffff'
    for (let s = 0; s < 6; s++) { ctx.fillRect(ax, ay, 1, 1); ay += 1 + (hash(seed, k, s) > 0.5 ? 1 : 0); ax += hash(seed, k, s + 9) > 0.5 ? 1 : -1 }
  }
}
