import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Tier } from './quality';

/** Film-like tone mapping and soft shadows; the same settings in AR and in the 3D viewer. */
export function configureRenderer(renderer: THREE.WebGLRenderer, tier: Tier) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  // Real shadow maps double the draw calls; cheap phones get soft "blob" shadows instead (see SceneContent).
  renderer.shadowMap.enabled = tier === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

/** Image-based lighting: metals and glossy paint get believable reflections instead of looking like plastic. */
export function addEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  return env;
}

/**
 * Key light (with shadows) + sky/ground fill. Lives INSIDE the content root, so it follows the marker.
 * MindAR's world is measured in marker pixels (~1000 per marker width), so shadow-camera bounds and
 * biases are rescaled to whatever scale the root currently has.
 */
export class LightRig {
  readonly group = new THREE.Group();
  readonly key: THREE.DirectionalLight;
  readonly fill: THREE.HemisphereLight;
  private scale = 0;

  constructor(tier: Tier) {
    this.fill = new THREE.HemisphereLight(0xe3ebf5, 0x40382e, 0.9);
    this.key = new THREE.DirectionalLight(0xfff0dc, 2.4);
    this.key.position.set(-0.9, 1.6, 1.5);
    this.key.target.position.set(0, -0.05, 0);
    this.key.castShadow = tier === 'high';
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.radius = 4;
    this.group.add(this.fill, this.key, this.key.target);
    this.setScale(1);
  }

  /** Call every frame with the root's world scale (1 in the viewer, marker pixels in AR). */
  setScale(s: number) {
    if (!s || Math.abs(s - this.scale) / s < 0.02) return;
    this.scale = s;
    const cam = this.key.shadow.camera;
    cam.left = cam.bottom = -1.1 * s;
    cam.right = cam.top = 1.1 * s;
    cam.near = 0.2 * s;
    cam.far = 5 * s;
    cam.updateProjectionMatrix();
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.012 * s;
  }
}

/** In AR there is no virtual wall: this invisible plane on the marker only receives shadows, so props look grounded. */
export function shadowCatcher(opacity = 0.32) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.ShadowMaterial({ opacity }));
  m.position.z = 0.001;
  m.receiveShadow = true;
  return m;
}

/**
 * Light estimation from the live camera: a tiny downsample of the video sets exposure (dim room ->
 * darker props) and tints the fill light toward the room's colour, so the 3D sits in the real scene.
 */
export class CameraLightEstimate {
  private ctx: CanvasRenderingContext2D;
  private last = 0;
  private exposure = 1;
  private tint = new THREE.Color(1, 1, 1);
  private target = { exposure: 1, tint: new THREE.Color(1, 1, 1) };

  constructor(private video: HTMLVideoElement) {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    this.ctx = c.getContext('2d', { willReadFrequently: true })!;
  }

  update(time: number, renderer: THREE.WebGLRenderer, rig: LightRig) {
    if (time - this.last > 500 && this.video.readyState >= 2) {
      this.last = time;
      try {
        this.ctx.drawImage(this.video, 0, 0, 8, 8);
        const d = this.ctx.getImageData(0, 0, 8, 8).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) (r += d[i]), (g += d[i + 1]), (b += d[i + 2]);
        const n = d.length / 4;
        r /= n * 255; g /= n * 255; b /= n * 255;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        this.target.exposure = THREE.MathUtils.clamp(0.55 + lum * 1.15, 0.65, 1.4);
        const m = Math.max(r, g, b, 0.01);
        this.target.tint.setRGB(r / m, g / m, b / m).lerp(new THREE.Color(1, 1, 1), 0.6);
      } catch {
        /* video not ready or tainted: keep the last estimate */
      }
    }
    this.exposure += (this.target.exposure - this.exposure) * 0.05; // ease, so it never flickers
    this.tint.lerp(this.target.tint, 0.05);
    renderer.toneMappingExposure = this.exposure;
    rig.fill.color.copy(this.tint);
  }
}
