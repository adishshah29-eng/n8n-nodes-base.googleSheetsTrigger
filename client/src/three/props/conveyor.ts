import * as THREE from 'three';
import { lamp, mats } from '../materials';
import { beltRubber, meshGrid, rng } from '../textures';
import { approach, cyl, disposeGeometries, dynamic, freeze, glow, mesh, rbox, tube, v, type Prop } from './common';

// A troughed belt conveyor jammed by a rock under the feed chute. The belt texture scrolls, rollers turn,
// the jam makes it judder; stopping it (the correct first step) brings everything to rest.
// Units: 1 = marker width. The marker is on the wall (z = 0); the conveyor stands in front of it.

const L = 1.3; // pulley centres
const BY = -0.06; // belt surface height (centre of trough)
const ZC = 0.3; // conveyor centreline, out from the wall
const BW = 0.24; // belt width
const FLOOR = -0.5;

/** Belt surface shaped into a trough: flat centre, sides inclined 25 degrees. */
function troughGeometry() {
  const g = new THREE.PlaneGeometry(L, BW, 1, 12);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const off = Math.max(0, Math.abs(z) - BW * 0.22);
    p.setY(i, off * Math.tan((25 * Math.PI) / 180));
  }
  g.computeVertexNormals();
  return g;
}

/** Lumpy low-poly ore rock. */
function rock(r: number, seed: number, mat: THREE.Material) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const rnd = rng(seed);
  const p = g.attributes.position;
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    if (!seen.has(key)) seen.set(key, 0.72 + rnd() * 0.5); // keep shared vertices welded
    const k = seen.get(key)!;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return mesh(g, mat);
}

export function conveyorJam(): Prop {
  const m = mats();
  const group = new THREE.Group();

  // ---------------------------------------------------------- frame: channel stringers, legs, braces
  for (const s of [-1, 1]) {
    const z = ZC + s * (BW / 2 + 0.035);
    const web = rbox(L + 0.04, 0.07, 0.008, 0.002, m.machineGreen);
    web.position.set(0, BY - 0.07, z);
    const flangeTop = rbox(L + 0.04, 0.008, 0.03, 0.002, m.machineGreen);
    flangeTop.position.set(0, BY - 0.035, z - s * 0.011);
    const flangeBot = flangeTop.clone();
    flangeBot.position.y = BY - 0.105;
    group.add(web, flangeTop, flangeBot);
    for (const x of [-0.55, -0.05, 0.5]) {
      const leg = rbox(0.03, BY - 0.1 - FLOOR, 0.03, 0.003, m.machineGreen);
      leg.position.set(x, (BY - 0.1 + FLOOR) / 2, z);
      const foot = rbox(0.06, 0.008, 0.06, 0.002, m.galvanised);
      foot.position.set(x, FLOOR + 0.004, z);
      group.add(leg, foot);
    }
  }
  for (const x of [-0.55, -0.05, 0.5]) {
    const brace = rbox(0.02, 0.02, BW + 0.07, 0.003, m.machineGreen);
    brace.position.set(x, FLOOR + 0.12, ZC);
    group.add(brace);
  }

  // ---------------------------------------------------------- belt (scrolling texture) and return run
  const beltTex = beltRubber().clone();
  beltTex.needsUpdate = true;
  beltTex.repeat.set(5, 1);
  const beltMat = new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.88, metalness: 0 });
  const belt = mesh(troughGeometry(), beltMat);
  belt.position.set(0, BY, ZC);
  const ret = rbox(L, 0.006, BW, 0.002, m.rubber);
  ret.position.set(0, BY - 0.13, ZC);
  group.add(belt, ret);

  // ---------------------------------------------------------- idler sets (instanced rollers)
  const xs = [-0.45, -0.25, -0.05, 0.15, 0.35];
  const idlerGeo = new THREE.CylinderGeometry(0.016, 0.016, BW * 0.36, 16);
  const idlers = new THREE.InstancedMesh(idlerGeo, m.galvanised, xs.length * 3);
  idlers.castShadow = idlers.receiveShadow = true;
  const d = new THREE.Object3D();
  let n = 0;
  for (const x of xs)
    for (const [zOff, tilt] of [[-BW * 0.33, 25], [0, 0], [BW * 0.33, -25]] as const) {
      d.position.set(x, BY - 0.022 + (tilt ? 0.022 : 0), ZC + zOff);
      d.rotation.set(Math.PI / 2 + (tilt * Math.PI) / 180, 0, 0);
      d.updateMatrix();
      idlers.setMatrixAt(n++, d.matrix);
    }
  group.add(idlers);

  // ---------------------------------------------------------- pulleys, plummer blocks
  const pulleys: THREE.Mesh[] = [];
  for (const x of [-L / 2, L / 2]) {
    const drum = cyl(0.065, 0.065, BW + 0.02, m.rubber, 32);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(x, BY - 0.065, ZC);
    const shaft = cyl(0.012, 0.012, BW + 0.16, m.steel, 12);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.copy(drum.position);
    pulleys.push(dynamic(drum));
    group.add(drum, shaft);
    for (const s of [-1, 1]) {
      const block = rbox(0.06, 0.04, 0.035, 0.006, m.darkGrey);
      block.position.set(x, BY - 0.075, ZC + s * (BW / 2 + 0.06));
      group.add(block);
    }
  }

  // ---------------------------------------------------------- drive: motor, gearbox, coupling guard
  const drive = new THREE.Group();
  drive.position.set(L / 2, BY - 0.065, ZC + BW / 2 + 0.17);
  const gearbox = rbox(0.12, 0.13, 0.09, 0.012, m.darkGrey);
  const motor = cyl(0.05, 0.05, 0.15, m.machineGreen, 28);
  motor.rotation.z = Math.PI / 2;
  motor.position.set(-0.13, -0.01, 0);
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.006, 0.012), m.machineGreen, 12);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    d.position.set(-0.13, -0.01 + Math.sin(a) * 0.052, Math.cos(a) * 0.052);
    d.rotation.set(a, 0, 0);
    d.updateMatrix();
    fins.setMatrixAt(i, d.matrix);
  }
  fins.castShadow = true;
  const fanCover = cyl(0.048, 0.05, 0.03, m.darkGrey, 28);
  fanCover.rotation.z = Math.PI / 2;
  fanCover.position.set(-0.22, -0.01, 0);
  const couplingGuard = rbox(0.05, 0.07, 0.11, 0.008, m.safetyYellow);
  couplingGuard.position.set(0, 0, -0.1);
  const terminalBox = rbox(0.045, 0.03, 0.05, 0.005, m.machineGreen);
  terminalBox.position.set(-0.13, 0.058, 0);
  drive.add(gearbox, motor, fins, fanCover, couplingGuard, terminalBox);
  group.add(drive);

  // ---------------------------------------------------------- tail pulley guard (expanded-metal mesh)
  const guardMat = new THREE.MeshStandardMaterial({ color: 0xd9a516, roughness: 0.6, metalness: 0.3, alphaMap: meshGrid(), alphaTest: 0.5, side: THREE.DoubleSide });
  guardMat.alphaMap!.repeat.set(4, 3);
  const guard = mesh(new THREE.BoxGeometry(0.16, 0.16, BW + 0.1), guardMat);
  guard.position.set(-L / 2 - 0.01, BY - 0.05, ZC);
  const guardFrame = rbox(0.17, 0.012, BW + 0.11, 0.003, m.safetyYellow);
  guardFrame.position.set(-L / 2 - 0.01, BY + 0.03, ZC);
  group.add(guard, guardFrame);

  // ---------------------------------------------------------- feed chute + the jam
  const chute = new THREE.Group();
  chute.position.set(-0.36, BY + 0.16, ZC);
  const hopperGeo = new THREE.CylinderGeometry(0.15, 0.09, 0.16, 4, 1, true);
  hopperGeo.rotateY(Math.PI / 4);
  const hopperMat = m.darkGrey.clone();
  hopperMat.side = THREE.DoubleSide;
  const hopper = mesh(hopperGeo, hopperMat);
  hopper.position.y = 0.06;
  const skirt = rbox(0.2, 0.06, 0.008, 0.002, m.rubber);
  skirt.position.set(0.02, -0.05, -0.09);
  const skirt2 = skirt.clone();
  skirt2.position.z = 0.09;
  chute.add(hopper, skirt, skirt2);
  for (const s of [-1, 1]) {
    const post = rbox(0.02, BY + 0.22 - FLOOR, 0.02, 0.003, m.machineGreen);
    post.position.set(-0.36 + s * 0.13, (BY + 0.22 + FLOOR) / 2, ZC - BW / 2 - 0.08);
    group.add(post);
  }
  group.add(chute);

  const jam = rock(0.075, 7, m.oreDark);
  jam.position.set(-0.27, BY + 0.06, ZC);
  jam.rotation.set(0.3, 0.8, 0.2);
  group.add(dynamic(jam));
  // a pile backing up behind the jam, and loose ore further along the belt
  const ore: { mesh: THREE.Mesh; x: number }[] = [];
  const r = rng(40);
  for (let i = 0; i < 26; i++) {
    const near = i < 12;
    const x = near ? -0.42 + r() * 0.14 : -0.2 + r() * 0.75;
    const z = ZC + (r() - 0.5) * BW * (near ? 0.6 : 0.45);
    const s = near ? 0.03 + r() * 0.03 : 0.015 + r() * 0.02;
    const rk = rock(s, 100 + i, r() > 0.5 ? m.ore : m.oreDark);
    rk.position.set(x, BY + s * 0.7 + (near ? r() * 0.05 : 0), z);
    rk.rotation.set(r() * 3, r() * 3, r() * 3);
    group.add(rk);
    if (!near) ore.push({ mesh: dynamic(rk), x });
  }

  // ---------------------------------------------------------- pull-cord along the far side + amber beacon
  const cordZ = ZC - BW / 2 - 0.09;
  const cordY = BY + 0.08;
  const cord = tube([v(-L / 2, cordY, cordZ), v(-0.1, cordY - 0.012, cordZ), v(L / 2 - 0.08, cordY, cordZ)], 0.0035, m.plasticYellow, 24);
  const pullSwitch = rbox(0.06, 0.08, 0.045, 0.006, m.plasticRed);
  pullSwitch.position.set(L / 2 - 0.05, cordY - 0.01, cordZ);
  group.add(cord, pullSwitch);
  const beaconMat = lamp(0xffa000, 3);
  beaconMat.transparent = true;
  beaconMat.opacity = 0.9;
  const beacon = mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.05, 20), beaconMat);
  beacon.position.set(L / 2 - 0.05, cordY + 0.065, cordZ);
  const beaconGlow = glow(0xffa31a, 0.2);
  beaconGlow.position.copy(beacon.position);
  group.add(beacon, beaconGlow);

  freeze(group); // frame, legs, idlers' brackets, chute, static ore pile... -> one draw call per material

  // ---------------------------------------------------------- motion
  let speed = 0.32, targetSpeed = 0.32, jolt = 0, t = 0, offset = 0;
  const jamRest = jam.position.clone();

  return {
    group,
    update(dt) {
      t += dt;
      speed = approach(speed, targetSpeed, 2.2, dt);
      jolt = approach(jolt, 0, 3, dt);
      const running = speed > 0.02;
      const jammed = targetSpeed > 0 && targetSpeed < 1;
      const judder = jammed ? 0.45 + 0.55 * Math.abs(Math.sin(t * 6.5)) : 1;
      const ds = speed * judder * dt;
      offset += ds;
      beltTex.offset.x = (-offset / L) * beltTex.repeat.x;
      pulleys.forEach((p) => (p.rotation.y -= ds / 0.065));
      // loose ore travels with the belt and recirculates; the jammed rock only shakes
      for (const o of ore) {
        o.mesh.position.x = ((o.x + 0.2 + offset) % 0.75) - 0.2;
      }
      const shake = running ? 0.004 * judder + jolt * 0.02 : jolt * 0.02;
      jam.position.set(jamRest.x + Math.sin(t * 41) * shake, jamRest.y + Math.abs(Math.sin(t * 33)) * shake, jamRest.z);
      group.position.y = Math.sin(t * 50) * 0.0015 * (running ? 1 : 0) + Math.sin(t * 30) * jolt * 0.004;
      const on = running && Math.sin(t * 8) > 0;
      beaconMat.emissiveIntensity = running ? (on ? 3.2 : 0.4) : 0.05;
      beaconGlow.visible = on;
    },
    onEffect(e) {
      if (e === 'critical') {
        targetSpeed = 1.4; // it starts with a hand in it
        jolt = 1;
        setTimeout(() => (targetSpeed = 0.32), 1500);
      } else if (e === 'wrong') jolt = 0.7;
      else if (e === 'success') targetSpeed = 0; // stopped
    },
    dispose() {
      disposeGeometries(group);
      beltTex.dispose();
      beltMat.dispose();
      guardMat.dispose();
      hopperMat.dispose();
    },
  };
}
