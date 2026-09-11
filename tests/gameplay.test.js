import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import config from '../src/config.js'
import { CourseManager } from '../src/courseGenerator.js'
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

describe('course resource lifecycle', () => {
  it('disposes segment-owned resources without destroying shared style assets', () => {
    const manager = new CourseManager('medium', 1)
    const scene = { remove: vi.fn() }

    const sharedGeometry = new THREE.BoxGeometry()
    const sharedMaterial = new THREE.MeshBasicMaterial()
    const sharedGeometryDispose = vi.spyOn(sharedGeometry, 'dispose')
    const sharedMaterialDispose = vi.spyOn(sharedMaterial, 'dispose')
    const sharedMesh = new THREE.Mesh(sharedGeometry, sharedMaterial)

    const ownedGroup = new THREE.Group()
    ownedGroup.userData.segmentOwned = true
    const ownedGeometry = new THREE.BoxGeometry()
    const ownedMaterial = new THREE.MeshBasicMaterial()
    const ownedGeometryDispose = vi.spyOn(ownedGeometry, 'dispose')
    const ownedMaterialDispose = vi.spyOn(ownedMaterial, 'dispose')
    ownedGroup.add(new THREE.Mesh(ownedGeometry, ownedMaterial))

    const clonedMaterial = new THREE.MeshBasicMaterial()
    clonedMaterial.userData.segmentOwned = true
    const clonedMaterialDispose = vi.spyOn(clonedMaterial, 'dispose')
    const clonedMesh = new THREE.Mesh(sharedGeometry, clonedMaterial)

    manager._disposeSegment({ meshes: [sharedMesh, ownedGroup, clonedMesh] }, scene)

    expect(scene.remove).toHaveBeenCalledTimes(3)
    expect(sharedGeometryDispose).not.toHaveBeenCalled()
    expect(sharedMaterialDispose).not.toHaveBeenCalled()
    expect(ownedGeometryDispose).toHaveBeenCalledOnce()
    expect(ownedMaterialDispose).toHaveBeenCalledOnce()
    expect(clonedMaterialDispose).toHaveBeenCalledOnce()
  })
})
