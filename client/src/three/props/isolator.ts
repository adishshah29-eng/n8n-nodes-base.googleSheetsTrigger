import * as THREE from 'three';
import { decal, lamp, mats } from '../materials';
import { label, textLines } from '../textures';
import { approach, cyl, disposeGeometries, dynamic, freeze, mesh, rbox, tube, v, type Prop } from './common';

// Motor isolator on the wall above the conveyor drive, with a START/STOP station beside it.
// LOTO parts: isolate = rotate the red handle from I (on) to O (off); lock = personal padlock through the
// handle's hasp; tag = DANGER tag on the padlock; test = press START and see nothing move.

function faceplate() {
  return label('iso-face', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f2c300';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    textLines(ctx, w, [
      { text: 'I', size: 46, y: 46 },
      { text: 'ON', size: 18, y: 78 },
      { text: 'O', size: 46, y: h / 2 + 4 },
    ]);
    textLines(ctx, w, [{ text: 'OFF', size: 18, y: h / 2 + 36 }, { text: 'M-205 MAIN ISOLATOR', size: 15, y: h - 34 }]);
  });
}

function dangerTag() {
  return label('loto-tag', 160, 300, (ctx, w, h) => {
    ctx.fillStyle = '#fbfaf5';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c4161c';
    ctx.fillRect(0, 34, w, 64);
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.arc(w / 2, 17, 9, 0, Math.PI * 2);
    ctx.fill();
    textLines(ctx, w, [
      { text: 'DANGER', size: 34, color: '#fff', y: 66 },
      { text: 'DO NOT', size: 26, y: 128 },
      { text: 'OPERATE', size: 26, y: 158 },
      { text: 'खतरा · चालू न करें', size: 15, weight: '600', color: '#c4161c', y: 192 },
      { text: 'Locked by:', size: 13, weight: '500', color: '#444', y: 228 },
      { text: 'TRAINEE', size: 17, y: 250 },
    ]);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, 262);
    ctx.lineTo(w - 20, 262);
    ctx.stroke();
  });
}

export function isolator(): Prop {
  const m = mats();
  const group = new THREE.Group();
  group.position.set(0.3, 0.3, 0);

  const box = rbox(0.17, 0.22, 0.09, 0.012, m.darkGrey);
  box.position.set(0, 0, 0.045);
  const face = mesh(new THREE.PlaneGeometry(0.11, 0.11), decal(faceplate(), { roughness: 0.5 }), { cast: false });
  face.position.set(0, 0.025, 0.0905);
  const rating = rbox(0.1, 0.022, 0.003, 0.001, m.galvanised, { cast: false });
  rating.position.set(0, -0.075, 0.091);
  group.add(box, face, rating);

  // rotary handle: hub + pistol grip; ON = grip horizontal, OFF = grip vertical (rotated 90 degrees)
  const handle = new THREE.Group();
  handle.position.set(0, 0.025, 0.095);
  const hub = cyl(0.022, 0.024, 0.016, m.plasticRed, 24);
  hub.rotation.x = Math.PI / 2;
  const grip = rbox(0.085, 0.024, 0.02, 0.009, m.plasticRed);
  grip.position.set(0.0, 0, 0.012);
  const hasp = rbox(0.016, 0.01, 0.022, 0.003, m.plasticRed); // lockout tab with a hole for the padlock
  hasp.position.set(0.05, 0, 0.012);
  handle.add(hub, grip, hasp);
  handle.rotation.z = 0; // ON
  group.add(handle);

  // padlock (personal, red) and DANGER tag: hidden until those LOTO parts are done
  const padlock = new THREE.Group();
  const lockBody = rbox(0.032, 0.036, 0.016, 0.006, m.plasticRed);
  lockBody.position.y = -0.03;
  const shackle = tube([v(-0.008, -0.012, 0), v(-0.008, 0.008, 0), v(0, 0.016, 0), v(0.008, 0.008, 0), v(0.008, -0.012, 0)], 0.0028, m.chrome, 24);
  const keyhole = cyl(0.003, 0.003, 0.002, m.plasticBlack, 10);
  keyhole.rotation.x = Math.PI / 2;
  keyhole.position.set(0, -0.034, 0.0085);
  padlock.add(lockBody, shackle, keyhole);
  padlock.visible = false;
  const tag = new THREE.Group();
  const card = mesh(new THREE.PlaneGeometry(0.045, 0.084), decal(dangerTag(), { roughness: 0.7 }), { cast: true });
  card.material.side = THREE.DoubleSide;
  card.position.y = -0.05;
  const tie = tube([v(0, 0, 0), v(0.002, -0.006, 0.002), v(0, -0.009, 0)], 0.0012, m.plasticBlack, 8);
  tag.add(card, tie);
  tag.visible = false;
  group.add(padlock, tag);

  // control station: START (green) / STOP (red) push buttons + an "isolated" indicator
  const station = new THREE.Group();
  station.position.set(-0.19, -0.03, 0);
  const sbox = rbox(0.08, 0.13, 0.06, 0.008, m.panelGrey);
  sbox.position.z = 0.03;
  const start = cyl(0.013, 0.013, 0.014, m.plasticGreen, 20);
  start.rotation.x = Math.PI / 2;
  start.position.set(0, 0.03, 0.065);
  const stop = cyl(0.016, 0.016, 0.018, m.plasticRed, 20);
  stop.rotation.x = Math.PI / 2;
  stop.position.set(0, -0.02, 0.067);
  const runLampMat = lamp(0x22ff55, 1.8);
  const runLamp = mesh(new THREE.SphereGeometry(0.006, 12, 8), runLampMat);
  runLamp.position.set(0, 0.058, 0.061);
  station.add(sbox, start, stop, runLamp);
  group.add(station);

  // armoured cable from the isolator down to the motor terminal box
  group.add(tube([v(0, -0.11, 0.04), v(0, -0.2, 0.05), v(0.12, -0.32, 0.25), v(0.21, -0.32, 0.46), v(0.22, -0.31, 0.53)], 0.008, m.cableBlack, 40));

  [handle, padlock, tag, start].forEach(dynamic);
  freeze(group);

  let turn = 0, turnT = 0, press = 0, pressT = 0, tug = -1, t = 0;
  const holePos = new THREE.Vector3();

  return {
    group,
    update(dt) {
      t += dt;
      turn = approach(turn, turnT, 5, dt);
      handle.rotation.z = (-Math.PI / 2) * turn;
      runLampMat.emissiveIntensity = turn > 0.5 ? 0.02 : 1.8; // isolated: the run lamp goes dark
      // the padlock hangs from the hasp, wherever the handle has turned it
      hasp.getWorldPosition(holePos);
      group.worldToLocal(holePos);
      padlock.position.set(holePos.x, holePos.y - 0.004, holePos.z + 0.006);
      tag.position.set(padlock.position.x + 0.004, padlock.position.y - 0.045, padlock.position.z + 0.004);
      tag.rotation.z = Math.sin(t * 1.3) * 0.06; // hangs and sways a little
      if (tug >= 0) {
        tug += dt;
        padlock.position.y -= Math.max(0, Math.sin(tug * 14)) * 0.006 * Math.max(0, 1 - tug); // "tug test"
      }
      press = approach(press, pressT, 12, dt);
      start.position.z = 0.065 - press * 0.006;
      if (pressT > 0 && press > 0.95) pressT = 0; // spring back
    },
    onEffect(e) {
      if (typeof e !== 'object') return;
      if (e.part === 'isolate') turnT = 1;
      if (e.part === 'lock') {
        padlock.visible = true;
        tug = 0;
      }
      if (e.part === 'tag') tag.visible = true;
      if (e.part === 'test') pressT = 1; // pressed START: nothing moves, because it is isolated
    },
    dispose() {
      disposeGeometries(group);
    },
  };
}
