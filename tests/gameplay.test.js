import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import config from '../src/config.js'
import { Physics } from '../src/physics.js'
import { RailDefinition, RailGrinder } from '../src/railSystem.js'

describe('gameplay state transitions', () => {
  it('orients rail movement and dismounts to the grind direction', () => {
    const railDef = new RailDefinition([
      { x: 0, y: 2, z: 0 },
      { x: 0, y: 2, z: -10 },
    ])
    const grinder = new RailGrinder()
    const mounted = grinder.tryMount(
      { railDef },
      new THREE.Vector3(0, 2, -5),
      -1,
      new THREE.Vector3(0, 0, 10),
    )

    expect(mounted).toBe(true)
    expect(grinder.update(0.01, 10).tangent.z).toBeGreaterThan(0)
    expect(grinder.dismount().z).toBeGreaterThan(0)
  })

  it('does not immediately re-enter a wall run after timeout', () => {
    const physics = new Physics()
    const humanoid = new THREE.Object3D()
    humanoid.position.set(0, 2, 0)
    physics._state = 'airborne'
    physics.onWallRun = vi.fn()
    const wall = {
      isBillboard: true,
      wallNormalX: -1,
      aabb: new THREE.Box3(
        new THREE.Vector3(0.1, 0, -3),
        new THREE.Vector3(0.5, 10, 3),
      ),
    }
    const moveDir = new THREE.Vector3(0, 0, -1)

    physics.update(humanoid, moveDir, true, false, false, false, 0.016, [wall])
    expect(physics.state).toBe('wallrunning')
    physics._wallrunTimer = 0.001
    physics.update(humanoid, moveDir, true, false, false, false, 0.016, [wall])

    expect(physics.state).toBe('airborne')
    expect(physics.onWallRun).toHaveBeenCalledTimes(1)
    expect(physics._wallrunGraceTimer).toBeGreaterThan(0)
    expect(physics._wallrunGraceTimer).toBeLessThanOrEqual(config.WALLRUN_GRACE_TIME)
  })
})
