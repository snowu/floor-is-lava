import * as THREE from 'three'

// ── tunables ──────────────────────────────────────────────────────────────────
const GRAVITY        = 20    // m/s² downward acceleration
const JUMP_SPEED     = 8     // m/s initial upward velocity on jump
const MOVE_SPEED     = 10    // m/s horizontal speed
const GROUND_Y       = 0     // y of the ground plane (death plane)
let SPAWN_POS        = { x: 0, y: 1, z: -3 }
const PLAYER_WIDTH   = 0.4   // AABB width and depth for collision
const PLAYER_HEIGHT  = 2.0   // AABB height (feet to top of head)
const HAND_OFFSET_Y  = 1.5   // y above feet where hands are (for ledge detection)
const LEDGE_REACH    = 0.4   // max distance below box top where hands can grab
const LEDGE_H_MARGIN = 0.3   // horizontal margin outside box footprint still counts
const COYOTE_TIME    = 0.12  // seconds after walking off edge where jump still works
const MAX_AIR_JUMPS  = 1     // extra jumps allowed while airborne (double jump)
// ─────────────────────────────────────────────────────────────────────────────

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
  }

  update(humanoid, moveDir, wDown, jumpPressed, delta, obstacles) {
    // Snapshot hanging state before any transitions this frame.
    // This prevents grab (step 7) and pull-up (step 8) firing in the same frame
    // when W is held: the player grabs on frame N, pulls up on frame N+1.
    const wasHanging = this._state === STATE.HANGING

    // Tracks whether the ground plane or a box top supported the player this frame.
    // Reset each frame; set in steps 5 and 6. If GROUNDED at end of frame but never
    // set, the player walked off a box edge and must fall.
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

    // 4. Integrate position
    humanoid.position.addScaledVector(this.velocity, delta)

    // 5. Death plane — touching ground = respawn
    if (humanoid.position.y <= GROUND_Y) {
      this._respawn(humanoid)
      supportedThisFrame = true
    }

    // 6. AABB collision vs each obstacle.
    // Skipped when hanging: the player's body overlaps the box edge intentionally
    // and AABB resolution would push them off the ledge.
    if (this._state !== STATE.HANGING) {
      for (const { aabb } of obstacles) {
        if (this._resolveAABB(humanoid, aabb)) supportedThisFrame = true
      }
    }

    // If GROUNDED but nothing supported the player this frame, they walked off an edge.
    // Start coyote timer so they can still jump for a short window.
    if (this._state === STATE.GROUNDED && !supportedThisFrame) {
      this._state = STATE.AIRBORNE
      this._coyoteTimer = COYOTE_TIME
    }

    // Reset air jumps when grounded
    if (this._state === STATE.GROUNDED) {
      this._airJumpsLeft = MAX_AIR_JUMPS
    }

    // 7. Ledge grab — only when airborne with W held
    if (this._state === STATE.AIRBORNE && wDown) {
      this._checkLedgeGrab(humanoid, obstacles)
    }

    // 8. Pull up — only if we were ALREADY hanging at the start of this frame.
    // Using wasHanging prevents an immediate grab+pullup in the same frame.
    if (wasHanging && (jumpPressed || wDown)) {
      this._pullUp(humanoid)
    }
  }

  // Returns true if the player landed on top of this box (caller uses this to set supportedThisFrame).
  _resolveAABB(humanoid, aabb) {
    const hw = PLAYER_WIDTH / 2
    const px = humanoid.position.x
    const py = humanoid.position.y
    const pz = humanoid.position.z

    const pMinX = px - hw;  const pMaxX = px + hw
    const pMinY = py;       const pMaxY = py + PLAYER_HEIGHT
    const pMinZ = pz - hw;  const pMaxZ = pz + hw

    // Early-out if no intersection
    if (pMaxX <= aabb.min.x || pMinX >= aabb.max.x ||
        pMaxY <= aabb.min.y || pMinY >= aabb.max.y ||
        pMaxZ <= aabb.min.z || pMinZ >= aabb.max.z) return false

    // Overlap on each axis
    const ox = Math.min(pMaxX - aabb.min.x, aabb.max.x - pMinX)

    // Y: track which side is shallower
    const oyUp   = aabb.max.y - pMinY   // box top above player feet  → push up
    const oyDown = pMaxY - aabb.min.y   // player head above box floor → push down
    const oy = Math.min(oyUp, oyDown)

    const oz = Math.min(pMaxZ - aabb.min.z, aabb.max.z - pMinZ)

    // Push out on the axis of minimum penetration
    if (ox <= oy && ox <= oz) {
      const sign = px < (aabb.min.x + aabb.max.x) / 2 ? -1 : 1
      humanoid.position.x += sign * ox

    } else if (oy <= ox && oy <= oz) {
      if (oyUp <= oyDown) {
        // Feet just below box top — push up, land on top
        humanoid.position.y += oyUp
        this.velocity.y = 0
        this._state = STATE.GROUNDED
        return true
      } else {
        // Head just above box floor — push down (head bump)
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

      // Hands within reach below the box's top face
      if (handsY < topY - LEDGE_REACH || handsY > topY) continue

      // Horizontal centre within box footprint + margin
      if (px < aabb.min.x - LEDGE_H_MARGIN || px > aabb.max.x + LEDGE_H_MARGIN) continue
      if (pz < aabb.min.z - LEDGE_H_MARGIN || pz > aabb.max.z + LEDGE_H_MARGIN) continue

      this._state    = STATE.HANGING
      this._hangTopY = topY
      this.velocity.set(0, 0, 0)
      return
    }
  }

  _pullUp(humanoid) {
    humanoid.position.y = this._hangTopY
    this.velocity.set(0, 0, 0)
    this._state = STATE.GROUNDED
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
