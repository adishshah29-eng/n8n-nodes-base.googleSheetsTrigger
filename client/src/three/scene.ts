import * as THREE from 'three';
import type { Step } from '../engine/types';
import type { StageEffect } from '../stage/types';
import { fxFrame } from './fx';
import { LightRig } from './lighting';
import { PROPS, type Prop } from './props';
import type { Tier } from './quality';

/**
 * Everything 3D that belongs to a scenario: props, their lights and effects. The AR stage hangs `root` on
 * the marker anchor; the 3D viewer puts it in a studio. Same content, same behaviour, either way.
 */
export class SceneContent {
  readonly root = new THREE.Group();
  readonly rig: LightRig;
  private props = new Map<string, Prop>();

  constructor(private tier: Tier) {
    this.rig = new LightRig(tier);
    this.root.add(this.rig.group);
  }

  show(step: Step) {
    const name = step.model;
    if (!name || this.props.has(name)) return;
    const make = PROPS[name];
    if (!make) return console.warn(`no 3D prop named "${name}"`);
    const prop = make();
    this.props.set(name, prop);
    this.root.add(prop.group);
    if (this.tier === 'low') this.root.add(blobShadow(prop.group));
  }

  effect(e: StageEffect) {
    this.props.forEach((p) => p.onEffect(e));
  }

  /** `time` in seconds. Scale comes from the root's world matrix (marker pixels in AR, 1 in the viewer). */
  update(dt: number, time: number, renderer: THREE.WebGLRenderer) {
    const scale = this.root.matrixWorld.getMaxScaleOnAxis() || 1;
    this.rig.setScale(scale);
    fxFrame(time, renderer);
    this.props.forEach((p) => p.update(dt, { time, scale }));
  }

  dispose() {
    this.props.forEach((p) => p.dispose());
    this.props.clear();
  }
}

let blobTex: THREE.Texture | null = null;
/**
 * Soft drop shadow for 'low' tier phones (no shadow maps): a blurred dark rectangle on the wall (z = 0)
 * behind the prop, nudged away from the key light. One textured quad instead of a whole shadow pass.
 */
function blobShadow(prop: THREE.Object3D) {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.filter = 'blur(14px)';
    ctx.fillStyle = '#000';
    ctx.fillRect(28, 28, 72, 72);
    blobTex = new THREE.CanvasTexture(c);
  }
  prop.updateMatrixWorld(true);
  const box = new THREE.Box3();
  prop.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.castShadow) box.expandByObject(o, false);
  });
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.45, depthWrite: false }));
  m.scale.set(size.x * 1.6, size.y * 1.6, 1); // the texture's dark core covers the middle ~56%
  m.position.set(center.x + 0.03 + size.z * 0.15, center.y - 0.04 - size.z * 0.2, 0.0015);
  m.renderOrder = -1;
  return m;
}
