import {
  ANIM_IDLE_BOB_SPEED, ANIM_IDLE_BOB_AMOUNT, ANIM_IDLE_ARM_ANGLE,
  ANIM_RUN_LEG_AMPLITUDE, ANIM_RUN_ARM_AMPLITUDE, ANIM_RUN_FREQ_SCALE,
  ANIM_RUN_LEAN_MAX, ANIM_FACING_LERP_RATE,
  ANIM_LANDING_DURATION, ANIM_PULLUP_DURATION, ANIM_SPIN_DURATION,
  MOVE_SPEED,
} from './config.js'

const ANIM_STATE = {
  IDLE:       'idle',
  RUNNING:    'running',
  JUMPING:    'jumping',
  FALLING:    'falling',
  LANDING:    'landing',
  HANGING:    'hanging',
  PULL_UP:    'pullUp',
  SPIN:       'spin',
}

export class HumanoidAnimator {
  constructor(joints, physics) {
    this._joints = joints
    this._physics = physics
    this._state = ANIM_STATE.IDLE
    this._time = 0
    this._stateTimer = 0

    this._bodyBaseY = joints.body.position.y
    this._airborneTimer = 0

    physics.onLand = () => {
      if (this._airborneTimer < 0.1) return
      this._setState(ANIM_STATE.LANDING)
    }
    physics.onGrab = () => {
      this._setState(ANIM_STATE.HANGING)
    }
    physics.onPullUp = () => {
      this._setState(ANIM_STATE.PULL_UP)
    }
    physics.onDoubleJump = () => {
      this._setState(ANIM_STATE.SPIN)
    }
  }

  _setState(state) {
    if (this._state === state) return
    this._state = state
    this._stateTimer = 0
  }

  update(delta) {
    this._time += delta
    this._stateTimer += delta

    const phys = this._physics
    const j = this._joints
    const hSpeed = phys.horizontalSpeed

    // Track airborne duration to suppress jitter landings
    if (phys.state === 'airborne' || phys.state === 'hanging') {
      this._airborneTimer += delta
    } else {
      this._airborneTimer = 0
    }

    // Timed state transitions
    if (this._state === ANIM_STATE.LANDING) {
      if (this._stateTimer >= ANIM_LANDING_DURATION) {
        this._setState(hSpeed > 0.5 ? ANIM_STATE.RUNNING : ANIM_STATE.IDLE)
      }
    } else if (this._state === ANIM_STATE.PULL_UP) {
      if (this._stateTimer >= ANIM_PULLUP_DURATION) {
        this._setState(ANIM_STATE.IDLE)
      }
    } else if (this._state === ANIM_STATE.SPIN) {
      if (this._stateTimer >= ANIM_SPIN_DURATION) {
        this._setState(ANIM_STATE.FALLING)
      }
    } else if (this._state !== ANIM_STATE.HANGING) {
      // Physics-driven transitions
      if (phys.state === 'grounded') {
        if (hSpeed > 0.5) {
          this._setState(ANIM_STATE.RUNNING)
        } else if (this._state !== ANIM_STATE.LANDING) {
          this._setState(ANIM_STATE.IDLE)
        }
      } else if (phys.state === 'airborne') {
        if (phys.velocity.y > 0 && this._state !== ANIM_STATE.SPIN) {
          this._setState(ANIM_STATE.JUMPING)
        } else if (this._airborneTimer > 0.05 && this._state !== ANIM_STATE.SPIN) {
          this._setState(ANIM_STATE.FALLING)
        }
      }
    }

    // Facing — lerp root.rotation.y toward movement direction
    if (hSpeed > 0.5) {
      const targetYaw = Math.atan2(phys.velocity.x, phys.velocity.z)
      let diff = targetYaw - j.root.rotation.y
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      j.root.rotation.y += diff * Math.min(1, ANIM_FACING_LERP_RATE * delta)
    }

    switch (this._state) {
      case ANIM_STATE.IDLE:     this._poseIdle(); break
      case ANIM_STATE.RUNNING:  this._poseRunning(); break
      case ANIM_STATE.JUMPING:  this._poseJumping(); break
      case ANIM_STATE.FALLING:  this._poseFalling(); break
      case ANIM_STATE.LANDING:  this._poseLanding(); break
      case ANIM_STATE.HANGING:  this._poseHanging(); break
      case ANIM_STATE.PULL_UP:  this._posePullUp(); break
      case ANIM_STATE.SPIN:     this._poseSpin(); break
    }
  }

  _poseIdle() {
    const j = this._joints
    const bob = Math.sin(this._time * ANIM_IDLE_BOB_SPEED) * ANIM_IDLE_BOB_AMOUNT
    j.body.position.y = this._bodyBaseY + bob
    j.head.position.y = 1.75 + bob

    j.shoulderL.rotation.x = 0
    j.shoulderR.rotation.x = 0
    j.shoulderL.rotation.z = ANIM_IDLE_ARM_ANGLE
    j.shoulderR.rotation.z = -ANIM_IDLE_ARM_ANGLE
    j.hipL.rotation.x = 0
    j.hipR.rotation.x = 0
    j.root.rotation.x = 0
  }

  _poseRunning() {
    const j = this._joints
    const freq = this._physics.horizontalSpeed * ANIM_RUN_FREQ_SCALE
    const phase = this._time * freq

    j.hipL.rotation.x = Math.sin(phase) * ANIM_RUN_LEG_AMPLITUDE
    j.hipR.rotation.x = Math.sin(phase + Math.PI) * ANIM_RUN_LEG_AMPLITUDE
    j.shoulderL.rotation.x = Math.sin(phase + Math.PI) * ANIM_RUN_ARM_AMPLITUDE
    j.shoulderR.rotation.x = Math.sin(phase) * ANIM_RUN_ARM_AMPLITUDE
    j.shoulderL.rotation.z = 0
    j.shoulderR.rotation.z = 0

    const leanFactor = Math.min(this._physics.horizontalSpeed / MOVE_SPEED, 1)
    j.root.rotation.x = -ANIM_RUN_LEAN_MAX * leanFactor

    j.body.position.y = this._bodyBaseY
    j.head.position.y = 1.75
  }

  _poseJumping() {
    const j = this._joints
    j.shoulderL.rotation.x = -1.2
    j.shoulderR.rotation.x = -1.2
    j.shoulderL.rotation.z = 0.3
    j.shoulderR.rotation.z = -0.3
    j.hipL.rotation.x = -0.2
    j.hipR.rotation.x = -0.2
    j.root.rotation.x = 0
  }

  _poseFalling() {
    const j = this._joints
    j.shoulderL.rotation.x = -0.4
    j.shoulderR.rotation.x = -0.4
    j.shoulderL.rotation.z = 0.8
    j.shoulderR.rotation.z = -0.8
    j.hipL.rotation.x = 0.1
    j.hipR.rotation.x = 0.1
    j.root.rotation.x = 0
  }

  _poseLanding() {
    const j = this._joints
    const t = this._stateTimer / ANIM_LANDING_DURATION
    const crouch = Math.sin(t * Math.PI) * 0.15

    j.body.position.y = this._bodyBaseY - crouch
    j.head.position.y = 1.75 - crouch
    j.hipL.rotation.x = crouch * 2
    j.hipR.rotation.x = crouch * 2
    j.shoulderL.rotation.x = crouch
    j.shoulderR.rotation.x = crouch
    j.shoulderL.rotation.z = 0
    j.shoulderR.rotation.z = 0
    j.root.rotation.x = 0
  }

  _poseHanging() {
    const j = this._joints
    j.shoulderL.rotation.x = -Math.PI
    j.shoulderR.rotation.x = -Math.PI
    j.shoulderL.rotation.z = 0.2
    j.shoulderR.rotation.z = -0.2
    j.hipL.rotation.x = 0.15
    j.hipR.rotation.x = 0.15
    j.root.rotation.x = 0
    j.body.position.y = this._bodyBaseY
    j.head.position.y = 1.75
  }

  _posePullUp() {
    const j = this._joints
    const t = Math.min(this._stateTimer / ANIM_PULLUP_DURATION, 1)

    j.shoulderL.rotation.x = -Math.PI * (1 - t)
    j.shoulderR.rotation.x = -Math.PI * (1 - t)
    j.shoulderL.rotation.z = 0.2 * (1 - t)
    j.shoulderR.rotation.z = -0.2 * (1 - t)

    j.hipL.rotation.x = 0.5 * Math.sin(t * Math.PI)
    j.hipR.rotation.x = 0.3 * Math.sin(t * Math.PI)

    j.root.rotation.x = 0
  }

  _poseSpin() {
    const j = this._joints
    const t = this._stateTimer / ANIM_SPIN_DURATION
    const spinAngle = t * Math.PI * 2

    j.root.rotation.x = -spinAngle

    j.shoulderL.rotation.x = -1.5
    j.shoulderR.rotation.x = -1.5
    j.shoulderL.rotation.z = 0
    j.shoulderR.rotation.z = 0
    j.hipL.rotation.x = -1.2
    j.hipR.rotation.x = -1.2
  }
}
