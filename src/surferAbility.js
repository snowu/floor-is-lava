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
    this._rebuildMesh()
  }

  _rebuildMesh() {
    if (this._tubeMesh) {
      this._group.remove(this._tubeMesh)
      this._tubeMesh.geometry.dispose()
      this._group.remove(this._stripMesh)
      this._stripMesh.geometry.dispose()
    }

    const spline = new THREE.CatmullRomCurve3(this._points)
    const segments = Math.max(8, this._points.length * 6)
    const r = config.RAIL_RADIUS

    const tubeGeo = new THREE.TubeGeometry(spline, segments, r, 8, false)
    this._tubeMesh = new THREE.Mesh(tubeGeo, this._tubeMat)
    this._group.add(this._tubeMesh)

    const stripGeo = new THREE.TubeGeometry(spline, segments, r * 0.45, 4, false)
    this._stripMesh = new THREE.Mesh(stripGeo, this._stripMat)
    this._stripMesh.position.y = r * 0.3
    this._group.add(this._stripMesh)

    const railDef = new RailDefinition(
      this._points.map(p => ({ x: p.x, y: p.y, z: p.z })),
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
    if (this._tubeMesh) {
      this._group.remove(this._tubeMesh)
      this._tubeMesh.geometry.dispose()
      this._group.remove(this._stripMesh)
      this._stripMesh.geometry.dispose()
    }

    const renderPoints = [...this._points]
    const lastAnch = renderPoints[renderPoints.length - 1]
    if (this._tipPos.distanceTo(lastAnch) > 0.05) {
      renderPoints.push(this._tipPos.clone())
    }
    if (renderPoints.length < 2) return

    const spline = new THREE.CatmullRomCurve3(renderPoints)
    const segments = Math.max(12, renderPoints.length * 4)
    const r = config.RAIL_RADIUS

    const tubeGeo = new THREE.TubeGeometry(spline, segments, r, 8, false)
    this._tubeMesh = new THREE.Mesh(tubeGeo, this._tubeMat)
    this._group.add(this._tubeMesh)

    const stripGeo = new THREE.TubeGeometry(spline, segments, r * 0.45, 4, false)
    this._stripMesh = new THREE.Mesh(stripGeo, this._stripMat)
    this._stripMesh.position.y = r * 0.3
    this._group.add(this._stripMesh)

    const railDef = new RailDefinition(
      renderPoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
      false
    )
    this._railData = { group: this._group, railDef, railMaterials: [this._tubeMat, this._stripMat] }
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
    this._cleanup()
  }
}
