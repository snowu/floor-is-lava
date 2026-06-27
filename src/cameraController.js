import * as THREE from 'three'
const _targetCenter = new THREE.Vector3()
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import config from './config.js'
import { isMobile } from './mobile.js'
import { TouchJoystick } from './touchJoystick.js'

const DEV_MODES = ['first-person', 'third-person', 'free']
const PROD_MODES = ['first-person']

export class CameraController {
  constructor(camera, domElement, humanoid, scene) {
    this._camera = camera
    this._domElement = domElement
    this._humanoid = humanoid
    this._scene = scene
    this._modes = window.DEV_MODE ? DEV_MODES : PROD_MODES
    this._modeIndex = 0
    this._yaw = 0
    this._pitch = 0
    this._skipWarpEvent = false
    this._animator = null

    // FP hand meshes
    const handMat = new THREE.MeshStandardMaterial({ color: 0x4488ff })
    this._handL = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.12, 4, 8), handMat)
    this._handR = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.12, 4, 8), handMat)
    this._handL.rotation.x = -0.5
    this._handR.rotation.x = -0.5
    this._handBaseL = new THREE.Vector3(-config.FP_HAND_X, config.FP_HAND_Y, config.FP_HAND_Z)
    this._handBaseR = new THREE.Vector3(config.FP_HAND_X, config.FP_HAND_Y, config.FP_HAND_Z)
    this._handL.position.copy(this._handBaseL)
    this._handR.position.copy(this._handBaseR)
    camera.add(this._handL)
    camera.add(this._handR)

    // FP leg meshes (visible during kick)
    const legMat = new THREE.MeshStandardMaterial({ color: 0x4488ff })
    this._fpLegL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.6, 6, 10), legMat)
    this._fpLegR = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.6, 6, 10), legMat)
    this._fpLegL.rotation.x = Math.PI / 2
    this._fpLegR.rotation.x = Math.PI / 2
    this._fpLegL.position.set(-0.12, -0.7, -0.8)
    this._fpLegR.position.set(0.12, -0.7, -0.8)
    this._fpLegL.visible = false
    this._fpLegR.visible = false
    camera.add(this._fpLegL)
    camera.add(this._fpLegR)

    // FP foot meshes (at end of legs)
    const footMat = new THREE.MeshStandardMaterial({ color: 0x3366cc })
    this._fpFootL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.2), footMat)
    this._fpFootR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.2), footMat)
    this._fpFootL.position.set(-0.12, -0.72, -1.15)
    this._fpFootR.position.set(0.12, -0.72, -1.15)
    this._fpFootL.visible = false
    this._fpFootR.visible = false
    camera.add(this._fpFootL)
    camera.add(this._fpFootR)

    scene.add(camera)

    camera.position.set(0, 3, 5)
    camera.lookAt(0, 1, 0)

    this._orbit = new OrbitControls(camera, domElement)
    this._orbit.enableDamping = true
    this._orbit.enabled = false

    this._joystick = null
    if (isMobile) {
      this._joystick = new TouchJoystick({ side: 'left', radius: 50 })
    } else {
      domElement.addEventListener('mousedown', () => this._requestLock())
      document.addEventListener('mousemove', (e) => this._onMouseMove(e))
      document.addEventListener('pointerlockchange', () => {
        if (this._isLocked) {
          this._skipWarpEvent = true
        }
      })
      window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyF') this._cycleMode()
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code) && this.mode !== 'free') {
          this._requestLock()
        }
      })
    }
  }

  get mode() { return this._modes[this._modeIndex] }
  get joystick() { return this._joystick }

  get cameraYaw() { return this._yaw }

  resetLook() {
    this._yaw = 0
    this._pitch = 0
    this._aimTarget = null
  }

  updateAutoAim(obstacles) {
    if (!isMobile || this.mode !== 'first-person') return

    const px = this._humanoid.position.x
    const py = this._humanoid.position.y
    const pz = this._humanoid.position.z

    const lookAhead = config.AUTO_AIM_LOOK_AHEAD
    const skip = config.AUTO_AIM_SKIP_PLATFORMS

    // Collect platforms ahead, sorted by distance (closest Z first)
    const ahead = []
    for (const obs of obstacles) {
      if (obs.isSpawn) continue
      obs.aabb.getCenter(_targetCenter)
      const dz = _targetCenter.z - pz
      if (dz > -2 || dz < -lookAhead) continue
      ahead.push({ x: _targetCenter.x, y: _targetCenter.y, z: _targetCenter.z, dz })
    }
    if (ahead.length === 0) return

    ahead.sort((a, b) => b.dz - a.dz) // closest first (dz is negative)

    // Strafe direction from joystick
    const strafeDx = this._joystick && this._joystick.active ? this._joystick.dx : 0
    const strafeDir = Math.abs(strafeDx) > 0.15 ? Math.sign(strafeDx) : 0 // +1 right, -1 left

    let target
    if (strafeDir !== 0 && ahead.length > skip) {
      // Find best platform at least `skip` platforms ahead, biased toward strafe side
      const candidates = ahead.slice(skip)
      let best = null
      let bestScore = -Infinity
      const bias = config.AUTO_AIM_STRAFE_BIAS
      for (const p of candidates) {
        const sideOffset = (p.x - px) * strafeDir // positive = platform is on strafe side
        const closeness = 1.0 / (1.0 + Math.abs(p.dz))
        const score = sideOffset * bias + closeness
        if (score > bestScore) {
          bestScore = score
          best = p
        }
      }
      target = best
    } else {
      // No strafe: aim at platform ~skip ahead (or last available)
      const idx = Math.min(skip, ahead.length - 1)
      target = ahead[idx]
    }

    if (!target) return

    if (!this._aimTarget) {
      this._aimTarget = new THREE.Vector3(target.x, target.y, target.z)
    }

    const shift = Math.sqrt((target.x - this._aimTarget.x) ** 2 + (target.z - this._aimTarget.z) ** 2)
    if (shift > 3) {
      this._aimTarget.set(target.x, target.y, target.z)
    }

    const dx = this._aimTarget.x - px
    const dz = this._aimTarget.z - pz
    const dy = this._aimTarget.y - py
    const hDist = Math.sqrt(dx * dx + dz * dz)

    const targetYaw = Math.atan2(-dx, -dz)
    const targetPitch = -Math.atan2(dy - 1.75, hDist)
    const clampedPitch = Math.max(0, Math.min(Math.PI / 3, targetPitch))

    const dt = 0.016
    const t = 1 - Math.exp(-config.AUTO_AIM_LERP_SPEED * dt)
    let yawDiff = targetYaw - this._yaw
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2
    this._yaw += yawDiff * t
    this._pitch += (clampedPitch - this._pitch) * t
    this._pitch = Math.max(0, Math.min(Math.PI / 3, this._pitch))
  }

  set animator(a) { this._animator = a }

  get _isLocked() { return document.pointerLockElement === this._domElement }

  _requestLock() {
    if (this.mode !== 'free') this._domElement.requestPointerLock()
  }

  cycleMode() { return this._cycleMode() }

  _cycleMode() {
    this._modeIndex = (this._modeIndex + 1) % this._modes.length
    this._yaw = 0
    this._pitch = 0
    if (this.mode === 'free') {
      document.exitPointerLock()
      this._orbit.enabled = true
      this._camera.position.set(
        this._humanoid.position.x + config.FREE_CAM_DISTANCE,
        this._humanoid.position.y + config.FREE_CAM_HEIGHT,
        this._humanoid.position.z + config.FREE_CAM_DISTANCE
      )
      this._orbit.target.set(
        this._humanoid.position.x,
        this._humanoid.position.y,
        this._humanoid.position.z
      )
      this._orbit.update()
      this._savedFog = this._scene.fog
      this._scene.fog = null
    } else {
      this._orbit.enabled = false
      this._requestLock()
      if (this._savedFog) {
        this._scene.fog = this._savedFog
        this._savedFog = null
      }
    }
  }

  _onMouseMove(e) {
    if (this.mode === 'free') return

    const sensitivity = config.CAMERA_SENSITIVITY

    if (this._isLocked) {
      if (this._skipWarpEvent) { this._skipWarpEvent = false; return }
      this._yaw -= e.movementX * sensitivity
      this._pitch -= e.movementY * sensitivity
    }

    this._pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this._pitch))
  }

  update() {
    const h = this._humanoid

    if (this.mode === 'first-person') {
      const a = this._animator
      const eyeY = h.position.y + 1.75 + (a ? a.cameraYOffset : 0)
      this._camera.position.set(h.position.x, eyeY, h.position.z)
      this._camera.rotation.order = 'YXZ'
      this._camera.rotation.set(this._pitch, this._yaw, 0)
      h.rotation.y = this._yaw

      // Animate FP hands
      this._handL.visible = true
      this._handR.visible = true
      if (a) {
        this._handL.position.set(
          -config.FP_HAND_X + a.cameraHandLX,
          config.FP_HAND_Y + a.cameraHandLY,
          config.FP_HAND_Z
        )
        this._handR.position.set(
          config.FP_HAND_X + a.cameraHandRX,
          config.FP_HAND_Y + a.cameraHandRY,
          config.FP_HAND_Z
        )
      }

      // FP legs visible during kick
      const showLegs = a ? a.legsVisible : false
      this._fpLegL.visible = showLegs
      this._fpLegR.visible = showLegs
      this._fpFootL.visible = showLegs
      this._fpFootR.visible = showLegs

    } else {
      this._handL.visible = false
      this._handR.visible = false
      this._fpLegL.visible = false
      this._fpLegR.visible = false
      this._fpFootL.visible = false
      this._fpFootR.visible = false

      if (this.mode === 'third-person') {
        this._camera.up.set(0, 1, 0)
        this._camera.position.set(
          h.position.x + config.TP_CAM_DISTANCE * Math.sin(this._yaw),
          h.position.y + config.TP_CAM_HEIGHT,
          h.position.z + config.TP_CAM_DISTANCE * Math.cos(this._yaw)
        )
        this._camera.lookAt(h.position.x, h.position.y + 1, h.position.z)
      } else {
        this._orbit.update()
      }
    }
  }
}
