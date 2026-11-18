// The three captains, as themselves (GDD 5.7.4).
//
// The figures world/aliens.js makes are a body in two colours. The captains
// are met in four places and followed round a city, so each is dressed as
// what they are, the same wherever they appear:
//
//   vask     Shift-Captain, Rustia: a miner's long coat in rust, a hard hat
//            with its lamp lit, a lamp at the chest, heavy boots
//   marrow   Cantor, Saturnia: a pale robe to the ankle, a stole, a collar of
//            small gold bells, a circlet
//   lux      Floor Manager, Wavemall Prime: a sharp pink jacket with cyan
//            lapels, a lit name badge, a headset, shoes with lit soles
//
// and each has a face: two eyes with lit pupils, a brow, and a mouth that
// moves when they speak.
//
// The dress is hung on the figure's joints before the figure is fused into
// its one mesh (buildRig's `dress`), so it follows every pose and costs a
// draw per material, not per piece.
//
//   buildCaptain(id)                       a dressed, measured figure
//   liveCaptain(rig, dt, t, talking, yaw)  after poseRig: the mouth, and the
//                                          head turned `yaw` from the body

import * as THREE from 'three';
import { buildRig } from './aliens.js';
import { measureRig } from './rigGround.js';

// the Pavilion's own three (the same seeds everywhere, so the same bodies)
export const CAPTAIN_SEED = { vask: 0x51a, marrow: 0x7c3, lux: 0x2e9 };

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...o });
const lit = (color, k = 1.6) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });

function add(joint, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  joint.add(m);
  return m;
}

// a face: on every captain, sized to the head it is on
function face(j, d, look) {
  const h = d.headScale * d.scaleY;
  const white = std(0xf4f1ea, { roughness: 0.35 }), pupil = lit(look.eye, 2.2), dark = std(0x16130f);
  for (const s of [-1, 1]) {
    add(j.head, new THREE.SphereGeometry(0.044 * h, 10, 8), white, s * 0.066 * h, 0.165 * h, 0.128 * h);
    add(j.head, new THREE.SphereGeometry(0.022 * h, 8, 6), pupil, s * 0.066 * h, 0.165 * h, 0.166 * h);
    // a brow, set the way this one's face is set
    add(j.head, new THREE.BoxGeometry(0.085 * h, 0.016 * h, 0.03 * h), dark, s * 0.068 * h, 0.228 * h, 0.15 * h, 0, 0, s * look.brow);
  }
  // the mouth is on a joint of its own, so it can move
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.082 * h, 0.155 * h);
  j.head.add(jaw);
  add(jaw, new THREE.BoxGeometry(0.085 * h, 0.014 * h, 0.02 * h), dark);
  j.jaw = jaw;
}

const DRESS = {
  vask({ joints: j, dims: d }) {
    const s = d.scaleY, w = d.buildWidth * s, l = d.limbScale * s, h = d.headScale * s;
    const coat = std(0x8a3f20), trim = std(0x2a2420, { roughness: 0.9 }), ember = lit(0xff8a3a, 2.0), steel = std(0x4a4f57, { metalness: 0.5, roughness: 0.45 });
    // the coat: over the chest, and on down past the knee, open at the front
    add(j.torso, new THREE.CylinderGeometry(0.265 * w, 0.275 * w, 0.52 * s, 12, 1, true), coat, 0, 0.28 * s, 0);
    add(j.pelvis, new THREE.CylinderGeometry(0.275 * w, 0.37 * w, 0.62 * s, 12, 1, true, 0.5, Math.PI * 2 - 1.0), coat, 0, -0.27 * s, 0);
    add(j.torso, new THREE.BoxGeometry(0.56 * w, 0.05 * s, 0.34 * w), trim, 0, 0.04 * s, 0); // a belt
    add(j.torso, new THREE.CylinderGeometry(0.2 * w, 0.27 * w, 0.07 * s, 12, 1, true), trim, 0, 0.56 * s, 0); // collar
    // a lamp at the chest, and its strap
    add(j.torso, new THREE.BoxGeometry(0.035 * s, 0.5 * s, 0.02 * s), trim, 0.1 * w, 0.3 * s, 0.262 * w, 0, 0, 0.25);
    add(j.torso, new THREE.CylinderGeometry(0.045 * s, 0.045 * s, 0.03 * s, 10).rotateX(Math.PI / 2), ember, -0.09 * w, 0.36 * s, 0.275 * w);
    // shoulders that have carried things
    for (const side of [-1, 1]) add(j.shoulders, new THREE.SphereGeometry(0.085 * s, 8, 6), trim, side * 0.27 * w, 0.01 * s, 0);
    // boots
    for (const leg of [j.legL, j.legR]) {
      add(leg.knee, new THREE.CylinderGeometry(0.062 * l, 0.07 * l, 0.16 * l, 8), trim, 0, -0.25 * l, 0);
      add(leg.knee, new THREE.BoxGeometry(0.13 * l, 0.07 * l, 0.22 * l), trim, 0, -0.33 * l, 0.05 * l);
    }
    // the hard hat, lamp lit
    add(j.head, new THREE.SphereGeometry(0.185 * h, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), steel, 0, 0.2 * h, 0);
    add(j.head, new THREE.CylinderGeometry(0.21 * h, 0.21 * h, 0.018 * h, 14), steel, 0, 0.2 * h, 0.02 * h);
    add(j.head, new THREE.CylinderGeometry(0.04 * h, 0.04 * h, 0.03 * h, 10).rotateX(Math.PI / 2), ember, 0, 0.27 * h, 0.17 * h);
    face(j, d, { eye: 0xffa860, brow: -0.12 });
  },
  marrow({ joints: j, dims: d }) {
    const s = d.scaleY, w = d.buildWidth * s, l = d.limbScale * s, h = d.headScale * s;
    const robe = std(0xf1ecdf, { roughness: 0.85 }), stole = std(0xc9a455, { metalness: 0.35, roughness: 0.45 }), gold = lit(0xffd98a, 0.9), blue = std(0x2f4f86);
    // the robe: one fall of cloth from the shoulder to the ankle
    add(j.torso, new THREE.CylinderGeometry(0.25 * w, 0.3 * w, 0.56 * s, 14, 1, true), robe, 0, 0.27 * s, 0);
    add(j.pelvis, new THREE.CylinderGeometry(0.3 * w, 0.46 * w, 0.78 * l + 0.1 * s, 14, 1, true), robe, 0, -0.34 * l - 0.06 * s, 0);
    add(j.pelvis, new THREE.CylinderGeometry(0.465 * w, 0.47 * w, 0.035 * s, 14, 1, true), stole, 0, -0.71 * l - 0.09 * s, 0); // its hem
    // wide sleeves
    for (const arm of [j.armL, j.armR]) add(arm.elbow, new THREE.CylinderGeometry(0.055 * l, 0.1 * l, 0.24 * l, 8, 1, true), robe, 0, -0.12 * l, 0);
    // the stole, down the front, and a sash
    for (const side of [-1, 1]) add(j.torso, new THREE.BoxGeometry(0.07 * w, 0.62 * s, 0.02 * s), stole, side * 0.1 * w, 0.24 * s, 0.275 * w);
    add(j.torso, new THREE.CylinderGeometry(0.305 * w, 0.305 * w, 0.06 * s, 14, 1, true), blue, 0, 0.05 * s, 0);
    // a collar of small bells
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      add(j.torso, new THREE.ConeGeometry(0.026 * s, 0.05 * s, 6), gold, Math.cos(a) * 0.2 * w, 0.52 * s, Math.sin(a) * 0.2 * w);
    }
    // the circlet
    add(j.head, new THREE.TorusGeometry(0.165 * h, 0.014 * h, 6, 20).rotateX(Math.PI / 2), gold, 0, 0.25 * h, 0);
    add(j.head, new THREE.OctahedronGeometry(0.028 * h), gold, 0, 0.27 * h, 0.165 * h);
    face(j, d, { eye: 0xa9d8ff, brow: 0.02 });
  },
  lux({ joints: j, dims: d }) {
    const s = d.scaleY, w = d.buildWidth * s, l = d.limbScale * s, h = d.headScale * s;
    const jacket = std(0xff5fa8, { roughness: 0.5 }), cyan = lit(0x82f7ff, 1.4), dark = std(0x1a1622, { roughness: 0.6 }), white = std(0xf6f2f8);
    // the jacket: cut square at the shoulder, short at the hip
    add(j.torso, new THREE.CylinderGeometry(0.275 * w, 0.255 * w, 0.5 * s, 12, 1, true), jacket, 0, 0.3 * s, 0);
    for (const side of [-1, 1]) {
      add(j.shoulders, new THREE.BoxGeometry(0.17 * s, 0.06 * s, 0.2 * s), jacket, side * 0.27 * w, 0.03 * s, 0);
      // lapels, lit
      add(j.torso, new THREE.BoxGeometry(0.035 * s, 0.3 * s, 0.015 * s), cyan, side * 0.06 * w, 0.4 * s, 0.272 * w, 0, 0, -side * 0.28);
      add(j.armL === undefined ? j.torso : (side < 0 ? j.armL : j.armR).shoulder, new THREE.CylinderGeometry(0.055 * l, 0.055 * l, 0.28 * l, 8, 1, true), jacket, 0, -0.14 * l, 0);
    }
    add(j.torso, new THREE.BoxGeometry(0.1 * s, 0.26 * s, 0.012 * s), white, 0, 0.36 * s, 0.262 * w); // shirt front
    // the name badge, lit, and a lanyard
    add(j.torso, new THREE.BoxGeometry(0.09 * s, 0.055 * s, 0.014 * s), cyan, 0.13 * w, 0.3 * s, 0.278 * w);
    // trousers pressed dark, shoes with lit soles
    for (const leg of [j.legL, j.legR]) {
      add(leg.hip, new THREE.CylinderGeometry(0.062 * l, 0.056 * l, 0.34 * l, 8, 1, true), dark, 0, -0.17 * l, 0);
      add(leg.knee, new THREE.CylinderGeometry(0.052 * l, 0.048 * l, 0.3 * l, 8, 1, true), dark, 0, -0.15 * l, 0);
      add(leg.knee, new THREE.BoxGeometry(0.1 * l, 0.045 * l, 0.2 * l), white, 0, -0.325 * l, 0.045 * l);
      add(leg.knee, new THREE.BoxGeometry(0.105 * l, 0.014 * l, 0.205 * l), cyan, 0, -0.355 * l, 0.045 * l);
    }
    // the headset
    add(j.head, new THREE.TorusGeometry(0.175 * h, 0.012 * h, 6, 16, Math.PI), dark, 0, 0.15 * h, 0);
    add(j.head, new THREE.CylinderGeometry(0.035 * h, 0.035 * h, 0.03 * h, 8).rotateZ(Math.PI / 2), dark, 0.175 * h, 0.15 * h, 0);
    add(j.head, new THREE.BoxGeometry(0.012 * h, 0.012 * h, 0.14 * h), dark, 0.16 * h, 0.1 * h, 0.08 * h);
    add(j.head, new THREE.SphereGeometry(0.02 * h, 6, 5), cyan, 0.16 * h, 0.095 * h, 0.155 * h);
    face(j, d, { eye: 0xff9bd4, brow: 0.3 }); // (brows up in the middle: she worries)
  },
};

export function buildCaptain(id) {
  const rig = measureRig(buildRig(CAPTAIN_SEED[id] ?? 0x333, 'fleet', { dress: DRESS[id] }));
  rig.captain = id;
  rig.say = 0; // how open the mouth is
  rig.turn = 0; // how far the head is turned
  return rig;
}

// After poseRig. `talking`: their line is up. `yaw`: where to look, as an
// angle from the way the body faces (clamped to what a neck does).
export function liveCaptain(rig, dt, t, talking, yaw = 0) {
  const j = rig.joints;
  if (j.jaw) {
    const want = talking ? 0.55 + 0.45 * Math.sin(t * 17 + rig.params.gaitPhase) * Math.sin(t * 5.3) : 0;
    rig.say += (Math.max(want, 0) - rig.say) * Math.min(1, dt * 18);
    j.jaw.scale.y = 1 + rig.say * 3.2;
    j.jaw.position.y = j.jaw.userData.y0 ?? (j.jaw.userData.y0 = j.jaw.position.y);
    j.jaw.position.y -= rig.say * 0.012 * rig.params.scaleY;
  }
  let a = yaw;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  rig.turn += (Math.max(-1.15, Math.min(1.15, a)) - rig.turn) * Math.min(1, dt * 3.5);
  j.head.rotation.y = rig.turn;
  j.head.rotation.x = talking ? 0.05 * Math.sin(t * 6 + rig.params.gaitPhase) : 0;
}
