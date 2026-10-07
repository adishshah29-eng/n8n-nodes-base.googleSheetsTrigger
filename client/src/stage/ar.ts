import type { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import { el } from '../dom';
import type { Scenario, Step } from '../engine/types';
import { addEnvironment, CameraLightEstimate, configureRenderer, shadowCatcher } from '../three/lighting';
import { AdaptiveResolution, debugOverlay } from '../three/perf';
import type { Tier } from '../three/quality';
import { SceneContent } from '../three/scene';
import { openCamera, withStream } from './camera';
import type { Stage, StageEffect, StageInfo } from './types';

const TARGETS_URL = '/targets/targets.mind';
const FRAME_MS = 30; // render loop locked to ~30 fps: cooler phone, longer battery, steadier demo
const LONG_PRESS_MS = 800;
const FREE_SCALE = 1000; // see enterFreeMode
/** Scenes are a little wider than the A4 marker; shrinking them keeps the whole scene in view at arm's length. */
const AR_SCALE = 0.8;

/**
 * AR stage: the live camera with the scenario's 3D anchored on its printed marker.
 * `data-tracking` ("lost" | "found" | "free") and `data-frames` on the container are for tests and
 * for debugging on a phone.
 */
export class ARStage implements Stage {
  readonly info: StageInfo = { mode: 'ar' };
  private container = el('div', undefined, 'stage-ar');
  private mindar?: MindARThree;
  private content: SceneContent;
  private catcher = shadowCatcher();
  private cb: (found: boolean) => void = () => {};
  private found = false;
  private free = false;
  private frames = 0;
  private stream?: MediaStream;
  private disposers: (() => void)[] = [];

  constructor(private scenario: Scenario, private tier: Tier) {
    this.content = new SceneContent(tier);
    if (tier === 'high') this.content.root.add(this.catcher); // low tier has no shadow maps: blob shadows instead
    this.content.root.scale.setScalar(AR_SCALE);
    this.container.dataset.tracking = 'lost';
    this.container.dataset.frames = '0';
  }

  async mount(host: HTMLElement) {
    host.prepend(this.container);
    // Throws a CameraError with a reason (denied, no camera, needs https...) for the fallback to show.
    this.stream = await openCamera(this.tier);
    const { MindARThree } = await import('mind-ar/dist/mindar-image-three.prod.js');
    const mindar = new MindARThree({ container: this.container, imageTargetSrc: TARGETS_URL, maxTrack: 1, uiLoading: 'no', uiScanning: 'no', uiError: 'no' });
    this.mindar = mindar;
    const { renderer, scene, camera } = mindar;
    configureRenderer(renderer, this.tier);
    const resolution = new AdaptiveResolution(renderer, Math.min(window.devicePixelRatio, this.tier === 'high' ? 1.75 : 1));
    addEnvironment(renderer, scene);

    const anchor = mindar.addAnchor(this.scenario.target);
    anchor.group.add(this.content.root);
    anchor.onTargetFound = () => this.setFound(true);
    anchor.onTargetLost = () => this.setFound(false);

    await withStream(this.stream, () => mindar.start());

    const video = this.container.querySelector('video');
    const estimate = video ? new CameraLightEstimate(video) : null;
    const debug = debugOverlay(host, () => ({ tier: this.tier, scale: resolution.pixelRatio.toFixed(2), camera: video ? `${video.videoWidth}x${video.videoHeight}` : '-', tracking: this.container.dataset.tracking ?? '' }));
    this.disposers.push(debug.dispose);
    let last = 0;
    const loop = (time: number) => {
      if (time - last < FRAME_MS) return;
      const dt = Math.min((time - last) / 1000, 0.1);
      last = time;
      this.content.update(dt, time / 1000, renderer);
      estimate?.update(time, renderer, this.content.rig);
      renderer.render(scene, camera);
      resolution.tick(time);
      debug.frame();
      this.container.dataset.frames = String(++this.frames);
    };
    renderer.setAnimationLoop(loop);

    // Stop drawing while the app is in the background: saves battery and heat on site.
    const onVisibility = () => renderer.setAnimationLoop(document.hidden ? null : loop);
    document.addEventListener('visibilitychange', onVisibility);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));
    this.disposers.push(this.bindLongPress(host));
  }

  show(_scenarioId: string, step: Step) {
    this.content.show(step);
  }

  effect(e: StageEffect) {
    this.content.effect(e);
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
   * Hidden fallback: long-press the logo to place the scene in front of the camera with no tracking.
   * Saves the demo if venue lighting defeats the marker. MindAR's world units are marker pixels and its
   * near plane is ~10 units out, so the scene is scaled up and pushed out by the same factor: same
   * apparent size, safely inside the view.
   */
  private enterFreeMode() {
    if (this.free || !this.mindar) return;
    this.free = true;
    const { scene, camera } = this.mindar;
    scene.add(camera);
    camera.add(this.content.root);
    this.content.root.matrixAutoUpdate = true;
    this.content.root.scale.setScalar(FREE_SCALE * AR_SCALE);
    this.content.root.position.set(0, -0.12 * FREE_SCALE, -2.1 * FREE_SCALE);
    this.content.root.rotation.set(0.12, -0.25, 0);
    this.catcher.visible = false; // no real surface to cast onto
    this.container.dataset.tracking = 'free';
    this.cb(true);
  }

  private bindLongPress(host: HTMLElement): () => void {
    const logo = host.querySelector<HTMLElement>('.logo');
    if (!logo) return () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const down = () => (timer = setTimeout(() => this.enterFreeMode(), LONG_PRESS_MS));
    const up = () => clearTimeout(timer);
    logo.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) logo.addEventListener(ev, up);
    return () => {
      up();
      logo.removeEventListener('pointerdown', down);
    };
  }

  destroy() {
    this.disposers.forEach((d) => d());
    this.mindar?.renderer.setAnimationLoop(null);
    try {
      this.mindar?.stop();
    } catch {
      /* already stopped */
    }
    this.stream?.getTracks().forEach((t) => t.stop()); // release the camera even if MindAR never started
    this.content.dispose();
    this.mindar?.renderer.dispose();
    this.container.remove();
  }
}

