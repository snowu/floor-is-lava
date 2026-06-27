import * as THREE from 'three'

export function createHumanoid() {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x4488ff })

  const root = new THREE.Group()
  group.add(root)

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), mat)
  head.position.y = 1.75
  root.add(head)

  // Body — capsule torso
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.4, 8, 16), mat)
  body.position.y = 1.125
  root.add(body)

  // Left arm — pivot at shoulder
  const shoulderL = new THREE.Group()
  shoulderL.position.set(-0.3, 1.4, 0)
  root.add(shoulderL)

  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 6, 12), mat)
  armL.position.y = -0.3
  shoulderL.add(armL)

  // Right arm — pivot at shoulder
  const shoulderR = new THREE.Group()
  shoulderR.position.set(0.3, 1.4, 0)
  root.add(shoulderR)

  const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 6, 12), mat)
  armR.position.y = -0.3
  shoulderR.add(armR)

  // Left leg — pivot at hip
  const hipL = new THREE.Group()
  hipL.position.set(-0.12, 0.7, 0)
  root.add(hipL)

  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 6, 12), mat)
  legL.position.y = -0.35
  hipL.add(legL)

  // Right leg — pivot at hip
  const hipR = new THREE.Group()
  hipR.position.set(0.12, 0.7, 0)
  root.add(hipR)

  const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 6, 12), mat)
  legR.position.y = -0.35
  hipR.add(legR)

  const joints = { root, head, body, shoulderL, shoulderR, hipL, hipR }
  return { group, joints }
}
