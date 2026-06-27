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
    this._legsExtended = false
  }

  get state() { return this._state }

  get horizontalSpeed() {
    return Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2)
  }

  get legsExtended() { return this._legsExtended }

  get activeHeight() { return config.PLAYER_HEIGHT }

  get upperBodyMin() { return config.KICK_HIP_Y }
  get upperBodyMax() { return config.PLAYER_HEIGHT }
  get lowerBodyMin() { return 0 }
  get lowerBodyMax() { return config.KICK_HIP_Y }

  update(humanoid, moveDir, wDown, sDown, eDown, jumpPressed, delta, obstacles, wallAABBs = []) {
    this._landedOnGround = false
    this._legsExtended = eDown && (this._state === STATE.AIRBORNE || this._state === STATE.WALLRUNNING)

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
            // Upper body always collides
            const upperH = config.PLAYER_HEIGHT - config.KICK_HIP_Y
            if (this._resolveAABB(humanoid, obs.aabb, config.KICK_HIP_Y, upperH)) {
              supportedThisFrame = true
              if (!this._landedOnGround && this.onBoxLand) this.onBoxLand(obs)
            }
            // Lower body only when legs not extended
            if (!this._legsExtended) {
              if (this._resolveAABB(humanoid, obs.aabb, 0, config.KICK_HIP_Y)) {
                supportedThisFrame = true
                if (!this._landedOnGround && this.onBoxLand) this.onBoxLand(obs)
              }
            }
          }
        }
      }

      // Kick hitbox — extended legs with full collision resolution
      if (this._legsExtended) {
        const yaw = humanoid.rotation.y
        const fwdX = -Math.sin(yaw)
        const fwdZ = -Math.cos(yaw)
        const reach = config.KICK_LEG_REACH
        const halfH = config.KICK_LEG_HEIGHT / 2
        const hw = config.PLAYER_WIDTH / 2

        // Build world-space AABB bounding the legs
        const hipX = humanoid.position.x
        const hipZ = humanoid.position.z
        const tipX = hipX + fwdX * reach
        const tipZ = hipZ + fwdZ * reach
        const kickY = humanoid.position.y + config.KICK_HIP_Y

        const kMinX = Math.min(hipX, tipX) - hw
        const kMaxX = Math.max(hipX, tipX) + hw
        const kMinZ = Math.min(hipZ, tipZ) - hw
        const kMaxZ = Math.max(hipZ, tipZ) + hw
        const kMinY = kickY - halfH
        const kMaxY = kickY + halfH

        for (const obs of obstacles) {
          if (obs.isBillboard) continue
          const a = obs.aabb
          if (kMaxX <= a.min.x || kMinX >= a.max.x ||
              kMaxY <= a.min.y || kMinY >= a.max.y ||
              kMaxZ <= a.min.z || kMinZ >= a.max.z) continue

          // Overlap on each axis
          const ox = Math.min(kMaxX - a.min.x, a.max.x - kMinX)
          const oy = Math.min(kMaxY - a.min.y, a.max.y - kMinY)
          const oz = Math.min(kMaxZ - a.min.z, a.max.z - kMinZ)

          // Resolve on minimum penetration axis — push player out
          if (ox <= oy && ox <= oz) {
            const sign = hipX < (a.min.x + a.max.x) / 2 ? -1 : 1
            humanoid.position.x += sign * ox
          } else if (oy <= ox && oy <= oz) {
            const kickCenter = kickY
            const boxCenter = (a.min.y + a.max.y) / 2
            if (kickCenter > boxCenter) {
              // Legs on top — push up, count as supported
              humanoid.position.y += (a.max.y - kMinY)
              this.velocity.y = Math.max(this.velocity.y, 0)
              supportedThisFrame = true
              if (!this._landedOnGround && this.onBoxLand) this.onBoxLand(obs)
            } else {
              // Legs under — push down
              humanoid.position.y -= (kMaxY - a.min.y)
              if (this.velocity.y > 0) this.velocity.y = 0
            }
          } else {
            const sign = hipZ < (a.min.z + a.max.z) / 2 ? -1 : 1
            humanoid.position.z += sign * oz
          }
        }
      }

      // Wall collision
      for (const aabb of wallAABBs) {
        const upperH = config.PLAYER_HEIGHT - config.KICK_HIP_Y
        this._resolveAABB(humanoid, aabb, config.KICK_HIP_Y, upperH)
        if (!this._legsExtended) {
          this._resolveAABB(humanoid, aabb, 0, config.KICK_HIP_Y)
        }
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

  _resolveAABB(humanoid, aabb, yOff = 0, yHeight = config.PLAYER_HEIGHT) {
    const hw = config.PLAYER_WIDTH / 2
    const px = humanoid.position.x
    const py = humanoid.position.y
    const pz = humanoid.position.z

    const pMinX = px - hw;  const pMaxX = px + hw
    const pMinY = py + yOff; const pMaxY = py + yOff + yHeight
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
    const feetOnTop = yOff === 0 && oyUp < oyDown && oyUp < 0.5 && pMinY > (aabb.min.y + aabb.max.y) / 2

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
    const ph = this.activeHeight
    const px = humanoid.position.x
    const py = humanoid.position.y
    const pz = humanoid.position.z

    const pMinX = px - hw;  const pMaxX = px + hw
    const pMinY = py;       const pMaxY = py + ph
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
