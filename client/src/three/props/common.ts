import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StageEffect } from '../../stage/types';

/** Per-frame info the props need: elapsed time and how many world units one content unit is. */
export interface Frame {
  time: number;
  /** 1 in the 3D viewer; ~marker pixel width in AR (MindAR measures its world in pixels). */
  scale: number;
}

/**
 * The 3D things a scenario step can show (`model` in the scenario JSON). Built from code, not .glb
 * files, so nothing is downloaded. They react to the same effects every stage receives.
 */
export interface Prop {
  group: THREE.Group;
  update(dt: number, frame: Frame): void;
  onEffect(e: StageEffect): void;
  dispose(): void;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Bevelled box: real sheet-metal and plastic parts never have razor-sharp edges, and the highlights sell it. */
export const rbox = (w: number, h: number, d: number, r: number, mat: THREE.Material, opts?: { cast?: boolean; receive?: boolean }) =>
  mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), mat, opts);

export const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, seg = 24) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);

export function tube(points: THREE.Vector3[], radius: number, mat: THREE.Material, segments = 48) {
  const curve = new THREE.CatmullRomCurve3(points);
  return mesh(new THREE.TubeGeometry(curve, segments, radius, 10, false), mat);
}

/** Lathe from a (radius, height) profile, around Y. */
export const lathe = (profile: [number, number][], mat: THREE.Material, seg = 40) =>
  mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export { v };

let glowTex: THREE.Texture | null = null;
/** Additive halo for lamps and beacons: reads as "lit" without a real light (which would cost a shader pass). */
export function glow(hex: number, size: number) {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.setScalar(size);
  return s;
}

/** Disposes geometries (materials and textures are shared and cached, so they stay). */
export function disposeGeometries(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !(o instanceof THREE.Sprite)) m.geometry.dispose();
  });
}

/** Critically-damped-ish easing toward a target, frame-rate independent. */
export const approach = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));

/** Marks an object (and everything under it) as animated, so `freeze` leaves it alone. */
export function dynamic<T extends THREE.Object3D>(o: T): T {
  o.userData.dynamic = true;
  return o;
}

/**
 * Merges every static mesh under `root` into one mesh per material (and shadow setting), with the
 * transforms baked in. A prop built from ~100 small parts becomes ~15 draw calls, which is what keeps a
 * cheap phone at 30 fps. Skips anything marked `dynamic`, instanced meshes, multi-material meshes,
 * shader effects, sprites and points.
 */
export function freeze(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[]; order: number }>();
  const remove: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    if (o !== root && o.userData.dynamic) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material) && !(m.material as THREE.ShaderMaterial).isShaderMaterial && m.visible) {
      const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}`;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld));
      const b = buckets.get(key) ?? { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, geos: [], order: m.renderOrder };
      b.geos.push(g);
      buckets.set(key, b);
      remove.push(m);
    }
    o.children.forEach(visit);
  };
  visit(root);
  for (const m of remove) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const out = mesh(merged, b.mat, { cast: b.cast, receive: b.receive });
    out.renderOrder = b.order;
    root.add(out);
  }
  return root;
}
