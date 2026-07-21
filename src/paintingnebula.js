// Painting nebulae (owner feature) — every titled painting in /artgallery
// becomes a flyable nebula in the OUTER SHELL of the universe (beyond all the
// planets, inside the sun and the NAV chart edge). Each painting contributes
// only its COLORS (a handful of extracted palette swatches) and its NAV name;
// the SHAPE comes from one of five real nebula morphologies — Emission,
// Reflection, Dark, Planetary, Supernova Remnant (see nebulatypes.js). An
// earlier design laid the painting's pixels face-on like a billboard, but from
// 95k-140k out that collapsed into a smooth glowing oval indistinguishable from
// a distant lit planet; the volumetric types give each nebula an irregular
// silhouette and internal structure that survives at range.
//
// The type is picked deterministically from the painting itself: very dark art
// becomes a Dark nebula, a few titles are pinned (TYPE_OVERRIDES), and a seeded
// wheel spreads the rest so all five types appear.
//
// Placement, palette, type, and shape are all seeded from the painting's
// filename, so the layout is stable across sessions and adding a new painting
// later never moves or reclassifies the existing ones.
//
// Registration is synchronous (before snapshotShiftables/nav), but the pixels
// load and build asynchronously after boot — the game starts instantly and
// the clouds pop in over a few seconds, 100k+ units away where nobody sees it.

import * as THREE from 'three';
import { C } from './constants.js';
import { addShiftable } from './origin.js';
import { addBody } from './gravity.js';
import { SUN } from './planet.js';
import { deepNebulae } from './deepnebula.js';
import { buildNebulaOfType } from './nebulatypes.js';

// Built painting nebulae, for debug/verification. Each: { record, file, url,
// seed, dir, distance, radius } where `record` is the shared deepNebulae entry
// and `record.type` is the assigned nebula morphology once built.
export const paintingNebulae = [];

// Hand-crafted nebulae already exist for these paintings (deepnebula.js) —
// delete a line to give the painting a pixel-sampled nebula as well.
const SKIP_FILES = new Set(['Sisters.webp', 'The Father piece.webp']);

// Camera-roll files (IMG_..., bare digits) have no titles; the owner chose to
// leave them out of the sky. Titled works only.
const UNTITLED_RE = /^(IMG_|\d)/;

const GALLERY = import.meta.glob('/artgallery/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

// Directions already claimed by hand-placed bodies (unit vectors).
const SISTERS_DIR = new THREE.Vector3(0.58, 0.2, -0.79).normalize();
const FATHER_DIR = new THREE.Vector3(-0.62, 0.34, 0.71).normalize();

// Outer shell: beyond every planet (rustia @90k), inside the sun (150k) and
// the NAV chart edge (160k).
const SHELL_MIN = 95000;
const SHELL_SPAN = 45000;
const RADIUS_MIN = 3500; // "as large or larger than The Sisters"
const RADIUS_SPAN = 3500; // ...and never dwarfing The Father (7000)

// --- seeded randomness (layout must survive reloads) ---

function hashStr(s) {
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- naming ---

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const SMALL_WORDS = new Set(['of', 'the', 'by', 'and', 'a', 'an', 'in']);

function deriveName(file) {
  let base = file.replace(/\.[^.]+$/, '');
  base = base.replace(/\s+by JFeelgood$/i, '');
  base = base.replace(/\s*\((\d+)\)$/, (m, d) => ' ' + (ROMAN[d - 1] || d));
  const words = base.trim().split(/\s+/).map((w, i) => {
    const lower = w.toLowerCase();
    if (i > 0 && SMALL_WORDS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
  return words.join(' ') + ' Nebula';
}

function slug(file) {
  return file.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// --- placement: random outer shell, deterministic per painting ---

function randDir(rng, out) {
  const z = 2 * rng() - 1;
  const a = 2 * Math.PI * rng();
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return out.set(r * Math.cos(a), z, r * Math.sin(a));
}

const MIN_GAP = THREE.MathUtils.degToRad(15); // vs other paintings + the sun
const MIN_GAP_NEB = THREE.MathUtils.degToRad(10); // vs the hand-made nebulae

function computePlacement(seed, takenDirs) {
  const rng = mulberry32(seed);
  const distance = SHELL_MIN + rng() * SHELL_SPAN;
  const radius = RADIUS_MIN + rng() * RADIUS_SPAN;
  const mass = 8.0e4 * (radius / RADIUS_MIN); // scaled from The Sisters; no hazard radius

  // First seeded direction with clear sky around it; on exhaustion take the
  // best candidate seen, which guarantees termination.
  const cand = new THREE.Vector3();
  const best = new THREE.Vector3();
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 60; attempt++) {
    randDir(rng, cand);
    let minAngle = Infinity;
    let ok = true;
    for (const d of takenDirs) {
      const a = cand.angleTo(d);
      if (a < minAngle) minAngle = a;
      if (a < MIN_GAP) ok = false;
    }
    const aSun = cand.angleTo(SUN);
    if (aSun < minAngle) minAngle = aSun;
    if (aSun < MIN_GAP) ok = false;
    if (cand.angleTo(SISTERS_DIR) < MIN_GAP_NEB) ok = false;
    if (cand.angleTo(FATHER_DIR) < MIN_GAP_NEB) ok = false;
    if (minAngle > bestScore) {
      bestScore = minAngle;
      best.copy(cand);
    }
    if (ok) {
      best.copy(cand);
      break;
    }
  }
  const dir = best.clone();

  // Face the painting's front (+Z local) at the system origin, so flying
  // outward you meet it face-on — then a small tilt/roll so no two hang
  // perfectly square.
  const pos = dir.clone().multiplyScalar(distance);
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), pos, new THREE.Vector3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const tiltAxis = new THREE.Vector3(Math.cos(rng() * Math.PI * 2), Math.sin(rng() * Math.PI * 2), 0).normalize();
  q.multiply(new THREE.Quaternion().setFromAxisAngle(tiltAxis, (rng() - 0.5) * THREE.MathUtils.degToRad(20)));
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (rng() - 0.5) * THREE.MathUtils.degToRad(16)));

  return { rng, dir, distance, radius, mass, quaternion: q };
}

// --- nebula type assignment (deterministic per painting) ---

// A few paintings are pinned to an evocative type; everything else is chosen
// from the art's own statistics + a seeded wheel. Filenames as they appear in
// /artgallery. Extend this to rebalance the distribution.
const TYPE_OVERRIDES = {
  'Supernova.webp': 'remnant',
  'icarus.webp': 'planetary',
  'transcend.webp': 'planetary',
  'Ancestors.webp': 'dark',
  'poetry of solace.webp': 'dark',
  'sweet dreams.webp': 'reflection',
  'dream mountain.webp': 'reflection',
};

// Weighted wheel for the unpinned majority. Emission is the workhorse; dark is
// rare because very-dark paintings already route there by luminance below.
const TYPE_WHEEL = [
  ['emission', 0.30],
  ['reflection', 0.25],
  ['remnant', 0.20],
  ['planetary', 0.15],
  ['dark', 0.10],
];

function classifyNebula(file, seed, stats) {
  if (TYPE_OVERRIDES[file]) return TYPE_OVERRIDES[file];
  // Genuinely dark art reads best as a light-blocking Dark nebula.
  if (stats.meanL < 55 && stats.darkFrac > 0.4) return 'dark';
  // Fresh seeded stream (xor keeps it independent of placement/build streams).
  let r = mulberry32(seed ^ 0x51ed270b)();
  for (const [type, w] of TYPE_WHEEL) {
    if (r < w) return type;
    r -= w;
  }
  return 'emission';
}

// --- palette extraction ---

const GRID = 64; // palette + stats only — no per-pixel layout, so coarse is fine

function smooth01(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Linear-space RGB (the vertex colours feed a raw shader, no tone mapping) from
// an sRGB byte triple.
function toLinear(r, g, b) {
  return [Math.pow(r / 255, 2.2), Math.pow(g / 255, 2.2), Math.pow(b / 255, 2.2)];
}

// Draw the painting CONTAINED (aspect kept) into a GRID^2 canvas and reduce it
// to a small palette + a couple of statistics. The type builders in
// nebulatypes.js consume the palette; classifyNebula consumes the stats. The
// elliptical mask feathers out the empty canvas border so it never pollutes the
// colours. Returns { palette:{primary,secondary,accent,bright,dark}, stats, navColor }.
function extractPalette(img) {
  const G = GRID;
  const ar = img.width / img.height;
  const ax = ar >= 1 ? 1 : ar; // half-extent fractions, long side = 1
  const ay = ar >= 1 ? 1 / ar : 1;
  const oc = document.createElement('canvas');
  oc.width = G;
  oc.height = G;
  const cx = oc.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, (G - G * ax) / 2, (G - G * ay) / 2, G * ax, G * ay);
  const px = cx.getImageData(0, 0, G, G).data;

  const N = G * G;
  const BINS = 12;
  const binW = new Float64Array(BINS);
  const binR = new Float64Array(BINS), binG = new Float64Array(BINS), binB = new Float64Array(BINS);
  const binSat = new Float64Array(BINS); // for the accent's mean-saturation pick
  // bright / dark accumulators (linear, mask-weighted)
  let brW = 0, brR = 0, brG = 0, brB = 0;
  let dkW = 0, dkR = 0, dkG = 0, dkB = 0;
  let meanL = 0, maskSum = 0, darkMask = 0;
  // primary fallback: overall mask-weighted linear mean
  let mR = 0, mG = 0, mB = 0;
  let nr = 0, ng = 0, nb = 0, nw = 0; // navColor accumulator (stays sRGB)

  for (let k = 0; k < N; k++) {
    const i = k % G;
    const j = (k / G) | 0;
    const u = (i + 0.5) / G - 0.5;
    const v = (j + 0.5) / G - 0.5;
    const re = Math.hypot(u / (0.5 * ax), v / (0.5 * ay));
    const mask = 1 - smooth01(0.75, 1.0, re);
    if (mask <= 0.01) continue;

    const p = k * 4;
    const r = px[p], g = px[p + 1], b = px[p + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const lin = toLinear(r, g, b);
    meanL += lum * mask;
    maskSum += mask;
    if (lum < 50) darkMask += mask;
    mR += lin[0] * mask; mG += lin[1] * mask; mB += lin[2] * mask;

    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const sat = mx > 0 ? d / mx : 0;

    // hue bin, weighted by saturation × mask so grey pixels don't smear the bins
    if (sat > 0.2 && lum > 40 && lum < 220) {
      let hue = 0;
      if (d > 0) {
        if (mx === r) hue = ((g - b) / d) % 6;
        else if (mx === g) hue = (b - r) / d + 2;
        else hue = (r - g) / d + 4;
      }
      let bin = Math.floor(((hue + 6) % 6) * 2) % BINS; // 6 hue sextants → 12 bins
      const w = sat * mask;
      binW[bin] += w;
      binR[bin] += lin[0] * w; binG[bin] += lin[1] * w; binB[bin] += lin[2] * w;
      binSat[bin] += sat * w;
    }

    if (lum > 200) { brW += mask; brR += lin[0] * mask; brG += lin[1] * mask; brB += lin[2] * mask; }
    if (lum < 60) { dkW += mask; dkR += lin[0] * mask; dkG += lin[1] * mask; dkB += lin[2] * mask; }

    // NAV dot: saturation-weighted mid-tone mean (kept in sRGB, unchanged).
    if (mask > 0.5 && sat > 0.25 && lum > 60 && lum < 220) {
      const w = sat * mask;
      nr += r * w; ng += g * w; nb += b * w; nw += w;
    }
  }

  maskSum = Math.max(1e-6, maskSum);
  meanL /= maskSum;
  const meanLin = [mR / maskSum, mG / maskSum, mB / maskSum];

  const binMean = (bi) => (binW[bi] > 1e-6 ? [binR[bi] / binW[bi], binG[bi] / binW[bi], binB[bi] / binW[bi]] : meanLin);
  // rank bins by weight
  const order = [...Array(BINS).keys()].sort((a, b) => binW[b] - binW[a]);
  const heaviest = binW[order[0]] > 1e-6 ? order[0] : -1;
  const primary = heaviest >= 0 ? binMean(heaviest) : meanLin;

  // secondary: heaviest bin at least 3 hue-bins away (circular) from primary.
  let secBin = -1;
  if (heaviest >= 0) {
    for (const bi of order) {
      const dist = Math.min((bi - heaviest + BINS) % BINS, (heaviest - bi + BINS) % BINS);
      if (dist >= 3 && binW[bi] > 1e-6) { secBin = bi; break; }
    }
  }
  const secondary = secBin >= 0 ? binMean(secBin) : (order[1] !== undefined && binW[order[1]] > 1e-6 ? binMean(order[1]) : primary);

  // accent: remaining bin with the highest mean saturation.
  let accBin = -1, accScore = -Infinity;
  for (let bi = 0; bi < BINS; bi++) {
    if (bi === heaviest || bi === secBin || binW[bi] < 1e-6) continue;
    const ms = binSat[bi] / binW[bi];
    if (ms > accScore) { accScore = ms; accBin = bi; }
  }
  const accent = accBin >= 0 ? binMean(accBin) : secondary;

  const lift = (c, to) => [Math.max(c[0], to), Math.max(c[1], to), Math.max(c[2], to)];
  const bright = brW > 1e-6 ? [brR / brW, brG / brW, brB / brW] : lift(primary, 0.85);
  const dark = dkW > 1e-6
    ? [(dkR / dkW) * 0.4, (dkG / dkW) * 0.4, (dkB / dkW) * 0.4]
    : [primary[0] * 0.15, primary[1] * 0.15, primary[2] * 0.15];

  // NAV dot color: saturation-weighted mean, lifted so it reads on the chart.
  let navColor = '#8fa0c8';
  if (nw > 0) {
    let r = nr / nw, g = ng / nw, b = nb / nw;
    const mx = Math.max(r, g, b, 1);
    const l = 225 / mx;
    r = Math.min(255, r * l); g = Math.min(255, g * l); b = Math.min(255, b * l);
    navColor = '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
  }

  const stats = { meanL, darkFrac: darkMask / maskSum };
  return { palette: { primary, secondary, accent, bright, dark }, stats, navColor };
}

// --- build: pick a type from the art, then hand off to the type builder ---

function buildLayers(item, extracted) {
  const { record, seed, radius } = item;
  const { palette, stats, navColor } = extracted;
  const type = classifyNebula(item.file, seed, stats);
  // Build stream: independent of the placement stream (computePlacement) so the
  // geometry is stable and adding a painting never disturbs the others.
  const rng = mulberry32(seed ^ 0x9e3779b9);
  buildNebulaOfType(type, { record, radius, rng, palette });
  record.navColor = navColor;
  record.type = type;
  record.built = true;
}

// --- async load/build queue: two decode chains, one CPU build per macrotask ---

function startBuildQueue() {
  let qi = 0;
  const step = () => {
    if (qi >= paintingNebulae.length) return;
    const item = paintingNebulae[qi++];
    const img = new Image();
    img.onload = () => {
      try {
        buildLayers(item, extractPalette(img));
      } catch (e) {
        console.warn('painting nebula build failed:', item.file, e);
      }
      setTimeout(step, 0);
    };
    img.onerror = () => {
      console.warn('painting nebula image failed to load:', item.file);
      setTimeout(step, 0);
    };
    img.src = item.url;
  };
  step();
  step();
}

// Synchronous: placements, groups, gravity, floating-origin and NAV records
// all exist before snapshotShiftables() and the first nav frame. Only the
// pixels arrive later.
export function initPaintingNebulae(scene) {
  const entries = Object.entries(GALLERY)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([path, url]) => ({ file: path.split('/').pop(), url }))
    .filter(({ file }) => !UNTITLED_RE.test(file) && !SKIP_FILES.has(file));

  const takenDirs = [];
  for (const { file, url } of entries) {
    const seed = hashStr(file);
    const { dir, distance, radius, mass, quaternion } = computePlacement(seed, takenDirs);
    takenDirs.push(dir);

    const group = new THREE.Group();
    group.position.copy(dir).multiplyScalar(distance);
    group.quaternion.copy(quaternion);
    scene.add(group);
    addShiftable(group); // floating-origin: moves with the world, restores on reset
    addBody({ position: group.position, mass }); // gentle pull, never a hazard

    const record = {
      id: 'p-' + slug(file),
      name: deriveName(file),
      group,
      navColor: '#8fa0c8', // placeholder until the painting decodes
      logDist: C.NEBULA_LOG_DIST,
      mats: [], // live array — updateDeepNebula picks up clouds as they land
      intensity: 1.0,
      // No `facing`: the old billboard design brightened when viewed face-on
      // (a uniform lit disc — the "planet" read). Volumetric types have real
      // silhouettes, so updateDeepNebula's facing boost is deliberately skipped
      // (its `if (n.facing)` guard). Planetary nebulae set coreFade at build.
      facing: null,
      coreFade: null,
      fadeStart: 0,
      fadeEnd: 0,
      built: false,
    };
    deepNebulae.push(record);
    paintingNebulae.push({ record, file, url, seed, dir, distance, radius });
  }

  startBuildQueue();
}
