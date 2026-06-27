import config from './config.js'

const ANIM_STATE = {
  IDLE:       'idle',
  RUNNING:    'running',
  JUMPING:    'jumping',
  FALLING:    'falling',
  LANDING:    'landing',
  HANGING:    'hanging',
  PULL_UP:    'pullUp',
  WALLRUN:    'wallrun',
}

export class HumanoidAnimator {
  constructor(joints, physics) {
    this._joints = joints
    this._physics = physics
    this._state = ANIM_STATE.IDLE
    this._time = 0
    this._stateTimer = 0
    this._airborneTimer = 0

    this._bodyBaseY = joints.body.position.y

    // Camera offsets — applied by cameraController
    this.cameraYOffset = 0
    this.cameraHandLX = 0
    this.cameraHandLY = 0
    this.cameraHandRX = 0
    this.cameraHandRY = 0

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
    physics.onDoubleJump = null
    this.forcedState = null
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
    const hSpeed = phys.horizontalSpeed

    if (phys.state === 'airborne' || phys.state === 'hanging') {
      this._airborneTimer += delta
    } else {
      this._airborneTimer = 0
    }

    // Timed state transitions
    if (this._state === ANIM_STATE.LANDING) {
      if (this._stateTimer >= config.ANIM_LANDING_DURATION) {
        this._setState(hSpeed > 0.5 ? ANIM_STATE.RUNNING : ANIM_STATE.IDLE)
      }
    } else if (this._state === ANIM_STATE.PULL_UP) {
      if (this._stateTimer >= config.ANIM_PULLUP_DURATION) {
        this._setState(ANIM_STATE.IDLE)
      }
    } else if (this._state !== ANIM_STATE.HANGING) {
      if (phys.state === 'wallrunning') {
        this._setState(ANIM_STATE.WALLRUN)
      } else if (phys.state === 'grounded') {
        if (hSpeed > 0.5) {
          this._setState(ANIM_STATE.RUNNING)
        } else if (this._state !== ANIM_STATE.LANDING) {
          this._setState(ANIM_STATE.IDLE)
        }
      } else if (phys.state === 'airborne') {
        if (phys.velocity.y > 0) {
          this._setState(ANIM_STATE.JUMPING)
        } else if (this._airborneTimer > 0.05) {
          this._setState(ANIM_STATE.FALLING)
        }
      }
    }

    if (this.forcedState) this._state = this.forcedState

    this.cameraYOffset = 0
    this.cameraHandLX = 0
    this.cameraHandLY = 0
    this.cameraHandRX = 0
    this.cameraHandRY = 0

    switch (this._state) {
      case ANIM_STATE.IDLE:     this._poseIdle(); break
      case ANIM_STATE.RUNNING:  this._poseRunning(); break
      case ANIM_STATE.JUMPING:  this._poseJumping(); break
      case ANIM_STATE.FALLING:  this._poseFalling(); break
      case ANIM_STATE.LANDING:  this._poseLanding(); break
      case ANIM_STATE.HANGING:  this._poseHanging(); break
      case ANIM_STATE.PULL_UP:  this._posePullUp(); break
      case ANIM_STATE.WALLRUN:  this._poseWallRun(); break
    }
  }

  _resetLimbs() {
    const j = this._joints
    j.shoulderL.rotation.set(0, 0, 0)
    j.shoulderR.rotation.set(0, 0, 0)
    j.hipL.rotation.set(0, 0, 0)
    j.hipR.rotation.set(0, 0, 0)
    j.root.rotation.set(0, 0, 0)
    j.body.position.y = this._bodyBaseY
    j.head.position.y = 1.75
  }

  _poseIdle() {
    this._resetLimbs()
    const j = this._joints
    const bob = Math.sin(this._time * config.ANIM_IDLE_BOB_SPEED) * config.ANIM_IDLE_BOB_AMOUNT
    j.shoulderL.rotation.z = config.ANIM_IDLE_ARM_ANGLE
    j.shoulderR.rotation.z = -config.ANIM_IDLE_ARM_ANGLE
    this.cameraYOffset = bob
  }

  _poseRunning() {
    this._resetLimbs()
    const j = this._joints
    const freq = this._physics.horizontalSpeed * config.ANIM_RUN_FREQ_SCALE
    const phase = this._time * freq

    j.hipL.rotation.x = Math.sin(phase) * config.ANIM_RUN_LEG_AMPLITUDE
    j.hipR.rotation.x = Math.sin(phase + Math.PI) * config.ANIM_RUN_LEG_AMPLITUDE
    j.shoulderL.rotation.x = Math.sin(phase + Math.PI) * config.ANIM_RUN_ARM_AMPLITUDE
    j.shoulderR.rotation.x = Math.sin(phase) * config.ANIM_RUN_ARM_AMPLITUDE

    // View bob — vertical sway synced to footsteps
    const viewBob = Math.abs(Math.sin(phase)) * 0.04
    const speedFactor = Math.min(this._physics.horizontalSpeed / config.MOVE_SPEED, 1)
    this.cameraYOffset = viewBob * speedFactor

    // FP hand sway — arms pump opposite to each other
    const sway = 0.03 * speedFactor
    this.cameraHandLY = Math.sin(phase + Math.PI) * sway
    this.cameraHandLX = Math.sin(phase + Math.PI) * sway * 0.3
    this.cameraHandRY = Math.sin(phase) * sway
    this.cameraHandRX = -Math.sin(phase) * sway * 0.3
  }

  _poseJumping() {
    this._resetLimbs()
    const j = this._joints
    j.shoulderL.rotation.x = 0.3
    j.shoulderR.rotation.x = 0.3
    j.shoulderL.rotation.z = 0.4
    j.shoulderR.rotation.z = -0.4

    // FP hands rise up slightly
    this.cameraHandLY = 0.03
    this.cameraHandRY = 0.03
  }

  _poseFalling() {
    this._resetLimbs()
    const j = this._joints
    j.shoulderL.rotation.x = 0.2
    j.shoulderR.rotation.x = 0.2
    j.shoulderL.rotation.z = 0.6
    j.shoulderR.rotation.z = -0.6

    // FP hands drop slightly
    this.cameraHandLY = -0.02
    this.cameraHandRY = -0.02
    this.cameraHandLX = -0.02
    this.cameraHandRX = 0.02
  }

  _poseLanding() {
    this._resetLimbs()
    const j = this._joints
    const t = this._stateTimer / config.ANIM_LANDING_DURATION
    const crouch = Math.sin(t * Math.PI) * 0.15

    j.hipL.rotation.x = crouch * 2
    j.hipR.rotation.x = crouch * 2
    j.shoulderL.rotation.x = crouch
    j.shoulderR.rotation.x = crouch

    // Camera dip on landing
    this.cameraYOffset = -crouch
  }

  _poseHanging() {
    this._resetLimbs()
    const j = this._joints
    j.shoulderL.rotation.x = -Math.PI
    j.shoulderR.rotation.x = -Math.PI
    j.shoulderL.rotation.z = 0.2
    j.shoulderR.rotation.z = -0.2
    j.hipL.rotation.x = 0.15
    j.hipR.rotation.x = 0.15
  }

  _poseWallRun() {
    this._resetLimbs()
    const j = this._joints
    const phys = this._physics
    const wallSide = -phys._wallNormalX
    const phase = this._time * 6

    // Wall-side arm reaches toward wall, other arm trails back
    if (wallSide > 0) {
      j.shoulderL.rotation.z = 1.0
      j.shoulderL.rotation.x = -0.2
      j.shoulderR.rotation.x = 0.4
      j.shoulderR.rotation.z = -0.15
    } else {
      j.shoulderR.rotation.z = -1.0
      j.shoulderR.rotation.x = -0.2
      j.shoulderL.rotation.x = 0.4
      j.shoulderL.rotation.z = 0.15
    }

    // FP hands — wall-side hand out to side, other hand trails
    const sway = Math.sin(phase) * 0.01
    if (wallSide > 0) {
      this.cameraHandLX = -0.1
      this.cameraHandLY = sway
      this.cameraHandRX = 0.05
      this.cameraHandRY = 0.03 + sway
    } else {
      this.cameraHandRX = 0.1
      this.cameraHandRY = sway
      this.cameraHandLX = -0.05
      this.cameraHandLY = 0.03 + sway
    }

    this.cameraYOffset = sway
  }

  _posePullUp() {
    this._resetLimbs()
    const j = this._joints
    const t = Math.min(this._stateTimer / config.ANIM_PULLUP_DURATION, 1)

    j.shoulderL.rotation.x = -Math.PI * (1 - t)
    j.shoulderR.rotation.x = -Math.PI * (1 - t)
    j.shoulderL.rotation.z = 0.2 * (1 - t)
    j.shoulderR.rotation.z = -0.2 * (1 - t)

    j.hipL.rotation.x = 0.5 * Math.sin(t * Math.PI)
    j.hipR.rotation.x = 0.3 * Math.sin(t * Math.PI)
  }
}
