// Monsters — the things that come over the town wall.
//
// This module is bodies only: the archetype table (size, health, hit volumes,
// attack numbers), the per-world skins, and a kit that builds an articulated
// rig for an archetype and poses it from a handful of state numbers. The
// brains — where a monster goes, when it attacks, what its attack does to the
// player — live in warzone.js, which owns the player and the town.
//
// Everything is primitives: one set of unit geometries per town, scaled into
// limbs and plates. A monster is ~25-40 meshes under a few joint Groups; no
// skinning, no models. Motion is code — gait from a phase that advances with
// distance walked, attack wind-ups from a 0..1 `tele`, strikes from `strike`.
//
// Frame: monster-local, +Z forward, +Y up, origin on the ground between the
// feet. Metres. For scale: the player's eye is at 1.72.
//
// Hit volumes are spheres in that frame: [x, y, z, radius, multiplier]. A
// multiplier of CRIT marks a weak point (the weapon's own crit multiplier
// applies); anything else is a flat scale on damage.

import * as THREE from 'three';

export const CRIT = -1; // sentinel in a part's multiplier slot

export const ARCHETYPES = {
  // A quadruped the size of a truck. Charges in a straight line; up close it
  // rears and slams the ground, and the shock goes through walls.
  brute: {
    name: 'BRUTE', hp: 950, radius: 2.4, speed: 6.2, eyeY: 3.0, size: 0.55, score: 300,
    parts: [
      [0, 2.7, 0.9, 1.9, 1], [0, 2.6, -1.3, 1.7, 1], [0, 3.7, 0.6, 1.2, 1],
      [0, 2.3, 3.3, 1.05, CRIT],
    ],
    chargeSpeed: 17, chargeMin: 11, chargeMax: 46, chargeTele: 0.95, chargeDmg: 46,
    slamRange: 6.5, slamRadius: 8.5, slamTele: 0.8, slamDmg: 38,
    gait: 1.5, // phase radians per metre
  },
  // Tall, thin-legged, with a bloated glowing sac. Keeps its distance and
  // lobs acid that pools where it lands.
  spitter: {
    name: 'SPITTER', hp: 440, radius: 1.3, speed: 5.0, eyeY: 3.8, size: 0.35, score: 200,
    parts: [
      [0, 2.5, 0, 1.05, 1], [0, 3.9, 1.25, 0.6, 1.5], [0, 3.25, -0.95, 1.15, CRIT],
      [0, 1.1, 0, 0.7, 0.7],
    ],
    keepMin: 16, keepMax: 34, spitTele: 0.85, spitCd: 3.2,
    globSpeed: 24, globGravity: 16, globDmg: 30, globRadius: 3.6,
    poolTime: 4.5, poolDps: 14, poolRadius: 2.8,
    gait: 2.6,
  },
  // Four stilt legs and a small body seven metres up. Strides over cover,
  // then leaps onto where you are standing.
  stalker: {
    name: 'STALKER', hp: 680, radius: 1.5, speed: 9.0, eyeY: 5.6, size: 0.45, score: 350,
    parts: [
      [0, 5.6, 0, 1.35, 1], [0, 4.85, 0.25, 0.75, CRIT], [0, 5.5, 1.7, 0.6, 1.5],
      [2.4, 1.6, 2.4, 0.55, 0.5], [-2.4, 1.6, 2.4, 0.55, 0.5],
      [2.4, 1.6, -2.4, 0.55, 0.5], [-2.4, 1.6, -2.4, 0.55, 0.5],
    ],
    leapMin: 9, leapMax: 34, leapTele: 0.75, leapTime: 1.05, leapHeight: 9,
    landRadius: 4.6, landDmg: 42, swipeRange: 5.2, swipeDmg: 24, swipeTele: 0.45,
    gait: 0.9,
  },
  // The every-fifth-wave problem. Eighteen metres of it.
  titan: {
    name: 'TITAN', hp: 7200, radius: 3.0, speed: 3.6, eyeY: 15.5, size: 1, score: 2500,
    parts: [
      [0, 11.5, 0, 3.7, 1], [0, 7.4, 0, 2.5, 1], [0, 15.9, 1.2, 1.35, 1.5],
      [0, 11.6, 2.9, 1.5, CRIT], [3.7, 14.1, 0.2, 1.35, CRIT], [-3.7, 14.1, 0.2, 1.35, CRIT],
      [1.9, 4.2, 0, 1.5, 0.7], [-1.9, 4.2, 0, 1.5, 0.7],
      [1.9, 1.4, 0.3, 1.3, 0.7], [-1.9, 1.4, 0.3, 1.3, 0.7],
    ],
    stompRange: 15, stompRadius: 17, stompTele: 1.25, stompDmg: 48,
    volleyMin: 18, volleyTele: 1.0, volleyCount: 3, volleyCd: 6,
    globSpeed: 30, globGravity: 14, globDmg: 34, globRadius: 4.5,
    poolTime: 5, poolDps: 16, poolRadius: 3.4,
    gait: 0.42,
  },
};

// The swarm is instanced in warzone.js rather than rigged here.
export const SWARMLING = {
  name: 'SWARMLING', hp: 34, radius: 0.55, size: 0.05, score: 40,
  flock: 6, cruise: 11, diveSpeed: 23, orbitR: 13, orbitY: 7.5,
  diveTele: 0.5, biteReach: 1.5, biteDmg: 9,
};

// Per-world skin: hide, armour plate, and the colour everything glows.
export const SKINS = {
  terra: { name: 'THE CRIMSON BROOD', hide: 0x4a1d1b, plate: 0x1c1113, bone: 0xc9b99a, glow: 0xff3b2f, leap: 1 },
  rustia: { name: 'THE DUSTJAW HORDE', hide: 0x6d4a2b, plate: 0x2a1d14, bone: 0xd8c49c, glow: 0xff8a1f, leap: 1.35 },
  neptunia: { name: 'THE TRENCH LEVIATHANS', hide: 0x1b3d48, plate: 0x0c1c22, bone: 0xa9c4c4, glow: 0x3df0ff, leap: 1 },
  wyattmattoe: { name: 'THE WHITEOUT MAULERS', hide: 0x8c93a4, plate: 0x3a3f4c, bone: 0xe6e8ee, glow: 0xc46bff, leap: 1.25 },
};

// ---------------------------------------------------------------------------

export function createMonsterKit(skin) {
  // Unit geometries, shared by every monster in the town.
  const G = {
    sph: new THREE.SphereGeometry(1, 12, 9),
    box: new THREE.BoxGeometry(1, 1, 1),
    // limb: unit length, hanging DOWN from its origin, tapering to 60%
    limb: new THREE.CylinderGeometry(1, 0.6, 1, 8).translate(0, -0.5, 0),
    // spike: unit length, pointing UP from its origin
    spike: new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0),
  };
  const glowCol = new THREE.Color(skin.glow);
  const M = {
    plate: new THREE.MeshStandardMaterial({ color: skin.plate, roughness: 0.55, metalness: 0.35 }),
    bone: new THREE.MeshStandardMaterial({ color: skin.bone, roughness: 0.7 }),
    glow: new THREE.MeshStandardMaterial({
      color: 0x0a0a0a, emissive: glowCol, emissiveIntensity: 2.6, roughness: 0.35,
    }),
    eye: new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(3.2) }),
  };
  const hideProto = new THREE.MeshStandardMaterial({
    color: skin.hide, roughness: 0.82, metalness: 0.05, emissive: 0xffffff, emissiveIntensity: 0,
  });

  const joint = (parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const add = (parent, geo, mat, sx, sy, sz, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (rx || ry || rz) m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  // Two-segment leg hanging from a hip joint. Returns { hip, knee }.
  const leg = (parent, hide, x, y, z, up, lo, thick, footR) => {
    const hip = joint(parent, x, y, z);
    add(hip, G.limb, hide, thick, up, thick);
    add(hip, G.sph, M.plate, thick * 1.15, thick * 1.15, thick * 1.15);
    const knee = joint(hip, 0, -up, 0);
    add(knee, G.limb, hide, thick * 0.72, lo, thick * 0.72);
    add(knee, G.sph, M.bone, thick * 0.8, thick * 0.8, thick * 0.8);
    add(knee, G.sph, M.plate, footR, footR * 0.45, footR * 1.25, 0, -lo + footR * 0.3, footR * 0.3);
    return { hip, knee };
  };

  // ---- builders: each returns { root, j } with root's origin on the ground --

  function brute(hide) {
    const root = new THREE.Group();
    const j = {};
    j.body = joint(root, 0, 0, 0);
    add(j.body, G.sph, hide, 1.75, 1.5, 2.7, 0, 2.7, 0);
    add(j.body, G.sph, hide, 1.35, 1.25, 1.6, 0, 3.6, 0.9); // shoulder hump
    for (let i = 0; i < 4; i++) {
      add(j.body, G.box, M.plate, 2.3 - i * 0.2, 0.34, 1.0, 0, 4.25 - i * 0.42, 1.5 - i * 1.15, -0.28 - i * 0.08);
    }
    for (let i = 0; i < 5; i++) {
      add(j.body, G.spike, M.bone, 0.2, 1.15 - i * 0.12, 0.2, 0, 4.45 - i * 0.42, 1.6 - i * 0.95, -0.35);
    }
    j.head = joint(j.body, 0, 2.5, 2.6);
    add(j.head, G.sph, hide, 1.0, 0.85, 1.15, 0, 0, 0.7);
    add(j.head, G.box, M.plate, 1.5, 0.4, 1.2, 0, 0.55, 0.6, -0.15); // brow plate
    for (const s of [-1, 1]) {
      add(j.head, G.spike, M.bone, 0.2, 1.5, 0.2, s * 0.85, -0.1, 1.2, 1.25, 0, -s * 0.35); // tusk
      add(j.head, G.sph, M.eye, 0.11, 0.11, 0.11, s * 0.42, 0.22, 1.72);
      add(j.head, G.sph, M.eye, 0.07, 0.07, 0.07, s * 0.68, 0.34, 1.5);
    }
    j.jaw = joint(j.head, 0, -0.35, 0.5);
    add(j.jaw, G.box, M.plate, 1.15, 0.3, 1.3, 0, -0.1, 0.6);
    add(j.jaw, G.sph, M.glow, 0.55, 0.2, 0.7, 0, 0.12, 0.6); // the throat
    for (let i = 0; i < 4; i++) add(j.jaw, G.spike, M.bone, 0.07, 0.3, 0.07, -0.42 + i * 0.28, 0.05, 1.15);
    j.legs = [
      leg(j.body, hide, 1.35, 2.5, 1.9, 1.5, 1.35, 0.5, 0.55),
      leg(j.body, hide, -1.35, 2.5, 1.9, 1.5, 1.35, 0.5, 0.55),
      leg(j.body, hide, 1.3, 2.4, -1.9, 1.4, 1.3, 0.55, 0.55),
      leg(j.body, hide, -1.3, 2.4, -1.9, 1.4, 1.3, 0.55, 0.55),
    ];
    j.tail = joint(j.body, 0, 2.6, -2.5);
    add(j.tail, G.limb, hide, 0.5, 2.6, 0.5, 0, 0, 0, -1.9);
    add(j.tail, G.sph, M.bone, 0.45, 0.45, 0.6, 0, -0.85, -2.45);
    return { root, j };
  }

  function spitter(hide) {
    const root = new THREE.Group();
    const j = {};
    j.body = joint(root, 0, 0, 0);
    add(j.body, G.sph, hide, 0.95, 1.05, 1.15, 0, 2.5, 0);
    for (let i = 0; i < 3; i++) add(j.body, G.box, M.plate, 1.2, 0.2, 0.6, 0, 2.2 + i * 0.4, 0.75, 0.4);
    // the sac: a glowing bag on the back, and the thing to shoot
    j.sac = joint(j.body, 0, 3.25, -0.95);
    add(j.sac, G.sph, M.glow, 1.1, 1.0, 1.15);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      add(j.sac, G.limb, M.plate, 0.07, 1.0, 0.07, Math.cos(a) * 0.95, 0.5, Math.sin(a) * 0.95, 0, 0, Math.cos(a) * 0.3);
    }
    j.neck = joint(j.body, 0, 3.1, 0.5);
    add(j.neck, G.limb, hide, 0.3, 1.2, 0.3, 0, 0, 0, Math.PI - 0.55);
    j.head = joint(j.neck, 0, 0.95, 0.6);
    add(j.head, G.sph, hide, 0.5, 0.42, 0.7, 0, 0, 0.25);
    add(j.head, G.spike, M.plate, 0.34, 1.0, 0.34, 0, -0.05, 0.6, Math.PI / 2);
    add(j.head, G.sph, M.glow, 0.2, 0.2, 0.2, 0, -0.08, 1.5); // the nozzle
    for (const s of [-1, 1]) add(j.head, G.sph, M.eye, 0.09, 0.09, 0.09, s * 0.36, 0.16, 0.55);
    j.legs = [
      leg(j.body, hide, 0.7, 2.1, 0, 1.15, 1.1, 0.26, 0.4),
      leg(j.body, hide, -0.7, 2.1, 0, 1.15, 1.1, 0.26, 0.4),
    ];
    j.arms = [];
    for (const s of [-1, 1]) {
      const arm = joint(j.body, s * 0.85, 2.9, 0.4);
      add(arm, G.limb, hide, 0.14, 1.1, 0.14, 0, 0, 0, -0.9);
      add(arm, G.spike, M.bone, 0.08, 0.5, 0.08, 0, -0.68, 0.86, 2.2);
      j.arms.push(arm);
    }
    return { root, j };
  }

  function stalker(hide) {
    const root = new THREE.Group();
    const j = {};
    j.body = joint(root, 0, 5.6, 0);
    add(j.body, G.sph, hide, 1.15, 0.8, 1.6);
    add(j.body, G.box, M.plate, 1.9, 0.3, 2.6, 0, 0.6, 0);
    for (let i = 0; i < 4; i++) add(j.body, G.spike, M.bone, 0.14, 1.2, 0.14, 0, 0.7, 0.9 - i * 0.6, -0.5);
    add(j.body, G.sph, M.glow, 0.72, 0.6, 0.85, 0, -0.75, 0.25); // the core, underneath
    j.head = joint(j.body, 0, -0.1, 1.5);
    add(j.head, G.sph, hide, 0.55, 0.45, 0.7, 0, 0, 0.2);
    for (const s of [-1, 1]) {
      add(j.head, G.spike, M.bone, 0.1, 0.9, 0.1, s * 0.3, -0.2, 0.6, 1.9, 0, -s * 0.25); // mandible
      add(j.head, G.sph, M.eye, 0.1, 0.1, 0.1, s * 0.3, 0.14, 0.75);
      add(j.head, G.sph, M.eye, 0.06, 0.06, 0.06, s * 0.14, 0.3, 0.8);
    }
    // Stilt legs: each rises out of the body to a knee above it, then drops
    // straight to the ground. yaw spreads them to the four corners.
    j.legs = [];
    const PHI = 2.2, UP = 3.3;
    const kneeY = 5.6 - Math.cos(PHI) * UP; // knee height above the ground
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const yaw = joint(j.body, sx * 0.7, 0, sz * 0.9);
      yaw.rotation.y = Math.atan2(-sz, sx); // local +x points out along the leg
      const hip = joint(yaw, 0, 0, 0);
      hip.rotation.z = PHI;
      add(hip, G.limb, hide, 0.24, UP, 0.24);
      add(hip, G.sph, M.plate, 0.34, 0.34, 0.34);
      const knee = joint(hip, 0, -UP, 0);
      knee.rotation.z = -PHI;
      add(knee, G.sph, M.bone, 0.3, 0.3, 0.3);
      add(knee, G.limb, hide, 0.2, kneeY, 0.2);
      add(knee, G.spike, M.bone, 0.16, 0.9, 0.16, 0, -kneeY + 0.9, 0, Math.PI);
      j.legs.push({ yaw, hip, knee, base: yaw.rotation.y });
    }
    j.scythes = [];
    for (const s of [-1, 1]) {
      const arm = joint(j.body, s * 0.9, -0.2, 1.1);
      add(arm, G.limb, hide, 0.16, 1.8, 0.16, 0, 0, 0, -0.6);
      add(arm, G.spike, M.bone, 0.14, 2.6, 0.05, 0, -1.5, 1.0, 2.4);
      j.scythes.push(arm);
    }
    return { root, j };
  }

  function titan(hide) {
    const root = new THREE.Group();
    const j = {};
    j.body = joint(root, 0, 0, 0);
    j.torso = joint(j.body, 0, 8.6, 0);
    add(j.torso, G.sph, hide, 2.5, 1.9, 2.1, 0, -1.2, 0); // pelvis
    add(j.torso, G.sph, hide, 3.7, 4.0, 2.9, 0, 2.9, 0); // barrel chest
    for (let i = 0; i < 5; i++) add(j.torso, G.box, M.plate, 5.4 - i * 0.5, 0.6, 1.4, 0, 5.2 - i * 1.15, 2.15 - i * 0.12, 0.2);
    for (let i = 0; i < 6; i++) add(j.torso, G.spike, M.bone, 0.5, 3.2 - i * 0.3, 0.5, 0, 6.2 - i * 1.1, -2.2, -0.9);
    // three sacs: chest and both shoulders
    j.sacs = [
      add(j.torso, G.sph, M.glow, 1.45, 1.45, 1.1, 0, 3.0, 2.75),
      add(j.torso, G.sph, M.glow, 1.3, 1.3, 1.3, 3.7, 5.5, 0.2),
      add(j.torso, G.sph, M.glow, 1.3, 1.3, 1.3, -3.7, 5.5, 0.2),
    ];
    j.head = joint(j.torso, 0, 7.0, 1.0);
    add(j.head, G.sph, hide, 1.3, 1.15, 1.4);
    add(j.head, G.box, M.plate, 2.4, 0.7, 1.8, 0, 0.75, 0, -0.2);
    for (let i = 0; i < 6; i++) {
      const a = -0.75 + i * 0.3;
      add(j.head, G.sph, M.eye, 0.15, 0.15, 0.15, Math.sin(a) * 1.15, 0.05 + (i % 2) * 0.3, Math.cos(a) * 1.25);
    }
    j.jaw = joint(j.head, 0, -0.6, 0.4);
    add(j.jaw, G.box, M.plate, 1.9, 0.5, 1.6, 0, -0.2, 0.5);
    add(j.jaw, G.sph, M.glow, 0.8, 0.3, 0.8, 0, 0.15, 0.6);
    for (let i = 0; i < 6; i++) add(j.jaw, G.spike, M.bone, 0.12, 0.6, 0.12, -0.75 + i * 0.3, 0.05, 1.2);
    j.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = joint(j.torso, s * 4.4, 4.9, 0);
      add(shoulder, G.limb, hide, 1.0, 5.2, 1.0);
      add(shoulder, G.box, M.plate, 2.2, 1.6, 2.2, 0, 0.5, 0);
      const elbow = joint(shoulder, 0, -5.2, 0);
      add(elbow, G.limb, hide, 0.85, 5.0, 0.85);
      for (let c = 0; c < 3; c++) add(elbow, G.spike, M.bone, 0.2, 1.6, 0.2, -0.45 + c * 0.45, -5.0, 0.3, Math.PI - 0.3);
      j.arms.push({ shoulder, elbow });
    }
    j.legs = [
      leg(j.body, hide, 1.9, 7.6, 0, 3.8, 3.8, 1.25, 1.5),
      leg(j.body, hide, -1.9, 7.6, 0, 3.8, 3.8, 1.25, 1.5),
    ];
    return { root, j };
  }

  const BUILD = { brute, spitter, stalker, titan };

  // ---- posing ---------------------------------------------------------------
  // m: { type, j, phase, moving, tele, strike, flinch, deadK, attack }
  //   phase   gait phase (radians), advanced by distance walked
  //   moving  0..1
  //   tele    0..1 wind-up of the attack named in m.attack
  //   strike  1 at the moment of impact, decaying to 0
  //   deadK   0 alive .. 1 fully collapsed

  function pose(m, t) {
    const j = m.j;
    const mv = m.moving;
    const tele = m.tele;
    const st = m.strike;
    const br = Math.sin(t * 1.7 + m.seed); // breathing
    const fl = m.flinch;
    const d = m.deadK;
    const dE = d * d * (3 - 2 * d);

    if (m.type === 'brute') {
      const slam = m.attack === 'slam';
      j.body.position.y = Math.abs(Math.sin(m.phase)) * 0.14 * mv + br * 0.03 - dE * 1.2;
      // rear up for the slam, drop the head for the charge
      j.body.rotation.x = (slam ? -tele * 0.5 + st * 0.3 : tele * 0.16) + fl * 0.06;
      j.body.rotation.z = dE * 1.45;
      j.head.rotation.x = (slam ? -tele * 0.35 : tele * 0.4) + Math.sin(m.phase * 0.5) * 0.06 * mv;
      j.jaw.rotation.x = 0.12 + br * 0.04 + tele * 0.6 + st * 0.3;
      j.tail.rotation.y = Math.sin(m.phase * 0.5 + 1) * 0.3 * mv + br * 0.08;
      for (let i = 0; i < 4; i++) {
        const diag = i === 0 || i === 3 ? 0 : Math.PI;
        const s = Math.sin(m.phase + diag);
        const front = i < 2;
        j.legs[i].hip.rotation.x = s * 0.5 * mv + (slam && front ? -tele * 1.2 + st * 1.0 : 0) - dE * 0.9;
        j.legs[i].knee.rotation.x = Math.max(0, -Math.cos(m.phase + diag)) * 0.7 * mv + (slam && front ? tele * 0.9 : 0);
      }
    } else if (m.type === 'spitter') {
      j.body.position.y = Math.abs(Math.sin(m.phase)) * 0.1 * mv - dE * 1.6;
      j.body.rotation.x = -tele * 0.22 + st * 0.3 + fl * 0.1;
      j.body.rotation.z = dE * 1.5;
      const swell = 1 + br * 0.04 + tele * 0.3 - st * 0.25 - dE * 0.7;
      j.sac.scale.setScalar(Math.max(0.2, swell));
      j.neck.rotation.x = -tele * 0.5 + st * 0.7;
      j.head.rotation.x = -tele * 0.3 + st * 0.4 + br * 0.03;
      for (let i = 0; i < 2; i++) {
        const s = Math.sin(m.phase + i * Math.PI);
        j.legs[i].hip.rotation.x = s * 0.55 * mv - 0.35;
        j.legs[i].knee.rotation.x = 0.7 + Math.max(0, -Math.cos(m.phase + i * Math.PI)) * 0.6 * mv;
        j.arms[i].rotation.x = br * 0.1 - tele * 0.6;
      }
    } else if (m.type === 'stalker') {
      // crouch for the leap, sink on death
      j.body.position.y = 5.6 - tele * (m.attack === 'leap' ? 2.4 : 0.6) + br * 0.06 - dE * 4.6;
      j.body.rotation.x = (m.attack === 'swipe' ? tele * 0.25 - st * 0.2 : -tele * 0.12) + fl * 0.08;
      j.body.rotation.z = dE * 0.5;
      j.head.rotation.x = br * 0.05 + tele * 0.2;
      for (let i = 0; i < 4; i++) {
        const L = j.legs[i];
        const off = i === 0 || i === 3 ? 0 : Math.PI;
        L.yaw.rotation.y = L.base + Math.sin(m.phase + off) * 0.34 * mv;
        // lift on the forward swing; splay as the body drops
        const lift = Math.max(0, Math.cos(m.phase + off)) * 0.16 * mv;
        const drop = (tele * (m.attack === 'leap' ? 2.4 : 0.6) + dE * 4.6) / 5.6;
        L.hip.rotation.z = 2.2 + lift + drop * 0.55;
        L.knee.rotation.z = -2.2 - lift - drop * 0.55;
      }
      for (let i = 0; i < 2; i++) {
        j.scythes[i].rotation.x = -0.2 + br * 0.06 - (m.attack === 'swipe' ? tele * 1.5 : tele * 0.4) + st * 1.9;
      }
    } else if (m.type === 'titan') {
      const stomp = m.attack === 'stomp';
      const step = Math.sin(m.phase);
      j.body.position.y = Math.abs(step) * 0.35 * mv - dE * 3.2;
      j.body.rotation.x = dE * 1.25;
      j.torso.rotation.z = step * 0.05 * mv;
      j.torso.rotation.x = (stomp ? -tele * 0.12 + st * 0.2 : tele * 0.22) + br * 0.012 + fl * 0.03;
      j.head.rotation.x = br * 0.04 - (m.attack === 'volley' ? tele * 0.5 : 0);
      j.jaw.rotation.x = 0.1 + br * 0.05 + tele * 0.7;
      for (let i = 0; i < 2; i++) {
        const s = Math.sin(m.phase + i * Math.PI);
        const raise = stomp && i === 0 ? tele * 1.05 - st * 1.0 : 0;
        j.legs[i].hip.rotation.x = s * 0.4 * mv - raise - dE * 0.8;
        j.legs[i].knee.rotation.x = Math.max(0, -Math.cos(m.phase + i * Math.PI)) * 0.55 * mv + raise * 1.1 + dE * 1.4;
        j.arms[i].shoulder.rotation.x = -s * 0.28 * mv - (m.attack === 'volley' ? tele * 0.5 : 0) + dE * 0.6;
        j.arms[i].shoulder.rotation.z = (i ? -1 : 1) * (0.12 + tele * 0.15);
        j.arms[i].elbow.rotation.x = -0.25 - Math.max(0, s) * 0.2 * mv;
      }
      const pulse = 1 + br * 0.05 + tele * 0.18;
      for (const sac of j.sacs) sac.scale.setScalar(sac.userData.r0 * pulse);
    }
    // a hit flashes the hide white for a moment
    m.hide.emissiveIntensity = m.hitFlash * 0.55;
  }

  function make(type, seed) {
    const hide = hideProto.clone();
    const { root, j } = BUILD[type](hide);
    if (j.sacs) for (const sac of j.sacs) sac.userData.r0 = sac.scale.x;
    return {
      type, root, j, hide, seed,
      phase: seed, moving: 0, tele: 0, strike: 0, flinch: 0, hitFlash: 0, deadK: 0, attack: null,
    };
  }

  // A monster's hide is its own (for the hit flash); everything else is shared.
  function free(m) {
    m.hide.dispose();
  }

  // ---- the swarm: two instanced meshes, body and wings -----------------------
  function swarmMeshes(count) {
    const body = new THREE.SphereGeometry(1, 7, 5);
    body.scale(0.26, 0.24, 0.62);
    // wings: two triangles in a shallow V; flipping scale.y flaps them
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0.3, 1.25, 0.42, 0.05, 0.1, 0, -0.5,
      0, 0, 0.3, -0.1, 0, -0.5, -1.25, 0.42, 0.05,
    ], 3));
    wing.computeVertexNormals();
    const wingMat = new THREE.MeshStandardMaterial({
      color: skin.plate, roughness: 0.6, side: THREE.DoubleSide,
      emissive: glowCol, emissiveIntensity: 0.5,
    });
    const bodies = new THREE.InstancedMesh(body, M.glow, count);
    const wings = new THREE.InstancedMesh(wing, wingMat, count);
    for (const im of [bodies, wings]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
    }
    return {
      bodies, wings,
      dispose() {
        body.dispose();
        wing.dispose();
        wingMat.dispose();
        bodies.dispose();
        wings.dispose();
      },
    };
  }

  function dispose() {
    for (const k in G) G[k].dispose();
    for (const k in M) M[k].dispose();
    hideProto.dispose();
  }

  return { make, pose, free, swarmMeshes, dispose, glowColor: glowCol };
}
