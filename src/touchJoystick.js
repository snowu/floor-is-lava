const IGNORE = '#fullscreen-btn, #cam-mode-btn'

export class TouchJoystick {
  constructor({ radius = 50 } = {}) {
    this._radius = radius
    this._knobRadius = radius * 0.4
    this._active = false
    this._touchId = null
    this._centerX = 0
    this._centerY = 0
    this._dx = 0
    this._dy = 0

    this._el = document.createElement('div')
    this._el.id = 'joystick-left'
    this._el.style.cssText = `
      display: none; position: fixed;
      width: ${radius * 2}px; height: ${radius * 2}px;
      border-radius: 50%; border: 2px solid rgba(255,255,255,0.25);
      background: rgba(255,255,255,0.12); z-index: 90;
      touch-action: none; user-select: none; pointer-events: none;
    `

    this._knob = document.createElement('div')
    this._knob.style.cssText = `
      position: absolute;
      width: ${this._knobRadius * 2}px; height: ${this._knobRadius * 2}px;
      border-radius: 50%; background: rgba(255,255,255,0.4);
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
    `
    this._el.appendChild(this._knob)
    document.body.appendChild(this._el)

    window.addEventListener('touchstart', (e) => this._onStart(e), { passive: true })
    window.addEventListener('touchmove', (e) => this._onMove(e), { passive: false })
    window.addEventListener('touchend', (e) => this._onEnd(e), { passive: true })
    window.addEventListener('touchcancel', (e) => this._onEnd(e), { passive: true })
  }

  get dx() { return this._dx }
  get dy() { return this._dy }
  get active() { return this._active }
  get touchId() { return this._touchId }

  _onStart(e) {
    if (this._touchId !== null) return
    const t = e.changedTouches[0]
    if (t.target.closest(IGNORE)) return
    if (t.clientX > window.innerWidth / 2) return

    this._touchId = t.identifier
    this._active = true
    this._centerX = t.clientX
    this._centerY = t.clientY
    this._dx = 0
    this._dy = 0

    this._el.style.left = (t.clientX - this._radius) + 'px'
    this._el.style.top = (t.clientY - this._radius) + 'px'
    this._el.style.display = 'block'
    this._knob.style.transform = 'translate(-50%, -50%)'
  }

  _onMove(e) {
    if (this._touchId === null) return
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]
      if (t.identifier !== this._touchId) continue

      let rawX = t.clientX - this._centerX
      let rawY = t.clientY - this._centerY
      const dist = Math.sqrt(rawX * rawX + rawY * rawY)
      const maxDist = this._radius - this._knobRadius * 0.5

      if (dist > maxDist) {
        rawX = (rawX / dist) * maxDist
        rawY = (rawY / dist) * maxDist
      }

      this._dx = rawX / maxDist
      this._dy = rawY / maxDist

      const knobX = rawX + this._radius
      const knobY = rawY + this._radius
      this._knob.style.transform = `translate(${knobX - this._knobRadius}px, ${knobY - this._knobRadius}px)`
      return
    }
  }

  _onEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this._touchId) {
        this._touchId = null
        this._active = false
        this._dx = 0
        this._dy = 0
        this._el.style.display = 'none'
        return
      }
    }
  }
}
