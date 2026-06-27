import * as THREE from 'three'

export class Movement {
  constructor() {
    this._keys = { w: false, a: false, s: false, d: false, e: false }
    this._jumpQueued = false

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

  get wDown() { return this._keys.w }
  get sDown() { return this._keys.s }
  get eDown() { return this._keys.e }

  // True only until clearJump() is called — gives Physics a one-frame signal
  get jumpPressed() { return this._jumpQueued }

  clearJump() { this._jumpQueued = false }

  // Returns a normalised direction vector (zero if no keys held)
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
