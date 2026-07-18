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
  // Scripted-scene state (Joshua's departure, the dragon transformation).
  let joshuaFig = null;
  let joshuaDep = null;     // { t } while Joshua walks off
  let dragonRefs = null;    // { fig, box, ring, seedLight, light } for zone 9
  let dragonVfx = null;     // { t } while the transformation plays
  let whiteFlashEl = null;  // DOM flash element for the dragon gift
  buildDialogueZones();

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

  // --- Audio (real graph lands in M7) ---
  let audio = null;
  function initAudio() {
    // Lazy AudioContext bed — populated in a later milestone. Fail-open.
    if (audio) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audio = { ctx: new Ctx() };
      if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
    } catch { audio = null; }
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
        if (fade.target !== 'hub') {
          flags.visited[fade.target] = true;
          saveFlags(flags);
        }
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

    // Portal triggers — checked in surface-local space (frame-agnostic). Only
    // while idle; the current activeZone decides which portals are live.
    if (fade.phase === 'idle') {
      _surf.copy(playerPos).applyQuaternion(anchorQ).add(anchorPos);
      if (activeZone === 'hub') {
        const r2 = AC.PORTAL_R * AC.PORTAL_R;
        for (let i = 0; i < hubPortals.length; i++) {
          if (_surf.distanceToSquared(hubPortals[i].center) < r2) {
            startTransition(hubPortals[i].targetZone);
            break;
          }
        }
      } else {
        const z = zoneById[activeZone];
        if (z) {
          let ret = _surf.distanceToSquared(z.retCenter) < z.retR * z.retR;
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

  // Pre-composer render hook (mirror room RTT lands in M6). No-op for now.
  function preRender(renderer) { /* mirror room only */ }

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

  function dispose() {
    hub.dispose();
    for (const f of figures) f.dispose();
    for (const g of zoneGeos) g.dispose();
    for (const m of zoneMats) m.dispose();
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
    if (audio && audio.ctx) { try { audio.ctx.close(); } catch { /* ignore */ } }
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
    // exposed for future milestones / tests
    _flags: flags,
  };
}
