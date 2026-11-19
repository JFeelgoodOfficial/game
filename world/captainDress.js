// The captains, as themselves (GDD 5.7.4).
//
// The figures world/aliens.js makes are a body in two colours. The captains
// are met in four places and followed round a city, so each is dressed as
// what they are, the same wherever they appear:
//
//   vask     Shift-Captain, Rustia: a miner's long coat in rust, a hard hat
//            with its lamp lit, a lamp at the chest, heavy boots; five tally
//            seams on the left forearm
//   marrow   Cantor, Saturnia: a pale robe to the ankle, a stole, a collar of
//            small gold bells; her ring is the widest there is, hung with
//            five bells more
//   lux      Floor Manager, Wavemall Prime: a sharp pink jacket with cyan
//            lapels, a lit name badge, a headset, shoes with lit soles; her
//            lights run three times too fast and will not hold
//
// and two who hold a town (world/citizens.js stands them in the penthouse):
//
//   rynva    Baron, Rustia: a long burgundy frock coat with brass buttons,
//            ember ore on a chain, an ore ring that relights the seams of
//            that hand. His own have gone dim. No hard hat.
//   governor of the Indigo Reach, Neptunia: a dark teal oilskin and a yellow
//            harness
//
// Each is the clearest example of their people (world/species.js): the body
// is drawn from the people's ranges and then forced to CAPTAINS, so nothing
// about a captain depends on what a seed happens to roll. Each has a face:
// two eyes with lit pupils, a brow, and a mouth that moves when they speak.
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
import { CAPTAINS } from './species.js';
import { liveSignature } from './signatures.js';

// the Pavilion's own three (the same seeds everywhere, so the same bodies),
// and the two governors
export const CAPTAIN_SEED = { vask: 0x51a, marrow: 0x7c3, lux: 0x2e9, rynva: 0x6b1, governor: 0x4d7 };

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
// (the only eyes a captain has: buildRig places none on them. `d.eyeScale` is
// the people's; `look.pupil` is a material to use for the pupils, where they
// are lit by something else.)
function face(j, d, look) {
  const h = d.headScale * d.scaleY, e = d.eyeScale ?? 1;
  const white = std(0xf4f1ea, { roughness: 0.35 }), pupil = look.pupil ?? lit(look.eye, 2.2), dark = std(0x16130f);
  const ex = 0.066 * h * (1 + 0.38 * (e - 1));
  for (const s of [-1, 1]) {
    add(j.head, new THREE.SphereGeometry(0.044 * h * e, 10, 8), white, s * ex, 0.165 * h, 0.128 * h);
    add(j.head, new THREE.SphereGeometry(0.022 * h * e, 8, 6), pupil, s * ex, 0.165 * h, (0.128 + 0.038 * e) * h);
    // a brow, set the way this one's face is set
    add(j.head, new THREE.BoxGeometry(0.085 * h, 0.016 * h, 0.03 * h), dark, s * (ex + 0.002 * h), (0.184 + 0.044 * e) * h, 0.15 * h, 0, 0, s * look.brow);
  }
  // the mouth is on a joint of its own, so it can move
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.082 * h, 0.155 * h);
  j.head.add(jaw);
  add(jaw, new THREE.BoxGeometry(0.085 * h, 0.014 * h, 0.02 * h), dark);
  j.jaw = jaw;
}

const DRESS = {
  vask({ joints: j, dims: d, signature: sig }) {
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
    // five shifts he does not talk about: short seams across the left forearm
    if (sig) for (let i = 0; i < 5; i++) add(j.armL.elbow, new THREE.BoxGeometry(0.05 * l, 0.008 * l, 0.03 * l), sig.mat, -0.004 * l, -0.045 * l - i * 0.026 * l, 0.024 * l, 0, 0, 0.12);
    face(j, d, { eye: 0xffa860, brow: -0.12 });
  },
  rynva({ joints: j, dims: d }) {
    const s = d.scaleY, w = d.buildWidth * s, l = d.limbScale * s;
    const coat = std(0x4a2326, { roughness: 0.6 }), brass = std(0xc9a455, { metalness: 0.7, roughness: 0.3 }), dark = std(0x2a2420, { roughness: 0.9 }), ore = lit(0xff8a3a, 2.6);
    // the frock coat: fitted over the chest, long and full below, open at the front
    add(j.torso, new THREE.CylinderGeometry(0.262 * w, 0.272 * w, 0.54 * s, 14, 1, true), coat, 0, 0.28 * s, 0);
    add(j.pelvis, new THREE.CylinderGeometry(0.272 * w, 0.4 * w, 0.74 * s, 14, 1, true, 0.4, Math.PI * 2 - 0.8), coat, 0, -0.33 * s, 0);
    add(j.torso, new THREE.CylinderGeometry(0.19 * w, 0.275 * w, 0.09 * s, 14, 1, true), coat, 0, 0.57 * s, 0); // a high collar
    for (const side of [-1, 1]) {
      const arm = side < 0 ? j.armL : j.armR;
      add(arm.shoulder, new THREE.CylinderGeometry(0.06 * l, 0.055 * l, 0.29 * l, 8, 1, true), coat, 0, -0.14 * l, 0);
      add(arm.elbow, new THREE.CylinderGeometry(0.052 * l, 0.058 * l, 0.22 * l, 8, 1, true), coat, 0, -0.11 * l, 0);
      add(arm.elbow, new THREE.CylinderGeometry(0.06 * l, 0.06 * l, 0.025 * l, 8, 1, true), brass, 0, -0.215 * l, 0); // cuff
      // two rows of brass buttons
      for (let i = 0; i < 4; i++) add(j.torso, new THREE.SphereGeometry(0.016 * s, 8, 6), brass, side * 0.07 * w, 0.14 * s + i * 0.1 * s, 0.262 * w);
    }
    // a piece of ember ore on a chain
    add(j.torso, new THREE.TorusGeometry(0.15 * w, 0.006 * s, 5, 20, Math.PI).rotateZ(Math.PI), brass, 0, 0.52 * s, 0.2 * w, -0.5);
    add(j.torso, new THREE.OctahedronGeometry(0.03 * s), ore, 0, 0.385 * s, 0.285 * w);
    // the ore ring, and the seams of that hand relit by it
    add(j.armR.elbow, new THREE.TorusGeometry(0.02 * l, 0.007 * l, 5, 10).rotateX(Math.PI / 2), brass, 0.012 * l, -0.325 * l, 0.012 * l);
    add(j.armR.elbow, new THREE.OctahedronGeometry(0.014 * l), ore, 0.03 * l, -0.325 * l, 0.012 * l);
    for (let k = -1; k <= 1; k++) add(j.armR.elbow, new THREE.BoxGeometry(0.034 * l, 0.008 * l, 0.013 * l), ore, 0.014 * l, -0.34 * l, k * 0.022 * l);
    add(j.armR.elbow, new THREE.BoxGeometry(0.01 * l, 0.07 * l, 0.03 * l), ore, 0.03 * l, -0.26 * l, 0.012 * l);
    // good boots that have never seen the face
    for (const leg of [j.legL, j.legR]) {
      add(leg.knee, new THREE.CylinderGeometry(0.058 * l, 0.064 * l, 0.2 * l, 8), dark, 0, -0.23 * l, 0);
      add(leg.knee, new THREE.BoxGeometry(0.12 * l, 0.06 * l, 0.21 * l), dark, 0, -0.335 * l, 0.05 * l);
    }
    face(j, d, { eye: 0xffa860, brow: 0.14 });
  },
  governor({ joints: j, dims: d }) {
    const s = d.scaleY, w = d.buildWidth * s, l = d.limbScale * s;
    const oil = std(0x1f4a52, { roughness: 0.28, metalness: 0.1 }), yellow = std(0xe8c547, { roughness: 0.55 }), dark = std(0x16252b, { roughness: 0.5 }), steel = std(0x8c9aa0, { metalness: 0.7, roughness: 0.35 });
    // the oilskin: closed to the throat, to the knee, shining wet
    add(j.torso, new THREE.CylinderGeometry(0.262 * w, 0.275 * w, 0.54 * s, 14, 1, true), oil, 0, 0.28 * s, 0);
    add(j.pelvis, new THREE.CylinderGeometry(0.275 * w, 0.36 * w, 0.56 * s, 14, 1, true), oil, 0, -0.24 * s, 0);
    add(j.torso, new THREE.CylinderGeometry(0.2 * w, 0.27 * w, 0.06 * s, 14, 1, true), oil, 0, 0.555 * s, 0); // (low: the gills stay clear)
    for (const arm of [j.armL, j.armR]) {
      add(arm.shoulder, new THREE.CylinderGeometry(0.06 * l, 0.055 * l, 0.29 * l, 8, 1, true), oil, 0, -0.14 * l, 0);
      add(arm.elbow, new THREE.CylinderGeometry(0.052 * l, 0.06 * l, 0.2 * l, 8, 1, true), oil, 0, -0.1 * l, 0);
    }
    // the harness: a belt, two straps over the shoulders crossing at the chest, a ring where they meet
    add(j.torso, new THREE.CylinderGeometry(0.283 * w, 0.283 * w, 0.055 * s, 14, 1, true), yellow, 0, 0.06 * s, 0);
    for (const side of [-1, 1]) {
      add(j.torso, new THREE.BoxGeometry(0.045 * s, 0.56 * s, 0.016 * s), yellow, 0, 0.3 * s, 0.27 * w, 0, 0, side * 0.42);
      add(j.torso, new THREE.BoxGeometry(0.045 * s, 0.5 * s, 0.016 * s), yellow, side * 0.11 * w, 0.3 * s, -0.255 * w);
      add(j.pelvis, new THREE.BoxGeometry(0.04 * s, 0.3 * s, 0.016 * s), yellow, side * 0.13 * w, -0.1 * s, 0.31 * w, 0.16); // leg straps
    }
    add(j.torso, new THREE.TorusGeometry(0.032 * s, 0.008 * s, 6, 14), steel, 0, 0.3 * s, 0.283 * w);
    add(j.torso, new THREE.BoxGeometry(0.06 * s, 0.04 * s, 0.02 * s), steel, 0, 0.06 * s, 0.285 * w); // buckle
    // sea boots
    for (const leg of [j.legL, j.legR]) {
      add(leg.knee, new THREE.CylinderGeometry(0.06 * l, 0.066 * l, 0.24 * l, 8), dark, 0, -0.21 * l, 0);
      add(leg.knee, new THREE.BoxGeometry(0.125 * l, 0.06 * l, 0.22 * l), dark, 0, -0.335 * l, 0.05 * l);
    }
    face(j, d, { eye: 0x6fe3ff, brow: -0.04 });
  },
  marrow({ joints: j, dims: d, signature: sig }) {
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
    // where the circlet was, her ring; five small bells hang from it
    if (sig && sig.ring) {
      for (let i = 0; i < 5; i++) {
        const a = Math.PI / 2 + (i - 2) * 0.62;
        add(sig.ring, new THREE.CylinderGeometry(0.0025 * h, 0.0025 * h, 0.03 * h, 4), gold, Math.cos(a) * sig.radius, -0.015 * h, Math.sin(a) * sig.radius);
        add(sig.ring, new THREE.ConeGeometry(0.017 * h, 0.032 * h, 6), gold, Math.cos(a) * sig.radius, -0.042 * h, Math.sin(a) * sig.radius);
      }
    }
    face(j, d, { eye: 0xa9d8ff, brow: 0.02 });
  },
  lux({ joints: j, dims: d, signature: sig }) {
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
    // (brows up in the middle: she worries. Her pupils are her lights' colour.)
    face(j, d, { eye: 0xff9bd4, brow: 0.3, pupil: sig ? sig.mat : undefined });
  },
};

export function buildCaptain(id) {
  const cap = CAPTAINS[id];
  const o = { dress: DRESS[id] };
  if (cap) {
    o.species = cap.species;
    o.noEyes = true; // the face draws the two
    o.over = {
      height: cap.height, build: cap.build, skin: cap.skin, eyeScale: cap.eyeScale,
      seamBrightness: cap.seamBrightness, ringWidth: cap.ringWidth, lightSpeed: cap.lightSpeed,
      flicker: !!cap.extras && cap.extras.includes('flicker'),
    };
  }
  const rig = measureRig(buildRig(CAPTAIN_SEED[id] ?? 0x333, 'fleet', o));
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
  liveSignature(rig, dt, t, talking);
}
