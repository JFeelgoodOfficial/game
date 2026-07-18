/**
 * actuality.js
 *
 * Bespoke total-conversion world for the planet "actuality" — a hub-and-spoke
 * narrative space adapting "The Discourses of the Actuality" (the second half
 * of *Comfort Zone*, Chapters 1-10). A warm café hub where an NPC ("She")
 * teaches a ten-digit cipher; nine themed zones, one per digit, that the player
 * walks into; and a hidden hyper-holo-grid mirror room unlocked once all nine
 * are seen.
 *
 * This module fully replaces the stock city/crowd/wonders/creatures for this
 * world — walk.js dispatches to it on `planet.cfg.name === 'actuality'` and
 * leaves those handles null. It exposes the same host contract wavemallprime.js
 * does (group, update, dispose, resolveCollisions, groundRadiusAt,
 * nearestInteractable, interact, endInteract) plus a few actuality-only hooks
 * (anchor, initAudio, consumeTeleport, onOutcome, preRender, debug).
 *
 * Coordinate assumptions (same as wavemallprime.js / the engine):
 * - Meters. Astronaut 1.9 tall, eye 2.0. Content lives in planet.surface's
 *   UNROTATED local frame so planet spin + floating-origin rebasing carry it.
 * - Local Y is radial up; quaternion.setFromUnitVectors(yAxis, dir) orients a
 *   tangent frame, then a yaw about Y faces it.
 * - The root `group` sits at identity under planet.surface. `anchor` is a child
 *   Group carrying the landing-point tangent transform — the player is resolved
 *   into anchor-local space (walk.js playerLocalInto), so hub content and every
 *   interactable position live in that one frame.
 * - Lighting is authored here (the global sun barely reaches these interiors):
 *   local PointLights + a warm ambient + emissive materials over the 0.85 bloom
 *   threshold. Each zone crossfades its own light/palette on entry.
 *
 * No external assets: geometry from primitives, textures from CanvasTexture,
 * deterministic via mulberry32(seed). Zero per-frame allocation on hot paths.
 *
 * Dialogue text is authored in ./actuality-dialogue.js (a plain data module).
 */

import * as THREE from 'three';
import { makeStructure } from './city.js';
import * as DLG from './actuality-dialogue.js';
import { createMirrorRoom } from './actuality-mirrorroom.js';

/* ----------------------------------------------------------------------
 * Tunables — every magic number lives here.
 * ------------------------------------------------------------------- */
const AC = {
  HUB_FLOOR_HALF: 18,        // terrace half-extent (m)
  HUB_WALL_H: 3.0,           // café nook wall height
  CAFE_BACK_Z: 14.0,         // back wall plane (anchor-local +Z)
  DOME_RADIUS: 140,          // hub sky dome
  ZONE_DIST: 420,            // zones sit this far from the hub along ring bearings
  ZONE_FLOOR_HALF: 30,       // zone landing-pad half-extent
  ARCH_RING: 15,             // hub portal arches this far from the anchor
  ARCH_ARC: 2.6,             // arc (radians) the nine arches span, front of terrace
  PORTAL_R: 2.0,             // portal trigger radius
  FADE_OUT: 0.6,             // seconds to black
  FADE_IN: 1.4,              // seconds back from black (~2 s total transition)
  BLOOM_THRESHOLD: 0.85,     // emissive above this blooms
  STRING_LIGHT_EMISSIVE: 1.1,
  TRIM_EMISSIVE: 0.4,        // stays under threshold (no bloom)
  TALK_REACH: 3.2,           // interaction radius (matches TALK_DIST_ACTUALITY)
  ZONE_COUNT: 9,
  STORE_KEY: 'fgsf.actuality',
  // dawn palette
  COL_GOLD: 0xf0d9b0,
  COL_CREAM: 0xf6ecd6,
  COL_WARM_LIGHT: 0xffd9a0,
  COL_WOOD: 0x6b4a30,
  COL_STONE: 0xbfae90,
};

/* ----------------------------------------------------------------------
 * Determinism + small helpers.
 * ------------------------------------------------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const _yAxis = new THREE.Vector3(0, 1, 0);
const _burstMat4 = new THREE.Matrix4(); // scratch for the dragon burst instances
const _z6Local = new THREE.Vector3();   // scratch: player in zone-6 local frame
const _dbgMirror = new THREE.Vector3(); // last computed mirror-local player pos

// Full radial distance to terrain along a surface-local direction (a radius,
// not a height) — same as wavemallprime.sampleGround.
function sampleGround(planet, dirLocal) {
  if (planet.body && planet.body.groundAtLocal) {
    return (planet.radius ?? 900) + planet.body.groundAtLocal(dirLocal);
  }
  return planet.radius ?? 900;
}

// Great-circle offset: the surface-local direction `dist` m from `worldUp`
// along ring bearing `angle`. (wavemallprime.ringDir)
function ringDir(planet, worldUp, angle, dist) {
  const arbitrary = Math.abs(worldUp.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const tangentA = new THREE.Vector3().crossVectors(worldUp, arbitrary).normalize();
  const tangentB = new THREE.Vector3().crossVectors(worldUp, tangentA).normalize();
  const span = dist / (planet.radius ?? 900);
  return worldUp.clone().multiplyScalar(Math.cos(span))
    .add(tangentA.multiplyScalar(Math.cos(angle) * Math.sin(span)))
    .add(tangentB.multiplyScalar(Math.sin(angle) * Math.sin(span)))
    .normalize();
}

// Anchored tangent frame at dirLocal, yawed so local -Z looks back toward the
// hub anchor (worldUp). Returns {pos, q, qInv} in surface-local space.
// (wavemallprime.surfaceFrame)
function surfaceFrame(planet, worldUp, dirLocal) {
  const q0 = new THREE.Quaternion().setFromUnitVectors(_yAxis, dirLocal);
  const pos = dirLocal.clone().multiplyScalar(sampleGround(planet, dirLocal));
  const toCenter = worldUp.clone().multiplyScalar(sampleGround(planet, worldUp))
    .sub(pos).applyQuaternion(q0.clone().invert());
  const yaw = Math.atan2(-toCenter.x, -toCenter.z);
  const q = q0.multiply(new THREE.Quaternion().setFromAxisAngle(_yAxis, yaw));
  return { pos, q, qInv: q.clone().invert() };
}

/* ----------------------------------------------------------------------
 * CanvasTexture helpers.
 * ------------------------------------------------------------------- */
// Vertical two-stop gradient (used for the hub sky dome).
function gradientTexture(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Portal sign: the digit glyph + its word, glowing warm on dark. Used on the
// hub arches (a quiet reward for players tracking the cipher).
function signTexture(digit, word) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#120c08'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#ffdca0';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 76px Georgia, serif';
  g.fillText(String(digit), 52, 66);
  g.font = '22px Georgia, serif';
  g.fillText(word, 156, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Abstract "memory" image for Zone 5's floating frames — soft painted blobs
// over a warm ground, seeded so each frame differs.
function memoryTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1712'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 14; i++) {
    const x = rng() * 128, y = rng() * 128, r = 8 + rng() * 36;
    const hue = Math.floor(20 + rng() * 60);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `hsla(${hue},60%,${40 + rng() * 30}%,0.8)`);
    grad.addColorStop(1, 'hsla(0,0%,0%,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Television static (Zone 7): random grey noise.
function tvStaticTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 48;
  const g = c.getContext('2d');
  const img = g.createImageData(64, 48);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (rng() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// Simple black silhouette on transparent (skyline / swing set / crescent moon).
function silhouetteTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 256);
  g.fillStyle = '#05070c';
  if (kind === 'skyline') {
    // bridge + city blocks along the bottom
    for (let x = 0; x < 512; x += 18) {
      const h = 30 + Math.abs(Math.sin(x * 0.7)) * 90;
      g.fillRect(x, 256 - h, 15, h);
    }
    g.fillRect(150, 150, 220, 10); // bridge deck
    for (let x = 150; x < 370; x += 40) g.fillRect(x, 90, 6, 70); // cables/towers
  } else if (kind === 'swing') {
    g.fillRect(120, 40, 6, 180); g.fillRect(300, 40, 6, 180);
    g.fillRect(110, 40, 200, 6);
    g.fillRect(180, 46, 4, 120); g.fillRect(250, 46, 4, 120);
    g.fillRect(172, 166, 20, 6); g.fillRect(242, 166, 20, 6);
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// Per-zone metadata: digit word (for the arch sign) and a tint used for the
// pad's ambient light so each zone reads as a distinct place at a glance.
const ZONE_META = [
  { id: 'z1', word: 'MIND', tint: 0xe8b878 },
  { id: 'z2', word: 'BODY', tint: 0xd8926a },
  { id: 'z3', word: 'SOUL', tint: 0xd8d0b0 },
  { id: 'z4', word: 'SELF', tint: 0xe0c090 },
  { id: 'z5', word: 'ORDER', tint: 0x8890b0 },
  { id: 'z6', word: 'LIFE', tint: 0x6a86a0 },
  { id: 'z7', word: 'TIME', tint: 0x7088a8 },
  { id: 'z8', word: 'ETERNITY', tint: 0xc88a5a },
  { id: 'z9', word: 'DEATH / REBIRTH', tint: 0x707078 },
];

// One portal arch (two posts + a lintel + a glowing sign), built facing +Z in
// its own local frame; caller positions/yaws it.
function buildPortalArch(digit, word, geos, mats) {
  const grp = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.85 });
  mats.push(postMat);
  const box = (w, h, d, x, y, z, mat) => {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); grp.add(m); return m;
  };
  box(0.4, 3.4, 0.4, -1.3, 1.7, 0, postMat);
  box(0.4, 3.4, 0.4, 1.3, 1.7, 0, postMat);
  box(3.4, 0.5, 0.4, 0, 3.55, 0, postMat);
  const signTex = signTexture(digit, word);
  const signGeo = new THREE.PlaneGeometry(2.6, 0.9);
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0, 3.55, 0.25);
  grp.add(sign);
  geos.push(signGeo); mats.push(signMat);
  grp.userData.signTex = signTex;
  return grp;
}

/* ----------------------------------------------------------------------
 * NPC figure — a small primitive humanoid with a gentle idle bob.
 * pose: 'seated' | 'standing'. All parts under one group; update(t) bobs it.
 * ------------------------------------------------------------------- */
function makeFigure(opts = {}) {
  const { seated = false, scale = 1, skin = 0xcaa583, cloth = 0x8a5a6a, seed = 1 } = opts;
  const rng = mulberry32(seed >>> 0);
  const group = new THREE.Group();
  const mats = [];
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const clothMat = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.9 });
  mats.push(skinMat, clothMat);
  const geos = [];
  const box = (w, h, d, x, y, z, mat) => {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  const hipY = seated ? 0.55 : 0.95;
  // torso
  box(0.42, 0.62, 0.26, 0, hipY + 0.45, 0, clothMat);
  // head
  const head = box(0.24, 0.28, 0.24, 0, hipY + 0.95, 0, skinMat);
  // hair cap tint
  head.material = skinMat;
  // arms
  box(0.12, 0.5, 0.14, -0.3, hipY + 0.45, 0.02, clothMat);
  box(0.12, 0.5, 0.14, 0.3, hipY + 0.45, 0.02, clothMat);
  if (seated) {
    // thighs forward, shins down
    box(0.16, 0.14, 0.5, -0.12, hipY, 0.28, clothMat);
    box(0.16, 0.14, 0.5, 0.12, hipY, 0.28, clothMat);
    box(0.15, 0.5, 0.15, -0.12, hipY - 0.3, 0.5, clothMat);
    box(0.15, 0.5, 0.15, 0.12, hipY - 0.3, 0.5, clothMat);
  } else {
    box(0.16, 0.9, 0.16, -0.12, hipY - 0.45, 0, clothMat);
    box(0.16, 0.9, 0.16, 0.12, hipY - 0.45, 0, clothMat);
  }
  group.scale.setScalar(scale);
  const phase = rng() * 6.28;
  const baseY = group.position.y;
  function update(t) {
    group.position.y = baseY + Math.sin(t * 1.4 + phase) * 0.015;
    head.rotation.y = Math.sin(t * 0.5 + phase) * 0.18;
  }
  function setOpacity(o) {
    for (const m of mats) {
      m.transparent = o < 1;
      m.opacity = o;
      m.needsUpdate = true;
    }
  }
  function dispose() {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  }
  return { group, update, setOpacity, materials: mats, dispose };
}

/* ----------------------------------------------------------------------
 * Hub — the outdoor café terrace at the landing anchor.
 * Built in anchor-local space (added under `anchor`). Returns geometry group,
 * a makeStructure for collision, lights, and the She interactable position.
 * ------------------------------------------------------------------- */
function buildHub(rng) {
  const group = new THREE.Group();
  group.name = 'actuality.hub';
  const geos = [];
  const mats = [];
  const lights = [];
  const track = (g, m) => { geos.push(g); mats.push(m); };

  const woodMat = new THREE.MeshStandardMaterial({ color: AC.COL_WOOD, roughness: 0.85 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: AC.COL_STONE, roughness: 0.9 });
  mats.push(woodMat, stoneMat);

  const addBox = (w, h, d, x, y, z, mat) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    group.add(m);
    geos.push(g);
    return m;
  };

  // Terrace floor: a thin stone slab, top at y=0 (flush with the anchor
  // ground), extending below grade so edges never open a gap.
  const H = AC.HUB_FLOOR_HALF;
  addBox(H * 2, 1.2, H * 2, 0, -0.6, 0, stoneMat);

  // Café nook: back wall + two side returns, open toward -Z (the terrace).
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.9 });
  mats.push(wallMat);
  const WH = AC.HUB_WALL_H, BZ = AC.CAFE_BACK_Z;
  addBox(20, WH, 0.5, 0, WH / 2, BZ, wallMat);         // back
  addBox(0.5, WH, 6.5, -10, WH / 2, BZ - 3.25, wallMat); // left return
  addBox(0.5, WH, 6.5, 10, WH / 2, BZ - 3.25, wallMat);  // right return
  // Awning over the nook (emissive-free wood beams + a warm canopy).
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xb5654d, roughness: 0.8 });
  mats.push(canopyMat);
  addBox(20.5, 0.3, 8, 0, WH + 0.2, BZ - 4, canopyMat);
  // Counter along the back.
  addBox(12, 1.1, 1.2, 0, 0.55, BZ - 1.2, woodMat);

  // A few tables + chairs on the terrace.
  const tableAt = (x, z) => {
    addBox(1.6, 0.12, 1.6, x, 0.78, z, woodMat);       // top
    addBox(0.16, 0.78, 0.16, x, 0.39, z, woodMat);     // pedestal
  };
  tableAt(-6, 9);   // She's table
  tableAt(5, 8);
  tableAt(0, 4);

  // Warm string lights strung under the awning — emissive spheres over the
  // bloom threshold so they glow. Kept few; more added visually if needed.
  const bulbGeo = new THREE.SphereGeometry(0.12, 8, 6);
  geos.push(bulbGeo);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: AC.COL_WARM_LIGHT, emissive: AC.COL_WARM_LIGHT,
    emissiveIntensity: AC.STRING_LIGHT_EMISSIVE, roughness: 0.5,
  });
  mats.push(bulbMat);
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, 10);
  const _m = new THREE.Matrix4();
  for (let i = 0; i < 10; i++) {
    const x = -9 + (i / 9) * 18;
    _m.makeTranslation(x, WH - 0.1 + Math.sin(i) * 0.05, BZ - 7.6);
    bulbs.setMatrixAt(i, _m);
  }
  bulbs.instanceMatrix.needsUpdate = true;
  group.add(bulbs);

  // Local lighting: two warm point lights + a soft warm ambient so the café
  // reads at dawn regardless of the sun's true angle.
  const key = new THREE.PointLight(AC.COL_WARM_LIGHT, 1.6, 60, 2.0);
  key.position.set(0, 5, BZ - 6);
  const fill = new THREE.PointLight(0xffe6c2, 0.9, 50, 2.0);
  fill.position.set(-4, 3, 2);
  const amb = new THREE.AmbientLight(0xf0d8b0, 0.55);
  group.add(key, fill, amb);
  lights.push(key, fill, amb);

  // Sky dome — large inward sphere with a cream→gold gradient, faint emissive
  // so it glows softly at the horizon.
  const domeTex = gradientTexture('#fbf1dc', '#e9c98c');
  const domeGeo = new THREE.SphereGeometry(AC.DOME_RADIUS, 24, 16);
  const domeMat = new THREE.MeshBasicMaterial({ map: domeTex, side: THREE.BackSide, fog: false });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  group.add(dome);
  geos.push(domeGeo); mats.push(domeMat);

  // Collision: the café nook walls (with the terrace open). One structure in
  // anchor-local space (ox=0, oz=0, baseY=0).
  const walls = [
    { x0: -10, x1: 10, z0: BZ - 0.25, z1: BZ + 0.25, y0: 0, y1: WH },
    { x0: -10.25, x1: -9.75, z0: BZ - 6.5, z1: BZ, y0: 0, y1: WH },
    { x0: 9.75, x1: 10.25, z0: BZ - 6.5, z1: BZ, y0: 0, y1: WH },
    // counter (waist-high; blocks walking through it)
    { x0: -6, x1: 6, z0: BZ - 1.8, z1: BZ - 0.6, y0: 0, y1: 1.1 },
  ];
  const surfaces = [
    { x0: -H, x1: H, z0: -H, z1: H, y: 0 }, // the terrace floor
  ];
  const structure = makeStructure(0, 0, 0, surfaces, walls, H + 1);

  return {
    group,
    structure,
    lights,
    shePos: new THREE.Vector3(-6, 0, 10.4), // just in front of She's table
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      if (domeTex) domeTex.dispose();
    },
  };
}

/* ----------------------------------------------------------------------
 * Flags — persisted world state (localStorage, fail-open).
 * ------------------------------------------------------------------- */
function defaultFlags() {
  return {
    metCafeWoman: false,
    visited: { z1: false, z2: false, z3: false, z4: false, z5: false, z6: false, z7: false, z8: false, z9: false },
    talkedAndreiMikey: false,
    talkedJoshuaCaitlynn: false,
    dragonGiftReceived: false,
    hyperHoloGridSeen: false,
    zeroHeard: false,
    z6VisionSeen: false,
    digitsHeard: [],
  };
}
function loadFlags() {
  const f = defaultFlags();
  try {
    const raw = localStorage.getItem(AC.STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      Object.assign(f, saved);
      f.visited = { ...defaultFlags().visited, ...(saved.visited ?? {}) };
      if (!Array.isArray(f.digitsHeard)) f.digitsHeard = [];
    }
  } catch { /* session-only */ }
  return f;
}
function saveFlags(f) {
  try { localStorage.setItem(AC.STORE_KEY, JSON.stringify(f)); } catch { /* session-only */ }
}

/* ----------------------------------------------------------------------
 * Main factory.
 * ------------------------------------------------------------------- */
export function createActuality(planet, worldUp, opts = {}) {
  const seedKey = opts.seedKey ?? 'actuality';
  const rng = mulberry32(hashSeed(seedKey));

  const group = new THREE.Group();
  group.name = 'actuality';

  // Landing-point anchor frame (surface-local). All hub content + interactable
  // positions live in this frame; the player is resolved into it by walk.js.
  const anchorDir = worldUp.clone().normalize();
  const anchorPos = anchorDir.clone().multiplyScalar(sampleGround(planet, anchorDir));
  const anchorQ = new THREE.Quaternion().setFromUnitVectors(_yAxis, anchorDir);
  const anchorQInv = anchorQ.clone().invert();

  const anchor = new THREE.Group();
  anchor.name = 'actuality.anchor';
  anchor.position.copy(anchorPos);
  anchor.quaternion.copy(anchorQ);
  group.add(anchor);

  const flags = loadFlags();

  // --- Hub ---
  const hub = buildHub(rng);
  anchor.add(hub.group);

  // --- Interactables (anchor-local Vector3 positions) ---
  // Zone tag 'hub' is always active; zone interactables (added later) filter on
  // the current activeZone.
  const interactables = [];
  const she = {
    id: 'she', zone: 'hub', pos: hub.shePos.clone(),
    talking: false,
  };
  interactables.push(she);

  // She figure at her table.
  const sheFig = makeFigure({ seated: true, scale: 1, skin: 0xd8b48f, cloth: 0x9a6b7a, seed: 7 });
  sheFig.group.position.set(-6, 0, 11.2);
  sheFig.group.rotation.y = Math.PI; // face -Z, toward the terrace / player
  anchor.add(sheFig.group);
  const figures = [sheFig];

  // --- Geometry/material bins for zones + portals (disposed at teardown) ---
  const zoneGeos = [];
  const zoneMats = [];
  const zoneTextures = [];

  // --- Zones: nine landing pads on ring bearings, each with a return portal.
  // Zone content (VFX/NPCs) is added to each zone.group by later milestones.
  const zoneList = [];
  const zoneById = {};
  for (let i = 0; i < AC.ZONE_COUNT; i++) {
    const meta = ZONE_META[i];
    const dir = ringDir(planet, anchorDir, (i / AC.ZONE_COUNT) * Math.PI * 2, AC.ZONE_DIST);
    const frame = surfaceFrame(planet, anchorDir, dir);
    const zg = new THREE.Group();
    zg.name = `actuality.${meta.id}`;
    zg.position.copy(frame.pos);
    zg.quaternion.copy(frame.q);
    group.add(zg);

    // Landing-pad floor slab (top at y=0, extends below grade). Replace-ground
    // semantics own the floor inside this footprint.
    const ZH = AC.ZONE_FLOOR_HALF;
    const slabGeo = new THREE.BoxGeometry(ZH * 2, 1.2, ZH * 2);
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.95 });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, -0.6, 0);
    zg.add(slab);
    zoneGeos.push(slabGeo); zoneMats.push(slabMat);

    // A tinted ambient light so the pad reads as its own place (a stand-in
    // until M5 builds the real per-zone environment).
    const zlight = new THREE.PointLight(meta.tint, 1.1, 90, 2.0);
    zlight.position.set(0, 6, 0);
    zg.add(zlight);

    // Return portal at zone-local (0,0,14), facing back toward the pad center.
    const retArch = buildPortalArch('0', 'CAFÉ', zoneGeos, zoneMats);
    retArch.position.set(0, 0, 14);
    retArch.rotation.y = Math.PI; // face -Z (toward where the player arrives)
    zg.add(retArch);

    const rec = {
      id: meta.id, frame, group: zg, retArch,
      structure: makeStructure(0, 0, 0,
        [{ x0: -ZH, x1: ZH, z0: -ZH, z1: ZH, y: 0 }], [], ZH + 1),
      r2: (ZH + 12) ** 2,
      center: frame.pos.clone(),
      // return trigger (surface-local) + hub destination
      retCenter: new THREE.Vector3(0, 0, 14).applyQuaternion(frame.q).add(frame.pos),
      retR: AC.PORTAL_R,
      // entry destination: player arrives at zone-local (0,0,10) facing -Z
      entryDest: new THREE.Vector3(0, 0, 10).applyQuaternion(frame.q).add(frame.pos),
      entryHeading: new THREE.Vector3(0, 0, -1).applyQuaternion(frame.q).normalize(),
    };
    zoneList.push(rec);
    zoneById[meta.id] = rec;
  }

  // Helpers: transform a zone-local point into anchor-local (interactable
  // positions) or surface-local (trigger centers).
  function zoneToAnchor(rec, x, y, z) {
    return new THREE.Vector3(x, y, z).applyQuaternion(rec.frame.q).add(rec.frame.pos)
      .sub(anchorPos).applyQuaternion(anchorQInv);
  }
  function zoneToSurface(rec, x, y, z) {
    return new THREE.Vector3(x, y, z).applyQuaternion(rec.frame.q).add(rec.frame.pos);
  }

  // Zone content (NPCs + set pieces). Built here so interactable positions are
  // pre-transformed into the anchor frame the host resolves the player into.
  const zoneUpdaters = []; // per-frame zone animation callbacks
  const zoneEnterCallbacks = {}; // id -> fn, fired at teleport blackout
  // Scripted-scene state (Joshua's departure, the dragon transformation).
  let joshuaFig = null;
  let joshuaDep = null;     // { t } while Joshua walks off
  let dragonRefs = null;    // { fig, box, ring, seedLight, light } for zone 9
  let dragonVfx = null;     // { t } while the transformation plays
  let whiteFlashEl = null;  // DOM flash element for the dragon gift
  // Ambient-zone state.
  let z6Tint = null;        // blue submersion overlay for the lake
  let z6Vision = null;      // { t } rebirth vision timer (fires once)
  let z6Submerged = 0;      // seconds continuously under the lake surface
  let z7Sit = 0;            // seconds seated by the TV
  let z7Caption = null;     // { i, t } running caption sequence
  let z7CaptionEl = null;   // DOM caption element
  let z8Burn = 0;           // seconds since entering zone 8 (fire burn-down)
  let mirror = null;        // createMirrorRoom handle (hyper-holo-grid)
  let mirrorRec = null;     // its zone record
  let mirrorDoor = null;    // { mesh, mat, opened } sealed hub door
  buildDialogueZones();
  buildAmbientZones();
  buildMirrorRoom();

  // --- Hub portal arches: nine, in a front arc on the terrace, one per zone.
  const hubPortals = [];
  for (let i = 0; i < AC.ZONE_COUNT; i++) {
    const meta = ZONE_META[i];
    const t = AC.ZONE_COUNT > 1 ? i / (AC.ZONE_COUNT - 1) : 0.5;
    const ang = -AC.ARCH_ARC / 2 + t * AC.ARCH_ARC;
    const ax = Math.sin(ang) * AC.ARCH_RING;
    const az = -Math.cos(ang) * AC.ARCH_RING; // front (-Z) arc, clear of the café
    const arch = buildPortalArch(String(i + 1), meta.word, zoneGeos, zoneMats);
    arch.position.set(ax, 0, az);
    arch.rotation.y = Math.atan2(-ax, -az); // face the terrace center
    anchor.add(arch);
    hubPortals.push({
      targetZone: meta.id,
      center: new THREE.Vector3(ax, 0, az).applyQuaternion(anchorQ).add(anchorPos),
    });
  }

  // Sealed mirror-room door behind the café (registers a gated hub portal).
  buildMirrorDoor();

  // Zone→hub destination (arrive on the terrace facing the café / She).
  const hubReturnDest = new THREE.Vector3(0, 0, -6).applyQuaternion(anchorQ).add(anchorPos);
  const hubReturnHeading = new THREE.Vector3(0, 0, 1).applyQuaternion(anchorQ).normalize();

  // --- Zone / crossfade state ---
  let activeZone = 'hub';
  const fade = { phase: 'idle', t: 0, target: 'hub', dest: null, heading: null };
  const _surf = new THREE.Vector3(); // scratch: player position in surface-local

  // --- Cipher menu state ---
  let pendingDigit = null; // set via onOutcome after She's choice menu

  // --- Teleport intent queue (consumed by walk.js host) ---
  let pendingTeleport = null;

  // --- Audio bed: one AudioContext, a shared looped-noise buffer + oscillators
  // routed per zone through gains that crossfade to the active zone. Fail-open
  // (no audio if the context can't start or stays suspended without a gesture).
  let audio = null;
  function initAudio() {
    if (audio) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Deterministic 2 s noise buffer (shared by every filtered source).
      const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
      const dch = nb.getChannelData(0);
      let s = 0x1234567;
      for (let i = 0; i < dch.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; dch[i] = s / 0x3fffffff - 1; }
      const zoneGains = {};
      const gainFor = (id) => {
        if (!zoneGains[id]) { const g = ctx.createGain(); g.gain.value = 0; g.connect(master); zoneGains[id] = g; }
        return zoneGains[id];
      };
      const started = [];
      const noise = (type, freq, q, id, vol) => {
        const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
        const v = ctx.createGain(); v.gain.value = vol;
        src.connect(f).connect(v).connect(gainFor(id)); src.start(); started.push(src);
      };
      const osc = (freq, id, vol, type = 'sine') => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
        const v = ctx.createGain(); v.gain.value = vol;
        o.connect(v).connect(gainFor(id)); o.start(); started.push(o);
      };
      noise('lowpass', 520, 1, 'hub', 0.22);   // café murmur
      noise('lowpass', 760, 1, 'z3', 0.22);    // daylight café
      noise('lowpass', 300, 0.8, 'z6', 0.28);  // lake water
      noise('highpass', 2400, 0.7, 'z7', 0.22); // TV static
      noise('bandpass', 820, 1.4, 'z8', 0.28); // campfire crackle
      noise('bandpass', 1400, 2.5, 'z1', 0.12); // wind through leaves
      osc(58, 'z2', 0.05);                     // body room tone
      osc(72, 'z4', 0.05);                     // self room tone
      osc(864, 'z5', 0.018); osc(869, 'z5', 0.018); // order shimmer (beating)
      osc(55, 'z9', 0.05); osc(55.6, 'z9', 0.05);   // death low resonance
      osc(110, 'mirror', 0.035); osc(110.4, 'mirror', 0.035); osc(165.2, 'mirror', 0.02); // holo-grid drone
      // Bird chirp for zone 1 (gain pulsed in audioUpdate).
      const chirp = ctx.createOscillator(); chirp.type = 'triangle'; chirp.frequency.value = 1900;
      const chirpGain = ctx.createGain(); chirpGain.gain.value = 0;
      chirp.connect(chirpGain).connect(gainFor('z1')); chirp.start(); started.push(chirp);
      audio = { ctx, master, zoneGains, started, chirp, chirpGain };
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch { audio = null; }
  }

  // Crossfade zone gains toward the active zone; pulse the zone-1 bird chirp.
  function audioUpdate(t, dt) {
    if (!audio) return;
    const k = Math.min(1, dt * 2);
    for (const id in audio.zoneGains) {
      const target = id === activeZone ? 1 : 0;
      const g = audio.zoneGains[id].gain;
      g.value += (target - g.value) * k;
    }
    if (audio.chirpGain) {
      const on = activeZone === 'z1' && Math.sin(t * 7.0) > 0.7;
      audio.chirpGain.gain.value += ((on ? 0.03 : 0) - audio.chirpGain.gain.value) * Math.min(1, dt * 8);
    }
  }

  /* --- Host contract --- */

  // Collision zones: the hub structure in the anchor frame, plus each zone's
  // floor/walls in its own tangent frame. Same pattern as wavemallprime — far
  // zones are skipped by the per-zone distance cull.
  const zones = [{
    frame: { pos: anchorPos, q: anchorQ, qInv: anchorQInv },
    structures: [hub.structure],
    r2: (AC.HUB_FLOOR_HALF + 12) ** 2,
  }];
  for (const z of zoneList) {
    zones.push({ frame: z.frame, structures: [z.structure], r2: z.r2 });
  }
  const _rc = new THREE.Vector3();

  function resolveCollisions(surfaceLocalPos, playerRadius) {
    let pushed = false;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (surfaceLocalPos.distanceToSquared(z.frame.pos) > z.r2) continue;
      _rc.copy(surfaceLocalPos).sub(z.frame.pos).applyQuaternion(z.frame.qInv);
      let zonePushed = false;
      for (let j = 0; j < z.structures.length; j++) {
        if (z.structures[j].resolveWalls(_rc, playerRadius)) zonePushed = true;
      }
      if (zonePushed) {
        surfaceLocalPos.copy(_rc).applyQuaternion(z.frame.q).add(z.frame.pos);
        pushed = true;
      }
    }
    return pushed;
  }

  function groundRadiusAt(surfaceLocalPos) {
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (surfaceLocalPos.distanceToSquared(z.frame.pos) > z.r2) continue;
      _rc.copy(surfaceLocalPos).sub(z.frame.pos).applyQuaternion(z.frame.qInv);
      let best = -Infinity;
      for (let j = 0; j < z.structures.length; j++) {
        const sy = z.structures[j].surfaceYAt(_rc.x, _rc.z, _rc.y);
        if (sy !== null && sy !== undefined && sy > best) best = sy;
      }
      if (best > -Infinity) {
        _rc.y = best;
        return _rc.applyQuaternion(z.frame.q).add(z.frame.pos).length();
      }
      return -1;
    }
    return -1;
  }

  function nearestInteractable(playerPos, maxDist = AC.TALK_REACH) {
    let best = null, bestD2 = maxDist * maxDist;
    for (let i = 0; i < interactables.length; i++) {
      const it = interactables[i];
      if (it.zone !== activeZone) continue; // only the active area is reachable
      const d2 = it.pos.distanceToSquared(playerPos);
      if (d2 < bestD2) { bestD2 = d2; best = it; }
    }
    return best;
  }

  // Build the DialoguePayload for an interactable, dispatching on id + flags.
  function interact(entity) {
    entity.talking = true;
    switch (entity.id) {
      case 'she': return interactShe(entity);
      case 'andreiMikey':
        if (!flags.talkedAndreiMikey) { entity.pending = 'andreiMikey'; return { speaker: DLG.ANDREI_MIKEY, lines: DLG.ANDREI_MIKEY_SCENE }; }
        return { speaker: DLG.ANDREI_MIKEY, lines: DLG.ANDREI_MIKEY_IDLE };
      case 'joshuaCaitlynn':
        if (!flags.talkedJoshuaCaitlynn) { entity.pending = 'joshuaCaitlynn'; return { speaker: DLG.JOSHUA_CAITLYNN, lines: DLG.JOSHUA_CAITLYNN_SCENE }; }
        return { speaker: DLG.JOSHUA_CAITLYNN, lines: DLG.JOSHUA_CAITLYNN_IDLE };
      case 'dragon':
        if (!flags.dragonGiftReceived) { entity.pending = 'dragon'; return { speaker: DLG.DRAGON, lines: DLG.DRAGON_BEFORE }; }
        return { speaker: DLG.DRAGON, lines: DLG.DRAGON_AFTER };
      case 'z1woman': return { speaker: DLG.Z1_WOMAN, lines: DLG.Z1_WOMAN_LINES };
      case 'grandmother': return { speaker: DLG.GRANDMOTHER, lines: DLG.GRANDMOTHER_LINES };
      default: return { speaker: DLG.SHE, lines: ['…'] };
    }
  }

  function interactShe(entity) {
    // 1) First meeting.
    if (!flags.metCafeWoman) {
      entity.pending = 'intro';
      return { speaker: DLG.SHE, lines: DLG.SHE_INTRO };
    }
    // 2) All zones seen and the tenth not yet delivered → final "0" dialogue.
    if (allZonesVisited() && !flags.zeroHeard) {
      entity.pending = 'final';
      return { speaker: DLG.SHE, lines: DLG.SHE_FINAL };
    }
    // 3) A digit was chosen last time → deliver its teaching.
    if (pendingDigit != null) {
      const d = pendingDigit;
      pendingDigit = null;
      const tea = DLG.SHE_TEA[(d - 1) % DLG.SHE_TEA.length];
      if (!flags.digitsHeard.includes(d)) { flags.digitsHeard.push(d); saveFlags(flags); }
      return { speaker: DLG.SHE, lines: [...DLG.SHE_DIGITS[d], tea] };
    }
    // 4) Otherwise greet + offer the digit menu (choice offer).
    return {
      speaker: DLG.SHE,
      lines: DLG.SHE_GREETING,
      offer: {
        kind: 'choice',
        prompt: DLG.SHE_MENU_PROMPT,
        options: DLG.SHE_MENU_OPTIONS.map((label, i) => ({
          label, outcomeTag: `actuality.digit.${i + 1}`,
        })),
      },
    };
  }

  // Host tells us which choice option resolved (walk.js applyOffer). We parse
  // the digit so the next E press delivers that teaching.
  function onOutcome(tag) {
    const m = /^actuality\.digit\.(\d)$/.exec(tag);
    if (m) pendingDigit = Number(m[1]);
  }

  function endInteract(entity) {
    if (!entity) return;
    entity.talking = false;
    // One-shot flag commits + side effects (contract: safe to call twice).
    switch (entity.pending) {
      case 'intro': flags.metCafeWoman = true; saveFlags(flags); break;
      case 'final': flags.zeroHeard = true; saveFlags(flags); break;
      case 'andreiMikey': flags.talkedAndreiMikey = true; saveFlags(flags); break;
      case 'joshuaCaitlynn':
        flags.talkedJoshuaCaitlynn = true; saveFlags(flags);
        startJoshuaDeparture();
        break;
      case 'dragon':
        flags.dragonGiftReceived = true; saveFlags(flags);
        startDragonGift();
        break;
    }
    entity.pending = null;
  }

  function allZonesVisited() {
    const v = flags.visited;
    return v.z1 && v.z2 && v.z3 && v.z4 && v.z5 && v.z6 && v.z7 && v.z8 && v.z9;
  }

  // Consumed once per queued teleport by the walk.js host (returns
  // {pos, heading} in surface-local space, or null).
  function consumeTeleport() {
    const t = pendingTeleport;
    pendingTeleport = null;
    return t;
  }

  // --- Transition overlay (module-owned full-screen DOM fade) ---
  let overlayEl = null;
  function setOverlay(o) {
    if (!overlayEl) {
      if (o <= 0) return;
      overlayEl = document.createElement('div');
      overlayEl.id = 'actyFade';
      overlayEl.style.cssText =
        'position:fixed;inset:0;z-index:20;pointer-events:none;' +
        'background:#0a0704;opacity:0;';
      document.body.appendChild(overlayEl);
    }
    overlayEl.style.opacity = String(o);
  }

  // Begin a soft transition to `target` ('hub' or 'z1'..'z9').
  function startTransition(target) {
    fade.phase = 'out';
    fade.t = 0;
    fade.target = target;
    if (target === 'hub') {
      fade.dest = hubReturnDest;
      fade.heading = hubReturnHeading;
    } else {
      const z = zoneById[target];
      fade.dest = z.entryDest;
      fade.heading = z.entryHeading;
    }
  }

  function advanceFade(dt) {
    if (fade.phase === 'idle') return;
    fade.t += dt;
    if (fade.phase === 'out') {
      setOverlay(Math.min(1, fade.t / AC.FADE_OUT));
      if (fade.t >= AC.FADE_OUT) {
        // Blackout: queue the teleport + switch the active zone.
        pendingTeleport = { pos: fade.dest.clone(), heading: fade.heading.clone() };
        activeZone = fade.target;
        if (fade.target !== 'hub' && fade.target !== 'mirror') {
          flags.visited[fade.target] = true;
          saveFlags(flags);
        }
        if (zoneEnterCallbacks[fade.target]) zoneEnterCallbacks[fade.target]();
        fade.phase = 'in';
        fade.t = 0;
      }
    } else if (fade.phase === 'in') {
      setOverlay(Math.max(0, 1 - fade.t / AC.FADE_IN));
      if (fade.t >= AC.FADE_IN) { fade.phase = 'idle'; setOverlay(0); }
    }
  }

  function update(t, dt, playerPos, sunDot = 1) {
    for (let i = 0; i < figures.length; i++) figures[i].update(t);
    // Per-zone animation (only the active zone runs; the rest hold still).
    for (let i = 0; i < zoneUpdaters.length; i++) zoneUpdaters[i](t, dt, playerPos);
    audioUpdate(t, dt);

    // Open the mirror door once every zone has been seen.
    if (mirrorDoor && !mirrorDoor.opened && allZonesVisited()) {
      mirrorDoor.opened = true;
      mirrorDoor.mesh.visible = false; // the doorway is now a passage
    }

    // Portal triggers — checked in surface-local space (frame-agnostic). Only
    // while idle; the current activeZone decides which portals are live.
    if (fade.phase === 'idle') {
      _surf.copy(playerPos).applyQuaternion(anchorQ).add(anchorPos);
      if (activeZone === 'hub') {
        const r2 = AC.PORTAL_R * AC.PORTAL_R;
        for (let i = 0; i < hubPortals.length; i++) {
          const hp = hubPortals[i];
          if (hp.gated && !allZonesVisited()) continue; // mirror door stays sealed
          if (_surf.distanceToSquared(hp.center) < r2) {
            startTransition(hp.targetZone);
            break;
          }
        }
      } else {
        const z = zoneById[activeZone];
        if (z) {
          let ret = z.retR > 0 && _surf.distanceToSquared(z.retCenter) < z.retR * z.retR;
          if (!ret && z.extraReturns) {
            for (const er of z.extraReturns) {
              if (_surf.distanceToSquared(er.center) < er.r * er.r) { ret = true; break; }
            }
          }
          if (ret) startTransition('hub');
        }
      }
    }
    advanceFade(dt);
  }

  /* ------------------------------------------------------------------
   * Dialogue-zone content (Z3 Soul, Z4 Self, Z9 Death/Rebirth).
   * Interactable positions are pre-transformed into the anchor frame.
   * ---------------------------------------------------------------- */
  function buildDialogueZones() {
    buildZone3();
    buildZone4();
    buildZone9();
  }

  function addZoneBox(rec, w, h, d, x, y, z, color, rough = 0.9) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    rec.group.add(mesh);
    zoneGeos.push(g); zoneMats.push(m);
    return mesh;
  }

  // Z3 — an ordinary daylight coffee shop. Andrei & Mikey at a table.
  function buildZone3() {
    const rec = zoneById['z3'];
    // Bright daylight fill so it reads as an ordinary café.
    const amb = new THREE.AmbientLight(0xfff4e0, 0.7);
    rec.group.add(amb);
    // A table + two chairs + a counter.
    addZoneBox(rec, 1.4, 0.12, 1.4, 0, 0.78, -4, AC.COL_WOOD);
    addZoneBox(rec, 0.16, 0.78, 0.16, 0, 0.39, -4, AC.COL_WOOD);
    addZoneBox(rec, 10, 1.1, 1.0, 0, 0.55, -10, AC.COL_WOOD);
    // Bright emissive "window" panels (gentle bloom for daylight).
    const winGeo = new THREE.PlaneGeometry(4, 2.4);
    const winMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 1.0, side: THREE.DoubleSide,
    });
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(-8, 2.0, -4); win.rotation.y = Math.PI / 2;
    rec.group.add(win);
    zoneGeos.push(winGeo); zoneMats.push(winMat);
    // Figures.
    const andrei = makeFigure({ seated: true, skin: 0xc9a074, cloth: 0x4a5a6a, seed: 31 });
    andrei.group.position.set(-1.4, 0, -4); andrei.group.rotation.y = Math.PI / 2 + 0.2;
    const mikey = makeFigure({ seated: true, skin: 0xd0a878, cloth: 0x6a4a3a, seed: 32 });
    mikey.group.position.set(1.4, 0, -4); mikey.group.rotation.y = -Math.PI / 2 - 0.2;
    rec.group.add(andrei.group, mikey.group);
    figures.push(andrei, mikey);
    interactables.push({ id: 'andreiMikey', zone: 'z3', pos: zoneToAnchor(rec, 0, 0, -2.6), talking: false });
  }

  // Z4 — cramped dorm fading into a warm apartment. Joshua & Caitlynn.
  function buildZone4() {
    const rec = zoneById['z4'];
    // Cool dorm light + warm apartment light (the corridor between them reads
    // as the fade the chapter describes).
    const dorm = new THREE.PointLight(0x8ea4c0, 0.7, 40, 2.0);
    dorm.position.set(-8, 4, 6);
    const apt = new THREE.PointLight(0xffcaa0, 1.1, 60, 2.0);
    apt.position.set(2, 4, -6);
    rec.group.add(dorm, apt);
    // Couch (apartment) + a narrow dorm bed.
    addZoneBox(rec, 3.0, 0.6, 1.2, -2, 0.4, -8, 0x8a6a5a);
    addZoneBox(rec, 0.9, 0.4, 2.0, -8, 0.3, 6, 0x9aa0a8); // dorm bed
    // Big warm apartment window.
    const winGeo = new THREE.PlaneGeometry(4, 2.6);
    const winMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffd9a8, emissiveIntensity: 0.9, side: THREE.DoubleSide,
    });
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(2, 2.1, -11.7);
    rec.group.add(win);
    zoneGeos.push(winGeo); zoneMats.push(winMat);
    // Figures.
    const caitlynn = makeFigure({ seated: true, skin: 0xe0c0a0, cloth: 0xb08090, seed: 41 });
    caitlynn.group.position.set(-2, 0.5, -8); caitlynn.group.rotation.y = 0.2;
    joshuaFig = makeFigure({ seated: false, skin: 0xc99a70, cloth: 0x33465a, seed: 42 });
    joshuaFig.group.position.set(1.6, 0, -5); joshuaFig.group.rotation.y = -0.4;
    rec.group.add(caitlynn.group, joshuaFig.group);
    figures.push(caitlynn, joshuaFig);
    interactables.push({ id: 'joshuaCaitlynn', zone: 'z4', pos: zoneToAnchor(rec, 0, 0, -3.5), talking: false });

    // Joshua's scripted departure (fires once, after the scene resolves).
    zoneUpdaters.push((t, dt) => {
      if (!joshuaDep || !joshuaFig) return;
      joshuaDep.t += dt;
      const T = joshuaDep.t;
      // Walk from the couch toward the door at (4, 0, 8) over ~8s.
      const p = Math.min(1, T / 8);
      const sx = 1.6, sz = -5, dx = 4, dz = 9;
      joshuaFig.group.position.set(sx + (dx - sx) * p, 0, sz + (dz - sz) * p);
      joshuaFig.group.rotation.y = Math.atan2(dx - sx, dz - sz);
      // Fade out over the last 2s, then hide.
      if (T > 8) joshuaFig.setOpacity(Math.max(0, 1 - (T - 8) / 2));
      if (T > 10.2) { joshuaFig.group.visible = false; joshuaDep = null; }
    });
  }

  // Z9 — vertical descent into a dark chamber with the granite dragon.
  function buildZone9() {
    const rec = zoneById['z9'];
    // Rebuild the collision structure: top platform + descending ramp + chamber.
    const surfaces = [
      { x0: -30, x1: 30, z0: -6, z1: 30, y: 0 },               // arrival platform
      { ramp: true, x0: -4, x1: 4, z0: -40, z1: -6, zA: -6, zB: -40, yA: 0, yB: -15 },
      { x0: -16, x1: 16, z0: -72, z1: -40, y: -15 },           // chamber floor
    ];
    const wallH = { y0: -17, y1: 2 };
    const walls = [
      { x0: -4.8, x1: -4.4, z0: -40, z1: -6, ...wallH },       // ramp guards
      { x0: 4.4, x1: 4.8, z0: -40, z1: -6, ...wallH },
      { x0: -16, x1: 16, z0: -72, z1: -71.5, ...wallH },       // chamber back
      { x0: -16, x1: -15.5, z0: -72, z1: -40, ...wallH },      // chamber sides
      { x0: 15.5, x1: 16, z0: -72, z1: -40, ...wallH },
      { x0: -16, x1: -4.5, z0: -40, z1: -39.5, ...wallH },     // chamber front (door gap)
      { x0: 4.5, x1: 16, z0: -40, z1: -39.5, ...wallH },
    ];
    rec.structure = makeStructure(0, 0, 0, surfaces, walls, 78);
    rec.r2 = (78 + 12) ** 2;

    // Dim descent lighting.
    const amb = new THREE.AmbientLight(0x30343c, 0.5);
    rec.group.add(amb);
    // Visual geometry: ramp, chamber floor + walls (matte near-black).
    const dark = 0x14151a;
    const ramp = addZoneBox(rec, 8, 0.4, 34.5, 0, -7.5, -23, dark); // spans the ramp band
    ramp.rotation.x = Math.atan2(15, 34); // tilt to follow the descent
    addZoneBox(rec, 32, 0.6, 32, 0, -15.3, -56, dark);             // chamber floor
    addZoneBox(rec, 32, 18, 0.6, 0, -8, -71.7, dark);              // back wall
    addZoneBox(rec, 0.6, 18, 32, -15.7, -8, -56, dark);            // side walls
    addZoneBox(rec, 0.6, 18, 32, 15.7, -8, -56, dark);

    // The granite dragon (stacked spheres/cones), on the chamber's far side.
    const dragonGrp = new THREE.Group();
    dragonGrp.position.set(0, -15, -60);
    rec.group.add(dragonGrp);
    const graniteMat = new THREE.MeshStandardMaterial({
      color: 0x6a6a72, roughness: 0.95, emissive: 0x1a2230, emissiveIntensity: 0.25,
    });
    zoneMats.push(graniteMat);
    const dragonMats = [graniteMat];
    const dpart = (geo, x, y, z, rx = 0) => {
      const mesh = new THREE.Mesh(geo, graniteMat);
      mesh.position.set(x, y, z); if (rx) mesh.rotation.x = rx;
      dragonGrp.add(mesh); zoneGeos.push(geo); return mesh;
    };
    dpart(new THREE.SphereGeometry(1.8, 12, 10), 0, 1.8, 0);          // lower body
    dpart(new THREE.SphereGeometry(1.5, 12, 10), 0, 3.4, 0.4);        // chest
    dpart(new THREE.CylinderGeometry(0.7, 1.1, 3.2, 10), 0, 5.4, 0.2, 0.5); // neck
    dpart(new THREE.ConeGeometry(0.9, 1.8, 10), 0, 7.2, 0.9, 1.2);    // head
    dpart(new THREE.ConeGeometry(0.5, 4.5, 8), 0, 1.4, -3.2, -0.8);   // tail
    // folded wings (thin cones out to the sides)
    const wingL = dpart(new THREE.ConeGeometry(0.6, 3.5, 6), -1.4, 3.6, -0.4, 0);
    wingL.rotation.z = 0.9; const wingR = dpart(new THREE.ConeGeometry(0.6, 3.5, 6), 1.4, 3.6, -0.4, 0);
    wingR.rotation.z = -0.9;
    // Black box on the chest.
    const boxGeo = new THREE.BoxGeometry(1.0, 1.0, 0.7);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.6, metalness: 0.3 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(0, 3.4, 1.6);
    dragonGrp.add(box); zoneGeos.push(boxGeo); zoneMats.push(boxMat);

    // A quiet return ring off to the side of the chamber (glows after the gift).
    const ringGeo = new THREE.TorusGeometry(1.4, 0.14, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff, emissive: 0x2a4a66, emissiveIntensity: 0.4, roughness: 0.5,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(8, -13.5, -56); ring.rotation.x = Math.PI / 2;
    rec.group.add(ring);
    zoneGeos.push(ringGeo); zoneMats.push(ringMat);

    // Interactable in front of the box; chamber ring as an extra return.
    interactables.push({ id: 'dragon', zone: 'z9', pos: zoneToAnchor(rec, 0, -14, -53), talking: false });
    rec.extraReturns = [{ center: zoneToSurface(rec, 8, -14, -56), r: 3.0 }];

    dragonRefs = { grp: dragonGrp, mats: dragonMats, box, ring, ringMat, seedLight: null, light: null };

    // Transformation VFX updater.
    zoneUpdaters.push((t, dt) => {
      if (!dragonVfx) return;
      dragonVfx.t += dt;
      const T = dragonVfx.t;
      // White DOM flash (0.3s).
      if (whiteFlashEl) whiteFlashEl.style.opacity = String(Math.max(0, 0.9 * (1 - T / 0.35)));
      // Dragon dissolves to a faint ghost over 2.5s.
      const g = Math.max(0.15, 1 - (T / 2.5) * 0.85);
      graniteMat.transparent = true; graniteMat.opacity = g; graniteMat.needsUpdate = true;
      // Burst quads fly outward + fade.
      if (dragonVfx.burst) {
        const b = dragonVfx.burst;
        const m4 = _burstMat4;
        for (let i = 0; i < b.count; i++) {
          const v = b.vel[i];
          const s = 0.3 + T * 0.4;
          m4.makeScale(s, s, s);
          m4.setPosition(b.origin.x + v.x * T, b.origin.y + v.y * T, b.origin.z + v.z * T);
          b.mesh.setMatrixAt(i, m4);
        }
        b.mesh.instanceMatrix.needsUpdate = true;
        b.mesh.material.opacity = Math.max(0, 1 - T / 2.5);
      }
      // Ring brightens; seed light lingers.
      dragonRefs.ringMat.emissiveIntensity = 0.4 + Math.min(1.2, T) * 1.1;
      if (dragonRefs.light) dragonRefs.light.intensity = Math.max(0, 3.0 * (1 - T / 2.5));
      if (T > 2.6) {
        // Cleanup the burst; leave the ghost dragon + seed light.
        if (dragonVfx.burst) {
          rec.group.remove(dragonVfx.burst.mesh);
          dragonVfx.burst.mesh.geometry.dispose();
          dragonVfx.burst.mesh.material.dispose();
          dragonVfx.burst = null;
        }
        if (whiteFlashEl && whiteFlashEl.parentNode) { whiteFlashEl.parentNode.removeChild(whiteFlashEl); whiteFlashEl = null; }
        dragonVfx = null;
      }
    });
  }

  // Joshua walks off toward the door (fires once from endInteract).
  function startJoshuaDeparture() {
    if (joshuaFig && !joshuaDep) joshuaDep = { t: 0 };
  }

  // Dragon transformation: white flash + light-quad burst + dragon dissolve +
  // a lingering seed light. Fires once from endInteract.
  function startDragonGift() {
    if (!dragonRefs || dragonVfx) return;
    dragonVfx = { t: 0, burst: null };
    // White DOM flash.
    whiteFlashEl = document.createElement('div');
    whiteFlashEl.style.cssText =
      'position:fixed;inset:0;z-index:21;pointer-events:none;background:#fff;opacity:0.9;';
    document.body.appendChild(whiteFlashEl);
    // Light-quad burst around the box.
    const N = 120;
    const qGeo = new THREE.PlaneGeometry(0.28, 0.28);
    const qMat = new THREE.MeshBasicMaterial({
      color: 0xfff0c0, transparent: true, opacity: 1, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(qGeo, qMat, N);
    const origin = new THREE.Vector3(0, -13.5, -58.4); // box in zone-local
    const vel = [];
    const rb = mulberry32(0x9e3d);
    for (let i = 0; i < N; i++) {
      const th = rb() * Math.PI * 2, ph = Math.acos(2 * rb() - 1);
      const sp = 2 + rb() * 6;
      vel.push(new THREE.Vector3(
        Math.sin(ph) * Math.cos(th) * sp,
        Math.cos(ph) * sp * 0.7 + 1,
        Math.sin(ph) * Math.sin(th) * sp));
    }
    mesh.frustumCulled = false;
    rec9AddBurst(mesh);
    dragonVfx.burst = { mesh, vel, count: N, origin };
    // Seed light left behind above the box.
    const seed = new THREE.PointLight(0xfff0c0, 0.0, 20, 2.0);
    seed.position.set(0, -12, -58.4);
    zoneById['z9'].group.add(seed);
    dragonRefs.seedLight = seed;
    const surge = new THREE.PointLight(0xffffff, 3.0, 40, 2.0);
    surge.position.set(0, -12.5, -58.4);
    zoneById['z9'].group.add(surge);
    dragonRefs.light = surge;
    // fade the seed up gently
    setTimeout(() => { if (seed) seed.intensity = 0.8; }, 400);
  }
  function rec9AddBurst(mesh) { zoneById['z9'].group.add(mesh); }

  /* ------------------------------------------------------------------
   * Ambient (non-dialogue) zones: Z1 Mind, Z2 Body, Z5 Order, Z6 Life,
   * Z7 Time, Z8 Eternity. Each builds its set piece + an updater gated on
   * being the active zone.
   * ---------------------------------------------------------------- */
  function buildAmbientZones() {
    buildZone1(); buildZone2(); buildZone5(); buildZone6(); buildZone7(); buildZone8();
  }

  // Inward gradient sky dome for a zone.
  function addDome(rec, radius, topHex, botHex) {
    const tex = gradientTexture(topHex, botHex);
    const geo = new THREE.SphereGeometry(radius, 20, 14);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
    const dome = new THREE.Mesh(geo, mat);
    rec.group.add(dome);
    zoneGeos.push(geo); zoneMats.push(mat); zoneTextures.push(tex);
    return { dome, mat, tex };
  }

  // Z1 Mind — sidewalk → alley → park → autumn forest, falling leaves, the
  // woman in the light.
  function buildZone1() {
    const rec = zoneById['z1'];
    rec.group.add(new THREE.AmbientLight(0xffcf9a, 0.5));
    addDome(rec, 90, '#4a3422', '#d8974e');
    // Graffiti alley near the entrance.
    addZoneBox(rec, 0.5, 6, 14, -4.5, 3, -2, 0x53463a);
    addZoneBox(rec, 0.5, 6, 14, 4.5, 3, -2, 0x604a3c);
    // Park benches.
    addZoneBox(rec, 2.0, 0.4, 0.6, -6, 0.5, -20, AC.COL_WOOD);
    addZoneBox(rec, 2.0, 0.4, 0.6, 6, 0.5, -22, AC.COL_WOOD);
    // Autumn forest: trunks + warm canopies.
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.95 });
    const leafMats = [0xd9772a, 0xe0a338, 0xc85a26].map((c) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
    zoneMats.push(trunkMat, ...leafMats);
    const treeRng = mulberry32(0x1111);
    for (let i = 0; i < 30; i++) {
      const tx = (treeRng() - 0.5) * 28;
      const tz = -34 - treeRng() * 40;
      const th = 4 + treeRng() * 3;
      const tG = new THREE.CylinderGeometry(0.25, 0.35, th, 6);
      const tm = new THREE.Mesh(tG, trunkMat); tm.position.set(tx, th / 2, tz);
      rec.group.add(tm); zoneGeos.push(tG);
      const cG = new THREE.SphereGeometry(1.6 + treeRng(), 8, 6);
      const cm = new THREE.Mesh(cG, leafMats[i % 3]);
      cm.position.set(tx, th + 0.6, tz); cm.scale.y = 0.8;
      rec.group.add(cm); zoneGeos.push(cG);
    }
    // The woman standing in a shaft of light.
    const woman = makeFigure({ seated: false, skin: 0xe8cba0, cloth: 0xf2e6cc, seed: 11 });
    woman.group.position.set(0, 0, -58);
    rec.group.add(woman.group); figures.push(woman);
    const coneGeo = new THREE.ConeGeometry(3, 13, 16, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff2d0, transparent: true, opacity: 0.1, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(0, 6.5, -58); rec.group.add(cone);
    zoneGeos.push(coneGeo); zoneMats.push(coneMat);
    const wlight = new THREE.PointLight(0xffe6c0, 1.4, 34, 2.0);
    wlight.position.set(0, 5, -58); rec.group.add(wlight);
    interactables.push({ id: 'z1woman', zone: 'z1', pos: zoneToAnchor(rec, 0, 0, -55), talking: false });

    // Falling leaves.
    const N = 300;
    const leafGeo = new THREE.PlaneGeometry(0.22, 0.22);
    const leafMat = new THREE.MeshBasicMaterial({
      color: 0xe0902e, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
    });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, N);
    leaves.frustumCulled = false;
    rec.group.add(leaves);
    zoneGeos.push(leafGeo); zoneMats.push(leafMat);
    const lr = mulberry32(0x2222);
    const base = [];
    for (let i = 0; i < N; i++) {
      base.push({ x: (lr() - 0.5) * 30, y: lr() * 22, z: -30 - lr() * 46, ph: lr() * 6.28, sp: 0.6 + lr() * 0.8 });
    }
    const _lm = new THREE.Matrix4();
    zoneUpdaters.push((t) => {
      if (activeZone !== 'z1') return;
      for (let i = 0; i < N; i++) {
        const b = base[i];
        let y = b.y - ((t * b.sp) % 24);
        if (y < 0) y += 24;
        const x = b.x + Math.sin(t * 0.8 + b.ph) * 0.8;
        _lm.makeRotationZ(t + b.ph);
        _lm.setPosition(x, y, b.z);
        leaves.setMatrixAt(i, _lm);
      }
      leaves.instanceMatrix.needsUpdate = true;
    });
  }

  // Z2 Body — a warm room whose three walls + ceiling breathe outward.
  function buildZone2() {
    const rec = zoneById['z2'];
    rec.group.add(new THREE.AmbientLight(0x3a2418, 0.45));
    const light = new THREE.PointLight(0xffb070, 0.8, 34, 2.0);
    light.position.set(0, 4, 2); rec.group.add(light);
    // Enclosing walls on -Z, +X, -X (open toward +Z where the return arch is).
    const R = 12, WH = 6.5;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x7a4f38, roughness: 0.92, side: THREE.DoubleSide });
    zoneMats.push(wallMat);
    const mkPanel = (w, h, x, y, z, ry) => {
      const g = new THREE.PlaneGeometry(w, h);
      const m = new THREE.Mesh(g, wallMat); m.position.set(x, y, z); m.rotation.y = ry;
      rec.group.add(m); zoneGeos.push(g); return m;
    };
    const back = mkPanel(R * 2, WH, 0, WH / 2, -R, 0);
    const left = mkPanel(R * 2, WH, -R, WH / 2, 0, Math.PI / 2);
    const right = mkPanel(R * 2, WH, R, WH / 2, 0, Math.PI / 2);
    const ceilGeo = new THREE.PlaneGeometry(R * 2, R * 2);
    const ceil = new THREE.Mesh(ceilGeo, wallMat);
    ceil.position.set(0, WH, 0); ceil.rotation.x = Math.PI / 2;
    rec.group.add(ceil); zoneGeos.push(ceilGeo);
    // Collision: the three walls (open +Z).
    const wt = 0.4;
    rec.structure = makeStructure(0, 0, 0,
      [{ x0: -R, x1: R, z0: -R, z1: R, y: 0 }],
      [
        { x0: -R, x1: R, z0: -R - wt, z1: -R, y0: 0, y1: WH },
        { x0: -R - wt, x1: -R, z0: -R, z1: R, y0: 0, y1: WH },
        { x0: R, x1: R + wt, z0: -R, z1: R, y0: 0, y1: WH },
      ], R + 2);
    rec.r2 = (R + 12) ** 2;
    // Breathing: walls/ceiling ease outward with a slow sine.
    zoneUpdaters.push((t) => {
      if (activeZone !== 'z2') return;
      const d = (Math.sin(t * 0.4) * 0.5 + 0.5) * 0.6; // 0..0.6 m
      back.position.z = -R - d;
      left.position.x = -R - d;
      right.position.x = R + d;
      ceil.position.y = WH + d;
    });
  }

  // Z5 Order — a ribbon into a void lined with floating memory frames.
  function buildZone5() {
    const rec = zoneById['z5'];
    rec.group.add(new THREE.AmbientLight(0x202028, 0.4));
    addDome(rec, 70, '#050507', '#0a0a12');
    const frames = [];
    const fr = mulberry32(0x5555);
    for (let i = 0; i < 16; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -6 - i * 1.4;
      const y = 1.6 + fr() * 2.2;
      const x = side * (2.4 + fr() * 1.2);
      const frameMesh = addZoneBox(rec, 1.7, 1.3, 0.12, x, y, z, 0x2a2622);
      const imgTex = memoryTexture(fr);
      const imgGeo = new THREE.PlaneGeometry(1.4, 1.0);
      const imgMat = new THREE.MeshStandardMaterial({
        map: imgTex, emissive: 0xffffff, emissiveMap: imgTex, emissiveIntensity: 0.15,
      });
      const img = new THREE.Mesh(imgGeo, imgMat);
      img.position.set(x, y, z + 0.08 * side + (side < 0 ? 0.09 : -0.09));
      img.rotation.y = side < 0 ? 0.2 : -0.2;
      rec.group.add(img);
      zoneGeos.push(imgGeo); zoneMats.push(imgMat); zoneTextures.push(imgTex);
      frames.push({ img, mat: imgMat, anchorPos: zoneToAnchor(rec, x, y, z), baseY: y, ph: fr() * 6.28 });
    }
    zoneUpdaters.push((t, dt, playerPos) => {
      if (activeZone !== 'z5') return;
      for (const f of frames) {
        f.img.position.y = f.baseY + Math.sin(t * 0.6 + f.ph) * 0.15;
        const near = f.anchorPos.distanceToSquared(playerPos) < 25; // within 5 m
        const target = near ? 1.0 : 0.15;
        f.mat.emissiveIntensity += (target - f.mat.emissiveIntensity) * Math.min(1, dt * 3);
        if (near) f.mat.map.offset.x = (f.mat.map.offset.x + dt * 0.05) % 1;
      }
    });
  }

  // Z6 Life — mountain overlook at dusk with a submerged lake below.
  function buildZone6() {
    const rec = zoneById['z6'];
    rec.group.add(new THREE.AmbientLight(0x30364a, 0.5));
    const dome = addDome(rec, 95, '#141a2e', '#5a4a6a');
    // Skyline silhouette panel + crescent moon on the dome.
    const skyTex = silhouetteTexture('skyline');
    const skyGeo = new THREE.PlaneGeometry(70, 24);
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, transparent: true, depthWrite: false });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.set(0, 8, -55); rec.group.add(sky);
    zoneGeos.push(skyGeo); zoneMats.push(skyMat); zoneTextures.push(skyTex);
    const moonGeo = new THREE.CircleGeometry(3, 24);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xf0ead0 });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.position.set(-22, 30, -50); rec.group.add(moon);
    zoneGeos.push(moonGeo); zoneMats.push(moonMat);
    // Lonesome tree at the overlook edge.
    const trunkG = new THREE.CylinderGeometry(0.3, 0.4, 5, 6);
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.95 });
    const trunk = new THREE.Mesh(trunkG, trunkM); trunk.position.set(9, 2.5, -8);
    rec.group.add(trunk); zoneGeos.push(trunkG); zoneMats.push(trunkM);

    // Lake sub-area: a descending path to a dark pool below grade.
    const surfaces = [
      { x0: -30, x1: 30, z0: -6, z1: 30, y: 0 },                        // overlook
      { ramp: true, x0: -3, x1: 3, z0: -26, z1: -6, zA: -6, zB: -26, yA: 0, yB: -8 },
      { x0: -12, x1: 12, z0: -50, z1: -26, y: -8 },                     // pool floor
    ];
    const wh = { y0: -10, y1: 2 };
    const walls = [
      { x0: -3.4, x1: -3.0, z0: -26, z1: -6, ...wh },
      { x0: 3.0, x1: 3.4, z0: -26, z1: -6, ...wh },
      { x0: -12, x1: 12, z0: -50, z1: -49.5, ...wh },
      { x0: -12, x1: -11.5, z0: -50, z1: -26, ...wh },
      { x0: 11.5, x1: 12, z0: -50, z1: -26, ...wh },
    ];
    rec.structure = makeStructure(0, 0, 0, surfaces, walls, 55);
    rec.r2 = (55 + 12) ** 2;
    // Dark translucent water disc at the pool rim (y ~ -2).
    const waterGeo = new THREE.PlaneGeometry(24, 24);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0a1420, transparent: true, opacity: 0.72, roughness: 0.3, side: THREE.DoubleSide,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(0, -2, -38); water.rotation.x = -Math.PI / 2;
    rec.group.add(water); zoneGeos.push(waterGeo); zoneMats.push(waterMat);
    // Rebirth vision: god-ray cones + a brightening light (fires once).
    const visionGrp = new THREE.Group();
    visionGrp.position.set(0, -8, -38); visionGrp.visible = false;
    rec.group.add(visionGrp);
    const rayMat = new THREE.MeshBasicMaterial({
      color: 0xdfeaff, transparent: true, opacity: 0.0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    zoneMats.push(rayMat);
    for (let i = 0; i < 4; i++) {
      const rg = new THREE.ConeGeometry(1.4, 12, 12, 1, true);
      const rm = new THREE.Mesh(rg, rayMat);
      rm.position.set((i - 1.5) * 2.2, 8, 0); rm.rotation.x = Math.PI;
      visionGrp.add(rm); zoneGeos.push(rg);
    }
    const visionLight = new THREE.PointLight(0xdfeaff, 0, 30, 2.0);
    visionLight.position.set(0, 8, 0); visionGrp.add(visionLight);

    // Blue submersion overlay element (created lazily).
    zoneUpdaters.push((t, dt, playerPos) => {
      if (activeZone !== 'z6') { setZ6Tint(0); return; }
      // Player zone-local y (depth below the overlook).
      _surf.copy(playerPos).applyQuaternion(anchorQ).add(anchorPos);
      _z6Local.copy(_surf).sub(rec.frame.pos).applyQuaternion(rec.frame.qInv);
      const submerged = _z6Local.y < -2.5;
      if (submerged) {
        z6Submerged += dt;
        setZ6Tint(Math.min(0.55, z6Submerged * 0.4));
        if (z6Submerged > 3 && !z6Vision && !flags.z6VisionSeen) {
          z6Vision = { t: 0 }; visionGrp.visible = true;
          if (!flags.z6VisionSeen) { flags.z6VisionSeen = true; saveFlags(flags); }
        }
      } else {
        z6Submerged = 0; setZ6Tint(0);
      }
      if (z6Vision) {
        z6Vision.t += dt;
        const k = Math.min(1, z6Vision.t / 4) * Math.max(0, 1 - (z6Vision.t - 4) / 3);
        rayMat.opacity = 0.5 * k;
        visionLight.intensity = 5 * k;
        if (z6Vision.t > 7) { z6Vision = null; visionGrp.visible = false; rayMat.opacity = 0; visionLight.intensity = 0; }
      }
    });
  }

  function setZ6Tint(o) {
    if (!z6Tint) {
      if (o <= 0) return;
      z6Tint = document.createElement('div');
      z6Tint.style.cssText = 'position:fixed;inset:0;z-index:18;pointer-events:none;background:#0a1a30;opacity:0;';
      document.body.appendChild(z6Tint);
    }
    z6Tint.style.opacity = String(o);
  }

  // Z7 Time — a dark room lit by a flickering TV; sitting near it runs the
  // "I won't remember" captions, then returns to the hub.
  function buildZone7() {
    const rec = zoneById['z7'];
    rec.group.add(new THREE.AmbientLight(0x101018, 0.35));
    addDome(rec, 60, '#04040a', '#08080f');
    // TV.
    addZoneBox(rec, 2.6, 1.8, 1.6, 0, 1.1, -8, 0x1a1a1e);
    const scr = tvStaticTexture(mulberry32(0x7777));
    const scrGeo = new THREE.PlaneGeometry(2.2, 1.4);
    const scrMat = new THREE.MeshStandardMaterial({
      map: scr, emissive: 0xafc8ff, emissiveMap: scr, emissiveIntensity: 0.9,
    });
    const screen = new THREE.Mesh(scrGeo, scrMat);
    screen.position.set(0, 1.3, -7.18); rec.group.add(screen);
    zoneGeos.push(scrGeo); zoneMats.push(scrMat); zoneTextures.push(scr);
    const tvLight = new THREE.PointLight(0x8fb0ff, 0.8, 24, 2.0);
    tvLight.position.set(0, 1.5, -5); rec.group.add(tvLight);
    // Window with swing-set silhouette.
    const swTex = silhouetteTexture('swing');
    const swGeo = new THREE.PlaneGeometry(6, 3);
    const swMat = new THREE.MeshStandardMaterial({
      map: swTex, transparent: true, emissive: 0x2a3550, emissiveMap: swTex, emissiveIntensity: 0.5,
    });
    const window7 = new THREE.Mesh(swGeo, swMat);
    window7.position.set(9, 3, -4); window7.rotation.y = -Math.PI / 2;
    rec.group.add(window7); zoneGeos.push(swGeo); zoneMats.push(swMat); zoneTextures.push(swTex);
    const tvPos = zoneToAnchor(rec, 0, 1, -6);
    let flick = 0;
    zoneUpdaters.push((t, dt, playerPos) => {
      if (activeZone !== 'z7') { z7Sit = 0; return; }
      // TV flicker.
      flick -= dt;
      if (flick <= 0) {
        scrMat.emissiveIntensity = 0.5 + (Math.sin(t * 53.0) * 0.5 + 0.5) * 0.9;
        tvLight.intensity = 0.4 + Math.abs(Math.sin(t * 47.0)) * 0.9;
        flick = 0.05;
      }
      // Sit trigger: near the TV for > 1.5 s.
      if (tvPos.distanceToSquared(playerPos) < 4) z7Sit += dt; else z7Sit = Math.max(0, z7Sit - dt);
      if (z7Sit > 1.5 && !z7Caption && fade.phase === 'idle') {
        z7Caption = { i: 0, t: 0 };
      }
      if (z7Caption) {
        z7Caption.t += dt;
        const idx = Math.floor(z7Caption.t / 1.1);
        if (idx !== z7Caption.i) { z7Caption.i = idx; }
        if (idx < DLG.Z7_FRAGMENTS.length) {
          setZ7Caption(DLG.Z7_FRAGMENTS[Math.min(idx, DLG.Z7_FRAGMENTS.length - 1)]);
        } else {
          // Sequence complete → gently return to the hub.
          setZ7Caption(null);
          z7Caption = null; z7Sit = 0;
          if (fade.phase === 'idle') startTransition('hub');
        }
      }
    });
  }

  function setZ7Caption(text) {
    if (text == null) {
      if (z7CaptionEl && z7CaptionEl.parentNode) z7CaptionEl.parentNode.removeChild(z7CaptionEl);
      z7CaptionEl = null; return;
    }
    if (!z7CaptionEl) {
      z7CaptionEl = document.createElement('div');
      z7CaptionEl.style.cssText =
        'position:fixed;left:50%;top:42%;transform:translateX(-50%);z-index:19;' +
        'pointer-events:none;color:#bfe0ff;font-family:"Courier New",monospace;' +
        'font-size:20px;letter-spacing:0.15em;text-shadow:0 0 12px rgba(140,200,255,0.7);';
      document.body.appendChild(z7CaptionEl);
    }
    z7CaptionEl.textContent = text;
  }

  // Z8 Eternity — a campfire that burns down while the clearing opens to a
  // starfield; grandmother's bedside as a quiet side room.
  function buildZone8() {
    const rec = zoneById['z8'];
    rec.group.add(new THREE.AmbientLight(0x241a12, 0.4));
    const dusk = addDome(rec, 92, '#2a1c26', '#c07a4a');
    const night = addDome(rec, 90, '#02030a', '#0a1428');
    night.mat.transparent = true; night.mat.opacity = 0; // crossfades in as the fire dies
    // Campfire: logs + additive flame cones + embers + light.
    addZoneBox(rec, 2.4, 0.4, 0.5, 0, 0.2, -6, 0x3a2a1c);
    addZoneBox(rec, 0.5, 0.4, 2.4, 0, 0.2, -6, 0x3a2a1c);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xffb040, transparent: true, opacity: 0.8, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    zoneMats.push(flameMat);
    const flames = [];
    for (let i = 0; i < 3; i++) {
      const fg = new THREE.ConeGeometry(0.5 - i * 0.12, 1.6 - i * 0.35, 8);
      const fm = new THREE.Mesh(fg, flameMat); fm.position.set(0, 0.8 - i * 0.15, -6);
      rec.group.add(fm); zoneGeos.push(fg); flames.push(fm);
    }
    const fireLight = new THREE.PointLight(0xff9040, 1.6, 30, 2.0);
    fireLight.position.set(0, 1.5, -6); rec.group.add(fireLight);
    // Embers.
    const N = 60;
    const eGeo = new THREE.PlaneGeometry(0.06, 0.06);
    const eMat = new THREE.MeshBasicMaterial({
      color: 0xffb050, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const embers = new THREE.InstancedMesh(eGeo, eMat, N);
    embers.frustumCulled = false; rec.group.add(embers);
    zoneGeos.push(eGeo); zoneMats.push(eMat);
    const er = mulberry32(0x8888);
    const eb = [];
    for (let i = 0; i < N; i++) eb.push({ x: (er() - 0.5) * 1.2, z: -6 + (er() - 0.5) * 1.2, ph: er() * 6.28, sp: 0.5 + er() });
    const _em = new THREE.Matrix4();
    // Grandmother's bedside side room (off to +X).
    addZoneBox(rec, 0.4, 3, 6, 12, 1.5, -4, 0x4a3e34);   // back wall
    addZoneBox(rec, 5, 3, 0.4, 15, 1.5, -7, 0x4a3e34);   // side wall
    addZoneBox(rec, 2.4, 0.5, 1.2, 15, 0.6, -4, 0x8a7060); // bed
    const candle = new THREE.PointLight(0xffcaa0, 0.7, 14, 2.0);
    candle.position.set(15, 2, -4); rec.group.add(candle);
    const gran = makeFigure({ seated: true, skin: 0xd8c0a8, cloth: 0xa0a0b0, seed: 81 });
    gran.group.position.set(15, 0.4, -4); gran.group.rotation.y = -Math.PI / 2;
    rec.group.add(gran.group); figures.push(gran);
    interactables.push({ id: 'grandmother', zone: 'z8', pos: zoneToAnchor(rec, 13.2, 0, -4), talking: false });

    // Reset the burn-down timer each time the player enters zone 8.
    zoneEnterCallbacks['z8'] = () => { z8Burn = 0; };
    zoneUpdaters.push((t, dt) => {
      if (activeZone !== 'z8') return;
      z8Burn += dt;
      const burn = Math.max(0.12, 1 - z8Burn / 90); // 1 → embers over ~90 s
      for (let i = 0; i < flames.length; i++) {
        const s = burn * (0.9 + Math.sin(t * 8 + i) * 0.12);
        flames[i].scale.set(s, s + Math.sin(t * 6 + i) * 0.1, s);
      }
      fireLight.intensity = 0.3 + burn * 1.6;
      flameMat.opacity = 0.3 + burn * 0.5;
      night.mat.opacity = (1 - burn) * 0.9; // starfield fades in as the fire dies
      dusk.mat.opacity = 0.4 + burn * 0.6;
      dusk.mat.transparent = true;
      for (let i = 0; i < N; i++) {
        const b = eb[i];
        const y = 0.6 + ((t * b.sp + b.ph) % 4) * burn;
        _em.makeTranslation(b.x + Math.sin(t + b.ph) * 0.2, y, b.z);
        embers.setMatrixAt(i, _em);
      }
      embers.instanceMatrix.needsUpdate = true;
      eMat.opacity = 0.3 + burn * 0.6;
    });
  }

  // Hyper-holo-grid chamber, on a bearing behind the café (its own frame). The
  // door in the hub is built separately (buildMirrorDoor), after the portals.
  function buildMirrorRoom() {
    const dir = ringDir(planet, anchorDir, 0.4, 200);
    const frame = surfaceFrame(planet, anchorDir, dir);
    const zg = new THREE.Group();
    zg.name = 'actuality.mirror';
    zg.position.copy(frame.pos);
    zg.quaternion.copy(frame.q);
    group.add(zg);

    mirror = createMirrorRoom({ half: 4 });
    zg.add(mirror.group);
    const H = mirror.half;

    mirrorRec = {
      id: 'mirror', frame, group: zg,
      structure: makeStructure(0, 0, 0,
        [{ x0: -H, x1: H, z0: -H, z1: H, y: 0 }], [], H + 1),
      r2: (H + 12) ** 2,
      center: frame.pos.clone(),
      retCenter: frame.pos.clone(), // unused — the mirror exits by wall-touch only
      retR: 0, // disables the center-return trigger (guarded by retR > 0)
      entryDest: new THREE.Vector3(0, 0.2, 0).applyQuaternion(frame.q).add(frame.pos),
      entryHeading: new THREE.Vector3(0, 0, 1).applyQuaternion(frame.q).normalize(),
    };
    zoneList.push(mirrorRec);
    zoneById['mirror'] = mirrorRec;

    zoneEnterCallbacks['mirror'] = () => {
      if (!flags.hyperHoloGridSeen) { flags.hyperHoloGridSeen = true; saveFlags(flags); }
    };

    // Updater: drive the clone + billboard the lattice; wall-touch exits home.
    zoneUpdaters.push((t, dt, playerPos) => {
      if (activeZone !== 'mirror') return;
      _surf.copy(playerPos).applyQuaternion(anchorQ).add(anchorPos);
      _z6Local.copy(_surf).sub(frame.pos).applyQuaternion(frame.qInv); // player in mirror-local
      _dbgMirror.copy(_z6Local);
      mirror.update(t, dt, _z6Local, 0);
      if (fade.phase === 'idle' && (Math.abs(_z6Local.x) > H - 0.5 || Math.abs(_z6Local.z) > H - 0.5)) {
        startTransition('hub');
      }
    });
  }

  // Sealed door behind the café; opens (and its portal arms) once every zone is
  // visited. Built after the hub portals so it can register with them.
  function buildMirrorDoor() {
    const doorGeo = new THREE.BoxGeometry(2.4, 3.2, 0.3);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x14110c, roughness: 0.9 });
    const mesh = new THREE.Mesh(doorGeo, doorMat);
    mesh.position.set(0, 1.6, AC.CAFE_BACK_Z + 0.4); // behind the café back wall
    anchor.add(mesh);
    zoneGeos.push(doorGeo); zoneMats.push(doorMat);
    mirrorDoor = { mesh, mat: doorMat, opened: false };
    hubPortals.push({
      targetZone: 'mirror', gated: true,
      center: new THREE.Vector3(0, 0, AC.CAFE_BACK_Z + 1.2).applyQuaternion(anchorQ).add(anchorPos),
    });
  }

  // Pre-composer render hook: only the mirror room draws to a render target,
  // and only while the player is inside it.
  function preRender(renderer) {
    if (mirror && activeZone === 'mirror') mirror.preRender(renderer);
  }

  function debug() {
    return {
      flags: JSON.parse(JSON.stringify(flags)),
      activeZone, pendingDigit,
      fadePhase: fade.phase,
      allZonesVisited: allZonesVisited(),
      // surface-local portal centers, for headless tests to drive the trigger
      portals: hubPortals.map((p) => ({
        targetZone: p.targetZone, center: [p.center.x, p.center.y, p.center.z],
      })),
      returns: zoneList.map((z) => ({
        id: z.id, retCenter: [z.retCenter.x, z.retCenter.y, z.retCenter.z],
      })),
      npcs: interactables.map((it) => ({
        id: it.id, zone: it.zone, pos: [it.pos.x, it.pos.y, it.pos.z],
      })),
      joshuaVisible: joshuaFig ? joshuaFig.group.visible : null,
      runtime: {
        z6Submerged, z7Sit, z8Burn, z7Caption: !!z7Caption, z6Vision: !!z6Vision,
        mirrorDoorOpen: mirrorDoor ? mirrorDoor.opened : null,
        mirrorLocal: [_dbgMirror.x, _dbgMirror.y, _dbgMirror.z],
      },
    };
  }

  // Test hook: ground radius (and reference terrain radius) at a zone-local
  // point, for verifying below-grade descent.
  function probeGround(zoneId, x, y, z) {
    const rec = zoneById[zoneId];
    if (!rec) return null;
    const s = zoneToSurface(rec, x, y, z);
    return { ground: groundRadiusAt(s.clone()), surfLen: s.length() };
  }

  // Test hook: surface-local coordinates of a zone-local point (so a driver can
  // place the player at a set piece).
  function surfacePoint(zoneId, x, y, z) {
    const rec = zoneById[zoneId];
    if (!rec) return null;
    const s = zoneToSurface(rec, x, y, z);
    return [s.x, s.y, s.z];
  }

  function dispose() {
    hub.dispose();
    if (mirror) mirror.dispose();
    for (const f of figures) f.dispose();
    for (const g of zoneGeos) g.dispose();
    for (const m of zoneMats) m.dispose();
    for (const tx of zoneTextures) tx.dispose();
    // Sign textures live on arch groups' userData.
    group.traverse((o) => {
      if (o.userData && o.userData.signTex) o.userData.signTex.dispose();
    });
    anchor.traverse((o) => {
      if (o.userData && o.userData.signTex) o.userData.signTex.dispose();
    });
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
    // Clean up any in-flight dragon VFX (its burst mesh isn't tracked in bins).
    if (dragonVfx && dragonVfx.burst) {
      dragonVfx.burst.mesh.geometry.dispose();
      dragonVfx.burst.mesh.material.dispose();
    }
    dragonVfx = null;
    if (whiteFlashEl && whiteFlashEl.parentNode) whiteFlashEl.parentNode.removeChild(whiteFlashEl);
    whiteFlashEl = null;
    if (z6Tint && z6Tint.parentNode) z6Tint.parentNode.removeChild(z6Tint);
    z6Tint = null;
    if (z7CaptionEl && z7CaptionEl.parentNode) z7CaptionEl.parentNode.removeChild(z7CaptionEl);
    z7CaptionEl = null;
    if (audio) {
      try { for (const n of audio.started) { try { n.stop(); } catch { /* already stopped */ } } } catch { /* ignore */ }
      try { audio.ctx.close(); } catch { /* ignore */ }
    }
    audio = null;
  }

  return {
    group,
    anchor,
    update,
    dispose,
    initAudio,
    resolveCollisions,
    groundRadiusAt,
    nearestInteractable,
    interact,
    endInteract,
    onOutcome,
    consumeTeleport,
    preRender,
    debug,
    probeGround,
    surfacePoint,
    // exposed for future milestones / tests
    _flags: flags,
  };
}
