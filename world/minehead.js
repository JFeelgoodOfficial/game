/**
 * minehead.js — the surface works of the Emberdeep (rustia, Redline Claim):
 * a steel headframe over the shaft, the cage at the collar, a winding house
 * and a hopper of glowing ore, set beside the walkway in from the landing pad.
 *
 * Built in the city's flat local frame AFTER the city and its warzone exist,
 * so it can find a spot clear of every house and every piece of cover instead
 * of asking world/city.js to make room. It joins the town the way the
 * warzone's cover does: one makeStructure() pushed onto city.structures gives
 * walk.js its walls and its standing surface, and gives the warzone's
 * ballistics something to stop on.
 *
 * The cage is the interaction: E inside it hands control to src/mineWalk.js.
 * This module only reports the intent (opts.onDescend) — it never changes
 * game state itself, the same contract every other world module keeps.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeStructure } from './city.js';

const R_FOOT = 11; // clearance radius the whole works needs

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function signTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1b120e';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#ff7a2a';
  ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, 500, 116);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffb060';
  ctx.font = '700 54px monospace';
  ctx.fillText('EMBERDEEP No.1', 256, 52);
  ctx.font = '600 22px monospace';
  ctx.fillStyle = '#ff8a3a';
  ctx.fillText('CAGE · 120 M · MIND THE GATE', 256, 100);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Distance from (x, z) to the segment a -> b.
function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

/**
 * @param city  a world/city.js instance (with .def, .structures, .gateSpot)
 * @param opts  { onDescend(): void, seed }
 */
export function createMineHead(city, opts = {}) {
  const rng = mulberry32(opts.seed ?? 0x3b3a11);
  const radius = city.def?.radius ?? 110;
  const gate = city.gateSpot;
  const pad = city.padLocal;
  const gLen = Math.hypot(gate.x, gate.z) || 1;
  const gx = gate.x / gLen, gz = gate.z / gLen; // plaza -> gate
  const px = -gz, pz = gx; // perpendicular

  // ---- find a spot: beside the walkway, between the house ring and the gate
  function free(x, z) {
    if (Math.hypot(x, z) > radius - R_FOOT - 3) return false;
    if (segDist(x, z, 0, 0, gate.x, gate.z) < R_FOOT + 3) return false;
    if (segDist(x, z, gate.x, gate.z, pad.x, pad.z) < R_FOOT + 3) return false;
    if (city.roadDist && city.roadDist(x, z) < R_FOOT + 5) return false; // not across a street
    for (const s of city.structures) {
      if (Math.hypot(x - s.x, z - s.z) < s.halfExtent * 1.42 + R_FOOT + 1.5) return false;
    }
    for (const c of city.collidersLocal) {
      if (Math.hypot(x - c.x, z - c.z) < c.radius + R_FOOT + 1.5) return false;
    }
    return true;
  }
  let spot = null, side = 1;
  search:
  for (let off = R_FOOT + 4; off <= R_FOOT + 22; off += 3) {
    for (let t = radius * 0.84; t >= radius * 0.5; t -= 3) {
      for (const s of [1, -1]) {
        const x = gx * t + px * s * off, z = gz * t + pz * s * off;
        if (free(x, z)) { spot = { x, z }; side = s; break search; }
      }
    }
  }
  if (!spot) {
    // Pathological layout: take the walkway shoulder regardless. The walls
    // still work; it may just crowd a piece of cover.
    spot = { x: gx * radius * 0.7 + px * (R_FOOT + 6), z: gz * radius * 0.7 + pz * (R_FOOT + 6) };
  }

  // The cage door (+Z in the works' own frame) faces the walkway. Quarter
  // turns only: makeStructure needs axis-aligned walls.
  const wantX = -px * side, wantZ = -pz * side;
  let rot = 0, bestDot = -Infinity;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const d = Math.sin(a) * wantX + Math.cos(a) * wantZ;
    if (d > bestDot) { bestDot = d; rot = k; }
  }
  const ang = (rot * Math.PI) / 2;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  // works-local (x, z) -> offset from the works' origin in the city frame
  const toCity = (x, z) => ({ x: x * ca + z * sa, z: -x * sa + z * ca });

  // Deck height: the ground at the door apron, so the step up from the path
  // side is always the same 0.4.
  const apron = toCity(0, 8.5);
  const by = city.groundLocalYAt(spot.x + apron.x, spot.z + apron.z) + 0.4;

  const group = new THREE.Group();
  group.name = 'emberdeep-minehead';
  group.position.set(spot.x, by, spot.z);
  group.rotation.y = ang;

  const owned = [];
  const own = (x) => { owned.push(x); return x; };
  const MATS = {
    steel: own(new THREE.MeshStandardMaterial({ color: 0x6e3b28, roughness: 0.62, metalness: 0.75 })),
    dark: own(new THREE.MeshStandardMaterial({ color: 0x241c1a, roughness: 0.6, metalness: 0.8 })),
    concrete: own(new THREE.MeshStandardMaterial({ color: 0x84746a, roughness: 0.92, metalness: 0 })),
    shed: own(new THREE.MeshStandardMaterial({ color: 0x8c5a3c, roughness: 0.8, metalness: 0.25 })),
    // HDR on purpose: the surface bloom threshold sits above a daylit sky
    // (isolate.js), so only something this hot glows — at night it carries.
    ore: own(new THREE.MeshStandardMaterial({ color: 0x451505, roughness: 0.3, flatShading: true, emissive: 0xff5a14, emissiveIntensity: 3.2 })),
    hot: own(new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.2, 1.1) })),
  };
  const P = {};
  const put = (mat, g) => {
    const n = g.index ? g.toNonIndexed() : g;
    (P[mat] ||= []).push(n);
  };
  const box = (mat, x0, x1, y0, y1, z0, z1) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    put(mat, g);
  };
  // a beam between two points
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
  const beam = (mat, ax, ay, az, bx, by2, bz, w = 0.28) => {
    _v.set(bx - ax, by2 - ay, bz - az);
    const len = _v.length();
    const g = new THREE.BoxGeometry(w, len, w);
    _q.setFromUnitVectors(_up, _v.normalize());
    g.applyQuaternion(_q);
    g.translate((ax + bx) / 2, (ay + by2) / 2, (az + bz) / 2);
    put(mat, g);
  };

  // ---- the deck: a concrete raft with a skirt deep enough for any slope ---
  const DX = 7, DZ0 = -11.5, DZ1 = 7.5;
  box('concrete', -DX, DX, -5, 0, DZ0, DZ1);
  box('dark', -DX, DX, 0, 0.03, DZ1 - 0.5, DZ1); // hazard strip at the lip
  // shaft collar kerb round three sides of the cage
  const CW = 1.62;
  box('concrete', -CW - 0.5, -CW - 0.1, 0, 0.45, -CW - 0.5, CW);
  box('concrete', CW + 0.1, CW + 0.5, 0, 0.45, -CW - 0.5, CW);
  box('concrete', -CW - 0.5, CW + 0.5, 0, 0.45, -CW - 0.5, -CW - 0.1);

  // ---- the cage, parked at the collar ------------------------------------
  box('dark', -CW, CW, 0, 0.06, -CW, CW);
  box('dark', -CW, CW, 2.7, 2.8, -CW, CW);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('dark', sx * CW - 0.07, sx * CW + 0.07, 0, 2.7, sz * CW - 0.07, sz * CW + 0.07);
  for (let i = -4; i <= 4; i++) {
    const t = (i / 4.6) * CW;
    for (const sx of [-1, 1]) box('dark', sx * CW - 0.02, sx * CW + 0.02, 0, 2.7, t - 0.02, t + 0.02);
    box('dark', t - 0.02, t + 0.02, 0, 2.7, -CW - 0.02, -CW + 0.02);
  }
  for (const sx of [-1, 1]) box('dark', sx * CW - 0.04, sx * CW + 0.04, 1.05, 1.15, -CW, CW);
  box('dark', -CW, CW, 1.05, 1.15, -CW - 0.04, -CW + 0.04);
  box('hot', -0.22, 0.22, 2.6, 2.68, -0.22, 0.22); // cage bulb
  box('dark', -0.04, 0.04, 2.8, 16.2, -0.04, 0.04); // the rope, up to the sheave

  // ---- the headframe -------------------------------------------------------
  const HF = 2.7, HT = 15.5; // leg spread at the deck, height
  const TOPW = 1.9;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) beam('steel', sx * HF, 0, sz * HF, sx * TOPW, HT, sz * TOPW, 0.36);
  }
  // ring girders every ~3.9 m, X-bracing between them on the three closed sides
  const levels = [3.6, 7.5, 11.4, HT];
  let prevW = HF, prevY = 0;
  for (const y of levels) {
    const w = HF + (TOPW - HF) * (y / HT);
    for (const s of [-1, 1]) {
      box('steel', -w, w, y - 0.14, y + 0.14, s * w - 0.14, s * w + 0.14);
      box('steel', s * w - 0.14, s * w + 0.14, y - 0.14, y + 0.14, -w, w);
    }
    for (const sx of [-1, 1]) {
      beam('steel', sx * prevW, prevY, -prevW, sx * w, y, w, 0.16);
      beam('steel', sx * prevW, prevY, prevW, sx * w, y, -w, 0.16);
    }
    beam('steel', -prevW, prevY, -prevW, w, y, -w, 0.16);
    beam('steel', prevW, prevY, -prevW, -w, y, -w, 0.16);
    if (prevY > 0) {
      // the front stays open at deck level (that is the door); brace above it
      beam('steel', -prevW, prevY, prevW, w, y, w, 0.16);
      beam('steel', prevW, prevY, prevW, -w, y, w, 0.16);
    }
    prevW = w; prevY = y;
  }
  box('steel', -TOPW - 0.4, TOPW + 0.4, HT, HT + 0.2, -TOPW - 0.4, TOPW + 0.4); // crown platform
  for (const s of [-1, 1]) {
    box('steel', -TOPW - 0.4, TOPW + 0.4, HT + 1.0, HT + 1.08, s * (TOPW + 0.36) - 0.04, s * (TOPW + 0.36) + 0.04); // handrail
    box('steel', s * (TOPW + 0.36) - 0.04, s * (TOPW + 0.36) + 0.04, HT + 1.0, HT + 1.08, -TOPW - 0.4, TOPW + 0.4);
  }
  // back-stays: the two raking legs that take the rope's pull
  for (const sx of [-1, 1]) {
    beam('steel', sx * 1.5, HT, -TOPW, sx * 2.4, 0, -7.2, 0.4);
    beam('steel', sx * 1.5, HT * 0.5, -TOPW - 2.6, sx * 2.2, HT * 0.5, -2.2, 0.16);
  }
  beam('steel', -2.0, HT * 0.5, -TOPW - 2.7, 2.0, HT * 0.5, -TOPW - 2.7, 0.2);
  // sheave bearings
  for (const sx of [-1, 1]) box('steel', sx * 0.55 - 0.1, sx * 0.55 + 0.1, HT + 0.2, HT + 1.9, -0.25, 0.25);
  // rope down the back to the winder
  beam('dark', 0, HT + 2.95, -1.2, 0, 3.2, -8.6, 0.08);

  // ---- winding house -------------------------------------------------------
  const WZ0 = -11, WZ1 = -7.6, WX = 2.9, WH = 4.2;
  box('shed', -WX, WX, 0, WH, WZ0, WZ1);
  box('dark', -WX - 0.25, WX + 0.25, WH, WH + 0.25, WZ0 - 0.25, WZ1 + 0.25);
  box('hot', -1.1, 1.1, 1.6, 2.7, WZ1, WZ1 + 0.04); // lit window toward the cage
  box('dark', -1.25, 1.25, 1.45, 1.6, WZ1, WZ1 + 0.1);
  box('dark', -0.05, 0.05, 1.6, 2.7, WZ1 + 0.02, WZ1 + 0.08);
  box('dark', WX - 0.9, WX - 0.2, WH + 0.25, WH + 2.4, WZ0 + 0.4, WZ0 + 1.1); // flue

  // ---- ore hopper: the reason for all of it, heaped and glowing -----------
  const HX0 = 3.6, HX1 = 6.4, HZ0 = 0.6, HZ1 = 5.0;
  box('dark', HX0, HX1, 0, 0.9, HZ0, HZ0 + 0.14);
  box('dark', HX0, HX1, 0, 0.9, HZ1 - 0.14, HZ1);
  box('dark', HX0, HX0 + 0.14, 0, 0.9, HZ0, HZ1);
  box('dark', HX1 - 0.14, HX1, 0, 0.9, HZ0, HZ1);
  for (let i = 0; i < 46; i++) {
    const x = HX0 + 0.3 + rng() * (HX1 - HX0 - 0.6), z = HZ0 + 0.3 + rng() * (HZ1 - HZ0 - 0.6);
    const cxh = (HX0 + HX1) / 2, czh = (HZ0 + HZ1) / 2;
    const heap = 1 - Math.min(1, Math.hypot((x - cxh) / 1.4, (z - czh) / 2.2));
    const r = 0.14 + rng() * 0.2;
    const g = new THREE.OctahedronGeometry(r, 0);
    g.scale(1, 1.2 + rng() * 1.3, 1);
    g.rotateX(rng() * 3); g.rotateY(rng() * 6);
    g.translate(x, 0.35 + heap * 0.9 + rng() * 0.15, z);
    put('ore', g);
  }
  // a tub on a stub of track, tipped toward the hopper
  box('dark', -6.2, -3.4, 0, 0.08, 2.2, 2.34);
  box('dark', -6.2, -3.4, 0, 0.08, 3.3, 3.44);
  box('steel', -5.6, -4.2, 0.35, 1.2, 2.1, 3.5);
  for (let i = 0; i < 9; i++) {
    const g = new THREE.OctahedronGeometry(0.14 + rng() * 0.12, 0);
    g.rotateX(rng() * 3);
    g.translate(-5.4 + rng() * 1.0, 1.25 + rng() * 0.2, 2.3 + rng() * 1.0);
    put('ore', g);
  }

  // ---- lamps: door lamps on the front legs, a marker on the crown ---------
  for (const sx of [-1, 1]) {
    box('hot', sx * 2.62 - 0.12, sx * 2.62 + 0.12, 3.0, 3.3, 2.5, 2.74);
    box('dark', sx * 2.62 - 0.18, sx * 2.62 + 0.18, 3.3, 3.38, 2.44, 2.8);
  }

  for (const k of Object.keys(P)) {
    const m = new THREE.Mesh(own(mergeGeometries(P[k], false)), MATS[k]);
    m.castShadow = k !== 'hot' && k !== 'ore';
    m.receiveShadow = true;
    group.add(m);
    for (const g of P[k]) g.dispose();
  }

  // the two sheave wheels turn (slowly — the rope is paying out below)
  const wheels = [];
  {
    const parts = [];
    const rim = new THREE.TorusGeometry(1.45, 0.09, 6, 28).toNonIndexed();
    parts.push(rim);
    for (let k = 0; k < 6; k++) {
      const g = new THREE.BoxGeometry(0.08, 2.9, 0.06).toNonIndexed();
      g.rotateZ((k / 6) * Math.PI);
      parts.push(g);
    }
    const geo = own(mergeGeometries(parts, false));
    for (const g of parts) g.dispose();
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(geo, MATS.steel);
      w.rotation.y = Math.PI / 2;
      w.position.set(sx * 0.3, HT + 1.5, 0);
      w.castShadow = true;
      group.add(w);
      wheels.push(w);
    }
  }
  const beaconMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 2.4, 0.6) }));
  const beacon = new THREE.Mesh(own(new THREE.SphereGeometry(0.22, 10, 8)), beaconMat);
  beacon.position.set(0, HT + 3.3, 0);
  group.add(beacon);
  const mast = new THREE.Mesh(own(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6)), MATS.dark);
  mast.position.set(0, HT + 2.6, 0);
  group.add(mast);

  // the name board over the door
  const sign = new THREE.Mesh(
    own(new THREE.PlaneGeometry(5.0, 1.25)),
    own(new THREE.MeshBasicMaterial({ map: own(signTexture()), color: new THREE.Color(1.6, 1.6, 1.6) }))
  );
  sign.position.set(0, 4.5, 2.62);
  group.add(sign);
  const signBack = new THREE.Mesh(own(new THREE.BoxGeometry(5.2, 1.45, 0.1)), MATS.dark);
  signBack.position.set(0, 4.5, 2.55);
  group.add(signBack);

  // ---- collision: one structure in the city's frame ------------------------
  // Rects are authored in works-local and turned into the city frame; quarter
  // turns keep them axis-aligned.
  const rect = (x0, x1, z0, z1) => {
    const a = toCity(x0, z0), b = toCity(x1, z1);
    return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
  };
  const surfaces = [{ ...rect(-DX, DX, DZ0, DZ1), y: 0 }];
  const walls = [];
  const wall = (x0, x1, z0, z1, y0, y1) => walls.push({ ...rect(x0, x1, z0, z1), y0, y1 });
  // cage: back and both sides (the front is the way in)
  wall(-CW - 0.5, -CW + 0.05, -CW - 0.5, CW, 0, 2.8);
  wall(CW - 0.05, CW + 0.5, -CW - 0.5, CW, 0, 2.8);
  wall(-CW - 0.5, CW + 0.5, -CW - 0.5, -CW + 0.05, 0, 2.8);
  // headframe feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wall(sx * HF - 0.3, sx * HF + 0.3, sz * HF - 0.3, sz * HF + 0.3, 0, 4);
  for (const sx of [-1, 1]) wall(sx * 2.4 - 0.35, sx * 2.4 + 0.35, -7.5, -6.6, 0, 3);
  wall(-WX, WX, WZ0, WZ1, 0, WH); // winding house
  wall(HX0, HX1, HZ0, HZ1, 0, 1.6); // hopper
  wall(-5.6, -4.2, 2.1, 3.5, 0, 1.3); // tub
  const structure = makeStructure(spot.x, spot.z, by, surfaces, walls, 12.2);

  // ---- interaction ---------------------------------------------------------
  const cagePos = new THREE.Vector2(spot.x, spot.z);
  const entity = { kind: 'cage', pos: cagePos, y: by, prompt: 'E — RIDE THE CAGE DOWN' };
  const module = {
    nearestInteractable(playerLocal, maxDist) {
      if (Math.abs(playerLocal.y - by) > 2.5) return null;
      const dx = cagePos.x - playerLocal.x, dz = cagePos.y - playerLocal.z;
      return dx * dx + dz * dz < maxDist * maxDist ? entity : null;
    },
    interact() {
      opts.onDescend?.();
      return null; // no dialogue; walk.js releases the entity on null
    },
    endInteract() {},
  };

  function update(t) {
    for (const w of wheels) w.rotation.x = t * 0.35;
    const blink = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.4));
    beaconMat.color.setRGB(6 * blink, 2.4 * blink, 0.6 * blink);
  }

  function dispose() {
    group.parent?.remove(group);
    group.clear();
    for (const o of owned) o.dispose();
    owned.length = 0;
  }

  // Where to stand to see it, and where the door is (city-local) — for
  // headless checks and the governor's directions.
  const door = toCity(0, 5.5);
  return {
    group,
    structure,
    module,
    update,
    dispose,
    spot: { x: spot.x, z: spot.z, y: by },
    cage: { x: spot.x, z: spot.z, y: by },
    door: { x: spot.x + door.x, z: spot.z + door.z },
    rot,
  };
}
