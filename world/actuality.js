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
  function dispose() {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  }
  return { group, update, dispose };
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

  // --- Zone / crossfade state (portals + zones land in later milestones) ---
  let activeZone = 'hub';
  const zoneRecords = []; // {id, frame, structure, ...} filled by M3+

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

  // Collision zones: the hub structure in the anchor frame, plus any zone
  // structures (added by later milestones). Same pattern as wavemallprime.
  const zones = [{
    frame: { pos: anchorPos, q: anchorQ, qInv: anchorQInv },
    structures: [hub.structure],
    r2: (AC.HUB_FLOOR_HALF + 12) ** 2,
  }];
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
    if (entity.id === 'she') return interactShe(entity);
    // Zone NPCs land in later milestones; default to a soft idle.
    return { speaker: DLG.SHE, lines: ['…'] };
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
    // One-shot flag commits happen here (contract: safe to call twice).
    if (entity.pending === 'intro') { flags.metCafeWoman = true; saveFlags(flags); }
    if (entity.pending === 'final') { flags.zeroHeard = true; saveFlags(flags); }
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

  function update(t, dt, playerPos, sunDot = 1) {
    for (let i = 0; i < figures.length; i++) figures[i].update(t);
  }

  // Pre-composer render hook (mirror room RTT lands in M6). No-op for now.
  function preRender(renderer) { /* mirror room only */ }

  function debug() {
    return {
      flags: JSON.parse(JSON.stringify(flags)),
      activeZone, pendingDigit,
      allZonesVisited: allZonesVisited(),
    };
  }

  function dispose() {
    hub.dispose();
    for (const f of figures) f.dispose();
    if (audio && audio.ctx) { try { audio.ctx.close(); } catch { /* ignore */ } }
    audio = null;
    // Detach everything; walk.js also removes group from planet.surface.
    group.traverse((o) => { /* geometries/materials disposed by owners above */ });
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
    // exposed for future milestones / tests
    _flags: flags,
  };
}
