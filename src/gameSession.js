const STORAGE_KEYS = {
  bestScore: 'floor-is-lava.bestScore',
  bestMultiplier: 'floor-is-lava.bestMultiplier',
}

const TRICK_POINTS_PER_SECOND = {
  grinding: 50,
  wallrunning: 30,
}

export function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export class GameSession {
  constructor(storage) {
    this._storage = storage === undefined ? getDefaultStorage() : storage
    this.bestScore = this._readBest(STORAGE_KEYS.bestScore, 0)
    this.bestMultiplier = this._readBest(STORAGE_KEYS.bestMultiplier, 1)
    this.reset()
  }

  get pendingTrickPoints() {
    return Math.floor(this.trickScore * this.trickMultiplier)
  }

  landOn(obstacle) {
    if (obstacle.isSpawn || this._touchedObstacles.has(obstacle)) return false
    this._touchedObstacles.add(obstacle)
    this.score++
    this._updateBestScore()
    return true
  }

  land() {
    const banked = this.pendingTrickPoints
    if (banked > 0) {
      this.score += banked
      this._updateBestScore()
    }
    this.trickScore = 0
    this.trickMultiplier = 1
    this.inTrick = false
    return banked
  }

  startTrick() {
    this.trickMultiplier++
    this.inTrick = true
    if (this.trickMultiplier > this.bestMultiplier) {
      this.bestMultiplier = this.trickMultiplier
      this._writeBest(STORAGE_KEYS.bestMultiplier, this.bestMultiplier)
    }
  }

  update(delta, playerState, horizontalSpeed) {
    const pointsPerSecond = TRICK_POINTS_PER_SECOND[playerState]
    if (pointsPerSecond) {
      this.trickScore += pointsPerSecond * delta
      this.inTrick = true
    }

    if (!this.timerStarted && horizontalSpeed > 0.1) this.timerStarted = true
    if (this.timerStarted) this.runTime += delta
  }

  reset() {
    this.score = 0
    this.runTime = 0
    this.timerStarted = false
    this.trickScore = 0
    this.trickMultiplier = 1
    this.inTrick = false
    this._touchedObstacles = new Set()
  }

  _updateBestScore() {
    if (this.score <= this.bestScore) return
    this.bestScore = this.score
    this._writeBest(STORAGE_KEYS.bestScore, this.bestScore)
  }

  _readBest(key, fallback) {
    try {
      const value = Number.parseInt(this._storage?.getItem(key), 10)
      return Number.isFinite(value) && value >= fallback ? value : fallback
    } catch {
      return fallback
    }
  }

  _writeBest(key, value) {
    try {
      this._storage?.setItem(key, String(value))
    } catch {
      // Storage can be unavailable in private browsing or restricted embeds.
    }
  }
}
