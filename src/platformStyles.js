import * as THREE from 'three'

// ── Shared simplex noise GLSL ──────────────────────────────────────────────
const SNOISE_GLSL = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
  m=m*m;m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0;vec3 h=abs(x)-0.5;
  vec3 ox=floor(x+0.5);vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
float fbm(vec2 p,float oct){float v=0.0,a=0.5,f=1.0;for(int i=0;i<5;i++){if(float(i)>=oct)break;v+=a*snoise(p*f);f*=2.0;a*=0.5;}return v;}
`

// ── Shared geometries ─────────────────────────────────────────────────────
const blobGeo = new THREE.SphereGeometry(0.06, 6, 6)
const debrisGeo = new THREE.IcosahedronGeometry(0.08, 0)
const rivetGeo = new THREE.SphereGeometry(0.04, 6, 6)
const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1)
const unitPlaneGeo = new THREE.PlaneGeometry(1, 1)
const unitCylinderGeo = new THREE.CylinderGeometry(0.3, 1, 1, 6)
const thinCylinderGeo = new THREE.CylinderGeometry(0.2, 1, 1, 6)
const craterGeo = new THREE.CylinderGeometry(1, 1, 1, 12)
const craterRimGeo = new THREE.TorusGeometry(1, 0.15, 6, 12)

// ── Volcanic Rock ──────────────────────────────────────────────────────────

const VOLCANIC_VERT = `
  ${SNOISE_GLSL}
  uniform float time;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main(){
    vNormal = normalize(normalMatrix * normal);
    vec3 pos = position;
    float isTop = step(0.49, normal.y);
    float n = snoise(pos.xz * 1.5) * 0.02 * isTop;
    pos.y += n;
    vWorldPos = (modelMatrix * vec4(pos,1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.0);
  }
`

const VOLCANIC_FRAG = `
  ${SNOISE_GLSL}
  uniform float time;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main(){
    vec2 uv = vWorldPos.xz * 0.6;
    float t = time * 0.15;
    float rockNoise = fbm(uv * 1.0, 3.0);
    vec3 darkRock = vec3(0.07, 0.04, 0.025);
    vec3 lightRock = vec3(0.14, 0.08, 0.05);
    vec3 rock = mix(darkRock, lightRock, rockNoise * 0.5 + 0.5);
    float crack = abs(snoise(uv * 1.0 + t * 0.08));
    float crackMask = 1.0 - smoothstep(0.0, 0.22, crack);
    crackMask = pow(crackMask, 1.5) * 0.7;
    float heat = snoise(uv * 0.7 + t * 0.2) * 0.5 + 0.5;
    vec3 crackColor = mix(vec3(0.8, 0.15, 0.0), vec3(1.0, 0.5, 0.05), heat);
    float pulse = sin(time * 1.0 + snoise(uv * 0.5) * 3.0) * 0.15 + 0.85;
    crackMask *= pulse;
    vec3 color = mix(rock, crackColor * 2.0, crackMask);
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.3));
    float diff = max(dot(vNormal, lightDir), 0.0) * 0.5 + 0.5;
    vec3 glow = crackColor * crackMask * 1.2;
    gl_FragColor = vec4(color * diff + glow, 1.0);
  }
`

// Single shared volcanic ShaderMaterial — worldPos gives per-instance variation
const volcanicMat = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 } },
  vertexShader: VOLCANIC_VERT,
  fragmentShader: VOLCANIC_FRAG,
})
// Low-subdivision box for volcanic displacement — shared, scaled per platform
const volcanicBoxGeo = new THREE.BoxGeometry(1, 1, 1, 12, 4, 12)

const volcanicDripMat = new THREE.MeshStandardMaterial({
  color: 0xff4400, emissive: 0xff3300, emissiveIntensity: 4,
  roughness: 0.3, transparent: true, opacity: 0.9,
})
const volcanicBlobMat = new THREE.MeshStandardMaterial({
  color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 5,
  roughness: 0.2, transparent: true, opacity: 0.8,
})
const volcanicDebrisMat = new THREE.MeshStandardMaterial({
  color: 0x2a1a0e, roughness: 0.9, emissive: 0xff3300, emissiveIntensity: 0.4,
})

function buildVolcanic(b) {
  const meshes = []

  const mainMesh = new THREE.Mesh(volcanicBoxGeo, volcanicMat)
  mainMesh.scale.set(b.w, b.h, b.d)
  mainMesh.position.set(b.x, b.y, b.z)
  meshes.push(mainMesh)

  const botY = b.y - b.h / 2

  const dripOffsets = [
    [-b.w * 0.25, b.d * 0.15, 0.5],
    [b.w * 0.2, -b.d * 0.25, 0.7],
    [-b.w * 0.1, -b.d * 0.1, 0.4],
    [b.w * 0.35, b.d * 0.05, 0.55],
  ]
  for (let i = 0; i < dripOffsets.length; i++) {
    const [dx, dz, h] = dripOffsets[i]
    const r = 0.04 + Math.abs(dx) * 0.02
    const drip = new THREE.Mesh(unitCylinderGeo, volcanicDripMat)
    drip.scale.set(r, 0, r)
    drip.position.set(b.x + dx, botY, b.z + dz)
    meshes.push(drip)

    const blob = new THREE.Mesh(blobGeo, volcanicBlobMat)
    blob.position.set(b.x + dx, botY, b.z + dz)
    blob.visible = false
    meshes.push(blob)

    const speed = 0.3 + i * 0.08
    const phase = i * 0.25
    registerDrip(drip, blob, botY, h, speed, phase)
  }

  const topY = b.y + b.h / 2
  for (let i = 0; i < 5; i++) {
    const hash1 = Math.sin(i * 7.3 + b.x * 3.1 + b.z * 1.7) * 0.5 + 0.5
    const hash2 = Math.sin(i * 13.7 + b.x * 2.3 + b.z * 5.1) * 0.5 + 0.5
    const dx = (hash1 - 0.5) * b.w * 0.85
    const dz = (hash2 - 0.5) * b.d * 0.85
    const debris = new THREE.Mesh(debrisGeo, volcanicDebrisMat)
    debris.position.set(b.x + dx, topY + 0.03, b.z + dz)
    debris.rotation.set(i * 1.1, i * 0.7, i * 0.5)
    const s = 0.6 + hash1 * 0.8
    debris.scale.setScalar(s)
    meshes.push(debris)
  }

  return { meshes, mainMesh, update: null }
}

// ── Ancient Stone Ruins ────────────────────────────────────────────────────

const ruinsStoneMat = new THREE.MeshStandardMaterial({ color: 0x6b6355, roughness: 0.92, metalness: 0.02 })
const ruinsCharredMat = new THREE.MeshStandardMaterial({ color: 0x56432e, roughness: 0.92 })
const MOSS_VERT = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const MOSS_FRAG = `
  ${SNOISE_GLSL}
  varying vec2 vUv;
  void main(){
    vec2 centered = (vUv - 0.5) * 2.0;
    float dist = length(centered);
    float noise = snoise(vUv * 4.0) * 0.3;
    float mask = 1.0 - smoothstep(0.3 + noise, 0.9 + noise * 0.5, dist);
    vec3 darkGreen = vec3(0.15, 0.28, 0.1);
    vec3 lightGreen = vec3(0.3, 0.45, 0.18);
    float n = snoise(vUv * 6.0 + 1.5) * 0.5 + 0.5;
    vec3 color = mix(darkGreen, lightGreen, n);
    if (mask < 0.01) discard;
    gl_FragColor = vec4(color, mask * 0.85);
  }
`
const ruinsMossMat = new THREE.ShaderMaterial({
  vertexShader: MOSS_VERT,
  fragmentShader: MOSS_FRAG,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
})
const ruinsGoldTrimMat = new THREE.MeshStandardMaterial({
  color: 0x9a8860, roughness: 0.5, metalness: 0.6, emissive: 0x4a3820, emissiveIntensity: 0.2,
})
const ruinsCrackMat = new THREE.MeshStandardMaterial({ color: 0x55432f, roughness: 0.9 })

const SCORCH_VERT = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const SCORCH_FRAG = `
  ${SNOISE_GLSL}
  varying vec2 vUv;
  void main(){
    vec2 centered = (vUv - 0.5) * 2.0;
    float dist = length(centered);
    float noise = snoise(vUv * 5.0) * 0.2;
    float ring = smoothstep(0.3 + noise, 0.6 + noise, dist) * (1.0 - smoothstep(0.7 + noise, 1.0 + noise, dist));
    float inner = 1.0 - smoothstep(0.0, 0.4 + noise, dist);
    vec3 scorchDark = vec3(0.25, 0.18, 0.1);
    vec3 scorchMid = vec3(0.38, 0.28, 0.16);
    vec3 color = mix(scorchDark, scorchMid, ring);
    float alpha = max(inner * 0.6, ring * 0.45);
    alpha *= 1.0 - smoothstep(0.8 + noise, 1.0, dist);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`
const ruinsScorchMat = new THREE.ShaderMaterial({
  vertexShader: SCORCH_VERT,
  fragmentShader: SCORCH_FRAG,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
})
const ruinsRubbleMat = new THREE.MeshStandardMaterial({ color: 0x8a7d6b, roughness: 0.9 })

function buildRuins(b) {
  const meshes = []
  const halfW = b.w / 2, halfD = b.d / 2
  const topY = b.y + b.h / 2

  const mainMesh = new THREE.Mesh(unitBoxGeo, ruinsStoneMat)
  mainMesh.scale.set(b.w, b.h, b.d)
  mainMesh.position.set(b.x, b.y, b.z)
  meshes.push(mainMesh)

  const trimH = 0.04
  const trimInset = 0.06

  for (const zSign of [1, -1]) {
    const trim = new THREE.Mesh(unitBoxGeo, ruinsGoldTrimMat)
    trim.scale.set(b.w - trimInset * 2, trimH, trimInset)
    trim.position.set(b.x, topY + trimH / 2, b.z + zSign * (halfD - trimInset / 2))
    meshes.push(trim)
  }
  for (const xSign of [1, -1]) {
    const trim = new THREE.Mesh(unitBoxGeo, ruinsGoldTrimMat)
    trim.scale.set(trimInset, trimH, b.d - trimInset * 2)
    trim.position.set(b.x + xSign * (halfW - trimInset / 2), topY + trimH / 2, b.z)
    meshes.push(trim)
  }

  const mossData = [
    [0.2 * b.w, 0.25 * b.d, 0.4],
    [-0.25 * b.w, -0.15 * b.d, 0.22],
    [0.05 * b.w, -0.35 * b.d, 0.3],
    [-0.1 * b.w, 0.35 * b.d, 0.16],
  ]
  for (const [dx, dz, radius] of mossData) {
    const moss = new THREE.Mesh(unitPlaneGeo, ruinsMossMat)
    moss.scale.set(radius * 2, radius * 2, 1)
    moss.rotation.x = -Math.PI / 2
    moss.position.set(b.x + dx, topY + 0.012, b.z + dz)
    meshes.push(moss)
  }

  const craterData = [
    [-0.15 * b.w, 0.15 * b.d, 0.2],
    [0.2 * b.w, -0.2 * b.d, 0.15],
  ]
  for (const [cx, cz, cr] of craterData) {
    const pit = new THREE.Mesh(craterGeo, ruinsCharredMat)
    pit.scale.set(cr, 0.015, cr)
    pit.position.set(b.x + cx, topY + 0.005, b.z + cz)
    meshes.push(pit)
    const rim = new THREE.Mesh(craterRimGeo, ruinsRubbleMat)
    rim.scale.set(cr, cr, 0.15)
    rim.rotation.x = -Math.PI / 2
    rim.position.set(b.x + cx, topY + 0.012, b.z + cz)
    meshes.push(rim)

    const scorch = new THREE.Mesh(unitPlaneGeo, ruinsScorchMat)
    scorch.scale.set(cr * 5, cr * 5, 1)
    scorch.rotation.x = -Math.PI / 2
    scorch.position.set(b.x + cx, topY + 0.008, b.z + cz)
    meshes.push(scorch)
  }

  // Cracks — jagged segmented lines
  {
    const seed = b.x * 7.3 + b.z * 11.1
    const hash = (n) => (Math.sin(seed + n * 13.7) * 43758.5453 % 1 + 1) % 1

    const addCrackSeg = (x, z, nx, nz, widthMul) => {
      const dx = nx - x, dz = nz - z
      const len = Math.sqrt(dx * dx + dz * dz)
      if (len < 0.001) return
      const angle = Math.atan2(dz, dx)
      const w = (0.02 + hash(x * 10 + z * 7) * 0.015) * (widthMul || 1)
      const seg = new THREE.Mesh(unitBoxGeo, volcanicMat)
      seg.scale.set(w, 0.025, len)
      seg.position.set((x + nx) / 2, topY + 0.006, (z + nz) / 2)
      seg.rotation.y = -angle + Math.PI / 2
      meshes.push(seg)
    }

    const walkCrack = (startX, startZ, endX, endZ, steps, jitter, wStart, wEnd) => {
      let cx = startX, cz = startZ
      for (let i = 0; i < steps; i++) {
        const t = (i + 1) / steps
        const goalX = startX + (endX - startX) * t
        const goalZ = startZ + (endZ - startZ) * t
        const jx = (hash(i * 3 + jitter) - 0.5) * b.w * 0.12
        const jz = (hash(i * 5 + jitter + 20) - 0.5) * b.d * 0.08
        const nx = goalX + (i < steps - 1 ? jx : 0)
        const nz = goalZ + (i < steps - 1 ? jz : 0)
        const wMul = wStart + (wEnd - wStart) * (i / steps)
        addCrackSeg(cx, cz, nx, nz, wMul)
        cx = nx
        cz = nz
      }
      return { x: cx, z: cz }
    }

    // Start left edge near bottom
    const p0x = b.x - halfW * 0.9
    const p0z = b.z + halfD * 0.8
    const p1x = b.x - halfW * 0.7
    const p1z = b.z + halfD * 0.7
    // Sharp right turn across to 60% width
    const p2x = b.x + halfW * 0.2
    const p2z = b.z + halfD * 0.65
    // Up to 60-70% depth — split point
    const p3x = b.x + halfW * 0.25
    const p3z = b.z - halfD * 0.4

    const s1 = walkCrack(p0x, p0z, p1x, p1z, 1, 0, 0.5, 0.7)
    const s2 = walkCrack(s1.x, s1.z, p2x, p2z, 3, 10, 0.7, 1.0)
    const sp = walkCrack(s2.x, s2.z, p3x, p3z, 2, 20, 1.0, 1.3)

    // Branch A: continues up to far end of platform, finishes wide
    const endAX = b.x + halfW * 0.1
    const endAZ = b.z - halfD * 0.9
    walkCrack(sp.x, sp.z, endAX, endAZ, 3, 100, 1.2, 1.8)

    // Branch B: turns right to right edge of platform, finishes wide
    const endBX = b.x + halfW * 0.9
    const endBZ = b.z - halfD * 0.35
    walkCrack(sp.x, sp.z, endBX, endBZ, 3, 200, 1.0, 1.6)
  }

  for (let i = 0; i < 5; i++) {
    const hash1 = Math.sin(i * 7.3 + b.x * 3.1 + b.z * 1.7) * 0.5 + 0.5
    const hash2 = Math.sin(i * 13.7 + b.x * 2.3 + b.z * 5.1) * 0.5 + 0.5
    const dx = (hash1 - 0.5) * b.w * 0.8
    const dz = (hash2 - 0.5) * b.d * 0.8
    const s = 0.06 + hash1 * 0.08
    const rubble = new THREE.Mesh(unitBoxGeo, ruinsRubbleMat)
    rubble.scale.set(s, s * 0.6, s * 0.9)
    rubble.position.set(b.x + dx, topY + s * 0.3, b.z + dz)
    rubble.rotation.set(i * 0.8, i * 1.3, i * 0.5)
    meshes.push(rubble)
  }

  const rubbleData = [
    [halfW + 0.15, 0.4 * halfD, 25],
    [halfW + 0.05, 0.25 * halfD, -15],
    [halfW + 0.2, 0.15 * halfD, 40],
    [-halfW - 0.1, -0.3 * halfD, -20],
    [-halfW - 0.05, -0.4 * halfD, 35],
  ]
  for (const [dx, dz, rotDeg] of rubbleData) {
    const s = 0.08 + Math.abs(Math.sin(dx * 10 + dz * 7)) * 0.12
    const rubble = new THREE.Mesh(unitBoxGeo, ruinsRubbleMat)
    rubble.scale.set(s, s * 0.7, s * 0.9)
    rubble.position.set(b.x + dx, s * 0.35, b.z + dz)
    rubble.rotation.y = rotDeg * Math.PI / 180
    rubble.rotation.z = (Math.sin(dx * 5) * 0.5) * 0.3
    meshes.push(rubble)
  }

  return { meshes, mainMesh, update: null }
}

// ── Metal / Industrial ─────────────────────────────────────────────────────

const metalPlatMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.45, metalness: 0.85 })
const metalFrameMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.9 })
const metalRivetMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.9 })
const metalGrateMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.5 })
const metalRustMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9, metalness: 0.3 })
const metalToxicDripMat = new THREE.MeshStandardMaterial({
  color: 0x2aaa10, emissive: 0x1a8808, emissiveIntensity: 1.5,
  roughness: 0.4, transparent: true, opacity: 0.75,
})
const metalToxicBlobMat = new THREE.MeshStandardMaterial({
  color: 0x33aa15, emissive: 0x1a8808, emissiveIntensity: 2.5,
  transparent: true, opacity: 0.7,
})

const PUDDLE_VERT = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const PUDDLE_FRAG = `
  ${SNOISE_GLSL}
  uniform float time;
  uniform float seed;
  varying vec2 vUv;
  void main(){
    vec2 centered = (vUv - 0.5) * 2.0;
    float dist = length(centered);
    float angle = atan(centered.y, centered.x);
    float wobble = snoise(vec2(angle * 2.0 + seed, seed * 3.0)) * 0.25;
    wobble += snoise(vec2(angle * 5.0 + seed * 2.0, seed)) * 0.12;
    float edge = 0.7 + wobble;
    float mask = 1.0 - smoothstep(edge - 0.15, edge, dist);
    float n1 = snoise(vUv * 6.0 + time * 0.3 + seed) * 0.5 + 0.5;
    float n2 = snoise(vUv * 10.0 - time * 0.2 + seed * 2.0) * 0.5 + 0.5;
    vec3 darkGreen = vec3(0.1, 0.35, 0.05);
    vec3 toxicGreen = vec3(0.25, 0.85, 0.1);
    vec3 sickYellow = vec3(0.6, 0.7, 0.05);
    vec3 murky = vec3(0.15, 0.25, 0.02);
    vec3 color = mix(darkGreen, toxicGreen, n1);
    color = mix(color, sickYellow, n2 * 0.4);
    color = mix(color, murky, pow(n1 * n2, 2.0) * 0.5);
    float bubble = pow(max(0.0, snoise(vUv * 15.0 + time * 0.8 + seed)), 4.0);
    color += vec3(0.3, 0.9, 0.1) * bubble * 0.8;
    float glow = 0.8 + sin(time * 2.0 + n1 * 4.0) * 0.2;
    float alpha = mask * 0.75;
    gl_FragColor = vec4(color * glow, alpha);
  }
`

// Pool of puddle materials — reuse by index to avoid shader recompilation
const PUDDLE_POOL_SIZE = 6
const puddlePool = []
for (let i = 0; i < PUDDLE_POOL_SIZE; i++) {
  puddlePool.push(new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, seed: { value: i * 7.13 + 3.7 } },
    vertexShader: PUDDLE_VERT,
    fragmentShader: PUDDLE_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }))
}

function buildMetal(b, globalIndex) {
  const meshes = []
  const halfW = b.w / 2, halfD = b.d / 2
  const topY = b.y + b.h / 2

  const mainMesh = new THREE.Mesh(unitBoxGeo, metalPlatMat)
  mainMesh.scale.set(b.w, b.h, b.d)
  mainMesh.position.set(b.x, b.y, b.z)
  meshes.push(mainMesh)

  const fh = 0.08, fw = 0.1
  for (const zSign of [1, -1]) {
    const f = new THREE.Mesh(unitBoxGeo, metalFrameMat)
    f.scale.set(b.w, fh, fw)
    f.position.set(b.x, topY + fh / 2, b.z + zSign * halfD)
    meshes.push(f)
  }
  for (const xSign of [1, -1]) {
    const f = new THREE.Mesh(unitBoxGeo, metalFrameMat)
    f.scale.set(fw, fh, b.d)
    f.position.set(b.x + xSign * halfW, topY + fh / 2, b.z)
    meshes.push(f)
  }

  const rivetY = topY + fh
  const rivetPositions = [
    [-halfW, rivetY, halfD], [halfW, rivetY, halfD],
    [-halfW, rivetY, -halfD], [halfW, rivetY, -halfD],
    [0, rivetY, halfD], [0, rivetY, -halfD],
    [-halfW, rivetY, 0], [halfW, rivetY, 0],
  ]
  for (const [rx, ry, rz] of rivetPositions) {
    const rivet = new THREE.Mesh(rivetGeo, metalRivetMat)
    rivet.position.set(b.x + rx, ry, b.z + rz)
    meshes.push(rivet)
  }

  const grateCount = Math.max(3, Math.floor(b.d / 0.35))
  const grateSpacing = b.d / (grateCount + 1)
  for (let i = 1; i <= grateCount; i++) {
    const grate = new THREE.Mesh(unitBoxGeo, metalGrateMat)
    grate.scale.set(b.w * 0.85, 0.02, 0.03)
    grate.position.set(b.x, topY + 0.01, b.z - halfD + i * grateSpacing)
    meshes.push(grate)
  }

  const rustData = [
    [-0.2 * b.w, 0.2 * b.d, 0.15 * b.w],
    [0.25 * b.w, -0.15 * b.d, 0.12 * b.w],
    [0.1 * b.w, 0.3 * b.d, 0.1 * b.w],
  ]
  for (const [dx, dz, s] of rustData) {
    const rust = new THREE.Mesh(unitBoxGeo, metalRustMat)
    rust.scale.set(s, 0.01, s * 0.8)
    rust.position.set(b.x + dx, topY + 0.005, b.z + dz)
    meshes.push(rust)
  }

  // Puddles — pick from pool by global index
  const puddleData = [
    { dx: 0.15 * b.w, dz: 0.1 * b.d, scale: Math.min(b.w, b.d) * 0.25 },
    { dx: -0.2 * b.w, dz: -0.15 * b.d, scale: Math.min(b.w, b.d) * 0.18 },
  ]
  for (let pi = 0; pi < puddleData.length; pi++) {
    const pd = puddleData[pi]
    const mat = puddlePool[(globalIndex * 2 + pi) % PUDDLE_POOL_SIZE]
    const mesh = new THREE.Mesh(unitPlaneGeo, mat)
    mesh.scale.set(pd.scale, pd.scale, 1)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(b.x + pd.dx, topY + 0.015, b.z + pd.dz)
    meshes.push(mesh)
  }

  // Toxic drips
  const dripData = [
    [0.15 * b.w, halfD, 0.04, 0.5],
    [-0.2 * b.w, -halfD, 0.03, 0.6],
    [0.35 * b.w, 0.25 * b.d, 0.03, 0.35],
  ]
  const metalBotY = b.y - b.h / 2
  for (let i = 0; i < dripData.length; i++) {
    const [dx, dz, r, h] = dripData[i]
    const drip = new THREE.Mesh(thinCylinderGeo, metalToxicDripMat)
    drip.scale.set(r, 0, r)
    drip.position.set(b.x + dx, metalBotY, b.z + dz)
    meshes.push(drip)

    const blob = new THREE.Mesh(blobGeo, metalToxicBlobMat)
    blob.scale.setScalar(r * 2 / 0.06)
    blob.position.set(b.x + dx, metalBotY, b.z + dz)
    blob.visible = false
    meshes.push(blob)

    const speed = 0.25 + i * 0.1
    const phase = i * 0.33
    registerDrip(drip, blob, metalBotY, h, speed, phase)
  }

  return { meshes, mainMesh, update: null }
}

// ── Drip animation registry ───────────────────────────────────────────────
const activeDrips = []

function registerDrip(dripMesh, blobMesh, baseY, hangLen, speed, phase) {
  activeDrips.push({ drip: dripMesh, blob: blobMesh, baseY, hangLen, speed, phase })
}

// ── Global update for all animated materials ──────────────────────────────
export function updatePlatformMaterials(time) {
  volcanicMat.uniforms.time.value = time
  for (const m of puddlePool) m.uniforms.time.value = time

  for (const d of activeDrips) {
    const t = ((time * d.speed + d.phase) % 1 + 1) % 1
    if (t < 0.6) {
      const grow = t / 0.6
      d.drip.scale.y = d.hangLen * grow
      d.drip.position.y = d.baseY - (d.hangLen * grow) / 2
      d.blob.position.y = d.baseY - d.hangLen * grow
      d.blob.visible = true
      d.blob.scale.setScalar(0.8 + grow * 0.4)
    } else if (t < 0.85) {
      const drop = (t - 0.6) / 0.25
      d.drip.scale.y = d.hangLen
      d.drip.position.y = d.baseY - d.hangLen / 2
      d.blob.position.y = d.baseY - d.hangLen - drop * 1.2
      d.blob.visible = true
      d.blob.scale.setScalar((1 - drop) * 1.2)
    } else {
      const pause = (t - 0.85) / 0.15
      d.drip.scale.y = d.hangLen * (1 - pause)
      d.drip.position.y = d.baseY - (d.hangLen * (1 - pause)) / 2
      d.blob.visible = false
    }
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

const builders = [buildVolcanic, buildRuins, buildMetal]

export function createPlatformMeshes(b, index) {
  const style = ((index % 3) + 3) % 3
  if (style === 2) return builders[style](b, index)
  return builders[style](b)
}
