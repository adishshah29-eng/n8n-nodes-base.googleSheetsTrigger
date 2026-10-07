import * as THREE from 'three';

// Fire, smoke, embers, sparks and the CO2 discharge, all drawn on the GPU with small shaders:
// a handful of quads and point clouds instead of thousands of particles, so a mid-range phone keeps 30 fps.

/** Shared per-frame uniforms. Stages call `fxFrame` once per frame before rendering. */
const shared = { uTime: { value: 0 }, uPx: { value: 800 } };
export function fxFrame(time: number, renderer: THREE.WebGLRenderer) {
  shared.uTime.value = time;
  shared.uPx.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y / 2;
}

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } // 4 octaves: flames cover many pixels
    return v;
  }
`;

/**
 * Billboard that faces the camera but stays upright along the content's own +Y (the marker's "up"),
 * so flames keep rising straight even when the phone is tilted. Quad base sits at y = 0.
 */
const BILLBOARD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 center = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 up = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec3 right = normalize(cross(up, normalize(-center)));
    float sx = length(modelMatrix[0].xyz);
    float sy = length(modelMatrix[1].xyz);
    vec3 p = center + right * position.x * sx + up * position.y * sy;
    gl_Position = projectionMatrix * vec4(p, 1.0);
  }
`;

const quad = (() => {
  let g: THREE.PlaneGeometry | null = null;
  return () => (g ??= new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0));
})();

const FIRE_FRAG = /* glsl */ `
  uniform float uTime; uniform float uSeed; uniform float uIntensity;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    float y = vUv.y;
    float xr = (vUv.x - 0.5) * 2.0;
    float width = mix(0.9, 0.06, pow(y, 0.85));
    // Cheap reject first: most of the quad is outside any possible flame (flames sway at most ~0.45).
    if (abs(xr) > width + 0.45 * y + 0.05 || y < 0.004) discard;
    float t = uTime * 1.25 + uSeed * 13.0;
    vec2 q = vec2(vUv.x * 2.2 + uSeed, y * 1.5 - t);
    q.x += sin(q.y * 3.1 + t * 0.7) * 0.18;                         // cheap domain warp (no second fbm)
    float n = fbm(q);
    float x = xr + (n - 0.5) * 0.9 * y;                              // tongues sway more toward the tip
    float body = 1.0 - smoothstep(width * 0.12, width, abs(x));      // soft edges, no hard silhouette
    float tongues = smoothstep(0.22, 0.62, n + (1.0 - y) * 0.5);    // noise breaks the outline into licks
    float heat = body * tongues * smoothstep(0.0, 0.1, y) * (0.45 + 0.85 * n) * (1.0 - 0.8 * y);
    heat = clamp(heat * uIntensity, 0.0, 1.0);
    if (heat < 0.02) discard;
    vec3 col = vec3(0.55, 0.04, 0.0);
    col = mix(col, vec3(1.0, 0.33, 0.02), smoothstep(0.18, 0.5, heat));
    col = mix(col, vec3(1.0, 0.68, 0.18), smoothstep(0.5, 0.8, heat));
    col = mix(col, vec3(1.0, 0.92, 0.7), smoothstep(0.86, 1.0, heat)); // white-hot only in the core
    gl_FragColor = vec4(col, smoothstep(0.02, 0.55, heat));
  }
`;

const SMOKE_FRAG = /* glsl */ `
  uniform float uTime; uniform float uSeed; uniform float uOpacity;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 uv = vUv;
    float width = mix(0.18, 0.5, uv.y);
    if (abs(uv.x - 0.5) > width + 0.15 * uv.y) discard;             // outside the column: skip the noise
    float t = uTime * 0.22 + uSeed;
    vec2 q = vec2(uv.x * 2.4, uv.y * 2.2 - t);
    q.x += sin(q.y * 2.3 + t) * 0.25;
    float n = fbm(q);
    float x = uv.x - 0.5 + (n - 0.5) * 0.3 * uv.y;
    float body = 1.0 - smoothstep(width * 0.35, width, abs(x));
    float a = body * smoothstep(0.0, 0.18, uv.y) * (1.0 - smoothstep(0.55, 1.0, uv.y)) * (n * 1.5 - 0.25);
    a = clamp(a, 0.0, 1.0) * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(vec3(0.05, 0.045, 0.04), vec3(0.3, 0.29, 0.28), n), a);
  }
`;

function billboardMaterial(frag: string, uniforms: Record<string, THREE.IUniform>, additive: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, ...uniforms },
    vertexShader: BILLBOARD_VERT,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
  });
}

/** A cluster of flames. `level` 0..1.6 drives size and heat; the props ease it for growth and extinguishing. */
export class Fire {
  readonly group = new THREE.Group();
  private flames: { mesh: THREE.Mesh; base: THREE.Vector2; mat: THREE.ShaderMaterial }[] = [];
  level = 1;

  constructor(spots: { x: number; y: number; z: number; w: number; h: number }[]) {
    spots.forEach((s, i) => {
      const mat = billboardMaterial(FIRE_FRAG, { uSeed: { value: i * 1.37 }, uIntensity: { value: 1 } }, true);
      const mesh = new THREE.Mesh(quad(), mat);
      mesh.position.set(s.x, s.y, s.z);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      this.flames.push({ mesh, base: new THREE.Vector2(s.w, s.h), mat });
      this.group.add(mesh);
    });
  }

  update() {
    const k = Math.max(0, this.level);
    for (const f of this.flames) {
      f.mesh.visible = k > 0.03;
      f.mesh.scale.set(f.base.x * (0.6 + 0.4 * Math.min(k, 1.4)), f.base.y * Math.min(k, 1.6), 1);
      f.mat.uniforms.uIntensity.value = 0.65 + 0.45 * Math.min(k, 1.3);
    }
  }
}

/** One tall billboard of rolling smoke above the fire. */
export class Smoke {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(x: number, y: number, z: number, w: number, h: number, seed = 0) {
    this.mat = billboardMaterial(SMOKE_FRAG, { uSeed: { value: seed }, uOpacity: { value: 0.85 } }, false);
    this.mesh = new THREE.Mesh(quad(), this.mat);
    this.mesh.position.set(x, y, z);
    this.mesh.scale.set(w, h, 1);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  set opacity(v: number) {
    this.mat.uniforms.uOpacity.value = v;
    this.mesh.visible = v > 0.01;
  }
}

// ---------------------------------------------------------------- point clouds

const POINTS_VERT = /* glsl */ `
  attribute float aSize; attribute float aAlpha;
  uniform float uPx;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float s = length(modelMatrix[0].xyz);
    gl_PointSize = max(1.0, aSize * s * projectionMatrix[1][1] * uPx / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const POINTS_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uSoft;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(1.0 - uSoft, 1.0, d)) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

/**
 * CPU-simulated particles drawn as soft round points in one draw call. Used for sparks, embers
 * and the CO2 cloud; each owns its emitter logic through `spawn`.
 */
class Particles {
  readonly points: THREE.Points;
  protected pos: Float32Array;
  protected vel: Float32Array;
  protected life: Float32Array;
  protected maxLife: Float32Array;
  protected size: Float32Array;
  protected alpha: Float32Array;
  protected baseSize: Float32Array;

  constructor(protected n: number, color: number, additive: boolean, soft: number) {
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.baseSize = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uPx: shared.uPx, uColor: { value: new THREE.Color(color) }, uSoft: { value: soft } },
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  protected free() {
    for (let i = 0; i < this.n; i++) if (this.life[i] <= 0) return i;
    return -1;
  }

  protected emit(i: number, p: THREE.Vector3, v: THREE.Vector3, life: number, size: number) {
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = this.maxLife[i] = life;
    this.baseSize[i] = size;
  }

  /** Integrates; subclasses shape size/alpha over life in `shade`. */
  step(dt: number, gravity = 0, drag = 0) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= gravity * dt;
      const d = Math.max(0, 1 - drag * dt);
      for (let a = 0; a < 3; a++) {
        this.vel[k + a] *= d;
        this.pos[k + a] += this.vel[k + a] * dt;
      }
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i]; // 0 -> 1 over life
      this.shade(i, t);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }

  protected shade(i: number, t: number) {
    this.size[i] = this.baseSize[i];
    this.alpha[i] = 1 - t;
  }
}

/** Hot sparks from shorting breakers: bright, fast, fall with gravity. */
export class Sparks extends Particles {
  constructor() {
    super(48, 0xffd27a, true, 0.6);
  }
  burst(origin: THREE.Vector3, count = 30, power = 1) {
    const v = new THREE.Vector3();
    for (let c = 0; c < count; c++) {
      const i = this.free();
      if (i < 0) return;
      v.set((Math.random() - 0.5) * 1.1 * power, (0.2 + Math.random() * 0.8) * power, (0.25 + Math.random() * 0.6) * power);
      this.emit(i, origin, v, 0.35 + Math.random() * 0.6, 0.01 + Math.random() * 0.008);
    }
  }
  update(dt: number) {
    this.step(dt, 1.6, 0.4);
  }
}

/** Glowing embers lifted by the fire's heat. */
export class Embers extends Particles {
  private acc = 0;
  rate = 14;
  constructor(private origin: THREE.Vector3, private spread = 0.18) {
    super(50, 0xff7a1a, true, 0.8);
  }
  update(dt: number) {
    this.acc += dt * this.rate;
    const p = new THREE.Vector3();
    const v = new THREE.Vector3();
    while (this.acc >= 1) {
      this.acc -= 1;
      const i = this.free();
      if (i < 0) break;
      p.set(this.origin.x + (Math.random() - 0.5) * this.spread, this.origin.y, this.origin.z + (Math.random() - 0.5) * 0.08);
      v.set((Math.random() - 0.5) * 0.08, 0.25 + Math.random() * 0.3, (Math.random() - 0.2) * 0.06);
      this.emit(i, p, v, 1 + Math.random() * 1.2, 0.006 + Math.random() * 0.006);
    }
    this.step(dt, -0.05, 0.3);
  }
  protected shade(i: number, t: number) {
    this.size[i] = this.baseSize[i] * (1 - 0.5 * t);
    this.alpha[i] = Math.sin(Math.PI * Math.min(1, t * 1.2)) * (0.6 + 0.4 * Math.random());
  }
}

/** CO2 discharge: a dense white "snow" cloud that expands and slows as it leaves the horn. */
export class Co2Spray extends Particles {
  private acc = 0;
  emitting = false;
  readonly origin = new THREE.Vector3();
  readonly direction = new THREE.Vector3(-1, 0, 0);

  constructor() {
    super(220, 0xf4f7fa, false, 0.95);
  }
  update(dt: number) {
    if (this.emitting) {
      this.acc += dt * 190;
      const v = new THREE.Vector3();
      const jitter = new THREE.Vector3();
      while (this.acc >= 1) {
        this.acc -= 1;
        const i = this.free();
        if (i < 0) break;
        jitter.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.35);
        v.copy(this.direction).add(jitter).normalize().multiplyScalar(0.9 + Math.random() * 0.5);
        this.emit(i, this.origin, v, 0.6 + Math.random() * 0.4, 0.03);
      }
    }
    this.step(dt, -0.08, 2.2);
  }
  protected shade(i: number, t: number) {
    this.size[i] = this.baseSize[i] * (1 + 5.5 * t);
    this.alpha[i] = (1 - t) * (1 - t) * 0.75;
  }
}
