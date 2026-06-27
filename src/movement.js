import * as THREE from 'three'
import { isMobile } from './mobile.js'

export class Movement {
  constructor(physics) {
    this._keys = { w: false, a: false, s: false, d: false, e: false }
    this._jumpQueued = false
    this._physics = physics
    this._started = !isMobile
    this._touching = false

    if (isMobile) {
      this._setupTouch()
    } else {
      this._setupKeyboard()
    }
  }

  get started() { return this._started }

  start() {
    this._started = true
  }

  resetForDeath() {
    if (!isMobile) return
    this._started = false
    this._keys.w = false
    this._keys.e = false
    this._jumpQueued = false
    this._touching = false
  }

  _setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyW') this._keys.w = true
      if (e.code === 'KeyA') this._keys.a = true
      if (e.code === 'KeyS') this._keys.s = true
      if (e.code === 'KeyD') this._keys.d = true
      if (e.code === 'KeyE') this._keys.e = true
      if (e.code === 'Space') { e.preventDefault(); this._jumpQueued = true }
    })

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyW') this._keys.w = false
      if (e.code === 'KeyA') this._keys.a = false
      if (e.code === 'KeyS') this._keys.s = false
      if (e.code === 'KeyD') this._keys.d = false
      if (e.code === 'KeyE') this._keys.e = false
    })
  }

  _isAirState() {
    const s = this._physics.state
    return s === 'airborne' || s === 'wallrunning'
  }

  _setupTouch() {
    window.addEventListener('touchstart', (e) => {
      if (e.target.closest('#fullscreen-btn, #cam-mode-btn')) return
      e.preventDefault()
      this._touching = true

      if (!this._started) {
        this.start()
        this._keys.w = true
        return
      }

      if (this._isAirState()) {
        if (e.touches.length === 1) {
          this._jumpQueued = true
        } else if (e.touches.length >= 2) {
          this._keys.e = true
        }
      }
    }, { passive: false })

    window.addEventListener('touchend', (e) => {
      if (e.target.closest('#fullscreen-btn, #cam-mode-btn')) return
      e.preventDefault()
      if (e.touches.length > 0) return
      this._touching = false

      if (!this._started) return

      this._keys.e = false
      if (!this._isAirState()) {
        this._jumpQueued = true
      }
    }, { passive: false })

    window.addEventListener('touchcancel', (e) => {
      if (e.touches.length > 0) return
      this._touching = false
      this._keys.e = false
    })
  }

  updateMobileState() {
    if (!isMobile || !this._started) return
    this._keys.w = true
    if (!this._isAirState()) {
      this._keys.e = false
    }
  }

  get wDown() { return this._keys.w }
  get sDown() { return this._keys.s }
  get eDown() { return this._keys.e }

  get jumpPressed() { return this._jumpQueued }

  clearJump() { this._jumpQueued = false }

  getMoveDir(cameraYaw) {
    const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw))
    const right   = new THREE.Vector3( Math.cos(cameraYaw), 0, -Math.sin(cameraYaw))
    const dir = new THREE.Vector3()

    if (this._keys.w) dir.add(forward)
    if (this._keys.s) dir.sub(forward)
    if (this._keys.d) dir.add(right)
    if (this._keys.a) dir.sub(right)

    if (dir.lengthSq() > 0) dir.normalize()
    return dir
  }
}
