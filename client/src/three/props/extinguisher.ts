import * as THREE from 'three';
import { Co2Spray } from '../fx';
import { decal, mats } from '../materials';
import { label, textLines } from '../textures';
import { approach, cyl, disposeGeometries, dynamic, freeze, lathe, mesh, rbox, v, type Prop } from './common';

// 4.5 kg CO2 extinguisher in a wall bracket to the right of the panel. The P-A-S-S parts animate it:
// pull = lift off the bracket and pull the pin, aim = swing the horn to the base of the fire,
// squeeze = lever down and CO2 discharges, sweep = sweep the horn side to side.

const FIRE_BASE = new THREE.Vector3(0.07, 0.2, 0.16); // in panel/prop-root coordinates

function wrapLabel() {
  return label('co2-wrap', 512, 200, (ctx, w, h) => {
    ctx.fillStyle = '#f5f3ee';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, 46);
    textLines(ctx, w, [
      { text: 'CO₂  FIRE EXTINGUISHER', size: 30, color: '#fff', y: 24 },
      { text: 'CARBON DIOXIDE · 4.5 kg', size: 26, y: 72 },
      { text: 'For electrical & flammable liquid fires', size: 17, weight: '500', y: 100 },
    ]);
    const boxes = [['B', '#c4161c'], ['C', '#1f4fa8'], ['⚡', '#f2a900']];
    boxes.forEach(([t, c], i) => {
      const x = w / 2 - 90 + i * 70;
      ctx.fillStyle = c;
      ctx.fillRect(x, 118, 50, 50);
      ctx.fillStyle = '#fff';
      ctx.font = '700 32px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(t, x + 25, 144);
    });
    ctx.fillStyle = '#555';
    ctx.font = '500 14px Arial';
    ctx.fillText('IS 15683', w / 2, 186);
  });
}

export function extinguisher(): Prop {
  const m = mats();
  const group = new THREE.Group();
  group.position.set(0.39, -0.37, 0);

  // wall bracket: back plate, arm and strap
  const plate = rbox(0.05, 0.12, 0.008, 0.003, m.steel);
  plate.position.set(0, 0.17, 0.004);
  const arm = rbox(0.03, 0.012, 0.05, 0.003, m.steel);
  arm.position.set(0, 0.2, 0.03);
  const strap = mesh(new THREE.TorusGeometry(0.047, 0.004, 8, 32), m.steel);
  strap.rotation.x = Math.PI / 2;
  strap.position.set(0, 0.16, 0.06);
  group.add(plate, arm, strap);

  // the extinguisher itself, in `unit` so it can be lifted off the bracket
  const unit = new THREE.Group();
  const REST = v(0, 0, 0.06);
  const USE = v(-0.04, 0.04, 0.17);
  unit.position.copy(REST);
  group.add(unit);

  const body = lathe([[0, 0], [0.036, 0], [0.042, 0.008], [0.042, 0.2], [0.039, 0.215], [0.028, 0.232], [0.015, 0.239], [0.013, 0.246], [0, 0.246]], m.signalRed, 48);
  const foot = mesh(new THREE.TorusGeometry(0.038, 0.005, 8, 32), m.plasticBlack);
  foot.rotation.x = Math.PI / 2;
  foot.position.y = 0.004;
  const wrap = mesh(new THREE.CylinderGeometry(0.0425, 0.0425, 0.085, 48, 1, true, -1.25, 2.5), decal(wrapLabel(), { roughness: 0.35 }), { cast: false });
  wrap.position.y = 0.11;
  unit.add(body, foot, wrap);

  // valve, carry handle, squeeze lever (pivots at the valve), pin with ring and tamper seal
  const valve = cyl(0.016, 0.018, 0.032, m.brass, 20);
  valve.position.y = 0.262;
  const outlet = cyl(0.007, 0.007, 0.03, m.brass, 12);
  outlet.rotation.z = Math.PI / 2;
  outlet.position.set(-0.02, 0.265, 0);
  const carry = rbox(0.085, 0.01, 0.02, 0.004, m.plasticBlack);
  carry.position.set(0.035, 0.27, 0);
  const lever = new THREE.Group();
  lever.position.set(-0.004, 0.282, 0);
  const leverBar = rbox(0.085, 0.008, 0.018, 0.003, m.chrome);
  leverBar.position.set(0.04, 0.004, 0);
  leverBar.rotation.z = 0.2;
  lever.add(leverBar);
  const pin = new THREE.Group();
  pin.position.set(0.008, 0.276, 0);
  const pinRod = cyl(0.0025, 0.0025, 0.05, m.chrome, 8);
  pinRod.rotation.x = Math.PI / 2;
  const ring = mesh(new THREE.TorusGeometry(0.011, 0.0018, 6, 20), m.chrome);
  ring.position.z = 0.032;
  const seal = mesh(new THREE.TorusGeometry(0.006, 0.0012, 4, 12), m.plasticYellow);
  seal.position.set(0.004, -0.004, 0.02);
  seal.rotation.y = Math.PI / 2;
  pin.add(pinRod, ring, seal);
  unit.add(valve, outlet, carry, lever, pin);

  // discharge horn (points along its local -Y) and the hose that follows it
  const horn = new THREE.Group();
  const grip = cyl(0.009, 0.009, 0.045, m.plasticBlack, 14);
  grip.position.y = -0.0225;
  const cone = lathe([[0.008, 0], [0.012, -0.02], [0.022, -0.07], [0.031, -0.1], [0.029, -0.1], [0.02, -0.07], [0.006, 0]], m.plasticBlack, 28);
  cone.position.y = -0.045;
  horn.add(grip, cone);
  const HORN_REST = { pos: v(-0.058, 0.2, 0.0), quat: new THREE.Quaternion() };
  horn.position.copy(HORN_REST.pos);
  unit.add(horn);

  const hose = mesh(new THREE.BufferGeometry(), m.rubber);
  unit.add(hose);
  const hosePoints = () => {
    const a = v(-0.035, 0.265, 0);
    const b = horn.position.clone();
    const dirOut = new THREE.Vector3(0, 1, 0).applyQuaternion(horn.quaternion).multiplyScalar(0.05); // up out of the grip
    return [a, a.clone().add(v(-0.03, 0.01, 0.01)), b.clone().add(dirOut).add(v(-0.01, 0.02, 0)), b.clone().add(dirOut.clone().multiplyScalar(0.3)), b];
  };
  const rebuildHose = () => {
    hose.geometry.dispose();
    hose.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hosePoints()), 32, 0.0065, 8, false);
  };
  rebuildHose();

  const spray = new Co2Spray();
  group.add(spray.points);

  // merge what never moves relative to its parent; the animated parts stay separate
  [lever, pin, horn, hose].forEach(dynamic);
  freeze(unit);
  dynamic(unit);
  freeze(group);

  // animation state
  let inUse = 0, inUseT = 0, pinOut = -1, aim = 0, aimT = 0, squeeze = 0, squeezeT = 0, sweep = 0, stopAt = -1, t = 0;
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const aimQuat = new THREE.Quaternion();
  const AIM_POS = v(-0.12, 0.26, 0.09);

  return {
    group,
    update(dt) {
      t += dt;
      inUse = approach(inUse, inUseT, 4, dt);
      unit.position.lerpVectors(REST, USE, inUse);
      unit.rotation.z = 0.12 * inUse; // tilted slightly as it is carried

      if (pinOut >= 0) {
        pinOut += dt;
        pin.position.z = Math.min(0.07, pinOut * 0.2);
        pin.position.y = 0.276 - Math.max(0, pinOut - 0.5) ** 2 * 0.6;
        pin.visible = pinOut < 1.6;
      }

      // aim: orient the horn's -Y toward the base of the fire, expressed in the unit's own space
      aim = approach(aim, aimT, 3.5, dt);
      if (aim > 0.001) {
        const target = unit.worldToLocal(group.parent ? group.parent.localToWorld(FIRE_BASE.clone()) : FIRE_BASE.clone());
        const dir = target.sub(AIM_POS).normalize();
        if (sweep > 0) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 4.2) * 0.32 * sweep);
        aimQuat.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
        horn.position.lerpVectors(HORN_REST.pos, AIM_POS, aim);
        horn.quaternion.slerpQuaternions(HORN_REST.quat, aimQuat, aim);
        rebuildHose();
      }

      squeeze = approach(squeeze, squeezeT, 6, dt);
      lever.rotation.z = -0.32 * squeeze;
      if (stopAt > 0 && t > stopAt) spray.emitting = false;
      if (spray.emitting) {
        // horn mouth and axis, in the prop-group space the particles live in
        horn.localToWorld(spray.origin.set(0, -0.15, 0));
        group.worldToLocal(spray.origin);
        // horn axis: world direction, then into group space with the inverse of the group's world rotation
        horn.getWorldQuaternion(qa);
        group.getWorldQuaternion(qb).invert();
        spray.direction.set(0, -1, 0).applyQuaternion(qa).applyQuaternion(qb).normalize();
      }
      spray.update(dt);
    },
    onEffect(e) {
      if (e === 'success') {
        stopAt = t + 1.4;
        return;
      }
      if (typeof e !== 'object') return;
      if (e.part === 'pull') {
        inUseT = 1;
        pinOut = 0;
      }
      if (e.part === 'aim') aimT = 1;
      if (e.part === 'squeeze') {
        squeezeT = 1;
        spray.emitting = true;
      }
      if (e.part === 'sweep') sweep = 1;
    },
    dispose() {
      disposeGeometries(group);
    },
  };
}
