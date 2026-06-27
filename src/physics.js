import * as THREE from 'three'
import {
  GRAVITY, JUMP_SPEED, MOVE_SPEED, GROUND_Y, SPAWN_POS,
  PLAYER_WIDTH, PLAYER_HEIGHT, HAND_OFFSET_Y, LEDGE_REACH, LEDGE_H_MARGIN,
  COYOTE_TIME, MAX_AIR_JUMPS,
} from './config.js'

const STATE = {
  GROUNDED: 'grounded',
  AIRBORNE: 'airborne',
  HANGING:  'hanging',
}

export class Physics {
  constructor() {
    this.velocity = new THREE.Vector3()
    this._state   = STATE.GROUNDED
    this._hangTopY = 0
    this._coyoteTimer = 0
    this._airJumpsLeft = MAX_AIR_JUMPS

    this.onLand = null
    this.onGrab = null
    this.onPullUp = null
    this.onDoubleJump = null
  }

  get state() { return this._state }

  get horizontalSpeed() {
    return Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2)
  }

  update(humanoid, moveDir, wDown, sDown, jumpPressed, delta, obstacles, wallAABBs = []) {
    // Snapshot hanging state before any transitions this frame.
    // Prevents grab and pull-up firing in the same frame when W is held.
    const wasHanging = this._state === STATE.HANGING

    // Reset each frame; set in ground/collision steps. If GROUNDED at end
    // of frame but never set, the player walked off a box edge and must fall.
    let supportedThisFrame = false

    // 1. Jump — grounded, coyote time, or air jump
    if (jumpPressed) {
      if (this._state === STATE.GROUNDED || this._coyoteTimer > 0) {
        this.velocity.y = JUMP_SPEED
        this._state = STATE.AIRBORNE
        this._coyoteTimer = 0
        this._airJumpsLeft = MAX_AIR_JUMPS
      } else if (this._state === STATE.AIRBORNE && this._airJumpsLeft > 0) {
        this.velocity.y = JUMP_SPEED
        this._airJumpsLeft--
        if (this.onDoubleJump) this.onDoubleJump()
      }
    }

    // 2. Gravity — only while airborne
    if (this._state === STATE.AIRBORNE) {
      this.velocity.y -= GRAVITY * delta
      if (this._coyoteTimer > 0) this._coyoteTimer -= delta
    }

    // 3. Horizontal velocity from input
    if (this._state === STATE.HANGING) {
      this.velocity.set(0, 0, 0)
    } else {
      this.velocity.x = moveDir.x * MOVE_SPEED
      this.velocity.z = moveDir.z * MOVE_SPEED
    }

    // 4. Sub-stepped integration + collision to prevent tunneling at high speeds
    const speed = this.velocity.length()
    const maxStep = PLAYER_WIDTH * 0.4
    const subSteps = speed * delta > maxStep ? Math.ceil(speed * delta / maxStep) : 1
    const subDelta = delta / subSteps

    for (let s = 0; s < subSteps; s++) {
      humanoid.position.addScaledVector(this.velocity, subDelta)

      // Ground plane
      if (humanoid.position.y <= GROUND_Y) {
        humanoid.position.y = GROUND_Y
        this.velocity.y = 0
        if (this._state !== STATE.GROUNDED) {
          this._state = STATE.GROUNDED
          if (this.onLand) this.onLand()
        }
        supportedThisFrame = true
      }

      // AABB collision vs obstacles
      if (this._state !== STATE.HANGING) {
        for (const { aabb } of obstacles) {
          if (this._resolveAABB(humanoid, aabb)) supportedThisFrame = true
        }
      }

      // Wall collision
      for (const aabb of wallAABBs) {
        this._resolveAABB(humanoid, aabb)
      }
    }

    // Walked off an edge — start coyote timer
    if (this._state === STATE.GROUNDED && !supportedThisFrame) {
      this._state = STATE.AIRBORNE
      this._coyoteTimer = COYOTE_TIME
    }

    // Reset air jumps when grounded
    if (this._state === STATE.GROUNDED) {
      this._airJumpsLeft = MAX_AIR_JUMPS
    }

    // 7. Ledge grab — auto-grab when falling past a ledge
    if (this._state === STATE.AIRBORNE && this.velocity.y <= 0) {
      this._checkLedgeGrab(humanoid, obstacles)
    }

    // 8. Hanging actions — pull up (W/jump) or drop (S)
    if (wasHanging) {
      if (jumpPressed || wDown) {
        this._pullUp(humanoid)
      } else if (sDown) {
        this._state = STATE.AIRBORNE
        this.velocity.set(0, 0, 0)
      }
    }
  }

  _resolveAABB(humanoid, aabb) {
    const hw = PLAYER_WIDTH / 2
    const px = humanoid.position.x
    const py = humanoid.position.y
    const pz = humanoid.position.z

    const pMinX = px - hw;  const pMaxX = px + hw
    const pMinY = py;       const pMaxY = py + PLAYER_HEIGHT
    const pMinZ = pz - hw;  const pMaxZ = pz + hw

    if (pMaxX <= aabb.min.x || pMinX >= aabb.max.x ||
        pMaxY <= aabb.min.y || pMinY >= aabb.max.y ||
        pMaxZ <= aabb.min.z || pMinZ >= aabb.max.z) return false

    const ox = Math.min(pMaxX - aabb.min.x, aabb.max.x - pMinX)
    const oyUp   = aabb.max.y - pMinY
    const oyDown = pMaxY - aabb.min.y
    const oy = Math.min(oyUp, oyDown)
    const oz = Math.min(pMaxZ - aabb.min.z, aabb.max.z - pMinZ)

    // Push out on axis of minimum penetration
    if (ox <= oy && ox <= oz) {
      const sign = px < (aabb.min.x + aabb.max.x) / 2 ? -1 : 1
      humanoid.position.x += sign * ox
    } else if (oy <= ox && oy <= oz) {
      if (oyUp <= oyDown) {
        // Feet just below box top — push up, land on top
        humanoid.position.y += oyUp
        this.velocity.y = 0
        if (this._state !== STATE.GROUNDED) {
          this._state = STATE.GROUNDED
          if (this.onLand) this.onLand()
        }
        return true
      } else {
        // Head bump — push down
        humanoid.position.y -= oyDown
        if (this.velocity.y > 0) this.velocity.y = 0
      }
    } else {
      const sign = pz < (aabb.min.z + aabb.max.z) / 2 ? -1 : 1
      humanoid.position.z += sign * oz
    }

    return false
  }

  _checkLedgeGrab(humanoid, obstacles) {
    const handsY = humanoid.position.y + HAND_OFFSET_Y
    const px     = humanoid.position.x
    const pz     = humanoid.position.z

    for (const { aabb } of obstacles) {
      const topY = aabb.max.y

      // Hands must be within grab range of the box top
      if (handsY < topY - LEDGE_REACH || handsY > topY) continue

      // Must be near the box horizontally
      if (px < aabb.min.x - LEDGE_H_MARGIN || px > aabb.max.x + LEDGE_H_MARGIN) continue
      if (pz < aabb.min.z - LEDGE_H_MARGIN || pz > aabb.max.z + LEDGE_H_MARGIN) continue

      // Snap hands to ledge height
      humanoid.position.y = topY - HAND_OFFSET_Y
      this._state    = STATE.HANGING
      this._hangTopY = topY
      this.velocity.set(0, 0, 0)
      if (this.onGrab) this.onGrab()
      return
    }
  }

  _pullUp(humanoid) {
    humanoid.position.y = this._hangTopY
    this.velocity.set(0, 0, 0)
    this._state = STATE.GROUNDED
    if (this.onPullUp) this.onPullUp()
  }

  _respawn(humanoid) {
    humanoid.position.set(SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z)
    this.velocity.set(0, 0, 0)
    this._state = STATE.GROUNDED
    this._coyoteTimer = 0
    this._airJumpsLeft = MAX_AIR_JUMPS
  }

  static spawnPosition() {
    return SPAWN_POS
  }
}
