import * as THREE from 'three'
import config from './config.js'
import { RailDefinition } from './railSystem.js'

export class SurferAbility {
  constructor(scene) {
    this._scene = scene
    this._active = false
    this._group = null
    this._railData = null
    this._points = []
    this._despawnTimer = 0
    this._tipPos = new THREE.Vector3()
    this._riding = false
    this._tubeMesh = null
    this._stripMesh = null
    this._tubeMat = null
    this._stripMat = null
  }

  get active() { return this._active }
  get railData() { return this._railData }
  get tipPos() { return this._tipPos }
  get totalLength() { return this._railData ? this._railData.railDef.length : 0 }

  getPointAt(t) {
    if (!this._railData) return this._tipPos.clone()
    return this._railData.railDef.getPointAt(t)
  }

  activate(playerPos, cameraYaw, cameraPitch) {
    if (this._active) return
    this._cleanup()
    this._active = true
    this._despawnTimer = 0

    this._tipPos.copy(playerPos)
    this._tipPos.y -= 0.3
    this._points = [this._tipPos.clone()]

    this._group = new THREE.Group()
    this._tubeMat = new THREE.MeshStandardMaterial({
      color: 0xccccdd, metalness: 0.8, roughness: 0.2,
      emissive: new THREE.Color(0xccddff), emissiveIntensity: 0.8,
    })
    this._stripMat = new THREE.MeshStandardMaterial({
      color: 0xccddff, metalness: 0.9, roughness: 0.1,
      emissive: new THREE.Color(0xccddff), emissiveIntensity: 0.5,
    })
    this._scene.add(this._group)

    // Extend initial tip forward
    this._extend(cameraYaw, cameraPitch, config.SURFER_RAIL_LENGTH)
  }

  _extend(cameraYaw, cameraPitch, dist) {
    const clampedPitch = Math.max(-0.4, Math.min(0.4, cameraPitch))
    const dir = new THREE.Vector3(
      -Math.sin(cameraYaw) * Math.cos(clampedPitch),
      Math.sin(clampedPitch),
      -Math.cos(cameraYaw) * Math.cos(clampedPitch)
    )

    const newTip = this._tipPos.clone().addScaledVector(dir, dist)
    this._tipPos.copy(newTip)
    this._points.push(newTip.clone())
    this._buildSurface(this._points)
  }

  _buildSurface(pts) {
    if (this._tubeMesh) {
      this._group.remove(this._tubeMesh)
      this._tubeMesh.geometry.dispose()
    }
    if (this._stripMesh) {
      this._group.remove(this._stripMesh)
      this._stripMesh.geometry.dispose()
    }

    const spline = new THREE.CatmullRomCurve3(pts)
    const segments = Math.max(12, this._points.length * 4)
    const boardWidth = 1.2
    const boardThickness = 0.06

    // Build flat ribbon geometry along spline
    const positions = []
    const normals = []
    const indices = []
    const up = new THREE.Vector3(0, 1, 0)

    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const pt = spline.getPointAt(t)
      const tan = spline.getTangentAt(t)
      const right = new THREE.Vector3().crossVectors(tan, up).normalize().multiplyScalar(boardWidth / 2)

      // Top face vertices
      positions.push(pt.x - right.x, pt.y + boardThickness, pt.z - right.z)
      positions.push(pt.x + right.x, pt.y + boardThickness, pt.z + right.z)
      normals.push(0, 1, 0, 0, 1, 0)

      if (i < segments) {
        const base = i * 2
        indices.push(base, base + 2, base + 1)
        indices.push(base + 1, base + 2, base + 3)
      }
    }

    // Bottom face
    const topVerts = (segments + 1) * 2
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const pt = spline.getPointAt(t)
      const tan = spline.getTangentAt(t)
      const right = new THREE.Vector3().crossVectors(tan, up).normalize().multiplyScalar(boardWidth / 2)

      positions.push(pt.x - right.x, pt.y, pt.z - right.z)
      positions.push(pt.x + right.x, pt.y, pt.z + right.z)
      normals.push(0, -1, 0, 0, -1, 0)

      if (i < segments) {
        const base = topVerts + i * 2
        indices.push(base, base + 1, base + 2)
        indices.push(base + 1, base + 3, base + 2)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geo.setIndex(indices)

    this._tubeMesh = new THREE.Mesh(geo, this._tubeMat)
    this._group.add(this._tubeMesh)

    // Glowing edge strip — thin tube along center
    const stripGeo = new THREE.TubeGeometry(spline, segments, 0.03, 4, false)
    this._stripMesh = new THREE.Mesh(stripGeo, this._stripMat)
    this._stripMesh.position.y = boardThickness + 0.01
    this._group.add(this._stripMesh)

    const railDef = new RailDefinition(
      pts.map(p => ({ x: p.x, y: p.y, z: p.z })),
      false
    )
    this._railData = { group: this._group, railDef, railMaterials: [this._tubeMat, this._stripMat] }
  }

  grow(cameraYaw, cameraPitch, speed, delta) {
    if (!this._active) return
    const growDist = speed * delta
    if (growDist < 0.01) return

    const clampedPitch = Math.max(-0.4, Math.min(0.4, cameraPitch))
    const dir = new THREE.Vector3(
      -Math.sin(cameraYaw) * Math.cos(clampedPitch),
      Math.sin(clampedPitch),
      -Math.cos(cameraYaw) * Math.cos(clampedPitch)
    )
    this._tipPos.addScaledVector(dir, growDist)

    // Anchor new control point every 1.5 units, keep tip as live end
    const anchorPt = this._points[this._points.length - 1]
    if (this._tipPos.distanceTo(anchorPt) >= 1.5) {
      this._points.push(this._tipPos.clone())
    }

    // Always rebuild with tip as final point for smooth extension
    this._rebuildWithTip()
  }

  _rebuildWithTip() {
    const renderPoints = [...this._points]
    const lastAnch = renderPoints[renderPoints.length - 1]
    if (this._tipPos.distanceTo(lastAnch) > 0.05) {
      renderPoints.push(this._tipPos.clone())
    }
    if (renderPoints.length < 2) return
    this._buildSurface(renderPoints)
  }

  deactivate() {
    if (!this._active) return
    this._active = false
    this._despawnTimer = config.SURFER_DESPAWN_DELAY
  }

  update(delta) {
    if (this._despawnTimer > 0) {
      this._despawnTimer -= delta
      if (this._despawnTimer <= 0) {
        this._cleanup()
      }
    }
  }

  _cleanup() {
    if (this._group) {
      this._scene.remove(this._group)
      this._group.traverse(child => {
        if (child.geometry) child.geometry.dispose()
      })
      if (this._tubeMat) this._tubeMat.dispose()
      if (this._stripMat) this._stripMat.dispose()
      this._group = null
      this._tubeMesh = null
      this._stripMesh = null
    }
    this._railData = null
    this._points = []
    this._despawnTimer = 0
  }

  reset() {
    this._active = false
    this._riding = false
    this._cleanup()
  }
}
