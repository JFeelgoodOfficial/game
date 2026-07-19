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
import { makeStructure } from './city.js';

/* ----------------------------------------------------------------------
 * Tunables â€” every magic number lives here.
 * ------------------------------------------------------------------- */
const C = {
  // District layout — each district is a mall "wing": a carpeted plaza ringed
  // by giant single-floor retail stores, open toward the mall center.
  DISTRICT_RADIUS: 110,          // footprint radius per department wing (m)
  DISTRICT_COUNT: 8,             // one per album department
  DISTRICT_RING_DIST: 260,       // wing anchors this far from the landing point
  CROWD_RADIUS: 180,             // central-concourse wander disc for citizens

  // Retail stores (single-floor big-box buildings around each plaza)
  STORE_H_MIN: 7,                // storefront height range (single story, tall)
  STORE_H_MAX: 10,
  STORE_FLOOR_LIFT: 0.6,         // slab top above draped ground (2 entry steps)
  STORE_DOOR_HALF: 2.0,          // half-width of the entrance gap
  STORE_DOOR_H: 3.4,             // entrance clearance
  STORE_WALL_T: 0.5,             // wall thickness (AABB walls, door gap jambs)
  ENTERABLE_PER_DISTRICT: 2,     // stores with a real lobby you can walk into
  PLAZA_HALF: 30,                // store fronts sit this far from plaza center

  // Grand entrance + crystalline anchor (landing-site set dressing)
  ENTRANCE_DIST: 60,             // arch this far from the landing anchor
  ENTRANCE_SPAN: 11,             // pylon half-spacing (walk-through gap)
  ENTRANCE_H: 13,                // beam height
  ANCHOR_DIST: 48,               // crystal centerpiece offset (opposite side)
  ANCHOR_CRYSTALS: 6,

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
    concourseCarpet: 0x5e2432,
    skyLavender: 0xb6a3c9,
  },

  // Each department wing draws its storefront tenants (without replacement)
  // from its own curated name pool; the department name itself lives on the
  // wing's directory sign, mall-wayfinding style.
  DEPARTMENTS: [
    { name: 'HOME DECOR',    accent: 0xffb347,
      tagline: 'furniture · lighting · rugs · wall art · plants',
      stores: ['NEBULA NEST', 'ORBIT & OAK', 'LUMEN LIVING', 'THE VELVET VOID',
               'HEARTHLIGHT', 'PLUSH PULSAR', 'DRIFTWOOD & STARS'] },
    { name: 'GLASTELLE',     accent: 0xff8a33,
      tagline: 'orbital psychology · understand · harmony · ascend',
      stores: ['SYNAPSE BOOKS', 'MINDHIVE CAFE', 'EMOTIVA APPAREL', 'INNER ORBIT',
               'THE CALM CHAMBER', 'HARMONY HALL', 'GLASS MIND'] },
    { name: 'ELECTRONICS',   accent: 0x40b0ff,
      tagline: 'audio · holo · compute · repair',
      stores: ['NEUROSPARK', 'OCEANIC ELECTRONICS', 'CIRCUIT SONG', 'WAVEFORM & CO',
               'VOLTAIC', 'SIGNALWORKS', 'GIGAHERTZ GALLERY'] },
    { name: 'XAVIER',        accent: 0xffffff,
      tagline: 'gifts · wrapping · occasions',
      stores: ["XAVIER'S", 'THE GIFT NEXUS', 'WHITEBOX', 'RIBBON ROW',
               'KEEPSAKE COSMOS', 'PARCEL & PROMISE'] },
    { name: 'CASUALWEAR',    accent: 0xff5fa8,
      tagline: 'daywear · synthwear · denim',
      stores: ['LUCID DAYWEAR', 'SLYNK SYNTHWEAR', 'TEZZARO', 'DRIFTFIT',
               'COMET COTTON', 'ZERO-G DENIM'] },
    { name: 'RAMDA',         accent: 0xffd23f,
      tagline: 'timepieces · numerals · curios',
      stores: ['RAMDA & SONS', 'THE COUNTING HOUSE', 'GOLDEN RATIO', 'NUMERAL NOOK',
               'SUM & SUBSTANCE', 'ABACUS ATTIC'] },
    { name: 'SPORTING GOODS',accent: 0x40d4c8,
      tagline: 'zero-g gear · courts · trails',
      stores: ['APEX ASCENT', 'JETPACK JUNCTION', 'LOW-G LEAGUE', 'THE SWEAT SECTOR',
               'ORBITAL OUTFITTERS', 'VELOCITY VAULT'] },
    { name: 'FELUZIA',       accent: 0x7bff8a,
      tagline: 'music · merch · stagecraft',
      stores: ['FELUZIA LIVE', 'ENCORE', 'THE GREEN ROOM', 'AMP & ECHO',
               'STAGE DOOR SUPPLY', 'CRYSTALINA GEMS'] },
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
function hexCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

// Big glowing storefront lettering, drawn with a soft shadow-blur halo so the
// emissive map itself carries the neon falloff (bloom does the rest).
function glowText(ctx, text, x, y, px, colorCss, font = 'monospace') {
  ctx.font = `bold ${px}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = colorCss;
  ctx.shadowBlur = px * 0.45;
  ctx.fillStyle = colorCss;
  ctx.fillText(text, x, y);
  ctx.fillText(text, x, y); // second pass thickens the halo
  ctx.shadowBlur = 0;
}

function canvasTexture(cnv) {
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8; // driver clamps to hardware max
  tex.needsUpdate = true;
  return tex;
}

// One texture per district: every storefront's name on its own row, so all
// sign planes of a wing share a single material/draw call via row UVs.
// Returns { tex, rowV(i) -> [v0, v1] }.
function makeStorefrontSignAtlas(names, accentHex) {
  const w = 1024, rowH = 128;
  const cnv = document.createElement('canvas');
  cnv.width = w; cnv.height = rowH * names.length;
  const ctx = cnv.getContext('2d');
  const accent = hexCss(accentHex);
  names.forEach((name, i) => {
    const y0 = i * rowH;
    ctx.fillStyle = '#0d0a12'; // dark sign panel
    ctx.fillRect(0, y0, w, rowH);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 5;
    ctx.strokeRect(8, y0 + 8, w - 16, rowH - 16);
    ctx.globalAlpha = 1;
    // Shrink to fit the row for long tenant names.
    let px = 76;
    ctx.font = `bold ${px}px monospace`;
    while (ctx.measureText(name).width > w - 120 && px > 30) {
      px -= 4;
      ctx.font = `bold ${px}px monospace`;
    }
    glowText(ctx, name, w / 2, y0 + rowH / 2, px, accent);
  });
  const tex = canvasTexture(cnv);
  const n = names.length;
  // Canvas row 0 is the TOP; UV v runs bottom-up.
  return { tex, rowV: (i) => [1 - (i + 1) / n, 1 - i / n] };
}

// Lit display-window interior: warm glow gradient behind dark merchandise
// silhouettes, one flavor per department. Shared by every window of a wing.
function makeMerchandiseTexture(deptIndex, accentHex) {
  const w = 512, h = 256;
  const cnv = document.createElement('canvas');
  cnv.width = w; cnv.height = h;
  const ctx = cnv.getContext('2d');
  const glow = ctx.createLinearGradient(0, 0, 0, h);
  glow.addColorStop(0, '#ffc98a');
  glow.addColorStop(0.65, '#e08a3c');
  glow.addColorStop(1, '#7a3a1e');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  // Window mullions
  ctx.fillStyle = '#241820';
  ctx.fillRect(w / 2 - 5, 0, 10, h);
  ctx.fillRect(0, 0, 8, h); ctx.fillRect(w - 8, 0, 8, h);
  ctx.fillRect(0, 0, w, 6); ctx.fillRect(0, h - 10, w, 10);
  // A display shelf line + merchandise silhouettes, flavored per department.
  ctx.fillStyle = 'rgba(30, 18, 24, 0.85)';
  const shelfY = h * 0.72;
  ctx.fillRect(12, shelfY, w - 24, 8);
  const sil = (x, sw, sh) => ctx.fillRect(x, shelfY - sh, sw, sh);
  switch (deptIndex % 8) {
    case 0: // home decor: lamp + armchair + vase
      sil(60, 14, 90); ctx.fillRect(40, shelfY - 104, 54, 18); // floor lamp
      sil(180, 110, 56); ctx.fillRect(170, shelfY - 78, 20, 78); // armchair
      sil(360, 30, 48); sil(410, 22, 66);
      break;
    case 1: // glastelle: books + a head bust
      for (let x = 50; x < 220; x += 26) sil(x, 20, 60 + ((x * 7) % 28));
      ctx.beginPath(); ctx.arc(370, shelfY - 60, 34, 0, Math.PI * 2); ctx.fill();
      sil(348, 44, 30);
      break;
    case 2: // electronics: glowing device slabs
      sil(60, 90, 60); sil(190, 120, 76); sil(350, 80, 50);
      ctx.fillStyle = '#ffd9a8';
      ctx.fillRect(70, shelfY - 52, 70, 44); ctx.fillRect(202, shelfY - 68, 96, 60);
      ctx.fillStyle = 'rgba(30, 18, 24, 0.85)';
      break;
    case 3: // xavier: stacked gift boxes with ribbons
      sil(70, 80, 80); sil(180, 60, 60); sil(280, 100, 46); sil(400, 54, 70);
      ctx.fillStyle = '#ffe9c9';
      ctx.fillRect(106, shelfY - 80, 8, 80); ctx.fillRect(326, shelfY - 46, 8, 46);
      ctx.fillStyle = 'rgba(30, 18, 24, 0.85)';
      break;
    case 4: // casualwear: mannequins
      for (const x of [90, 250, 400]) {
        ctx.beginPath(); ctx.arc(x, shelfY - 116, 16, 0, Math.PI * 2); ctx.fill();
        sil(x - 26, 52, 96); ctx.fillRect(x - 6, shelfY - 12, 12, 12);
      }
      break;
    case 5: // ramda: clocks / numerals
      for (const x of [90, 240, 390]) {
        ctx.beginPath(); ctx.arc(x, shelfY - 64, 44, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffe9c9';
      for (const x of [90, 240, 390]) ctx.fillRect(x - 3, shelfY - 96, 6, 32);
      ctx.fillStyle = 'rgba(30, 18, 24, 0.85)';
      break;
    case 6: // sporting goods: balls + a jetpack silhouette
      for (const [x, r] of [[80, 30], [170, 22], [250, 36]]) {
        ctx.beginPath(); ctx.arc(x, shelfY - r, r, 0, Math.PI * 2); ctx.fill();
      }
      sil(350, 70, 96); sil(336, 14, 60); sil(434, 14, 60);
      break;
    default: // feluzia: guitars-on-stands / gems
      sil(80, 16, 100); ctx.beginPath(); ctx.arc(88, shelfY - 30, 30, 0, Math.PI * 2); ctx.fill();
      sil(220, 16, 100); ctx.beginPath(); ctx.arc(228, shelfY - 30, 30, 0, Math.PI * 2); ctx.fill();
      for (const x of [340, 400, 450]) {
        ctx.beginPath();
        ctx.moveTo(x, shelfY - 70); ctx.lineTo(x + 24, shelfY - 40);
        ctx.lineTo(x + 12, shelfY); ctx.lineTo(x - 12, shelfY);
        ctx.lineTo(x - 24, shelfY - 40); ctx.closePath(); ctx.fill();
      }
      break;
  }
  void accentHex; // palette is the shared warm-interior look; accent unused
  return canvasTexture(cnv);
}

// Wayfinding directory: mall header, department name, tagline, tenant list.
function makeDirectoryTexture(deptName, tagline, storeNames, accentHex) {
  const w = 512, h = 768;
  const cnv = document.createElement('canvas');
  cnv.width = w; cnv.height = h;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = '#141018';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = hexCss(C.COLORS.magenta);
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  glowText(ctx, 'WAVEMALL', w / 2, 78, 58, hexCss(C.COLORS.magenta));
  glowText(ctx, 'PRIME', w / 2, 132, 34, hexCss(C.COLORS.magenta));
  ctx.fillStyle = hexCss(C.COLORS.teal);
  ctx.fillRect(60, 168, w - 120, 3);
  const accent = hexCss(accentHex);
  let px = 44;
  ctx.font = `bold ${px}px monospace`;
  while (ctx.measureText(deptName).width > w - 80 && px > 24) {
    px -= 2;
    ctx.font = `bold ${px}px monospace`;
  }
  glowText(ctx, deptName, w / 2, 226, px, accent);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#c9b8cf';
  ctx.font = '19px monospace';
  ctx.textAlign = 'center';
  // Tagline, wrapped on the interpuncts.
  const parts = tagline.split(' · ');
  let line = '', ty = 278;
  for (const p of parts) {
    const cand = line ? line + ' · ' + p : p;
    if (ctx.measureText(cand).width > w - 90) {
      ctx.fillText(line, w / 2, ty); ty += 26; line = p;
    } else line = cand;
  }
  if (line) { ctx.fillText(line, w / 2, ty); ty += 26; }
  ty += 22;
  ctx.textAlign = 'left';
  ctx.font = 'bold 24px monospace';
  for (const s of storeNames) {
    ctx.fillStyle = accent;
    ctx.fillText('▸', 46, ty);
    ctx.fillStyle = '#e8dff0';
    ctx.fillText(s, 78, ty);
    ty += 42;
    if (ty > h - 40) break;
  }
  return canvasTexture(cnv);
}

// Mall carpet: plum diamond lattice with accent medallion dots on a deep red
// ground — the patterned-concourse look from the reference art.
function makeCarpetTexture(baseHex, accentHex, size = 512) {
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = hexCss(baseHex);
  ctx.fillRect(0, 0, size, size);
  const cell = size / 4;
  const px = size / 256; // stroke/dot scale so 512 keeps the 256 design weight
  // Diamond lattice
  ctx.strokeStyle = '#8a3448';
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3 * px;
  for (let i = -1; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell - size, 0); ctx.lineTo(i * cell + size, size * 2);
    ctx.moveTo(i * cell + size, 0); ctx.lineTo(i * cell - size, size * 2);
    ctx.stroke();
  }
  // Alternating diamond fills
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#3a1c2c';
  for (let gx = 0; gx < 4; gx++) {
    for (let gz = 0; gz < 4; gz++) {
      if ((gx + gz) % 2) continue;
      const cx = gx * cell + cell / 2, cy = gz * cell + cell / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - cell / 2); ctx.lineTo(cx + cell / 2, cy);
      ctx.lineTo(cx, cy + cell / 2); ctx.lineTo(cx - cell / 2, cy);
      ctx.closePath(); ctx.fill();
    }
  }
  // Accent medallion dots at the lattice crossings
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = hexCss(accentHex);
  for (let gx = 0; gx <= 4; gx++) {
    for (let gz = 0; gz <= 4; gz++) {
      ctx.beginPath();
      ctx.arc(gx * cell, gz * cell, 5 * px, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const tex = canvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
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
// Great-circle offset: the surface-local direction `dist` meters from the
// worldUp anchor along the ring bearing `angle`. Shared by districts, the
// grand entrance, and the crystal centerpiece so they use one tangent basis.
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

// Anchored tangent frame at dirLocal, yawed so local -Z looks back at the
// landing anchor (worldUp) — every wing opens toward the mall center, and
// collision math reuses the same cached {pos, q, qInv}.
function surfaceFrame(planet, worldUp, dirLocal) {
  const q0 = new THREE.Quaternion().setFromUnitVectors(_yAxis, dirLocal);
  const pos = dirLocal.clone().multiplyScalar(sampleGround(planet, dirLocal));
  const toCenter = worldUp.clone().multiplyScalar(sampleGround(planet, worldUp))
    .sub(pos).applyQuaternion(q0.clone().invert());
  const yaw = Math.atan2(-toCenter.x, -toCenter.z);
  const q = q0.multiply(new THREE.Quaternion().setFromAxisAngle(_yAxis, yaw));
  return { pos, q, qInv: q.clone().invert() };
}

// Quarter-turn an axis-aligned wall/surface record (k * 90° about +Y, same
// sense as BufferGeometry.rotateY) — keeps makeStructure AABBs axis-aligned.
function rotAabb(rec, k) {
  const map = (x, z) =>
    k === 0 ? [x, z] : k === 1 ? [z, -x] : k === 2 ? [-x, -z] : [-z, x];
  const [ax, az] = map(rec.x0, rec.z0);
  const [bx, bz] = map(rec.x1, rec.z1);
  return {
    ...rec,
    x0: Math.min(ax, bx), x1: Math.max(ax, bx),
    z0: Math.min(az, bz), z1: Math.max(az, bz),
  };
}

// Fixed non-overlapping store slots around each wing's plaza (district-local;
// the -Z entrance corridor stays open). fx/fz: storefront facing, toward the
// plaza. k: quarter-turns from the canonical faces-minus-Z store.
const STORE_SLOTS = [
  { cx: 0,   cz: 46,  k: 0, hwMin: 16, hwMax: 20, hdMin: 11, hdMax: 14, anchor: true },
  { cx: 44,  cz: -10, k: 1, hwMin: 11, hwMax: 13, hdMin: 10, hdMax: 13 },
  { cx: -44, cz: -10, k: 3, hwMin: 11, hwMax: 13, hdMin: 10, hdMax: 13 },
  { cx: 45,  cz: 22,  k: 1, hwMin: 10, hwMax: 12, hdMin: 10, hdMax: 13 },
  { cx: -45, cz: 22,  k: 3, hwMin: 10, hwMax: 12, hdMin: 10, hdMax: 13 },
  { cx: 26,  cz: -46, k: 2, hwMin: 10, hwMax: 12, hdMin: 9,  hdMax: 11 },
];

// One giant single-floor retail store, built in a canonical frame (center at
// origin, storefront facing -Z, y measured from the store's ground). Pushes
// geometry into the district's shared merge buckets and returns the walkable
// surfaces + wall AABBs (canonical — caller quarter-turns them into place).
function emitStore(o) {
  const { hw, hd, H, enterable, signV, buckets, isAnchor, rng } = o;
  const WT = C.STORE_WALL_T, LIFT = C.STORE_FLOOR_LIFT;
  const DH = C.STORE_DOOR_HALF, DOORH = C.STORE_DOOR_H;
  const surfaces = [], walls = [];
  const box = (w, h, d, x, y, z, bucket, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    bucket.push(g);
  };

  // Floor slab + two entry steps up to it (walker step-up handles the rest).
  // Slabs and steps extend ~1 m below grade so undulating terrain never opens
  // a gap under an edge.
  box(hw * 2, LIFT + 1.2, hd * 2, 0, (LIFT - 1.2) / 2, 0, buckets.hull);
  const stepW = DH * 2 + 6;
  box(stepW, 1.2, 0.9, 0, 0.2 - 0.6, -hd - 1.35, buckets.hull);
  box(stepW, 1.4, 0.9, 0, 0.4 - 0.7, -hd - 0.45, buckets.hull);
  surfaces.push({ x0: -stepW / 2, x1: stepW / 2, z0: -hd - 1.8, z1: -hd - 0.9, y: 0.2 });
  surfaces.push({ x0: -stepW / 2, x1: stepW / 2, z0: -hd - 0.9, z1: -hd, y: 0.4 });

  // Roof cap with a slight overhang; glowing accent trim along the roofline.
  box(hw * 2 + 0.6, 0.5, hd * 2 + 0.6, 0, H + 0.25, 0, buckets.hull);
  box(hw * 2 + 0.6, 0.16, 0.16, 0, H + 0.45, -hd - 0.32, buckets.glow);
  if (isAnchor) {
    // Stepped rooftop silhouette blocks (reference-art skyline flourish).
    box(hw * 0.55, 1.6, hd * 0.5, hw * 0.1, H + 1.3, hd * 0.2, buckets.hull);
    box(hw * 0.3, 2.6, hd * 0.3, -hw * 0.2, H + 1.8, hd * 0.1, buckets.hull);
  }

  if (enterable) {
    // Real lobby: three solid walls, a doorway with jambs + lintel, glowing
    // interior, service counter and shelves — the city.js lobby pattern
    // scaled up to department-store size.
    surfaces.push({ x0: -hw, x1: hw, z0: -hd, z1: hd, y: LIFT });
    for (const s of [-1, 1]) { // side walls
      box(WT, H, hd * 2, s * (hw - WT / 2), H / 2, 0, buckets.hull);
      walls.push({
        x0: s > 0 ? hw - WT : -hw, x1: s > 0 ? hw : -hw + WT,
        z0: -hd - 0.1, z1: hd + 0.1, y0: 0, y1: H,
      });
    }
    box(hw * 2, H, WT, 0, H / 2, hd - WT / 2, buckets.hull); // back wall
    walls.push({ x0: -hw - 0.1, x1: hw + 0.1, z0: hd - WT, z1: hd, y0: 0, y1: H });
    const jamb = hw - DH; // front wall: jambs flanking the entrance gap
    for (const s of [-1, 1]) {
      box(jamb, H, WT, s * (DH + jamb / 2), H / 2, -hd + WT / 2, buckets.hull);
      walls.push({
        x0: s < 0 ? -hw - 0.1 : DH, x1: s < 0 ? -DH : hw + 0.1,
        z0: -hd, z1: -hd + WT, y0: 0, y1: H,
      });
    }
    box(DH * 2, H - DOORH, WT, 0, DOORH + (H - DOORH) / 2, -hd + WT / 2, buckets.hull);
    walls.push({ x0: -DH, x1: DH, z0: -hd, z1: -hd + WT, y0: DOORH, y1: H });
    // Interior: glowing back wall, ceiling light strips, counter, shelves.
    box(hw * 1.4, H * 0.5, 0.1, 0, LIFT + H * 0.32, hd - WT - 0.15, buckets.glow);
    box(hw * 1.2, 0.08, 1.0, 0, H - 0.7, -hd * 0.3, buckets.glow);
    box(hw * 1.2, 0.08, 1.0, 0, H - 0.7, hd * 0.3, buckets.glow);
    box(DH * 2 + 2.5, 1.0, 0.9, 0, LIFT + 0.5, hd * 0.45, buckets.prop);
    box(DH * 2 + 2.1, 0.1, 0.7, 0, LIFT + 1.05, hd * 0.45, buckets.glow);
    for (const s of [-1, 1]) {
      box(1.2, 2.2, hd * 0.9, s * hw * 0.55, LIFT + 1.1, 0, buckets.prop);
      box(0.1, 0.08, hd * 0.85, s * (hw * 0.55 - 0.66), LIFT + 1.7, 0, buckets.glow);
    }
  } else {
    // Dressed facade: one solid hull, one solid wall AABB.
    box(hw * 2, H, hd * 2, 0, H / 2, 0, buckets.hull);
    walls.push({ x0: -hw, x1: hw, z0: -hd, z1: hd, y0: 0, y1: H });
  }

  // Glowing door frame (jambs + header) — a lit entrance on every store;
  // on facades it reads as a closed shopfront door.
  box(0.18, DOORH, 0.18, DH, LIFT + DOORH / 2, -hd - 0.08, buckets.glow);
  box(0.18, DOORH, 0.18, -DH, LIFT + DOORH / 2, -hd - 0.08, buckets.glow);
  box(DH * 2 + 0.5, 0.18, 0.18, 0, LIFT + DOORH + 0.06, -hd - 0.08, buckets.glow);

  // Lit display windows flanking the entrance (merchandise emissive map).
  const wl = hw - 1.7 - DH;
  if (wl > 2) {
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(wl, 2.8);
      g.rotateY(Math.PI); // face -Z (outward)
      g.translate(s * (DH + 0.7 + wl / 2), LIFT + 1.9, -hd - 0.06);
      buckets.window.push(g);
    }
  }

  // Awning over the entrance, tilted down-and-out.
  box(Math.min(hw * 1.4, wl * 2 + DH * 2 + 1.4), 0.15, 1.8, 0, LIFT + 3.6, -hd - 0.8, buckets.accent, -0.28);

  // Giant storefront sign above the awning — UVs into the district atlas row.
  const sg = new THREE.PlaneGeometry(hw * 1.7, 2.4);
  sg.rotateY(Math.PI);
  const uv = sg.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setY(i, signV[0] + uv.getY(i) * (signV[1] - signV[0]));
  }
  sg.translate(0, H - 1.4, -hd - 0.12);
  buckets.sign.push(sg);

  void rng;
  return { surfaces, walls, halfExtent: Math.max(hw, hd) + 2 };
}

function buildDistrict(planet, worldUp, dept, index, rng, opts) {
  void opts;
  const group = new THREE.Group();
  group.name = `district_${dept.name}`;

  const angle = (index / C.DISTRICT_COUNT) * Math.PI * 2;
  const dirLocal = ringDir(planet, worldUp, angle, C.DISTRICT_RING_DIST);
  const frame = surfaceFrame(planet, worldUp, dirLocal);
  group.position.copy(frame.pos);
  group.quaternion.copy(frame.q);

  // Exact sphere drape for a district-local (x, z): local +Y is radial only at
  // the center, so a flat layout floats ~d²/2R at the rim — solve the sphere.
  const baseR = frame.pos.length();
  const _dw = new THREE.Vector3();
  const localGroundY = (x, z) => {
    _dw.set(x, 0, z).applyQuaternion(frame.q).add(frame.pos).normalize();
    const rr = sampleGround(planet, _dw);
    return Math.sqrt(Math.max(rr * rr - (x * x + z * z), 0)) - baseR - 0.05;
  };

  // Carpeted plaza: subdivided draped disc under everything.
  const carpetR = 72;
  const ringGeo = new THREE.RingGeometry(1.6, carpetR, 48, 10);
  ringGeo.rotateX(-Math.PI / 2);
  const capGeo = new THREE.CircleGeometry(1.7, 16);
  capGeo.rotateX(-Math.PI / 2);
  const carpetGeo = mergeGeometries([ringGeo, capGeo], false);
  const cpos = carpetGeo.attributes.position;
  for (let i = 0; i < cpos.count; i++) {
    cpos.setY(i, localGroundY(cpos.getX(i), cpos.getZ(i)) + 0.08);
  }
  carpetGeo.computeVertexNormals();
  const carpetTex = makeCarpetTexture(C.COLORS.concourseCarpet, dept.accent);
  const carpetMat = new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.95 });
  const carpet = new THREE.Mesh(carpetGeo, carpetMat);
  carpet.frustumCulled = false;
  group.add(carpet);

  // Tenants: draw this wing's store names from the department pool.
  const pool = dept.stores.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const storeCount = Math.min(4 + Math.floor(rng() * 3), pool.length, STORE_SLOTS.length);
  const names = pool.slice(0, storeCount);
  const atlas = makeStorefrontSignAtlas(names, dept.accent);
  const enterableCount = storeCount >= 6 ? 3 : C.ENTERABLE_PER_DISTRICT;

  const buckets = { hull: [], glow: [], prop: [], accent: [], sign: [], window: [], foliage: [] };
  const structures = [];
  const lobbies = [];

  for (let i = 0; i < storeCount; i++) {
    const slot = STORE_SLOTS[i];
    const hw = slot.hwMin + rng() * (slot.hwMax - slot.hwMin);
    const hd = slot.hdMin + rng() * (slot.hdMax - slot.hdMin);
    const H = slot.anchor
      ? C.STORE_H_MAX - rng() * 0.8
      : C.STORE_H_MIN + rng() * (C.STORE_H_MAX - C.STORE_H_MIN - 1);
    const enterable = i < enterableCount;
    const baseY = localGroundY(slot.cx, slot.cz);

    // Build canonical (facing -Z), then quarter-turn + move into the slot.
    const local = { hull: [], glow: [], prop: [], accent: [], sign: [], window: [], foliage: [] };
    const rec = emitStore({
      hw, hd, H, enterable, isAnchor: !!slot.anchor,
      signV: atlas.rowV(i), buckets: local, rng,
    });
    const theta = slot.k * Math.PI / 2;
    for (const key of Object.keys(local)) {
      for (const g of local[key]) {
        if (theta) g.rotateY(theta);
        g.translate(slot.cx, baseY, slot.cz);
        buckets[key].push(g);
      }
    }
    structures.push(makeStructure(
      slot.cx, slot.cz, baseY,
      rec.surfaces.map((s) => rotAabb(s, slot.k)),
      rec.walls.map((w) => rotAabb(w, slot.k)),
      rec.halfExtent
    ));
    if (enterable) {
      lobbies.push({
        x: slot.cx, z: slot.cz, floorY: baseY + C.STORE_FLOOR_LIFT,
        half: Math.max(Math.min(hw, hd) - 2.2, 1.5), flavor: 'shop',
        seed: (hashSeed(dept.name + '::lobby') ^ Math.imul(i + 7, 0x9e3779b1)) >>> 0,
        name: names[i],
      });
    }
  }

  // Concourse dressing — directory sign at the entrance corridor.
  const dirTex = makeDirectoryTexture(dept.name, dept.tagline, names, dept.accent);
  const dirBaseY = localGroundY(-16, -42);
  for (const px of [-2.3, 2.3]) {
    const post = new THREE.BoxGeometry(0.35, 9.2, 0.35);
    post.translate(-16 + px, dirBaseY + 4.6, -42);
    buckets.prop.push(post);
  }
  const dirPanelGeo = new THREE.PlaneGeometry(5, 7.5);
  dirPanelGeo.rotateY(Math.PI); // face -Z, toward arriving shoppers
  dirPanelGeo.translate(-16, dirBaseY + 5.4, -42.2);
  const dirBackGeo = new THREE.PlaneGeometry(5, 7.5); // dark backside
  dirBackGeo.translate(-16, dirBaseY + 5.4, -42.25);
  buckets.prop.push(dirBackGeo);

  // Lantern posts around the plaza + flanking the entrance walk.
  const lanternAt = (x, z) => {
    const y = localGroundY(x, z);
    const pole = new THREE.CylinderGeometry(0.09, 0.13, 3.4, 6);
    pole.translate(x, y + 1.7, z);
    buckets.prop.push(pole);
    const head = new THREE.IcosahedronGeometry(0.32, 0);
    head.translate(x, y + 3.5, z);
    buckets.glow.push(head);
  };
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * 27, z = Math.sin(a) * 27;
    if (z < -12 && Math.abs(x) < 16) continue; // keep the entrance open
    lanternAt(x, z);
  }
  lanternAt(-10, -40);
  lanternAt(10, -40);

  // Planters: pot + foliage, scattered on the plaza ring.
  for (let i = 0; i < 8; i++) {
    const a = rng() * Math.PI * 2;
    const r = 14 + rng() * 10;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z < -10 && Math.abs(x) < 14) continue;
    const y = localGroundY(x, z);
    const pot = new THREE.CylinderGeometry(0.7, 0.85, 0.8, 8);
    pot.translate(x, y + 0.4, z);
    buckets.prop.push(pot);
    const leaves = new THREE.IcosahedronGeometry(0.55 + rng() * 0.3, 0);
    leaves.scale(1, 1.6, 1);
    leaves.translate(x, y + 1.5, z);
    buckets.foliage.push(leaves);
  }

  // Glowing runway strips guiding shoppers in from the entrance corridor.
  for (const sx of [-8, 8]) {
    for (let seg = 0; seg < 3; seg++) {
      const z = -36 - seg * 11;
      const strip = new THREE.BoxGeometry(0.35, 0.14, 10);
      strip.translate(sx, localGroundY(sx, z) + 0.13, z);
      buckets.glow.push(strip);
    }
  }

  // Merge the buckets — one draw call per material per wing.
  const accentColor = new THREE.Color(dept.accent);
  const hullMat = new THREE.MeshStandardMaterial({
    color: C.COLORS.terrazzo, roughness: 0.7, metalness: 0.1,
    emissive: accentColor, emissiveIntensity: 0.12,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x14101a, emissive: accentColor, emissiveIntensity: 1.0, roughness: 0.4,
  });
  const propMat = new THREE.MeshStandardMaterial({
    color: 0x241e2c, roughness: 0.8, metalness: 0.15,
  });
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0x3c6b46, roughness: 0.9,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: dept.accent, roughness: 0.6,
    emissive: accentColor, emissiveIntensity: C.TRIM_EMISSIVE,
  });
  const signMat = new THREE.MeshStandardMaterial({
    map: atlas.tex, emissive: 0xffffff, emissiveMap: atlas.tex,
    emissiveIntensity: C.SIGN_EMISSIVE, roughness: 0.5,
  });
  const merchTex = makeMerchandiseTexture(index, dept.accent);
  const windowMat = new THREE.MeshStandardMaterial({
    map: merchTex, emissive: 0xffffff, emissiveMap: merchTex,
    emissiveIntensity: 1.0, roughness: 0.3,
  });
  const dirMat = new THREE.MeshStandardMaterial({
    map: dirTex, emissive: 0xffffff, emissiveMap: dirTex,
    emissiveIntensity: 0.95, roughness: 0.5,
  });
  const addMerged = (geos, mat) => {
    if (!geos.length) return;
    // Icosahedra (lantern heads, foliage) are non-indexed; boxes/cylinders are
    // indexed — mergeGeometries refuses the mix, so de-index everything.
    const flat = geos.map((g) => {
      if (!g.index) return g;
      const ni = g.toNonIndexed();
      g.dispose();
      return ni;
    });
    const mesh = new THREE.Mesh(mergeGeometries(flat, false), mat);
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  addMerged(buckets.hull, hullMat);
  addMerged(buckets.glow, glowMat);
  addMerged(buckets.prop, propMat);
  addMerged(buckets.foliage, foliageMat);
  addMerged(buckets.accent, accentMat);
  addMerged(buckets.sign, signMat);
  addMerged(buckets.window, windowMat);
  addMerged([dirPanelGeo], dirMat);

  // Speaker orb — plaza centerpiece, on a low dais.
  const daisY = localGroundY(0, 0);
  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 4.2, 0.5, 12),
    propMat
  );
  dais.position.set(0, daisY + 0.25, 0);
  group.add(dais);
  const orbMat = new THREE.MeshPhysicalMaterial({
    color: dept.accent,
    emissive: accentColor,
    emissiveIntensity: C.SPEAKER_EMISSIVE_BASE,
    transparent: true,
    opacity: 0.85,
    roughness: 0.2,
    transmission: 0.4,
  });
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(C.SPEAKER_ORB_RADIUS, 2), orbMat);
  orb.position.set(0, daisY + 0.5 + C.SPEAKER_ORB_RADIUS * 1.3, 0);
  group.add(orb);
  structures.push(makeStructure(0, 0, daisY, [
    { x0: -3.8, x1: 3.8, z0: -3.8, z1: 3.8, y: 0.5 },
  ], [], 5));

  return {
    group,
    frame,
    structures,
    lobbies,
    orbMaterial: orbMat,
    dirLocal,
    accent: dept.accent,
    emissiveMats: [glowMat, signMat, windowMat, dirMat],
  };
}

export function createDepartmentDistrict(planet, worldUp, opts = {}) {
  const seed = hashSeed((opts.seedKey ?? 'wavemallprime') + '::districts');
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'wavemall_districts';

  const districts = C.DEPARTMENTS.map((dept, i) => buildDistrict(planet, worldUp, dept, i, rng, opts));
  districts.forEach((d) => group.add(d.group));

  const boardingPad = districts[0].frame.pos.clone();

  // Day/night dimming over the wings' neon: cache base intensities once.
  const dimMats = [];
  districts.forEach((d) =>
    d.emissiveMats.forEach((m) => dimMats.push({ m, base: m.emissiveIntensity }))
  );

  function update(t, sunDot = 1) {
    // Signs drop under the bloom threshold by day and blaze at night.
    const nightLift = THREE.MathUtils.clamp(1 - Math.max(sunDot, 0), 0, 1);
    const level = THREE.MathUtils.lerp(0.55, 1, nightLift);
    for (let i = 0; i < dimMats.length; i++) {
      dimMats[i].m.emissiveIntensity = dimMats[i].base * level;
    }
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
        if (obj.material.emissiveMap && obj.material.emissiveMap !== obj.material.map) {
          obj.material.emissiveMap.dispose();
        }
        obj.material.dispose();
      }
    });
  }

  return { group, update, sunDot: 1, dispose, groundHeightAt, boardingPad, districts };
}

/* ----------------------------------------------------------------------
 * Grand entrance + crystalline anchor centerpiece (landing-site set)
 * ------------------------------------------------------------------- */
export function createGrandEntrance(planet, worldUp, opts = {}) {
  void opts;
  const group = new THREE.Group();
  group.name = 'wavemall_entrance';
  // On the walk from the landing anchor toward district 0's wing.
  const dirLocal = ringDir(planet, worldUp, 0, C.ENTRANCE_DIST);
  const frame = surfaceFrame(planet, worldUp, dirLocal);
  group.position.copy(frame.pos);
  group.quaternion.copy(frame.q);

  const S = C.ENTRANCE_SPAN, H = C.ENTRANCE_H;
  const hullGeos = [], glowGeos = [];
  for (const s of [-1, 1]) {
    const pylon = new THREE.BoxGeometry(3, H, 3);
    pylon.translate(s * S, H / 2 - 0.3, 0);
    hullGeos.push(pylon);
    for (const zz of [-1.4, 1.4]) {
      const strip = new THREE.BoxGeometry(0.2, H - 1, 0.2);
      strip.translate(s * (S - 1.4), H / 2 - 0.3, zz);
      glowGeos.push(strip);
    }
  }
  // The signature ring arch, ends resting on the pylon tops.
  const arch = new THREE.TorusGeometry(S, 0.55, 10, 40, Math.PI);
  arch.translate(0, H - 0.3, 0);
  glowGeos.push(arch);

  const hullMat = new THREE.MeshStandardMaterial({
    color: C.COLORS.terrazzo, roughness: 0.65, metalness: 0.15,
    emissive: new THREE.Color(C.COLORS.magenta), emissiveIntensity: 0.1,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x220016, emissive: new THREE.Color(C.COLORS.magenta),
    emissiveIntensity: 1.2, roughness: 0.4,
  });
  const hull = new THREE.Mesh(mergeGeometries(hullGeos, false), hullMat);
  const glow = new THREE.Mesh(mergeGeometries(glowGeos, false), glowMat);
  hull.frustumCulled = false;
  glow.frustumCulled = false;
  group.add(hull, glow);

  // "WAVEMALL PRIME" lettering hung between the pylons, both faces.
  const atlas = makeStorefrontSignAtlas(['WAVEMALL PRIME'], C.COLORS.magenta);
  const signMat = new THREE.MeshStandardMaterial({
    map: atlas.tex, emissive: 0xffffff, emissiveMap: atlas.tex,
    emissiveIntensity: C.SIGN_EMISSIVE, roughness: 0.5,
  });
  const signGeos = [];
  for (const s of [-1, 1]) {
    const p = new THREE.PlaneGeometry(S * 1.7, 2.4);
    if (s < 0) p.rotateY(Math.PI);
    p.translate(0, H - 3.4, s * 0.35);
    signGeos.push(p);
  }
  const sign = new THREE.Mesh(mergeGeometries(signGeos, false), signMat);
  sign.frustumCulled = false;
  group.add(sign);

  const structures = [makeStructure(0, 0, 0, [], [
    { x0: -S - 1.5, x1: -S + 1.5, z0: -1.5, z1: 1.5, y0: 0, y1: H },
    { x0: S - 1.5, x1: S + 1.5, z0: -1.5, z1: 1.5, y0: 0, y1: H },
  ], S + 3)];

  function dispose() {
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        if (obj.material.emissiveMap && obj.material.emissiveMap !== obj.material.map) {
          obj.material.emissiveMap.dispose();
        }
        obj.material.dispose();
      }
    });
  }

  return { group, frame, structures, emissiveMats: [glowMat, signMat], dispose };
}

export function createAnchorStructure(planet, worldUp, opts = {}) {
  const seed = hashSeed((opts.seedKey ?? 'wavemallprime') + '::anchorcrystal');
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'wavemall_anchor';
  // Opposite side of the landing anchor from the entrance walk.
  const dirLocal = ringDir(planet, worldUp, Math.PI, C.ANCHOR_DIST);
  const frame = surfaceFrame(planet, worldUp, dirLocal);
  group.position.copy(frame.pos);
  group.quaternion.copy(frame.q);

  // Hex dais, walkable.
  const daisMat = new THREE.MeshStandardMaterial({
    color: 0x241e2c, roughness: 0.8, metalness: 0.15,
  });
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.8, 1.6, 6), daisMat);
  dais.position.y = -0.2; // top at +0.6, base buried
  group.add(dais);

  // Crystal cluster: one tall central spire ringed by tilted shards.
  const crystalGeos = [];
  const spire = new THREE.OctahedronGeometry(3.1, 0);
  spire.scale(1, 2.4, 1);
  spire.translate(0, 0.6 + 6.2, 0);
  crystalGeos.push(spire);
  for (let i = 0; i < C.ANCHOR_CRYSTALS; i++) {
    const a = (i / C.ANCHOR_CRYSTALS) * Math.PI * 2 + rng() * 0.4;
    const r = 1.6 + rng() * 1.1;
    const shard = new THREE.OctahedronGeometry(r, 0);
    shard.scale(1, 1.6 + rng() * 0.9, 1);
    shard.rotateZ((rng() - 0.5) * 0.5);
    shard.rotateY(a);
    shard.translate(Math.cos(a) * 3.6, 0.6 + r * 1.8, Math.sin(a) * 3.6);
    crystalGeos.push(shard);
  }
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: 0xbcd7ff, emissive: new THREE.Color(0x8ab0ff),
    emissiveIntensity: 0.7, transparent: true, opacity: 0.9,
    roughness: 0.15, transmission: 0.55,
  });
  const crystals = new THREE.Mesh(mergeGeometries(crystalGeos, false), crystalMat);
  crystals.frustumCulled = false;
  group.add(crystals);

  // All-departments display board, facing the landing anchor.
  const boardTex = makeDirectoryTexture(
    'DIRECTORY',
    "the galaxy's favorite shopping destination",
    C.DEPARTMENTS.map((d) => d.name),
    C.COLORS.teal
  );
  const boardMat = new THREE.MeshStandardMaterial({
    map: boardTex, emissive: 0xffffff, emissiveMap: boardTex,
    emissiveIntensity: 0.95, roughness: 0.5,
  });
  // Off to the side of the approach path so it never hides the crystals.
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 6.6), boardMat);
  board.rotation.y = Math.PI; // face -Z, toward the mall center
  board.position.set(8.5, 4.4, -8.2);
  group.add(board);
  const postMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), daisMat);
  postMesh.position.set(8.5, 3.5, -7.8); // fully behind the board face
  group.add(postMesh);

  const structures = [makeStructure(0, 0, 0, [
    { x0: -5.4, x1: 5.4, z0: -5.4, z1: 5.4, y: 0.6 }, // dais top (hex ≈ AABB)
  ], [
    { x0: -4.2, x1: 4.2, z0: -4.2, z1: 4.2, y0: 0, y1: 12 }, // crystal cluster
    { x0: 7.9, x1: 9.1, z0: -8.4, z1: -7.5, y0: 0, y1: 8 }, // board post
  ], 12)];

  function update(t, sunDot = 1) {
    const nightLift = THREE.MathUtils.clamp(1 - Math.max(sunDot, 0), 0, 1);
    const level = THREE.MathUtils.lerp(0.6, 1, nightLift);
    crystalMat.emissiveIntensity = (0.7 + Math.sin(t * 0.7) * 0.3) * level;
  }

  function dispose() {
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        if (obj.material.emissiveMap && obj.material.emissiveMap !== obj.material.map) {
          obj.material.emissiveMap.dispose();
        }
        obj.material.dispose();
      }
    });
  }

  return { group, frame, structures, emissiveMats: [boardMat], update, dispose };
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
// Frame-loop scratch — module scope so crowd/mote updates never allocate.
const _toWp = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _col = new THREE.Color();

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
    // Steer clear of the entrance arch / crystal centerpiece footprints
    // (host.avoid circles, crowd-local) — cheaper than per-frame collision.
    let x = 0, z = 0;
    for (let tries = 0; tries < 8; tries++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * (host.radius ?? C.DISTRICT_RADIUS);
      x = Math.cos(angle) * dist;
      z = Math.sin(angle) * dist;
      let blocked = false;
      if (host.avoid) {
        for (const a of host.avoid) {
          const dx = x - a.x, dz = z - a.z;
          if (dx * dx + dz * dz < a.r * a.r) { blocked = true; break; }
        }
      }
      if (!blocked) break;
    }
    c.waypoint.set(x, 0, z);
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
    for (let ci = 0; ci < citizens.length; ci++) {
      const c = citizens[ci];
      // A citizen in dialogue holds still so the speaker doesn't wander off.
      if (!c.talking) {
        _toWp.copy(c.waypoint).sub(c.pos);
        const dist = _toWp.length();
        if (dist < 1) pickWaypoint(c);
        else {
          _toWp.normalize().multiplyScalar(c.speed * dt);
          c.pos.add(_toWp);
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
        impostorMesh.setMatrixAt(idx, _m4.setPosition(c.pos));
        impostorMesh.setColorAt(idx, _col.set(c.accent).multiplyScalar(Math.max(0.3, sunDot)));
        idx++;
      }
    }
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
    for (let i = 0; i < moteData.length; i++) {
      const m = moteData[i];
      const y = m.basePos.y + ((t * C.MOTE_RISE_SPEED * m.speed + m.phase) % 8);
      const wobble = Math.sin(t * m.speed + m.phase) * C.MOTE_DRIFT_RADIUS;
      _m4.setPosition(m.basePos.x + wobble, y, m.basePos.z);
      motes.setMatrixAt(i, _m4);
    }
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
  const entrance = createGrandEntrance(planet, worldUp, { ...opts, seedKey });
  const centerpiece = createAnchorStructure(planet, worldUp, { ...opts, seedKey });

  // Landing-point anchor. Districts and wonders place each feature along its
  // own direction, but the crowd and hold-music motes are built around a local
  // origin — their groups must be moved/oriented to the actual landing site.
  const anchorDir = worldUp.clone().normalize();
  const anchorPos = anchorDir.clone().multiplyScalar(sampleGround(planet, anchorDir));
  const anchorQ = new THREE.Quaternion().setFromUnitVectors(_yAxis, anchorDir);
  const anchorQInv = anchorQ.clone().invert();
  const _gp = new THREE.Vector3();

  // Crowd-local no-wander circles under the arch pylons + crystal dais.
  const avoid = [entrance, centerpiece].map((f, i) => {
    const p = _gp.copy(f.frame.pos).sub(anchorPos).applyQuaternion(anchorQInv);
    return { x: p.x, z: p.z, r: i === 0 ? 16 : 14 };
  });

  const crowd = createCrowd(
    {
      radius: C.CROWD_RADIUS, // wander the central concourse
      avoid,
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

  group.add(
    districts.group, wonders.group, entrance.group, centerpiece.group,
    crowd.group, holdMusic.group
  );

  // Per-lobby manifest for interior shopkeepers (walk.js): each entry carries
  // its wing's group + inverse quaternion so the host can compute the player
  // in that district-local frame.
  const lobbies = [];
  districts.districts.forEach((d) => {
    d.lobbies.forEach((l) => {
      lobbies.push({ ...l, group: d.group, invQuat: d.frame.qInv });
    });
  });

  function update(t, dt, playerPos, sunDot = 1) {
    districts.update(t, sunDot);
    wonders.update(t, sunDot);
    centerpiece.update(t, sunDot);
    crowd.update(dt, playerPos, sunDot);
    holdMusic.update(t);
  }

  function nearestInteractable(playerPos, maxDist = 4) {
    return crowd.nearestInteractable(playerPos, maxDist);
  }
  function interact(citizen) {
    return crowd.interact(citizen);
  }

  // Collision zones: every wing plus the entrance arch and the crystal
  // centerpiece. Each zone owns AABB structures (walls + walkable slabs) in
  // its cached tangent frame; a surface-local player point is moved into the
  // frame, resolved, and moved back. Zero per-frame allocations.
  const zones = districts.districts.map((d) => ({
    frame: d.frame, structures: d.structures, r2: (C.DISTRICT_RADIUS + 15) ** 2,
  }));
  zones.push({ frame: entrance.frame, structures: entrance.structures, r2: 30 ** 2 });
  zones.push({ frame: centerpiece.frame, structures: centerpiece.structures, r2: 30 ** 2 });

  const _rcLocal = new THREE.Vector3();
  function resolveCollisions(surfaceLocalPos, playerRadius) {
    let pushed = false;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (surfaceLocalPos.distanceToSquared(z.frame.pos) > z.r2) continue;
      _rcLocal.copy(surfaceLocalPos).sub(z.frame.pos).applyQuaternion(z.frame.qInv);
      let zonePushed = false;
      for (let j = 0; j < z.structures.length; j++) {
        if (z.structures[j].resolveWalls(_rcLocal, playerRadius)) zonePushed = true;
      }
      if (zonePushed) {
        surfaceLocalPos.copy(_rcLocal).applyQuaternion(z.frame.q).add(z.frame.pos);
        pushed = true;
      }
    }
    return pushed;
  }

  // Highest walkable structure surface (store floors, steps, daises) under a
  // surface-local point, as a planet-centered radius; -1 when on raw terrain.
  // walk.js maxes this with the terrain floor so slab edges just step down.
  function groundRadiusAt(surfaceLocalPos) {
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (surfaceLocalPos.distanceToSquared(z.frame.pos) > z.r2) continue;
      _rcLocal.copy(surfaceLocalPos).sub(z.frame.pos).applyQuaternion(z.frame.qInv);
      let best = -Infinity;
      for (let j = 0; j < z.structures.length; j++) {
        const sy = z.structures[j].surfaceYAt(_rcLocal.x, _rcLocal.z, _rcLocal.y);
        if (sy !== null && sy !== undefined && sy > best) best = sy;
      }
      if (best > -Infinity) {
        _rcLocal.y = best;
        return _rcLocal.applyQuaternion(z.frame.q).add(z.frame.pos).length();
      }
      return -1; // zones don't overlap; nothing underfoot here
    }
    return -1;
  }

  function endInteract(citizen) {
    crowd.endInteract(citizen);
  }

  function dispose() {
    districts.dispose();
    wonders.dispose();
    entrance.dispose();
    centerpiece.dispose();
    crowd.dispose();
    holdMusic.dispose();
  }

  return {
    group,
    update,
    sunDot: 1,
    dispose,
    groundHeightAt: districts.groundHeightAt,
    boardingPad: districts.boardingPad,
    lobbies,
    nearestInteractable,
    interact,
    endInteract,
    resolveCollisions,
    groundRadiusAt,
    districts,
    wonders,
    entrance,
    centerpiece,
    crowd,
    holdMusic,
  };
}