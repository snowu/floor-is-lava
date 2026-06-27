import * as THREE from 'three'

// ── Lava tuning parameters ──────────────────────────────────────────────────
export const LAVA = {
  // Overall
  speed:          0.045,   // master time scale
  uvScale:        0.06,    // world-space UV frequency (smaller = bigger blobs)

  // Vertex displacement
  heaveAmp:       0.6,     // broad rolling hills amplitude
  heaveFreq:      0.5,     // heave noise frequency
  heaveSpeed:     0.15,    // heave animation speed (relative to master)
  bubbleAmp1:     0.3,     // primary bubble layer amplitude
  bubbleFreq1:    2.0,     // primary bubble frequency
  bubbleSpeed1:   0.4,     // primary bubble speed
  bubbleAmp2:     0.15,    // secondary bubble amplitude
  bubbleFreq2:    4.0,     // secondary bubble frequency
  bubbleSpeed2:   0.5,     // secondary bubble speed
  popAmp:         0.8,     // sharp pop amplitude
  popFreq:        3.0,     // pop noise frequency
  popSpeed:       0.8,     // pop animation speed
  popExp:         3.0,     // pop sharpness exponent

  // Fragment — flow
  warpStrength:   3.0,     // domain warp multiplier
  flowSpeed1:     0.15,    // primary warp flow speed
  flowSpeed2:     0.1,     // secondary warp flow speed
  flowSpeed3:     0.05,    // tertiary warp flow speed
  flowSpeed4:     0.04,    // quaternary warp flow speed

  // Fragment — detail LOD
  detailNear:     8.0,     // distance where full detail starts fading
  detailRange:    25.0,    // fade distance
  octavesMin:     2.0,     // octaves at max distance
  octavesMax:     5.0,     // octaves up close

  // Fragment — colors
  darkCrust:      [0.08, 0.03, 0.01],
  deepRed:        [0.6, 0.08, 0.0],
  hotOrange:      [1.0, 0.35, 0.0],
  brightYellow:   [1.0, 0.85, 0.2],
  crustThreshold: 0.35,    // f boundary: crust → red
  orangeThreshold:0.65,    // f boundary: red → orange

  // Fragment — pulse
  pulseFreq:      1.5,     // hot spot noise frequency
  pulseSpeed:     0.6,     // hot spot animation speed
  pulseExp:       4.0,     // hot spot sharpness
  pulseIntensity: 0.25,    // hot spot brightness

  // Fragment — cracks
  crackFreq:      4.0,     // crack noise frequency
  crackWarp:      1.5,     // crack warp by q
  crackWidthNear: 0.1,     // smoothstep edge up close
  crackWidthFar:  0.5,     // smoothstep edge at distance
  crackIntensity: 0.4,     // crack brightness

  // Fragment — glow
  glowBase:       1.4,     // glow multiplier on f
  glowPulse:      0.4,     // glow contribution from pulse
}

const LAVA_VERTEX = `
  uniform float time;
  uniform float speed;
  uniform float uvScale;
  uniform float heaveAmp, heaveFreq, heaveSpeed;
  uniform float bubbleAmp1, bubbleFreq1, bubbleSpeed1;
  uniform float bubbleAmp2, bubbleFreq2, bubbleSpeed2;
  uniform float popAmp, popFreq, popSpeed, popExp;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  vec3 mod289v(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permutev(vec3 x) { return mod289v(((x * 34.0) + 1.0) * x); }

  float snoisev(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289v2(i);
    vec3 p = permutev(permutev(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    vec3 wp = (modelMatrix * vec4(pos, 1.0)).xyz;

    float t = time * speed;
    vec2 uv2 = wp.xz * uvScale;

    float heave = snoisev(uv2 * heaveFreq + t * heaveSpeed) * heaveAmp;

    float bubbles = snoisev(uv2 * bubbleFreq1 + t * bubbleSpeed1) * bubbleAmp1;
    bubbles += snoisev(uv2 * bubbleFreq2 - t * bubbleSpeed2) * bubbleAmp2;

    float pop = snoisev(uv2 * popFreq + t * popSpeed);
    pop = pow(max(pop, 0.0), popExp) * popAmp;

    pos.z += (heave + bubbles + pop);

    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const LAVA_FRAGMENT = `
  uniform float time;
  uniform float speed;
  uniform float uvScale;
  uniform float warpStrength;
  uniform float flowSpeed1, flowSpeed2, flowSpeed3, flowSpeed4;
  uniform float detailNear, detailRange, octavesMin, octavesMax;
  uniform vec3 darkCrust, deepRed, hotOrange, brightYellow;
  uniform float crustThreshold, orangeThreshold;
  uniform float pulseFreq, pulseSpeed, pulseExp, pulseIntensity;
  uniform float crackFreq, crackWarp, crackWidthNear, crackWidthFar, crackIntensity;
  uniform float glowBase, glowPulse;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float fbm(vec2 p, float octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 6; i++) {
      if (float(i) >= octaves) break;
      float blend = clamp(octaves - float(i), 0.0, 1.0);
      value += amplitude * snoise(p * frequency) * blend;
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = vWorldPos.xz * uvScale;
    float t = time * speed;

    float dist = length(vWorldPos - cameraPosition);
    float detail = clamp(1.0 - (dist - detailNear) / detailRange, 0.0, 1.0);
    float octaves = mix(octavesMin, octavesMax, detail);

    vec2 q = vec2(fbm(uv + vec2(0.0, 0.0) + t * flowSpeed1, octaves),
                  fbm(uv + vec2(5.2, 1.3) + t * flowSpeed2, octaves));

    vec2 r = vec2(fbm(uv + warpStrength * q + vec2(1.7, 9.2) + t * flowSpeed3, octaves),
                  fbm(uv + warpStrength * q + vec2(8.3, 2.8) + t * flowSpeed4, octaves));

    float f = fbm(uv + warpStrength * r, octaves);

    f = clamp(f * 0.5 + 0.5, 0.0, 1.0);
    f = smoothstep(0.0, 1.0, f);

    vec3 color;
    if (f < crustThreshold) {
      color = mix(darkCrust, deepRed, f / crustThreshold);
    } else if (f < orangeThreshold) {
      color = mix(deepRed, hotOrange, (f - crustThreshold) / (orangeThreshold - crustThreshold));
    } else {
      color = mix(hotOrange, brightYellow, (f - orangeThreshold) / (1.0 - orangeThreshold));
    }

    float pulse = snoise(uv * pulseFreq + t * pulseSpeed) * 0.5 + 0.5;
    pulse = pow(pulse, pulseExp);
    color += brightYellow * pulse * pulseIntensity * f;

    float cracks = abs(snoise(uv * crackFreq + q * crackWarp));
    cracks = 1.0 - smoothstep(0.0, mix(crackWidthFar, crackWidthNear, detail), cracks);
    color += hotOrange * cracks * crackIntensity * detail * detail;

    float glow = f * glowBase + pulse * glowPulse;

    gl_FragColor = vec4(color * glow, 1.0);
  }
`

function buildUniforms() {
  return {
    time:            { value: 0 },
    speed:           { value: LAVA.speed },
    uvScale:         { value: LAVA.uvScale },
    // vertex displacement
    heaveAmp:        { value: LAVA.heaveAmp },
    heaveFreq:       { value: LAVA.heaveFreq },
    heaveSpeed:      { value: LAVA.heaveSpeed },
    bubbleAmp1:      { value: LAVA.bubbleAmp1 },
    bubbleFreq1:     { value: LAVA.bubbleFreq1 },
    bubbleSpeed1:    { value: LAVA.bubbleSpeed1 },
    bubbleAmp2:      { value: LAVA.bubbleAmp2 },
    bubbleFreq2:     { value: LAVA.bubbleFreq2 },
    bubbleSpeed2:    { value: LAVA.bubbleSpeed2 },
    popAmp:          { value: LAVA.popAmp },
    popFreq:         { value: LAVA.popFreq },
    popSpeed:        { value: LAVA.popSpeed },
    popExp:          { value: LAVA.popExp },
    // fragment flow
    warpStrength:    { value: LAVA.warpStrength },
    flowSpeed1:      { value: LAVA.flowSpeed1 },
    flowSpeed2:      { value: LAVA.flowSpeed2 },
    flowSpeed3:      { value: LAVA.flowSpeed3 },
    flowSpeed4:      { value: LAVA.flowSpeed4 },
    // detail LOD
    detailNear:      { value: LAVA.detailNear },
    detailRange:     { value: LAVA.detailRange },
    octavesMin:      { value: LAVA.octavesMin },
    octavesMax:      { value: LAVA.octavesMax },
    // colors
    darkCrust:       { value: new THREE.Vector3(...LAVA.darkCrust) },
    deepRed:         { value: new THREE.Vector3(...LAVA.deepRed) },
    hotOrange:       { value: new THREE.Vector3(...LAVA.hotOrange) },
    brightYellow:    { value: new THREE.Vector3(...LAVA.brightYellow) },
    crustThreshold:  { value: LAVA.crustThreshold },
    orangeThreshold: { value: LAVA.orangeThreshold },
    // pulse
    pulseFreq:       { value: LAVA.pulseFreq },
    pulseSpeed:      { value: LAVA.pulseSpeed },
    pulseExp:        { value: LAVA.pulseExp },
    pulseIntensity:  { value: LAVA.pulseIntensity },
    // cracks
    crackFreq:       { value: LAVA.crackFreq },
    crackWarp:       { value: LAVA.crackWarp },
    crackWidthNear:  { value: LAVA.crackWidthNear },
    crackWidthFar:   { value: LAVA.crackWidthFar },
    crackIntensity:  { value: LAVA.crackIntensity },
    // glow
    glowBase:        { value: LAVA.glowBase },
    glowPulse:       { value: LAVA.glowPulse },
  }
}

let lavaMaterial

export function createGround() {
  const group = new THREE.Group()

  lavaMaterial = new THREE.ShaderMaterial({
    uniforms: buildUniforms(),
    vertexShader: LAVA_VERTEX,
    fragmentShader: LAVA_FRAGMENT,
    side: THREE.FrontSide,
  })

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 2000, 100, 500),
    lavaMaterial
  )
  plane.rotation.x = -Math.PI / 2
  plane.position.set(0, -0.1, -500)
  group.add(plane)

  return group
}

export function updateGround(time) {
  if (lavaMaterial) {
    lavaMaterial.uniforms.time.value = time
  }
}
