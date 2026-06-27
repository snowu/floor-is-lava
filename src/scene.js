import * as THREE from 'three'
import config from './config.js'

const FOG_COLOR = 0x1a0800

export const scene = new THREE.Scene()
scene.background = new THREE.Color(FOG_COLOR)
scene.fog = new THREE.Fog(FOG_COLOR, config.FOG_START, config.FOG_END)

export const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)

export const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)

// Inferno skybox
const skyGeo = new THREE.SphereGeometry(500, 32, 32)
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0 },
  },
  vertexShader: `
    varying vec3 vWorldPos;
    void main() {
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
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

    void main() {
      vec3 dir = normalize(vWorldPos - cameraPosition);
      float height = dir.y;

      // Vertical gradient: lava glow below, dark smoke above
      vec3 infernoLow  = vec3(0.25, 0.05, 0.0);
      vec3 infernoMid  = vec3(0.1, 0.02, 0.01);
      vec3 infernoHigh = vec3(0.02, 0.01, 0.02);

      float t = clamp(height * 0.5 + 0.5, 0.0, 1.0);
      vec3 sky = mix(infernoLow, infernoMid, smoothstep(0.0, 0.4, t));
      sky = mix(sky, infernoHigh, smoothstep(0.4, 0.8, t));

      // Animated smoke/ember clouds
      vec2 uv = vec2(atan(dir.z, dir.x) * 0.5, height * 2.0);
      float smoke = snoise(uv * 3.0 + time * 0.01) * 0.5 + 0.5;
      smoke += snoise(uv * 6.0 - time * 0.015) * 0.25;
      smoke = smoothstep(0.3, 0.8, smoke);

      vec3 smokeColor = vec3(0.15, 0.03, 0.0);
      sky += smokeColor * smoke * (1.0 - t);

      // Horizon glow
      float horizonGlow = exp(-abs(height) * 8.0);
      sky += vec3(0.4, 0.08, 0.0) * horizonGlow * 0.5;

      gl_FragColor = vec4(sky, 1.0);
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
})
const skyMesh = new THREE.Mesh(skyGeo, skyMat)
scene.add(skyMesh)

export function updateSky(time, playerX, playerZ) {
  skyMat.uniforms.time.value = time
  skyMesh.position.set(playerX, 0, playerZ)
}

export const timer = new THREE.Timer()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
