import * as THREE from 'three'

const BILLBOARD_VERT = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main(){
    vUv = uv;
    vWorldPos = (modelMatrix * vec4(position,1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`

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
  vec3 x2=2.0*fract(p*C.www)-1.0;vec3 h=abs(x2)-0.5;
  vec3 ox=floor(x2+0.5);vec3 a0=x2-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
`

const HASH_GLSL = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float hash(float p){return fract(sin(p*127.1)*43758.5453);}
`

// ── Style 0: Holographic Scan ────────────────────────────────────────────────
const FRAG_HOLOGRAPHIC = `
  ${SNOISE_GLSL}
  uniform float time;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main(){
    vec3 base = vec3(0.02, 0.02, 0.04);
    float hueShift = vUv.y * 3.0 + vUv.x * 0.5 + time * 0.4;
    vec3 rainbow = vec3(
      sin(hueShift) * 0.5 + 0.5,
      sin(hueShift + 2.094) * 0.5 + 0.5,
      sin(hueShift + 4.189) * 0.5 + 0.5
    );
    float scanY = fract(vUv.y * 40.0 - time * 2.0);
    float scanline = smoothstep(0.0, 0.05, scanY) * smoothstep(0.15, 0.1, scanY);
    float sweep = fract(-vUv.y + time * 0.6);
    float sweepBar = smoothstep(0.0, 0.02, sweep) * smoothstep(0.08, 0.06, sweep);
    float flicker = step(0.97, fract(sin(time * 43.0) * 100.0));
    float brightness = 0.6 + flicker * 0.4;
    vec3 color = base + rainbow * (scanline * 0.4 + sweepBar * 1.2) * brightness;
    float edgeX = min(vUv.x, 1.0 - vUv.x);
    float edgeY = min(vUv.y, 1.0 - vUv.y);
    float edge = smoothstep(0.05, 0.0, min(edgeX, edgeY));
    color += vec3(0.3, 0.6, 1.0) * edge * 0.8;
    gl_FragColor = vec4(color, 1.0);
  }
`

// ── Style 1: LED Matrix ─────────────────────────────────────────────────────
const FRAG_LED = `
  ${HASH_GLSL}
  uniform float time;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main(){
    vec3 base = vec3(0.01, 0.01, 0.02);
    vec2 gridSize = vec2(32.0, 20.0);
    vec2 cell = floor(vUv * gridSize);
    vec2 cellUv = fract(vUv * gridSize);
    float dot = smoothstep(0.45, 0.35, length(cellUv - 0.5));
    float wave = sin(cell.x * 0.3 - time * 3.0 + cell.y * 0.15) * 0.5 + 0.5;
    float rnd = hash(cell + floor(time * 4.0));
    float flicker = step(0.3, rnd);
    float rowPhase = cell.y / gridSize.y;
    vec3 ledColor = mix(vec3(1.0, 0.3, 0.0), vec3(1.0, 0.8, 0.0), step(0.5, rowPhase));
    float dead = step(0.95, hash(cell * 7.31));
    float on = dot * wave * flicker * (1.0 - dead);
    vec3 color = base + ledColor * on * 1.5;
    float gridLine = step(0.95, cellUv.x) + step(0.95, cellUv.y);
    color += vec3(0.03) * gridLine;
    gl_FragColor = vec4(color, 1.0);
  }
`

// ── Style 2: Glitch Static ──────────────────────────────────────────────────
const FRAG_GLITCH = `
  ${HASH_GLSL}
  uniform float time;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main(){
    vec2 uv = vUv;
    float tearTime = floor(time * 8.0);
    float tearY = hash(tearTime);
    float tearH = 0.02 + hash(tearTime + 1.0) * 0.06;
    float inTear = step(tearY, uv.y) * step(uv.y, tearY + tearH);
    uv.x += inTear * (hash(tearTime + 2.0) - 0.5) * 0.15;
    float staticNoise = hash(floor(uv * vec2(128.0, 80.0)) + time * 100.0);
    float rShift = 0.003 * sin(time * 15.0);
    float bShift = -0.003 * sin(time * 15.0 + 1.0);
    float r = hash(floor((uv + vec2(rShift, 0.0)) * vec2(128.0, 80.0)) + time * 100.0);
    float g = staticNoise;
    float b = hash(floor((uv + vec2(bShift, 0.0)) * vec2(128.0, 80.0)) + time * 100.0);
    float scanline = sin(uv.y * 300.0) * 0.1 + 0.9;
    float flashTime = floor(time * 3.0);
    float flashY = hash(flashTime + 5.0);
    float flash = smoothstep(0.03, 0.0, abs(uv.y - flashY)) * step(0.8, hash(flashTime));
    vec3 color = vec3(r, g, b) * 0.3 * scanline;
    color += vec3(0.8, 0.9, 1.0) * flash * 0.6;
    color = mix(vec3(0.02, 0.02, 0.03), color, 0.8);
    gl_FragColor = vec4(color, 1.0);
  }
`

// ── Style 3: Corroded Voltage ───────────────────────────────────────────────
const FRAG_VOLTAGE = `
  ${SNOISE_GLSL}
  ${HASH_GLSL}
  uniform float time;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main(){
    float corrosion = snoise(vWorldPos.xz * 4.0) * 0.5 + 0.5;
    vec3 metal = vec3(0.04, 0.04, 0.05);
    vec3 corroded = vec3(0.08, 0.12, 0.06);
    vec3 base = mix(metal, corroded, corrosion * 0.5);
    float pits = snoise(vWorldPos.xz * 12.0);
    base *= 0.8 + 0.2 * step(-0.3, pits);
    float arc = 0.0;
    for(int i = 0; i < 3; i++){
      float fi = float(i);
      float t = time * (2.0 + fi * 0.7) + fi * 2.1;
      float arcY = 0.3 + 0.4 * hash(floor(t) + fi);
      float jitter = snoise(vec2(vUv.x * 20.0 + t * 5.0, fi)) * 0.05;
      float dist = abs(vUv.y - arcY + jitter);
      float branch = snoise(vec2(vUv.x * 30.0 + fi * 10.0, t)) * 0.02;
      dist = min(dist, abs(vUv.y - arcY + branch + jitter * 0.5));
      arc += smoothstep(0.015, 0.0, dist) * (0.6 + 0.4 * hash(floor(t * 2.0) + fi));
    }
    vec3 arcColor = vec3(0.4, 0.6, 1.0);
    vec3 arcGlow = vec3(0.2, 0.3, 0.8);
    vec3 color = base + arcColor * arc * 2.0;
    float glowField = 0.0;
    for(int i = 0; i < 3; i++){
      float fi = float(i);
      float t = time * (2.0 + fi * 0.7) + fi * 2.1;
      float arcY = 0.3 + 0.4 * hash(floor(t) + fi);
      glowField += smoothstep(0.1, 0.0, abs(vUv.y - arcY)) * 0.15;
    }
    color += arcGlow * glowField;
    gl_FragColor = vec4(color, 1.0);
  }
`

// ── Style 4: Surveillance Feed ──────────────────────────────────────────────
const FRAG_SURVEILLANCE = `
  ${HASH_GLSL}
  uniform float time;
  uniform sampler2D feedTexture;
  uniform float gameScore;
  uniform float gameTime;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main(){
    vec2 uv = vUv - 0.5;
    float barrel = 1.0 + 0.1 * dot(uv, uv);
    uv *= barrel;
    uv += 0.5;
    vec3 color;
    if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0){
      color = vec3(0.0);
    } else {
      color = texture2D(feedTexture, uv).rgb;
      float scanline = sin(uv.y * 400.0) * 0.08 + 0.92;
      color *= scanline;
      color = mix(color, vec3(dot(color, vec3(0.299, 0.587, 0.114))) * vec3(0.6, 1.0, 0.6), 0.3);
      float grain = hash(uv * 500.0 + time * 30.0) * 0.08;
      color += grain;
    }
    float liveX = step(0.03, vUv.x) * step(vUv.x, 0.15);
    float liveY = step(0.03, vUv.y) * step(vUv.y, 0.09);
    float livePulse = step(0.0, sin(time * 3.0));
    float liveBox = liveX * liveY * livePulse;
    color = mix(color, vec3(1.0, 0.0, 0.0), liveBox * 0.7);
    float dotDist = length(vec2(vUv.x - 0.05, vUv.y - 0.06));
    float recDot = smoothstep(0.012, 0.008, dotDist) * livePulse;
    color = mix(color, vec3(1.0, 0.0, 0.0), recDot);
    float bottomBar = step(0.9, vUv.y) * (1.0 - step(0.97, vUv.y));
    color = mix(color, vec3(0.0), bottomBar * 0.7);
    if(bottomBar > 0.0){
      float scoreBright = step(0.01, gameScore) * step(0.7, vUv.x) * step(vUv.x, 0.95);
      color += vec3(0.0, 0.9, 0.3) * scoreBright * 0.4;
    }
    float tsX = step(0.8, vUv.x) * step(vUv.x, 0.97);
    float tsY = step(0.03, vUv.y) * step(vUv.y, 0.08);
    float tsBox = tsX * tsY;
    float timeBlink = step(0.0, sin(time * 1.0));
    color += vec3(0.5, 0.5, 0.5) * tsBox * 0.3 * timeBlink;
    float vig = 1.0 - 0.4 * dot(vUv - 0.5, vUv - 0.5) * 4.0;
    color *= vig;
    gl_FragColor = vec4(color, 1.0);
  }
`


// ── Style 6: Product Ads (canvas texture) ───────────────────────────────────
const FRAG_PRODUCT = `
  ${HASH_GLSL}
  uniform float time;
  uniform sampler2D adTexture;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main(){
    vec3 texColor = texture2D(adTexture, vUv).rgb;

    // Neon glow border
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float neonBorder = smoothstep(0.025, 0.01, edge);
    float borderPulse = sin(time * 2.0 + vUv.y * 10.0) * 0.3 + 0.7;

    // Pick border color from texture dominant
    float lum = dot(texColor, vec3(0.299, 0.587, 0.114));
    vec3 borderColor = mix(vec3(1.0, 0.3, 0.8), vec3(0.3, 1.0, 0.5), step(0.3, lum));

    vec3 color = texColor;
    color += borderColor * neonBorder * borderPulse * 0.6;

    // Slight scanline
    float scan = sin(vUv.y * 200.0) * 0.03 + 0.97;
    color *= scan;

    gl_FragColor = vec4(color, 1.0);
  }
`

// ── Canvas-generated pixel art ad textures ──────────────────────────────────

function createPixelCanvas(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = false
  ctx.scale(w / 128, h / 128)
  return { canvas, ctx }
}

function drawPixelText(ctx, text, x, y, color, scale) {
  ctx.fillStyle = color
  ctx.font = `bold ${scale}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

function createMagmaColaAd() {
  const { canvas, ctx } = createPixelCanvas(512, 512)
  // Dark background
  ctx.fillStyle = '#0a0005'
  ctx.fillRect(0, 0, 128, 128)

  // Lava gradient background
  const grad = ctx.createLinearGradient(0, 80, 0, 128)
  grad.addColorStop(0, '#330800')
  grad.addColorStop(1, '#ff4400')
  ctx.fillStyle = grad
  ctx.fillRect(0, 80, 128, 48)

  // Bottle shape
  ctx.fillStyle = '#cc1100'
  ctx.fillRect(52, 30, 24, 45) // body
  ctx.fillStyle = '#aa0800'
  ctx.fillRect(56, 18, 16, 14) // neck
  ctx.fillStyle = '#880600'
  ctx.fillRect(54, 14, 20, 6) // cap
  // Label stripe
  ctx.fillStyle = '#ffcc00'
  ctx.fillRect(52, 45, 24, 8)
  ctx.fillStyle = '#ff6600'
  ctx.fillRect(52, 53, 24, 4)

  // Text
  drawPixelText(ctx, 'MAGMA', 64, 8, '#ff4400', 12)
  drawPixelText(ctx, 'COLA', 64, 88, '#ffcc00', 14)
  drawPixelText(ctx, 'TASTE THE BURN', 64, 104, '#ff8844', 7)
  drawPixelText(ctx, '¢99', 100, 118, '#00ff88', 9)

  return canvas
}

function createLavaGuardAd() {
  const { canvas, ctx } = createPixelCanvas(512, 512)
  ctx.fillStyle = '#000808'
  ctx.fillRect(0, 0, 128, 128)

  // Green glow bg
  const grad = ctx.createRadialGradient(64, 60, 10, 64, 60, 60)
  grad.addColorStop(0, '#003322')
  grad.addColorStop(1, '#000808')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)

  // Boot shape
  ctx.fillStyle = '#00cc66'
  ctx.fillRect(40, 35, 28, 40) // shaft
  ctx.fillRect(36, 70, 45, 10) // sole
  ctx.fillRect(36, 65, 32, 8) // foot
  // Treads
  ctx.fillStyle = '#009944'
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(38 + i * 8, 76, 6, 3)
  }
  // Shield icon
  ctx.fillStyle = '#00ffaa'
  ctx.fillRect(80, 35, 16, 20)
  ctx.fillStyle = '#000808'
  ctx.fillRect(84, 39, 8, 12)
  ctx.fillStyle = '#00ffaa'
  ctx.fillRect(86, 42, 4, 6)

  drawPixelText(ctx, 'LAVAGUARD™', 64, 10, '#00ff88', 10)
  drawPixelText(ctx, 'BOOTS', 64, 24, '#00cc66', 14)
  drawPixelText(ctx, 'LAVA-PROOF', 64, 96, '#00ff88', 9)
  drawPixelText(ctx, 'GUARANTEED', 64, 108, '#008855', 8)
  drawPixelText(ctx, 'NEW!', 18, 118, '#ff0066', 8)

  return canvas
}

function createJumpJuiceAd() {
  const { canvas, ctx } = createPixelCanvas(512, 512)
  ctx.fillStyle = '#0a0010'
  ctx.fillRect(0, 0, 128, 128)

  // Electric purple bg
  const grad = ctx.createLinearGradient(0, 0, 128, 128)
  grad.addColorStop(0, '#1a0030')
  grad.addColorStop(1, '#0a0010')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)

  // Lightning bolt
  ctx.fillStyle = '#ffee00'
  ctx.beginPath()
  ctx.moveTo(68, 20)
  ctx.lineTo(55, 55)
  ctx.lineTo(65, 55)
  ctx.lineTo(52, 90)
  ctx.lineTo(80, 50)
  ctx.lineTo(70, 50)
  ctx.lineTo(82, 20)
  ctx.closePath()
  ctx.fill()

  // Glow
  ctx.shadowColor = '#ffee00'
  ctx.shadowBlur = 8
  ctx.fill()
  ctx.shadowBlur = 0

  // Can shape
  ctx.fillStyle = '#cc00ff'
  ctx.fillRect(90, 60, 20, 35)
  ctx.fillStyle = '#aa00dd'
  ctx.fillRect(90, 58, 20, 5)
  ctx.fillStyle = '#ffee00'
  ctx.fillRect(92, 70, 16, 6)

  drawPixelText(ctx, 'JUMP', 40, 10, '#ff00ff', 14)
  drawPixelText(ctx, 'JUICE', 40, 26, '#ffee00', 14)
  drawPixelText(ctx, '+50% AIR TIME', 64, 104, '#ff88ff', 8)
  drawPixelText(ctx, 'WARNING: MAY', 64, 114, '#664488', 6)
  drawPixelText(ctx, 'CAUSE FLIGHT', 64, 122, '#664488', 6)

  return canvas
}

function createFloorIsLavaAd() {
  const { canvas, ctx } = createPixelCanvas(512, 512)
  ctx.fillStyle = '#100000'
  ctx.fillRect(0, 0, 128, 128)

  // Lava bottom
  const grad = ctx.createLinearGradient(0, 70, 0, 128)
  grad.addColorStop(0, '#440000')
  grad.addColorStop(0.5, '#ff4400')
  grad.addColorStop(1, '#ffaa00')
  ctx.fillStyle = grad
  ctx.fillRect(0, 70, 128, 58)

  // Stick figure silhouette jumping
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(60, 28, 8, 4) // head
  ctx.fillRect(62, 32, 4, 12) // body
  ctx.fillRect(56, 36, 16, 3) // arms up
  ctx.fillRect(58, 44, 4, 10) // leg1
  ctx.fillRect(66, 44, 4, 10) // leg2

  // Platform under figure
  ctx.fillStyle = '#666666'
  ctx.fillRect(48, 56, 32, 6)

  drawPixelText(ctx, 'FLOOR IS', 64, 10, '#ff4400', 12)
  drawPixelText(ctx, 'LAVA', 64, 22, '#ffaa00', 16)
  drawPixelText(ctx, 'SEASON 47', 64, 80, '#ffffff', 9)
  drawPixelText(ctx, 'NOW STREAMING', 64, 94, '#ff6644', 8)
  drawPixelText(ctx, 'WILL YOU SURVIVE?', 64, 118, '#ff4400', 7)

  return canvas
}

function createSponsorAd() {
  const { canvas, ctx } = createPixelCanvas(512, 512)
  ctx.fillStyle = '#020210'
  ctx.fillRect(0, 0, 128, 128)

  // Corporate blue gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 128)
  grad.addColorStop(0, '#001133')
  grad.addColorStop(1, '#020210')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)

  // Hexagonal logo
  ctx.strokeStyle = '#4488ff'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6 - Math.PI / 2
    const x = 64 + Math.cos(a) * 25
    const y = 50 + Math.sin(a) * 25
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.stroke()
  // Inner hex
  ctx.strokeStyle = '#2266cc'
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6
    const x = 64 + Math.cos(a) * 15
    const y = 50 + Math.sin(a) * 15
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.stroke()
  // Center dot
  ctx.fillStyle = '#4488ff'
  ctx.fillRect(61, 47, 6, 6)

  drawPixelText(ctx, 'NEXACORP', 64, 10, '#4488ff', 11)
  drawPixelText(ctx, 'INDUSTRIES', 64, 22, '#2266cc', 9)
  drawPixelText(ctx, 'OFFICIAL SPONSOR', 64, 90, '#4488ff', 7)
  drawPixelText(ctx, 'BUILDING TOMORROW', 64, 104, '#336699', 7)
  drawPixelText(ctx, 'TODAY™', 64, 116, '#336699', 8)

  return canvas
}

const AD_GENERATORS = [
  createMagmaColaAd,
  createLavaGuardAd,
  createJumpJuiceAd,
  createFloorIsLavaAd,
  createSponsorAd,
]

function createAdTexture(variantIndex) {
  const gen = AD_GENERATORS[variantIndex % AD_GENERATORS.length]
  const canvas = gen()
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const adTextures = AD_GENERATORS.map((_, i) => createAdTexture(i))

// ── Registry ────────────────────────────────────────────────────────────────

const BILLBOARD_STYLES = [
  { name: 'Holographic Scan',     frag: FRAG_HOLOGRAPHIC },
  { name: 'LED Matrix',           frag: FRAG_LED },
  { name: 'Glitch Static',        frag: FRAG_GLITCH },
  { name: 'Corroded Voltage',     frag: FRAG_VOLTAGE },
  { name: 'Product Ad',           frag: FRAG_PRODUCT, isProductAd: true },
]

export const BILLBOARD_STYLE_COUNT = BILLBOARD_STYLES.length
export const PRODUCT_AD_STYLE_INDEX = BILLBOARD_STYLES.findIndex(s => s.isProductAd)

const materials = BILLBOARD_STYLES.map(s => {
  const uniforms = { time: { value: 0 } }
  if (s.isSurveillance) {
    uniforms.feedTexture = { value: null }
    uniforms.gameScore = { value: 0 }
    uniforms.gameTime = { value: 0 }
  }
  if (s.isProductAd) {
    uniforms.adTexture = { value: adTextures[0] }
  }
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: BILLBOARD_VERT,
    fragmentShader: s.frag,
  })
})

const frameMat = new THREE.MeshStandardMaterial({
  color: 0x222222, roughness: 0.6, metalness: 0.9,
})

const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1)

// ── Surveillance camera system ──────────────────────────────────────────────

const FEED_RESOLUTION = 256

let mainRenderer = null
let mainScene = null

export function initSurveillance(renderer, scene) {
  mainRenderer = renderer
  mainScene = scene
}

// ── Floating surveillance screens (sky) — 2 only ────────────────────────────

const skyScreens = []

function makeSurvScreen(w, h) {
  const renderTarget = new THREE.WebGLRenderTarget(FEED_RESOLUTION, FEED_RESOLUTION, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      feedTexture: { value: renderTarget.texture },
      gameScore: { value: 0 },
      gameTime: { value: 0 },
    },
    vertexShader: BILLBOARD_VERT,
    fragmentShader: FRAG_SURVEILLANCE,
    side: THREE.DoubleSide,
  })
  const geo = new THREE.PlaneGeometry(w, h)
  const mesh = new THREE.Mesh(geo, mat)
  const frameGeo = new THREE.EdgesGeometry(geo)
  const frameLine = new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({
    color: 0x444466,
  }))
  mesh.add(frameLine)
  const camera = new THREE.PerspectiveCamera(50, w / h, 0.5, 200)
  return { mesh, renderTarget, camera, mat }
}

export function createSkyScreens(scene) {
  const left = makeSurvScreen(12, 7)
  skyScreens.push({ ...left, type: 'left', rngSeed: Math.random() })
  scene.add(left.mesh)

  const right = makeSurvScreen(12, 7)
  skyScreens.push({ ...right, type: 'right', rngSeed: Math.random() })
  scene.add(right.mesh)
}

function getCameraAngle(mode, time, playerPos, side) {
  const camPos = { x: 0, y: 0, z: 0 }

  if (mode === 0) {
    // Front wide — current angle
    camPos.x = playerPos.x + side * 20
    camPos.y = 21
    camPos.z = playerPos.z - 30
  } else if (mode === 1) {
    // Slightly behind + above
    camPos.x = playerPos.x + side * 8
    camPos.y = 18
    camPos.z = playerPos.z + 15
  } else {
    // Orbiting around character
    const a = time * 0.5 + side * Math.PI
    camPos.x = playerPos.x + Math.cos(a) * 15
    camPos.y = 14
    camPos.z = playerPos.z + Math.sin(a) * 15
  }

  return camPos
}

const VIEW_COUNT = 3
const viewPool = []
for (let i = 0; i < VIEW_COUNT; i++) viewPool.push(i)

function pickFromPool() {
  if (viewPool.length === 0) return 0
  const idx = Math.floor(Math.random() * viewPool.length)
  return viewPool.splice(idx, 1)[0]
}

function releaseToPool(mode) {
  if (!viewPool.includes(mode)) viewPool.push(mode)
}

export function updateSkyScreens(time, playerPos, score, gameTime) {
  if (!mainRenderer || !mainScene || skyScreens.length === 0) return

  const currentTarget = mainRenderer.getRenderTarget()

  for (const s of skyScreens) {
    const switchInterval = 5 + s.rngSeed * 5
    const epoch = Math.floor(time / switchInterval + s.rngSeed * 100)

    if (s.lastEpoch === undefined) {
      s.currentView = pickFromPool()
      s.lastEpoch = epoch
    } else if (epoch !== s.lastEpoch) {
      releaseToPool(s.currentView)
      s.currentView = pickFromPool()
      s.lastEpoch = epoch
    }

    const side = s.type === 'left' ? -1 : 1
    const cam = getCameraAngle(s.currentView, time, playerPos, side)

    const screenX = playerPos.x + side * 20
    const screenY = 21
    const screenZ = playerPos.z - 30

    s.mesh.position.set(screenX, screenY, screenZ)
    s.mesh.lookAt(playerPos.x, playerPos.y + 1, playerPos.z)

    s.camera.position.set(cam.x, cam.y, cam.z)
    s.camera.lookAt(playerPos.x, playerPos.y + 1, playerPos.z)

    s.mesh.visible = false
    mainRenderer.setRenderTarget(s.renderTarget)
    mainRenderer.render(mainScene, s.camera)
    s.mesh.visible = true

    s.mat.uniforms.time.value = time
    s.mat.uniforms.gameScore.value = score
    s.mat.uniforms.gameTime.value = gameTime
  }

  mainRenderer.setRenderTarget(currentTarget)
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getBillboardStyleName(styleIndex) {
  return BILLBOARD_STYLES[styleIndex % BILLBOARD_STYLES.length].name
}

export function isProductAdStyle(styleIndex) {
  return BILLBOARD_STYLES[styleIndex % BILLBOARD_STYLES.length].isProductAd === true
}

let productAdCounter = 0

export function createBillboardMeshes(bb, config, styleIndex = 0) {
  const meshes = []
  const bbH = config.BILLBOARD_HEIGHT
  const bbW = config.BILLBOARD_WIDTH
  const bbD = config.BILLBOARD_DEPTH
  const bbY = bb.y + bbH / 2

  let mat = materials[styleIndex % materials.length]

  if (isProductAdStyle(styleIndex)) {
    mat = mat.clone()
    mat.uniforms.adTexture = { value: adTextures[productAdCounter % adTextures.length] }
    mat.uniforms.time = { value: 0 }
    productAdCounter++
  }

  const main = new THREE.Mesh(unitBoxGeo, mat)
  main.scale.set(bbW, bbH, bbD)
  main.position.set(bb.x, bbY, bb.z)
  meshes.push(main)

  const frameH = 0.15
  for (const ySign of [1, -1]) {
    const frame = new THREE.Mesh(unitBoxGeo, frameMat)
    frame.scale.set(bbW + 0.1, frameH, bbD + 0.1)
    frame.position.set(bb.x, bbY + ySign * (bbH / 2 + frameH / 2), bb.z)
    meshes.push(frame)
  }

  return { meshes, mainMesh: main, styleIndex }
}

const productAdMaterials = []

export function registerProductAdMaterial(mat) {
  productAdMaterials.push(mat)
}

export function updateBillboardMaterials(time, score, gameTime) {
  for (const mat of materials) {
    mat.uniforms.time.value = time
  }
  for (const mat of productAdMaterials) {
    mat.uniforms.time.value = time
  }
}
