import * as THREE from 'three'
import config from './config.js'

const STATE = {
  GROUNDED:    'grounded',
  AIRBORNE:    'airborne',
  HANGING:     'hanging',
  WALLRUNNING: 'wallrunning',
}

export class Physics {
  constructor() {
    this.velocity = new THREE.Vector3()
    this._state   = STATE.GROUNDED
    this._hangTopY = 0
    this._coyoteTimer = 0
    this._airJumpsLeft = config.MAX_AIR_JUMPS

    this.onLand = null
    this.onGrab = null
    this.onPullUp = null
    this.onDoubleJump = null
    this.onGroundHit = null
    this.onBoxLand = null
    this.onWallRun = null
    this._landedOnGround = false
    this._wallNormalX = 0
    this._wallKickTimer = 0
    this._speedBoost = 0
    this._moveSpeed = config.MOVE_SPEED_MIN
    this._wallrunEntrySpeed = 0
    this._wallrunGraceTimer = 0
  }

  get state() { return this._state }

  get horizontalSpeed() {
    return Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2)
  }

  update(humanoid, moveDir, wDown, sDown, jumpPressed, delta, obstacles, wallAABBs = []) {
    this._landedOnGround = false

    const wasHanging = this._state === STATE.HANGING

    // Reset each frame; set in ground/collision steps. If GROUNDED at end
    // of frame but never set, the player walked off a box edge and must fall.
    let supportedThisFrame = false

    // 1. Jump — grounded, coyote time, air jump, or wall jump
    if (jumpPressed) {
      if (this._state === STATE.WALLRUNNING) {
        this.velocity.y = config.WALLRUN_JUMP_SPEED
        this.velocity.x = this._wallNormalX * config.WALLRUN_KICK_SPEED
        this._wallKickTimer = config.WALLRUN_KICK_DURATION
        this._state = STATE.AIRBORNE
        this._airJumpsLeft = config.MAX_AIR_JUMPS + 1
      } else if (this._state === STATE.GROUNDED || this._coyoteTimer > 0) {
        this.velocity.y = config.JUMP_SPEED
        this._state = STATE.AIRBORNE
        this._coyoteTimer = 0
        this._airJumpsLeft = config.MAX_AIR_JUMPS
      } else if (this._state === STATE.AIRBORNE && this._airJumpsLeft > 0) {
        this.velocity.y = config.JUMP_SPEED
        this._airJumpsLeft--
        if (this.onDoubleJump) this.onDoubleJump()
      }
    }

    // 2. Gravity
    if (this._state === STATE.GROUNDED) {
      this.velocity.y = -config.GROUND_STICK
    } else if (this._state === STATE.AIRBORNE) {
      this.velocity.y -= config.GRAVITY * delta
      if (this._coyoteTimer > 0) this._coyoteTimer -= delta
    } else if (this._state === STATE.WALLRUNNING) {
      this.velocity.y = -config.WALLRUN_SLIDE_SPEED
      if (sDown) {
        this._state = STATE.AIRBORNE
      }
    }

    // 3. Horizontal velocity from input
    if (this._wallKickTimer > 0) this._wallKickTimer -= delta
    if (this._wallrunGraceTimer > 0) this._wallrunGraceTimer -= delta

    // Sync _moveSpeed to actual horizontal speed so any drop is reflected
    // Skip during wall run — forced velocity.x=0 would artificially reduce it
    if (this._state !== STATE.WALLRUNNING) {
      const currentHSpeed = this.horizontalSpeed
      if (currentHSpeed < this._moveSpeed) {
        this._moveSpeed = Math.max(currentHSpeed, config.MOVE_SPEED_MIN)
      }
    }

    // Ramp move speed while moving (any state), reset when stopped
    const isMoving = moveDir.x !== 0 || moveDir.z !== 0
    if (isMoving) {
      if (this._state === STATE.WALLRUNNING && moveDir.x * this._wallNormalX < 0 && this._wallrunGraceTimer <= 0) {
        this._moveSpeed = config.MOVE_SPEED_MIN
      } else {
        this._moveSpeed = Math.min(this._moveSpeed + config.MOVE_ACCEL * delta, config.MOVE_SPEED_MAX)
      }
    } else {
      this._moveSpeed = config.MOVE_SPEED_MIN
    }

    const boostedSpeed = this._moveSpeed + this._speedBoost

    if (this._state === STATE.HANGING) {
      this.velocity.set(0, 0, 0)
    } else if (this._state === STATE.WALLRUNNING) {
      this.velocity.x = -this._wallNormalX * config.WALLRUN_STICK_SPEED
      this.velocity.z = moveDir.z * boostedSpeed
    } else if (this._wallKickTimer > 0) {
      this.velocity.z = moveDir.z * boostedSpeed
    } else {
      this.velocity.x = moveDir.x * boostedSpeed
      this.velocity.z = moveDir.z * boostedSpeed
    }

    // 4. Sub-stepped integration + collision to prevent tunneling at high speeds
    const speed = this.velocity.length()
    const maxStep = config.PLAYER_WIDTH * 0.4
    const subSteps = speed * delta > maxStep ? Math.ceil(speed * delta / maxStep) : 1
    const subDelta = delta / subSteps

    let touchingWall = false
    for (let s = 0; s < subSteps; s++) {
      humanoid.position.addScaledVector(this.velocity, subDelta)

      // Ground plane
      if (humanoid.position.y <= config.GROUND_Y) {
        humanoid.position.y = config.GROUND_Y
        this.velocity.y = 0
        if (this._state !== STATE.GROUNDED) {
          this._state = STATE.GROUNDED
          this._landedOnGround = true
          this._speedBoost = 0
          if (this.onLand) this.onLand()
          if (this.onGroundHit) this.onGroundHit()
        }
        supportedThisFrame = true
      }

      // AABB collision vs obstacles
      touchingWall = false
      if (this._state !== STATE.HANGING) {
        for (const obs of obstacles) {
          if (obs.isBillboard) {
            if (this._wallKickTimer > 0) continue
            const hitAxis = this._resolveAABBAxis(humanoid, obs.aabb)
            if (hitAxis !== null) {
              touchingWall = true
              this._airJumpsLeft = config.MAX_AIR_JUMPS
            }
            if (hitAxis === 'x' && this._state === STATE.AIRBORNE &&
                humanoid.position.y > config.WALLRUN_MIN_HEIGHT) {
              this._state = STATE.WALLRUNNING
              this._wallNormalX = obs.wallNormalX
              this._wallrunEntrySpeed = this._moveSpeed
              this._wallrunGraceTimer = config.WALLRUN_GRACE_TIME
              this.velocity.y = Math.max(this.velocity.y, 0)
              this._airJumpsLeft = config.MAX_AIR_JUMPS
              if (this.onWallRun) this.onWallRun()
            }
          } else {
            if (this._resolveAABB(humanoid, obs.aabb)) {
              supportedThisFrame = true
              if (!this._landedOnGround && this.onBoxLand) this.onBoxLand(obs)
            }
          }
        }
      }

      // Wall collision
      for (const aabb of wallAABBs) {
        this._resolveAABB(humanoid, aabb)
      }
    }

    // Wall run ends if slid too low or no longer touching wall
    if (this._state === STATE.WALLRUNNING &&
        (humanoid.position.y <= config.WALLRUN_MIN_HEIGHT || !touchingWall)) {
      this._state = STATE.AIRBORNE
    }

    // Walked off an edge — start coyote timer
    if (this._state === STATE.GROUNDED && !supportedThisFrame) {
      this._state = STATE.AIRBORNE
      this._coyoteTimer = config.COYOTE_TIME
    }

    // Reset air jumps when grounded or wall running
    if (this._state === STATE.GROUNDED || this._state === STATE.WALLRUNNING) {
      this._airJumpsLeft = config.MAX_AIR_JUMPS
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
    const hw = config.PLAYER_WIDTH / 2
    const px = humanoid.position.x
    const py = humanoid.position.y
    const pz = humanoid.position.z

    const pMinX = px - hw;  const pMaxX = px + hw
    const pMinY = py;       const pMaxY = py + config.PLAYER_HEIGHT
    const pMinZ = pz - hw;  const pMaxZ = pz + hw

    if (pMaxX <= aabb.min.x || pMinX >= aabb.max.x ||
        pMaxY <= aabb.min.y || pMinY >= aabb.max.y ||
        pMaxZ <= aabb.min.z || pMinZ >= aabb.max.z) return false

    const ox = Math.min(pMaxX - aabb.min.x, aabb.max.x - pMinX)
    const oyUp   = aabb.max.y - pMinY
    const oyDown = pMaxY - aabb.min.y
    const oy = Math.min(oyUp, oyDown)
    const oz = Math.min(pMaxZ - aabb.min.z, aabb.max.z - pMinZ)

    // Bias toward Y when feet barely penetrate box top (thin box fix)
    const feetOnTop = oyUp < oyDown && oyUp < 0.5 && py > (aabb.min.y + aabb.max.y) / 2

    // Push out on axis of minimum penetration
    if (!feetOnTop && ox <= oy && ox <= oz) {
      const sign = px < (aabb.min.x + aabb.max.x) / 2 ? -1 : 1
      humanoid.position.x += sign * ox
    } else if (feetOnTop || (oy <= ox && oy <= oz)) {
      if (oyUp <= oyDown) {
        // Feet just below box top — push up, land on top
        humanoid.position.y += oyUp
        this.velocity.y = 0
        if (this._state !== STATE.GROUNDED) {
          this._state = STATE.GROUNDED
          this._speedBoost = 0
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

  _resolveAABBAxis(humanoid, aabb) {
    const hw = config.PLAYER_WIDTH / 2
    const px = humanoid.position.x
    const py = humanoid.position.y
    const pz = humanoid.position.z

    const pMinX = px - hw;  const pMaxX = px + hw
    const pMinY = py;       const pMaxY = py + config.PLAYER_HEIGHT
    const pMinZ = pz - hw;  const pMaxZ = pz + hw

    if (pMaxX <= aabb.min.x || pMinX >= aabb.max.x ||
        pMaxY <= aabb.min.y || pMinY >= aabb.max.y ||
        pMaxZ <= aabb.min.z || pMinZ >= aabb.max.z) return null

    const ox = Math.min(pMaxX - aabb.min.x, aabb.max.x - pMinX)
    const oyUp   = aabb.max.y - pMinY
    const oyDown = pMaxY - aabb.min.y
    const oy = Math.min(oyUp, oyDown)
    const oz = Math.min(pMaxZ - aabb.min.z, aabb.max.z - pMinZ)

    if (ox <= oy && ox <= oz) {
      const sign = px < (aabb.min.x + aabb.max.x) / 2 ? -1 : 1
      humanoid.position.x += sign * ox
      return 'x'
    } else if (oy <= ox && oy <= oz) {
      if (oyUp <= oyDown) {
        humanoid.position.y += oyUp
        this.velocity.y = 0
        return 'y'
      } else {
        humanoid.position.y -= oyDown
        if (this.velocity.y > 0) this.velocity.y = 0
        return 'y'
      }
    } else {
      const sign = pz < (aabb.min.z + aabb.max.z) / 2 ? -1 : 1
      humanoid.position.z += sign * oz
      return 'z'
    }
  }

  _checkLedgeGrab(humanoid, obstacles) {
    const handsY = humanoid.position.y + config.HAND_OFFSET_Y
    const px     = humanoid.position.x
    const pz     = humanoid.position.z

    for (const obs of obstacles) {
      if (obs.isBillboard) continue
      const { aabb } = obs
      const topY = aabb.max.y

      // Hands must be within grab range of the box top
      if (handsY < topY - config.LEDGE_REACH || handsY > topY) continue

      // Must be near the box horizontally
      if (px < aabb.min.x - config.LEDGE_H_MARGIN || px > aabb.max.x + config.LEDGE_H_MARGIN) continue
      if (pz < aabb.min.z - config.LEDGE_H_MARGIN || pz > aabb.max.z + config.LEDGE_H_MARGIN) continue

      // Snap hands to ledge height
      humanoid.position.y = topY - config.HAND_OFFSET_Y
      this._state    = STATE.HANGING
      this._hangTopY = topY
      this._speedBoost = 0
      this._moveSpeed = config.MOVE_SPEED_MIN
      this.velocity.set(0, 0, 0)
      if (this.onGrab) this.onGrab()
      return
    }
  }

  _pullUp(humanoid) {
    humanoid.position.y = this._hangTopY
    this.velocity.set(0, 0, 0)
    this._state = STATE.GROUNDED
    this._moveSpeed = config.MOVE_SPEED_MIN
    this._speedBoost = 0
    if (this.onPullUp) this.onPullUp()
  }

  _respawn(humanoid) {
    humanoid.position.set(config.SPAWN_POS.x, config.SPAWN_POS.y, config.SPAWN_POS.z)
    this.velocity.set(0, 0, 0)
    this._state = STATE.GROUNDED
    this._coyoteTimer = 0
    this._airJumpsLeft = config.MAX_AIR_JUMPS
    this._wallKickTimer = 0
    this._speedBoost = 0
    this._moveSpeed = config.MOVE_SPEED_MIN
  }

  static spawnPosition() {
    return config.SPAWN_POS
  }
}
