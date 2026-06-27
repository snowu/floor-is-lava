import * as THREE from 'three'
import config from './config.js'

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
    speed:           { value: config.LAVA_SPEED },
    uvScale:         { value: config.LAVA_UV_SCALE },
    heaveAmp:        { value: config.LAVA_HEAVE_AMP },
    heaveFreq:       { value: config.LAVA_HEAVE_FREQ },
    heaveSpeed:      { value: config.LAVA_HEAVE_SPEED },
    bubbleAmp1:      { value: config.LAVA_BUBBLE_AMP1 },
    bubbleFreq1:     { value: config.LAVA_BUBBLE_FREQ1 },
    bubbleSpeed1:    { value: config.LAVA_BUBBLE_SPEED1 },
    bubbleAmp2:      { value: config.LAVA_BUBBLE_AMP2 },
    bubbleFreq2:     { value: config.LAVA_BUBBLE_FREQ2 },
    bubbleSpeed2:    { value: config.LAVA_BUBBLE_SPEED2 },
    popAmp:          { value: config.LAVA_POP_AMP },
    popFreq:         { value: config.LAVA_POP_FREQ },
    popSpeed:        { value: config.LAVA_POP_SPEED },
    popExp:          { value: config.LAVA_POP_EXP },
    warpStrength:    { value: config.LAVA_WARP_STRENGTH },
    flowSpeed1:      { value: config.LAVA_FLOW_SPEED1 },
    flowSpeed2:      { value: config.LAVA_FLOW_SPEED2 },
    flowSpeed3:      { value: config.LAVA_FLOW_SPEED3 },
    flowSpeed4:      { value: config.LAVA_FLOW_SPEED4 },
    detailNear:      { value: config.LAVA_DETAIL_NEAR },
    detailRange:     { value: config.LAVA_DETAIL_RANGE },
    octavesMin:      { value: config.LAVA_OCTAVES_MIN },
    octavesMax:      { value: config.LAVA_OCTAVES_MAX },
    darkCrust:       { value: new THREE.Vector3(0.08, 0.03, 0.01) },
    deepRed:         { value: new THREE.Vector3(0.6, 0.08, 0.0) },
    hotOrange:       { value: new THREE.Vector3(1.0, 0.35, 0.0) },
    brightYellow:    { value: new THREE.Vector3(1.0, 0.85, 0.2) },
    crustThreshold:  { value: config.LAVA_CRUST_THRESHOLD },
    orangeThreshold: { value: config.LAVA_ORANGE_THRESHOLD },
    pulseFreq:       { value: config.LAVA_PULSE_FREQ },
    pulseSpeed:      { value: config.LAVA_PULSE_SPEED },
    pulseExp:        { value: config.LAVA_PULSE_EXP },
    pulseIntensity:  { value: config.LAVA_PULSE_INTENSITY },
    crackFreq:       { value: config.LAVA_CRACK_FREQ },
    crackWarp:       { value: config.LAVA_CRACK_WARP },
    crackWidthNear:  { value: config.LAVA_CRACK_WIDTH_NEAR },
    crackWidthFar:   { value: config.LAVA_CRACK_WIDTH_FAR },
    crackIntensity:  { value: config.LAVA_CRACK_INTENSITY },
    glowBase:        { value: config.LAVA_GLOW_BASE },
    glowPulse:       { value: config.LAVA_GLOW_PULSE },
  }
}

let lavaMaterial
let lavaPlane

export function createGround() {
  const group = new THREE.Group()

  lavaMaterial = new THREE.ShaderMaterial({
    uniforms: buildUniforms(),
    vertexShader: LAVA_VERTEX,
    fragmentShader: LAVA_FRAGMENT,
    side: THREE.FrontSide,
  })

  lavaPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400, 200, 200),
    lavaMaterial
  )
  lavaPlane.rotation.x = -Math.PI / 2
  lavaPlane.position.set(0, -0.1, 0)
  group.add(lavaPlane)

  return group
}

export function updateGround(time, playerX, playerZ) {
  if (lavaMaterial) {
    const u = lavaMaterial.uniforms
    u.time.value = time
    u.speed.value = config.LAVA_SPEED
    u.uvScale.value = config.LAVA_UV_SCALE
    u.heaveAmp.value = config.LAVA_HEAVE_AMP
    u.heaveFreq.value = config.LAVA_HEAVE_FREQ
    u.heaveSpeed.value = config.LAVA_HEAVE_SPEED
    u.bubbleAmp1.value = config.LAVA_BUBBLE_AMP1
    u.bubbleFreq1.value = config.LAVA_BUBBLE_FREQ1
    u.bubbleSpeed1.value = config.LAVA_BUBBLE_SPEED1
    u.bubbleAmp2.value = config.LAVA_BUBBLE_AMP2
    u.bubbleFreq2.value = config.LAVA_BUBBLE_FREQ2
    u.bubbleSpeed2.value = config.LAVA_BUBBLE_SPEED2
    u.popAmp.value = config.LAVA_POP_AMP
    u.popFreq.value = config.LAVA_POP_FREQ
    u.popSpeed.value = config.LAVA_POP_SPEED
    u.popExp.value = config.LAVA_POP_EXP
    u.warpStrength.value = config.LAVA_WARP_STRENGTH
    u.flowSpeed1.value = config.LAVA_FLOW_SPEED1
    u.flowSpeed2.value = config.LAVA_FLOW_SPEED2
    u.flowSpeed3.value = config.LAVA_FLOW_SPEED3
    u.flowSpeed4.value = config.LAVA_FLOW_SPEED4
    u.detailNear.value = config.LAVA_DETAIL_NEAR
    u.detailRange.value = config.LAVA_DETAIL_RANGE
    u.octavesMin.value = config.LAVA_OCTAVES_MIN
    u.octavesMax.value = config.LAVA_OCTAVES_MAX
    u.crustThreshold.value = config.LAVA_CRUST_THRESHOLD
    u.orangeThreshold.value = config.LAVA_ORANGE_THRESHOLD
    u.pulseFreq.value = config.LAVA_PULSE_FREQ
    u.pulseSpeed.value = config.LAVA_PULSE_SPEED
    u.pulseExp.value = config.LAVA_PULSE_EXP
    u.pulseIntensity.value = config.LAVA_PULSE_INTENSITY
    u.crackFreq.value = config.LAVA_CRACK_FREQ
    u.crackWarp.value = config.LAVA_CRACK_WARP
    u.crackWidthNear.value = config.LAVA_CRACK_WIDTH_NEAR
    u.crackWidthFar.value = config.LAVA_CRACK_WIDTH_FAR
    u.crackIntensity.value = config.LAVA_CRACK_INTENSITY
    u.glowBase.value = config.LAVA_GLOW_BASE
    u.glowPulse.value = config.LAVA_GLOW_PULSE
  }
  if (lavaPlane) {
    const gridSize = 2 // matches plane subdivision spacing (400 / 200)
    lavaPlane.position.x = Math.round(playerX / gridSize) * gridSize
    lavaPlane.position.z = Math.round(playerZ / gridSize) * gridSize
  }
}
