// Procedural articulated astronaut, ported from world/src/game/astronaut.ts.
// Built entirely from primitive geometries; `group` is the world transform
// node the walker positions/orients (model faces +Z, feet at y=0, ~1.9 tall).
// update(dt, mode, speed01) runs the per-joint animation blend:
// idle bob, run cycle, jump tuck, prone freestyle swim.

import * as THREE from 'three';

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
  }

  // ---------------------------------------------------------------------------
  // Procedural animation with per-joint blending
  // ---------------------------------------------------------------------------
  update(dt, mode, speed01) {
    this.time += dt;
    const t = this.time;
    const k = 1 - Math.exp(-11 * dt);

    // targets
    const tg = {
      shL: { x: 0, z: 0.06 }, shR: { x: 0, z: -0.06 },
      elL: -0.35, elR: -0.35,
      hipL: 0, hipR: 0, kneeL: 0.06, kneeR: 0.06,
      bodyPitch: 0, bodyY: 0, bodyRoll: 0, headPitch: 0,
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

    this.shoulderL.rotation.set(c.shL.x, 0, c.shL.z);
    this.shoulderR.rotation.set(c.shR.x, 0, c.shR.z);
    this.elbowL.rotation.x = c.elL;
    this.elbowR.rotation.x = c.elR;
    this.hipL.rotation.x = c.hipL;
    this.hipR.rotation.x = c.hipR;
    this.kneeL.rotation.x = c.kneeL;
    this.kneeR.rotation.x = c.kneeR;
    this.body.rotation.x = c.bodyPitch;
    this.body.rotation.z = c.bodyRoll;
    this.body.position.y = c.bodyY;
    this.head.rotation.x = c.headPitch;
  }
}
