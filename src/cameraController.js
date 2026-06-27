import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import config from './config.js'
import { isMobile } from './mobile.js'

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

    if (isMobile) {
      this._setupTouchLook(domElement)
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

  get cameraYaw() { return this._yaw }

  set animator(a) { this._animator = a }

  get _isLocked() { return document.pointerLockElement === this._domElement }

  _setupTouchLook(domElement) {
    this._touchPrevX = new Map()

    domElement.addEventListener('touchstart', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        this._touchPrevX.set(t.identifier, t.clientX)
      }
    }, { passive: true })

    domElement.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        const prevX = this._touchPrevX.get(t.identifier)
        if (prevX === undefined) continue
        const dx = t.clientX - prevX
        this._touchPrevX.set(t.identifier, t.clientX)

        const sensitivity = config.CAMERA_SENSITIVITY * 1.5
        this._yaw -= dx * sensitivity
      }
    }, { passive: true })

    const endTouch = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        this._touchPrevX.delete(e.changedTouches[i].identifier)
      }
    }
    domElement.addEventListener('touchend', endTouch, { passive: true })
    domElement.addEventListener('touchcancel', endTouch, { passive: true })
  }

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
