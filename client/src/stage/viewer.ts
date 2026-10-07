import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { el } from '../dom';
import type { Step } from '../engine/types';
import { addEnvironment, configureRenderer } from '../three/lighting';
import { AdaptiveResolution, debugOverlay } from '../three/perf';
import type { Tier } from '../three/quality';
import { SceneContent } from '../three/scene';
import { backdrop, concrete, hazardStripes } from '../three/textures';
import type { CameraProblem } from './camera';
import type { Stage, StageEffect, StageInfo } from './types';

const FRAME_MS = 30;
const FOV = 38;

/**
 * 3D viewer: the same scene as AR, in a small workshop (wall, floor, walkway line), with a camera the
 * worker can drag around. Used when AR cannot run, e.g. no camera, permission denied, or ?ar=0.
 */
export class ViewerStage implements Stage {
  readonly info: StageInfo;
  private container = el('div', undefined, 'stage-viewer');
  private renderer?: THREE.WebGLRenderer;
  private content: SceneContent;
  private controls?: OrbitControls;
  private refit = () => {};
  private disposers: (() => void)[] = [];

  constructor(private tier: Tier, problem?: CameraProblem) {
    this.info = { mode: 'viewer', problem };
    this.content = new SceneContent(tier);
    this.container.dataset.frames = '0';
  }

  async mount(host: HTMLElement) {
    const renderer = new THREE.WebGLRenderer({ antialias: this.tier === 'high', powerPreference: 'high-performance' });
    this.renderer = renderer;
    configureRenderer(renderer, this.tier);
    this.container.append(renderer.domElement);
    host.prepend(this.container);

    const scene = new THREE.Scene();
    scene.background = backdrop();
    addEnvironment(renderer, scene);
    scene.add(this.workshop(), this.content.root);

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 20);
    const controls = new OrbitControls(camera, renderer.domElement);
    this.controls = controls;
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minPolarAngle = 1.05;
    controls.maxPolarAngle = 1.72;
    controls.minAzimuthAngle = -0.7;
    controls.maxAzimuthAngle = 0.7;
    controls.autoRotate = true; // a slow sway until the worker touches it
    controls.autoRotateSpeed = 0.35;
    controls.addEventListener('start', () => (controls.autoRotate = false));

    const fit = () => {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Frame the props themselves (meshes that cast shadows; effects and lights don't count), then
      // lift them into the top ~60% of the screen, above the question panel.
      const box = new THREE.Box3();
      this.content.root.updateMatrixWorld(true);
      this.content.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.castShadow) box.expandByObject(o, false);
      });
      if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(0.5, 0.5, 0.3));
      const center = box.getCenter(new THREE.Vector3());
      // A three-quarter view from front-right and a little above: depth reads (a conveyor seen head-on
      // is just a line). Fit every corner of the box in that view: width across the whole screen,
      // height into the top ~58% so the question panel never covers the scene.
      const dir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - 0.22, 0.38);
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(up, dir).normalize();
      const camUp = new THREE.Vector3().crossVectors(dir, right).normalize();
      const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      const tanH = tanV * camera.aspect;
      const USABLE = 0.58;
      let dist = 0;
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z]) {
            const c = new THREE.Vector3(x, y, z).sub(center);
            const depth = c.dot(dir);
            dist = Math.max(dist, depth + Math.abs(c.dot(right)) / (tanH * 0.94), depth + Math.abs(c.dot(camUp)) / (tanV * USABLE));
          }
      const visibleH = 2 * dist * tanV;
      const target = center.clone().addScaledVector(camUp, -visibleH * (0.5 - USABLE / 2) * 0.9);
      controls.target.copy(target);
      controls.minDistance = dist * 0.45;
      controls.maxDistance = dist * 1.3;
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.updateProjectionMatrix();
      controls.update();
    };
    this.refit = fit;
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(this.container);
    this.disposers.push(() => ro.disconnect());

    const resolution = new AdaptiveResolution(renderer, Math.min(window.devicePixelRatio, this.tier === 'high' ? 1.75 : 1));
    const debug = debugOverlay(host, () => ({ tier: this.tier, scale: resolution.pixelRatio.toFixed(2), mode: '3d viewer' }));
    this.disposers.push(debug.dispose);
    let last = 0;
    let frames = 0;
    const loop = (time: number) => {
      if (time - last < FRAME_MS) return;
      const dt = Math.min((time - last) / 1000, 0.1);
      last = time;
      // keep the sway inside the allowed arc by reversing at the ends
      const az = controls.getAzimuthalAngle();
      // (OrbitControls: a positive autoRotateSpeed decreases the azimuth)
      if (controls.autoRotate && Math.abs(az) > 0.5) controls.autoRotateSpeed = Math.sign(az) * Math.abs(controls.autoRotateSpeed);
      controls.update();
      this.content.update(dt, time / 1000, renderer);
      renderer.render(scene, camera);
      resolution.tick(time);
      debug.frame();
      this.container.dataset.frames = String(++frames);
    };
    renderer.setAnimationLoop(loop);
    const onVisibility = () => renderer.setAnimationLoop(document.hidden ? null : loop);
    document.addEventListener('visibilitychange', onVisibility);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));
  }

  /** Painted concrete wall (where the marker would be), concrete floor and a yellow walkway line. */
  private workshop() {
    const g = new THREE.Group();
    const wallTex = concrete(5, 0xb9b7b0);
    wallTex.repeat.set(3, 2);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }));
    wall.position.set(0, 1.5, -0.002);
    wall.receiveShadow = true;
    const floorTex = concrete(9, 0x55534e);
    floorTex.repeat.set(4, 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.5, 2);
    floor.receiveShadow = true;
    const stripeTex = hazardStripes().clone();
    stripeTex.needsUpdate = true;
    stripeTex.repeat.set(24, 1);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.06), new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.7 }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, -0.499, 0.62);
    stripe.receiveShadow = true;
    g.add(wall, floor, stripe);
    return g;
  }

  show(_id: string, step: Step) {
    const before = this.content.root.children.length;
    this.content.show(step);
    if (this.content.root.children.length !== before) this.refit(); // new prop: re-frame
  }
  effect(e: StageEffect) {
    this.content.effect(e);
  }
  onTracking(cb: (found: boolean) => void) {
    cb(true); // nothing to track
  }
  destroy() {
    this.disposers.forEach((d) => d());
    this.renderer?.setAnimationLoop(null);
    this.controls?.dispose();
    this.content.dispose();
    this.renderer?.dispose();
    this.container.remove();
  }
}

/** True if this browser can draw WebGL at all (very old phones cannot). */
export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
