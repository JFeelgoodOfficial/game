// ---------------------------------------------------------------------------
// The Indigo Reach: Neptunia's factory ship (GDD 5.x exception — a bespoke
// structure, like the Sky City). A 260 u steel fishing-and-drilling vessel
// under way on a storm sea, and the only place on the planet to set down.
//
// FRAMES
//   anchor  child of planet.surface, at the registry site on the still-sea
//           level, +Y = the site's up. It never moves: this is the frame the
//           sea patch, walk.js and the registry all share ("city-local").
//   hull    child of anchor. Rides the swell: heave, pitch and roll come from
//           the CPU mirror of the sea patch's wave table (world/seapatch.js),
//           so the plating meets the water it is drawn in. Everything you can
//           see or stand on is hull-local: +Z the bow, +Y up, y = 0 the
//           waterline, origin amidships.
//
// LAYOUT (hull-local)
//   z -130..-74   flight deck (y 13) over the stern, pad at (0, -100)
//   z  -58..-14   superstructure: market (y 10), mess hall (y 15), bridge (y 20)
//   z  -14.. 88   working deck (y 10): moon pool and derrick at z 20, cranes,
//                 trawl gallows, net drums, pot stacks; the processing hold
//                 underneath (y 5, z 44..84)
//   z   88..125   forecastle (y 14): windlasses, the sonar dome, the bow crane
//
// Geometry is merged into a handful of vertex-coloured meshes (the Sky City
// pattern); the plating, rivets, rust, tread and deck paint are all evaluated
// per pixel from hull-local position, so they hold at arm's length.
// Deterministic: seeded mulberry32, no Math.random.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C } from '../src/constants.js';
import { createSeaPatch } from './seapatch.js';
import { createReachTube } from './reachtube.js';
import { ownedWeapons, grantWeapon } from '../src/inventory.js';

export const HULL = {
  L: 130, // half length
  B: 23, // half beam
  DRAFT: 7,
  MAIN: 10, // main (weather) deck
  LOWER: 5, // processing hold floor
  FLIGHT: 13, // flight deck
  FOC: 14, // forecastle deck
  T2: 15, // mess hall floor / tier-1 roof
  T3: 20, // bridge floor / tier-2 roof
  ROOF: 25,
  PAD: { x: 0, z: -100, r: 17 },
  POOL: { x: 0, z: 20, r: 7 }, // the moon pool: the tube goes down from here
  HEAVE: 1.0, // pose clamps
  PITCH: THREE.MathUtils.degToRad(1.6),
  ROLL: THREE.MathUtils.degToRad(3),
  SEED: 0x1d190a,
};
const H = HULL;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Half-width of the hull at station z: a blunt transom stern, a finer bow.
// world/seapatch.js cuts the same outline out of the water (ocean.frag).
export function hullHalfWidth(z) {
  const q = Math.min(Math.abs(z) / H.L, 1);
  const e = z > 0 ? 2.1 : 4.5;
  return H.B * Math.pow(Math.max(1 - Math.pow(q, e), 0), 1 / e);
}

const PAINT = {
  hullTop: 0x30353b, hullRed: 0x5c221c, deck: 0x4b5357, deckDark: 0x3a4145,
  house: 0x767c80, houseDark: 0x5d6367, houseLight: 0x8e9498, trim: 0x23272b,
  crane: 0xb48a22, rust: 0x6a3a20, orange: 0xc4541c, verdigris: 0x4f9079,
  rope: 0x6d6046, pot: 0x394a52, net: 0x2f5a52, white: 0xb9bcbc, pipe: 0x4a5560,
  amber: 0xffb155, red: 0xff3a26, green: 0x38ff7a, flood: 0xfff0d0, cyan: 0x66e8ff,
};

const _c = new THREE.Color();
function tint(geo, hex) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}
function boxG(w, h, d, x, y, z, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}
function cylG(rTop, rBot, h, x, y, z, seg = 12) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, y, z);
  return g;
}
// A box beam between two points (booms, struts, stays).
const _m = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function beamG(ax, ay, az, bx, by, bz, t, round = false) {
  _a.set(ax, ay, az); _b.set(bx, by, bz);
  const len = _a.distanceTo(_b);
  const g = round ? new THREE.CylinderGeometry(t, t, len, 6) : new THREE.BoxGeometry(t, len, t);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, _b.clone().sub(_a).normalize());
  g.applyQuaternion(q);
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return g;
}

// --- materials --------------------------------------------------------------

const GLSL_NOISE = `
float rsHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rsNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rsHash(i), rsHash(i + vec2(1.0, 0.0)), f.x), mix(rsHash(i + vec2(0.0, 1.0)), rsHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float rsFbm(vec2 p) { return 0.55 * rsNoise(p) + 0.3 * rsNoise(p * 2.1 + 7.3) + 0.15 * rsNoise(p * 4.3 + 1.9); }
// 1 on the plate, 0 in a seam of half-width w, antialiased
float rsSeam(float d, float w) { float fw = fwidth(d) + 1e-4; return smoothstep(w - fw, w + fw, d); }
`;

// Bulkheads, hull and gear: vertex colour is the paint; the shader lays
// plating, rivet rows, rust runs and waterline fouling over it.
function makeBulkheadMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.7, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHullPos;\nvarying vec3 vHullNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHullPos = position;\nvHullNrm = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vHullPos;\nvarying vec3 vHullNrm;\nfloat vRust;\n${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 an = abs(vHullNrm);
    // project onto the face's own plane: u runs along the wall, v up it
    vec2 uv = an.y > 0.7 ? vHullPos.xz : (an.x > an.z ? vHullPos.zy : vHullPos.xy);
    float wall = 1.0 - step(0.7, an.y);
    float dist = length(vViewPosition);
    float fine = 1.0 - smoothstep(40.0, 140.0, dist);
    // staggered strakes 3 x 2
    vec2 pc = uv / vec2(3.0, 2.0);
    pc.x += 0.5 * floor(pc.y);
    vec2 cell = floor(pc), f = fract(pc);
    float tone = rsHash(cell);
    vec2 edge = min(f, 1.0 - f) * vec2(3.0, 2.0);
    float seam = rsSeam(min(edge.x, edge.y), 0.035);
    // rivets along the seams
    vec2 rv = fract(uv / 0.4) - 0.5;
    float rivet = (1.0 - smoothstep(0.06, 0.11, length(rv) * 0.4)) * (1.0 - smoothstep(0.12, 0.2, min(edge.x, edge.y))) * fine;
    // rust: blooms out of seams and runs down the wall
    float run = rsFbm(vec2(uv.x * 0.9, uv.y * 0.11)) * wall + rsFbm(uv * 0.35) * (1.0 - wall);
    float blotch = rsFbm(uv * 0.23 + 11.0);
    float low = wall * (1.0 - smoothstep(0.0, 6.0, vHullPos.y)); // worse near the water
    vRust = smoothstep(0.62, 0.86, run * 0.6 + blotch * 0.5 + (1.0 - seam) * 0.25 + low * 0.2);
    vec3 base = diffuseColor.rgb * (0.86 + 0.28 * tone);
    base *= mix(0.55, 1.0, seam);
    base = mix(base, base * 1.5 + 0.03, rivet * 0.6);
    vec3 rust = mix(vec3(0.30, 0.13, 0.055), vec3(0.47, 0.24, 0.09), rsNoise(uv * 3.0));
    base = mix(base, rust, vRust * 0.8);
    // grime gathers under ledges; salt bleaches the weather faces
    base *= 0.9 + 0.2 * rsNoise(uv * 0.08 + 3.0);
    // waterline: a weed-dark band that the swell keeps wet
    float wl = wall * (1.0 - smoothstep(0.2, 1.6 + 0.8 * rsNoise(vec2(uv.x * 0.2, 0.0)), vHullPos.y)) * step(-0.5, vHullPos.y);
    base = mix(base, vec3(0.03, 0.05, 0.04), wl * 0.75);
    diffuseColor.rgb = base;
  }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.96, vRust);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - 0.85 * vRust;');
  };
  return mat;
}

// Decks: tread plate, plate seams, rust stains, standing water — and all the
// paint: the pad's circle and H, hazard bands round every hole, walk lines.
function makeDeckMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.62 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHullPos;\nvarying vec3 vHullNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHullPos = position;\nvHullNrm = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vHullPos;\nvarying vec3 vHullNrm;\nfloat vWet;\nfloat vRust;\n${GLSL_NOISE}
float rsBand(float d, float w) { float fw = fwidth(d) + 1e-4; return 1.0 - smoothstep(w - fw, w + fw, abs(d)); }
float rsChevron(vec2 p) { return step(0.5, fract((p.x + p.y) / 1.6)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 p = vHullPos.xz;
    float y = vHullPos.y;
    float top = step(0.7, vHullNrm.y);
    float dist = length(vViewPosition);
    float fine = 1.0 - smoothstep(18.0, 60.0, dist);
    // 4 x 4 plates
    vec2 pc = p / 4.0; pc.x += 0.5 * floor(pc.y);
    vec2 cell = floor(pc), f = fract(pc);
    vec2 edge = min(f, 1.0 - f) * 4.0;
    float seam = rsSeam(min(edge.x, edge.y), 0.03);
    vec3 base = diffuseColor.rgb * (0.88 + 0.24 * rsHash(cell));
    base *= mix(0.6, 1.0, seam);
    // diamond tread: two crossed sets of raised lozenges
    vec2 t1 = fract(vec2(p.x + p.y, p.x - p.y) * 2.2) - 0.5;
    vec2 t2 = fract(vec2(p.x + p.y, p.x - p.y) * 2.2 + 0.5) - 0.5;
    float tread = max(1.0 - smoothstep(0.03, 0.09, abs(t1.x) * 0.5 + abs(t1.y) * 0.18), 1.0 - smoothstep(0.03, 0.09, abs(t2.y) * 0.5 + abs(t2.x) * 0.18));
    base = mix(base, base * 1.45 + 0.02, tread * fine * top * 0.6);

    // ---- paint (weather decks only: top faces) ----
    vec3 YEL = vec3(0.78, 0.60, 0.07), WHT = vec3(0.72, 0.72, 0.68), BLK = vec3(0.035);
    float wear = smoothstep(0.25, 0.75, rsFbm(p * 0.6 + 3.0)); // paint scuffs off in patches
    float paint = 0.0; vec3 pcol = YEL;
    if (y > ${(H.FLIGHT - 0.4).toFixed(1)} && y < ${(H.FLIGHT + 0.6).toFixed(1)} && p.y < -70.0) {
      vec2 q = p - vec2(${H.PAD.x.toFixed(1)}, ${H.PAD.z.toFixed(1)});
      float r = length(q);
      paint = max(paint, rsBand(r - ${H.PAD.r.toFixed(1)}, 0.55));            // touchdown circle
      paint = max(paint, rsBand(r - ${(H.PAD.r * 0.45).toFixed(1)}, 0.3));   // aiming circle
      // the H
      float hbar = step(abs(abs(q.x) - 3.0), 0.7) * step(abs(q.y), 4.6);
      hbar = max(hbar, step(abs(q.x), 3.0) * step(abs(q.y), 0.7));
      if (hbar > 0.5) { paint = 1.0; pcol = WHT; }
      // approach bars off the stern, and the deck-edge line
      float bars = step(abs(fract(q.x / 5.0) - 0.5), 0.14) * step(abs(q.y + 24.5), 1.6) * step(abs(q.x), 16.0);
      paint = max(paint, bars);
      float edgeL = max(rsBand(abs(p.x) - 20.0, 0.25) * step(p.y, -74.5), rsBand(p.y + 75.0, 0.25) * step(abs(p.x), 20.2));
      if (edgeL > paint) { paint = edgeL; pcol = WHT; }
    }
    if (y > ${(H.MAIN - 0.4).toFixed(1)} && y < ${(H.MAIN + 0.6).toFixed(1)}) {
      // hazard ring round the moon pool
      float rp = length(p - vec2(${H.POOL.x.toFixed(1)}, ${H.POOL.z.toFixed(1)}));
      float haz = step(${(H.POOL.r + 0.6).toFixed(1)}, rp) * step(rp, ${(H.POOL.r + 2.6).toFixed(1)});
      // ...and round the companionway hatches
      vec2 hq = abs(vec2(abs(p.x) - 10.5, p.y - 37.0)) - vec2(2.5, 7.0);
      float hd = max(hq.x, hq.y);
      haz = max(haz, step(0.4, hd) * step(hd, 1.6));
      if (haz > 0.5) { paint = 1.0; pcol = mix(BLK, YEL, rsChevron(p)); }
      // walkways down each side of the working deck
      float lane = rsBand(abs(abs(p.x) - 17.0) - 1.3, 0.12) * step(-14.0, p.y) * step(p.y, 86.0);
      if (lane > paint) { paint = lane; pcol = YEL; }
    }
    base = mix(base, pcol, paint * top * (0.45 + 0.5 * wear));

    // rust stains spreading from the seams, and water lying in the low plates
    vRust = smoothstep(0.58, 0.82, rsFbm(p * 0.27 + 5.0) * 0.75 + (1.0 - seam) * 0.3) * (1.0 - 0.6 * paint);
    vec3 rust = mix(vec3(0.27, 0.12, 0.05), vec3(0.42, 0.21, 0.08), rsNoise(p * 2.7));
    base = mix(base, rust, vRust * 0.8);
    vWet = top * smoothstep(0.5, 0.68, rsFbm(p * 0.13 + 21.0));
    base *= mix(1.0, 0.5, vWet);
    diffuseColor.rgb = base;
  }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, 0.95, vRust), 0.08, vWet);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - 0.8 * vRust;');
  };
  return mat;
}

// --- the walkable structure ---------------------------------------------------
// Slabs, z-ramps and wall boxes in hull-local space: the contract walk.js
// expects of a city building (world/city.js makeStructure), kept here so the
// boot bundle does not pull the whole town generator in after it.
const STEP_UP = 0.7;
function makeStructure(surfaces, walls) {
  return {
    surfaces, walls,
    surfaceYAt(x, z, feetY) {
      let best = null;
      for (let i = 0; i < surfaces.length; i++) {
        const s = surfaces[i];
        if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
        let y = s.y;
        if (s.ramp) {
          const t = Math.min(Math.max((z - s.zA) / (s.zB - s.zA), 0), 1);
          y = s.yA + (s.yB - s.yA) * t;
        }
        if (y <= feetY + STEP_UP && (best === null || y > best)) best = y;
      }
      return best;
    },
    resolveWalls(p, r) {
      let pushed = false;
      for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (p.y >= w.y1 || p.y + 1.7 <= w.y0) continue;
        const ex0 = w.x0 - r, ex1 = w.x1 + r, ez0 = w.z0 - r, ez1 = w.z1 + r;
        if (p.x <= ex0 || p.x >= ex1 || p.z <= ez0 || p.z >= ez1) continue;
        const dx = Math.min(p.x - ex0, ex1 - p.x);
        const dz = Math.min(p.z - ez0, ez1 - p.z);
        if (dx < dz) p.x = p.x - ex0 < ex1 - p.x ? ex0 : ex1;
        else p.z = p.z - ez0 < ez1 - p.z ? ez0 : ez1;
        pushed = true;
      }
      return pushed;
    },
    // fraction along (x0,z0)->(x1,z1) of the first wall crossed, or null
    segmentHit(x0, z0, x1, z1, feetY) {
      const dx = x1 - x0, dz = z1 - z0;
      let best = null;
      for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (feetY >= w.y1 || feetY + 1.7 <= w.y0) continue;
        let t0 = 0, t1 = 1;
        if (dx === 0) { if (x0 < w.x0 || x0 > w.x1) continue; }
        else {
          let ta = (w.x0 - x0) / dx, tb = (w.x1 - x0) / dx;
          if (ta > tb) { const s = ta; ta = tb; tb = s; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
        if (dz === 0) { if (z0 < w.z0 || z0 > w.z1) continue; }
        else {
          let ta = (w.z0 - z0) / dz, tb = (w.z1 - z0) / dz;
          if (ta > tb) { const s = ta; ta = tb; tb = s; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
        if (t0 > 0 && (best === null || t0 < best)) best = t0;
      }
      return best;
    },
  };
}

// ---------------------------------------------------------------------------

export function createReachShip(planet, def) {
  const rng = mulberry32(H.SEED);
  const rw = planet.radius + C.WALK_WATER_LEVEL;

  const sea = createSeaPatch(planet, def.site, { hull: { halfBeam: H.B, halfLength: H.L } });

  const anchor = new THREE.Group();
  anchor.name = 'reachAnchor';
  anchor.quaternion.copy(sea.anchorQ);
  anchor.position.copy(def.site).multiplyScalar(rw);
  planet.surface.add(anchor);
  const hull = new THREE.Group();
  hull.name = 'reachHull';
  anchor.add(hull);

  // geometry buckets -> one merged mesh each
  const solid = []; // bulkhead material
  const deck = []; // deck material
  const glow = []; // emissive, over the bloom threshold
  const glass = [];
  const detail = []; // small gear: hidden from far away (bulkhead material)

  const surfaces = [];
  const walls = [];
  const S = (list, g, color) => { list.push(tint(g, color)); return g; };
  const slab = (x0, x1, z0, z1, y) => surfaces.push({ x0, x1, z0, z1, y });
  const ramp = (x0, x1, zA, yA, zB, yB) => surfaces.push({
    x0, x1, z0: Math.min(zA, zB), z1: Math.max(zA, zB), ramp: true, zA, yA, zB, yB, y: Math.min(yA, yB),
  });
  const wall = (x0, x1, z0, z1, y0, y1) => walls.push({
    x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1,
  });
  // a solid box you can see AND bump into (and, with `stand`, walk on top of)
  const block = (list, w, h, d, x, y, z, color, stand = false) => {
    S(list, boxG(w, h, d, x, y + h / 2, z), color);
    wall(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y, y + h);
    if (stand) slab(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y + h);
  };
  // deck plate: visual slab + walkable surface
  const plate = (x0, x1, z0, z1, y, t = 0.35, color = PAINT.deck) => {
    S(deck, boxG(x1 - x0, t, z1 - z0, (x0 + x1) / 2, y - t / 2, (z0 + z1) / 2), color);
    slab(x0, x1, z0, z1, y);
  };
  // stairs along z: a ramp to walk, treads to look at, a stringer each side
  const stairs = (x0, x1, zA, yA, zB, yB, rails = true) => {
    ramp(x0, x1, zA, yA, zB, yB);
    const n = Math.max(2, Math.round(Math.abs(yB - yA) / 0.4));
    const xc = (x0 + x1) / 2, wd = x1 - x0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      S(deck, boxG(wd, 0.12, Math.abs(zB - zA) / n * 0.9, xc, yA + (yB - yA) * t - 0.06, zA + (zB - zA) * t), PAINT.deckDark);
    }
    for (const x of [x0, x1]) {
      S(solid, beamG(x, yA - 0.2, zA, x, yB - 0.2, zB, 0.28), PAINT.trim);
      if (rails) {
        S(detail, beamG(x, yA + 1.15, zA, x, yB + 1.15, zB, 0.09), PAINT.crane);
        const posts = Math.max(2, Math.round(Math.abs(zB - zA) / 2.5));
        for (let i = 0; i <= posts; i++) {
          const t = i / posts;
          S(detail, boxG(0.09, 1.15, 0.09, x, yA + (yB - yA) * t + 0.57, zA + (zB - zA) * t), PAINT.crane);
        }
      }
    }
  };
  // A wall along one axis with door gaps. axis 'x': runs along x at z = at;
  // axis 'z': runs along z at x = at. gaps: [{ c, w, h }]. opts.win: window
  // band {y, h, pitch, w} as amber glow on both faces; opts.open: a glazed
  // strip from y0+sill to y1-head (real glass, see-through).
  const TH = 0.5;
  const wallRun = (axis, at, a0, a1, y0, y1, gaps = [], opts = {}) => {
    const color = opts.color ?? PAINT.house;
    const cuts = gaps.slice().sort((p, q) => p.c - q.c);
    let from = a0;
    const seg = (s0, s1, sy0, sy1, collide = true) => {
      if (s1 - s0 < 0.05 || sy1 - sy0 < 0.05) return;
      const len = s1 - s0, mid = (s0 + s1) / 2;
      if (axis === 'x') {
        S(solid, boxG(len, sy1 - sy0, TH, mid, (sy0 + sy1) / 2, at), color);
        if (collide) wall(s0, s1, at - TH / 2, at + TH / 2, sy0, sy1);
      } else {
        S(solid, boxG(TH, sy1 - sy0, len, at, (sy0 + sy1) / 2, mid), color);
        if (collide) wall(at - TH / 2, at + TH / 2, s0, s1, sy0, sy1);
      }
    };
    const body = (s0, s1) => {
      if (s1 - s0 < 0.05) return;
      if (opts.open) {
        const sill = y0 + (opts.open.sill ?? 1.1), head = y1 - (opts.open.head ?? 0.9);
        seg(s0, s1, y0, sill, false);
        seg(s0, s1, head, y1, false);
        // one collider for the whole height: glass stops you too
        if (axis === 'x') wall(s0, s1, at - TH / 2, at + TH / 2, y0, y1);
        else wall(at - TH / 2, at + TH / 2, s0, s1, y0, y1);
        const n = Math.max(1, Math.round((s1 - s0) / (opts.open.pitch ?? 3)));
        for (let i = 0; i <= n; i++) {
          const a = s0 + ((s1 - s0) * i) / n;
          if (axis === 'x') S(solid, boxG(0.22, head - sill, TH, a, (sill + head) / 2, at), PAINT.trim);
          else S(solid, boxG(TH, head - sill, 0.22, at, (sill + head) / 2, a), PAINT.trim);
        }
        const gl = axis === 'x'
          ? boxG(s1 - s0, head - sill, 0.06, (s0 + s1) / 2, (sill + head) / 2, at)
          : boxG(0.06, head - sill, s1 - s0, at, (sill + head) / 2, (s0 + s1) / 2);
        S(glass, gl, 0x9fd0e0);
      } else {
        seg(s0, s1, y0, y1);
        if (opts.win) {
          const wn = opts.win, pitch = wn.pitch ?? 3.2, ww = wn.w ?? 1.5;
          const n = Math.floor((s1 - s0 - 1.2) / pitch);
          for (let i = 0; i < n; i++) {
            const a = s0 + (s1 - s0) / 2 + (i - (n - 1) / 2) * pitch;
            if (rng() < (wn.dark ?? 0.18)) continue; // a few unlit
            const col = rng() < 0.12 ? PAINT.cyan : PAINT.amber;
            for (const side of [-1, 1]) {
              const off = side * (TH / 2 + 0.03);
              const g = axis === 'x'
                ? boxG(ww, wn.h, 0.05, a, y0 + wn.y + wn.h / 2, at + off)
                : boxG(0.05, wn.h, ww, at + off, y0 + wn.y + wn.h / 2, a);
              S(glow, g, col);
            }
            // frame
            const fr = axis === 'x'
              ? boxG(ww + 0.3, wn.h + 0.3, TH + 0.04, a, y0 + wn.y + wn.h / 2, at)
              : boxG(TH + 0.04, wn.h + 0.3, ww + 0.3, at, y0 + wn.y + wn.h / 2, a);
            S(detail, fr, PAINT.trim);
          }
        }
      }
    };
    for (const g of cuts) {
      body(from, g.c - g.w / 2);
      const top = y0 + (g.h ?? 2.6);
      if (top < y1 - 0.05) seg(g.c - g.w / 2, g.c + g.w / 2, top, y1, false); // lintel
      // door frame + a sill light
      for (const s of [-1, 1]) {
        const a = g.c + s * (g.w / 2 + 0.12);
        if (axis === 'x') S(detail, boxG(0.24, top - y0, TH + 0.2, a, (y0 + top) / 2, at), PAINT.crane);
        else S(detail, boxG(TH + 0.2, top - y0, 0.24, at, (y0 + top) / 2, a), PAINT.crane);
      }
      if (axis === 'x') S(glow, boxG(g.w * 0.5, 0.14, TH + 0.3, g.c, top + 0.25, at), PAINT.amber);
      else S(glow, boxG(TH + 0.3, 0.14, g.w * 0.5, at, top + 0.25, g.c), PAINT.amber);
      from = g.c + g.w / 2;
    }
    body(from, a1);
  };
  // handrail along z or x (visual posts + a low collider you can jump)
  const rail = (axis, at, a0, a1, y, collide = true) => {
    const len = a1 - a0;
    if (len < 0.3) return;
    const n = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (len * i) / n;
      S(detail, axis === 'x' ? boxG(0.1, 1.15, 0.1, a, y + 0.57, at) : boxG(0.1, 1.15, 0.1, at, y + 0.57, a), PAINT.crane);
    }
    for (const hy of [0.6, 1.15]) {
      S(detail, axis === 'x' ? boxG(len, 0.08, 0.08, (a0 + a1) / 2, y + hy, at) : boxG(0.08, 0.08, len, at, y + hy, (a0 + a1) / 2), PAINT.crane);
    }
    if (collide) {
      if (axis === 'x') wall(a0, a1, at - 0.15, at + 0.15, y, y + 1.15);
      else wall(at - 0.15, at + 0.15, a0, a1, y, y + 1.15);
    }
  };
  const lamp = (x, y, z, color = PAINT.flood, s = 0.32) => S(glow, boxG(s, s, s, x, y, z), color);

  // ======================= HULL SHELL =======================================
  {
    const zs = [];
    for (let z = -H.L + 0.4; z < H.L - 0.4; z += 4) zs.push(z);
    zs.push(H.L - 0.4);
    // section profile: [fraction of half-width, y]
    const prof = (z) => {
      const flare = z > 60 ? 1 + ((z - 60) / 70) * 0.1 : 1; // the bow flares above the water
      return [[0.0, -H.DRAFT], [0.62, -H.DRAFT], [0.93, -3.6], [1.0, 0.0], [1.0 * flare, H.MAIN], [1.0 * flare, H.MAIN + 1.25]];
    };
    const pos = [], col = [];
    const cTop = new THREE.Color(PAINT.hullTop), cRed = new THREE.Color(PAINT.hullRed), cBoot = new THREE.Color(0x9a9a92);
    const colAt = (y) => (y < 0.9 ? cRed : y < 1.5 ? cBoot : cTop);
    const quad = (a, b, c, d, y) => {
      const k = colAt(y);
      for (const v of [a, b, c, a, c, d]) { pos.push(v[0], v[1], v[2]); col.push(k.r, k.g, k.b); }
    };
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i], z1 = zs[i + 1], w0 = hullHalfWidth(z0), w1 = hullHalfWidth(z1);
      const p0 = prof(z0), p1 = prof(z1);
      for (let j = 0; j < p0.length - 1; j++) {
        // split the topsides at the boot line so the paint break is crisp
        const ym = (p0[j][1] + p0[j + 1][1]) / 2;
        for (const s of [1, -1]) {
          const a = [s * w0 * p0[j][0], p0[j][1], z0], b = [s * w1 * p1[j][0], p1[j][1], z1];
          const c = [s * w1 * p1[j + 1][0], p1[j + 1][1], z1], d = [s * w0 * p0[j + 1][0], p0[j + 1][1], z0];
          if (j === 3) {
            // waterline -> deck: red to 0.9, boot to 1.5, then topside
            const cut = (t) => [[a[0] + (d[0] - a[0]) * t, a[1] + (d[1] - a[1]) * t, a[2]], [b[0] + (c[0] - b[0]) * t, b[1] + (c[1] - b[1]) * t, b[2]]];
            const [a1, b1] = cut(0.09), [a2, b2] = cut(0.15);
            if (s > 0) { quad(a, b, b1, a1, 0); quad(a1, b1, b2, a2, 1.2); quad(a2, b2, c, d, 5); }
            else { quad(a1, b1, b, a, 0); quad(a2, b2, b1, a1, 1.2); quad(d, c, b2, a2, 5); }
          } else if (s > 0) quad(a, b, c, d, ym);
          else quad(d, c, b, a, ym);
        }
      }
    }
    // close the ends
    for (const z of [zs[0], zs[zs.length - 1]]) {
      const w = hullHalfWidth(z), p = prof(z);
      for (let j = 1; j < p.length - 1; j++) {
        quad([-w * p[j][0], p[j][1], z], [w * p[j][0], p[j][1], z], [w * p[j + 1][0], p[j + 1][1], z], [-w * p[j + 1][0], p[j + 1][1], z], (p[j][1] + p[j + 1][1]) / 2 + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    solid.push(g);
    // rubbing strake + bulwark cap
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i], z1 = zs[i + 1];
      for (const s of [1, -1]) {
        const f0 = z0 > 60 ? 1 + ((z0 - 60) / 70) * 0.1 : 1, f1 = z1 > 60 ? 1 + ((z1 - 60) / 70) * 0.1 : 1;
        S(solid, beamG(s * hullHalfWidth(z0) * f0, H.MAIN + 1.3, z0, s * hullHalfWidth(z1) * f1, H.MAIN + 1.3, z1, 0.45), PAINT.trim);
        S(solid, beamG(s * (hullHalfWidth(z0) + 0.2), 6.2, z0, s * (hullHalfWidth(z1) + 0.2), 6.2, z1, 0.5), PAINT.trim);
      }
    }
  }

  // ======================= MAIN DECK + HULL COLLISION =======================
  // Holes cut through the main deck: the moon pool and two companionways.
  const HOLES = [
    { x0: -H.POOL.r, x1: H.POOL.r, z0: H.POOL.z - H.POOL.r, z1: H.POOL.z + H.POOL.r },
    { x0: 8, x1: 13, z0: 30, z1: 44 },
    { x0: -13, x1: -8, z0: 30, z1: 44 },
  ];
  // x-spans of a deck strip [z0, z1] of half-width w, with the holes cut out
  const spans = (z0, z1, w) => {
    let out = [[-w, w]];
    for (const h of HOLES) {
      if (z1 <= h.z0 || z0 >= h.z1) continue;
      const next = [];
      for (const [a, b] of out) {
        if (b <= h.x0 || a >= h.x1) { next.push([a, b]); continue; }
        if (a < h.x0) next.push([a, h.x0]);
        if (b > h.x1) next.push([h.x1, b]);
      }
      out = next;
    }
    return out;
  };
  {
    // breakpoints so no strip straddles a hole edge
    const cuts = new Set();
    for (let z = -H.L; z <= H.L; z += 2) cuts.add(z);
    for (const h of HOLES) { cuts.add(h.z0); cuts.add(h.z1); }
    const zs = [...cuts].sort((a, b) => a - b);
    // gangway gaps in the bulwark, where the accommodation ladders land
    const gap = (z0, z1) => z1 > -44.5 && z0 < -39.5;
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i], z1 = zs[i + 1];
      const wIn = Math.min(hullHalfWidth(z0), hullHalfWidth(z1));
      const wOut = Math.max(hullHalfWidth(z0), hullHalfWidth(z1));
      if (wIn < 0.8) continue;
      for (const [a, b] of spans(z0, z1, wIn - 0.25)) {
        // the stern under the flight deck and the bow under the forecastle are
        // closed spaces: no floor to stand on there
        if (z1 <= -74 || z0 >= 88) continue;
        slab(a, b, z0, z1, H.MAIN);
        S(deck, boxG(b - a, 0.3, z1 - z0, (a + b) / 2, H.MAIN - 0.15, (z0 + z1) / 2), PAINT.deck);
      }
      for (const s of [1, -1]) {
        // the shell: nothing swims or walks through the plating
        wall(s * (wIn - 0.3), s * (wOut + 0.3), z0, z1, -H.DRAFT, H.MAIN);
        if (!gap(z0, z1)) wall(s * (wIn - 0.3), s * (wOut + 0.3), z0, z1, H.MAIN, H.MAIN + 1.25);
      }
    }
    // transom and stem
    wall(-H.B, H.B, -H.L - 0.5, -H.L + 0.6, -H.DRAFT, H.MAIN + 1.25);
  }

  // ======================= FLIGHT DECK (stern) ==============================
  {
    const y = H.FLIGHT;
    plate(-21.5, 21.5, -129, -74, y, 0.5, PAINT.deckDark);
    // the hangar block it sits on
    S(solid, boxG(40, 3, 52, 0, H.MAIN + 1.5, -101.5), PAINT.houseDark);
    wall(-21.5, 21.5, -129, -74, H.MAIN, y - 0.6); // no crawling underneath
    // overhang supports
    for (const z of [-126, -112, -98, -84]) {
      for (const s of [1, -1]) S(solid, beamG(s * 21.5, y - 0.5, z, s * Math.min(hullHalfWidth(z), 20), H.MAIN + 0.5, z, 0.4), PAINT.trim);
    }
    // ramps up from the main deck, one each side
    for (const s of [1, -1]) {
      const x0 = s > 0 ? 14 : -20, x1 = s > 0 ? 20 : -14;
      stairs(x0, x1, -62, H.MAIN, -74, y);
    }
    // forward lip between the ramps: a rail, and a wall below it
    rail('x', -74, -13.8, 13.8, y);
    wall(-13.8, 13.8, -74.3, -73.7, H.MAIN, y);
    // deck-edge safety net frames + red edge lamps
    for (const s of [1, -1]) {
      for (let z = -128; z <= -76; z += 4) {
        S(detail, beamG(s * 21.5, y, z, s * 24.2, y + 0.5, z, 0.12), PAINT.trim);
        lamp(s * 21.3, y + 0.16, z, PAINT.red, 0.3);
      }
      S(detail, boxG(0.12, 0.12, 54, s * 24.2, y + 0.5, -102), PAINT.trim);
      wall(s * 21.3, s * 21.7, -129, -74, y, y + 0.5); // a toe rail: jumpable
    }
    for (let x = -20; x <= 20; x += 4) lamp(x, y + 0.16, -128.8, PAINT.red, 0.3);
    wall(-21.5, 21.5, -129.2, -128.8, y, y + 0.5);
    // touchdown ring lamps
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      lamp(H.PAD.x + Math.cos(a) * (H.PAD.r + 1.6), y + 0.1, H.PAD.z + Math.sin(a) * (H.PAD.r + 1.6), i % 4 === 0 ? PAINT.green : PAINT.amber, 0.26);
    }
    // flight-control cab on the port quarter, and a wind sock mast
    S(solid, boxG(4, 3.4, 5, -18.5, y + 1.7, -77.5), PAINT.house);
    wall(-20.5, -16.5, -80, -75, y, y + 3.4);
    S(glow, boxG(3.2, 1.0, 0.06, -18.5, y + 2.3, -80.03), PAINT.cyan);
    S(detail, cylG(0.12, 0.12, 6, 19.5, y + 3, -77, 6), PAINT.white);
    S(detail, boxG(1.8, 0.5, 0.5, 20.4, y + 5.6, -77), PAINT.orange);
  }

  // ======================= SUPERSTRUCTURE ===================================
  const SS = { x: 18, zA: -58, zF: -14 }; // tier-1 footprint
  {
    const y1 = H.MAIN, y2 = H.T2, y3 = H.T3, y4 = H.ROOF;
    // --- tier 1: the market hall ---
    wallRun('z', -SS.x, SS.zA, SS.zF, y1, y2, [{ c: -36, w: 3.4 }], { win: { y: 1.5, h: 1.3, pitch: 3.4 } });
    wallRun('z', SS.x, SS.zA, SS.zF, y1, y2, [{ c: -36, w: 3.4 }], { win: { y: 1.5, h: 1.3, pitch: 3.4 } });
    wallRun('x', SS.zF, -SS.x, SS.x, y1, y2, [{ c: 0, w: 4.4, h: 3.2 }], { win: { y: 1.5, h: 1.3, pitch: 3.4 } });
    wallRun('x', SS.zA, -SS.x, SS.x, y1, y2, [], { win: { y: 1.5, h: 1.3, pitch: 3.4, dark: 0.4 } });
    // tier-1 roof = tier-2 deck (walkway ring + terrace)
    plate(-SS.x, SS.x, SS.zA, SS.zF, y2, 0.5);
    // --- tier 2: the mess hall, x +-14, z -54..-22 ---
    wallRun('z', -14, -54, -22, y2, y3, [], { win: { y: 1.4, h: 1.4, pitch: 3.6 } });
    wallRun('z', 14, -54, -22, y2, y3, [], { win: { y: 1.4, h: 1.4, pitch: 3.6 } });
    wallRun('x', -22, -14, 14, y2, y3, [{ c: 0, w: 3.4 }], { open: { sill: 1.1, head: 1.0, pitch: 3.4 } });
    wallRun('x', -54, -14, 14, y2, y3, [{ c: 0, w: 3.0 }], { win: { y: 1.4, h: 1.4, pitch: 3.6, dark: 0.4 } });
    plate(-14, 14, -54, -22, y3, 0.5);
    // --- tier 3: the bridge, x +-12, z -34..-22 ---
    wallRun('x', -22, -12, 12, y3, y4, [], { open: { sill: 1.05, head: 0.9, pitch: 2.4 }, color: PAINT.houseLight });
    wallRun('z', -12, -34, -22, y3, y4, [], { open: { sill: 1.05, head: 0.9, pitch: 3 }, color: PAINT.houseLight });
    wallRun('z', 12, -34, -22, y3, y4, [], { open: { sill: 1.05, head: 0.9, pitch: 3 }, color: PAINT.houseLight });
    wallRun('x', -34, -12, 12, y3, y4, [{ c: 0, w: 2.6 }], { color: PAINT.houseLight, win: { y: 1.5, h: 1.2, pitch: 4 } });
    S(solid, boxG(26, 0.5, 14.5, 0, y4 + 0.25, -27.5), PAINT.houseDark); // bridge roof, with eyebrow
    S(solid, boxG(27, 0.3, 1.6, 0, y4 - 0.2, -21), PAINT.trim);
    // bridge wings
    for (const s of [1, -1]) {
      plate(s > 0 ? 12 : -17.5, s > 0 ? 17.5 : -12, -30, -22, y3, 0.3);
      rail('z', s * 17.5, -30, -22, y3);
      rail('x', -22, s > 0 ? 12 : -17.5, s > 0 ? 17.5 : -12, y3);
      S(solid, beamG(s * 17.2, y3 - 0.3, -26, s * 14.2, y2 + 0.4, -26, 0.3), PAINT.trim);
    }
    // --- rails round the tier-2 and tier-3 walkways ---
    rail('x', SS.zF, -SS.x, SS.x, y2);
    rail('x', SS.zA, -SS.x, SS.x, y2);
    for (const s of [1, -1]) {
      rail('z', s * SS.x, SS.zA, -30, y2); // gap -30..-24 is the stair landing
      rail('z', s * SS.x, -24, SS.zF, y2);
      rail('z', s * 14, -54, -34, y3); // tier-3 walkway rails (aft of the wings)
    }
    rail('x', -54, -14, 14, y3);
    // --- stairs ---
    // main deck -> tier 2: outboard of the house, both sides, landing at z -30..-24
    for (const s of [1, -1]) {
      const x0 = s > 0 ? 18.4 : -21.6, x1 = s > 0 ? 21.6 : -18.4;
      stairs(x0, x1, -52, y1, -30, y2);
      plate(Math.min(x0, x1) - (s > 0 ? 0.4 : 0), Math.max(x0, x1) + (s > 0 ? 0 : 0.4), -30, -24, y2, 0.3);
      rail('z', s * 21.6, -30, -24, y2);
      rail('x', -24, Math.min(x0, x1), Math.max(x0, x1), y2);
    }
    // tier 2 -> tier 3: on the tier-2 walkway beside the mess hall
    for (const s of [1, -1]) {
      const x0 = s > 0 ? 14.4 : -17.6, x1 = s > 0 ? 17.6 : -14.4;
      stairs(x0, x1, -52, y2, -36, y3);
      plate(Math.min(x0, x1), Math.max(x0, x1), -36, -30, y3, 0.3); // landing joins the bridge wing
    }
    // --- funnel, uptakes and the house's clutter ---
    S(solid, boxG(7, 9, 9, 0, y3 + 4.5, -45.5), PAINT.houseDark);
    wall(-3.5, 3.5, -50, -41, y3, y3 + 9);
    S(solid, boxG(7.4, 1.2, 9.4, 0, y3 + 7.6, -45.5), PAINT.orange); // funnel band
    for (const dx of [-1.6, 1.6]) S(solid, cylG(0.9, 0.9, 3.2, dx, y3 + 10.4, -45.5, 10), PAINT.trim);
    for (const [vx, vz] of [[-9, -50], [9, -50], [-10, -38], [10, -38]]) {
      S(detail, cylG(0.7, 0.7, 1.6, vx, y3 + 0.8, vz, 8), PAINT.pipe);
      S(detail, cylG(1.1, 0.7, 0.5, vx, y3 + 1.8, vz, 8), PAINT.pipe);
      wall(vx - 0.8, vx + 0.8, vz - 0.8, vz + 0.8, y3, y3 + 2);
    }
    // mast: lattice legs, yards, radar, lights
    const mx = 0, mz = -29, my = y4 + 0.5;
    for (const [dx, dz] of [[-1.4, -1.2], [1.4, -1.2], [0, 1.6]]) {
      S(solid, beamG(mx + dx, my, mz + dz, mx + dx * 0.3, my + 24, mz + dz * 0.3, 0.28), PAINT.white);
    }
    for (let k = 1; k <= 5; k++) {
      const yy = my + k * 4, f = 1 - (k * 4) / 26;
      S(detail, beamG(mx - 1.4 * f, yy, mz - 1.2 * f, mx + 1.4 * f, yy, mz - 1.2 * f, 0.14), PAINT.white);
      S(detail, beamG(mx + 1.4 * f, yy, mz - 1.2 * f, mx, yy, mz + 1.6 * f, 0.14), PAINT.white);
      S(detail, beamG(mx, yy, mz + 1.6 * f, mx - 1.4 * f, yy, mz - 1.2 * f, 0.14), PAINT.white);
    }
    S(solid, boxG(11, 0.3, 0.3, mx, my + 15, mz), PAINT.white);
    S(solid, boxG(7, 0.3, 0.3, mx, my + 20, mz), PAINT.white);
    lamp(mx, my + 24.6, mz, PAINT.red, 0.5);
    lamp(mx - 5.4, my + 15.3, mz, PAINT.red, 0.36);
    lamp(mx + 5.4, my + 15.3, mz, PAINT.green, 0.36);
    lamp(mx, my + 20.4, mz + 0.4, PAINT.flood, 0.4);
    // radomes and aerials on the bridge roof
    for (const [dx, dz, r] of [[-8.5, -27, 2.0], [8.5, -27, 1.5], [6.5, -32, 1.0]]) {
      S(detail, cylG(0.35, 0.5, 1.4, dx, y4 + 1.2, dz, 8), PAINT.white);
      const sp = new THREE.SphereGeometry(r, 14, 10); sp.translate(dx, y4 + 1.9 + r * 0.8, dz);
      S(solid, sp, PAINT.white);
    }
    for (const dx of [-11, -4, 4, 11]) S(detail, cylG(0.05, 0.05, 6, dx, y4 + 3.5, -33.5, 5), PAINT.trim);
    // floodlight bar over the working deck
    S(solid, boxG(30, 0.4, 0.4, 0, y4 + 1.2, -20.6), PAINT.trim);
    for (let x = -13; x <= 13; x += 3.25) lamp(x, y4 + 0.95, -20.2, PAINT.flood, 0.5);
    // lifeboats on davits along tier 2, and a tender on the main deck rail
    for (const s of [1, -1]) {
      for (const z of [-46, -20]) {
        const bx = s * 23.6, by = y2 + 2.4;
        const boat = new THREE.CapsuleGeometry(1.25, 4.6, 4, 10); boat.rotateX(Math.PI / 2); boat.translate(bx, by, z);
        S(solid, boat, PAINT.orange);
        for (const dz of [-2.4, 2.4]) {
          S(detail, beamG(s * 21.8, y2, z + dz, s * 22.4, by + 2.4, z + dz, 0.2), PAINT.white);
          S(detail, beamG(s * 22.4, by + 2.4, z + dz, bx, by + 2.4, z + dz, 0.2), PAINT.white);
          S(detail, beamG(bx, by + 2.4, z + dz, bx, by + 1.2, z + dz, 0.05, true), PAINT.rope);
        }
      }
    }
  }

  // ======================= WORKING DECK =====================================
  {
    const y = H.MAIN;
    // --- moon pool: coaming, and the derrick standing over it ---
    const P = H.POOL;
    {
      const ring = new THREE.CylinderGeometry(P.r + 0.5, P.r + 0.5, 1.0, 40, 1, true); ring.translate(P.x, y + 0.5, P.z);
      S(solid, ring, PAINT.crane);
      const ring2 = new THREE.CylinderGeometry(P.r + 0.05, P.r + 0.05, y + H.DRAFT + 1, 40, 1, true); ring2.translate(P.x, (y + 1 - H.DRAFT) / 2, P.z);
      S(solid, ring2, PAINT.houseDark); // the well through the hull
      // square hole in the plating -> round coaming: fill the corners
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        const c = new THREE.BufferGeometry();
        const pts = [P.x + sx * P.r, y, P.z + sz * P.r];
        const steps = 6, verts = [];
        for (let i = 0; i < steps; i++) {
          const a0 = (i / steps) * Math.PI / 2, a1 = ((i + 1) / steps) * Math.PI / 2;
          const p0 = [P.x + sx * Math.cos(a0) * (P.r + 0.2), y, P.z + sz * Math.sin(a0) * (P.r + 0.2)];
          const p1 = [P.x + sx * Math.cos(a1) * (P.r + 0.2), y, P.z + sz * Math.sin(a1) * (P.r + 0.2)];
          if (sx * sz > 0) verts.push(...pts, ...p1, ...p0); else verts.push(...pts, ...p0, ...p1);
        }
        c.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        c.computeVertexNormals();
        S(deck, c, PAINT.deck);
      }
      // coaming collider: an octagon of boxes round the hole, with the lift
      // gate left open on the aft side (P8 puts the capsule there)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
        if (Math.abs(a - Math.PI * 1.5) < 0.3) continue;
        const cx = P.x + Math.cos(a) * (P.r + 0.4), cz = P.z + Math.sin(a) * (P.r + 0.4);
        wall(cx - 1.1, cx + 1.1, cz - 1.1, cz + 1.1, y, y + 1.0);
      }
      // the well below the plating: the lift shaft's wall while it passes the hull
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const cx = P.x + Math.cos(a) * (P.r + 1.3), cz = P.z + Math.sin(a) * (P.r + 1.3);
        wall(cx - 1.7, cx + 1.7, cz - 1.7, cz + 1.7, -H.DRAFT, y - 0.4);
      }
      // derrick: four legs leaning in to a crown block 30 u up
      const top = y + 30, foot = P.r + 3.5, crown = 2.2;
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        S(solid, beamG(P.x + sx * foot, y, P.z + sz * foot, P.x + sx * crown, top, P.z + sz * crown, 0.6), PAINT.crane);
        wall(P.x + sx * foot - 0.5, P.x + sx * foot + 0.5, P.z + sz * foot - 0.5, P.z + sz * foot + 0.5, y, y + 3);
      }
      for (let k = 1; k <= 6; k++) {
        const t = k / 7, r0 = foot + (crown - foot) * t, yy = y + 30 * t;
        const t2 = (k - 1) / 7, r1 = foot + (crown - foot) * t2, y1 = y + 30 * t2;
        for (const [ax, az, bx, bz] of [[1, 1, -1, 1], [-1, 1, -1, -1], [-1, -1, 1, -1], [1, -1, 1, 1]]) {
          S(detail, beamG(P.x + ax * r0, yy, P.z + az * r0, P.x + bx * r0, yy, P.z + bz * r0, 0.2), PAINT.crane);
          if (k > 1 || true) S(detail, beamG(P.x + ax * r1, y1, P.z + az * r1, P.x + bx * r0, yy, P.z + bz * r0, 0.16), PAINT.crane);
        }
      }
      S(solid, boxG(6, 1.6, 6, P.x, top + 0.8, P.z), PAINT.houseDark);
      S(solid, cylG(1.4, 1.4, 1.0, P.x, top - 0.8, P.z, 12), PAINT.trim);
      lamp(P.x, top + 2.0, P.z, PAINT.red, 0.5);
      for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) lamp(P.x + dx * 4.2, y + 19, P.z + dz * 4.2, PAINT.flood, 0.42);
      // hoist cables down into the well
      for (const dx of [-0.5, 0.5]) S(detail, cylG(0.06, 0.06, top - y + 4, P.x + dx, (top + y - 4) / 2, P.z, 5), PAINT.trim);
    }

    // --- companionway hatches: coamings, and stairs down to the hold ---
    for (const s of [1, -1]) {
      const x0 = s > 0 ? 8 : -13, x1 = s > 0 ? 13 : -8;
      stairs(x0, x1, 30, y, 44, H.LOWER, false);
      // coaming on three sides (open at z 30, where you step on)
      wall(x0 - 0.3, x0, 30, 44, y, y + 1.0);
      wall(x1, x1 + 0.3, 30, 44, y, y + 1.0);
      wall(x0, x1, 44, 44.3, y, y + 1.0);
      S(solid, boxG(0.3, 1.0, 14, x0 - 0.15, y + 0.5, 37), PAINT.crane);
      S(solid, boxG(0.3, 1.0, 14, x1 + 0.15, y + 0.5, 37), PAINT.crane);
      S(solid, boxG(5.6, 1.0, 0.3, (x0 + x1) / 2, y + 0.5, 44.15), PAINT.crane);
      // walls of the stair well below deck
      wall(x0 - 0.3, x0, 30, 44, H.LOWER, y);
      wall(x1, x1 + 0.3, 30, 44, H.LOWER, y);
      S(solid, boxG(0.3, y - H.LOWER, 14, x0 - 0.15, (y + H.LOWER) / 2, 37), PAINT.houseDark);
      S(solid, boxG(0.3, y - H.LOWER, 14, x1 + 0.15, (y + H.LOWER) / 2, 37), PAINT.houseDark);
    }

    // --- processing hold (lower deck): x +-16, z 44..84 ---
    {
      const yl = H.LOWER;
      plate(-16, 16, 44, 84, yl, 0.4, PAINT.deckDark);
      wallRun('z', -16, 44, 84, yl, y - 0.3, [], { color: PAINT.houseDark });
      wallRun('z', 16, 44, 84, yl, y - 0.3, [], { color: PAINT.houseDark });
      wallRun('x', 84, -16, 16, yl, y - 0.3, [], { color: PAINT.houseDark });
      wallRun('x', 44, -16, 16, yl, y - 0.3, [{ c: 10.5, w: 5, h: 4.6 }, { c: -10.5, w: 5, h: 4.6 }], { color: PAINT.houseDark });
    }

    // --- deck cranes: pedestal, slewing cab, jib, hook ---
    const crane = (cx, cz, slew, reach, lift) => {
      S(solid, cylG(1.5, 1.9, 7, cx, y + 3.5, cz, 12), PAINT.houseDark);
      wall(cx - 1.7, cx + 1.7, cz - 1.7, cz + 1.7, y, y + 7);
      S(solid, cylG(2.3, 2.3, 0.8, cx, y + 7.4, cz, 14), PAINT.trim);
      const ca = Math.cos(slew), sa = Math.sin(slew);
      S(solid, boxG(3.6, 3.2, 4.4, cx - sa * 0.6, y + 9.4, cz - ca * 0.6, slew), PAINT.crane);
      S(glow, boxG(2.4, 1.0, 0.06, cx + sa * 1.65, y + 9.8, cz + ca * 1.65, slew), PAINT.amber);
      const tx = cx + sa * reach, tz = cz + ca * reach, ty = y + 9 + lift;
      // twin-chord jib with lacing
      const px = ca * 0.9, pz = -sa * 0.9;
      for (const s of [1, -1]) S(solid, beamG(cx + s * px, y + 9.6, cz + s * pz, tx + s * px * 0.3, ty, tz + s * pz * 0.3, 0.36), PAINT.crane);
      const n = Math.round(reach / 3);
      for (let i = 1; i < n; i++) {
        const t0 = (i - 1) / n, t1 = i / n, s = i % 2 ? 1 : -1;
        const w0 = 1 - 0.7 * t0, w1 = 1 - 0.7 * t1;
        S(detail, beamG(cx + sa * reach * t0 + s * px * w0, y + 9.6 + (lift - 0.6) * t0, cz + ca * reach * t0 + s * pz * w0,
          cx + sa * reach * t1 - s * px * w1, y + 9.6 + (lift - 0.6) * t1, cz + ca * reach * t1 - s * pz * w1, 0.14), PAINT.crane);
      }
      // A-frame backstay + luffing wires
      S(solid, beamG(cx - sa * 2.4, y + 11, cz - ca * 2.4, cx - sa * 1.2, y + 15.5, cz - ca * 1.2, 0.3), PAINT.crane);
      S(detail, beamG(cx - sa * 1.2, y + 15.5, cz - ca * 1.2, tx, ty, tz, 0.05, true), PAINT.trim);
      // fall, block and hook
      const hookY = y + 4.5 + rng() * 2;
      S(detail, cylG(0.05, 0.05, ty - hookY, tx, (ty + hookY) / 2, tz, 5), PAINT.trim);
      S(detail, boxG(0.7, 0.9, 0.5, tx, hookY - 0.4, tz), PAINT.crane);
      lamp(tx, ty + 0.4, tz, PAINT.red, 0.34);
      lamp(cx, y + 11.3, cz, PAINT.flood, 0.4);
    };
    crane(-16.5, 4, 0.5, 20, 9);
    crane(16.5, 62, -2.3, 22, 7);

    // --- trawl gallows either side, booms swung outboard, warps to the drums ---
    for (const s of [1, -1]) {
      const gx = s * 19.5, gz = 54;
      S(solid, beamG(gx, y, gz - 3, gx, y + 9, gz, 0.5), PAINT.crane);
      S(solid, beamG(gx, y, gz + 3, gx, y + 9, gz, 0.5), PAINT.crane);
      wall(gx - 0.5, gx + 0.5, gz - 3.4, gz + 3.4, y, y + 3);
      S(solid, beamG(gx, y + 9, gz, s * 34, y + 15, gz + 4, 0.42), PAINT.crane); // the boom
      S(detail, beamG(gx, y + 9, gz, gx - s * 2.5, y + 0.3, gz - 8, 0.07, true), PAINT.trim);
      S(detail, beamG(s * 34, y + 15, gz + 4, s * 34, 1.0, gz + 4, 0.06, true), PAINT.rope); // warp into the sea
      // otter board hung at the rail
      S(detail, boxG(0.3, 3.0, 4.2, s * 22.8, y + 2.6, gz - 10), PAINT.rust);
      lamp(s * 34, y + 15.4, gz + 4, s > 0 ? PAINT.green : PAINT.red, 0.36);
    }
    // --- net drums on a cradle, wound with net ---
    for (const z of [70, 76]) {
      const drum = new THREE.CylinderGeometry(2.3, 2.3, 16, 16); drum.rotateZ(Math.PI / 2); drum.translate(0, y + 3.1, z);
      S(solid, drum, PAINT.net);
      for (const sx of [-8.4, 8.4]) {
        const fl = new THREE.CylinderGeometry(3.0, 3.0, 0.4, 16); fl.rotateZ(Math.PI / 2); fl.translate(sx, y + 3.1, z);
        S(solid, fl, PAINT.trim);
        S(solid, boxG(0.6, 3.1, 1.2, sx + Math.sign(sx) * 0.6, y + 1.55, z), PAINT.houseDark);
      }
      wall(-9.4, 9.4, z - 2.6, z + 2.6, y, y + 5.4);
    }
    // --- pot stacks: instanced, see below; here only their colliders ---
    // --- hatch covers, winches, bins, hose reels ---
    for (const [hx, hz] of [[0, 2], [0, -6]]) block(solid, 12, 1.1, 6, hx, y, hz, PAINT.houseDark, true);
    for (const [wx, wz] of [[-9, 84], [9, 84], [-6, 48], [6, 48]]) {
      const w = new THREE.CylinderGeometry(1.0, 1.0, 2.4, 12); w.rotateZ(Math.PI / 2); w.translate(wx, y + 1.5, wz);
      S(solid, w, PAINT.pipe);
      S(solid, boxG(3.2, 0.5, 2.4, wx, y + 0.25, wz), PAINT.houseDark);
      wall(wx - 1.6, wx + 1.6, wz - 1.2, wz + 1.2, y, y + 2.5);
    }
    // containers lashed forward of the house
    const boxes = [[-13, -9, 0x7a2f22], [-13, -3.5, 0x2f5f6a], [13, -8, 0x5f6a2f], [13, -2.5, 0x7a2f22], [-13, -6.2, 0x8a7a30]];
    boxes.forEach(([bx, bz, colr], i) => {
      const up = i === 4 ? 2.7 : 0;
      S(solid, boxG(6.2, 2.6, 2.6, bx, y + 1.3 + up, bz), colr);
      if (!up) wall(bx - 3.1, bx + 3.1, bz - 1.3, bz + 1.3, y, y + (i === 0 || i === 1 ? 5.3 : 2.6));
    });
    // pipe runs along the bulwarks, with supports
    for (const s of [1, -1]) {
      for (const [py, pr] of [[y + 0.5, 0.22], [y + 0.95, 0.14]]) {
        const p = new THREE.CylinderGeometry(pr, pr, 96, 6); p.rotateX(Math.PI / 2); p.translate(s * 21.6, py, 36);
        S(detail, p, PAINT.pipe);
      }
      for (let z = -10; z <= 84; z += 8) lamp(s * 22.2, y + 2.2, z, PAINT.amber, 0.3);
      for (let z = -10; z <= 84; z += 8) S(detail, boxG(0.12, 2.2, 0.12, s * 22.2, y + 1.1, z), PAINT.trim);
    }
  }

  // ======================= FORECASTLE =======================================
  {
    const y = H.FOC;
    // deck: strips following the bow
    for (let z = 88; z < 126; z += 2) {
      const w = Math.min(hullHalfWidth(z), hullHalfWidth(z + 2)) * (1 + ((z - 60) / 70) * 0.1) - 0.3;
      if (w < 1) continue;
      plate(-w, w, z, z + 2, y, 0.4);
      for (const s of [1, -1]) wall(s * w, s * (w + 0.5), z, z + 2, y, y + 1.2);
    }
    // the break of the forecastle: a bulkhead across, with stairs each side
    wallRun('x', 88, -19, 19, H.MAIN, y, [], { win: { y: 1.3, h: 1.1, pitch: 4, dark: 0.3 }, color: PAINT.houseDark });
    // raised bulwark round the bow
    for (let z = 88; z < 128; z += 4) {
      for (const s of [1, -1]) {
        const f0 = 1 + ((z - 60) / 70) * 0.1, f1 = 1 + ((z + 4 - 60) / 70) * 0.1;
        const g = new THREE.BufferGeometry();
        const a = [s * hullHalfWidth(z) * f0, H.MAIN + 1.2, z], b = [s * hullHalfWidth(z + 4) * f1, H.MAIN + 1.2, z + 4];
        const c = [b[0], y + 1.3, b[2]], d = [a[0], y + 1.3, a[2]];
        const v = s > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
        g.setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3));
        g.computeVertexNormals();
        S(solid, g, PAINT.hullTop);
      }
    }
    for (const s of [1, -1]) {
      const x0 = s > 0 ? 10 : -14, x1 = s > 0 ? 14 : -10;
      // these stairs stand proud of the bulkhead: z 76 -> 88
      stairs(x0, x1, 76, H.MAIN, 88, y);
    }
    rail('x', 88.3, -9.8, 9.8, y);
    for (const s of [1, -1]) rail('x', 88.3, s > 0 ? 14.2 : -17, s > 0 ? 17 : -14.2, y);
    // sonar dome: verdigris copper, the ship's one soft shape
    {
      const dz = 100, r = 6.5;
      S(solid, cylG(r + 0.4, r + 0.8, 1.4, 0, y + 0.7, dz, 20), PAINT.houseDark);
      const dome = new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.translate(0, y + 1.4, dz);
      S(solid, dome, PAINT.verdigris);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const rib = new THREE.TorusGeometry(r + 0.05, 0.1, 4, 14, Math.PI / 2);
        rib.rotateY(a); rib.translate(0, y + 1.4, dz);
        S(detail, rib, PAINT.trim);
      }
      S(glow, cylG(0.5, 0.5, 0.5, 0, y + 1.4 + r, dz, 8), PAINT.cyan);
      wall(-r * 0.75, r * 0.75, dz - r * 0.75, dz + r * 0.75, y, y + 6);
    }
    // windlasses and chain
    for (const s of [1, -1]) {
      const w = new THREE.CylinderGeometry(1.2, 1.2, 3, 12); w.rotateZ(Math.PI / 2); w.translate(s * 5, y + 1.6, 114);
      S(solid, w, PAINT.pipe);
      S(solid, boxG(3.6, 0.6, 3, s * 5, y + 0.3, 114), PAINT.houseDark);
      wall(s * 5 - 1.8, s * 5 + 1.8, 112.5, 115.5, y, y + 2.8);
      S(detail, beamG(s * 5, y + 1.2, 115.5, s * 3, y + 0.3, 122, 0.35), PAINT.rust);
    }
    // bow crane (small) + jackstaff + bow light
    S(solid, cylG(0.8, 1.0, 4, 0, y + 2, 119, 10), PAINT.houseDark);
    S(solid, beamG(0, y + 4, 119, 0, y + 9, 127, 0.4), PAINT.crane);
    S(detail, cylG(0.08, 0.08, 7, 0, y + 3.5, 124.5, 5), PAINT.white);
    lamp(0, y + 7.2, 124.5, PAINT.flood, 0.4);
    // anchors in their pockets
    for (const s of [1, -1]) {
      S(solid, boxG(0.6, 3.2, 2.2, s * hullHalfWidth(112) * 1.08, 8.2, 112), PAINT.trim);
    }
  }

  // ======================= ACCOMMODATION LADDERS ============================
  // The way back aboard from the sea: a stair slung down each quarter from a
  // gap in the bulwark, its foot a pontoon step awash.
  for (const s of [1, -1]) {
    const x0 = s > 0 ? 23.6 : -27.2, x1 = s > 0 ? 27.2 : -23.6;
    stairs(x0, x1, -6, -1.6, -40, H.MAIN);
    plate(Math.min(x0, x1) - (s > 0 ? 1.6 : 0), Math.max(x0, x1) + (s > 0 ? 0 : 1.6), -44.4, -40, H.MAIN, 0.3);
    rail('z', s * 27.2, -44.4, -40, H.MAIN);
    rail('x', -44.4, Math.min(x0, x1), Math.max(x0, x1), H.MAIN);
    // the foot: a float you can swim onto from three sides
    plate(Math.min(x0, x1) - 1.2, Math.max(x0, x1) + 1.2, -6, 0.5, -1.6, 0.9, PAINT.orange);
    for (const z of [-40, -24, -8]) S(detail, beamG(s * 23.2, H.MAIN + 1, z, s * 27.2, (z === -40 ? H.MAIN : z === -24 ? 4.6 : -1) + 1.2, z, 0.1, true), PAINT.trim);
    lamp(s * 27.4, 0.2, -3, PAINT.amber, 0.3);
  }

  // ======================= RAILS on the main deck break =====================
  // (the bulwark is the rail everywhere else)

  // ======================= FIT-OUT: the four rooms ==========================
  // Furniture goes into the same merged buckets as the ship: it costs no draw
  // calls, and the big pieces carry colliders.
  const hangLamp = (x, yCeil, z, drop = 1.2, color = PAINT.amber) => {
    S(detail, boxG(0.05, drop, 0.05, x, yCeil - drop / 2, z), PAINT.trim);
    S(detail, cylG(0.1, 0.5, 0.3, x, yCeil - drop - 0.1, z, 8), PAINT.trim);
    S(glow, boxG(0.34, 0.14, 0.34, x, yCeil - drop - 0.3, z), color);
  };
  const crateStack = (x, y, z, n, color) => {
    for (let i = 0; i < n; i++) S(detail, boxG(1.0, 0.7, 0.8, x + (rng() - 0.5) * 0.15, y + 0.35 + i * 0.72, z + (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.3), color);
    wall(x - 0.55, x + 0.55, z - 0.45, z + 0.45, y, y + n * 0.72);
  };
  // --- market (tier 1) ---
  {
    const y = H.MAIN, AWN = [0x8a3a2c, 0x2f6a72, 0x8a7a30, 0x5a3f7a, 0x3f6a3a];
    let k = 0;
    for (const s of [1, -1]) {
      for (let z = -52; z <= -20; z += 8) {
        if (Math.abs(z + 36) < 3.5) continue; // the side doors
        const x = s * 14.6;
        S(solid, boxG(1.3, 1.05, 4.4, x, y + 0.52, z), PAINT.houseDark); // counter
        wall(x - 0.65, x + 0.65, z - 2.2, z + 2.2, y, y + 1.05);
        S(solid, boxG(0.5, 2.6, 4.6, s * 16.9, y + 1.3, z), PAINT.pipe); // shelves behind
        for (let i = 0; i < 9; i++) S(detail, boxG(0.42, 0.36, 0.36, s * 16.6, y + 0.6 + (i % 3) * 0.8, z - 1.7 + Math.floor(i / 3) * 1.7 + rng() * 0.3), AWN[(k + i) % AWN.length]);
        // awning: a canted slab on two poles
        const aw = boxG(2.6, 0.08, 4.8, 0, 0, 0); aw.rotateZ(s * 0.28); aw.translate(x - s * 0.5, y + 3.0, z);
        S(solid, aw, AWN[k++ % AWN.length]);
        for (const dz of [-2.2, 2.2]) S(detail, boxG(0.08, 3.0, 0.08, x - s * 1.6, y + 1.5, z + dz), PAINT.trim);
        // wares on the counter
        for (let i = 0; i < 5; i++) S(detail, boxG(0.3 + rng() * 0.3, 0.16 + rng() * 0.2, 0.3 + rng() * 0.3, x + (rng() - 0.5) * 0.5, y + 1.15, z - 1.6 + i * 0.8), [0x9ab8c8, 0xc87a5a, 0xd8d0a0, 0x6a9a8a][i % 4]);
        hangLamp(x - s * 1.2, H.T2 - 0.5, z, 1.3);
      }
    }
    // fish tables down the middle: crushed ice, the catch laid out on it
    for (const z of [-46, -38, -30]) {
      S(solid, boxG(5, 0.9, 2.2, 0, y + 0.45, z), PAINT.houseDark);
      S(solid, boxG(4.8, 0.14, 2.0, 0, y + 0.97, z), 0xcfe0ea);
      wall(-2.5, 2.5, z - 1.1, z + 1.1, y, y + 1.0);
      for (let i = 0; i < 9; i++) {
        const f = new THREE.CapsuleGeometry(0.1, 0.5 + rng() * 0.4, 2, 6); f.rotateZ(Math.PI / 2); f.rotateY((rng() - 0.5) * 0.8);
        f.translate(-2 + (i % 5) * 1.0 + rng() * 0.2, y + 1.12, z - 0.5 + Math.floor(i / 5) * 1.0);
        S(detail, f, [0x7fb4d8, 0xd87fa0, 0xc8c8d8, 0x8ad8b8][i % 4]);
      }
      hangLamp(0, H.T2 - 0.5, z, 1.5, PAINT.flood);
    }
    // nets hung from the deckhead, barrels by the forward door
    for (const z of [-50, -26]) {
      const net = boxG(9, 0.06, 5, 0, H.T2 - 1.1, z); S(detail, net, PAINT.net);
    }
    for (const [bx, bz] of [[-4.5, -17], [-5.8, -16.4], [5, -17.2], [6.2, -16.6], [-15, -56], [15, -56]]) {
      S(solid, cylG(0.55, 0.5, 1.2, bx, y + 0.6, bz, 10), PAINT.rust);
      wall(bx - 0.5, bx + 0.5, bz - 0.5, bz + 0.5, y, y + 1.2);
    }
    crateStack(-10, y, -55.5, 3, PAINT.pot); crateStack(10, y, -55.5, 2, PAINT.rust); crateStack(11.4, y, -55.5, 3, PAINT.pot);
    // the arms locker: the plasma launcher's crate (see `extras` below)
    S(solid, boxG(2.6, 1.0, 1.2, 0, y + 0.5, -55.6), 0x3a2f5a);
    S(glow, boxG(2.0, 0.08, 0.08, 0, y + 1.04, -55.1), 0xff5ad0);
    wall(-1.3, 1.3, -56.2, -55.0, y, y + 1.0);
  }
  // --- mess hall (tier 2) ---
  {
    const y = H.T2;
    for (const x of [-7.5, 0, 7.5]) {
      for (const z of [-46, -34]) {
        S(solid, boxG(5.2, 0.12, 1.5, x, y + 0.95, z), 0x7a5a3a);
        for (const dx of [-2.2, 2.2]) S(detail, boxG(0.14, 0.9, 1.2, x + dx, y + 0.45, z), PAINT.trim);
        wall(x - 2.6, x + 2.6, z - 0.75, z + 0.75, y, y + 1.0);
        for (const dz of [-1.35, 1.35]) S(detail, boxG(5.0, 0.1, 0.5, x, y + 0.55, z + dz), 0x6a4c30); // benches
        for (let i = 0; i < 4; i++) S(detail, cylG(0.14, 0.1, 0.2, x - 1.8 + i * 1.2, y + 1.1, z + (rng() - 0.5) * 0.6, 6), 0xb8b0a0); // mugs
        hangLamp(x, H.T3 - 0.5, z, 1.4);
      }
    }
    // the galley counter across the aft end, urns on it, a hatch light behind
    S(solid, boxG(18, 1.1, 1.2, 0, y + 0.55, -51), PAINT.houseDark);
    wall(-9, 9, -51.6, -50.4, y, y + 1.1);
    S(glow, boxG(14, 1.2, 0.06, 0, y + 2.4, -53.2), PAINT.amber);
    for (const x of [-6, -2, 2, 6]) S(detail, cylG(0.35, 0.35, 0.8, x, y + 1.5, -51, 8), 0x9aa0a8);
    // a corner stage for the singer
    S(solid, boxG(5, 0.4, 4, -10.5, y + 0.2, -42.5), 0x4a3050);
    surfaces.push({ x0: -13, x1: -8, z0: -44.5, z1: -40.5, y: y + 0.4 });
    S(detail, boxG(0.9, 1.3, 0.7, -12.6, y + 1.05, -41), PAINT.trim);
    S(glow, boxG(0.5, 0.5, 0.06, -12.6, y + 1.15, -40.62), PAINT.cyan);
    S(detail, cylG(0.04, 0.04, 1.5, -9.4, y + 1.15, -42.5, 5), PAINT.white);
  }
  // --- bridge (tier 3) ---
  {
    const y = H.T3;
    // the forward console under the windows: one long desk of screens
    S(solid, boxG(20, 1.0, 1.3, 0, y + 0.5, -23.6), PAINT.houseDark);
    wall(-10, 10, -24.3, -22.9, y, y + 1.0);
    for (let x = -9; x <= 9; x += 2.25) {
      const sc = boxG(1.7, 0.7, 0.06, x, y + 1.25, -23.9); 
      S(glow, sc, [PAINT.cyan, PAINT.amber, PAINT.green, PAINT.cyan][Math.abs(Math.round(x)) % 4]);
      S(detail, boxG(1.9, 0.9, 0.12, x, y + 1.25, -23.82), PAINT.trim);
    }
    // helm: wheel pedestal and the captain's chair
    S(solid, cylG(0.3, 0.45, 1.1, 0, y + 0.55, -25.6, 8), PAINT.trim);
    const wheel = new THREE.TorusGeometry(0.6, 0.06, 6, 20); wheel.translate(0, y + 1.25, -25.4);
    S(detail, wheel, PAINT.crane);
    S(solid, boxG(1.1, 0.5, 1.0, 0, y + 0.55, -28.6), 0x3a2f2a);
    S(solid, boxG(1.1, 1.3, 0.2, 0, y + 1.2, -29.1), 0x3a2f2a);
    wall(-0.55, 0.55, -29.2, -28.1, y, y + 1.0);
    // chart table, port side aft, the survey lit on it
    S(solid, boxG(4, 0.95, 2.4, -8.6, y + 0.47, -31.6), PAINT.houseDark);
    S(glow, boxG(3.4, 0.05, 1.9, -8.6, y + 0.98, -31.6), 0x3a9ad8);
    wall(-10.6, -6.6, -32.8, -30.4, y, y + 0.95);
    // radar repeaters and a signal locker to starboard
    for (const z of [-27, -30]) {
      S(solid, cylG(0.5, 0.6, 1.1, 9.4, y + 0.55, z, 10), PAINT.houseDark);
      S(glow, cylG(0.42, 0.42, 0.05, 9.4, y + 1.12, z, 14), PAINT.green);
      wall(8.9, 9.9, z - 0.5, z + 0.5, y, y + 1.1);
    }
    S(glow, boxG(18, 0.1, 0.3, 0, H.ROOF - 0.2, -28), 0xff7a50); // red night lighting
  }
  // --- processing hold (lower deck) ---
  {
    const y = H.LOWER, top = H.MAIN - 0.4;
    // the line: a conveyor the length of the hold, bins either side
    S(solid, boxG(2.2, 0.9, 30, 0, y + 0.45, 66), PAINT.houseDark);
    S(solid, boxG(1.9, 0.08, 30, 0, y + 0.95, 66), 0x20262a);
    wall(-1.1, 1.1, 51, 81, y, y + 0.95);
    for (let z = 52; z <= 80; z += 1.4) S(detail, boxG(2.0, 0.1, 0.16, 0, y + 0.86, z), 0x8a9098);
    for (let i = 0; i < 12; i++) {
      const f = new THREE.CapsuleGeometry(0.12, 0.6, 2, 6); f.rotateX(Math.PI / 2); f.rotateY((rng() - 0.5) * 0.6);
      f.translate((rng() - 0.5) * 1.2, y + 1.08, 52 + i * 2.4);
      S(detail, f, [0x7fb4d8, 0xd87fa0, 0xc8c8d8][i % 3]);
    }
    for (const s of [1, -1]) {
      for (let z = 50; z <= 80; z += 6) {
        S(solid, boxG(3, 1.2, 4, s * 11.5, y + 0.6, z), PAINT.pot); // bins
        S(solid, boxG(2.7, 0.1, 3.7, s * 11.5, y + 1.22, z), 0xcfe0ea); // iced over
        wall(s * 11.5 - 1.5, s * 11.5 + 1.5, z - 2, z + 2, y, y + 1.25);
      }
      for (let z = 53; z <= 79; z += 6.5) {
        S(solid, boxG(2.4, 0.95, 1.4, s * 5.2, y + 0.47, z), 0x8a9098); // gutting tables
        wall(s * 5.2 - 1.2, s * 5.2 + 1.2, z - 0.7, z + 0.7, y, y + 0.95);
      }
      // deckhead pipes and a hook rail
      const pp = new THREE.CylinderGeometry(0.2, 0.2, 38, 6); pp.rotateX(Math.PI / 2); pp.translate(s * 14.6, top - 0.5, 64);
      S(detail, pp, PAINT.pipe);
      S(detail, boxG(0.12, 0.12, 34, s * 8.2, top - 0.2, 64), PAINT.trim);
      for (let z = 49; z <= 80; z += 2.2) S(detail, boxG(0.05, 0.7, 0.05, s * 8.2, top - 0.6, z), PAINT.trim);
    }
    for (let z = 49; z <= 80; z += 6.2) S(glow, boxG(0.5, 0.1, 2.4, 0, top - 0.12, z), PAINT.flood);
    for (const [bx, bz] of [[-13.5, 82], [13.5, 82]]) {
      S(solid, cylG(1.3, 1.3, 3.4, bx, y + 1.7, bz, 12), 0x3f5a6a); // brine tanks
      wall(bx - 1.2, bx + 1.2, bz - 1.2, bz + 1.2, y, y + 3.4);
    }
  }

  // ======================= MERGE ============================================
  const bulkMat = makeBulkheadMaterial();
  const deckMat = makeDeckMaterial();
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  glowMat.color.setScalar(1.7); // over the bloom threshold
  const glassMat = new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.6, depthWrite: false, side: THREE.DoubleSide,
  });
  const merged = (list, mat) => {
    const geos = list.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      if (n.attributes.uv) n.deleteAttribute('uv');
      if (!n.attributes.normal) n.computeVertexNormals();
      return n;
    });
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    list.forEach((g) => g.dispose());
    return m;
  };
  const solidMesh = merged(solid, bulkMat);
  const deckMesh = merged(deck, deckMat);
  const glowMesh = merged(glow, glowMat);
  const glassMesh = merged(glass, glassMat);
  glassMesh.renderOrder = 2;
  const detailGroup = new THREE.Group();
  detailGroup.add(merged(detail, bulkMat));
  hull.add(solidMesh, deckMesh, glowMesh, glassMesh, detailGroup);

  // ======================= INSTANCED: crab pots ============================
  {
    const pot = new THREE.BoxGeometry(1.5, 0.9, 1.5);
    tint(pot, 0xffffff);
    const stacks = [
      // [x, z, cols along x, rows along z, max height]
      [-17.5, 40, 2, 6, 5], [17.5, 30, 2, 5, 4], [-6, 60, 4, 3, 3], [17, 78, 2, 3, 5], [-17.5, 72, 2, 4, 4],
    ];
    const mats = [];
    const tmp = new THREE.Object3D();
    for (const [sx, sz, nx, nz, hmax] of stacks) {
      for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
        const hgt = 1 + Math.floor(rng() * hmax);
        for (let k = 0; k < hgt; k++) {
          tmp.position.set(sx + (ix - (nx - 1) / 2) * 1.62, H.MAIN + 0.45 + k * 0.92, sz + (iz - (nz - 1) / 2) * 1.62);
          tmp.rotation.set(0, (rng() - 0.5) * 0.12, 0);
          tmp.updateMatrix();
          mats.push(tmp.matrix.clone());
        }
      }
      wall(sx - nx * 0.81 - 0.1, sx + nx * 0.81 + 0.1, sz - nz * 0.81 - 0.1, sz + nz * 0.81 + 0.1, H.MAIN, H.MAIN + 2.8);
    }
    const inst = new THREE.InstancedMesh(pot, bulkMat, mats.length);
    const cc = new THREE.Color();
    mats.forEach((m, i) => {
      inst.setMatrixAt(i, m);
      cc.set(rng() < 0.2 ? PAINT.rust : rng() < 0.3 ? PAINT.net : PAINT.pot).multiplyScalar(0.8 + rng() * 0.5);
      inst.setColorAt(i, cc);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    detailGroup.add(inst);
  }

  // ======================= LIGHT ============================================
  // Two warm pools: the working deck under the derrick, and the flight deck.
  const workLight = new THREE.PointLight(0xffb060, 900, 150, 1.6);
  workLight.position.set(0, H.MAIN + 20, 24);
  const padLight = new THREE.PointLight(0xffc890, 500, 110, 1.6);
  padLight.position.set(0, H.FLIGHT + 16, -100);
  hull.add(workLight, padLight);

  // One light for whichever room you are standing in.
  const ROOMS = [
    { x0: -18, x1: 18, z0: -58, z1: -14, y0: H.MAIN - 0.5, y1: H.T2 - 0.6, lx: 0, ly: H.T2 - 1.2, lz: -36, c: 0xffc890, i: 420 },
    { x0: -14, x1: 14, z0: -54, z1: -22, y0: H.T2 - 0.5, y1: H.T3 - 0.6, lx: 0, ly: H.T3 - 1.2, lz: -38, c: 0xffd0a0, i: 360 },
    { x0: -12, x1: 12, z0: -34, z1: -22, y0: H.T3 - 0.5, y1: H.ROOF, lx: 0, ly: H.ROOF - 1, lz: -28, c: 0xff9a78, i: 200 },
    { x0: -16, x1: 16, z0: 30, z1: 84, y0: H.LOWER - 0.5, y1: H.MAIN - 0.3, lx: 0, ly: H.MAIN - 1.2, lz: 62, c: 0xe8f0ff, i: 380 },
  ];
  const roomLight = new THREE.PointLight(0xffc890, 0, 70, 1.4);
  roomLight.visible = false;
  hull.add(roomLight);

  // radar scanner
  const radar = new THREE.Mesh(tint(boxG(5.2, 0.5, 0.5, 0, 0, 0), PAINT.white), bulkMat);
  radar.position.set(0, H.ROOF + 0.5 + 10.3, -29);
  hull.add(radar);

  const structure = makeStructure(surfaces, walls);

  // ======================= POSE ============================================
  const _w = { h: 0, x: 0, z: 0 };
  const pose = { heave: 0, pitch: 0, roll: 0 };
  function poseAt(t, out = pose) {
    if (sea.scale <= 0) { out.heave = out.pitch = out.roll = 0; return out; }
    // The long swells only: a 260 u hull does not answer a 17 u chop.
    const hb = sea.waveAt(0, 105, t, _w, 2), hs = sea.waveAt(0, -105, t, _w, 2);
    const hp = sea.waveAt(-18, 0, t, _w, 2), hr = sea.waveAt(18, 0, t, _w, 2);
    const hc = sea.waveAt(0, 0, t, _w, 2);
    const clamp = THREE.MathUtils.clamp;
    out.heave = clamp((hb + hs + hp + hr + hc * 2) / 6 * 0.55, -H.HEAVE, H.HEAVE);
    out.pitch = clamp(-Math.atan2(hb - hs, 210) * 0.7, -H.PITCH, H.PITCH);
    out.roll = clamp(Math.atan2(hr - hp, 36) * 0.4, -H.ROLL, H.ROLL);
    return out;
  }

  const hullInv = new THREE.Matrix4();
  const _camL = new THREE.Vector3();
  const _padW = new THREE.Vector3();

  // After the charge (world/shatter.js): the hull is cut loose from the sea
  // and handed to the debris field, dark. No pad, no riser, no swell.
  let wrecked = false;
  function wreck(parent) {
    if (wrecked) return;
    wrecked = true;
    sea.setScale(0);
    parent.add(hull);
    hull.position.set(0, 0, 0);
    hull.rotation.set(0, 0, 0);
    hull.updateMatrix();
    glowMesh.visible = false;
    workLight.visible = false;
    padLight.visible = false;
    roomLight.visible = false;
    tube.group.visible = false;
    detailGroup.visible = true;
  }

  function update(dt, t, camWorld) {
    if (wrecked) return;
    sea.update(camWorld);
    poseAt(sea.time);
    hull.position.y = pose.heave;
    hull.rotation.set(pose.pitch, 0, pose.roll);
    hull.updateMatrix();
    hullInv.copy(hull.matrix).invert();
    if (parkedRef) placeParked();
    // the lift's top station rides the deck
    tube.setTopY(_top.set(H.POOL.x, H.MAIN, H.POOL.z).applyMatrix4(hull.matrix).y);
    tube.update(dt, t, camWorld);
    radar.rotation.y = t * 1.3;
    // small gear is sub-pixel from the air
    _camL.copy(camWorld);
    anchor.worldToLocal(_camL);
    const d = _camL.length();
    detailGroup.visible = d < 2600;
    const lit = d < 900;
    workLight.visible = lit;
    padLight.visible = lit;
    // the room light follows the camera indoors
    _camL.applyMatrix4(hullInv);
    let room = null;
    for (let i = 0; i < ROOMS.length; i++) {
      const r = ROOMS[i];
      if (_camL.x > r.x0 && _camL.x < r.x1 && _camL.z > r.z0 && _camL.z < r.z1 && _camL.y > r.y0 && _camL.y < r.y1 + 2.5) { room = r; break; }
    }
    roomLight.visible = !!room;
    if (room) {
      roomLight.position.set(room.lx, room.ly, room.lz);
      roomLight.color.setHex(room.c);
      roomLight.intensity = room.i;
    }
  }

  // The pad, as offsets from the PLANET CENTRE in world axes (the contract the
  // Sky City's landing code uses): live = riding the swell, mean = still.
  function padPose(out) {
    anchor.updateWorldMatrix(true, false);
    const pc = planet.group.position;
    // mean: hull at rest
    _padW.set(H.PAD.x, H.FLIGHT, H.PAD.z).applyMatrix4(anchor.matrixWorld);
    out.padMean.copy(_padW).sub(pc);
    anchor.getWorldQuaternion(out.quatMean);
    out.upMean.set(0, 1, 0).applyQuaternion(out.quatMean);
    // live
    hull.updateWorldMatrix(false, false);
    _padW.set(H.PAD.x, H.FLIGHT, H.PAD.z).applyMatrix4(hull.matrixWorld);
    out.pad.copy(_padW).sub(pc);
    hull.getWorldQuaternion(out.quat);
    out.up.set(0, 1, 0).applyQuaternion(out.quat);
    return out;
  }

  // ======================= THE SHIP AS A TOWN ===============================
  // walk.js walks a registry city through a small contract (world/city.js
  // createCity). The ship answers the same one, so the whole on-foot path —
  // isolation, the real sky, diamond rain, swimming, citizens, the governor's
  // tour — is the stock code. Its "city-local" frame is the anchor's.
  const _p = new THREE.Vector3(), _h = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  // The hull moves between physics ticks (a whole render frame's worth of
  // swell at a low frame rate), so a walker located by anchor-frame height
  // alone could find the deck a metre above their feet and drop through it.
  // Someone who was standing on a deck last tick is therefore tracked by
  // their HULL-local height: where the deck went, they went.
  let lastAnchorY = NaN, lastHullY = 0;
  const hullFeet = (anchorY) => (Math.abs(anchorY - lastAnchorY) < 0.08 ? lastHullY : _p.y);
  const wrapped = {
    // top: ignore the feet and return the highest deck over (x, z)
    surfaceYAt(x, z, feetY, top = false) {
      _p.set(x, top ? H.MAIN : feetY, z).applyMatrix4(hullInv);
      const fy = top ? 1e6 : hullFeet(feetY);
      const y = structure.surfaceYAt(_p.x, _p.z, fy);
      if (y === null) return null;
      _p.y = y;
      const out = _p.applyMatrix4(hull.matrix).y;
      if (!top && fy - y < 0.3) { lastAnchorY = out; lastHullY = y; } // standing on it
      return out;
    },
    resolveWalls(p, r) {
      _p.copy(p).applyMatrix4(hullInv);
      _h.set(_p.x, hullFeet(p.y), _p.z);
      if (!structure.resolveWalls(_h, r)) return false;
      _h.y = _p.y;
      _h.applyMatrix4(hull.matrix);
      p.x = _h.x; p.z = _h.z;
      return true;
    },
    segmentHit(x0, z0, x1, z1, feetY) {
      _p.set(x0, feetY, z0).applyMatrix4(hullInv);
      const fy = hullFeet(feetY);
      _h.set(x1, feetY, z1).applyMatrix4(hullInv);
      return structure.segmentHit(_p.x, _p.z, _h.x, _h.z, fy);
    },
  };
  // top of the highest deck over (x, z), anchor-local; 0 (the sea) off the ship
  function groundLocalYAt(x, z) {
    const y = wrapped.surfaceYAt(x, z, 0, true);
    return y === null ? 0 : y;
  }
  // the real seabed under (x, z), as an anchor-local height
  function walkFloorYAt(x, z) {
    _dir.set(x, rw, z).applyQuaternion(anchor.quaternion).normalize();
    const fr = planet.radius + planet.body.terrainAtLocal(_dir);
    return Math.sqrt(Math.max(fr * fr - x * x - z * z, 0)) - rw;
  }

  // Where each resident stands (roster order, world/cityRegistry.js). Hull-local.
  const home = (idx, role, x, y, z, face, extra = {}) => ({
    idx, role, kind: 'ship', x, z, floorY: y, half: 4, noStroll: true,
    doorX: x, doorZ: z, doorY: y, doorYaw: face,
    anchor: { x, z, y, face }, ...extra,
  });
  const homes = [
    home(0, 'governor', 0, H.T3, -26, 0, { penthouse: true, doorZ: -32.5 }), // Madame Ossva: the bridge
    home(1, 'scholar', -8, H.T3, -30.5, 0), // the chart table
    home(2, 'merchant', -10, H.MAIN, -28, Math.PI / 2), // market, port stalls
    home(3, 'entertainer', -8, H.T2, -44, 0), // mess hall
    home(4, 'artisan', 10, H.MAIN, -44, -Math.PI / 2), // market, starboard stalls
    home(5, 'guide', 9, H.FLIGHT, -78, Math.PI), // the gangway by the pad
    home(6, 'resident', 8, H.T2, -32, Math.PI), // mess hall
    home(7, 'resident', 11.5, H.MAIN, 13, -Math.PI / 2), // the diver, at the moon pool
  ];

  let parkedRef = null;
  const _pq = new THREE.Quaternion();
  function placeParked() {
    const g = parkedRef.group;
    g.position.set(H.PAD.x, H.FLIGHT + C.PARK_LIFT, H.PAD.z).applyMatrix4(hull.matrix).applyMatrix4(anchor.matrix);
    g.quaternion.copy(anchor.quaternion).multiply(_pq.setFromEuler(hull.rotation));
  }

  function asCity(cityDef) {
    return {
      group: anchor,
      def: cityDef,
      persistent: true, // built at boot, never disposed with a walk session
      structures: [wrapped, tube.structure],
      collidersLocal: [],
      colliders: [],
      outerRadius: 150,
      padLocal: new THREE.Vector3(H.PAD.x, H.FLIGHT, H.PAD.z),
      spawnLocal: { x: 0, z: H.PAD.z + 21 }, // clear of the freighter's nose, facing the house
      gateSpot: { x: 0, z: -68 },
      plazaCenters: [{ x: 0, z: -10, r: 8 }],
      homes,
      elevator: tube.module, // the riser lift: walk.js steps and scans it like a tower cab
      isDry: tube.isDry, // far below the sea, standing in air
      npcRoot: hull, // residents ride the swell with the deck
      groundLocalYAt,
      groundHeightAt: groundLocalYAt,
      walkFloorYAt,
      adoptParked(parked) { parkedRef = parked; placeParked(); },
      update() {},
      dispose() { parkedRef = null; },
    };
  }

  // ======================= THE RISER ========================================
  const tube = createReachTube({
    anchor, H, PAINT, tint, boxG, cylG, beamG, makeStructure, mulberry32,
    deckMat, bulkMat, glowMat, seabedYAt: walkFloorYAt,
  });
  const _top = new THREE.Vector3();
  // The arms locker in the market: Neptunia's plasma launcher, which used to
  // sit in a warzone crate here (world/warzone.js) before the town went to sea.
  tube.addEntity({
    kind: 'locker', pos: new THREE.Vector2(0, -53.8), y: H.MAIN, reach: 3,
    get prompt() { return ownedWeapons().includes('plasma') ? '' : 'E — TAKE THE PLASMA LAUNCHER'; },
    use() {
      if (ownedWeapons().includes('plasma')) return null;
      grantWeapon('plasma');
      return {
        speaker: { name: 'ARMS LOCKER', species: 'Indigo Reach', cityId: 'Indigo Reach' },
        lines: ['SUNSPOT PLASMA LAUNCHER — signed out to you.', 'It lobs a shell that leaves the ground burning. Not for use aboard.'],
      };
    },
  });

  const ship = {
    tube, wreck,
    get wrecked() { return wrecked; },
    anchor, hull, sea, structure, surfaces, walls, pose,
    update, poseAt, padPose, asCity, groundLocalYAt, walkFloorYAt, homes,
    pad: new THREE.Vector3(H.PAD.x, H.FLIGHT, H.PAD.z),
    padR: H.PAD.r,
    def,
    lights: { workLight, padLight },
    detailGroup,
  };
  _ship = ship;
  return ship;
}

let _ship = null;
// The one Indigo Reach (built at boot by game.js; walk.js adopts it as a town).
export function getReachShip() {
  return _ship;
}
