// Offline dry-ground probe for the permanent-city registry (world/cityRegistry.js).
//
// Registry pads sit OUTSIDE the town radius (walkway bridges pad -> gate) and
// each flagship town carries 2-3 wonders inherited from its deleted sibling
// cities — both need dry, reasonably level ground. This script re-runs the
// same terrain math the game uses (src/terrain.js, the deterministic CPU port
// of the surface shaders) and prints pad {x,z} and wonder bearing/dist values
// to paste into the registry.
//
//   node scripts/probe-pads.mjs
//
// Frame contract (must match cityRegistry.js exactly):
//   - city-local (x,z) maps to world dir via quaternion(+Y -> site) applied to
//     (x, 0, z), origin at site * baseR (padLocalDir).
//   - wonder bearing/dist ride the siteFrame tangent basis (ref +Y below
//     |site.y| 0.94, +X above), dir = normalize(site + t1*cos(b)*e + t2*sin(b)*e)
//     with e = dist / planetRadius (wonderLocalDir).
//   - wet means: planetRadius + groundHeight(dir) < waterR + margin, unless the
//     world is dry or its sea is frozen (city.js isWetLocal).

import { groundHeight, DEFAULT_SHAPE } from '../src/terrain.js';
import { CITIES } from '../world/cityRegistry.js';

// Terrain params mirrored from src/planet.js CONFIGS (radius/seaLevel/
// terrainHeight/shape/oceanDepth/water). Update alongside CONFIGS edits.
const PLANETS = {
  terra: { radius: 1000, seaLevel: 0.48, amp: 220, shape: { ridge: 0.45, ridgeFreq: 3.1, valley: 0.1 }, deepAmp: 0, water: true, frozen: false },
  rustia: { radius: 800, seaLevel: 0.02, amp: 60, shape: DEFAULT_SHAPE, deepAmp: 0, water: false, frozen: false },
  neptunia: { radius: 1400, seaLevel: 0.68, amp: 95, shape: { ridge: 0.34, ridgeFreq: 3.5, valley: 0.05 }, deepAmp: 70, water: true, frozen: false },
  wyattmattoe: { radius: 1050, seaLevel: 0.42, amp: 280, shape: { ridge: 0.58, ridgeFreq: 2.7, valley: 0.18 }, deepAmp: 0, water: true, frozen: true },
  'wavemall prime': { radius: 950, seaLevel: 0.02, amp: 14, shape: DEFAULT_SHAPE, deepAmp: 0, water: false, frozen: false },
};
const WALK_WATER_LEVEL = 1.5; // src/constants.js — water.r = radius + this
const WET_MARGIN = 0.6; // a touch stricter than city.js's 0.4

// --- minimal vector helpers (no three dependency needed for the probe) -----
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

// siteFrame (cityRegistry.js): tangent basis with the beginAutoLand ref rule.
function siteFrame(site) {
  const ref = Math.abs(site[1]) < 0.94 ? [0, 1, 0] : [1, 0, 0];
  const t1 = norm(cross(site, ref));
  const t2 = norm(cross(site, t1));
  return [t1, t2];
}

// Quaternion(+Y -> site) applied to (x, 0, z) — expanded via the same tangent
// construction padLocalDir uses. setFromUnitVectors(+Y, site) maps +X/+Z onto
// an orthonormal tangent pair; we reproduce it with Rodrigues' rotation.
function rotateFlat(site, x, z) {
  // axis = normalize(yAxis x site), angle = acos(site.y)
  const c = site[1];
  const axis = cross([0, 1, 0], site);
  const al = Math.hypot(axis[0], axis[1], axis[2]);
  if (al < 1e-9) return c > 0 ? [x, 0, z] : [-x, 0, z]; // site ~ +/-Y
  const [ux, uy, uz] = [axis[0] / al, axis[1] / al, axis[2] / al];
  const s = al; // |yAxis x site| = sin(angle) since both unit
  const rot = (v) => {
    const d = ux * v[0] + uy * v[1] + uz * v[2];
    const cr = cross([ux, uy, uz], v);
    return [
      v[0] * c + cr[0] * s + ux * d * (1 - c),
      v[1] * c + cr[1] * s + uy * d * (1 - c),
      v[2] * c + cr[2] * s + uz * d * (1 - c),
    ];
  };
  return rot([x, 0, z]);
}

function makeWorld(name) {
  const P = PLANETS[name];
  const waterR = P.water ? P.radius + WALK_WATER_LEVEL : -Infinity;
  const g = (dir) => groundHeight(dir[0], dir[1], dir[2], P.seaLevel, P.amp, P.shape, P.deepAmp);
  const isWet = (dir) => {
    if (!P.water || P.frozen) return false;
    return P.radius + g(dir) < waterR + WET_MARGIN;
  };
  return { ...P, waterR, g, isWet };
}

// City-local (x,z) -> surface dir, via the padLocalDir mapping.
function localToDir(W, site, x, z) {
  const ground = W.g(site);
  let baseR = W.radius + ground;
  if (W.water && baseR < W.waterR + 0.4) baseR = W.waterR + 0.4;
  const off = rotateFlat(site, x, z);
  return norm(add([site[0] * baseR, site[1] * baseR, site[2] * baseR], off));
}

// --- pad probe --------------------------------------------------------------
// A pad candidate passes when its footprint (center + ring r=12) and the
// walkway line back to the town edge are all dry and the footprint height
// spread stays under the slope cap.
// A module-owned pad (an entry with no citizens — world/wavemallprime.js is
// one building, not a town) is placed by the module's own architecture, so
// there is nothing to search for: the pad coordinates are a fixed part of the
// layout. Check the declared footprint is dry and level and leave it alone.
function checkPad(W, def) {
  const site = [def.site.x, def.site.y, def.site.z];
  const hs = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = i === 0 ? def.pad.x : def.pad.x + Math.cos(a) * 12;
    const z = i === 0 ? def.pad.z : def.pad.z + Math.sin(a) * 12;
    const dir = localToDir(W, site, x, z);
    if (W.isWet(dir)) return { ok: false, why: 'wet' };
    hs.push(W.g(dir));
  }
  const spread = Math.max(...hs) - Math.min(...hs);
  return { ok: spread <= 6, why: `slope spread ${spread.toFixed(2)}`, spread };
}

function probePad(W, def) {
  const site = [def.site.x, def.site.y, def.site.z];
  const curBearing = Math.atan2(def.pad.z, def.pad.x);
  const SLOPE_CAP = 6;
  const candidates = [];
  for (let db = 0; db <= 3.2; db += 0.1) {
    for (const sgn of db === 0 ? [1] : [1, -1]) {
      for (let d = def.radius + 30; d <= def.radius + 48; d += 6) {
        candidates.push({ b: curBearing + db * sgn, d });
      }
    }
  }
  for (const cand of candidates) {
    const px = Math.cos(cand.b) * cand.d;
    const pz = Math.sin(cand.b) * cand.d;
    let ok = true;
    const hs = [];
    // footprint: center + 8 ring points
    for (let i = 0; i <= 8 && ok; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = i === 0 ? px : px + Math.cos(a) * 12;
      const z = i === 0 ? pz : pz + Math.sin(a) * 12;
      const dir = localToDir(W, site, x, z);
      if (W.isWet(dir)) ok = false;
      hs.push(W.g(dir));
    }
    if (!ok) continue;
    if (Math.max(...hs) - Math.min(...hs) > SLOPE_CAP) continue;
    // walkway line: pad -> radius * 0.9, every 6 u
    const gateX = Math.cos(cand.b) * def.radius * 0.9;
    const gateZ = Math.sin(cand.b) * def.radius * 0.9;
    const steps = Math.ceil(Math.hypot(px - gateX, pz - gateZ) / 6);
    for (let i = 0; i <= steps && ok; i++) {
      const t = i / steps;
      const dir = localToDir(W, site, px + (gateX - px) * t, pz + (gateZ - pz) * t);
      if (W.isWet(dir)) ok = false;
    }
    if (ok) return { x: Math.round(px), z: Math.round(pz), moved: cand.b !== curBearing };
  }
  return null;
}

// --- wonder probe -------------------------------------------------------------
// Native (first) wonder keeps its probed bearing/dist. Each inherited wonder
// scans bearings near its provisional value for dry ground at its dist, and
// must keep a real walking separation from the town and the other wonders.
function wonderDir(W, site, bearing, dist) {
  const [t1, t2] = siteFrame(site);
  const e = dist / W.radius;
  return norm(add(add(site, t1, Math.cos(bearing) * e), t2, Math.sin(bearing) * e));
}

function probeWonders(W, def) {
  const site = [def.site.x, def.site.y, def.site.z];
  const placed = [];
  const out = [];
  for (let wi = 0; wi < def.wonders.length; wi++) {
    const w = def.wonders[wi];
    if (wi === 0) {
      // native wonder: trusted, probed when the city shipped
      placed.push(wonderDir(W, site, w.bearing, w.dist));
      out.push({ title: w.title, bearing: w.bearing, dist: w.dist, kept: true });
      continue;
    }
    let best = null;
    outer:
    for (let db = 0; db <= 3.2; db += 0.08) {
      for (const sgn of db === 0 ? [1] : [1, -1]) {
        for (const dist of [w.dist, w.dist + 40, w.dist - 40, w.dist + 80]) {
          if (dist < 300 || dist > 900) continue;
          const b = w.bearing + db * sgn;
          const dir = wonderDir(W, site, b, dist);
          // dry at center + ring r=25 (wonders have broad footprints)
          let ok = !W.isWet(dir);
          for (let i = 0; i < 6 && ok; i++) {
            const a = (i / 6) * Math.PI * 2;
            const rx = Math.cos(b) * dist + Math.cos(a) * 25;
            const rz = Math.sin(b) * dist + Math.sin(a) * 25;
            if (W.isWet(wonderDir(W, site, Math.atan2(rz, rx), Math.hypot(rx, rz)))) ok = false;
          }
          if (!ok) continue;
          // separation: >= 250 u chord from every placed wonder
          for (const p of placed) {
            const dot = dir[0] * p[0] + dir[1] * p[1] + dir[2] * p[2];
            const ang = Math.acos(Math.min(Math.max(dot, -1), 1));
            if (ang * W.radius < 250) { ok = false; break; }
          }
          if (ok) { best = { b, dist, dir }; break outer; }
        }
      }
    }
    if (best) {
      placed.push(best.dir);
      out.push({ title: w.title, bearing: +best.b.toFixed(2), dist: best.dist, kept: false });
    } else {
      out.push({ title: w.title, bearing: w.bearing, dist: w.dist, FAILED: true });
    }
  }
  return out;
}

// --- run ---------------------------------------------------------------------
for (const def of CITIES) {
  const W = makeWorld(def.world);
  if (!W) { console.log(`${def.id}: no planet params`); continue; }
  console.log(`\n=== ${def.id} (${def.world}, radius ${def.radius}) ===`);
  if (!def.citizens || def.citizens.length === 0) {
    // Module-owned site: validate the declared pad, never relocate it.
    const chk = checkPad(W, def);
    console.log(`pad: { x: ${def.pad.x}, z: ${def.pad.z} } module-owned — ${chk.ok ? 'OK' : 'FAILED'} (${chk.why})`);
    continue;
  }
  const pad = probePad(W, def);
  const ws = probeWonders(W, def);
  console.log(pad ? `pad: { x: ${pad.x}, z: ${pad.z} }${pad.moved ? '  (bearing adjusted)' : ''}` : 'pad: NO DRY SITE FOUND');
  for (const w of ws) {
    console.log(`wonder ${w.title}: bearing ${w.bearing}, dist ${w.dist}${w.kept ? ' (native, kept)' : ''}${w.FAILED ? '  ** FAILED — keep provisional, place manually' : ''}`);
  }
}
