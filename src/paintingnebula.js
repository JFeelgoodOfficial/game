// Painting nebulae (owner feature) — every titled painting in /artgallery
// becomes a flyable nebula in the OUTER SHELL of the universe (beyond all the
// planets, inside the sun and the NAV chart edge). Unlike the hand-authored
// configs in deepnebula.js, these are built by pixel-sampling the painting
// itself: seen front-on (they face the inner system, so you approach them
// face-first flying outward) the original painting reads as the whole nebula;
// flown around or through, the depth scatter and per-nebula shaping make it
// just a beautiful cloud in the painting's colors.
//
// Recognizability rules the shaping: per-nebula variation lives almost
// entirely in DEPTH (slab thickness, dome/ripple/shear z-profiles, luminance
// relief), which is invisible from the front vantage. In-plane distortion is
// tiny and edge-weighted so the painting's center stays pinned.
//
// Placement, shape, and sampling are all seeded from the painting's filename,
// so the layout is stable across sessions and adding a new painting later
// never moves the existing ones.
//
// Registration is synchronous (before snapshotShiftables/nav), but the pixels
// load and build asynchronously after boot — the game starts instantly and
// the clouds pop in over a few seconds, 100k+ units away where nobody sees it.

import * as THREE from 'three';
import { C } from './constants.js';
import { addShiftable } from './origin.js';
import { addBody } from './gravity.js';
import { settings } from './settings.js';
import { SUN } from './planet.js';
import { deepNebulae, makeCloud } from './deepnebula.js';
import gasFrag from './shaders/deepnebula.frag?raw';
import dustFrag from './shaders/deepnebulaDust.frag?raw';

// Built painting nebulae, for debug/verification. Each: { record, file, url,
// dir, distance, radius, P } where `record` is the shared deepNebulae entry.
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

// --- per-nebula shape: "each one a little different", painting preserved ---

function shapeParams(rng, R) {
  return {
    R,
    depth: R * (0.45 + 0.4 * rng()), // slab thickness (z scatter)
    zProfile: ['dome', 'ripple', 'shear'][(rng() * 3) | 0],
    zAmp: R * (0.1 + 0.15 * rng()),
    relief: (rng() < 0.5 ? -1 : 1) * (0.2 + 0.3 * rng()), // luminance -> z push
    swirl: (rng() - 0.5) * 0.5, // |swirl| <= 0.25 rad, edge-weighted
    arms: 2 + ((rng() * 4) | 0),
    filAmp: R * (0.03 + 0.05 * rng()),
    waveAmp: R * (0.02 + 0.02 * rng()),
    waveF: 3 + 3 * rng(),
    phase: rng() * Math.PI * 2,
    dustOpacity: 0.22 + 0.16 * rng(), // near The Sisters' 0.25 — heavier crushed dark detail once the gas dimmed
    sizeMul: 0.85 + 0.35 * rng(),
  };
}

// Local frame: painting flat in XY, +Z toward the viewer at the origin.
// Almost all the character goes into z, which the front vantage can't see;
// in-plane displacement is weighted by (r/R)^2 so the center stays pinned.
function warpGentle(x, y, z, P) {
  const R = P.R;
  const r = Math.hypot(x, y);
  if (P.zProfile === 'dome') z += P.zAmp * (1 - (r / R) * (r / R));
  else if (P.zProfile === 'ripple') z += P.zAmp * Math.sin(2.2 * x / R + P.phase) * Math.cos(1.7 * y / R);
  else z += P.zAmp * (x / R); // shear

  const w = Math.min(1, (r / R) * (r / R));
  let a = Math.atan2(y, x) + P.swirl * w;
  const r2 = r + Math.sin(a * P.arms + P.phase) * P.filAmp * w;
  x = r2 * Math.cos(a);
  y = r2 * Math.sin(a);
  x += Math.sin(y * P.waveF / R) * P.waveAmp * w;
  y += Math.cos(x * P.waveF / R) * P.waveAmp * w;
  return [x, y, z];
}

// --- pixel sampling ---

const GRID = 128;

function smooth01(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Draw the painting CONTAINED (aspect kept — portrait paintings become
// portrait nebulae) into a GRID^2 canvas and read every pixel. Colors are
// converted sRGB -> linear for the vertex attributes (the renderer runs ACES
// + color management; raw sRGB would wash out). The elliptical mask feathers
// the painting's edges into space and gates every layer, so nothing samples
// the empty canvas border.
function samplePainting(img) {
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
  const L = new Float32Array(N);
  const colLin = new Float32Array(N * 3);
  const mask = new Float32Array(N);
  let meanL = 0;
  let maskSum = 0;
  let nr = 0, ng = 0, nb = 0, nw = 0; // navColor accumulator (stays sRGB)
  for (let k = 0; k < N; k++) {
    const i = k % G;
    const j = (k / G) | 0;
    const u = (i + 0.5) / G - 0.5;
    const v = (j + 0.5) / G - 0.5;
    const re = Math.hypot(u / (0.5 * ax), v / (0.5 * ay)); // 1 at the ellipse edge
    mask[k] = 1 - smooth01(0.75, 1.0, re);

    const p = k * 4;
    const r = px[p], g = px[p + 1], b = px[p + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    L[k] = lum;
    colLin[k * 3] = Math.pow(r / 255, 2.2);
    colLin[k * 3 + 1] = Math.pow(g / 255, 2.2);
    colLin[k * 3 + 2] = Math.pow(b / 255, 2.2);
    meanL += lum * mask[k];
    maskSum += mask[k];

    const mx = Math.max(r, g, b);
    const sat = mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
    if (mask[k] > 0.5 && sat > 0.25 && lum > 60 && lum < 220) {
      const w = sat * mask[k];
      nr += r * w; ng += g * w; nb += b * w; nw += w;
    }
  }
  meanL /= Math.max(1e-6, maskSum);

  // NAV dot color: saturation-weighted mean, lifted so it reads on the chart.
  let navColor = '#8fa0c8';
  if (nw > 0) {
    let r = nr / nw, g = ng / nw, b = nb / nw;
    const mx = Math.max(r, g, b, 1);
    const lift = 225 / mx;
    r = Math.min(255, r * lift); g = Math.min(255, g * lift); b = Math.min(255, b * lift);
    navColor = '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
  }

  return { G, L, colLin, mask, meanL, ax, ay, navColor };
}

// --- geometry: one additive Points (gas + stars) and maybe one dust Points ---

function buildLayers(item, sample) {
  const { record, radius, P } = item;
  const { G, L, colLin, mask } = sample;
  const N = G * G;
  const rng = mulberry32(item.seed ^ 0x9e3779b9); // fresh stream: sampling only
  const low = settings.quality === 'low';

  const xAt = (k) => (((k % G) + 0.5) / G - 0.5) * 2 * radius; // local, painting frame
  const yAt = (k) => (0.5 - (((k / G) | 0) + 0.5) / G) * 2 * radius;

  // Gas: presence from luminance (shadows thin, highlights slightly restrained
  // so the additive pile-up doesn't torch them), gated by the elliptical mask.
  const gasW = new Float32Array(N);
  let maxG = 1e-6;
  for (let k = 0; k < N; k++) {
    const w = mask[k] * smooth01(12, 72, L[k]) * (1 - 0.5 * smooth01(205, 255, L[k]));
    gasW[k] = w;
    if (w > maxG) maxG = w;
  }

  const pos = [], col = [], siz = [];
  // Density scales with the painting's area so a big nebula reads as filled,
  // not sparse — matched to The Sisters' points-per-area and capped for perf.
  const areaScale = Math.min(2.4, (radius / RADIUS_MIN) ** 2);
  const GAS_N = Math.round((low ? 6500 : 10500) * areaScale);
  let placed = 0, tries = 0;
  while (placed < GAS_N && tries < GAS_N * 10) {
    tries++;
    const k = (rng() * N) | 0;
    if (rng() > gasW[k] / maxG) continue;
    const jx = (rng() - 0.5) * radius * 0.05;
    const jy = (rng() - 0.5) * radius * 0.05;
    const z = (rng() - 0.5) * P.depth + (L[k] / 255 - 0.5) * P.depth * P.relief;
    const wp = warpGentle(xAt(k) + jx, yAt(k) + jy, z, P);
    const b = (0.02 + 0.04 * Math.sqrt(L[k] / 255)) * (0.7 + 0.6 * rng());
    pos.push(wp[0], wp[1], wp[2]);
    col.push(colLin[k * 3] * b, colLin[k * 3 + 1] * b, colLin[k * 3 + 2] * b);
    siz.push(radius * (0.045 + 0.055 * rng()) * P.sizeMul);
    placed++;
  }

  // Stars: the painting's bright specks, embedded at painting positions so
  // they land where the highlights are. A few cross the bloom threshold.
  const bright = [];
  for (let k = 0; k < N; k++) if (L[k] > 208 && mask[k] > 0.3) bright.push(k);
  const SN = bright.length ? Math.min(low ? 300 : 500, 90 + bright.length) : 0;
  for (let s = 0; s < SN; s++) {
    const k = bright[(rng() * bright.length) | 0];
    const z = (rng() - 0.5) * P.depth;
    const wp = warpGentle(xAt(k), yAt(k), z, P);
    const warm = rng() < 0.25;
    // Cubic tail like the hand-made nebulae: most stars stay under the bloom
    // threshold, only the tail blooms — specks on highlights, not blanket glow.
    const b = 0.35 + 0.85 * Math.pow(rng(), 3);
    pos.push(wp[0], wp[1], wp[2]);
    col.push((warm ? 1 : 0.85) * b, (warm ? 0.8 : 0.9) * b, (warm ? 0.6 : 1) * b);
    siz.push(radius * (0.006 + 0.006 * rng()));
  }

  const margin = radius * 1.45; // warp + max sprite radius stays inside
  const gasPts = makeCloud(record.mats, record.intensity, {
    positions: new Float32Array(pos),
    colors: new Float32Array(col),
    sizes: new Float32Array(siz),
    frag: gasFrag,
    blending: THREE.AdditiveBlending,
    renderOrder: -3,
  });
  // Unlike the two hand-made nebulae these are 24 distant bodies — give them a
  // real bounding sphere and let the frustum cull whole nebulae behind you.
  gasPts.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), margin);
  gasPts.frustumCulled = true;
  record.group.add(gasPts);

  // Dust: every painting's darkest mass becomes an occluding layer — the
  // Sisters' dark-spine recipe. The count follows the dark mass itself (the
  // rejection sampler normalizes by maxD, not mass), so a bright painting
  // with one dark speck gets a wisp, not the full budget piled on it.
  {
    const dW = new Float32Array(N);
    let maxD = 1e-6;
    let dSum = 0;
    for (let k = 0; k < N; k++) {
      const w = mask[k] * (L[k] < 80 ? 1 - L[k] / 80 : 0);
      dW[k] = w;
      dSum += w;
      if (w > maxD) maxD = w;
    }
    const DUST_N = Math.min(low ? 1200 : 2000, Math.round((dSum / maxD) * 2));
    if (maxD > 1e-3 && DUST_N > 20) {
      const dp = [], dc = [], ds = [];
      let dPlaced = 0, dTries = 0;
      while (dPlaced < DUST_N && dTries < DUST_N * 10) {
        dTries++;
        const k = (rng() * N) | 0;
        if (rng() > dW[k] / maxD) continue;
        const z = (rng() - 0.5) * P.depth * 0.8;
        const wp = warpGentle(xAt(k), yAt(k), z, P);
        dp.push(wp[0], wp[1], wp[2]);
        dc.push(colLin[k * 3] * 0.5, colLin[k * 3 + 1] * 0.5, colLin[k * 3 + 2] * 0.55);
        ds.push(radius * (0.08 + 0.08 * rng()));
        dPlaced++;
      }
      const dustPts = makeCloud(record.mats, record.intensity, {
        positions: new Float32Array(dp),
        colors: new Float32Array(dc),
        sizes: new Float32Array(ds),
        frag: dustFrag,
        blending: THREE.NormalBlending,
        renderOrder: -1,
        opacity: P.dustOpacity,
      });
      dustPts.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), margin);
      dustPts.frustumCulled = true;
      record.group.add(dustPts);
    }
  }

  record.navColor = sample.navColor;
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
        buildLayers(item, samplePainting(img));
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
    const { rng, dir, distance, radius, mass, quaternion } = computePlacement(seed, takenDirs);
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
      // Painting front (+Z local) in world space: updateDeepNebula lifts the
      // brightness toward full when the player views it from this side, so the
      // painting reads perfectly face-on while every other angle stays hazy.
      facing: new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion),
      coreFade: null,
      fadeStart: 0,
      fadeEnd: 0,
      built: false,
    };
    deepNebulae.push(record);
    paintingNebulae.push({ record, file, url, seed, dir, distance, radius, P: shapeParams(rng, radius) });
  }

  startBuildQueue();
}
