import * as THREE from 'three'
import config from './config.js'

class MonotonicRailCurve extends THREE.Curve {
  constructor(points) {
    super()
    this._shape = new THREE.CatmullRomCurve3(points, false, 'centripetal')
    this._startZ = points[0].z
    this._endZ = points.at(-1).z
  }

  getPoint(t, target = new THREE.Vector3()) {
    this._shape.getPoint(t, target)
    target.z = THREE.MathUtils.lerp(this._startZ, this._endZ, t)
    return target
  }
}

export class RailDefinition {
  constructor(points, isCurved = false, isLong = false) {
    this.points = points.map(p => new THREE.Vector3(p.x, p.y, p.z))
    this.isCurved = isCurved
    this.isLong = isLong
    this.spline = isLong
      ? new MonotonicRailCurve(this.points)
      : new THREE.CatmullRomCurve3(this.points, false, 'centripetal')
    this.length = this.spline.getLength()
  }

  getPointAt(t) {
    return this.spline.getPointAt(Math.max(0, Math.min(1, t)))
  }

  getTangentAt(t) {
    return this.spline.getTangentAt(Math.max(0, Math.min(1, t)))
  }
}

export function createRailMeshes(railDef) {
  const group = new THREE.Group()
  group.userData.segmentOwned = true
  const neonColor = railDef.isLong
    ? config.RAIL_COLOR_LONG
    : railDef.isCurved ? config.RAIL_COLOR_CURVED : config.RAIL_COLOR_STRAIGHT
  const segments = Math.max(16, Math.floor(railDef.length * 2))
  const radius = config.RAIL_RADIUS * (railDef.isLong ? 1.25 : 1)
  const railMaterials = []

  // Main rail tube
  const tubeGeo = new THREE.TubeGeometry(railDef.spline, segments, radius, 8, false)
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x888899,
    metalness: 0.8,
    roughness: 0.2,
    emissive: neonColor,
    emissiveIntensity: config.RAIL_EMISSIVE_INTENSITY,
  })
  railMaterials.push(railMat)
  group.add(new THREE.Mesh(tubeGeo, railMat))

  // Grinding strip on top
  const stripGeo = new THREE.TubeGeometry(railDef.spline, segments, radius * 0.45, 4, false)
  const stripMat = new THREE.MeshStandardMaterial({
    color: neonColor,
    metalness: 0.9,
    roughness: 0.1,
    emissive: neonColor,
    emissiveIntensity: config.RAIL_EMISSIVE_INTENSITY * 0.6,
  })
  railMaterials.push(stripMat)
  const stripMesh = new THREE.Mesh(stripGeo, stripMat)
  stripMesh.position.y = radius * 0.3
  group.add(stripMesh)

  // End caps
  const capMat = new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.8, roughness: 0.3 })
  const capGeo = new THREE.SphereGeometry(radius * 1.3, 8, 8)
  const startPos = railDef.spline.getPointAt(0)
  const endPos = railDef.spline.getPointAt(1)
  for (const pos of [startPos, endPos]) {
    const cap = new THREE.Mesh(capGeo, capMat)
    cap.position.copy(pos)
    group.add(cap)
  }

  // Support posts underneath
  const postMat = new THREE.MeshStandardMaterial({ color: 0x555566, metalness: 0.7, roughness: 0.4 })
  const postCount = Math.max(2, Math.floor(railDef.length / 3))
  const postRadius = radius * 0.6
  for (let i = 0; i <= postCount; i++) {
    const t = i / postCount
    const pos = railDef.spline.getPointAt(t)
    const postHeight = 1.0
    const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 6)
    const post = new THREE.Mesh(postGeo, postMat)
    post.position.set(pos.x, pos.y - postHeight / 2, pos.z)
    group.add(post)
  }

  return { group, railDef, railMaterials }
}

export class RailGrinder {
  constructor() {
    this._activeRail = null
    this._t = 0
    this._speed = 0
    this._forward = 1
    this._lastRail = null
  }

  get isGrinding() { return this._activeRail !== null }
  get activeRail() { return this._activeRail }

  tryMount(railData, playerPos, playerVelY, playerVelocity) {
    if (playerVelY > 0) return false
    if (this._activeRail) return false
    if (railData.railDef === this._lastRail) return false

    const { railDef } = railData

    // Find closest t on spline via binary search refinement
    const steps = 20
    let bestT = 0
    let bestDist = Infinity

    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const p = railDef.spline.getPointAt(t)
      const dx = playerPos.x - p.x
      const dz = playerPos.z - p.z
      const dy = playerPos.y - p.y
      const dist = Math.sqrt(dx * dx + dz * dz) + Math.abs(dy)
      if (dist < bestDist) {
        bestDist = dist
        bestT = t
      }
    }

    // Refine with narrower search around best
    const halfStep = 0.5 / steps
    for (let i = 0; i <= 10; i++) {
      const t = Math.max(0, Math.min(1, bestT - halfStep + (halfStep * 2 * i / 10)))
      const p = railDef.spline.getPointAt(t)
      const dx = playerPos.x - p.x
      const dz = playerPos.z - p.z
      const dy = playerPos.y - p.y
      const dist = Math.sqrt(dx * dx + dz * dz) + Math.abs(dy)
      if (dist < bestDist) {
        bestDist = dist
        bestT = t
      }
    }

    const closest = railDef.spline.getPointAt(bestT)
    const hDist = Math.sqrt((playerPos.x - closest.x) ** 2 + (playerPos.z - closest.z) ** 2)
    const yDist = Math.abs(playerPos.y - closest.y)

    if (hDist > config.RAIL_SNAP_RADIUS || yDist > config.RAIL_SNAP_Y_TOLERANCE) return false

    this._activeRail = railDef
    this._lastRail = railDef
    this._t = bestT
    this._speed = 0

    // Determine grind direction from player velocity vs spline tangent
    const tangent = railDef.getTangentAt(bestT)
    if (playerVelocity) {
      const dot = tangent.x * playerVelocity.x + tangent.z * playerVelocity.z
      this._forward = dot >= 0 ? 1 : -1
    } else {
      this._forward = 1
    }

    return true
  }

  update(delta, momentum) {
    if (!this._activeRail) return null

    this._speed = momentum
    const advancement = (this._speed * delta) / this._activeRail.length
    this._t += advancement * this._forward

    if (this._t >= 1 || this._t <= 0) {
      const clampedT = Math.max(0, Math.min(1, this._t))
      const endPos = this._activeRail.getPointAt(clampedT)
      const endTangent = this._activeRail.getTangentAt(Math.max(0.01, Math.min(0.99, this._t))).multiplyScalar(this._forward)
      this._activeRail = null
      return { position: endPos, tangent: endTangent, ended: true }
    }

    const position = this._activeRail.getPointAt(this._t)
    const tangent = this._activeRail.getTangentAt(this._t).multiplyScalar(this._forward)
    return { position, tangent, ended: false }
  }

  dismount() {
    const rail = this._activeRail
    if (!rail) return null
    const t = Math.max(0.01, Math.min(0.99, this._t))
    const tangent = rail.getTangentAt(t).multiplyScalar(this._forward)
    this._activeRail = null
    return tangent
  }

  resetCooldown() {
    this._lastRail = null
    this._cooldown = 0
  }
}
