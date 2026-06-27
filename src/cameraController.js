import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const DEV_MODES = ['first-person', 'third-person', 'free']
const PROD_MODES = ['first-person']

const FREE_CAM_HEIGHT = 80
const FREE_CAM_DISTANCE = 10

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
    this._handBaseL = new THREE.Vector3(-0.3, -0.35, -0.45)
    this._handBaseR = new THREE.Vector3(0.3, -0.35, -0.45)
    this._handL.position.copy(this._handBaseL)
    this._handR.position.copy(this._handBaseR)
    camera.add(this._handL)
    camera.add(this._handR)
    scene.add(camera)

    camera.position.set(0, 3, 5)
    camera.lookAt(0, 1, 0)

    this._orbit = new OrbitControls(camera, domElement)
    this._orbit.enableDamping = true
    this._orbit.enabled = false

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

  get mode() { return this._modes[this._modeIndex] }

  get cameraYaw() { return this._yaw }

  set animator(a) { this._animator = a }

  get _isLocked() { return document.pointerLockElement === this._domElement }

  _requestLock() {
    if (this.mode !== 'free') this._domElement.requestPointerLock()
  }

  _cycleMode() {
    this._modeIndex = (this._modeIndex + 1) % this._modes.length
    this._yaw = 0
    this._pitch = 0
    if (this.mode === 'free') {
      document.exitPointerLock()
      this._orbit.enabled = true
      this._camera.position.set(
        this._humanoid.position.x + FREE_CAM_DISTANCE,
        this._humanoid.position.y + FREE_CAM_HEIGHT,
        this._humanoid.position.z + FREE_CAM_DISTANCE
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

    const sensitivity = 0.002

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
          this._handBaseL.x + a.cameraHandLX,
          this._handBaseL.y + a.cameraHandLY,
          this._handBaseL.z
        )
        this._handR.position.set(
          this._handBaseR.x + a.cameraHandRX,
          this._handBaseR.y + a.cameraHandRY,
          this._handBaseR.z
        )
      }

    } else if (this.mode === 'third-person') {
      this._handL.visible = false
      this._handR.visible = false
      this._camera.up.set(0, 1, 0)
      this._camera.position.set(
        h.position.x + 5 * Math.sin(this._yaw),
        h.position.y + 3,
        h.position.z + 5 * Math.cos(this._yaw)
      )
      this._camera.lookAt(h.position.x, h.position.y + 1, h.position.z)

    } else {
      this._handL.visible = false
      this._handR.visible = false
      this._orbit.update()
    }
  }
}
