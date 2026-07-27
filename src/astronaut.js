// Procedural articulated astronaut, ported from world/src/game/astronaut.ts.
// Built entirely from primitive geometries; `group` is the world transform
// node the walker positions/orients (model faces +Z, feet at y=0, ~1.9 tall).
// update(dt, mode, speed01, lean) runs the per-joint animation blend:
// idle bob, run cycle, jump tuck, prone freestyle swim, snowboard stance
// (lean = carve -1..1, board worlds only).

import * as THREE from 'three';
import { C } from './constants.js';

const SUIT = new THREE.MeshStandardMaterial({ color: '#e9edf1', roughness: 0.5, metalness: 0.05 });
const SUIT_DARK = new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: 0.7 });
const JOINT = new THREE.MeshStandardMaterial({ color: '#aeb6bf', roughness: 0.8 });
const PACK = new THREE.MeshStandardMaterial({ color: '#d5dae0', roughness: 0.6 });
const RED = new THREE.MeshStandardMaterial({ color: '#c33f2e', roughness: 0.6 });
const BLUE = new THREE.MeshStandardMaterial({ color: '#2b6cb0', roughness: 0.6 });
// Small emissive nudge vs the demo: this scene has no environment map, so a
// pure metal visor would read near-black.
const VISOR = new THREE.MeshPhysicalMaterial({
  color: '#d7951f',
  metalness: 1.0,
  roughness: 0.06,
  envMapIntensity: 1.6,
  clearcoat: 0.6,
  emissive: '#7a4d0e',
  emissiveIntensity: 0.5,
});

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

export class Astronaut {
  constructor() {
    this.group = new THREE.Group(); // world position + heading
    this.body = new THREE.Group(); // procedural bob / pitch
    this.shoulderL = new THREE.Group();
    this.shoulderR = new THREE.Group();
    this.elbowL = new THREE.Group();
    this.elbowR = new THREE.Group();
    this.hipL = new THREE.Group();
    this.hipR = new THREE.Group();
    this.kneeL = new THREE.Group();
    this.kneeR = new THREE.Group();
    this.head = new THREE.Group();

    this.phase = 0; // run-cycle phase
    this.swimPhase = 0;
    this.time = 0;
    this.cur = {
      shL: { x: 0, z: 0 }, shR: { x: 0, z: 0 },
      elL: -0.3, elR: -0.3,
      hipL: 0, hipR: 0, kneeL: 0, kneeR: 0,
      bodyPitch: 0, bodyY: 0, bodyRoll: 0, headPitch: 0,
      bodyYaw: 0, headYaw: 0, // sideways board stance; every other mode targets 0
    };

    this.build();
    this.group.add(this.body);
  }

  build() {
    // ---- hips / pelvis -----------------------------------------------------
    const pelvis = mesh(new THREE.CapsuleGeometry(0.21, 0.16, 6, 12), SUIT, 0, 0.98, 0);
    pelvis.scale.set(1.15, 0.8, 0.95);
    this.body.add(pelvis);
    const belt = mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 14), SUIT_DARK, 0, 1.06, 0);
    this.body.add(belt);

    // ---- torso --------------------------------------------------------------
    const torso = mesh(new THREE.CapsuleGeometry(0.24, 0.34, 6, 14), SUIT, 0, 1.32, 0);
    torso.scale.set(1.12, 1, 0.88);
    this.body.add(torso);

    // chest control unit with colored toggles
    const chest = mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), PACK, 0, 1.34, 0.22);
    this.body.add(chest);
    const btnCols = [RED, BLUE, new THREE.MeshStandardMaterial({ color: '#d9b13b', roughness: 0.5 })];
    btnCols.forEach((m, i) => {
      this.body.add(mesh(new THREE.BoxGeometry(0.05, 0.04, 0.03), m, -0.08 + i * 0.08, 1.37, 0.28));
    });
    const display = mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02),
      new THREE.MeshStandardMaterial({ color: '#12262e', roughness: 0.2, emissive: '#1e5f74', emissiveIntensity: 0.7 }),
      0, 1.29, 0.275);
    this.body.add(display);

    // ---- backpack (PLSS) -----------------------------------------------------
    const pack = mesh(new THREE.BoxGeometry(0.42, 0.52, 0.22), PACK, 0, 1.36, -0.28);
    this.body.add(pack);
    const tankL = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 10), SUIT, -0.12, 1.36, -0.41);
    const tankR = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 10), SUIT, 0.12, 1.36, -0.41);
    this.body.add(tankL, tankR);
    this.body.add(mesh(new THREE.BoxGeometry(0.3, 0.08, 0.06), RED, 0, 1.62, -0.36));

    // ---- head / helmet --------------------------------------------------------
    this.head.position.set(0, 1.56, 0);
    const helmet = mesh(new THREE.SphereGeometry(0.175, 24, 18), SUIT, 0, 0.06, 0);
    this.head.add(helmet);
    // gold visor — front section of a sphere
    const visor = mesh(new THREE.SphereGeometry(0.155, 24, 18, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.22, Math.PI * 0.5), VISOR, 0, 0.055, 0.02);
    this.head.add(visor);
    // helmet side lamps
    this.head.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), SUIT_DARK, 0.17, 0.1, 0.04));
    this.head.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), SUIT_DARK, -0.17, 0.1, 0.04));
    const neckRing = mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.06, 14), JOINT, 0, -0.08, 0);
    this.head.add(neckRing);
    this.body.add(this.head);

    // ---- arms -----------------------------------------------------------------
    const buildArm = (side) => {
      const shoulder = side === 1 ? this.shoulderL : this.shoulderR;
      const elbow = side === 1 ? this.elbowL : this.elbowR;
      shoulder.position.set(side * 0.27, 1.46, 0);
      const upper = mesh(new THREE.CapsuleGeometry(0.085, 0.2, 6, 10), SUIT, 0, -0.16, 0);
      shoulder.add(upper);
      shoulder.add(mesh(new THREE.SphereGeometry(0.095, 12, 10), JOINT, 0, 0, 0));
      // mission stripe
      const stripe = mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.05, 10), side === 1 ? RED : BLUE, 0, -0.1, 0);
      shoulder.add(stripe);
      elbow.position.set(0, -0.32, 0);
      const fore = mesh(new THREE.CapsuleGeometry(0.075, 0.18, 6, 10), SUIT, 0, -0.13, 0);
      elbow.add(fore);
      elbow.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), SUIT_DARK, 0, -0.28, 0)); // glove
      shoulder.add(elbow);
      this.body.add(shoulder);
    };
    buildArm(1);
    buildArm(-1);

    // ---- legs ------------------------------------------------------------------
    const buildLeg = (side) => {
      const hip = side === 1 ? this.hipL : this.hipR;
      const knee = side === 1 ? this.kneeL : this.kneeR;
      hip.position.set(side * 0.13, 0.95, 0);
      hip.add(mesh(new THREE.CapsuleGeometry(0.105, 0.3, 6, 10), SUIT, 0, -0.2, 0));
      hip.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10), side === 1 ? RED : BLUE, 0, -0.12, 0));
      knee.position.set(0, -0.44, 0);
      knee.add(mesh(new THREE.CapsuleGeometry(0.09, 0.28, 6, 10), SUIT, 0, -0.18, 0));
      const boot = mesh(new THREE.BoxGeometry(0.16, 0.12, 0.3), SUIT_DARK, 0, -0.4, 0.05);
      knee.add(boot);
      hip.add(knee);
      this.body.add(hip);
    };
    buildLeg(1);
    buildLeg(-1);

    // ---- snowboard (board mode only) -------------------------------------------
    // Flattened capsule = rounded nose/tail deck. Parented to `group` (the
    // feet/travel frame, +Z = direction of motion) rather than `body`, so
    // the deck holds the line while the stance yaw turns the rider sideways
    // above it. Accent magenta.
    const deck = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.17, 1.35, 4, 10),
      new THREE.MeshStandardMaterial({
        color: 0xd4408f, emissive: 0xd4408f, emissiveIntensity: 0.25, roughness: 0.5,
      })
    );
    deck.scale.set(1, 1, 0.24); // pre-rotation: squash local Z -> deck thickness
    deck.rotation.x = Math.PI / 2; // capsule axis Y -> Z (nose along travel)
    deck.position.set(0, 0.06, 0);
    deck.visible = false;
    this.board = deck;
    this.group.add(deck);

    // Quest vehicles (world/vehicles.js), attached lazily by walk.js once the
    // walker initializes. Keyed by inventory id; each entry remembers whether
    // it rides the travel frame (group) or the torso (body).
    this.vehicles = {};
  }

  // Attach the four quest-vehicle meshes. `built` is world/vehicles.js
  // buildVehicles() output: { id: { group, parent } }.
  attachVehicles(built) {
    for (const id of Object.keys(built)) {
      const v = built[id];
      (v.parent === 'body' ? this.body : this.group).add(v.group);
      if (v.parent === 'body') v.group.position.set(0, 0.35, -0.26); // on the back
      v.group.visible = false;
      this.vehicles[id] = v;
    }
  }

  // ---------------------------------------------------------------------------
  // Procedural animation with per-joint blending
  // ---------------------------------------------------------------------------
  update(dt, mode, speed01, lean = 0, vehicle = null) {
    this.time += dt;
    const t = this.time;
    const k = 1 - Math.exp(-11 * dt);
    this.board.visible = mode === 'board';
    // Vehicle visibility: the mount shows whenever it's deployed; the kite
    // only opens once airborne (mode 'glide') — on the ground it's stowed.
    if (this.vehicles.motorcycle) this.vehicles.motorcycle.group.visible = vehicle === 'motorcycle';
    if (this.vehicles.jetpack) this.vehicles.jetpack.group.visible = vehicle === 'jetpack';
    if (this.vehicles.hangglider) this.vehicles.hangglider.group.visible = vehicle === 'hangglider' && mode === 'glide';
    if (this.vehicles.plane) this.vehicles.plane.group.visible = vehicle === 'plane';
    if (this.vehicles.plane?.group.userData.prop) {
      this.vehicles.plane.group.userData.prop.rotation.z +=
        dt * (mode === 'plane' ? 40 : 2);
    }

    // targets
    const tg = {
      shL: { x: 0, z: 0.06 }, shR: { x: 0, z: -0.06 },
      elL: -0.35, elR: -0.35,
      hipL: 0, hipR: 0, kneeL: 0.06, kneeR: 0.06,
      bodyPitch: 0, bodyY: 0, bodyRoll: 0, headPitch: 0,
      bodyYaw: 0, headYaw: 0,
    };

    if (mode === 'idle') {
      const b = Math.sin(t * 1.7);
      tg.bodyY = b * 0.012;
      tg.shL.x = 0.04 + b * 0.02;
      tg.shR.x = 0.04 - b * 0.02;
      tg.shL.z = 0.07 + b * 0.008;
      tg.shR.z = -0.07 - b * 0.008;
      tg.elL = -0.28; tg.elR = -0.28;
      tg.headPitch = Math.sin(t * 0.4) * 0.06 - 0.02;
    } else if (mode === 'run') {
      this.phase += dt * (7 + speed01 * 6.5);
      const p = this.phase;
      const A = 0.55 + speed01 * 0.4;
      const s = Math.sin(p);
      tg.hipL = s * A;
      tg.hipR = -s * A;
      tg.kneeL = Math.max(0.08, -Math.sin(p - 0.7)) * (0.7 + speed01 * 0.7);
      tg.kneeR = Math.max(0.08, Math.sin(p - 0.7)) * (0.7 + speed01 * 0.7);
      tg.shL.x = -s * A * 0.85;
      tg.shR.x = s * A * 0.85;
      tg.elL = -0.5 - speed01 * 0.35;
      tg.elR = -0.5 - speed01 * 0.35;
      tg.bodyY = Math.abs(Math.cos(p)) * (0.04 + speed01 * 0.05);
      tg.bodyPitch = 0.1 + speed01 * 0.14;
      tg.bodyRoll = Math.sin(p) * 0.03;
      tg.headPitch = -0.06 - speed01 * 0.05;
    } else if (mode === 'jump') {
      tg.hipL = -0.55; tg.hipR = 0.3;
      tg.kneeL = 1.15; tg.kneeR = 0.75;
      tg.shL.x = -0.7; tg.shL.z = 0.75;
      tg.shR.x = -0.7; tg.shR.z = -0.75;
      tg.elL = -0.4; tg.elR = -0.4;
      tg.bodyPitch = 0.08;
      tg.bodyY = 0.02;
    } else if (mode === 'swim') {
      this.swimPhase += dt * 4.6;
      const sp = this.swimPhase;
      // prone freestyle
      tg.bodyPitch = -1.32;
      tg.bodyY = -0.55;
      tg.headPitch = 1.05; // keep the helmet above water
      // alternating arm strokes (full overhead recovery)
      tg.shL.x = -sp % (Math.PI * 2) - Math.PI * 0.5;
      tg.shR.x = (-sp + Math.PI) % (Math.PI * 2) - Math.PI * 0.5;
      tg.shL.z = 0.35; tg.shR.z = -0.35;
      tg.elL = -0.5 - Math.max(0, Math.sin(sp)) * 0.6;
      tg.elR = -0.5 - Math.max(0, Math.sin(sp + Math.PI)) * 0.6;
      // flutter kick
      tg.hipL = Math.sin(sp * 2.2) * 0.4;
      tg.hipR = -Math.sin(sp * 2.2) * 0.4;
      tg.kneeL = 0.25 + Math.max(0, -Math.sin(sp * 2.2)) * 0.35;
      tg.kneeR = 0.25 + Math.max(0, Math.sin(sp * 2.2)) * 0.35;
      tg.bodyRoll = Math.sin(sp) * 0.14;
    } else if (mode === 'moto' || mode === 'plane') {
      // Seated riding tuck: hips folded, knees up, arms forward to the bars,
      // whole body rolling into the carve (moto) / bank (plane).
      const tuck = mode === 'moto' ? 0.2 + speed01 * 0.2 : 0.15;
      tg.hipL = -1.25; tg.hipR = -1.25;
      tg.kneeL = 1.45; tg.kneeR = 1.45;
      tg.shL.x = -0.95; tg.shR.x = -0.95;
      tg.shL.z = 0.25; tg.shR.z = -0.25;
      tg.elL = -0.55; tg.elR = -0.55;
      tg.bodyPitch = 0.25 + tuck;
      tg.bodyY = mode === 'moto' ? -0.34 : -0.3;
      tg.bodyRoll = lean * 0.4;
      tg.headPitch = -0.2 - tuck * 0.4;
    } else if (mode === 'jet') {
      // Upright thrust: slight forward lean, legs together and trailing,
      // arms held low and out for balance.
      tg.hipL = 0.35; tg.hipR = 0.3;
      tg.kneeL = 0.5; tg.kneeR = 0.55;
      tg.shL.x = 0.25; tg.shR.x = 0.25;
      tg.shL.z = 0.55; tg.shR.z = -0.55;
      tg.elL = -0.3; tg.elR = -0.3;
      tg.bodyPitch = 0.3;
      tg.bodyRoll = lean * 0.25;
      tg.headPitch = -0.25;
    } else if (mode === 'glide') {
      // Prone under the kite: the swimmer's body line, hands up on the
      // control bar, head up to the horizon.
      tg.bodyPitch = -1.25;
      tg.bodyY = -0.35;
      tg.headPitch = 1.0;
      tg.shL.x = -1.7; tg.shR.x = -1.7;
      tg.shL.z = 0.3; tg.shR.z = -0.3;
      tg.elL = -0.8; tg.elR = -0.8;
      tg.hipL = 0.2; tg.hipR = 0.2;
      tg.kneeL = 0.35; tg.kneeR = 0.35;
      tg.bodyRoll = lean * 0.5;
    } else if (mode === 'board') {
      // Sideways (regular) stance over the deck, helmet turned down the fall
      // line, knees sinking deeper as the ride speeds up, arms out for
      // balance, whole body rolling into the carve.
      const crouch = 0.25 + speed01 * 0.45;
      tg.bodyYaw = -0.95;
      tg.headYaw = 0.85;
      tg.headPitch = 0.05;
      tg.hipL = -crouch;
      tg.hipR = -crouch * 0.9;
      tg.kneeL = crouch * 1.6;
      tg.kneeR = crouch * 1.5;
      tg.bodyY = -0.1 - speed01 * 0.12;
      tg.bodyPitch = 0.12;
      tg.bodyRoll = lean * C.BOARD_LEAN;
      tg.shL.x = -0.25 + lean * 0.3;
      tg.shL.z = 0.95;
      tg.shR.x = -0.25 - lean * 0.3;
      tg.shR.z = -0.95;
      tg.elL = -0.25; tg.elR = -0.25;
    }

    // blend
    const c = this.cur;
    const lp = (a, b) => a + (b - a) * k;
    c.shL.x = lp(c.shL.x, tg.shL.x); c.shL.z = lp(c.shL.z, tg.shL.z);
    c.shR.x = lp(c.shR.x, tg.shR.x); c.shR.z = lp(c.shR.z, tg.shR.z);
    c.elL = lp(c.elL, tg.elL); c.elR = lp(c.elR, tg.elR);
    c.hipL = lp(c.hipL, tg.hipL); c.hipR = lp(c.hipR, tg.hipR);
    c.kneeL = lp(c.kneeL, tg.kneeL); c.kneeR = lp(c.kneeR, tg.kneeR);
    c.bodyPitch = lp(c.bodyPitch, tg.bodyPitch);
    c.bodyY = lp(c.bodyY, tg.bodyY);
    c.bodyRoll = lp(c.bodyRoll, tg.bodyRoll);
    c.headPitch = lp(c.headPitch, tg.headPitch);
    c.bodyYaw = lp(c.bodyYaw, tg.bodyYaw);
    c.headYaw = lp(c.headYaw, tg.headYaw);

    this.shoulderL.rotation.set(c.shL.x, 0, c.shL.z);
    this.shoulderR.rotation.set(c.shR.x, 0, c.shR.z);
    this.elbowL.rotation.x = c.elL;
    this.elbowR.rotation.x = c.elR;
    this.hipL.rotation.x = c.hipL;
    this.hipR.rotation.x = c.hipR;
    this.kneeL.rotation.x = c.kneeL;
    this.kneeR.rotation.x = c.kneeR;
    this.body.rotation.x = c.bodyPitch;
    this.body.rotation.y = c.bodyYaw;
    this.body.rotation.z = c.bodyRoll;
    this.body.position.y = c.bodyY;
    this.head.rotation.x = c.headPitch;
    this.head.rotation.y = c.headYaw;
  }
}
