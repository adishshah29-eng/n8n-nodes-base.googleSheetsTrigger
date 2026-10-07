import * as THREE from 'three';
import type { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import { el } from '../dom';
import type { Scenario, Step } from '../engine/types';
import type { Stage, StageEffect } from '../stage/types';
import { PROPS, type Prop } from './props';

const TARGETS_URL = '/targets/targets.mind';
const MAX_PIXEL_RATIO = 1.5; // cap: a sharp but cool-running phone beats a crisp, overheating one
const FRAME_MS = 30; // render loop locked to ~30 fps
const LONG_PRESS_MS = 800;
const FREE_SCALE = 1000;

/**
 * AR stage: the camera feed with the scenario's props anchored on its printed marker.
 * `data-tracking` ("lost" | "found" | "free") and `data-frames` are exposed on the container
 * for tests and for debugging on a phone.
 */
export class ARStage implements Stage {
  private container = el('div', undefined, 'stage-ar');
  private mindar?: MindARThree;
  private root = new THREE.Group();
  private props = new Map<string, Prop>();
  private cb: (found: boolean) => void = () => {};
  private found = false;
  private free = false;
  private frames = 0;
  private disposeLongPress = () => {};

  constructor(private scenario: Scenario) {
    this.container.dataset.tracking = 'lost';
    this.container.dataset.frames = '0';
  }

  async mount(host: HTMLElement) {
    host.prepend(this.container);
    const { MindARThree } = await import('mind-ar/dist/mindar-image-three.prod.js');
    const mindar = new MindARThree({
      container: this.container,
      imageTargetSrc: TARGETS_URL,
      maxTrack: 1,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no',
    });
    this.mindar = mindar;
    const { renderer, scene, camera } = mindar;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.5, 1, 1);
    scene.add(sun);

    const anchor = mindar.addAnchor(this.scenario.target);
    anchor.group.add(this.root);
    anchor.onTargetFound = () => this.setFound(true);
    anchor.onTargetLost = () => this.setFound(false);

    await mindar.start(); // asks for the camera; rejects if denied, and the caller falls back to 2D

    let last = 0;
    renderer.setAnimationLoop((time: number) => {
      if (time - last < FRAME_MS) return;
      const dt = Math.min((time - last) / 1000, 0.1);
      last = time;
      this.props.forEach((p) => p.update(dt));
      renderer.render(scene, camera);
      this.container.dataset.frames = String(++this.frames);
    });

    this.disposeLongPress = this.bindLongPress(host);
  }

  show(_scenarioId: string, step: Step) {
    const name = step.model;
    if (!name || this.props.has(name)) return;
    const make = PROPS[name];
    if (!make) {
      console.warn(`no AR prop named "${name}"`);
      return;
    }
    const prop = make();
    this.props.set(name, prop);
    this.root.add(prop.group);
  }

  effect(e: StageEffect) {
    this.props.forEach((p) => p.onEffect(e));
  }

  onTracking(cb: (found: boolean) => void) {
    this.cb = cb;
    cb(this.free || this.found);
  }

  private setFound(found: boolean) {
    this.found = found;
    if (this.free) return; // no-marker mode never loses its scene
    this.container.dataset.tracking = found ? 'found' : 'lost';
    this.cb(found);
  }

  /**
   * Hidden fallback: long-press the logo to place the scene in front of the camera with no
   * tracking. Saves the demo if venue lighting defeats the marker.
   */
  private enterFreeMode() {
    if (this.free || !this.mindar) return;
    this.free = true;
    const { scene, camera } = this.mindar;
    scene.add(camera); // children of the camera follow it
    camera.add(this.root);
    // MindAR's world units are marker pixels, not marker widths, and its near plane is ~10 units out.
    // Scaling the scene up and pushing it out by the same factor keeps its apparent size and puts it
    // safely between the near and far planes, whatever size the marker image was.
    this.root.scale.setScalar(FREE_SCALE);
    this.root.position.set(0, -0.2 * FREE_SCALE, -1.8 * FREE_SCALE);
    this.container.dataset.tracking = 'free';
    this.cb(true);
  }

  private bindLongPress(host: HTMLElement): () => void {
    const logo = host.querySelector<HTMLElement>('.logo');
    if (!logo) return () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const down = () => {
      timer = setTimeout(() => this.enterFreeMode(), LONG_PRESS_MS);
    };
    const up = () => clearTimeout(timer);
    logo.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) logo.addEventListener(ev, up);
    return () => {
      up();
      logo.removeEventListener('pointerdown', down);
    };
  }

  destroy() {
    this.disposeLongPress();
    this.mindar?.renderer.setAnimationLoop(null);
    try {
      this.mindar?.stop();
    } catch {
      /* already stopped */
    }
    this.props.forEach((p) => p.dispose());
    this.props.clear();
    this.mindar?.renderer.dispose();
    this.container.remove();
  }
}
