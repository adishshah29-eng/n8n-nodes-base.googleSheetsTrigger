import * as THREE from 'three';
import { FLAME_FRAMES, SMOKE_FRAMES, SheetSprite, flameSheet, smokeSheet } from '../fx/sprites';
import type { StageEffect } from '../stage/types';

/**
 * Props are the 3D things on the marker. They are built from primitives (no .glb to download) and
 * react to the same effects the scenario screen sends every stage. A scenario step names the prop
 * it needs in `model`; the stage adds it the first time it is referenced.
 */
export interface Prop {
  group: THREE.Group;
  update(dt: number): void;
  onEffect(e: StageEffect): void;
  dispose(): void;
}

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2, ...extra });
const box = (w: number, h: number, d: number, color: number) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(color));
const cyl = (rt: number, rb: number, h: number, color: number, seg = 20) =>
  new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), std(color));

let shared: { flame: THREE.CanvasTexture; smoke: THREE.CanvasTexture } | null = null;
const sheets = () => (shared ??= { flame: flameSheet(), smoke: smokeSheet() });

// ---------------------------------------------------------------- electrical panel on fire
function panelFire(): Prop {
  const group = new THREE.Group();
  const cabinet = box(0.55, 0.75, 0.14, 0x6b7280);
  cabinet.position.set(0, 0.05, 0.07);
  const door = box(0.5, 0.7, 0.02, 0x9ca3af);
  door.position.set(0, 0.05, 0.15);
  const danger = box(0.42, 0.07, 0.01, 0xfacc15);
  danger.position.set(0, 0.32, 0.165);
  const breakers = new THREE.Group();
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++) {
      const b = box(0.08, 0.06, 0.02, c === 1 && r === 1 ? 0xdc2626 : 0x1f2937);
      b.position.set(-0.13 + c * 0.13, 0.17 - r * 0.1, 0.17);
      breakers.add(b);
    }
  group.add(cabinet, door, danger, breakers);

  const flames: SheetSprite[] = [];
  const smokes: SheetSprite[] = [];
  const flameAt: [number, number, number][] = [[-0.13, 0.46, 0.2], [0.12, 0.47, 0.2], [0, 0.5, 0.22], [0.02, 0.36, 0.21]];
  for (const [x, y, z] of flameAt) {
    const f = new SheetSprite(sheets().flame, FLAME_FRAMES, 11, true);
    f.sprite.position.set(x, y, z);
    flames.push(f);
    group.add(f.sprite);
  }
  for (let i = 0; i < 4; i++) {
    const s = new SheetSprite(sheets().smoke, SMOKE_FRAMES, 4);
    smokes.push(s);
    group.add(s.sprite);
  }

  // sparks: a short burst at the start, and again on a critical mistake
  const N = 36;
  const sparkGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: 0xfff1a8, size: 0.025, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  group.add(sparks);
  let sparkLife = 0;
  const burst = (life: number) => {
    sparkLife = life;
    for (let i = 0; i < N; i++) {
      pos.set([(Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.15, 0.25], i * 3);
      vel.set([(Math.random() - 0.5) * 0.7, 0.2 + Math.random() * 0.5, 0.1 + Math.random() * 0.4], i * 3);
    }
  };
  burst(1); // "sparks only on the first second"

  // alarm beacon, switched on when the worker raises the alarm
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), new THREE.MeshBasicMaterial({ color: 0x7f1d1d }));
  beacon.position.set(0.33, 0.45, 0.1);
  group.add(beacon);
  let alarmOn = false;

  let level = 1; // fire intensity
  let target = 1;
  let pulse = 0;
  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      level += (target - level) * Math.min(1, dt * 3);
      pulse *= Math.max(0, 1 - dt * 2.5);
      const k = Math.max(0, level + pulse);
      flames.forEach((f, i) => {
        f.update(dt);
        f.sprite.visible = k > 0.03;
        const s = (0.2 + 0.035 * Math.sin(t * 9 + i * 2)) * k * (i === 2 ? 1.3 : 1);
        f.sprite.scale.set(s, s * 1.15, 1);
      });
      smokes.forEach((s, i) => {
        s.update(dt);
        const life = (t * 0.35 + i / smokes.length) % 1; // rise, grow, fade
        s.sprite.position.set(0.03 * Math.sin(t + i), 0.58 + life * 0.4, 0.2);
        const size = 0.18 + life * 0.28;
        s.sprite.scale.set(size, size, 1);
        s.opacity = (1 - life) * Math.min(1, k) * 0.8;
        s.sprite.visible = k > 0.03;
      });
      if (sparkLife > 0) {
        sparkLife -= dt;
        for (let i = 0; i < N; i++) {
          vel[i * 3 + 1] -= 0.9 * dt;
          for (let a = 0; a < 3; a++) pos[i * 3 + a] += vel[i * 3 + a] * dt;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        sparkMat.opacity = Math.max(0, sparkLife);
      } else sparkMat.opacity = 0;
      if (alarmOn) (beacon.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(t * 10) > 0 ? 0xff2222 : 0x661111);
    },
    onEffect(e) {
      if (e === 'critical') {
        pulse = 0.9;
        burst(1.2);
      } else if (e === 'wrong') pulse = 0.35;
      else if (e === 'success') alarmOn = true;
      else if (typeof e === 'object') {
        if (e.part === 'squeeze') target = 0.45;
        if (e.part === 'sweep') target = 0;
      }
    },
    dispose() {
      flames.forEach((f) => f.dispose());
      smokes.forEach((s) => s.dispose());
      sparkGeo.dispose();
      sparkMat.dispose();
    },
  };
}

// ---------------------------------------------------------------- CO2 extinguisher (P-A-S-S)
function extinguisher(): Prop {
  const group = new THREE.Group();
  const body = cyl(0.06, 0.06, 0.3, 0xdc2626);
  const neck = cyl(0.03, 0.05, 0.05, 0xdc2626);
  neck.position.y = 0.175;
  const valve = box(0.05, 0.04, 0.05, 0x111827);
  valve.position.y = 0.215;
  const handle = box(0.12, 0.015, 0.03, 0x111827);
  handle.position.set(0.02, 0.24, 0);
  const horn = cyl(0.02, 0.035, 0.16, 0x111827);
  horn.rotation.z = Math.PI / 2.4;
  horn.position.set(-0.09, 0.14, 0);
  const pin = cyl(0.006, 0.006, 0.05, 0xfacc15, 8);
  pin.rotation.x = Math.PI / 2;
  pin.position.set(0.0, 0.225, 0.03);
  const band = cyl(0.062, 0.062, 0.04, 0xfafafa);
  band.position.y = 0.02;
  const holder = new THREE.Group();
  holder.add(body, neck, valve, handle, horn, pin, band);
  holder.position.y = 0.15;
  group.add(holder);
  group.position.set(0.36, -0.3, 0.14);
  group.scale.setScalar(1.3);

  // spray: a small pool of billboards flying out of the horn toward the fire
  const SPRAY = 28;
  const puffs = Array.from({ length: SPRAY }, () => {
    const m = new THREE.SpriteMaterial({ color: 0xf8fafc, transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(0.05);
    group.add(s);
    return { s, life: 0, v: new THREE.Vector3() };
  });
  let spraying = false;
  let sweep = 0;
  let aimYaw = 0;
  let pinFly = -1;
  let spawn = 0;
  let t = 0;
  const nozzle = new THREE.Vector3(-0.17, 0.22, 0);
  return {
    group,
    update(dt) {
      t += dt;
      holder.rotation.y += (aimYaw - holder.rotation.y) * Math.min(1, dt * 4);
      if (pinFly >= 0) {
        pinFly += dt;
        pin.position.x += dt * 0.25;
        pin.position.y -= dt * 0.1;
        pin.visible = pinFly < 1.2;
      }
      if (spraying) {
        spawn += dt;
        const dir = Math.sin(t * 4) * sweep;
        while (spawn > 0.02) {
          spawn -= 0.02;
          const p = puffs.find((x) => x.life <= 0);
          if (!p) break;
          p.life = 0.8;
          p.s.position.copy(nozzle);
          p.v.set(-0.7 - Math.random() * 0.3, 0.05 + Math.random() * 0.05, dir * 0.45 + (Math.random() - 0.5) * 0.1);
        }
      }
      for (const p of puffs) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.s.position.addScaledVector(p.v, dt);
        p.s.scale.setScalar(0.05 + (0.8 - p.life) * 0.12);
        p.s.material.opacity = Math.max(0, p.life) * 0.9;
      }
    },
    onEffect(e) {
      if (typeof e !== 'object') {
        if (e === 'success') spraying = false;
        return;
      }
      if (e.part === 'pull') pinFly = 0;
      if (e.part === 'aim') aimYaw = 0.35;
      if (e.part === 'squeeze') {
        spraying = true;
        handle.rotation.z = -0.35;
      }
      if (e.part === 'sweep') sweep = 1;
    },
    dispose() {
      puffs.forEach((p) => p.s.material.dispose());
    },
  };
}

// ---------------------------------------------------------------- jammed conveyor belt
function conveyorJam(): Prop {
  const group = new THREE.Group();
  const belt = box(1.0, 0.1, 0.24, 0x1f2937);
  belt.position.set(0, 0, 0.14);
  const frame = box(1.05, 0.04, 0.3, 0xca8a04);
  frame.position.set(0, -0.07, 0.14);
  group.add(belt, frame);
  for (const x of [-0.45, 0.45]) {
    const leg = box(0.05, 0.3, 0.05, 0x4b5563);
    leg.position.set(x, -0.22, 0.14);
    group.add(leg);
  }
  const rollers = [-0.5, 0.5].map((x) => {
    const r = cyl(0.06, 0.06, 0.27, 0x6b7280);
    r.rotation.x = Math.PI / 2;
    r.position.set(x, 0, 0.14);
    group.add(r);
    return r;
  });
  const stripes: THREE.Mesh[] = [];
  const LEN = 0.9;
  for (let i = 0; i < 10; i++) {
    const s = box(0.03, 0.012, 0.22, 0x9ca3af);
    s.position.set(-LEN / 2 + (i * LEN) / 10, 0.055, 0.14);
    stripes.push(s);
    group.add(s);
  }
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1), std(0x78716c, { roughness: 1 }));
  rock.position.set(0.05, 0.12, 0.14);
  rock.scale.set(1, 0.9, 1.2);
  group.add(rock);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
  lamp.position.set(-0.4, 0.2, 0.14);
  group.add(lamp);

  let speed = 0.35; // belt grinding against the jam
  let targetSpeed = 0.35;
  let t = 0;
  let jolt = 0;
  return {
    group,
    update(dt) {
      t += dt;
      speed += (targetSpeed - speed) * Math.min(1, dt * 2.5);
      const stutter = targetSpeed > 0.3 ? 0.5 + 0.5 * Math.abs(Math.sin(t * 7)) : 1; // jammed belt judders
      stripes.forEach((s) => {
        s.position.x += speed * stutter * dt;
        if (s.position.x > LEN / 2) s.position.x -= LEN;
      });
      rollers.forEach((r) => (r.rotation.z -= speed * stutter * dt * 12));
      jolt *= Math.max(0, 1 - dt * 3);
      rock.position.y = 0.12 + Math.sin(t * 25) * 0.012 * (speed > 0.05 ? 1 : 0) + jolt * 0.05;
      (lamp.material as THREE.MeshBasicMaterial).color.setHex(speed > 0.05 && Math.sin(t * 8) > 0 ? 0xf59e0b : speed > 0.05 ? 0x78350f : 0x16a34a);
    },
    onEffect(e) {
      if (e === 'critical') {
        targetSpeed = 1.6; // it starts up with a hand in it
        jolt = 1;
      } else if (e === 'wrong') jolt = 0.6;
      else if (e === 'success') targetSpeed = 0; // operator stopped the belt
    },
    dispose() {},
  };
}

// ---------------------------------------------------------------- isolator, lock and tag (LOTO)
function isolator(): Prop {
  const group = new THREE.Group();
  const housing = box(0.28, 0.38, 0.1, 0x374151);
  housing.position.set(-0.6, 0.1, 0.05);
  const plate = box(0.2, 0.2, 0.01, 0xf3f4f6);
  plate.position.set(-0.6, 0.15, 0.105);
  const lever = box(0.04, 0.16, 0.03, 0xdc2626);
  lever.geometry.translate(0, 0.07, 0);
  lever.position.set(-0.6, 0.15, 0.13);
  lever.rotation.z = -0.5; // ON
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 10), new THREE.MeshBasicMaterial({ color: 0x16a34a }));
  light.position.set(-0.6, 0.27, 0.11);
  const padlock = new THREE.Group();
  const lockBody = box(0.06, 0.05, 0.03, 0xfacc15);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 16, Math.PI), std(0x9ca3af));
  shackle.position.y = 0.025;
  padlock.add(lockBody, shackle);
  padlock.position.set(-0.6, 0.0, 0.14);
  padlock.visible = false;
  const tag = box(0.08, 0.11, 0.004, 0xfef08a);
  tag.position.set(-0.52, -0.03, 0.14);
  tag.rotation.z = 0.15;
  const tagBand = box(0.08, 0.025, 0.006, 0xdc2626);
  tagBand.position.set(0, 0.04, 0.002);
  tag.add(tagBand);
  tag.visible = false;
  group.add(housing, plate, lever, light, padlock, tag);
  group.position.set(0.32, 0.34, 0); // sits above the belt, inside the marker's width

  let leverTarget = -0.5;
  let testT = -1;
  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      lever.rotation.z += (leverTarget - lever.rotation.z) * Math.min(1, dt * 6);
      const m = light.material as THREE.MeshBasicMaterial;
      if (leverTarget > 0) m.color.setHex(0x7f1d1d); // isolated: indicator goes red
      if (testT >= 0) {
        testT += dt;
        padlock.scale.setScalar(1 + 0.12 * Math.abs(Math.sin(t * 12)) * (testT < 1 ? 1 : 0)); // "tug test"
      }
    },
    onEffect(e) {
      if (typeof e !== 'object') return;
      if (e.part === 'isolate') leverTarget = 0.5;
      if (e.part === 'lock') padlock.visible = true;
      if (e.part === 'tag') tag.visible = true;
      if (e.part === 'test') testT = 0;
    },
    dispose() {},
  };
}

export const PROPS: Record<string, () => Prop> = {
  panel_fire: panelFire,
  co2_extinguisher: extinguisher,
  conveyor_jam: conveyorJam,
  isolator,
};
