import * as THREE from 'three';
import { decal, lamp, mats } from '../materials';
import { Embers, Fire, Smoke, Sparks } from '../fx';
import { label, scorch, textLines } from '../textures';
import { approach, cyl, disposeGeometries, freeze, glow, mesh, rbox, tube, v, type Prop } from './common';

// An LT distribution panel (RAL 7035 cabinet, door open) burning from a shorted breaker, plus a manual
// fire-alarm call point and beacon on the wall beside it. Units: 1 = marker width; wall = z 0, +z out.

const W = 0.56, H = 0.74, D = 0.2, T = 0.012;
const CY = 0.02; // cabinet centre height

function dangerSign() {
  return label('danger-415', 256, 320, (ctx, w, h) => {
    ctx.fillStyle = '#f7f7f2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c4161c';
    ctx.fillRect(0, 0, w, 70);
    textLines(ctx, w, [{ text: 'DANGER', size: 54, color: '#fff', y: 37 }]);
    ctx.fillStyle = '#f2c300';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(w / 2, 92); ctx.lineTo(w / 2 + 70, 210); ctx.lineTo(w / 2 - 70, 210); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath(); // lightning bolt
    ctx.moveTo(w / 2 + 8, 118); ctx.lineTo(w / 2 - 18, 165); ctx.lineTo(w / 2 + 2, 165); ctx.lineTo(w / 2 - 10, 198); ctx.lineTo(w / 2 + 22, 150); ctx.lineTo(w / 2 + 2, 150); ctx.closePath();
    ctx.fill();
    textLines(ctx, w, [
      { text: '415 VOLTS', size: 40, y: 245 },
      { text: 'खतरा', size: 34, weight: '700', y: 290, color: '#c4161c' },
    ]);
  });
}

function breakerFace() {
  return label('mcb-face', 64, 160, (ctx, w, h) => {
    ctx.fillStyle = '#efece5';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1f4fa8';
    ctx.fillRect(8, 10, w - 16, 18);
    textLines(ctx, w, [{ text: 'C32', size: 15, color: '#fff', y: 20 }, { text: 'ON', size: 11, color: '#c4161c', y: 128 }, { text: 'I', size: 13, y: 146 }]);
  });
}

function callPointFace() {
  return label('mcp', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#c4161c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(18, 18, w - 36, h - 36);
    textLines(ctx, w, [{ text: 'FIRE', size: 30, color: '#c4161c', y: 50 }, { text: 'BREAK GLASS', size: 13, color: '#222', y: 78 }, { text: 'PRESS HERE', size: 11, color: '#222', y: 94 }]);
  });
}

export function panelFire(): Prop {
  const m = mats();
  const group = new THREE.Group();

  // ---------------------------------------------------------- cabinet shell (open front)
  const cab = new THREE.Group();
  cab.position.y = CY;
  const back = rbox(W, H, T, 0.004, m.panelGrey);
  back.position.z = T / 2;
  const top = rbox(W, T, D, 0.004, m.panelGrey);
  top.position.set(0, H / 2 - T / 2, D / 2);
  const bottom = rbox(W, T, D, 0.004, m.panelGrey);
  bottom.position.set(0, -H / 2 + T / 2, D / 2);
  const left = rbox(T, H, D, 0.004, m.panelGrey);
  left.position.set(-W / 2 + T / 2, 0, D / 2);
  const right = rbox(T, H, D, 0.004, m.panelGrey);
  right.position.set(W / 2 - T / 2, 0, D / 2);
  const plinth = rbox(W - 0.02, 0.04, D - 0.03, 0.006, m.darkGrey);
  plinth.position.set(0, -H / 2 - 0.02, D / 2);
  cab.add(back, top, bottom, left, right, plinth);

  // mounting plate (galvanised) inside
  const plate = rbox(W - 0.06, H - 0.07, 0.006, 0.003, m.galvanised);
  plate.position.set(0, 0, T + 0.004);
  cab.add(plate);
  const ZP = T + 0.007; // front face of the plate

  // DIN rails + MCBs (instanced: 2 rows x 9)
  const rails = [0.2, 0.02];
  for (const y of rails) {
    const rail = rbox(W - 0.1, 0.022, 0.006, 0.001, m.steel);
    rail.position.set(0, y, ZP + 0.003);
    cab.add(rail);
  }
  const PER = 9;
  const mcbGeo = new THREE.BoxGeometry(0.034, 0.09, 0.06);
  const faceMat = decal(breakerFace(), { roughness: 0.45 });
  const mcbMats = [m.plasticWhite, m.plasticWhite, m.plasticWhite, m.plasticWhite, faceMat, m.plasticWhite];
  const mcbs = new THREE.InstancedMesh(mcbGeo, mcbMats, rails.length * PER);
  const toggles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.022, 0.016), m.plasticBlack, rails.length * PER);
  const dummy = new THREE.Object3D();
  const BURNT = 6; // top row, 7th breaker: where the fault started
  let k = 0;
  for (const y of rails)
    for (let i = 0; i < PER; i++, k++) {
      dummy.position.set(-0.17 + i * 0.0365 + (i > 4 ? 0.02 : 0), y, ZP + 0.036);
      dummy.updateMatrix();
      mcbs.setMatrixAt(k, dummy.matrix);
      if (k === BURNT) mcbs.setColorAt(k, new THREE.Color(0x1a1714));
      else mcbs.setColorAt(k, new THREE.Color(0xffffff));
      dummy.position.z += 0.033;
      dummy.position.y += 0.004;
      dummy.rotation.x = k === BURNT ? 0.5 : -0.35; // the burnt one has tripped
      dummy.updateMatrix();
      toggles.setMatrixAt(k, dummy.matrix);
      dummy.rotation.x = 0;
    }
  mcbs.castShadow = mcbs.receiveShadow = true;
  toggles.castShadow = true;
  cab.add(mcbs, toggles);

  // main incomer (MCCB) top-left
  const mccb = rbox(0.085, 0.13, 0.07, 0.006, m.darkGrey);
  mccb.position.set(-0.19, -0.16, ZP + 0.035);
  const mccbHandle = rbox(0.02, 0.035, 0.03, 0.004, m.plasticBlack);
  mccbHandle.position.set(-0.19, -0.15, ZP + 0.078);
  cab.add(mccb, mccbHandle);

  // copper busbars on insulators
  for (let i = 0; i < 3; i++) {
    const bar = rbox(0.3, 0.012, 0.004, 0.001, m.copper);
    bar.position.set(0.06, -0.13 - i * 0.035, ZP + 0.045);
    cab.add(bar);
  }
  for (const x of [-0.07, 0.19]) {
    const ins = rbox(0.02, 0.11, 0.04, 0.004, m.plasticRed);
    ins.position.set(x, -0.165, ZP + 0.022);
    cab.add(ins);
  }

  // wiring duct + cables
  const duct = rbox(W - 0.1, 0.04, 0.04, 0.003, m.darkGrey);
  duct.position.set(0, 0.11, ZP + 0.02);
  const duct2 = rbox(W - 0.1, 0.04, 0.04, 0.003, m.darkGrey);
  duct2.position.set(0, -0.07, ZP + 0.02);
  cab.add(duct, duct2);
  const cableMats = [m.cableRed, m.cableYellow, m.cableBlue, m.cableBlack];
  for (let i = 0; i < 8; i++) {
    const x = -0.15 + i * 0.045;
    const c = tube([v(x, -0.07, ZP + 0.03), v(x + 0.004, -0.115, ZP + 0.05), v(x * 0.6 + 0.02, -0.2, ZP + 0.055), v(x * 0.4, -0.3, ZP + 0.04)], 0.0045, cableMats[i % 4], 24);
    cab.add(c);
  }
  // incoming cables through brass glands in the top plate, up the wall
  for (let i = 0; i < 3; i++) {
    const x = -0.1 + i * 0.1;
    const gland = cyl(0.018, 0.018, 0.022, m.brass, 16);
    gland.position.set(x, H / 2 + 0.008, D * 0.5);
    cab.add(gland);
    cab.add(tube([v(x, H / 2 + 0.01, D * 0.5), v(x, H / 2 + 0.08, D * 0.5), v(x * 0.8, H / 2 + 0.17, D * 0.25), v(x * 0.6, H / 2 + 0.3, 0.03)], 0.012, m.cableBlack, 32));
  }

  // soot: on the plate behind the fault and on the top edge where flames lick out
  const sootMat = decal(scorch(), { transparent: true, roughness: 1 });
  const soot1 = mesh(new THREE.PlaneGeometry(0.34, 0.42), sootMat, { cast: false });
  soot1.position.set(0.06, 0.26, ZP + 0.002);
  const soot2 = mesh(new THREE.PlaneGeometry(0.4, 0.2), sootMat, { cast: false });
  soot2.rotation.x = -Math.PI / 2;
  soot2.position.set(0.05, H / 2 + 0.0005, D * 0.65);
  cab.add(soot1, soot2);

  // ---------------------------------------------------------- the door, hinged on the left, swung open
  const hinge = new THREE.Group();
  hinge.position.set(-W / 2, 0, D);
  const door = new THREE.Group();
  const leaf = rbox(W, H, 0.018, 0.006, m.panelGrey);
  leaf.position.set(W / 2, 0, 0.009);
  const gasket = new THREE.Group();
  for (const [w, h, x, y] of [[W - 0.03, 0.012, W / 2, H / 2 - 0.02], [W - 0.03, 0.012, W / 2, -H / 2 + 0.02], [0.012, H - 0.03, 0.02, 0], [0.012, H - 0.03, W - 0.02, 0]]) {
    const strip = rbox(w, h, 0.006, 0.003, m.rubber, { cast: false });
    strip.position.set(x, y, -0.002);
    gasket.add(strip);
  }
  const sign = mesh(new THREE.PlaneGeometry(0.15, 0.1875), decal(dangerSign()), { cast: false });
  sign.position.set(W / 2, 0.15, 0.0185);
  const handleBase = rbox(0.03, 0.11, 0.012, 0.004, m.chrome);
  handleBase.position.set(W - 0.05, 0, 0.024);
  const handle = rbox(0.016, 0.085, 0.018, 0.006, m.plasticBlack);
  handle.position.set(W - 0.05, -0.005, 0.038);
  const pocket = rbox(0.18, 0.22, 0.006, 0.002, m.plasticWhite, { cast: false }); // drawing pocket inside
  pocket.position.set(W / 2, -0.05, -0.006);
  door.add(leaf, gasket, sign, handleBase, handle, pocket);
  for (const y of [H / 2 - 0.08, -H / 2 + 0.08]) {
    const h = cyl(0.008, 0.008, 0.06, m.steel, 12);
    h.position.set(0, y, 0);
    door.add(h);
  }
  hinge.add(door);
  hinge.rotation.y = -1.95; // open about 110 degrees
  cab.add(hinge);
  group.add(cab);

  // ---------------------------------------------------------- manual call point + alarm beacon on the wall
  const mcp = rbox(0.075, 0.075, 0.03, 0.005, m.plasticRed);
  mcp.position.set(0.42, 0.06, 0.015);
  const mcpFace = mesh(new THREE.PlaneGeometry(0.06, 0.06), decal(callPointFace(), { roughness: 0.15 }), { cast: false });
  mcpFace.position.set(0.42, 0.06, 0.031);
  const beaconBase = cyl(0.03, 0.034, 0.02, m.plasticBlack, 24);
  beaconBase.rotation.x = Math.PI / 2;
  beaconBase.position.set(0.42, 0.3, 0.01);
  const beaconMat = lamp(0xff1a10, 0.05);
  beaconMat.transparent = true;
  beaconMat.opacity = 0.92;
  const beacon = mesh(new THREE.SphereGeometry(0.028, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), beaconMat);
  beacon.rotation.x = Math.PI / 2;
  beacon.position.set(0.42, 0.3, 0.02);
  const beaconGlow = glow(0xff2a1a, 0.22);
  beaconGlow.position.set(0.42, 0.3, 0.06);
  beaconGlow.visible = false;
  group.add(mcp, mcpFace, beaconBase, beacon, beaconGlow, tube([v(0.42, 0.33, 0.01), v(0.42, 0.5, 0.01)], 0.008, m.galvanised, 8));

  // ---------------------------------------------------------- fire, smoke, sparks, embers, firelight
  const FZ = ZP + 0.1;
  const fire = new Fire([
    { x: 0.075, y: CY + 0.17, z: FZ, w: 0.24, h: 0.36 },
    { x: 0.0, y: CY + 0.18, z: FZ + 0.012, w: 0.18, h: 0.28 },
    { x: 0.15, y: CY + 0.18, z: FZ - 0.01, w: 0.17, h: 0.26 },
    { x: 0.06, y: CY + H / 2 - 0.05, z: D * 0.8, w: 0.3, h: 0.34 }, // licking out over the top edge
    { x: 0.11, y: CY + 0.03, z: FZ, w: 0.12, h: 0.16 }, // smaller flame lower down, on the cables
  ]);
  const halo = glow(0xff6a1a, 0.75);
  halo.position.set(0.07, CY + 0.3, FZ + 0.02);
  halo.renderOrder = 1;
  group.add(halo);
  const smoke = new Smoke(0.06, CY + H / 2 + 0.02, D * 0.6, 0.62, 1.1, 2.0);
  const sparks = new Sparks();
  const sparkOrigin = v(0.075, CY + 0.2, ZP + 0.07);
  sparks.burst(sparkOrigin, 36);
  const embers = new Embers(v(0.07, CY + 0.28, FZ), 0.16);
  const light = new THREE.PointLight(0xff7a24, 3, 1, 0); // decay 0: range set from scale each frame
  light.position.set(0.07, CY + 0.28, D + 0.15);
  group.add(fire.group, smoke.mesh, sparks.points, embers.points, light);

  freeze(group); // ~120 static parts -> a handful of draw calls (effects, lights and instanced breakers stay separate)

  let level = 1, target = 1, pulse = 0, smokeLevel = 1, alarm = false, nextSpark = 1.5, t = 0;

  return {
    group,
    update(dt, frame) {
      t += dt;
      level = approach(level, target, 1.6, dt);
      pulse = approach(pulse, 0, 2.2, dt);
      const k = Math.max(0, level + pulse);
      fire.level = k;
      fire.update();
      smokeLevel = approach(smokeLevel, target > 0 ? 1 : 0.0, target > 0 ? 1 : 0.18, dt);
      smoke.opacity = 0.85 * smokeLevel;
      embers.rate = 16 * Math.min(1, k);
      embers.update(dt);
      if (k > 0.3 && (nextSpark -= dt) < 0) {
        sparks.burst(sparkOrigin, 6 + Math.floor(Math.random() * 8), 0.7);
        nextSpark = 1.2 + Math.random() * 2.5;
      }
      sparks.update(dt);
      const flicker = 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7.3 + 1) + 0.1 * Math.random();
      light.intensity = 4.5 * Math.min(1.4, k) * flicker;
      halo.material.opacity = 0.55 * Math.min(1.2, k) * flicker;
      halo.visible = k > 0.03;
      light.distance = 1.1 * frame.scale;
      light.visible = k > 0.02;
      if (alarm) {
        const on = Math.sin(t * 9) > 0.2;
        beaconMat.emissiveIntensity = on ? 3.5 : 0.15;
        beaconGlow.visible = on;
      }
    },
    onEffect(e) {
      if (e === 'critical') {
        pulse = 0.9; // water on live equipment: flash-over
        sparks.burst(sparkOrigin, 40, 1.4);
      } else if (e === 'wrong') pulse = 0.3;
      else if (e === 'success') alarm = true;
      else if (typeof e === 'object') {
        if (e.part === 'squeeze') target = 0.45;
        if (e.part === 'sweep') target = 0;
      }
    },
    dispose() {
      disposeGeometries(group);
    },
  };
}
