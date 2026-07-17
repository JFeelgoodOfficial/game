/**
 * wavemallprime.js
 *
 * Procedural planet module for "Wavemall Prime" â€” a retail-bureaucratic
 * anomaly world themed after the Wave Collector album "Your Call is
 * Important to Us". Builds department districts, signature landmarks,
 * employee/caller citizens, and ambient hold-music atmosphere.
 *
 * Coordinate assumptions (matches existing engine conventions):
 * - Units are meters. Astronaut is 1.9 units tall, eye height 2.0.
 * - Planets are spheres; terrain sits on planet.surface (spinning mesh).
 * - Everything is placed in UNROTATED object space, parented to
 *   planet.surface, so planet spin + floating-origin rebasing carry it
 *   along for free.
 * - Local Y aligns to the radial "up" direction at the landing point;
 *   quaternion.setFromUnitVectors(yAxis, dir) then yaw about that axis
 *   for facing.
 * - Lighting is external (DirectionalLight + Hemisphere/Ambient already
 *   in the scene). Only emissive materials add their own "light" via
 *   bloom. Bloom threshold is 0.85 â€” emissiveIntensity above that blooms.
 *
 * No external assets. All geometry from primitives + noise displacement.
 * All textures generated in code via CanvasTexture. Deterministic via
 * mulberry32(seed).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ----------------------------------------------------------------------
 * Tunables â€” every magic number lives here.
 * ------------------------------------------------------------------- */
const C = {
  // District layout
  DISTRICT_RADIUS: 140,          // footprint radius per department district (m)
  DISTRICT_COUNT: 8,             // one per album department
  DISTRICT_RING_GAP: 60,         // gap between district footprints (m)
  CONCOURSE_WIDTH: 10,           // width of walkable concourse bands (m)
  BUILDINGS_PER_DISTRICT: 14,    // storefront/spire count per district
  BUILDING_MIN_H: 6,
  BUILDING_MAX_H: 26,
  BUILDING_MIN_W: 6,
  BUILDING_MAX_W: 12,

  // Speaker orb landmark (district plaza center)
  SPEAKER_ORB_RADIUS: 3.2,
  SPEAKER_PULSE_SPEED: 0.6,
  SPEAKER_EMISSIVE_BASE: 0.9,
  SPEAKER_EMISSIVE_RANGE: 0.5,

  // Bloom-safe emissive levels
  BLOOM_THRESHOLD: 0.85,
  SIGN_EMISSIVE: 1.4,
  TRIM_EMISSIVE: 0.4,            // stays under threshold, no bloom

  // Wonders
  WONDER_ARCH_RADIUS: 90,
  WONDER_ARCH_TUBE: 6,
  SPIRE_HEIGHT: 130,
  SPIRE_TUBE_COUNT: 9,
  VAULT_GIFT_COUNT: 10,
  VAULT_BOB_SPEED: 0.4,
  VAULT_BOB_AMP: 1.4,
  GARDEN_NUMERAL_COUNT: 9,
  GARDEN_RADIUS: 40,
  STAGE_RADIUS: 60,
  STAGE_RING_COUNT: 4,

  // Citizens (procedural humanoid rig pool + impostors)
  MAX_ACTIVE_RIGS: 24,
  IMPOSTOR_DIST: 55,             // beyond this, citizens become billboards
  CULL_DIST: 220,                // beyond this, citizens are not simulated
  CITIZEN_HEIGHT_MIN: 1.6,
  CITIZEN_HEIGHT_MAX: 2.0,
  EMPLOYEE_RATIO: 0.4,           // fraction of citizens who are employees
  WANDER_SPEED_MIN: 0.6,
  WANDER_SPEED_MAX: 1.4,
  QUEST_CHANCE: 0.18,

  // Ambient hold-music motes
  MOTE_COUNT: 220,
  MOTE_RISE_SPEED: 0.35,
  MOTE_DRIFT_RADIUS: 1.2,
  MOTE_SIZE: 0.18,

  // Palette (shared magenta/teal/amber signature + department accents)
  COLORS: {
    magenta: 0xd4408f,
    teal: 0x40d4c8,
    amber: 0xffb347,
    terrazzo: 0x8f8a92,
    concourseCarpet: 0x6a4a52,
    skyLavender: 0xb6a3c9,
  },

  DEPARTMENTS: [
    { name: 'HOME DECOR',    accent: 0xffb347 },
    { name: 'GLASTELLE',     accent: 0xff8a33 },
    { name: 'ELECTRONICS',   accent: 0x40b0ff },
    { name: 'XAVIER',        accent: 0xffffff },
    { name: 'CASUALWEAR',    accent: 0xff5fa8 },
    { name: 'RAMDA',         accent: 0xffd23f },
    { name: 'SPORTING GOODS',accent: 0x40d4c8 },
    { name: 'FELUZIA',       accent: 0x7bff8a },
  ],
};

/* ----------------------------------------------------------------------
 * Deterministic PRNG
 * ------------------------------------------------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

/* ----------------------------------------------------------------------
 * Canvas-generated textures (no external assets)
 * ------------------------------------------------------------------- */
function makeSignTexture(text, colorHex, w = 256, h = 64) {
  const cnv = document.createElement('canvas');
  cnv.width = w; cnv.height = h;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  const col = '#' + colorHex.toString(16).padStart(6, '0');
  ctx.fillStyle = col;
  ctx.font = `bold ${Math.floor(h * 0.5)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(cnv);
  tex.needsUpdate = true;
  return tex;
}

function makeCarpetTexture(baseHex, accentHex, size = 128) {
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = '#' + baseHex.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#' + accentHex.toString(16).padStart(6, '0');
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  for (let i = 0; i < size; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.needsUpdate = true;
  return tex;
}

/* ----------------------------------------------------------------------
 * Placement helpers â€” unrotated object space on planet.surface
 * ------------------------------------------------------------------- */
const _yAxis = new THREE.Vector3(0, 1, 0);
// dirLocal is already in planet.surface's UNROTATED local frame (the host
// hands us a surface-local up), so no world-quaternion un-rotation here —
// applying one would rotate everything by the accumulated spin angle.
function orientOnSurface(obj, planet, dirLocal, yawRad = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(_yAxis, dirLocal);
  const yawQ = new THREE.Quaternion().setFromAxisAngle(_yAxis, yawRad);
  obj.quaternion.copy(q).multiply(yawQ);
}

// Full radial distance to the terrain along a surface-local direction.
// groundAtLocal (not groundAt) because dirLocal is already un-rotated;
// placeAtDir multiplies by this, so it must be a radius, not a height.
function sampleGround(planet, dirLocal) {
  if (planet.body && planet.body.groundAtLocal) {
    return (planet.radius ?? 900) + planet.body.groundAtLocal(dirLocal);
  }
  return planet.radius ?? 900;
}

function placeAtDir(obj, planet, dirLocal, heightOffset = 0) {
  const r = sampleGround(planet, dirLocal) + heightOffset;
  obj.position.copy(dirLocal).multiplyScalar(r);
}

/* ----------------------------------------------------------------------
 * TASK A â€” Department districts (mall city districts)
 * ------------------------------------------------------------------- */
function buildDistrict(planet, worldUp, dept, index, rng, opts) {
  const group = new THREE.Group();
  group.name = `district_${dept.name}`;

  const angle = (index / C.DISTRICT_COUNT) * Math.PI * 2;
  // Ring the districts a full footprint out from the concourse so their
  // C.DISTRICT_RADIUS floors don't pile on top of each other at center.
  const distFromCenter = C.DISTRICT_RADIUS * 2 + C.DISTRICT_RING_GAP;

  // Local tangent frame around worldUp for district offset placement
  const arbitrary = Math.abs(worldUp.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const tangentA = new THREE.Vector3().crossVectors(worldUp, arbitrary).normalize();
  const tangentB = new THREE.Vector3().crossVectors(worldUp, tangentA).normalize();

  const offsetDir = tangentA.clone().multiplyScalar(Math.cos(angle))
    .add(tangentB.clone().multiplyScalar(Math.sin(angle)))
    .multiplyScalar(Math.sin(distFromCenter / (planet.radius ?? 900)));
  const dirLocal = worldUp.clone().multiplyScalar(Math.cos(distFromCenter / (planet.radius ?? 900)))
    .add(offsetDir).normalize();

  // Carpet-concourse floor patch
  const carpetTex = makeCarpetTexture(C.COLORS.concourseCarpet, dept.accent);
  const floorGeo = new THREE.CircleGeometry(C.DISTRICT_RADIUS, 24);
  floorGeo.rotateX(-Math.PI / 2); // CircleGeometry faces +Z; lie it flat under +Y-up
  const floorMat = new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.95 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  orientOnSurface(floor, planet, dirLocal);
  placeAtDir(floor, planet, dirLocal, 0.05);
  group.add(floor);

  // Storefront/spire buildings â€” merged static geometry per district
  const buildingGeos = [];
  const buildingMats = [];
  const signMeshes = [];
  const colliders = [];

  for (let i = 0; i < C.BUILDINGS_PER_DISTRICT; i++) {
    const w = C.BUILDING_MIN_W + rng() * (C.BUILDING_MAX_W - C.BUILDING_MIN_W);
    const d = w * (0.7 + rng() * 0.4);
    const h = C.BUILDING_MIN_H + rng() * (C.BUILDING_MAX_H - C.BUILDING_MIN_H);
    const ringR = 20 + (i / C.BUILDINGS_PER_DISTRICT) * (C.DISTRICT_RADIUS - 25);
    const a2 = rng() * Math.PI * 2;

    const localX = Math.cos(a2) * ringR;
    const localZ = Math.sin(a2) * ringR;

    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(localX, h / 2, localZ);
    buildingGeos.push(geo);

    colliders.push({
      type: 'cylinder',
      center: new THREE.Vector3(localX, 0, localZ), // local; host transforms to world
      radius: Math.max(w, d) * 0.55,
      height: h,
      districtIndex: index,
    });

    // Rooftop sign
    const signTex = makeSignTexture(dept.name, dept.accent, 256, 48);
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissive: new THREE.Color(dept.accent),
      emissiveIntensity: C.SIGN_EMISSIVE,
      transparent: true,
    });
    const signGeo = new THREE.PlaneGeometry(w * 0.9, h * 0.18);
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(localX, h + h * 0.12, localZ);
    signMeshes.push(sign);
  }

  const mergedBuildingGeo = mergeGeometries(buildingGeos, false);
  const buildingMat = new THREE.MeshStandardMaterial({
    color: C.COLORS.terrazzo,
    roughness: 0.7,
    metalness: 0.1,
    emissive: new THREE.Color(dept.accent),
    emissiveIntensity: C.TRIM_EMISSIVE,
  });
  const buildingsMesh = new THREE.Mesh(mergedBuildingGeo, buildingMat);
  orientOnSurface(buildingsMesh, planet, dirLocal);
  placeAtDir(buildingsMesh, planet, dirLocal, 0.05);
  group.add(buildingsMesh);

  const signsGroup = new THREE.Group();
  signMeshes.forEach((s) => signsGroup.add(s));
  orientOnSurface(signsGroup, planet, dirLocal);
  placeAtDir(signsGroup, planet, dirLocal, 0.05);
  group.add(signsGroup);

  // Speaker orb â€” plaza centerpiece landmark
  const orbGeo = new THREE.IcosahedronGeometry(C.SPEAKER_ORB_RADIUS, 2);
  const orbMat = new THREE.MeshPhysicalMaterial({
    color: dept.accent,
    emissive: new THREE.Color(dept.accent),
    emissiveIntensity: C.SPEAKER_EMISSIVE_BASE,
    transparent: true,
    opacity: 0.85,
    roughness: 0.2,
    transmission: 0.4,
  });
  const orb = new THREE.Mesh(orbGeo, orbMat);
  orb.position.set(0, C.SPEAKER_ORB_RADIUS * 1.6, 0);
  const orbAnchor = new THREE.Group();
  orbAnchor.add(orb);
  orientOnSurface(orbAnchor, planet, dirLocal);
  placeAtDir(orbAnchor, planet, dirLocal, 0.05);
  group.add(orbAnchor);

  return {
    group,
    orbMaterial: orbMat,
    dirLocal,
    colliders,
    plazaWorldPos: orbAnchor.position.clone(),
    accent: dept.accent,
  };
}

export function createDepartmentDistrict(planet, worldUp, opts = {}) {
  const seed = hashSeed((opts.seedKey ?? 'wavemallprime') + '::districts');
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'wavemall_districts';

  const districts = C.DEPARTMENTS.map((dept, i) => buildDistrict(planet, worldUp, dept, i, rng, opts));
  districts.forEach((d) => group.add(d.group));

  const colliders = [];
  districts.forEach((d) => {
    d.colliders.forEach((c) => colliders.push({ ...c, districtDir: d.dirLocal }));
  });

  const boardingPad = districts[0].plazaWorldPos.clone();

  function update(t) {
    districts.forEach((d, i) => {
      const phase = t * C.SPEAKER_PULSE_SPEED + i * 0.7;
      d.orbMaterial.emissiveIntensity =
        C.SPEAKER_EMISSIVE_BASE + Math.sin(phase) * C.SPEAKER_EMISSIVE_RANGE * 0.5 + C.SPEAKER_EMISSIVE_RANGE * 0.5;
    });
  }

  function groundHeightAt(surfaceLocalPos) {
    // Delegate to planet's own terrain sampling; districts sit flush with it.
    if (planet.body && planet.body.groundAtLocal) {
      const dir = surfaceLocalPos.clone().normalize();
      return sampleGround(planet, dir);
    }
    return planet.radius ?? 900;
  }

  function dispose() {
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  }

  return { group, update, sunDot: 1, dispose, colliders, groundHeightAt, boardingPad, districts };
}

/* ----------------------------------------------------------------------
 * TASK B â€” Signature wonders
 * ------------------------------------------------------------------- */
function buildWaveSpaceArch(rng) {
  const group = new THREE.Group();
  const torusGeo = new THREE.TorusGeometry(C.WONDER_ARCH_RADIUS, C.WONDER_ARCH_TUBE, 12, 48, Math.PI);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a2430,
    emissive: new THREE.Color(C.COLORS.magenta),
    emissiveIntensity: 0.5,
    metalness: 0.3,
    roughness: 0.6,
  });
  const arch = new THREE.Mesh(torusGeo, mat);
  arch.rotation.x = Math.PI / 2;
  arch.position.y = C.WONDER_ARCH_RADIUS;
  group.add(arch);
  return { group, mat };
}

function buildGlastelleSpire(rng) {
  const group = new THREE.Group();
  const coreGeo = new THREE.ConeGeometry(10, C.SPIRE_HEIGHT, 8);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x3a2f38, roughness: 0.5 });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = C.SPIRE_HEIGHT / 2;
  group.add(core);

  const tubeMats = [];
  for (let i = 0; i < C.SPIRE_TUBE_COUNT; i++) {
    const h = C.SPIRE_HEIGHT * (0.3 + rng() * 0.6);
    const r = 1.2 + rng() * 0.8;
    const geo = new THREE.CapsuleGeometry(r, h * 0.5, 4, 8);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffb347,
      emissive: new THREE.Color(0xff8a33),
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.6,
      roughness: 0.1,
      transmission: 0.6,
    });
    const tube = new THREE.Mesh(geo, mat);
    const a = rng() * Math.PI * 2;
    const rad = 6 + rng() * 6;
    tube.position.set(Math.cos(a) * rad, h * 0.6, Math.sin(a) * rad);
    group.add(tube);
    tubeMats.push(mat);
  }
  return { group, tubeMats };
}

function buildXavierVault(rng) {
  const group = new THREE.Group();
  const gifts = [];
  for (let i = 0; i < C.VAULT_GIFT_COUNT; i++) {
    const s = 1.5 + rng() * 2;
    const geo = new THREE.BoxGeometry(s, s, s);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf2f2f2,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.3,
      metalness: 0.2,
      roughness: 0.4,
    });
    const gift = new THREE.Mesh(geo, mat);
    const a = (i / C.VAULT_GIFT_COUNT) * Math.PI * 2;
    const rad = 14 + rng() * 10;
    gift.position.set(Math.cos(a) * rad, 6 + rng() * 10, Math.sin(a) * rad);
    gift.userData.bobPhase = rng() * Math.PI * 2;
    gift.userData.baseY = gift.position.y;
    group.add(gift);
    gifts.push(gift);
  }
  return { group, gifts };
}

function buildRamdaGarden(rng) {
  const group = new THREE.Group();
  const numerals = [];
  for (let i = 1; i <= C.GARDEN_NUMERAL_COUNT; i++) {
    const h = 4 + i * 1.2;
    const geo = new THREE.CylinderGeometry(0.8, 0.8, h, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a3020,
      emissive: new THREE.Color(0xffd23f),
      emissiveIntensity: 0.9,
    });
    const pillar = new THREE.Mesh(geo, mat);
    const a = (i / C.GARDEN_NUMERAL_COUNT) * Math.PI * 2;
    pillar.position.set(Math.cos(a) * C.GARDEN_RADIUS, h / 2, Math.sin(a) * C.GARDEN_RADIUS);
    pillar.userData.pulsePhase = i * 0.6;
    group.add(pillar);
    numerals.push({ mesh: pillar, mat });
  }
  return { group, numerals };
}

function buildFeluziaStage(rng) {
  const group = new THREE.Group();
  const daisGeo = new THREE.CylinderGeometry(C.STAGE_RADIUS * 0.4, C.STAGE_RADIUS * 0.4, 2, 32);
  const daisMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 });
  const dais = new THREE.Mesh(daisGeo, daisMat);
  dais.position.y = 1;
  group.add(dais);

  const ringMats = [];
  for (let i = 0; i < C.STAGE_RING_COUNT; i++) {
    const r = C.STAGE_RADIUS * 0.5 + i * (C.STAGE_RADIUS * 0.15);
    const geo = new THREE.TorusGeometry(r, 0.6, 8, 48);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a1a12,
      emissive: new THREE.Color(0x7bff8a),
      emissiveIntensity: 1.0,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    group.add(ring);
    ringMats.push(mat);
  }
  return { group, ringMats };
}

export function createWonder(type, planet, worldUp, opts = {}) {
  const seed = hashSeed((opts.seedKey ?? 'wavemallprime') + '::wonder::' + type);
  const rng = mulberry32(seed);
  let built;
  let collider = null;

  switch (type) {
    case 'wavespace_arch':
      built = buildWaveSpaceArch(rng);
      collider = { type: 'ring', radius: C.WONDER_ARCH_RADIUS, tube: C.WONDER_ARCH_TUBE };
      break;
    case 'glastelle_spire':
      built = buildGlastelleSpire(rng);
      collider = { type: 'cylinder', radius: 12, height: C.SPIRE_HEIGHT };
      break;
    case 'xavier_vault':
      built = buildXavierVault(rng);
      collider = { type: 'cylinder', radius: 26, height: 20 };
      break;
    case 'ramda_garden':
      built = buildRamdaGarden(rng);
      collider = { type: 'cylinder', radius: C.GARDEN_RADIUS + 4, height: 16 };
      break;
    case 'feluzia_stage':
      built = buildFeluziaStage(rng);
      collider = { type: 'cylinder', radius: C.STAGE_RADIUS, height: 4 };
      break;
    default:
      built = { group: new THREE.Group() };
  }

  const dirLocal = opts.dirLocal ?? worldUp.clone();
  orientOnSurface(built.group, planet, dirLocal);
  placeAtDir(built.group, planet, dirLocal, 0.05);

  function update(t, sunDot = 1) {
    const dim = Math.max(0.25, sunDot);
    if (type === 'xavier_vault') {
      built.gifts.forEach((g) => {
        g.position.y = g.userData.baseY + Math.sin(t * C.VAULT_BOB_SPEED + g.userData.bobPhase) * C.VAULT_BOB_AMP;
      });
    } else if (type === 'ramda_garden') {
      built.numerals.forEach(({ mat }, i) => {
        mat.emissiveIntensity = (0.6 + Math.sin(t * 0.8 + i) * 0.4) * dim;
      });
    } else if (type === 'feluzia_stage') {
      built.ringMats.forEach((m, i) => {
        m.emissiveIntensity = (0.8 + Math.sin(t * 1.2 + i * 0.9) * 0.3) * dim;
      });
    } else if (type === 'glastelle_spire') {
      built.tubeMats.forEach((m, i) => {
        m.emissiveIntensity = (0.4 + Math.sin(t * 0.5 + i) * 0.2) * dim;
      });
    } else if (type === 'wavespace_arch') {
      built.mat.emissiveIntensity = (0.4 + Math.sin(t * 0.9) * 0.2) * dim;
    }
  }

  function dispose() {
    built.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }

  return { group: built.group, update, sunDot: 1, dispose, collider };
}

export function createWonderField(planet, worldUp, opts = {}) {
  const seed = hashSeed((opts.seedKey ?? 'wavemallprime') + '::wonderfield');
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'wavemall_wonders';

  const types = ['wavespace_arch', 'glastelle_spire', 'xavier_vault', 'ramda_garden', 'feluzia_stage'];
  const arbitrary = Math.abs(worldUp.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const tangentA = new THREE.Vector3().crossVectors(worldUp, arbitrary).normalize();
  const tangentB = new THREE.Vector3().crossVectors(worldUp, tangentA).normalize();

  const wonders = types.map((type, i) => {
    const angle = (i / types.length) * Math.PI * 2 + rng() * 0.3;
    const dist = 300 + rng() * 200;
    const offsetDir = tangentA.clone().multiplyScalar(Math.cos(angle))
      .add(tangentB.clone().multiplyScalar(Math.sin(angle)))
      .multiplyScalar(Math.sin(dist / (planet.radius ?? 900)));
    const dirLocal = worldUp.clone().multiplyScalar(Math.cos(dist / (planet.radius ?? 900)))
      .add(offsetDir).normalize();
    const w = createWonder(type, planet, worldUp, { ...opts, dirLocal, seedKey: (opts.seedKey ?? 'wavemallprime') + i });
    group.add(w.group);
    return w;
  });

  function update(t, sunDot = 1) {
    wonders.forEach((w) => w.update(t, sunDot));
  }
  function dispose() {
    wonders.forEach((w) => w.dispose());
  }

  return { group, update, dispose, wonders };
}

/* ----------------------------------------------------------------------
 * TASK C â€” Employees & wandering callers
 * ------------------------------------------------------------------- */
const DIALOGUE_BANK = {
  employeeGreeting: [
    'Your satisfaction is our directive.',
    'How may Wave Mall serve you today?',
    'Every transfer is an opportunity for excellence.',
  ],
  callerFragment: [
    'I was just on hold...',
    'I think I ordered something. I forget what.',
    'They said an operator was coming. That was a while ago.',
    'Do you know where Feluzia\'s stage is? I want to see how it ends.',
  ],
  farewell: [
    'Your call is important to us.',
    'Please hold. Please hold. Pleaseâ€”',
    'Thank you for shopping at Wave Mall.',
  ],
};

function buildHumanoidRig(rng, isEmployee, accent) {
  const group = new THREE.Group();
  const height = C.CITIZEN_HEIGHT_MIN + rng() * (C.CITIZEN_HEIGHT_MAX - C.CITIZEN_HEIGHT_MIN);
  const skinHex = isEmployee ? 0xd9c7b8 : 0xc9b8cf;

  const torso = new THREE.Group();
  const torsoMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(height * 0.14, height * 0.35, 4, 8),
    new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.8 })
  );
  torsoMesh.position.y = height * 0.55;
  torso.add(torsoMesh);

  const head = new THREE.Mesh(
    new THREE.IcosahedronGeometry(height * 0.09, 1),
    new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.7 })
  );
  head.position.y = height * 0.85;
  torso.add(head);

  if (isEmployee) {
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(height * 0.06, height * 0.03),
      new THREE.MeshStandardMaterial({
        color: accent,
        emissive: new THREE.Color(accent),
        emissiveIntensity: 0.5,
      })
    );
    badge.position.set(height * 0.08, height * 0.6, height * 0.1);
    torso.add(badge);
  } else {
    const slip = new THREE.Mesh(
      new THREE.PlaneGeometry(height * 0.05, height * 0.08),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: new THREE.Color(C.COLORS.teal),
        emissiveIntensity: 0.3,
      })
    );
    slip.position.set(height * 0.12, height * 0.4, height * 0.05);
    torso.add(slip);
  }

  const legL = new THREE.Mesh(
    new THREE.CapsuleGeometry(height * 0.05, height * 0.35, 4, 6),
    new THREE.MeshStandardMaterial({ color: 0x2a2530 })
  );
  legL.position.set(-height * 0.06, height * 0.2, 0);
  const legR = legL.clone();
  legR.position.x = height * 0.06;

  group.add(torso, legL, legR);
  group.userData = { torso, legL, legR, height };
  return group;
}

export function createCrowd(host, opts = {}) {
  const seed = hashSeed((opts.seedKey ?? 'wavemallprime') + '::crowd');
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'wavemall_crowd';

  const count = opts.count ?? 60;
  let simT = 0; // accumulated sim time — drives leg swing (dt alone is ~constant)
  const citizens = [];
  const activePool = [];
  const impostorGeo = new THREE.SphereGeometry(0.4, 4, 4);
  const impostorMat = new THREE.MeshStandardMaterial({ color: 0xd0c0d0 });
  const impostorMesh = new THREE.InstancedMesh(impostorGeo, impostorMat, count);
  impostorMesh.frustumCulled = false;
  group.add(impostorMesh);

  for (let i = 0; i < count; i++) {
    const isEmployee = rng() < C.EMPLOYEE_RATIO;
    const accent = C.DEPARTMENTS[Math.floor(rng() * C.DEPARTMENTS.length)].accent;
    const speed = C.WANDER_SPEED_MIN + rng() * (C.WANDER_SPEED_MAX - C.WANDER_SPEED_MIN);
    const angle = rng() * Math.PI * 2;
    const dist = rng() * (host.radius ?? C.DISTRICT_RADIUS);
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    const hasQuest = rng() < C.QUEST_CHANCE;

    citizens.push({
      id: i,
      isEmployee,
      accent,
      speed,
      pos,
      waypoint: pos.clone(),
      phase: rng() * Math.PI * 2,
      rig: null,
      quest: hasQuest
        ? { kind: 'codex', subject: `wavemall-lore-${i}`, }
        : null,
      seed: rng() * 1000,
    });
  }

  function pickWaypoint(c) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * (host.radius ?? C.DISTRICT_RADIUS);
    c.waypoint.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
  }

  function ensureRig(c) {
    if (c.rig) return;
    if (activePool.length >= C.MAX_ACTIVE_RIGS) return;
    const rig = buildHumanoidRig(mulberry32(c.seed | 0), c.isEmployee, c.accent);
    group.add(rig);
    c.rig = rig;
    activePool.push(c);
  }

  function releaseRig(c) {
    if (!c.rig) return;
    // buildHumanoidRig allocates fresh geometry/materials per citizen; free
    // them here so cycling rigs through the pool doesn't leak (double-dispose
    // from legR = legL.clone() sharing geometry is safe).
    c.rig.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    group.remove(c.rig);
    c.rig = null;
    const idx = activePool.indexOf(c);
    if (idx >= 0) activePool.splice(idx, 1);
  }

  function update(dt, playerPos, sunDot = 1) {
    simT += dt;
    let idx = 0;
    citizens.forEach((c) => {
      // A citizen in dialogue holds still so the speaker doesn't wander off.
      if (!c.talking) {
        const toWaypoint = c.waypoint.clone().sub(c.pos);
        const dist = toWaypoint.length();
        if (dist < 1) pickWaypoint(c);
        else {
          toWaypoint.normalize().multiplyScalar(c.speed * dt);
          c.pos.add(toWaypoint);
        }
      }

      const distToPlayer = playerPos ? c.pos.distanceTo(playerPos) : Infinity;

      // Conform to terrain height (curvature + terrain), only near the player
      // to bound cost — far citizens stay at their disc y and never draw.
      if (host.groundHeightAt && distToPlayer < C.CULL_DIST) {
        c.pos.y = host.groundHeightAt(c.pos.x, c.pos.z);
      }

      if (distToPlayer < C.IMPOSTOR_DIST && distToPlayer < C.CULL_DIST) {
        ensureRig(c);
        if (c.rig) {
          c.rig.position.copy(c.pos);
          const swing = c.talking ? 0 : Math.sin(simT * 6 + c.phase) * 0.3;
          c.rig.userData.legL.rotation.x = swing;
          c.rig.userData.legR.rotation.x = -swing;
        }
      } else {
        releaseRig(c);
      }

      if (distToPlayer < C.CULL_DIST) {
        impostorMesh.setMatrixAt(idx, new THREE.Matrix4().setPosition(c.pos));
        impostorMesh.setColorAt(idx, new THREE.Color(c.accent).multiplyScalar(Math.max(0.3, sunDot)));
        idx++;
      }
    });
    impostorMesh.count = idx;
    impostorMesh.instanceMatrix.needsUpdate = true;
    if (impostorMesh.instanceColor) impostorMesh.instanceColor.needsUpdate = true;
  }

  function nearestInteractable(playerPos, maxDist = 4) {
    let best = null, bestD = maxDist;
    citizens.forEach((c) => {
      const d = c.pos.distanceTo(playerPos);
      if (d < bestD) { bestD = d; best = c; }
    });
    return best;
  }

  function interact(citizen) {
    citizen.talking = true;
    const bank = citizen.isEmployee ? DIALOGUE_BANK.employeeGreeting : DIALOGUE_BANK.callerFragment;
    const rngLocal = mulberry32(citizen.seed | 0);
    const line = bank[Math.floor(rngLocal() * bank.length)];
    const farewell = DIALOGUE_BANK.farewell[Math.floor(rngLocal() * DIALOGUE_BANK.farewell.length)];
    // Host dialogue renderer (src/dialogue.js) reads speaker.name/.species/
    // .cityId — speaker must be an object, not a bare string.
    return {
      speaker: {
        name: citizen.isEmployee ? 'Wave Mall Employee' : 'Caller',
        species: 'human-adjacent',
        cityId: 'wavemall prime',
      },
      lines: [line, farewell],
      offer: citizen.quest ?? undefined,
    };
  }

  // Contract-required release (idempotent, stale-safe): frees the talk pose so
  // the citizen resumes wandering when the dialogue closes.
  function endInteract(citizen) {
    if (citizen) citizen.talking = false;
  }

  function dispose() {
    citizens.forEach((c) => releaseRig(c));
    impostorGeo.dispose();
    impostorMat.dispose();
  }

  return { group, update, sunDot: 1, dispose, count, nearestInteractable, interact, endInteract, citizens };
}

/* ----------------------------------------------------------------------
 * TASK D â€” Ambient hold-music atmosphere (motes + tone)
 * ------------------------------------------------------------------- */
export function createHoldMusicField(planet, worldUp, opts = {}) {
  const seed = hashSeed((opts.seedKey ?? 'wavemallprime') + '::holdmusic');
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'wavemall_holdmusic';

  const moteGeo = new THREE.SphereGeometry(C.MOTE_SIZE, 4, 4);
  const moteMat = new THREE.MeshStandardMaterial({
    color: C.COLORS.magenta,
    emissive: new THREE.Color(C.COLORS.magenta),
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.7,
  });
  const motes = new THREE.InstancedMesh(moteGeo, moteMat, C.MOTE_COUNT);
  motes.frustumCulled = false;

  const moteData = [];
  for (let i = 0; i < C.MOTE_COUNT; i++) {
    moteData.push({
      basePos: new THREE.Vector3(
        (rng() - 0.5) * C.DISTRICT_RADIUS * C.DISTRICT_COUNT * 0.3,
        rng() * 8,
        (rng() - 0.5) * C.DISTRICT_RADIUS * C.DISTRICT_COUNT * 0.3
      ),
      phase: rng() * Math.PI * 2,
      speed: 0.5 + rng() * 0.5,
    });
  }

  let audioCtx = null;
  let osc = null;
  let gainNode = null;

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      osc = audioCtx.createOscillator();
      gainNode = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 220;
      gainNode.gain.value = 0.02;
      osc.connect(gainNode).connect(audioCtx.destination);
      osc.start();
      // Contexts created outside a gesture handler can start suspended.
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    } catch (e) {
      audioCtx = null;
    }
  }

  function update(t, nearestDistrictIndex = 0) {
    const matrix = new THREE.Matrix4();
    moteData.forEach((m, i) => {
      const y = m.basePos.y + ((t * C.MOTE_RISE_SPEED * m.speed + m.phase) % 8);
      const wobble = Math.sin(t * m.speed + m.phase) * C.MOTE_DRIFT_RADIUS;
      matrix.setPosition(m.basePos.x + wobble, y, m.basePos.z);
      motes.setMatrixAt(i, matrix);
    });
    motes.instanceMatrix.needsUpdate = true;

    if (osc) {
      const targetFreq = 200 + nearestDistrictIndex * 8;
      osc.frequency.value += (targetFreq - osc.frequency.value) * 0.02;
    }
  }

  function dispose() {
    moteGeo.dispose();
    moteMat.dispose();
    if (osc) { osc.stop(); osc.disconnect(); }
    if (gainNode) gainNode.disconnect();
    if (audioCtx) audioCtx.close();
  }

  group.add(motes);
  return { group, update, dispose, initAudio };
}

/* ----------------------------------------------------------------------
 * Top-level orchestrator â€” createWavemallPrime
 * ------------------------------------------------------------------- */
export function createWavemallPrime(planet, worldUp, opts = {}) {
  const seedKey = opts.seedKey ?? 'wavemallprime';
  const group = new THREE.Group();
  group.name = 'wavemallprime';

  const districts = createDepartmentDistrict(planet, worldUp, { ...opts, seedKey });
  const wonders = createWonderField(planet, worldUp, { ...opts, seedKey });

  // Landing-point anchor. Districts and wonders place each feature along its
  // own direction, but the crowd and hold-music motes are built around a local
  // origin — their groups must be moved/oriented to the actual landing site.
  const anchorDir = worldUp.clone().normalize();
  const anchorPos = anchorDir.clone().multiplyScalar(sampleGround(planet, anchorDir));
  const anchorQ = new THREE.Quaternion().setFromUnitVectors(_yAxis, anchorDir);
  const _gp = new THREE.Vector3();

  const crowd = createCrowd(
    {
      radius: C.DISTRICT_RADIUS + C.DISTRICT_RING_GAP, // wander the central concourse
      // Terrain height (curvature drop + terrain) for a crowd-local (x, z),
      // expressed back in the crowd's own local frame.
      groundHeightAt: (x, z) => {
        _gp.set(x, 0, z).applyQuaternion(anchorQ).add(anchorPos); // -> surface-local
        const r = _gp.length();
        if (r < 1e-6) return 0;
        _gp.multiplyScalar(1 / r);
        const gR = sampleGround(planet, _gp);
        return gR * _gp.dot(anchorDir) - anchorPos.length();
      },
    },
    { ...opts, seedKey, count: opts.crowdCount ?? 80 }
  );
  const holdMusic = createHoldMusicField(planet, worldUp, { ...opts, seedKey });

  crowd.group.position.copy(anchorPos);
  crowd.group.quaternion.copy(anchorQ);
  holdMusic.group.position.copy(anchorPos);
  holdMusic.group.quaternion.copy(anchorQ);

  group.add(districts.group, wonders.group, crowd.group, holdMusic.group);

  function update(t, dt, playerPos, sunDot = 1) {
    districts.update(t);
    wonders.update(t, sunDot);
    crowd.update(dt, playerPos, sunDot);
    holdMusic.update(t);
  }

  function nearestInteractable(playerPos, maxDist = 4) {
    return crowd.nearestInteractable(playerPos, maxDist);
  }
  function interact(citizen) {
    return crowd.interact(citizen);
  }

  // Storefront wall push-out. Each collider lives in its district's tangent
  // frame (center is pre-transform local x/0/z); cache that frame per district
  // so a surface-local player point can be moved into it, pushed, and moved
  // back. Mutates surfaceLocalPos in place; returns true if it was pushed.
  const _districtFrames = new Map();
  function districtFrame(index, dir) {
    let f = _districtFrames.get(index);
    if (!f) {
      const q = new THREE.Quaternion().setFromUnitVectors(_yAxis, dir);
      const pos = dir.clone().multiplyScalar(sampleGround(planet, dir));
      f = { q, qInv: q.clone().invert(), pos };
      _districtFrames.set(index, f);
    }
    return f;
  }
  const _rcLocal = new THREE.Vector3();
  function resolveCollisions(surfaceLocalPos, playerRadius) {
    let pushed = false;
    const cols = districts.colliders;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const f = districtFrame(c.districtIndex, c.districtDir);
      _rcLocal.copy(surfaceLocalPos).sub(f.pos).applyQuaternion(f.qInv);
      if (_rcLocal.y > c.height - 0.3) continue; // feet above the roof: no wall
      const dx = _rcLocal.x - c.center.x;
      const dz = _rcLocal.z - c.center.z;
      const rr = c.radius + playerRadius;
      const dd = dx * dx + dz * dz;
      if (dd < rr * rr && dd > 1e-6) {
        const dist = Math.sqrt(dd);
        const push = rr - dist;
        _rcLocal.x += (dx / dist) * push;
        _rcLocal.z += (dz / dist) * push;
        surfaceLocalPos.copy(_rcLocal).applyQuaternion(f.q).add(f.pos);
        pushed = true;
      }
    }
    return pushed;
  }
  function endInteract(citizen) {
    crowd.endInteract(citizen);
  }

  function dispose() {
    districts.dispose();
    wonders.dispose();
    crowd.dispose();
    holdMusic.dispose();
  }

  return {
    group,
    update,
    sunDot: 1,
    dispose,
    colliders: districts.colliders,
    groundHeightAt: districts.groundHeightAt,
    boardingPad: districts.boardingPad,
    nearestInteractable,
    interact,
    endInteract,
    resolveCollisions,
    districts,
    wonders,
    crowd,
    holdMusic,
  };
}