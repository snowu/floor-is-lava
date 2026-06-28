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

// ── Style 3: Hazard Chevrons ────────────────────────────────────────────────
const FRAG_CHEVRONS = `
  uniform float time;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main(){
    vec3 base = vec3(0.06, 0.06, 0.08);
    float diag = fract((vUv.x + vUv.y) * 5.0);
    float stripe = step(0.45, diag) * (1.0 - step(0.55, diag));
    float bandY = fract(vUv.y * 3.0);
    float inBand = step(0.6, bandY);
    vec3 yellow = vec3(1.0, 0.7, 0.0);
    vec3 color = mix(base, mix(base * 1.5, yellow, stripe), inBand * 0.85);
    float edge = min(vUv.y, 1.0 - vUv.y);
    float glow = smoothstep(0.03, 0.0, edge);
    float pulse = sin(time * 2.0) * 0.2 + 0.8;
    color += vec3(1.0, 0.4, 0.0) * glow * pulse * 1.5;
    gl_FragColor = vec4(color, 1.0);
  }
`

// ── Style 4: Corroded Voltage ───────────────────────────────────────────────
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

// ── Style 5: Danger Countdown (7-segment) ───────────────────────────────────
const FRAG_COUNTDOWN = `
  ${HASH_GLSL}
  uniform float time;
  uniform float gameScore;
  uniform float gameTime;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  float segment(vec2 p, vec2 a, vec2 b, float w){
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return smoothstep(w, w * 0.5, length(pa - ba * h));
  }

  float digit(vec2 p, int d){
    float w = 0.04;
    float s = 0.0;
    bool t  = d!=1&&d!=4;
    bool tr = d!=5&&d!=6;
    bool br = d!=2;
    bool bo = d!=1&&d!=4&&d!=7;
    bool bl = d==0||d==2||d==6||d==8;
    bool tl = d==0||d==4||d==5||d==6||d==8||d==9;
    bool mi = d!=0&&d!=1&&d!=7;
    if(t)  s += segment(p, vec2(-0.12, 0.24), vec2(0.12, 0.24), w);
    if(tr) s += segment(p, vec2(0.14, 0.22), vec2(0.14, 0.02), w);
    if(br) s += segment(p, vec2(0.14,-0.02), vec2(0.14,-0.22), w);
    if(bo) s += segment(p, vec2(-0.12,-0.24), vec2(0.12,-0.24), w);
    if(bl) s += segment(p, vec2(-0.14,-0.02), vec2(-0.14,-0.22), w);
    if(tl) s += segment(p, vec2(-0.14, 0.22), vec2(-0.14, 0.02), w);
    if(mi) s += segment(p, vec2(-0.12, 0.0), vec2(0.12, 0.0), w);
    return clamp(s, 0.0, 1.0);
  }

  void main(){
    vec3 base = vec3(0.03, 0.02, 0.02);

    // Use game score if available, else countdown
    float displayVal = gameScore > 0.0 ? gameScore : mod(99.0 - time * 2.0, 100.0);
    int val = int(displayVal);
    int tens = val / 10;
    int ones = val - tens * 10;

    vec2 p = vUv - 0.5;
    p.x *= 1.5;

    float d = 0.0;
    d += digit(p + vec2(0.22, 0.0), tens);
    d += digit(p - vec2(0.22, 0.0), ones);

    float urgency = gameScore > 0.0 ? 0.3 : 1.0 - float(val) / 99.0;
    float pulse = sin(time * (3.0 + urgency * 8.0)) * 0.3 + 0.7;

    vec3 digitColor = mix(vec3(1.0, 0.3, 0.0), vec3(1.0, 0.05, 0.0), urgency);
    vec3 color = base + digitColor * d * pulse * 2.0;

    // Timer bar at bottom
    float timerBar = step(0.92, vUv.y) * (1.0 - step(0.96, vUv.y));
    float timerFill = step(vUv.x, fract(gameTime * 0.1));
    color += vec3(0.0, 0.8, 0.3) * timerBar * timerFill * 0.8;

    float glow = digit(p + vec2(0.22, 0.0), tens) + digit(p - vec2(0.22, 0.0), ones);
    color += digitColor * 0.15 * smoothstep(0.0, 0.3, glow);

    float borderFlash = step(float(val), 10.0);
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float border = smoothstep(0.04, 0.0, edge);
    color += vec3(1.0, 0.0, 0.0) * border * borderFlash * pulse;

    gl_FragColor = vec4(color, 1.0);
  }
`

// ── Style 6: Surveillance Feed ──────────────────────────────────────────────
const FRAG_SURVEILLANCE = `
  ${HASH_GLSL}
  uniform float time;
  uniform sampler2D feedTexture;
  uniform float gameScore;
  uniform float gameTime;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main(){
    // CRT barrel distortion
    vec2 uv = vUv - 0.5;
    float barrel = 1.0 + 0.1 * dot(uv, uv);
    uv *= barrel;
    uv += 0.5;

    vec3 color;
    if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0){
      color = vec3(0.0);
    } else {
      color = texture2D(feedTexture, uv).rgb;

      // Scanlines
      float scanline = sin(uv.y * 400.0) * 0.08 + 0.92;
      color *= scanline;

      // Slight green tint (security cam look)
      color = mix(color, vec3(dot(color, vec3(0.299, 0.587, 0.114))) * vec3(0.6, 1.0, 0.6), 0.3);

      // Noise grain
      float grain = hash(uv * 500.0 + time * 30.0) * 0.08;
      color += grain;
    }

    // "LIVE" indicator — top-left
    float liveX = step(0.03, vUv.x) * step(vUv.x, 0.15);
    float liveY = step(0.03, vUv.y) * step(vUv.y, 0.09);
    float livePulse = step(0.0, sin(time * 3.0));
    float liveBox = liveX * liveY * livePulse;
    color = mix(color, vec3(1.0, 0.0, 0.0), liveBox * 0.7);

    // Red recording dot
    float dotDist = length(vec2(vUv.x - 0.05, vUv.y - 0.06));
    float recDot = smoothstep(0.012, 0.008, dotDist) * livePulse;
    color = mix(color, vec3(1.0, 0.0, 0.0), recDot);

    // Score ticker — bottom bar
    float bottomBar = step(0.9, vUv.y) * (1.0 - step(0.97, vUv.y));
    color = mix(color, vec3(0.0, 0.0, 0.0), bottomBar * 0.7);

    // Score segments in bottom bar
    if(bottomBar > 0.0){
      float scoreVal = gameScore;
      vec2 sp = vec2((vUv.x - 0.7) * 8.0, (vUv.y - 0.91) * 30.0 - 0.5);
      int sc = int(mod(scoreVal, 100.0));
      int st = sc / 10;
      int so = sc - st * 10;
      // Simplified score display — just bright bars for non-zero
      float scoreBright = step(0.01, scoreVal) * step(0.7, vUv.x) * step(vUv.x, 0.95);
      color += vec3(0.0, 0.9, 0.3) * scoreBright * 0.4;
    }

    // Timestamp — top-right corner glow
    float tsX = step(0.8, vUv.x) * step(vUv.x, 0.97);
    float tsY = step(0.03, vUv.y) * step(vUv.y, 0.08);
    float tsBox = tsX * tsY;
    float timeBlink = step(0.0, sin(time * 1.0));
    color += vec3(0.5, 0.5, 0.5) * tsBox * 0.3 * timeBlink;

    // Vignette
    float vig = 1.0 - 0.4 * dot(vUv - 0.5, vUv - 0.5) * 4.0;
    color *= vig;

    gl_FragColor = vec4(color, 1.0);
  }
`

// ── Style 7: Corporate Propaganda ───────────────────────────────────────────
const FRAG_CORPORATE = `
  ${HASH_GLSL}
  ${SNOISE_GLSL}
  uniform float time;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  float box(vec2 p, vec2 s){
    vec2 d = abs(p) - s;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  float hexagon(vec2 p, float r){
    p = abs(p);
    return max(p.x * 0.866 + p.y * 0.5, p.y) - r;
  }

  float triangle(vec2 p, float r){
    p.y += r * 0.3;
    float k = sqrt(3.0);
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if(p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
  }

  void main(){
    vec3 base = vec3(0.02, 0.03, 0.06);

    // Pick logo variant based on world position
    float variant = floor(mod(vWorldPos.z * 0.1 + vWorldPos.x * 0.3, 3.0));
    vec2 center = vUv - vec2(0.5, 0.45);
    center.x *= 1.5;

    float logo = 0.0;
    vec3 logoColor;

    if(variant < 1.0){
      // Hexagonal corp logo
      logo = smoothstep(0.01, 0.0, hexagon(center, 0.2));
      logo -= smoothstep(0.01, 0.0, hexagon(center, 0.15));
      logo += smoothstep(0.01, 0.0, hexagon(center, 0.08));
      logoColor = vec3(0.3, 0.5, 1.0);
    } else if(variant < 2.0){
      // Triangle warning logo
      logo = smoothstep(0.01, 0.0, triangle(center, 0.22));
      logo -= smoothstep(0.01, 0.0, triangle(center, 0.17));
      float innerDot = smoothstep(0.04, 0.02, length(center + vec2(0.0, 0.04)));
      logo += innerDot;
      logoColor = vec3(1.0, 0.8, 0.2);
    } else {
      // Concentric circles
      float r = length(center);
      logo = smoothstep(0.01, 0.0, abs(r - 0.2) - 0.015);
      logo += smoothstep(0.01, 0.0, abs(r - 0.12) - 0.01);
      logo += smoothstep(0.03, 0.01, r) * 0.5;
      logoColor = vec3(1.0, 0.3, 0.3);
    }

    vec3 color = base + logoColor * logo * 1.2;

    // Scrolling "text" bars at bottom
    float textZone = step(0.7, vUv.y) * (1.0 - step(0.92, vUv.y));
    if(textZone > 0.0){
      float row = floor((vUv.y - 0.7) * 60.0);
      float scrollX = fract(vUv.x * 1.0 + time * 0.3 + row * 0.1);
      float textLine = 0.0;
      for(float i = 0.0; i < 8.0; i++){
        float blockX = hash(vec2(i, row)) * 0.8 + 0.1;
        float blockW = 0.02 + hash(vec2(i + 10.0, row)) * 0.08;
        textLine += step(blockX, scrollX) * step(scrollX, blockX + blockW);
      }
      color += vec3(0.4, 0.6, 0.9) * textLine * 0.5;
    }

    // "OBEY" / "COMPLY" — blocky text hint at top
    float topBar = step(0.02, vUv.y) * step(vUv.y, 0.12);
    float letterPattern = step(0.5, hash(floor(vUv * vec2(20.0, 8.0)) + 42.0));
    color += vec3(0.5, 0.7, 1.0) * topBar * letterPattern * 0.4;

    // Barcode at very bottom
    float barZone = step(0.94, vUv.y);
    float bar = step(0.5, hash(vec2(floor(vUv.x * 60.0), 0.0)));
    color += vec3(0.8) * barZone * bar * 0.3;

    // Subtle pulse
    float pulse = sin(time * 1.5) * 0.05 + 0.95;
    color *= pulse;

    gl_FragColor = vec4(color, 1.0);
  }
`

// ── Style 8: Product Ads ────────────────────────────────────────────────────
const FRAG_PRODUCT = `
  ${HASH_GLSL}
  ${SNOISE_GLSL}
  uniform float time;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  float box(vec2 p, vec2 s){
    vec2 d = abs(p) - s;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  float roundedBox(vec2 p, vec2 s, float r){
    vec2 d = abs(p) - s + r;
    return length(max(d, 0.0)) - r;
  }

  void main(){
    vec3 base = vec3(0.03, 0.01, 0.04);

    // Pick product based on world position
    float variant = floor(mod(vWorldPos.z * 0.07 + vWorldPos.x * 0.5, 3.0));
    vec2 center = vUv - vec2(0.5, 0.4);
    center.x *= 1.5;

    vec3 productColor;
    float productShape = 0.0;
    vec3 accentColor;

    if(variant < 1.0){
      // Bottle silhouette — "MAGMA COLA"
      float body = smoothstep(0.01, 0.0, box(center + vec2(0.0, 0.05), vec2(0.06, 0.15)));
      float neck = smoothstep(0.01, 0.0, box(center - vec2(0.0, 0.12), vec2(0.03, 0.05)));
      float cap = smoothstep(0.01, 0.0, box(center - vec2(0.0, 0.18), vec2(0.035, 0.015)));
      productShape = max(max(body, neck), cap);
      productColor = vec3(1.0, 0.2, 0.05);
      accentColor = vec3(1.0, 0.6, 0.0);
    } else if(variant < 2.0){
      // Boot silhouette — "LAVAGUARD BOOTS"
      float sole = smoothstep(0.01, 0.0, box(center + vec2(0.02, 0.12), vec2(0.1, 0.025)));
      float shaft = smoothstep(0.01, 0.0, box(center + vec2(-0.02, -0.02), vec2(0.06, 0.12)));
      productShape = max(sole, shaft);
      productColor = vec3(0.1, 0.9, 0.3);
      accentColor = vec3(0.0, 1.0, 0.5);
    } else {
      // Lightning bolt — "JUMP JUICE"
      vec2 bp = center * 6.0;
      float bolt = smoothstep(0.15, 0.0, abs(bp.x - 0.3 * step(0.0, bp.y) + 0.3 * step(bp.y, 0.0)));
      bolt *= step(-1.2, bp.y) * step(bp.y, 1.2);
      productShape = bolt * 0.7;
      productColor = vec3(1.0, 0.9, 0.0);
      accentColor = vec3(1.0, 0.5, 1.0);
    }

    // Neon glow around product
    vec3 color = base + productColor * productShape * 1.5;

    // Animated price tag — flickering
    float priceZone = step(0.75, vUv.y) * step(vUv.y, 0.85);
    float priceFlicker = step(0.3, fract(time * 4.0 + hash(floor(vWorldPos.z))));
    float priceBg = smoothstep(0.01, 0.0, roundedBox(vec2(vUv.x - 0.75, vUv.y - 0.8), vec2(0.15, 0.035), 0.01));
    color += accentColor * priceBg * priceFlicker * 1.2;

    // "Text" lines below product
    float textZone = step(0.55, vUv.y) * step(vUv.y, 0.7);
    float textLines = step(0.5, hash(floor(vUv * vec2(25.0, 12.0)) + variant * 10.0));
    color += accentColor * textZone * textLines * 0.2;

    // Animated border — neon outline
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float neonBorder = smoothstep(0.025, 0.01, edge);
    float borderPulse = sin(time * 2.0 + vUv.y * 10.0) * 0.3 + 0.7;
    color += accentColor * neonBorder * borderPulse * 0.6;

    // Starbursts / sparkle
    float sparkle = smoothstep(0.98, 1.0, hash(floor(vUv * 30.0) + floor(time * 6.0)));
    color += vec3(1.0) * sparkle * 0.8;

    gl_FragColor = vec4(color, 1.0);
  }
`

// ── Registry ────────────────────────────────────────────────────────────────

const BILLBOARD_STYLES = [
  { name: 'Holographic Scan',   frag: FRAG_HOLOGRAPHIC },
  { name: 'LED Matrix',         frag: FRAG_LED },
  { name: 'Glitch Static',      frag: FRAG_GLITCH },
  { name: 'Hazard Chevrons',    frag: FRAG_CHEVRONS },
  { name: 'Corroded Voltage',   frag: FRAG_VOLTAGE },
  { name: 'Danger Countdown',   frag: FRAG_COUNTDOWN },
  { name: 'Surveillance Feed',  frag: FRAG_SURVEILLANCE, isSurveillance: true },
  { name: 'Corporate Propaganda', frag: FRAG_CORPORATE },
  { name: 'Product Ads',        frag: FRAG_PRODUCT },
]

export const BILLBOARD_STYLE_COUNT = BILLBOARD_STYLES.length
export const SURVEILLANCE_STYLE_INDEX = BILLBOARD_STYLES.findIndex(s => s.isSurveillance)

const materials = BILLBOARD_STYLES.map(s => {
  const uniforms = { time: { value: 0 } }
  if (s.frag.includes('gameScore')) {
    uniforms.gameScore = { value: 0 }
    uniforms.gameTime = { value: 0 }
  }
  if (s.isSurveillance) {
    uniforms.feedTexture = { value: null }
    uniforms.gameScore = { value: 0 }
    uniforms.gameTime = { value: 0 }
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

const MAX_ACTIVE_FEEDS = 4
const FEED_RESOLUTION = 256

const surveillanceCams = []
let mainRenderer = null
let mainScene = null
let mainCamera = null

export function initSurveillance(renderer, scene, camera) {
  mainRenderer = renderer
  mainScene = scene
  mainCamera = camera
}

export function registerSurveillanceBillboard(mesh, position) {
  const renderTarget = new THREE.WebGLRenderTarget(FEED_RESOLUTION, FEED_RESOLUTION, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })
  const survCam = new THREE.PerspectiveCamera(60, 1, 0.5, 150)
  surveillanceCams.push({ mesh, position, renderTarget, camera: survCam })
  mesh.material = mesh.material.clone()
  mesh.material.uniforms.feedTexture = { value: renderTarget.texture }
  mesh.material.uniforms.gameScore = { value: 0 }
  mesh.material.uniforms.gameTime = { value: 0 }
}

export function updateSurveillanceBillboards(playerPos, score, gameTime) {
  if (!mainRenderer || !mainScene || surveillanceCams.length === 0) return

  // Sort by distance, render only nearest
  const sorted = surveillanceCams
    .map(s => ({ ...s, dist: playerPos.distanceTo(s.position) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, MAX_ACTIVE_FEEDS)

  const currentTarget = mainRenderer.getRenderTarget()

  for (const s of sorted) {
    // Position camera looking at player from billboard's perspective
    const billboardPos = s.position
    s.camera.position.set(billboardPos.x, billboardPos.y, billboardPos.z)
    s.camera.lookAt(playerPos.x, playerPos.y + 1, playerPos.z)

    // Hide the billboard mesh briefly so it doesn't self-render
    const wasVisible = s.mesh.visible
    s.mesh.visible = false

    mainRenderer.setRenderTarget(s.renderTarget)
    mainRenderer.render(mainScene, s.camera)

    s.mesh.visible = wasVisible

    // Update uniforms
    s.mesh.material.uniforms.gameScore.value = score
    s.mesh.material.uniforms.gameTime.value = gameTime
  }

  mainRenderer.setRenderTarget(currentTarget)
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getBillboardStyleName(styleIndex) {
  return BILLBOARD_STYLES[styleIndex % BILLBOARD_STYLES.length].name
}

export function isSurveillanceStyle(styleIndex) {
  return BILLBOARD_STYLES[styleIndex % BILLBOARD_STYLES.length].isSurveillance === true
}

export function createBillboardMeshes(bb, config, styleIndex = 0) {
  const meshes = []
  const bbH = config.BILLBOARD_HEIGHT
  const bbW = config.BILLBOARD_WIDTH
  const bbD = config.BILLBOARD_DEPTH
  const bbY = bb.y + bbH / 2

  const mat = materials[styleIndex % materials.length]

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

export function updateBillboardMaterials(time, score, gameTime) {
  for (const mat of materials) {
    mat.uniforms.time.value = time
    if (mat.uniforms.gameScore) mat.uniforms.gameScore.value = score || 0
    if (mat.uniforms.gameTime) mat.uniforms.gameTime.value = gameTime || 0
  }
}
