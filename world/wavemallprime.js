/**
 * wavemallprime.js
 *
 * Procedural planet module for "Wavemall Prime" — a retail-bureaucratic
 * anomaly world themed after the Wave Collector album "Your Call is
 * Important to Us".
 *
 * The world is ONE BUILDING: a giant eight-level department store that you
 * land in front of, walk up to, and walk around inside. The geometry is the
 * owner's <wave-mall> showcase (world/wave-mall.js) rebuilt as an in-game
 * module — same pixel-art procedural textures, same eight departments, same
 * atrium/escalator/storefront language — with the things a showcase never
 * needed bolted on: walkable floors, wall collision, a permanent landing pad,
 * a causeway up to the entrance, and shoppers on every level.
 *
 * Coordinate assumptions (matches existing engine conventions):
 * - Units are meters. Astronaut is ~1.8 units tall, eye height 1.72.
 * - Planets are spheres; terrain sits on planet.surface (spinning mesh).
 * - Everything is placed in UNROTATED object space, parented to
 *   planet.surface, so planet spin + floating-origin rebasing carry it
 *   along for free.
 * - The mall's anchor frame is quaternion.setFromUnitVectors(+Y, site) with
 *   NO extra yaw — the exact frame world/cityRegistry.js padLocalDir() maps
 *   pad {x,z} through, so the registry pad and the module's pad are the same
 *   point by construction.
 * - Mall-local axes: +Y up, the facade faces +Z. The building spans
 *   x ±OUT_X, z -OUT_Z..FZ; the pad sits further out on +Z.
 * - Lighting is external (planetsky's sun + IBL, plus a few atrium point
 *   lights the module owns). Emissive materials carry the neon.
 *
 * FLOOR_H is 12, not the showcase's 8, and that is load-bearing: walking
 * gravity here is 0.2 (src/planet.js), which puts a jump apex at
 * WALK_JUMP^2 / (2 * WALK_GRAVITY * 0.2) ~= 10.4 m. makeStructure promotes a
 * slab to "walkable" once the feet reach within STRUCT_STEP_UP (0.7) of it,
 * so an 8 m floor pitch would let a routine jump snap the player up through
 * the ceiling onto the level above. 12 m keeps the next slab out of reach
 * (11.3 > 10.4) and makes the building read as genuinely giant.
 *
 * No external assets. All geometry from primitives. All textures generated in
 * code via CanvasTexture. Deterministic via mulberry32(seed).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeStructure } from './city.js';
import { createCrowd as createPeople } from './people.js';
import {
  HEADS, DEPT_LINES, PLAZA_LINES, DEPT_CODEX, PLAZA_CODEX,
} from './wavemall-dialogue.js';

/* ----------------------------------------------------------------------
 * Registry relief (world/actuality-materials.js, optional): tiling normal +
 * roughness maps bolted onto a structural material. Albedo stays the mall's
 * own — CanvasTexture signage and the authored palette are the identity —
 * but under the isolated render mode's environment map and shadows, the
 * micro-relief is what stops the concourse reading as flat plastic. The
 * registry owns the map clones; material.dispose() never frees textures.
 * ------------------------------------------------------------------- */
function relief(mat, materials, family, repeat, normalScale = 0.5) {
  if (!materials) return mat;
  const set = materials.tiledSet(family, repeat, repeat);
  mat.normalMap = set.normalMap;
  mat.normalScale = new THREE.Vector2(normalScale, normalScale);
  mat.roughnessMap = set.roughnessMap;
  return mat;
}

// The standalone wonder builders take only (rng) — the session registry rides
// this module slot for the duration of createWavemallPrime's build.
let _sessionMats = null;

/* ----------------------------------------------------------------------
 * Palette + tunables
 * ------------------------------------------------------------------- */
const P = {
  magenta: '#d4408f', hotpink: '#ff5fa8', teal: '#40d4c8', amber: '#ffb347',
  lavender: '#b6a3c9', indigo: '#241a4a', deep: '#150f30', silver: '#c8d0e0',
  gold: '#ffd88a', mint: '#9ff2d8', peach: '#ffc9a8', white: '#fdf6ff',
  night: '#0a0620', violet: '#7a4fd0',
};

// --- the building ---------------------------------------------------------
const LEVELS = 8;
const FLOOR_H = 12;      // floor-to-floor (see the header note on jump apex)
const VOID_X = 13;       // atrium half-width (the open shaft)
const STORE_X = 18.5;    // storefront line — VOID_X..STORE_X is the promenade
const VOID_Z = 70;       // atrium half-length
const OUT_X = 34;        // outer shell half-width
const OUT_Z = 90;        // outer shell half-length
const FZ = 96;           // facade plane (+Z)
const BLD_H = FLOOR_H * LEVELS + 10;
const WALL_H = 9;        // storefront / store-interior height
const ESC_RUN = 20;      // escalator horizontal run (rise is FLOOR_H)
const ESC_W = 4.6;       // tread width
const LAND_HW = 4.75;    // escalator landing half-width
const LAND_HD = 3.3;     // escalator landing half-depth
const DOOR = 26;         // storefront entrance gap
const BAY_W = 60;        // storefront bay pitch
const BAYS = [-60, 0, 60];
const RAIL_H = 1.55;     // balustrade collision height (glass + rail cap)
const ENTRY_HW = 24;     // facade opening half-width (between the piers)
const ENTRY_H = 15;      // facade opening height

// --- the approach ---------------------------------------------------------
const PAD_Z = 170;       // landing pad center, mall-local (matches the registry)
const PAD_R = 12;        // pad deck radius
const WAY_HW = 7;        // causeway half-width
const WAY_Z0 = 94;       // causeway top (inside the vestibule)
const WAY_Z1 = 165;      // causeway foot (pad apron)
const WAY_SEGS = 12;

// Interior emissive trim. The showcase graded itself for ACES at exposure
// 0.66 behind an UnrealBloom pass; the game lands on this world at exposure
// 0.4 with bloomThreshold 1.2 (src/isolate.js WORLD_RENDER), so the same
// numbers read flat. One multiplier, tuned once, keeps the showcase's
// relative balance intact.
const EM = 1.35;

const C = {
  CROWD_RADIUS: 90,              // plaza wander disc (outside the doors)
  EMPLOYEE_RATIO: 0.4,
  WANDER_SPEED_MIN: 0.6,
  WANDER_SPEED_MAX: 1.4,
  QUEST_CHANCE: 0.18,
  CULL_DIST: 220,
  SIGN_EMISSIVE: 1.4,

  // Wonders — the five landmarks scattered out on the plain, kept from the
  // original world. They are the only reason to walk away from the mall.
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

  COLORS: {
    magenta: 0xd4408f,
    teal: 0x40d4c8,
    amber: 0xffb347,
    skyLavender: 0xb6a3c9,
  },
};

// The eight departments, one per level. Lifted from the showcase, which in
// turn took the names and accents from this module's earlier open-air wings.
const DEPTS = [
  { name: 'HOME DECOR', tag: 'furniture · lighting · rugs · wall art · plants',
    sign: 0xff5fc8, accent: 0xffb347, room: 0xf6d9c8, carpet: 0x2a2a8c, motif: 'decor', vista: 'moons', em: 1,
    stores: ['NEBULA NEST', 'ORBIT & OAK', 'LUMEN LIVING', 'PLUSH PULSAR'] },
  { name: 'GLASTELLE', tag: 'orbital psychology · understand · harmony · ascend',
    sign: 0x7bff8a, accent: 0xff8a33, room: 0xff9a3c, carpet: 0x5c2a12, motif: 'lab', vista: 'gas', em: 0.42,
    stores: ['SYNAPSE BOOKS', 'GLASS MIND', 'THE CALM CHAMBER', 'INNER ORBIT'] },
  { name: 'ELECTRONICS DEPARTMENT', tag: 'audio · holo · compute · repair',
    sign: 0x5fd0ff, accent: 0x40b0ff, room: 0x1c6a72, carpet: 0x0e3340, motif: 'circuit', vista: 'starfield', em: 0.8,
    stores: ['NEUROSPARK', 'CIRCUIT SONG', 'WAVEFORM & CO', 'SIGNALWORKS'] },
  { name: "XAVIER'S GIFTS", tag: 'gifts · wrapping · occasions',
    sign: 0xffffff, accent: 0xc8d0e0, room: 0x8e93a8, carpet: 0x2b2f42, motif: 'gifts', vista: 'portal', em: 0.3,
    stores: ["XAVIER'S", 'THE GIFT NEXUS', 'WHITEBOX', 'KEEPSAKE COSMOS'] },
  { name: "MEN'S CASUALWEAR", tag: 'daywear · synthwear · denim',
    sign: 0xff5fa8, accent: 0xff8fd0, room: 0xf2a0c8, carpet: 0x7a2a5c, motif: 'clothes', vista: 'moons', em: 0.45,
    stores: ['LUCID DAYWEAR', 'SLYNK SYNTHWEAR', 'TEZZARO', 'ZERO-G DENIM'] },
  { name: 'RAMDA', tag: 'timepieces · numerals · curios',
    sign: 0xffd23f, accent: 0xffb347, room: 0xffc24a, carpet: 0x8a4a10, motif: 'numbers', vista: 'nebula', em: 0.42,
    stores: ['RAMDA & SONS', 'THE COUNTING HOUSE', 'GOLDEN RATIO', 'ABACUS ATTIC'] },
  { name: 'SPORTING GOODS', tag: 'zero-g gear · courts · trails',
    sign: 0x7bff8a, accent: 0x40d4c8, room: 0x1b6a58, carpet: 0x123a30, motif: 'sport', vista: 'arena', em: 0.62,
    stores: ['APEX ASCENT', 'LOW-G LEAGUE', 'VELOCITY VAULT', 'JETPACK JUNCTION'] },
  { name: 'FELUZIA', tag: 'music · merch · stagecraft',
    sign: 0xffd88a, accent: 0xb07cff, room: 0x3a2170, carpet: 0x2a1250, motif: 'stage', vista: 'crowd', em: 0.55,
    stores: ['FELUZIA LIVE', 'ENCORE', 'THE GREEN ROOM', 'AMP & ECHO'] },
];

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

// Texture scatter (star specks, confetti seeds) draws from here rather than
// Math.random, so a rebuilt mall is pixel-identical to the last one. Swapped
// in for the duration of a build.
let R = Math.random;

/* ----------------------------------------------------------------------
 * Pixel-art texture helpers (ported from world/wave-mall.js)
 * ------------------------------------------------------------------- */
function cnv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return { c, x };
}
function tex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
function px(x, X, Y, W, H, col) { x.fillStyle = col; x.fillRect(X | 0, Y | 0, W | 0, H | 0); }
// 2x2 ordered dither between two colors (retro shading, no gradients)
function dither(x, X, Y, W, H, a, b, dense = 2) {
  px(x, X, Y, W, H, a);
  x.fillStyle = b;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (((i + j * dense) % 4) === 0) x.fillRect(X + i, Y + j, 1, 1);
  }
}
function pxText(x, s, cx, cy, size, col, glow = true) {
  x.font = `bold ${size}px "Courier New", monospace`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (glow) { x.shadowColor = col; x.shadowBlur = size * 0.5; }
  x.fillStyle = col;
  x.fillText(s, cx, cy); x.fillText(s, cx, cy);
  x.shadowBlur = 0;
}
function stars(x, W, H, n, cols = ['#ffffff', '#a9f7ff', '#ffc9ec']) {
  for (let i = 0; i < n; i++) {
    px(x, (R() * W) | 0, (R() * H) | 0, 1, 1, cols[(R() * cols.length) | 0]);
  }
}

// Storefront strip: 3 bays x 96px, tiles along the corridor.
function storefrontStrip(d) {
  const BW = 96, W = BW * 3, H = 72;
  const { c, x } = cnv(W, H);
  const room = hex(d.room), acc = hex(d.accent), sign = hex(d.sign);
  px(x, 0, 0, W, H, P.deep);
  for (let b = 0; b < 3; b++) {
    const X = b * BW;
    dither(x, X + 3, 6, BW - 6, H - 12, room, P.deep, 3);
    px(x, X + 3, 6, BW - 6, 3, acc);                     // fascia glow line
    px(x, X + 3, H - 9, BW - 6, 3, P.silver);            // threshold
    px(x, X, 0, 3, H, P.night); px(x, X + BW - 3, 0, 3, H, P.night); // pilasters
    px(x, X + 8, 12, BW - 16, 22, P.night);              // sign panel
    px(x, X + 8, 12, BW - 16, 1, sign);
    pxText(x, d.stores[b % d.stores.length], X + BW / 2, 24, 13, sign);
    dither(x, X + 8, 38, BW - 16, H - 50, hex(d.accent), P.night, 2);
    px(x, X + BW / 2 - 1, 38, 2, H - 50, P.night);       // mullion
    motif(x, d.motif, X + 10, 40, BW - 20, H - 54, d, b);
    if (b === 1) { px(x, X + 38, 44, 20, H - 53, P.night); px(x, X + 38, 44, 20, 2, acc); }
  }
  return tex(c);
}

function motif(x, kind, X, Y, W, H, d, seed) {
  const acc = hex(d.accent), s = hex(d.sign);
  const base = Y + H - 2;
  const Rr = (a, b, w, h, c) => px(x, X + a, base - b - h, w, h, c);
  if (kind === 'decor') {
    Rr(2, 0, 22, 9, P.mint); Rr(2, 8, 22, 3, P.white); Rr(28, 0, 10, 6, P.mint);
    Rr(42, 0, 16, 4, P.white); Rr(46, 4, 8, 6, '#5fd0ff');
    Rr(62, 0, 6, 14, '#7bff8a'); Rr(60, 13, 10, 5, '#3aa85c');
    Rr(30, 16, 3, 8, P.silver); Rr(26, 22, 11, 5, acc);
  } else if (kind === 'lab') {
    Rr(2, 0, 14, 12, '#2a1a10'); Rr(4, 12, 10, 8, '#7bff8a');
    for (let i = 0; i < 4; i++) { Rr(20 + i * 8, 0, 4, 16, P.white); Rr(20 + i * 8, 0, 4, 6 + i * 2, ['#7bff8a', '#ff8a33', '#5fd0ff', '#ff5fa8'][i]); }
    Rr(56, 2, 14, 14, '#ffd8a8'); Rr(59, 5, 8, 8, '#ff8a33');
    Rr(54, 0, 18, 2, P.silver);
  } else if (kind === 'circuit') {
    for (let i = 0; i < 6; i++) Rr(4 + i * 11, 18, 8, 1, '#7bff8a');
    Rr(2, 0, 18, 10, '#0e2a30'); Rr(4, 2, 14, 6, '#5fd0ff');
    Rr(24, 0, 20, 7, '#243040'); Rr(27, 2, 5, 3, s); Rr(35, 2, 5, 3, s);
    Rr(50, 0, 20, 6, '#243040'); Rr(52, 6, 16, 8, '#0e2a30');
    Rr(66, 0, 6, 16, acc);
  } else if (kind === 'gifts') {
    const cols = ['#ff5fa8', '#5fd0ff', '#ffd88a', '#7bff8a'];
    for (let i = 0; i < 4; i++) {
      const gx = 4 + i * 17, gy = (i % 2) * 9;
      Rr(gx, gy, 12, 12, cols[i]); Rr(gx + 5, gy, 2, 12, P.white); Rr(gx, gy + 5, 12, 2, P.white);
    }
    Rr(4, 22, 68, 1, P.silver);
  } else if (kind === 'clothes') {
    Rr(2, 12, 30, 2, P.silver);
    for (let i = 0; i < 5; i++) Rr(4 + i * 6, 0, 4, 12, ['#5fd0ff', '#ff5fa8', '#ffd88a', '#7bff8a', P.white][i]);
    Rr(38, 0, 8, 20, P.silver); Rr(39, 20, 6, 5, P.lavender);
    Rr(52, 4, 18, 16, '#c8b8e8'); Rr(54, 6, 14, 12, P.white);
  } else if (kind === 'numbers') {
    pxText(x, '7', X + 10, base - 10, 20, s); pxText(x, '3', X + 30, base - 12, 16, P.white, false);
    pxText(x, '9', X + 50, base - 9, 22, '#ff5fa8');
    Rr(2, 0, 68, 2, acc); Rr(60, 4, 12, 14, '#2a1a10'); Rr(62, 6, 8, 10, '#7bff8a');
  } else if (kind === 'sport') {
    Rr(4, 0, 12, 12, '#ff8a33'); Rr(4, 6, 12, 1, '#2a1a10');
    Rr(20, 0, 10, 10, P.white); Rr(22, 2, 6, 6, '#5fd0ff');
    Rr(34, 4, 14, 16, '#7bff8a'); Rr(31, 16, 20, 4, '#7bff8a');
    Rr(54, 0, 16, 20, '#123a30'); Rr(56, 12, 12, 6, acc);
  } else {
    Rr(4, 0, 10, 6, P.gold); Rr(6, 6, 6, 10, P.gold); Rr(2, 16, 14, 3, P.gold);
    Rr(24, 0, 12, 22, '#b07cff'); Rr(26, 14, 8, 6, P.gold);
    Rr(44, 0, 14, 5, P.white); Rr(46, 5, 10, 4, '#ff5fa8');
    Rr(62, 0, 8, 24, P.gold);
  }
  void seed;
}

function carpetTex(d) {
  const S = 96, { c, x } = cnv(S, S);
  px(x, 0, 0, S, S, hex(d.carpet));
  dither(x, 0, 0, S, S, hex(d.carpet), P.night, 3);
  for (let r = 8; r < S * 0.75; r += 9) {
    const col = r % 18 === 8 ? P.white : hex(d.sign);
    for (let a = 0; a < 360; a += 3) {
      const rad = (a * Math.PI) / 180, rr = r + Math.sin(rad * 3) * 3;
      px(x, S / 2 + Math.cos(rad) * rr, S / 2 + Math.sin(rad) * rr * 0.9, 2, 2, col);
    }
  }
  stars(x, S, S, 70, ['#ffffff', hex(d.sign), '#a9f7ff']);
  return tex(c, 6, 24);
}

function vistaTex(d) {
  const W = 192, H = 72, { c, x } = cnv(W, H);
  const kind = d.vista;
  if (kind === 'gas') {
    for (let i = 0; i < H; i += 3) dither(x, 0, i, W, 3, i < H / 2 ? '#ff8a33' : '#ffd23f', '#8a2a10', 2 + (i % 3));
    for (let a = 0; a < 200; a++) px(x, R() * W, R() * H, 3, 2, '#ffd8a8');
    px(x, 30, 12, 26, 26, '#b07cff'); px(x, 34, 16, 18, 18, '#e0b8ff');
  } else if (kind === 'nebula') {
    px(x, 0, 0, W, H, P.night); stars(x, W, H, 200);
    dither(x, 40, 14, 90, 44, '#7a4fd0', P.night, 2);
    dither(x, 60, 24, 50, 24, '#d4408f', '#7a4fd0', 3);
    px(x, 96, 34, 4, 4, P.white);
  } else if (kind === 'arena') {
    px(x, 0, 0, W, H, '#123a30');
    for (let i = 0; i < 8; i++) dither(x, 0, i * 6, W, 6, i % 2 ? '#1b6a58' : '#123a30', '#0a2a20', 2);
    px(x, 20, 34, W - 40, 26, '#2a8a6a'); px(x, 20, 44, W - 40, 2, P.white);
    for (let i = 0; i < 26; i++) px(x, 22 + i * 6, 8 + (i % 3) * 5, 4, 4, ['#ffd88a', '#ff5fa8', '#5fd0ff'][i % 3]);
  } else if (kind === 'crowd') {
    px(x, 0, 0, W, H, '#2a1250');
    for (let i = 0; i < 320; i++) px(x, R() * W, 10 + R() * 50, 3, 4, ['#7a4fd0', '#b07cff', '#3a2170'][(R() * 3) | 0]);
    for (let i = 0; i < 9; i++) px(x, 10 + i * 21, 0, 3, 12, P.gold);
  } else if (kind === 'portal') {
    px(x, 0, 0, W, H, '#0d0a18'); stars(x, W, H, 160);
    for (let r = 26; r > 2; r -= 3) {
      const col = r > 18 ? '#7a4fd0' : r > 10 ? '#b07cff' : P.white;
      for (let a = 0; a < 360; a += 4) {
        const rad = (a * Math.PI) / 180;
        px(x, W / 2 + Math.cos(rad) * r * 1.4, H / 2 + Math.sin(rad) * r, 2, 2, col);
      }
    }
  } else { // moons / starfield
    px(x, 0, 0, W, H, '#05030f'); stars(x, W, H, 240);
    const moons = [[46, 34, 15, '#c8cad8'], [88, 44, 9, '#9fa4b8'], [128, 26, 6, '#ffc9ec']];
    for (const [mx, my, mr, col] of moons) {
      for (let a = 0; a < 360; a += 2) for (let r = 0; r < mr; r += 1.5) {
        const rad = (a * Math.PI) / 180;
        px(x, mx + Math.cos(rad) * r, my + Math.sin(rad) * r, 2, 2, col);
      }
      for (let i = 0; i < mr * 2; i++) px(x, mx - mr + R() * mr * 2, my - mr + R() * mr * 2, 2, 2, '#7a7f95');
    }
  }
  return tex(c);
}

function signTex(label, accent, tagline) {
  const W = 512, H = 96, { c, x } = cnv(W, H);
  px(x, 0, 0, W, H, '#0d0a12');
  px(x, 0, 0, W, 4, accent); px(x, 0, H - 4, W, 4, accent);
  px(x, 0, 0, 4, H, accent); px(x, W - 4, 0, 4, H, accent);
  pxText(x, label, W / 2, 38, 40, accent);
  pxText(x, tagline.toUpperCase(), W / 2, 74, 15, P.lavender, false);
  return tex(c);
}

function entranceSignTex(name, accent) {
  const W = 384, H = 64, { c, x } = cnv(W, H);
  px(x, 0, 0, W, H, '#0d0a12');
  px(x, 0, 0, W, 3, accent); px(x, 0, H - 3, W, 3, accent);
  pxText(x, name, W / 2, 24, 26, accent);
  pxText(x, 'ENTRANCE', W / 2, 50, 13, P.lavender, false);
  return tex(c);
}

function interiorTex(d) {
  const W = 160, H = 72, { c, x } = cnv(W, H);
  dither(x, 0, 0, W, H, hex(d.room), P.deep, 3);
  px(x, 0, 0, W, 4, hex(d.accent));
  px(x, 0, H - 6, W, 6, P.deep);
  for (let b = 0; b < 4; b++) {
    const X = 6 + b * 39;
    px(x, X, 14, 33, 44, P.night);
    for (let r = 0; r < 3; r++) {
      px(x, X + 2, 18 + r * 14, 29, 2, hex(d.sign));
      for (let i = 0; i < 5; i++) {
        px(x, X + 3 + i * 6, 20 + r * 14, 4, 8,
          [hex(d.accent), hex(d.sign), P.white, P.mint, P.peach][(b + i + r) % 5]);
      }
    }
  }
  motif(x, d.motif, 6, 10, 68, 58, d, 0);
  return tex(c, 2, 1);
}

function tileTex() {
  const S = 64, { c, x } = cnv(S, S);
  px(x, 0, 0, S, S, '#b7a9cc');
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      px(x, i * 16 + 1, j * 16 + 1, 14, 14, ['#cabde0', '#bfb1d6', '#d2c6e6', '#c3b6dc'][(i + j) % 4]);
    }
  }
  stars(x, S, S, 26, ['#e8dff6', '#a493c0']);
  return tex(c, 3, 40);
}

function facadeTex() {
  const W = 192, H = 96, { c, x } = cnv(W, H);
  dither(x, 0, 0, W, H, '#c9b8e0', '#7a4fd0', 3);
  for (let b = 0; b < 5; b++) {
    const y0 = 8 + b * 17;
    px(x, 0, y0, W, 3, ['#ff5fc8', '#40d4c8', '#ffd88a', '#b07cff', '#7bff8a'][b]);
    for (let i = 0; i < 22; i++) px(x, 6 + i * 8, y0 + 6, 5, 7, i % 3 ? '#2a1250' : '#ffd8f0');
  }
  px(x, 0, 0, W, 5, '#fdf6ff');
  stars(x, W, H, 40, ['#ffffff', '#ffc9ec']);
  return tex(c);
}

function bigSignTex() {
  const W = 640, H = 160, { c, x } = cnv(W, H);
  px(x, 0, 0, W, H, '#12081c');
  px(x, 0, 0, W, 6, '#ff5fc8'); px(x, 0, H - 6, W, 6, '#ff5fc8');
  px(x, 0, 0, 6, H, '#ff5fc8'); px(x, W - 6, 0, 6, H, '#ff5fc8');
  pxText(x, 'Wave Mall™', W / 2, 62, 66, '#ff5fc8');
  pxText(x, 'WAVEMALL PRIME · 8 LEVELS · ALWAYS OPEN', W / 2, 124, 22, '#a9f7ff', false);
  return tex(c);
}

function plazaTex() {
  const S = 96, { c, x } = cnv(S, S);
  dither(x, 0, 0, S, S, '#3a2a5c', '#1b1636', 3);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      px(x, i * 24 + 2, j * 24 + 2, 20, 20, (i + j) % 2 ? '#4a3670' : '#3d2c60');
    }
  }
  stars(x, S, S, 60, ['#b6a3c9', '#ffc9ec', '#a9f7ff']);
  return tex(c, 16, 16);
}

function escalatorTex() {
  const S = 64, { c, x } = cnv(S, S);
  px(x, 0, 0, S, S, '#3a4560');
  for (let i = 0; i < 8; i++) {
    px(x, 0, i * 8, S, 5, '#5a6a90');
    px(x, 0, i * 8 + 5, S, 1, '#a9f7ff');
    for (let j = 0; j < 8; j++) px(x, j * 8 + 3, i * 8 + 1, 2, 3, '#8fa0c0');
  }
  return tex(c, 1, 6);
}

function ceilingTex(d) {
  const W = 128, H = 128, { c, x } = cnv(W, H);
  dither(x, 0, 0, W, H, '#1b1636', P.night, 3);
  px(x, 8, 0, 6, H, hex(d.accent));
  px(x, 60, 0, 4, H, P.white);
  px(x, 110, 0, 6, H, hex(d.sign));
  return tex(c, 3, 12);
}

// Causeway deck: a lit magenta runner with chevrons pointing at the doors.
function causewayTex() {
  const W = 64, H = 128, { c, x } = cnv(W, H);
  px(x, 0, 0, W, H, '#2a0f22');
  dither(x, 0, 0, W, H, '#3d1630', '#1b0a18', 3);
  px(x, 0, 0, 4, H, '#ff5fc8'); px(x, W - 4, 0, 4, H, '#ff5fc8');
  for (const cy of [H * 0.3, H * 0.8]) {
    for (let i = 0; i < 22; i++) {
      px(x, 12 + i, cy - 11 + i, 3, 3, '#ffb3e2');
      px(x, W - 15 - i, cy - 11 + i, 3, 3, '#ffb3e2');
    }
  }
  return tex(c, 1, 6);
}

/* ---------------------------------------------------------- portal material */
const PORTAL_FRAG = `
uniform float u_time; uniform vec3 u_a; uniform vec3 u_b; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5); }
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float sw = sin(a * 3.0 + u_time * 1.4 - r * 9.0) * 0.5 + 0.5;
  float ring = smoothstep(1.0, 0.72, r) * smoothstep(0.0, 0.25, r);
  vec3 col = mix(u_b, u_a, sw * ring);
  col += vec3(1.0) * pow(1.0 - abs(r - 0.82) * 6.0, 4.0);
  float core = smoothstep(0.34, 0.0, r);
  col = mix(col, vec3(0.02, 0.0, 0.06), core);
  col = floor(col * 12.0) / 12.0;
  float alpha = smoothstep(1.0, 0.9, r);
  if (h(floor(vUv * 64.0)) < 0.04) col += 0.25;
  gl_FragColor = vec4(col, alpha);
}`;
const PORTAL_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

/* ----------------------------------------------------------------------
 * Placement helpers — unrotated object space on planet.surface
 * ------------------------------------------------------------------- */
const _yAxis = new THREE.Vector3(0, 1, 0);

// dirLocal is already in planet.surface's UNROTATED local frame (the host
// hands us a surface-local up), so no world-quaternion un-rotation here.
function orientOnSurface(obj, planet, dirLocal, yawRad = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(_yAxis, dirLocal);
  const yawQ = new THREE.Quaternion().setFromAxisAngle(_yAxis, yawRad);
  obj.quaternion.copy(q).multiply(yawQ);
}

// Full radial distance to the terrain along a surface-local direction.
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

/* ======================================================================
 * THE MALL
 * ==================================================================== */

// Escalator geometry for level i, side sx. The run alternates direction each
// level, so the walk from L1 to L8 zig-zags the length of the atrium — which
// is what makes eight floors feel like a mall and not a lift shaft.
function escSpec(i, sx) {
  const dir = i % 2 ? 1 : -1;
  const zc = dir * (15 + sx * 5);
  return {
    dir, zc,
    zA: zc - dir * (ESC_RUN / 2),          // foot of the run
    zB: zc + dir * (ESC_RUN / 2),          // head of the run
    zBot: zc - dir * (ESC_RUN / 2 + 2.6),  // bottom landing center
    zTop: zc + dir * (ESC_RUN / 2 + 2.6),  // top landing center
    x: sx * 7.5,                           // tread center
    lx: sx * 8.6,                          // landing center
  };
}

/**
 * The eight stacked levels: decks, promenades, storefronts, walk-in stores,
 * balustrades, marquees, escalators and portals. Pushes both the visuals and
 * the matching makeStructure records into ctx.
 */
function buildMallLevels(ctx) {
  const { group, anim, surf, wall } = ctx;
  const terrazzo = ctx.own(relief(new THREE.MeshStandardMaterial({
    color: 0x9a94a8, roughness: 0.22, metalness: 0.55,
  }), ctx.materials, 'concrete', 6, 0.35));
  const shell = ctx.own(new THREE.MeshStandardMaterial({
    color: 0x2b2350, roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide,
  }));

  // Outer shell walls behind the shops — they keep the light and the fog in,
  // and give the building a silhouette from the plaza.
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(ctx.geo(new THREE.PlaneGeometry(OUT_Z * 2 + FZ - OUT_Z, BLD_H)), shell);
    m.position.set(sx * OUT_X, BLD_H / 2 - 6, (FZ - OUT_Z) / 2);
    m.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(m);
  }
  // Back wall (-Z) and the plinth skirt that buries the building in the
  // curving ground (the floors are flat, the planet is not).
  const back = new THREE.Mesh(ctx.geo(new THREE.PlaneGeometry(OUT_X * 2, BLD_H)), shell);
  back.position.set(0, BLD_H / 2 - 6, -OUT_Z);
  group.add(back);
  const plinth = new THREE.Mesh(
    ctx.geo(new THREE.BoxGeometry(OUT_X * 2 + 1, 16, OUT_Z + FZ)),
    ctx.own(relief(new THREE.MeshStandardMaterial({ color: 0x241c40, roughness: 0.8 }), ctx.materials, 'concrete', 8, 0.5))
  );
  plinth.position.set(0, -8.2, (FZ - OUT_Z) / 2);
  group.add(plinth);

  const escBase = ctx.tex('*', 'esc', () => escalatorTex());

  DEPTS.forEach((d, i) => {
    const y = i * FLOOR_H;
    const g = new THREE.Group();
    g.position.y = y;
    group.add(g);
    const acc = new THREE.Color(d.accent), sgn = new THREE.Color(d.sign);
    const dEM = (d.em ?? 1) * EM;

    /* --- slabs: two side decks + two end bridges + (L1) the concourse --- */
    const sideW = OUT_X - VOID_X;
    for (const sx of [-1, 1]) {
      const deck = new THREE.Mesh(ctx.geo(new THREE.BoxGeometry(sideW, 0.8, OUT_Z * 2)), terrazzo);
      deck.position.set(sx * (VOID_X + sideW / 2), -0.4, 0);
      g.add(deck);
      const pave = ctx.tex(d, 'tile', () => tileTex()).clone();
      pave.needsUpdate = true;
      const prom = new THREE.Mesh(
        ctx.geo(new THREE.PlaneGeometry(STORE_X - VOID_X, OUT_Z * 2)),
        ctx.own(new THREE.MeshStandardMaterial({ map: pave, roughness: 0.62, metalness: 0.12 }))
      );
      prom.rotation.x = -Math.PI / 2;
      prom.position.set(sx * (VOID_X + (STORE_X - VOID_X) / 2), 0.03, 0);
      g.add(prom);
      const guide = new THREE.Mesh(
        ctx.geo(new THREE.BoxGeometry(0.3, 0.06, OUT_Z * 2 - 4)),
        ctx.dim(new THREE.MeshStandardMaterial({ color: sgn, emissive: sgn, emissiveIntensity: 0.7 * dEM }))
      );
      guide.position.set(sx * (VOID_X + 2.4), 0.08, 0);
      g.add(guide);

      // One walkable record covers promenade + storefront line + store depth.
      surf.push({ x0: sx > 0 ? VOID_X : -OUT_X, x1: sx > 0 ? OUT_X : -VOID_X,
        z0: -OUT_Z, z1: OUT_Z, y });
    }
    for (const sz of [-1, 1]) {
      const br = new THREE.Mesh(ctx.geo(new THREE.BoxGeometry(VOID_X * 2, 0.8, OUT_Z - VOID_Z)), terrazzo);
      br.position.set(0, -0.4, sz * (VOID_Z + (OUT_Z - VOID_Z) / 2));
      g.add(br);
      surf.push({ x0: -VOID_X, x1: VOID_X,
        z0: sz > 0 ? VOID_Z : -OUT_Z, z1: sz > 0 ? OUT_Z : -VOID_Z, y });
    }

    /* --- storefronts: walk-in bays down both sides --- */
    const stripBase = ctx.tex(d, 'strip', () => storefrontStrip(d));
    const partyMat = ctx.own(new THREE.MeshStandardMaterial({ color: d.room, roughness: 0.72 }));
    for (const sx of [-1, 1]) {
      const segs = [];
      for (const bz of BAYS) {
        segs.push([bz - BAY_W / 2, bz - DOOR / 2]);
        segs.push([bz + DOOR / 2, bz + BAY_W / 2]);
      }
      for (const [z0, z1] of segs) {
        const L = z1 - z0;
        const map = stripBase.clone(); map.needsUpdate = true;
        map.repeat.set(L / 15, 1);
        map.offset.x = (z0 + OUT_Z) / 15;
        const w = new THREE.Mesh(
          ctx.geo(new THREE.PlaneGeometry(L, WALL_H)),
          ctx.dim(new THREE.MeshStandardMaterial({
            map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.5 * dEM,
            roughness: 0.42, metalness: 0.2, side: THREE.DoubleSide,
          }))
        );
        w.position.set(sx * STORE_X, WALL_H / 2, (z0 + z1) / 2);
        w.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(w);
        // Solid between the doorways; the gaps ARE the entrances.
        wall.push({ x0: sx * STORE_X - 0.4, x1: sx * STORE_X + 0.4,
          z0, z1, y0: y, y1: y + WALL_H });
      }
      for (let k = 0; k <= BAYS.length; k++) {
        const div = new THREE.Mesh(ctx.geo(new THREE.BoxGeometry(OUT_X - STORE_X, WALL_H, 0.5)), partyMat);
        div.position.set(sx * (STORE_X + (OUT_X - STORE_X) / 2), WALL_H / 2, -OUT_Z + k * BAY_W);
        g.add(div);
        wall.push({
          x0: Math.min(sx * STORE_X, sx * OUT_X), x1: Math.max(sx * STORE_X, sx * OUT_X),
          z0: -OUT_Z + k * BAY_W - 0.3, z1: -OUT_Z + k * BAY_W + 0.3,
          y0: y, y1: y + WALL_H,
        });
      }
      for (const bz of BAYS) addStore(ctx, g, d, sx, bz, DOOR, 13);

      const fascia = new THREE.Mesh(
        ctx.geo(new THREE.BoxGeometry(0.45, 0.5, OUT_Z * 2)),
        ctx.dim(new THREE.MeshStandardMaterial({ color: acc, emissive: acc, emissiveIntensity: 1.0 * dEM, roughness: 0.4 }))
      );
      fascia.position.set(sx * (STORE_X - 0.3), WALL_H + 0.3, 0);
      g.add(fascia);
      const kick = new THREE.Mesh(
        ctx.geo(new THREE.BoxGeometry(0.2, 0.14, OUT_Z * 2)),
        ctx.dim(new THREE.MeshStandardMaterial({ color: sgn, emissive: sgn, emissiveIntensity: 0.8 * dEM }))
      );
      kick.position.set(sx * (STORE_X - 0.25), 0.18, 0);
      g.add(kick);

      /* --- glass balustrade at the void edge, open at every landing ---
       * Level 0 has no drop to guard (the concourse is the same slab), so it
       * stays clear and you can walk straight off the promenade. */
      if (i > 0) {
        const gaps = [];
        if (i < LEVELS - 1) gaps.push(escSpec(i, sx).zBot);
        if (i > 0) gaps.push(escSpec(i - 1, sx).zTop);
        gaps.sort((a, b) => a - b);
        const runs = [];
        let z0 = -VOID_Z;
        for (const gz of gaps) {
          if (gz - LAND_HD - 1.3 > z0) runs.push([z0, gz - LAND_HD - 1.3]);
          z0 = Math.max(z0, gz + LAND_HD + 1.3);
        }
        if (z0 < VOID_Z) runs.push([z0, VOID_Z]);
        for (const [a, b] of runs) {
          const L = b - a, zc2 = (a + b) / 2;
          const glass = new THREE.Mesh(
            ctx.geo(new THREE.BoxGeometry(0.12, 1.15, L)),
            ctx.own(new THREE.MeshStandardMaterial({
              color: 0x9ff2d8, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0,
            }))
          );
          glass.position.set(sx * (VOID_X - 0.06), 0.75, zc2);
          g.add(glass);
          const rail = new THREE.Mesh(
            ctx.geo(new THREE.BoxGeometry(0.22, 0.16, L)),
            ctx.dim(new THREE.MeshStandardMaterial({ color: sgn, emissive: sgn, emissiveIntensity: 1.0 * dEM }))
          );
          rail.position.set(sx * (VOID_X - 0.06), 1.4, zc2);
          g.add(rail);
          // Chest-high: it stops a walk, but at 0.2 g a jump clears it. That
          // is deliberate — hopping the rail into the atrium is the ride.
          wall.push({ x0: sx * VOID_X - 0.35, x1: sx * VOID_X + 0.35,
            z0: a, z1: b, y0: y, y1: y + RAIL_H });
          for (const e of [a, b]) {
            const post = new THREE.Mesh(
              ctx.geo(new THREE.BoxGeometry(0.3, RAIL_H, 0.3)),
              ctx.own(new THREE.MeshStandardMaterial({ color: 0xe4dff2, roughness: 0.3, metalness: 0.5 }))
            );
            post.position.set(sx * (VOID_X - 0.06), RAIL_H / 2, e);
            g.add(post);
          }
        }
      }
    }

    /* --- ceilings over the shop decks --- */
    const ceilMap = ctx.tex(d, 'ceil', () => ceilingTex(d));
    const ceilMat = ctx.dim(new THREE.MeshStandardMaterial({
      map: ceilMap, emissiveMap: ceilMap, emissive: 0xffffff, emissiveIntensity: 0.28 * dEM,
      roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide,
    }));
    for (const sx of [-1, 1]) {
      const ceil = new THREE.Mesh(ctx.geo(new THREE.PlaneGeometry(OUT_X - VOID_X, OUT_Z * 2)), ceilMat);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(sx * (VOID_X + (OUT_X - VOID_X) / 2), FLOOR_H - 0.9, 0);
      g.add(ceil);
    }

    /* --- end vistas: giant windows at both ends of the atrium ---
     * The ground floor's +Z end is the way in, so its window is a doorway. */
    const vista = ctx.own(new THREE.MeshBasicMaterial({ map: ctx.tex(d, 'vista', () => vistaTex(d)) }));
    for (const sz of [-1, 1]) {
      if (i === 0 && sz > 0) continue; // the entrance takes this wall
      const w = new THREE.Mesh(ctx.geo(new THREE.PlaneGeometry(24, 8)), vista);
      w.position.set(0, 4.4, sz * (OUT_Z - 0.4));
      w.rotation.y = sz > 0 ? Math.PI : 0;
      g.add(w);
      const frame = new THREE.Mesh(
        ctx.geo(new THREE.BoxGeometry(25.4, 9.4, 0.5)),
        ctx.dim(new THREE.MeshStandardMaterial({ color: 0x1b1636, emissive: acc, emissiveIntensity: 0.5 * dEM }))
      );
      frame.position.set(0, 4.4, sz * (OUT_Z + 0.3));
      g.add(frame);
    }
    // End walls across the atrium mouth. On L1 the +Z wall keeps only its
    // jambs so the vestibule leads in.
    for (const sz of [-1, 1]) {
      if (i === 0 && sz > 0) {
        for (const sx of [-1, 1]) {
          wall.push({ x0: sx > 0 ? VOID_X : -OUT_X, x1: sx > 0 ? OUT_X : -VOID_X,
            z0: OUT_Z - 0.5, z1: OUT_Z + 0.5, y0: y, y1: y + WALL_H });
        }
        continue;
      }
      wall.push({ x0: -OUT_X, x1: OUT_X, z0: sz * OUT_Z - 0.5, z1: sz * OUT_Z + 0.5,
        y0: y, y1: y + FLOOR_H });
    }

    /* --- hanging department marquees over the atrium --- */
    const signMat = ctx.own(new THREE.MeshBasicMaterial({
      map: ctx.tex(d, 'sign', () => signTex(d.name, hex(d.sign), d.tag)),
      transparent: true, side: THREE.FrontSide,
    }));
    for (const sz of [-1, 1]) {
      const holder = new THREE.Group();
      for (const face of [0, Math.PI]) {
        const sign = new THREE.Mesh(ctx.geo(new THREE.PlaneGeometry(17, 3.2)), signMat);
        sign.position.y = -1.9; sign.position.z = face ? -0.06 : 0.06;
        sign.rotation.y = face; holder.add(sign);
      }
      for (const hx of [-7, 7]) {
        const wire = new THREE.Mesh(
          ctx.geo(new THREE.CylinderGeometry(0.05, 0.05, 1.8)),
          ctx.own(new THREE.MeshStandardMaterial({ color: 0x8fa0c0, metalness: 0.8, roughness: 0.3 }))
        );
        wire.position.set(hx, -0.9, 0); holder.add(wire);
      }
      holder.position.set(0, FLOOR_H - 0.7, sz * 26);
      g.add(holder);
      anim.push({ o: holder, k: 'sway', p: ctx.rng() * 6.28, a: 0.035 });
    }

    /* --- hanging lamps down the corridor --- */
    for (let k = 0; k < 5; k++) {
      const z = -60 + k * 30;
      for (const sx of [-1, 1]) {
        const lamp = new THREE.Group();
        const cord = new THREE.Mesh(
          ctx.geo(new THREE.CylinderGeometry(0.03, 0.03, 1.8)),
          ctx.own(new THREE.MeshBasicMaterial({ color: 0x6a7a9a }))
        );
        cord.position.y = -0.9; lamp.add(cord);
        const bulb = new THREE.Mesh(
          ctx.geo(new THREE.BoxGeometry(0.6, 0.75, 0.6)),
          ctx.dim(new THREE.MeshStandardMaterial({
            color: sgn, emissive: sgn, emissiveIntensity: 0.85 * dEM, transparent: true, opacity: 0.9,
          }))
        );
        bulb.position.y = -2.2; lamp.add(bulb);
        lamp.position.set(sx * (VOID_X + 4.5), FLOOR_H - 1.1, z);
        g.add(lamp);
        anim.push({ o: lamp, k: 'sway', p: k + (sx > 0 ? 1.7 : 0), a: 0.06 });
      }
    }

    /* --- portals: dimensional doorways punched into the shopfront line --- */
    if (i === 1 || i === 3 || i === 5 || i === 7) {
      for (const sx of [-1, 1]) {
        const mat = ctx.own(new THREE.ShaderMaterial({
          vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG, transparent: true,
          uniforms: {
            u_time: { value: 0 },
            u_a: { value: new THREE.Color(0xb07cff) },
            u_b: { value: new THREE.Color(0x2a1250) },
          },
        }));
        const po = new THREE.Mesh(ctx.geo(new THREE.PlaneGeometry(3.6, 5.4)), mat);
        po.position.set(sx * (STORE_X - 0.35), 2.9, i % 2 ? -18 : 18);
        po.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(po);
        anim.push({ o: po, k: 'portal' });
        const halo = new THREE.Mesh(
          ctx.geo(new THREE.TorusGeometry(2.6, 0.16, 8, 24)),
          ctx.dim(new THREE.MeshStandardMaterial({ color: 0xb07cff, emissive: 0xb07cff, emissiveIntensity: 1.5 * EM }))
        );
        halo.position.copy(po.position); halo.rotation.y = po.rotation.y;
        halo.scale.set(0.75, 1.05, 1);
        g.add(halo);
      }
    }

    /* --- escalators up to the next level --- */
    if (i < LEVELS - 1) {
      for (const sx of [-1, 1]) {
        const e = escSpec(i, sx);
        const ang = Math.atan2(FLOOR_H, ESC_RUN), len = Math.hypot(FLOOR_H, ESC_RUN);
        const grp = new THREE.Group();
        const stepMat = ctx.own(new THREE.MeshStandardMaterial({
          map: escBase.clone(), roughness: 0.5, metalness: 0.6, emissive: 0x2a3a5a, emissiveIntensity: 0.4 * EM,
        }));
        stepMat.map.repeat.set(1, 6); stepMat.map.needsUpdate = true;
        ctx.textures.push(stepMat.map);
        const tread = new THREE.Mesh(ctx.geo(new THREE.BoxGeometry(ESC_W, 0.5, len)), stepMat);
        grp.add(tread);
        anim.push({ o: stepMat.map, k: 'scroll', s: 0.35 * e.dir });
        for (const bx of [-ESC_W / 2 - 0.2, ESC_W / 2 + 0.2]) {
          const bal = new THREE.Mesh(
            ctx.geo(new THREE.BoxGeometry(0.28, 1.5, len)),
            ctx.own(new THREE.MeshStandardMaterial({ color: 0x9ff2d8, transparent: true, opacity: 0.2, roughness: 0.05 }))
          );
          bal.position.set(bx, 0.9, 0); grp.add(bal);
          const cap = new THREE.Mesh(
            ctx.geo(new THREE.BoxGeometry(0.34, 0.16, len)),
            ctx.dim(new THREE.MeshStandardMaterial({ color: 0xa9f7ff, emissive: 0xa9f7ff, emissiveIntensity: 1.1 * EM }))
          );
          cap.position.set(bx, 1.7, 0); grp.add(cap);
        }
        grp.rotation.x = -ang * e.dir;
        grp.position.set(e.x, FLOOR_H / 2, e.zc);
        g.add(grp);

        // The walkable ramp. makeStructure interpolates a ramp along z, which
        // is exactly the axis this run climbs, so the collision surface and
        // the visible treads are the same plane.
        surf.push({
          ramp: true,
          x0: e.x - ESC_W / 2, x1: e.x + ESC_W / 2,
          z0: Math.min(e.zA, e.zB), z1: Math.max(e.zA, e.zB),
          zA: e.zA, zB: e.zB, yA: y, yB: y + FLOOR_H,
        });
        // Landings at both ends, bridging the run back onto the deck.
        for (const [ly, lz] of [[-0.4, e.zBot], [FLOOR_H - 0.4, e.zTop]]) {
          const land = new THREE.Mesh(ctx.geo(new THREE.BoxGeometry(LAND_HW * 2, 0.8, LAND_HD * 2)), terrazzo);
          land.position.set(e.lx, ly, lz); g.add(land);
          const edge = new THREE.Mesh(
            ctx.geo(new THREE.BoxGeometry(LAND_HW * 2, 0.14, 0.24)),
            ctx.dim(new THREE.MeshStandardMaterial({ color: 0xa9f7ff, emissive: 0xa9f7ff, emissiveIntensity: 0.9 * EM }))
          );
          edge.position.set(e.lx, ly + 0.48, lz + e.dir * (ly < 0 ? LAND_HD : -LAND_HD));
          g.add(edge);
          surf.push({
            x0: e.lx - LAND_HW, x1: e.lx + LAND_HW,
            z0: lz - LAND_HD, z1: lz + LAND_HD,
            y: y + (ly < 0 ? 0 : FLOOR_H),
          });
        }
      }
    }

    ctx.floors.push({ level: i, y, dept: d, group: g });
  });

  /* --- ground concourse under the atrium --- */
  const floorMat = ctx.own(relief(new THREE.MeshStandardMaterial({
    color: 0x6f6a82, roughness: 0.12, metalness: 0.8,
  }), ctx.materials, 'concrete', 8, 0.3));
  const concourse = new THREE.Mesh(ctx.geo(new THREE.PlaneGeometry(VOID_X * 2, OUT_Z * 2)), floorMat);
  concourse.rotation.x = -Math.PI / 2; concourse.position.y = 0.01;
  group.add(concourse);
  const inlayMap = ctx.tex(DEPTS[0], 'carpet', () => carpetTex(DEPTS[0])).clone();
  ctx.textures.push(inlayMap);
  const inlay = new THREE.Mesh(
    ctx.geo(new THREE.PlaneGeometry(VOID_X * 2 - 2, OUT_Z * 2 - 4)),
    ctx.own(new THREE.MeshStandardMaterial({ map: inlayMap, roughness: 0.3, metalness: 0.45, transparent: true, opacity: 0.85 }))
  );
  inlay.rotation.x = -Math.PI / 2; inlay.position.y = 0.04;
  group.add(inlay);
  surf.push({ x0: -VOID_X, x1: VOID_X, z0: -VOID_Z, z1: VOID_Z, y: 0 });
}

/* ------------------------------- one department store: entrance + interior
 * Local frame: +x = deeper into the store, +z = along the corridor. */
function addStore(ctx, g, d, sx, ez, gap, wz) {
  const { anim } = ctx;
  const sgn = new THREE.Color(d.sign);
  const dEM = (d.em ?? 1) * EM;
  const s = new THREE.Group();
  s.position.set(sx * (STORE_X + 7.5), 0, ez);
  s.rotation.y = sx > 0 ? 0 : Math.PI;
  g.add(s);

  // Static, non-glowing pieces merge into one mesh per bay (draw calls).
  const matte = [];
  const UNIT = ctx.unitBox;
  const bake = (sc, pos, col) => {
    const geo = UNIT.clone();
    geo.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]), new THREE.Quaternion(),
      new THREE.Vector3(sc[0], sc[1], sc[2])));
    const c = new THREE.Color(col);
    const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geo.deleteAttribute('uv');
    matte.push(geo);
  };

  // entrance jambs + header + name sign
  for (const j of [-1, 1]) bake([1.1, WALL_H, 1.7], [-7.7, WALL_H / 2, j * (gap / 2 + 0.85)], 0xe4dff2);
  bake([1.1, 1.5, gap + 3.4], [-7.7, WALL_H - 1.2, 0], 0x120e22);
  const nameSign = new THREE.Mesh(
    ctx.geo(new THREE.PlaneGeometry(13, 1.45)),
    ctx.own(new THREE.MeshBasicMaterial({
      map: ctx.tex(d, 'ent' + ez, () => entranceSignTex(
        d.stores[(ez < -30 ? 0 : ez < 30 ? 1 : 2) % d.stores.length], hex(d.sign))),
      transparent: true,
    }))
  );
  nameSign.position.set(-8.3, WALL_H - 1.2, 0); nameSign.rotation.y = -Math.PI / 2; s.add(nameSign);
  const sill = new THREE.Mesh(
    ctx.geo(new THREE.BoxGeometry(1.6, 0.16, gap)),
    ctx.dim(new THREE.MeshStandardMaterial({ color: sgn, emissive: sgn, emissiveIntensity: 0.9 * dEM }))
  );
  sill.position.set(-7.6, 0.1, 0); s.add(sill);

  // open glass doors either side of the walk-through gap
  for (const j of [-1, 1]) {
    const leaf = new THREE.Mesh(
      ctx.geo(new THREE.BoxGeometry(0.12, 5.0, 4.4)),
      ctx.own(new THREE.MeshStandardMaterial({ color: 0x9ff2d8, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0 }))
    );
    leaf.position.set(-7.2, 2.6, j * (gap / 2 - 2.4)); s.add(leaf);
  }

  // interior shell: carpet, back wall, ceiling coves
  const floorTex = ctx.tex(d, 'carpet', () => carpetTex(d)).clone();
  floorTex.repeat.set(2, wz / 10); floorTex.needsUpdate = true;
  ctx.textures.push(floorTex);
  const carpet = new THREE.Mesh(
    ctx.geo(new THREE.PlaneGeometry(15, wz - 1)),
    ctx.own(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6, metalness: 0.1 }))
  );
  carpet.rotation.x = -Math.PI / 2; carpet.position.set(0.4, 0.06, 0); s.add(carpet);

  const iTex = ctx.tex(d, 'interior', () => interiorTex(d)).clone();
  iTex.repeat.set(wz / 26, 1); iTex.needsUpdate = true;
  ctx.textures.push(iTex);
  const back = new THREE.Mesh(
    ctx.geo(new THREE.PlaneGeometry(wz - 1, WALL_H - 1)),
    ctx.dim(new THREE.MeshStandardMaterial({
      map: iTex, emissiveMap: iTex, emissive: 0xffffff, emissiveIntensity: 0.7 * dEM, roughness: 0.6,
    }))
  );
  back.position.set(7.6, (WALL_H - 1) / 2, 0); back.rotation.y = -Math.PI / 2; s.add(back);

  const sideMat = ctx.own(new THREE.MeshStandardMaterial({ color: d.room, roughness: 0.7 }));
  for (const j of [-1, 1]) {
    const side = new THREE.Mesh(ctx.geo(new THREE.PlaneGeometry(15, WALL_H - 1)), sideMat);
    side.position.set(0.4, (WALL_H - 1) / 2, j * (wz / 2 - 0.4));
    side.rotation.y = j > 0 ? Math.PI : 0; s.add(side);
  }
  const coveGeo = [];
  for (const cz of [-wz * 0.36, -wz * 0.12, wz * 0.12, wz * 0.36]) {
    const cg = new THREE.BoxGeometry(12, 0.16, 0.5);
    cg.translate(1, WALL_H - 1.2, cz); cg.deleteAttribute('uv'); coveGeo.push(cg);
  }
  const coves = new THREE.Mesh(
    ctx.geo(mergeGeometries(coveGeo)),
    ctx.dim(new THREE.MeshStandardMaterial({ color: 0xfff4ff, emissive: 0xfff4ff, emissiveIntensity: 1.2 * dEM }))
  );
  for (const cg of coveGeo) cg.dispose();
  s.add(coves);
  const lit = new THREE.Mesh(
    ctx.geo(new THREE.PlaneGeometry(13, wz - 2)),
    ctx.dim(new THREE.MeshStandardMaterial({
      color: 0xf6eeff, emissive: 0xf6eeff, emissiveIntensity: 0.4 * dEM, side: THREE.FrontSide,
    }))
  );
  lit.rotation.x = Math.PI / 2; lit.position.set(1, WALL_H - 1, 0); s.add(lit);

  // fixtures — themed per department, walk-in showroom scale
  const UB = ctx.unitBox, UC = ctx.unitCyl, US = ctx.unitSphere;
  const MINT = 0x9ff2d8, WHT = 0xfdf6ff, SIL = 0xc8d0e0, GOLD = 0xffd88a, DARK = 0x241a3a;
  let zOff = 0;
  const put = (k, sz, p, col, em = 0.22, spin) => {
    if (!spin && em < 0.45 && k === 'b') {
      bake(sz, [p[0], p[1], p[2] + zOff], col);
      return null;
    }
    const m = new THREE.Mesh(k === 'c' ? UC : k === 's' ? US : UB,
      ctx.dim(new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: em * dEM, roughness: 0.35, metalness: 0.28,
      })));
    m.scale.set(sz[0], sz[1], sz[2]);
    m.position.set(p[0], p[1], p[2] + zOff);
    s.add(m);
    if (spin) anim.push({ o: m, k: 'spin', s: spin });
    return m;
  };

  for (zOff of [-wz * 0.26, wz * 0.06]) {
    switch (d.motif) {
      case 'decor':
        put('b', [5.2, 1.0, 2.2], [3.4, 0.5, -4.4], MINT, 0.3);
        put('b', [5.2, 1.1, 0.6], [3.4, 1.2, -5.4], MINT, 0.3);
        put('b', [2.0, 0.9, 2.0], [-0.6, 0.45, 3.4], MINT, 0.3);
        put('b', [2.0, 0.9, 2.0], [2.6, 0.45, 5.2], MINT, 0.3);
        put('b', [2.8, 0.5, 1.8], [1.4, 0.45, 0.6], WHT, 0.2);
        put('b', [1.3, 0.9, 0.12], [1.4, 1.2, 0.6], 0x5fd0ff, 0.9);
        put('c', [0.18, 3.2, 0.18], [6.2, 1.6, 4.8], SIL, 0.1);
        put('s', [1.3, 1.0, 1.3], [6.2, 3.3, 4.8], d.sign, 0.9);
        put('b', [1.6, 1.2, 1.4], [-6.4, 0.6, -5.2], 0x3aa85c, 0.3);
        put('b', [1.2, 2.0, 1.2], [-6.4, 1.8, -5.2], 0x7bff8a, 0.35);
        break;
      case 'lab':
        for (let t = 0; t < 4; t++) {
          put('c', [0.8, 3.4, 0.8], [5.4, 1.7, -4.8 + t * 3.1],
            [0x7bff8a, 0xff8a33, 0x5fd0ff, 0xff5fa8][t], 0.75);
        }
        put('b', [3.2, 1.0, 1.7], [-1.4, 0.5, -4.6], DARK, 0.1);
        put('b', [2.4, 1.3, 0.12], [-1.4, 1.7, -4.6], 0x7bff8a, 1.0);
        put('s', [2.6, 2.6, 2.6], [1.8, 2.8, 3.8], d.accent, 0.7, 0.25);
        put('c', [1.8, 3.0, 1.8], [6.0, 1.5, 4.6], SIL, 0.15);
        put('b', [2.0, 0.5, 2.0], [1.8, 0.25, 3.8], SIL, 0.2);
        break;
      case 'circuit':
        for (let t = 0; t < 6; t++) {
          put('b', [0.16, 1.1, 1.7], [6.8, 1.6 + (t % 3) * 1.5, -4.6 + Math.floor(t / 3) * 6.4], 0x5fd0ff, 0.9);
        }
        put('b', [4.2, 1.0, 1.8], [-1.2, 0.5, -4.4], SIL, 0.15);
        put('b', [2.0, 0.9, 0.9], [-1.2, 1.4, -4.4], DARK, 0.15);
        put('b', [2.4, 0.25, 1.4], [1.6, 1.1, 3.6], 0x40b0ff, 0.8);
        put('b', [2.6, 1.0, 1.8], [1.6, 0.5, 3.6], DARK, 0.1);
        put('b', [0.4, 3.2, 6.0], [6.4, 1.6, 0], DARK, 0.1);
        break;
      case 'gifts':
        for (let t = 0; t < 6; t++) {
          put('b', [1.2, 1.2, 1.2],
            [-2 + (t % 3) * 3.4, 2.2 + (t % 2) * 1.4, -4.4 + Math.floor(t / 3) * 8],
            [0xff5fa8, 0x5fd0ff, GOLD, 0x7bff8a, WHT, 0xb07cff][t], 0.55, 0.35);
        }
        for (const pz of [-4.4, 0, 4.4]) put('c', [1.4, 1.1, 1.4], [4.6, 0.55, pz], WHT, 0.3);
        put('b', [0.2, 2.6, 4.4], [6.8, 3.0, 0], 0x2a1250, 0.55);
        break;
      case 'clothes':
        for (const rz of [-4.4, 4.4]) {
          put('b', [4.4, 0.14, 0.14], [-0.6, 2.0, rz], SIL, 0.2);
          for (let t = 0; t < 5; t++) {
            put('b', [0.5, 1.5, 0.9], [-2.4 + t * 0.9, 1.2, rz],
              [0x5fd0ff, 0xff5fa8, GOLD, 0x7bff8a, WHT][t], 0.35);
          }
        }
        for (const mz of [-1.4, 1.8]) {
          put('c', [0.8, 1.7, 0.8], [4.4, 0.85, mz], SIL, 0.25);
          put('s', [0.6, 0.6, 0.6], [4.4, 1.95, mz], SIL, 0.25);
        }
        put('b', [0.16, 3.4, 2.6], [6.9, 2.0, -4.2], 0xd8cdf0, 0.45);
        put('b', [3.2, 0.5, 1.2], [1.6, 0.4, 0], WHT, 0.2);
        break;
      case 'numbers':
        for (let t = 0; t < 5; t++) {
          put('b', [0.9, 1.4 + t * 0.5, 0.9], [-1 + t * 2.2, (1.4 + t * 0.5) / 2, 4.4],
            t % 2 ? GOLD : d.accent, 0.6);
        }
        for (const dz of [-5.0, -1.4]) {
          put('b', [3.0, 1.0, 1.6], [-1.6, 0.5, dz], DARK, 0.1);
          put('b', [2.2, 1.2, 0.12], [-1.6, 1.6, dz], 0x7bff8a, 0.95);
        }
        put('b', [0.2, 2.6, 4.2], [6.8, 3.0, -2], GOLD, 0.5);
        put('c', [1.2, 1.0, 1.2], [4.8, 0.5, -4.6], WHT, 0.25);
        break;
      case 'sport':
        put('b', [2.6, 0.8, 2.6], [-1.2, 0.4, -4.4], DARK, 0.12);
        for (let t = 0; t < 3; t++) {
          put('s', [1.1, 1.1, 1.1], [-2 + t * 0.9, 1.1, -4.4 + (t % 2) * 0.7],
            [0xff8a33, WHT, 0x40d4c8][t], 0.4, t === 1 ? 0.4 : 0);
        }
        for (let t = 0; t < 4; t++) {
          put('b', [0.16, 1.9, 1.5], [6.8, 2.6, -4.6 + t * 3.1],
            [0x7bff8a, WHT, 0x40d4c8, GOLD][t], 0.5);
        }
        put('b', [3.4, 0.5, 1.2], [1.8, 0.4, 4.6], SIL, 0.2);
        put('b', [0.2, 1.7, 2.6], [5.6, 4.2, 3.0], WHT, 0.4);
        put('c', [1.5, 0.14, 1.5], [4.4, 3.4, 3.0], 0xff8a33, 0.7);
        break;
      default: // stage
        for (const az of [-4.6, 4.6]) {
          put('b', [2.2, 2.4, 1.6], [-1.0, 1.2, az], DARK, 0.12);
          put('b', [1.6, 0.5, 0.2], [-1.0, 1.9, az - 0.85], d.accent, 0.7);
        }
        for (let t = 0; t < 3; t++) {
          put('c', [1.2, 1.1, 1.2], [4.6, 0.55, -4.4 + t * 4.4], 0x2a1250, 0.15);
          put('s', [0.9, 1.1, 0.9], [4.6, 1.6, -4.4 + t * 4.4], GOLD, 0.6);
        }
        put('s', [1.8, 1.8, 1.8], [1.6, 4.4, 0], SIL, 0.65, 0.6);
        put('b', [0.6, 2.6, 1.0], [6.6, 1.3, -3.4], 0xb07cff, 0.4);
        break;
    }
  }

  if (matte.length) {
    const merged = mergeGeometries(matte);
    for (const mg of matte) mg.dispose();
    s.add(new THREE.Mesh(ctx.geo(merged), ctx.dim(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.4, metalness: 0.25,
      emissive: 0xffffff, emissiveIntensity: 0.06 * dEM,
    }))));
  }
}

/**
 * Feluzia's finale on the top level — the far end of L8 is a stage.
 */
function buildStage(ctx) {
  const { group, anim } = ctx;
  const g = new THREE.Group();
  g.position.set(0, (LEVELS - 1) * FLOOR_H, -52);
  group.add(g);

  const deck = new THREE.Mesh(
    ctx.geo(new THREE.BoxGeometry(24, 1.4, 22)),
    ctx.own(new THREE.MeshStandardMaterial({ color: 0x3a2170, roughness: 0.25, metalness: 0.7 }))
  );
  deck.position.y = 0.7; g.add(deck);
  const lip = new THREE.Mesh(
    ctx.geo(new THREE.BoxGeometry(24.6, 0.22, 22.6)),
    ctx.dim(new THREE.MeshStandardMaterial({ color: 0xffd88a, emissive: 0xffd88a, emissiveIntensity: 1.2 * EM }))
  );
  lip.position.y = 1.45; g.add(lip);
  // The stage deck is walkable — 1.4 up from the L8 slab is one step.
  ctx.surf.push({ x0: -12, x1: 12, z0: -52 - 11, z1: -52 + 11, y: (LEVELS - 1) * FLOOR_H + 1.4 });

  const back = new THREE.Mesh(
    ctx.geo(new THREE.PlaneGeometry(26, 10)),
    ctx.own(new THREE.MeshBasicMaterial({ map: ctx.tex(DEPTS[7], 'vista', () => vistaTex(DEPTS[7])).clone() }))
  );
  back.position.set(0, 6, -11.4); g.add(back);
  ctx.textures.push(back.material.map);

  for (let i = 0; i < 7; i++) {
    const ban = new THREE.Mesh(
      ctx.geo(new THREE.PlaneGeometry(1.6, 4.4)),
      ctx.dim(new THREE.MeshStandardMaterial({
        color: i % 2 ? 0xffd88a : 0xb07cff, emissive: i % 2 ? 0xffd88a : 0xb07cff,
        emissiveIntensity: 0.5 * EM, side: THREE.DoubleSide,
      }))
    );
    ban.position.set(-9 + i * 3, 5.4, -9.2); g.add(ban);
    anim.push({ o: ban, k: 'sway', p: i, a: 0.05 });
  }

  for (let i = 0; i < 6; i++) {
    const t = new THREE.Group();
    const cup = new THREE.Mesh(
      ctx.geo(new THREE.CylinderGeometry(0.55, 0.28, 1.1, 10)),
      ctx.dim(new THREE.MeshStandardMaterial({ color: 0xffd88a, metalness: 1, roughness: 0.16, emissive: 0x6a4a10, emissiveIntensity: 0.5 * EM }))
    );
    cup.position.y = 1.1; t.add(cup);
    const base = new THREE.Mesh(
      ctx.geo(new THREE.BoxGeometry(0.9, 0.5, 0.9)),
      ctx.own(new THREE.MeshStandardMaterial({ color: 0x2a1250, roughness: 0.5 }))
    );
    base.position.y = 0.35; t.add(base);
    t.position.set(-9.5 + i * 3.8, 1.5, 6.5); g.add(t);
  }
  for (let i = 0; i < 5; i++) {
    const shoe = new THREE.Mesh(
      ctx.geo(new THREE.BoxGeometry(1.4, 0.5, 0.7)),
      ctx.dim(new THREE.MeshStandardMaterial({ color: 0xff5fa8, emissive: 0xff5fa8, emissiveIntensity: 0.55 * EM, roughness: 0.3 }))
    );
    shoe.position.set(-7 + i * 3.5, 4 + (i % 2), 1); g.add(shoe);
    anim.push({ o: shoe, k: 'spin', s: 0.5 });
  }

  const beam = ctx.own(new THREE.MeshBasicMaterial({
    color: 0xffd8f0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.FrontSide,
  }));
  for (let i = 0; i < 6; i++) {
    const holder = new THREE.Group();
    const cone = new THREE.Mesh(ctx.geo(new THREE.ConeGeometry(1.1, 7, 10, 1, true)), beam);
    cone.position.y = -3.5; holder.add(cone);
    holder.position.set(-8 + i * 3.2, 8, -6 + (i % 2) * 3);
    holder.rotation.z = (i - 2.5) * 0.1;
    g.add(holder);
    anim.push({ o: holder, k: 'sway', p: i * 1.3, a: 0.3 });
  }
}

/**
 * Atrium: skylight, light shafts, the ring column, and the confetti motes
 * that rise the full height of the shaft.
 */
function buildAtriumFX(ctx) {
  const { group, anim } = ctx;
  const top = FLOOR_H * LEVELS;

  const sky = new THREE.Mesh(
    ctx.geo(new THREE.PlaneGeometry(VOID_X * 2, OUT_Z * 2)),
    ctx.own(new THREE.MeshBasicMaterial({ map: ctx.tex(DEPTS[0], 'skyvista', () => vistaTex(DEPTS[0])) }))
  );
  sky.rotation.x = Math.PI / 2; sky.position.y = top + 6;
  group.add(sky);

  const shaftMat = ctx.own(new THREE.MeshBasicMaterial({
    color: 0xffc9ec, transparent: true, opacity: 0.018, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.FrontSide,
  }));
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(ctx.geo(new THREE.ConeGeometry(7, top + 4, 12, 1, true)), shaftMat);
    s.position.set((i % 2 ? 1 : -1) * 6, (top + 4) / 2, -54 + i * 34);
    s.rotation.x = Math.PI;
    group.add(s);
  }

  for (let i = 0; i < LEVELS + 1; i++) {
    const r = new THREE.Mesh(
      ctx.geo(new THREE.TorusGeometry(4.2 + (i % 3) * 0.5, 0.14, 8, 40)),
      ctx.dim(new THREE.MeshStandardMaterial({
        color: i % 2 ? 0xd4408f : 0x40d4c8, emissive: i % 2 ? 0xd4408f : 0x40d4c8,
        emissiveIntensity: 1.3 * EM, transparent: true, opacity: 0.85,
      }))
    );
    r.rotation.x = Math.PI / 2; r.position.set(0, 3 + i * FLOOR_H, 0);
    group.add(r);
    anim.push({ o: r, k: 'spin', s: (i % 2 ? 0.18 : -0.13) });
  }

  const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N);
  const cols = [new THREE.Color(0xd4408f), new THREE.Color(0x40d4c8), new THREE.Color(0xffd88a), new THREE.Color(0xb6a3c9)];
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (ctx.rng() - 0.5) * VOID_X * 2.2;
    pos[i * 3 + 1] = ctx.rng() * (top + 4);
    pos[i * 3 + 2] = (ctx.rng() - 0.5) * OUT_Z * 2;
    const c = cols[(ctx.rng() * cols.length) | 0];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    sz[i] = 0.12 + ctx.rng() * 0.26;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('asize', new THREE.BufferAttribute(sz, 1));
  const pmat = ctx.own(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { u_time: { value: 0 }, u_top: { value: top + 4 } },
    vertexShader: `
      attribute float asize; varying vec3 vC; uniform float u_time; uniform float u_top;
      void main(){
        vC = color;
        vec3 p = position;
        p.y = mod(p.y + u_time * 0.6, u_top);
        p.x += sin(u_time * 0.5 + position.z * 0.2) * 1.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = asize * (260.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vC;
      void main(){
        vec2 q = floor(gl_PointCoord * 6.0) / 6.0 - 0.5;
        if (length(q) > 0.42) discard;
        gl_FragColor = vec4(vC, 0.9);
      }`,
    vertexColors: true,
  }));
  const pts = new THREE.Points(ctx.geo(geo), pmat);
  pts.frustumCulled = false;
  group.add(pts);
  ctx.motes = pmat;

  // Atrium lighting. The isolated render mode stands the system lights down
  // (src/isolate.js soleLight) and planetsky's sun can't reach inside a
  // hundred-meter shaft, so the mall carries its own.
  const lampCount = ctx.quality === 'low' ? 3 : 6;
  for (let i = 0; i < lampCount; i++) {
    const l = new THREE.PointLight(i % 2 ? 0x40d4c8 : 0xd4408f, 260, 150, 2);
    l.position.set(i % 2 ? 9 : -9, 8 + i * (top / lampCount), -50 + i * 20);
    group.add(l);
    ctx.lights.push(l);
  }
  const fill = new THREE.PointLight(0xffd8f0, 200, 190, 2);
  fill.position.set(0, top * 0.5, 40);
  group.add(fill);
  ctx.lights.push(fill);
}

/**
 * Outside: the facade, the neon sign, the plaza, and the lit causeway that
 * climbs from the permanent landing pad to the doors. The causeway matters —
 * the mall floors are a flat plane and the planet curves away underneath, so
 * by the time you reach the pad the natural ground is ~15 m below the
 * threshold. The walk in is a ramp, and it is built from the same segment
 * list the collision ramps use, so what you see is what you stand on.
 */
function buildApproach(ctx) {
  const { group, anim, surf, wall, localGroundY } = ctx;

  /* --- facade --- */
  const fTex = ctx.tex('*', 'facade', () => facadeTex());
  const pier = (w, h, xc, yc) => {
    const t = fTex.clone(); t.repeat.set(w / 34, h / 34); t.needsUpdate = true;
    ctx.textures.push(t);
    const m = new THREE.Mesh(
      ctx.geo(new THREE.BoxGeometry(w, h, 2.5)),
      ctx.dim(new THREE.MeshStandardMaterial({
        map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.22 * EM,
        roughness: 0.55, metalness: 0.2,
      }))
    );
    m.position.set(xc, yc, FZ); group.add(m);
  };
  pier(23, BLD_H, -35.5, BLD_H / 2 - 6);
  pier(23, BLD_H, 35.5, BLD_H / 2 - 6);
  pier(48, BLD_H - ENTRY_H, 0, ENTRY_H + (BLD_H - ENTRY_H) / 2 - 6);
  // Facade collision: solid either side of the opening.
  for (const sx of [-1, 1]) {
    wall.push({ x0: sx > 0 ? ENTRY_HW : -OUT_X - 14, x1: sx > 0 ? OUT_X + 14 : -ENTRY_HW,
      z0: FZ - 1.4, z1: FZ + 1.4, y0: -20, y1: BLD_H });
  }

  /* --- vestibule: the slab between the facade and the atrium end wall --- */
  const vest = new THREE.Mesh(
    ctx.geo(new THREE.BoxGeometry(VOID_X * 2, 0.8, FZ - OUT_Z + 2)),
    ctx.own(relief(new THREE.MeshStandardMaterial({ color: 0x9a94a8, roughness: 0.22, metalness: 0.55 }), ctx.materials, 'concrete', 4, 0.35))
  );
  vest.position.set(0, -0.4, (OUT_Z + FZ) / 2);
  group.add(vest);
  surf.push({ x0: -VOID_X, x1: VOID_X, z0: OUT_Z - 1, z1: FZ + 1, y: 0 });
  // Vestibule jambs, so you funnel through the doors rather than round them.
  for (const sx of [-1, 1]) {
    wall.push({ x0: sx > 0 ? VOID_X : -VOID_X - 0.6, x1: sx > 0 ? VOID_X + 0.6 : -VOID_X,
      z0: OUT_Z, z1: FZ, y0: 0, y1: ENTRY_H });
  }
  const dGlow = new THREE.Mesh(
    ctx.geo(new THREE.BoxGeometry(ENTRY_HW * 2 + 2, 0.5, 0.5)),
    ctx.dim(new THREE.MeshStandardMaterial({ color: 0xff5fc8, emissive: 0xff5fc8, emissiveIntensity: 1.3 * EM }))
  );
  dGlow.position.set(0, ENTRY_H - 0.9, FZ - 0.2); group.add(dGlow);

  /* --- canopy + columns over the doors --- */
  const canopy = new THREE.Mesh(
    ctx.geo(new THREE.BoxGeometry(52, 1.6, 16)),
    ctx.own(new THREE.MeshStandardMaterial({ color: 0x2a1250, roughness: 0.4, metalness: 0.5 }))
  );
  canopy.position.set(0, ENTRY_H + 0.5, FZ + 8); group.add(canopy);
  const rimMat = ctx.dim(new THREE.MeshStandardMaterial({ color: 0x40d4c8, emissive: 0x40d4c8, emissiveIntensity: 1.4 * EM }));
  for (const dz of [0.2, 15.8]) {
    const rim = new THREE.Mesh(ctx.geo(new THREE.BoxGeometry(52, 0.5, 0.5)), rimMat);
    rim.position.set(0, ENTRY_H - 0.4, FZ + dz); group.add(rim);
  }
  for (let i = 0; i < 4; i++) {
    const cx = -22 + i * 14.6;
    const gy = Math.min(localGroundY(cx, FZ + 14.5), 0);
    const colH = ENTRY_H - gy;
    const col = new THREE.Mesh(
      ctx.geo(new THREE.CylinderGeometry(0.9, 0.9, colH, 10)),
      ctx.own(new THREE.MeshStandardMaterial({ color: 0xe4dff2, roughness: 0.25, metalness: 0.6 }))
    );
    col.position.set(cx, gy + colH / 2, FZ + 14.5); group.add(col);
    const band = new THREE.Mesh(
      ctx.geo(new THREE.CylinderGeometry(1.15, 1.15, 0.6, 10)),
      ctx.dim(new THREE.MeshStandardMaterial({ color: 0xff5fc8, emissive: 0xff5fc8, emissiveIntensity: 1.2 * EM }))
    );
    band.position.set(cx, ENTRY_H - 4, FZ + 14.5); group.add(band);
    anim.push({ o: band, k: 'spin', s: 0.5 });
  }

  /* --- the big neon sign + halo rings (night-lifted) --- */
  const sign = new THREE.Mesh(
    ctx.geo(new THREE.PlaneGeometry(58, 14.5)),
    ctx.own(new THREE.MeshBasicMaterial({ map: ctx.tex('*', 'bigsign', () => bigSignTex()), transparent: true }))
  );
  sign.position.set(0, 30, FZ + 1.6); group.add(sign);
  for (let i = 0; i < 3; i++) {
    const c = [0xff5fc8, 0x40d4c8, 0xffd88a][i];
    const ring = new THREE.Mesh(
      ctx.geo(new THREE.TorusGeometry(9 + i * 3.4, 0.32, 8, 36)),
      ctx.night(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.3 * EM }))
    );
    ring.position.set(0, 44, FZ + 2); ring.rotation.x = 0.35 + i * 0.1;
    group.add(ring);
    anim.push({ o: ring, k: 'spin', s: i % 2 ? 0.3 : -0.22 });
  }
  // Roof crown
  for (let i = 0; i < 11; i++) {
    const c = i % 2 ? 0xb07cff : 0x40d4c8;
    const cr = new THREE.Mesh(
      ctx.geo(new THREE.BoxGeometry(5, 3.4, 3)),
      ctx.night(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9 * EM }))
    );
    cr.position.set(-45 + i * 9, BLD_H - 4.5, FZ - 1); group.add(cr);
  }

  /* --- plaza deck, draped over the curving ground --- */
  const plazaGeo = new THREE.PlaneGeometry(220, 150, 22, 15);
  plazaGeo.rotateX(-Math.PI / 2);
  plazaGeo.translate(0, 0, FZ + 78);
  {
    const pa = plazaGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      pa.setY(i, localGroundY(pa.getX(i), pa.getZ(i)) + 0.05);
    }
    plazaGeo.computeVertexNormals();
  }
  const plaza = new THREE.Mesh(ctx.geo(plazaGeo), ctx.own(relief(new THREE.MeshStandardMaterial({
    map: ctx.tex('*', 'plaza', () => plazaTex()), roughness: 0.5, metalness: 0.3,
  }), ctx.materials, 'concrete', 10, 0.4)));
  group.add(plaza);

  /* --- the causeway: pad -> doors, as N ramp segments --- */
  const padY = localGroundY(0, PAD_Z);
  const deckTex = ctx.tex('*', 'cause', () => causewayTex());
  const wayMat = ctx.dim(new THREE.MeshStandardMaterial({
    map: deckTex, emissiveMap: deckTex, emissive: 0xffffff, emissiveIntensity: 0.35 * EM,
    roughness: 0.6, metalness: 0.2,
  }));
  const kerbMat = ctx.dim(new THREE.MeshStandardMaterial({
    color: 0xff5fc8, emissive: 0xff5fc8, emissiveIntensity: 1.0 * EM,
  }));
  const skirtMat = ctx.own(new THREE.MeshStandardMaterial({ color: 0x241c40, roughness: 0.85 }));
  const wayY = (z) => {
    // Linear from the pad apron up to the threshold; the ground falls away
    // quadratically underneath, so the ramp lifts clear as it climbs.
    const t = THREE.MathUtils.clamp((WAY_Z1 - z) / (WAY_Z1 - WAY_Z0), 0, 1);
    return THREE.MathUtils.lerp(padY + 0.5, 0, t);
  };
  for (let i = 0; i < WAY_SEGS; i++) {
    const z0 = WAY_Z1 - (i * (WAY_Z1 - WAY_Z0)) / WAY_SEGS;
    const z1 = WAY_Z1 - ((i + 1) * (WAY_Z1 - WAY_Z0)) / WAY_SEGS;
    const y0 = wayY(z0), y1 = wayY(z1);
    const len = Math.hypot(z1 - z0, y1 - y0);
    const seg = new THREE.Mesh(ctx.geo(new THREE.BoxGeometry(WAY_HW * 2, 0.5, len)), wayMat);
    seg.position.set(0, (y0 + y1) / 2 - 0.25, (z0 + z1) / 2);
    seg.rotation.x = Math.atan2(y1 - y0, z0 - z1);
    group.add(seg);
    surf.push({
      ramp: true, x0: -WAY_HW, x1: WAY_HW,
      z0: Math.min(z0, z1), z1: Math.max(z0, z1),
      zA: z0, zB: z1, yA: y0, yB: y1,
    });
    for (const sx of [-1, 1]) {
      const kerb = new THREE.Mesh(ctx.geo(new THREE.BoxGeometry(0.4, 0.22, len)), kerbMat);
      kerb.position.set(sx * WAY_HW, (y0 + y1) / 2 + 0.15, (z0 + z1) / 2);
      kerb.rotation.x = seg.rotation.x;
      group.add(kerb);
    }
    // Skirt down to the ground so the causeway reads as built, not floating.
    const gy = localGroundY(0, (z0 + z1) / 2);
    const drop = Math.max(0.6, (y0 + y1) / 2 - gy);
    const skirt = new THREE.Mesh(ctx.geo(new THREE.BoxGeometry(WAY_HW * 2 - 1, drop, len * 0.96)), skirtMat);
    skirt.position.set(0, (y0 + y1) / 2 - 0.5 - drop / 2, (z0 + z1) / 2);
    group.add(skirt);
  }
  // Lamp posts along the walk.
  for (let i = 1; i < WAY_SEGS; i += 2) {
    const z = WAY_Z1 - (i * (WAY_Z1 - WAY_Z0)) / WAY_SEGS;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(
        ctx.geo(new THREE.CylinderGeometry(0.16, 0.2, 4.2, 8)),
        ctx.own(new THREE.MeshStandardMaterial({ color: 0xe4dff2, roughness: 0.35, metalness: 0.5 }))
      );
      post.position.set(sx * (WAY_HW - 0.6), wayY(z) + 2.1, z);
      group.add(post);
      const lamp = new THREE.Mesh(
        ctx.geo(new THREE.BoxGeometry(0.7, 0.5, 0.7)),
        ctx.night(new THREE.MeshStandardMaterial({ color: 0xa9f7ff, emissive: 0xa9f7ff, emissiveIntensity: 1.1 * EM }))
      );
      lamp.position.set(sx * (WAY_HW - 0.6), wayY(z) + 4.4, z);
      group.add(lamp);
    }
  }

  /* --- the permanent landing pad --- */
  const padTop = padY + 0.5;
  const padDeck = new THREE.Mesh(
    ctx.geo(new THREE.CylinderGeometry(PAD_R, PAD_R + 0.6, 1.0, 8)),
    ctx.own(relief(new THREE.MeshStandardMaterial({ color: 0xa8a49c, roughness: 0.5, metalness: 0.4 }), ctx.materials, 'concrete', 3, 0.5))
  );
  padDeck.position.set(0, padTop - 0.5, PAD_Z);
  group.add(padDeck);
  surf.push({ x0: -PAD_R, x1: PAD_R, z0: PAD_Z - PAD_R, z1: PAD_Z + PAD_R, y: padTop });
  const padRing = new THREE.Mesh(
    ctx.geo(new THREE.TorusGeometry(PAD_R * 0.92, 0.22, 8, 32)),
    ctx.night(new THREE.MeshStandardMaterial({ color: 0xd4408f, emissive: 0xd4408f, emissiveIntensity: 1.4 * EM }))
  );
  padRing.rotation.x = -Math.PI / 2;
  padRing.position.set(0, padTop + 0.12, PAD_Z);
  group.add(padRing);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const b = new THREE.Mesh(
      ctx.geo(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 8)),
      ctx.night(new THREE.MeshStandardMaterial({ color: 0xa9f7ff, emissive: 0xa9f7ff, emissiveIntensity: 1.1 * EM }))
    );
    b.position.set(Math.cos(a) * (PAD_R + 1.6), padTop + 0.7, PAD_Z + Math.sin(a) * (PAD_R + 1.6));
    group.add(b);
  }

  /* --- planters, palms and searchlights flanking the approach --- */
  for (let i = 0; i < 6; i++) {
    const sxp = i < 3 ? -1 : 1, k = i % 3;
    const pz = FZ + 26 + k * 30;
    const gy = localGroundY(sxp * 26, pz);
    const box = new THREE.Mesh(
      ctx.geo(new THREE.BoxGeometry(6, 2.2, 6)),
      ctx.own(new THREE.MeshStandardMaterial({ color: 0x4a3670, roughness: 0.6 }))
    );
    box.position.set(sxp * 26, gy + 1.1, pz); group.add(box);
    wall.push({ x0: sxp * 26 - 3, x1: sxp * 26 + 3, z0: pz - 3, z1: pz + 3, y0: gy, y1: gy + 2.2 });
    const trunk = new THREE.Mesh(
      ctx.geo(new THREE.CylinderGeometry(0.5, 0.7, 7, 8)),
      ctx.own(new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.7 }))
    );
    trunk.position.set(sxp * 26, gy + 5.6, pz); group.add(trunk);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(
        ctx.geo(new THREE.BoxGeometry(3.6, 0.4, 1.0)),
        ctx.dim(new THREE.MeshStandardMaterial({ color: 0x7bff8a, emissive: 0x7bff8a, emissiveIntensity: 0.35 * EM }))
      );
      frond.position.set(sxp * 26, gy + 9.2, pz);
      frond.rotation.y = (f / 5) * Math.PI * 2; frond.rotation.z = 0.28;
      frond.translateX(1.7); group.add(frond);
    }
    const beam = new THREE.Group();
    const cone = new THREE.Mesh(
      ctx.geo(new THREE.ConeGeometry(2.6, 90, 12, 1, true)),
      ctx.own(new THREE.MeshBasicMaterial({
        color: [0xff5fc8, 0x40d4c8, 0xffd88a][k], transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
      }))
    );
    cone.position.y = 45; beam.add(cone);
    beam.position.set(sxp * 40, gy + 1, pz);
    beam.rotation.z = sxp * -0.5;
    group.add(beam);
    anim.push({ o: beam, k: 'sway', p: i * 1.4, a: 0.45 });
  }
}

/**
 * The mall proper: geometry, collision, per-level crowd frames, and the
 * pad the ship parks on. Everything below the orchestrator level.
 */
function createMall(planet, siteDir, opts = {}) {
  const seed = hashSeed((opts.seedKey ?? 'wavemallprime') + '::mall');
  const rng = mulberry32(seed);
  const prevRandom = R;
  R = rng;

  const group = new THREE.Group();
  group.name = 'wavemall_mall';

  // Anchor frame: EXACTLY cityRegistry.padLocalDir's frame (no extra yaw), so
  // registry pad {x, z} and mall-local (x, z) are the same coordinates.
  const anchorDir = siteDir.clone().normalize();
  const baseR = sampleGround(planet, anchorDir);
  const anchorPos = anchorDir.clone().multiplyScalar(baseR);
  const anchorQ = new THREE.Quaternion().setFromUnitVectors(_yAxis, anchorDir);
  const anchorQInv = anchorQ.clone().invert();
  group.position.copy(anchorPos);
  group.quaternion.copy(anchorQ);

  // Local ground height under a mall-local (x, z). The terrain is levelled
  // flat under this disc (src/cityflatten.js), so what remains is the
  // planet's curvature falling away from the tangent plane — about 15 m by
  // the time you reach the pad, which is why the walk in is a ramp.
  const _dw = new THREE.Vector3();
  const localGroundY = (x, z) => {
    _dw.set(x, 0, z).applyQuaternion(anchorQ).add(anchorPos).normalize();
    const rr = sampleGround(planet, _dw);
    return Math.sqrt(Math.max(rr * rr - (x * x + z * z), 0)) - baseR;
  };

  const textures = [];
  const materials = [];
  const geometries = [];
  const dimMats = [];    // dim by day (interior neon stays lit — mall hours)
  const nightMats = [];  // lift at night (exterior signage, pad, lamps)
  const texCache = new Map();
  const ctx = {
    group, rng, quality: opts.quality ?? 'high', materials: opts.materials,
    anim: [], surf: [], wall: [], floors: [], lights: [],
    textures, geometries, localGroundY,
    unitBox: new THREE.BoxGeometry(1, 1, 1),
    unitCyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    unitSphere: new THREE.SphereGeometry(0.5, 12, 10),
    geo(g) { geometries.push(g); return g; },
    own(m) { materials.push(m); return m; },
    // Track a material for the day/night emissive pass.
    dim(m) {
      materials.push(m);
      dimMats.push({ m, base: m.emissiveIntensity ?? 1 });
      return m;
    },
    night(m) {
      materials.push(m);
      nightMats.push({ m, base: m.emissiveIntensity ?? 1 });
      return m;
    },
    tex(d, kind, make) {
      const k = (d === '*' ? '*' : d.name) + '|' + kind;
      if (!texCache.has(k)) {
        const t = make();
        texCache.set(k, t);
        textures.push(t);
      }
      return texCache.get(k);
    },
    motes: null,
  };
  ctx.geo(ctx.unitBox); ctx.geo(ctx.unitCyl); ctx.geo(ctx.unitSphere);

  buildMallLevels(ctx);
  buildStage(ctx);
  buildAtriumFX(ctx);
  buildApproach(ctx);

  // One structure for the whole site. The scans are linear over ~200
  // surfaces / ~450 walls of plain arithmetic, once per frame, and the zone
  // gate in the orchestrator skips them entirely from outside the grounds.
  const structure = makeStructure(0, 0, 0, ctx.surf, ctx.wall, 320);

  // Per-level crowd frames. Each anchor's transform is expressed in
  // SURFACE-LOCAL terms and the orchestrator parents it to the identity
  // module group, because walk.js's playerLocalInto reads group.position as
  // surface-local — hanging these off the (already transformed) mall group
  // would double the anchor transform and put every shopper somewhere else.
  const _off = new THREE.Vector3();
  const floors = ctx.floors.map((f) => {
    const anchor = new THREE.Group();
    anchor.name = `wavemall_floor_${f.level}`;
    _off.set(0, f.y, 0).applyQuaternion(anchorQ);
    anchor.position.copy(anchorPos).add(_off);
    anchor.quaternion.copy(anchorQ);
    // Where shoppers may walk on this level: the two promenades, both end
    // bridges, and a couple of store interiors. Rect-bounded so a stroll
    // never cuts the corner across the open atrium.
    const rects = [
      { x0: VOID_X + 1.2, x1: STORE_X - 0.8, z0: -OUT_Z + 4, z1: OUT_Z - 4 },
      { x0: -STORE_X + 0.8, x1: -VOID_X - 1.2, z0: -OUT_Z + 4, z1: OUT_Z - 4 },
      { x0: -VOID_X + 2, x1: VOID_X - 2, z0: VOID_Z + 2, z1: OUT_Z - 3 },
      { x0: -VOID_X + 2, x1: VOID_X - 2, z0: -OUT_Z + 3, z1: -VOID_Z - 2 },
      { x0: STORE_X + 2, x1: OUT_X - 2, z0: -DOOR / 2 + 2, z1: DOOR / 2 - 2 },
      { x0: -OUT_X + 2, x1: -STORE_X - 2, z0: 60 - DOOR / 2 + 2, z1: 60 + DOOR / 2 - 2 },
    ];
    if (f.level === 0) {
      rects.push({ x0: -VOID_X + 2, x1: VOID_X - 2, z0: -VOID_Z + 4, z1: VOID_Z - 4 });
    }
    return { level: f.level, dept: f.dept, y: f.y, group: anchor, invQuat: anchorQInv, floorY: 0, rects };
  });

  const padTopY = localGroundY(0, PAD_Z) + 0.5;

  function tick(t, dt, sunDot) {
    for (const a of ctx.anim) {
      if (a.k === 'sway') a.o.rotation.z = Math.sin(t * 0.7 + a.p) * a.a;
      else if (a.k === 'spin') a.o.rotation.z += a.s * dt;
      else if (a.k === 'scroll') a.o.offset.y = (a.o.offset.y + a.s * dt) % 1;
      else if (a.k === 'portal') a.o.material.uniforms.u_time.value = t;
    }
    if (ctx.motes) ctx.motes.uniforms.u_time.value = t;
    // Day/night. Inside stays lit — the mall never closes — but the trim
    // eases back under a bright sky so the neon isn't fighting the sun; the
    // exterior signage, pad ring and walk lamps do the opposite.
    const night = THREE.MathUtils.clamp(1 - Math.max(sunDot, 0), 0, 1);
    const dayK = THREE.MathUtils.lerp(0.72, 1, night);
    const nightK = THREE.MathUtils.lerp(0.55, 1.35, night);
    for (const e of dimMats) e.m.emissiveIntensity = e.base * dayK;
    for (const e of nightMats) e.m.emissiveIntensity = e.base * nightK;
  }

  function dispose() {
    for (const t of textures) t.dispose();
    for (const m of materials) m.dispose();
    for (const g of geometries) g.dispose();
    texCache.clear();
    group.clear();
  }

  R = prevRandom;
  return {
    group, structure, floors, localGroundY,
    anchorPos, anchorQ, anchorQInv,
    pad: { x: 0, z: PAD_Z, y: padTopY, r: PAD_R },
    tick, dispose,
  };
}

/* ----------------------------------------------------------------------
 * Signature wonders — the five landmarks out on the plain
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
  void rng;
  return { group, mat };
}

function buildGlastelleSpire(rng) {
  const group = new THREE.Group();
  const coreGeo = new THREE.ConeGeometry(10, C.SPIRE_HEIGHT, 8);
  const coreMat = relief(
    new THREE.MeshStandardMaterial({ color: 0x3a2f38, roughness: 0.5 }),
    _sessionMats, 'steel', 4, 0.5
  );
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
  void rng;
  return { group, numerals };
}

function buildFeluziaStage(rng) {
  const group = new THREE.Group();
  const daisGeo = new THREE.CylinderGeometry(C.STAGE_RADIUS * 0.4, C.STAGE_RADIUS * 0.4, 2, 32);
  const daisMat = relief(
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 }),
    _sessionMats, 'concrete', 4, 0.55
  );
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
  void rng;
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
    // Bearings start a quarter turn off the mall's +Z axis so no landmark
    // lands on the plaza, the causeway or the pad.
    const angle = Math.PI / 2 + (i / types.length) * Math.PI * 2 + rng() * 0.3;
    const dist = 340 + rng() * 200;
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
 * Employees & wandering callers
 * ------------------------------------------------------------------- */
// Frame-loop scratch — module scope so crowd updates never allocate.
const _toWp = new THREE.Vector3();

// The chain variant a head speaks in, from the shared chain stage (owned by
// the host — src/walk.js seeds it from the journal and advances it on
// wavemall:* outcome tags) versus the head's own level. 'won' only exists on
// the top floor, where the queue ends.
function stageVariant(stage, level) {
  if (stage >= 8 && level === 7) return 'won';
  if (stage > level) return 'after';
  if (stage === level) return 'current';
  return 'early';
}

// Caller clothing: muted mall-goer tones. Employees wear their department's
// accent — the uniform IS the badge.
const CALLER_CLOTH = [0x8a7f98, 0x6d7a8c, 0x9c8fa5, 0x5e6b74, 0xb0a4b8, 0x7d8a6f];
const _qIdent = new THREE.Quaternion();

/**
 * A crowd bound to a host area. Two shapes of host:
 *   - disc:  { radius, cx, cz, avoid[] }        — the plaza outside
 *   - rects: { rects: [{x0,x1,z0,z1}] }         — one level of the mall
 * Rects exist because a level is a ring of walkable deck around an open
 * shaft: a disc-wander would send shoppers strolling through the void.
 */
export function createCrowd(host, opts = {}) {
  const seed = hashSeed((opts.seedKey ?? 'wavemallprime') + '::crowd');
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'wavemall_crowd';

  const count = opts.count ?? 60;
  let simT = 0;   // accumulated sim time — drives the stride phase
  let frameIx = 0; // staggers the far-citizen ground conform
  const citizens = [];

  const cx = host.cx ?? 0;
  const cz = host.cz ?? 0;
  const rects = host.rects ?? null;
  const rectW = rects
    ? rects.map((r) => Math.max(0.001, (r.x1 - r.x0) * (r.z1 - r.z0)))
    : null;
  const rectTotal = rectW ? rectW.reduce((a, b) => a + b, 0) : 0;

  // Pick a point inside the host area. Rect hosts pick within ONE rect (the
  // citizen's home rect when it has one), so a walk leg never crosses the
  // gap between two rects — which on a mall level is the atrium drop.
  function pickIn(c, out) {
    if (rects) {
      let ri = c ? c.rect : -1;
      if (ri < 0 || ri >= rects.length) {
        let pick = rng() * rectTotal;
        ri = 0;
        while (ri < rects.length - 1 && pick > rectW[ri]) { pick -= rectW[ri]; ri++; }
      }
      const r = rects[ri];
      out.set(r.x0 + rng() * (r.x1 - r.x0), 0, r.z0 + rng() * (r.z1 - r.z0));
      return ri;
    }
    for (let tries = 0; tries < 8; tries++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * (host.radius ?? 60);
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      let blocked = false;
      if (host.avoid) {
        for (const a of host.avoid) {
          const dx = x - a.x, dz = z - a.z;
          if (dx * dx + dz * dz < a.r * a.r) { blocked = true; break; }
        }
      }
      out.set(x, 0, z);
      if (!blocked) break;
    }
    return -1;
  }

  // Which floor's voice this crowd speaks with. `level` is 0..7 for an
  // interior crowd, undefined for the plaza — every use below guards with
  // `!= null` because level 0 is falsy.
  const level = opts.level != null ? opts.level : null;
  const bank = level != null ? DEPT_LINES[level] : PLAZA_LINES;
  const codexPool = level != null ? DEPT_CODEX[level] : PLAZA_CODEX;
  const chainState = opts.chainState ?? null;
  const headDef = level != null ? HEADS[level] : null;

  for (let i = 0; i < count; i++) {
    const isEmployee = rng() < (opts.employeeRatio ?? C.EMPLOYEE_RATIO);
    const accent = DEPTS[Math.floor(rng() * DEPTS.length)].accent;
    const speed = C.WANDER_SPEED_MIN + rng() * (C.WANDER_SPEED_MAX - C.WANDER_SPEED_MIN);
    const pos = new THREE.Vector3();
    const c = {
      id: i,
      isEmployee,
      accent: opts.deptAccent ?? accent,
      dept: opts.deptName ?? null,
      speed,
      pos,
      rect: -1,
      waypoint: new THREE.Vector3(),
      yaw: rng() * Math.PI * 2,
      quest: rng() < C.QUEST_CHANCE
        ? { kind: 'codex', subject: codexPool[i % codexPool.length] }
        : null,
      seed: rng() * 1000,
    };
    c.rect = pickIn(null, pos);
    c.waypoint.copy(pos);
    citizens.push(c);
  }

  // The department head: citizen 0, renamed and pinned at their post. The
  // override happens AFTER the loop (so the rng draw sequence for the other
  // citizens is untouched for a given seedKey) and BEFORE createPeople below
  // (whose cloth callback reads citizens in creation order).
  if (headDef && citizens.length) {
    const c = citizens[0];
    c.head = headDef;
    c.isEmployee = true;
    c.pinned = true;
    c.pos.set(headDef.post.x, headDef.post.y ?? 0, headDef.post.z);
    c.waypoint.copy(c.pos);
    c.yaw = headDef.post.yaw ?? 0;
    c.prompt = headDef.prompt;
    c.quest = null; // heads offer authored codex leaves from their trees instead
  }

  // The visuals: a real crowd (world/people.js) over the citizen sim above.
  let clothIdx = 0;
  const people = createPeople({
    count,
    rng: mulberry32(seed ^ 0x517cc1),
    materials: opts.materials,
    place: (i) => ({ pos: citizens[i].pos, quat: _qIdent }),
    cloth: (r) => {
      const c = citizens[clothIdx++ % count];
      // The head wears the department's SIGN color — associates wear the
      // accent, so the one fixed figure at the post reads as in charge.
      if (c.head && level != null) return DEPTS[level].sign;
      return c.isEmployee ? c.accent : CALLER_CLOTH[Math.floor(r * CALLER_CLOTH.length)];
    },
    maxRigs: opts.maxRigs ?? 10,
  });
  group.add(people.group);

  function update(dt, playerPos, sunDot = 1) {
    simT += dt;
    frameIx++;
    for (let ci = 0; ci < citizens.length; ci++) {
      const c = citizens[ci];
      let moving = false;
      if (c.pinned) {
        // Heads keep their post. Face the player while talking; otherwise
        // ease back to the posted yaw.
        if (c.talking && playerPos) {
          c.yaw = Math.atan2(playerPos.x - c.pos.x, playerPos.z - c.pos.z);
        } else {
          const want = c.head.post.yaw ?? 0;
          let dy = want - c.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          c.yaw += dy * Math.min(1, 3 * dt);
        }
      } else if (!c.talking) {
        _toWp.copy(c.waypoint).sub(c.pos);
        const dist = _toWp.length();
        if (dist < 1) pickIn(c, c.waypoint);
        else {
          _toWp.normalize();
          c.yaw = Math.atan2(_toWp.x, _toWp.z);
          c.pos.addScaledVector(_toWp, c.speed * dt);
          moving = true;
        }
      } else if (playerPos) {
        c.yaw = Math.atan2(playerPos.x - c.pos.x, playerPos.z - c.pos.z);
      }

      const distToPlayer = playerPos ? c.pos.distanceTo(playerPos) : Infinity;
      // The ground conform skips pinned heads: their post carries its own y
      // (Feluzia stands on the L8 stage deck at +1.4, which groundHeightAt —
      // a constant slab height for interior crowds — would stamp flat).
      if (!c.pinned && host.groundHeightAt &&
          (distToPlayer < C.CULL_DIST || (frameIx + ci) % 30 === 0)) {
        c.pos.y = host.groundHeightAt(c.pos.x, c.pos.z);
      }

      people.setPersonPose(
        ci, c.pos.x, c.pos.y, c.pos.z, c.yaw,
        moving ? c.speed / C.WANDER_SPEED_MAX : 0, simT
      );
    }
    if (playerPos) people.update(simT, dt, playerPos);
    void sunDot;
  }

  function nearestInteractable(playerPos, maxDist = 4) {
    let best = null, bestD = maxDist;
    citizens.forEach((c) => {
      const d = c.pos.distanceTo(playerPos);
      if (d < bestD) { bestD = d; best = c; }
    });
    return best;
  }

  /* --- the department head's dialogue tree ------------------------------
   * citizens.js's vendor-tree pattern: choice offers carry outcome tags, the
   * host routes accepted tags back through onOutcome, and a returned payload
   * keeps the panel open — that recursion IS the tree walk. `menu:` tags are
   * navigation (never journaled); `wavemall:transfer:<level>` and
   * `wavemall:win` are real outcomes the host journals and uses to advance
   * the shared chain stage BEFORE onOutcome runs, so the follow-up payload
   * already speaks from the post-transfer world.
   * ------------------------------------------------------------------- */
  function headVariant() {
    return stageVariant(chainState?.stage ?? 0, level ?? 0);
  }
  function headSpeaker() {
    // dialogue.js renders species as the subtitle slot — the head's title
    // reads better there than 'human-adjacent'.
    return { name: headDef.name, species: headDef.title, cityId: 'wavemall prime' };
  }
  // One shared filter for menu building AND tag resolution, so the visible
  // option index in a menu tag can never disagree with the list it indexes.
  // (Safe because the stage only moves via wavemall:* tags, which don't use
  // option indices — pure menu: navigation never changes the variant.)
  function visibleOptions(node, variant) {
    return node.options.filter((o) => {
      if (!o.when) return true;
      if (o.when === 'notWon') return variant !== 'won';
      return o.when === variant;
    });
  }
  function menuFor(nodeKey) {
    const node = headDef?.nodes?.[nodeKey];
    if (!node) return undefined;
    const vis = visibleOptions(node, headVariant());
    if (!vis.length) return undefined;
    return {
      kind: 'choice',
      prompt: node.prompt,
      options: vis.map((o, vi) => ({
        label: o.label,
        outcomeTag: o.transfer ? `wavemall:transfer:${level}`
          : o.win ? 'wavemall:win'
          : `menu:wm:${level}:${nodeKey}:${vi}`,
      })),
    };
  }
  function onOutcome(tag) {
    if (!headDef || level == null) return null;
    if (tag === `wavemall:transfer:${level}` || (tag === 'wavemall:win' && level === 7)) {
      // The option's own lines lead into the head's transfer/win speech.
      // Each head has at most one transfer and one win option, so the tag
      // alone identifies it.
      const key = tag === 'wavemall:win' ? 'win' : 'transfer';
      const opt = Object.values(headDef.nodes)
        .flatMap((n) => n.options)
        .find((o) => o[key]);
      const speech = key === 'win' ? headDef.winLines : headDef.transferLines;
      return {
        speaker: headSpeaker(),
        lines: [...(opt?.lines ?? []), ...(speech ?? [])],
      };
    }
    const m = /^menu:wm:(\d+):([^:]+):(\d+)$/.exec(tag ?? '');
    if (!m || Number(m[1]) !== level) return null;
    const node = headDef.nodes?.[m[2]];
    if (!node) return null;
    const opt = visibleOptions(node, headVariant())[Number(m[3])];
    if (!opt) return null;
    return {
      speaker: headSpeaker(),
      lines: opt.lines ?? [],
      offer: opt.next ? menuFor(opt.next)
        : opt.codex ? { kind: 'codex', subject: opt.codex }
        : undefined,
    };
  }

  function interact(citizen) {
    citizen.talking = true;
    if (citizen.head) {
      const greet = citizen.head.greeting[headVariant()] ?? citizen.head.greeting.current;
      return {
        speaker: headSpeaker(),
        lines: greet,
        offer: menuFor('root'),
      };
    }
    const pool = citizen.isEmployee ? bank.employee : bank.caller;
    const rngLocal = mulberry32(citizen.seed | 0);
    const line = pool[Math.floor(rngLocal() * pool.length)];
    const farewell = bank.farewell[Math.floor(rngLocal() * bank.farewell.length)];
    // Host dialogue renderer (src/dialogue.js) reads speaker.name/.species/
    // .cityId — speaker must be an object, not a bare string.
    return {
      speaker: {
        name: citizen.isEmployee
          // The RAMDA department's running joke: every employee is Ramda.
          ? (level === 5 ? 'Ramda'
            : citizen.dept ? `${citizen.dept} Associate` : 'Wave Mall Employee')
          : 'Caller',
        species: 'human-adjacent',
        cityId: 'wavemall prime',
      },
      lines: [line, farewell],
      offer: citizen.quest ?? undefined,
    };
  }

  function endInteract(citizen) {
    if (citizen) citizen.talking = false;
  }

  function dispose() {
    people.dispose();
  }

  return {
    group, update, sunDot: 1, dispose, count,
    nearestInteractable, interact, endInteract, onOutcome, citizens, people,
  };
}

/* ----------------------------------------------------------------------
 * Top-level orchestrator — createWavemallPrime
 * ------------------------------------------------------------------- */
export function createWavemallPrime(planet, siteDir, opts = {}) {
  const seedKey = opts.seedKey ?? 'wavemallprime';
  const group = new THREE.Group();
  group.name = 'wavemallprime';
  _sessionMats = opts.materials ?? null; // standalone wonder builders read this

  const anchorDir = siteDir.clone().normalize();
  const mall = createMall(planet, anchorDir, { ...opts, seedKey });
  const wonders = createWonderField(planet, anchorDir, { ...opts, seedKey });
  // The per-level crowd anchors carry surface-local transforms, so they hang
  // off this identity group rather than the mall's.
  for (const f of mall.floors) group.add(f.group);

  // The plaza crowd wanders the apron outside the doors, clear of the
  // causeway (people would otherwise walk through it) and the pad.
  const crowd = createCrowd(
    {
      radius: C.CROWD_RADIUS,
      cz: FZ + 55,
      avoid: [
        { x: 0, z: FZ + 40, r: 16 },   // the causeway corridor
        { x: 0, z: PAD_Z, r: PAD_R + 8 },
        { x: -26, z: FZ + 26, r: 6 }, { x: 26, z: FZ + 26, r: 6 },
        { x: -26, z: FZ + 56, r: 6 }, { x: 26, z: FZ + 56, r: 6 },
        { x: -26, z: FZ + 86, r: 6 }, { x: 26, z: FZ + 86, r: 6 },
      ],
      groundHeightAt: (x, z) => mall.localGroundY(x, z),
    },
    { ...opts, seedKey: seedKey + '::plaza', count: opts.crowdCount ?? 16, maxRigs: 6 }
  );
  crowd.group.position.copy(mall.anchorPos);
  crowd.group.quaternion.copy(mall.anchorQ);

  group.add(mall.group, wonders.group, crowd.group);
  _sessionMats = null; // build done — don't leak the registry across sessions

  // Per-level manifest for the host: walk.js builds one crowd per entry, in
  // that level's own frame (see createMall's note on why these are direct
  // children of the module group).
  const floors = mall.floors;

  function update(t, dt, playerPos, sunDot = 1) {
    mall.tick(t, dt, sunDot);
    wonders.update(t, sunDot);
    crowd.update(dt, playerPos, sunDot);
  }

  function nearestInteractable(playerPos, maxDist = 4) {
    return crowd.nearestInteractable(playerPos, maxDist);
  }
  function interact(citizen) {
    return crowd.interact(citizen);
  }
  function endInteract(citizen) {
    crowd.endInteract(citizen);
  }
  // scanModule makes THIS handle the focusModule for plaza conversations, so
  // accepted choice tags route here — forward to the plaza crowd's tree
  // walker. (Interior crowds are scanned as their own modules and carry their
  // own onOutcome.)
  function onOutcome(tag) {
    return crowd.onOutcome?.(tag) ?? null;
  }

  // Collision: one zone covering the whole site. A surface-local player point
  // is moved into the mall frame, resolved against the structure, and moved
  // back. Zero per-frame allocations.
  const zone = { frame: { pos: mall.anchorPos, q: mall.anchorQ, qInv: mall.anchorQInv }, r2: 330 ** 2 };
  const _rcLocal = new THREE.Vector3();

  function resolveCollisions(surfaceLocalPos, playerRadius) {
    if (surfaceLocalPos.distanceToSquared(zone.frame.pos) > zone.r2) return false;
    _rcLocal.copy(surfaceLocalPos).sub(zone.frame.pos).applyQuaternion(zone.frame.qInv);
    if (!mall.structure.resolveWalls(_rcLocal, playerRadius)) return false;
    surfaceLocalPos.copy(_rcLocal).applyQuaternion(zone.frame.q).add(zone.frame.pos);
    return true;
  }

  // Highest walkable structure surface (decks, ramps, landings, the pad and
  // the causeway) under a surface-local point, as a planet-centered radius;
  // -1 when there's nothing but terrain underfoot. walk.js maxes this with
  // the terrain floor, so stepping off a slab just steps down.
  function groundRadiusAt(surfaceLocalPos) {
    if (surfaceLocalPos.distanceToSquared(zone.frame.pos) > zone.r2) return -1;
    _rcLocal.copy(surfaceLocalPos).sub(zone.frame.pos).applyQuaternion(zone.frame.qInv);
    const sy = mall.structure.surfaceYAt(_rcLocal.x, _rcLocal.z, _rcLocal.y);
    if (sy === null || sy === undefined) return -1;
    _rcLocal.y = sy;
    return _rcLocal.applyQuaternion(zone.frame.q).add(zone.frame.pos).length();
  }

  // Third-person boom occlusion (walk.js). Both ends of the sight line and
  // the feet arrive surface-local; the structure works in mall-local.
  const _segA = new THREE.Vector3();
  const _segB = new THREE.Vector3();
  function segmentHit(aSurfaceLocal, bSurfaceLocal, feetSurfaceLocal) {
    _segA.copy(aSurfaceLocal).sub(zone.frame.pos).applyQuaternion(zone.frame.qInv);
    _segB.copy(bSurfaceLocal).sub(zone.frame.pos).applyQuaternion(zone.frame.qInv);
    _rcLocal.copy(feetSurfaceLocal).sub(zone.frame.pos).applyQuaternion(zone.frame.qInv);
    return mall.structure.segmentHit(_segA.x, _segA.z, _segB.x, _segB.z, _rcLocal.y);
  }

  // Surface-local point of the landing pad's deck — the host parks the ship
  // here and spawns the player at the foot of the causeway.
  function padSurfacePoint(out) {
    return out.set(mall.pad.x, mall.pad.y, mall.pad.z)
      .applyQuaternion(mall.anchorQ).add(mall.anchorPos);
  }
  function localToSurface(x, y, z, out) {
    return out.set(x, y, z).applyQuaternion(mall.anchorQ).add(mall.anchorPos);
  }

  function dispose() {
    mall.dispose();
    wonders.dispose();
    crowd.dispose();
  }

  return {
    group,
    update,
    sunDot: 1,
    dispose,
    floors,
    pad: mall.pad,
    padSurfacePoint,
    localToSurface,
    groundHeightAt: mall.localGroundY,
    nearestInteractable,
    interact,
    endInteract,
    onOutcome,
    resolveCollisions,
    groundRadiusAt,
    segmentHit,
    mall,
    wonders,
    crowd,
  };
}
