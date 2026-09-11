import * as THREE from 'three'
import { isMobile } from './mobile.js'

export class Movement {
  constructor(physics, joystick) {
    this._keys = { w: false, a: false, s: false, d: false, e: false }
    this._jumpQueued = false
    this._slideQueued = false
    this._physics = physics
    this._joystick = joystick || null
    this._started = !isMobile
    this._touching = false
    this._rightTouchStart = null

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
    this._clearKeys()
    this._rightTouchStart = null
    if (!isMobile) return
    this._started = false
    this._touching = false
  }

  _clearKeys() {
    for (const key of Object.keys(this._keys)) this._keys[key] = false
    this._jumpQueued = false
    this._slideQueued = false
  }

  _setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyW') this._keys.w = true
      if (e.code === 'KeyA') this._keys.a = true
      if (e.code === 'KeyS') this._keys.s = true
      if (e.code === 'KeyD') this._keys.d = true
      if (e.code === 'KeyE') this._keys.e = true
      if (e.code === 'Space') { e.preventDefault(); this._jumpQueued = true }
      if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].includes(e.code) && !e.repeat) {
        e.preventDefault()
        this._slideQueued = true
      }
    })

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyW') this._keys.w = false
      if (e.code === 'KeyA') this._keys.a = false
      if (e.code === 'KeyS') this._keys.s = false
      if (e.code === 'KeyD') this._keys.d = false
      if (e.code === 'KeyE') this._keys.e = false
    })
    window.addEventListener('blur', () => this._clearKeys())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._clearKeys()
    })
  }

  _isAirState() {
    const s = this._physics.state
    return s === 'airborne' || s === 'wallrunning'
  }

  _rightSideTouches(touches) {
    const half = window.innerWidth / 2
    let count = 0
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].clientX > half) count++
    }
    return count
  }

  _setupTouch() {
    window.addEventListener('touchstart', (e) => {
      if (e.target.closest('#fullscreen-btn, #cam-mode-btn, #help-btn, #help-modal')) return
      const isLeftSide = e.changedTouches[0].clientX <= window.innerWidth / 2
      if (isLeftSide) return
      e.preventDefault()
      this._touching = true
      this._rightTouchStart = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
      }

      if (!this._started) {
        this.start()
        this._keys.w = true
        return
      }

      if (this._isAirState()) {
        const rt = this._rightSideTouches(e.touches)
        if (rt === 1) {
          this._jumpQueued = true
        } else if (rt >= 2) {
          this._jumpQueued = false
          this._keys.e = true
        }
      }
    }, { passive: false })

    window.addEventListener('touchend', (e) => {
      if (e.target.closest('#fullscreen-btn, #cam-mode-btn, #help-btn, #help-modal')) return
      const isLeftSide = e.changedTouches[0].clientX <= window.innerWidth / 2
      const startedOnRight = this._rightTouchStart?.x > window.innerWidth / 2
      if (isLeftSide && !startedOnRight) return
      e.preventDefault()
      if (this._rightSideTouches(e.touches) > 0) return
      this._touching = false

      if (!this._started) return

      this._keys.e = false
      if (!this._isAirState()) {
        const touch = e.changedTouches[0]
        const swipedDown = this._rightTouchStart && touch.clientY - this._rightTouchStart.y > 50
        if (swipedDown) this._slideQueued = true
        else this._jumpQueued = true
      }
      this._rightTouchStart = null
    }, { passive: false })

    window.addEventListener('touchcancel', (e) => {
      if (e.touches.length > 0) return
      this._touching = false
      this._keys.e = false
      this._rightTouchStart = null
    })
  }

  updateMobileState() {
    if (!isMobile || !this._started) return
    this._keys.w = true
    if (!this._isAirState()) {
      this._keys.e = false
    }
    if (this._joystick && this._joystick.active) {
      const dx = this._joystick.dx
      this._keys.a = dx < -0.15
      this._keys.d = dx > 0.15
    } else {
      this._keys.a = false
      this._keys.d = false
    }
  }

  get wDown() { return this._keys.w }
  get sDown() { return this._keys.s }
  get eDown() { return this._keys.e }

  get jumpPressed() { return this._jumpQueued }
  get slidePressed() { return this._slideQueued }

  clearJump() { this._jumpQueued = false }
  clearSlide() { this._slideQueued = false }

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
