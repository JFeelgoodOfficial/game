// skycity.js
//
// The Sky City: a disc of towers, domes and gardens riding a slab of rock
// above Saturnia's cloud bands, held up by thrusters, with docking arms slung
// out on cables. It is the only place on the gas giant a ship can set down
// (src/game.js auto-lands on its pad) and it is walkable (src/skyWalk.js).
//
// One THREE.Group, parented to the planet's GROUP rather than its spinning
// surface mesh: the city holds station while the cloud bands turn under it.
// City-local frame: +Y is up (radially out of the planet), the deck top is
// y = 0, the landing pad hangs off the +Z edge.
//
// Edges are open on purpose. There are curbs, not walls, and the arms and the
// pad pier have no rails at all: walking off is how you die here.
//
// Lighting comes from the system DirectionalLight/AmbientLight (src/sun.js),
// like the stations, plus one hemisphere fill for the gold bounce off the
// clouds. All randomness is seeded, so the city is the same every run.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDragon } from './skydragon.js';

const K = {
  seed: 7341,
  altitude: 320, // deck height above the planet's base radius
  deckR: 170,
  terraceR: 48,
  terraceY: 6,
  rampLen: 26,
  rampWidth: 10,
  armInner: 164,
  armOuter: 236,
  armWidth: 8,
  armPlatR: 16,
  padZ: 214,
  padR: 24,
  pierWidth: 22, // wider than the hatch-side spawn offset: straight ahead is safe
  snap: 1.2, // step-up reach of the floor query
  lanceH: 176, // the Lance Tower: taller than anything else in the city
  lanceR: 6.5,
  roomR: 9.5,
  trackY: 12, // the raceway rides above the rim on pylons
  trackHalf: 7,
  trackN: 360, // centre-line samples, one per degree
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _c = new THREE.Color();
// Paint a whole geometry one vertex colour (so everything merges into one
// vertex-coloured mesh) and return it.
function tint(geo, hex, jitter = 0, rng = null) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(hex);
  const j = jitter && rng ? 1 + (rng() - 0.5) * jitter : 1;
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r * j;
    col[i * 3 + 1] = _c.g * j;
    col[i * 3 + 2] = _c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function box(w, h, d, x, y, z, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

function cyl(rTop, rBot, h, x, y, z, seg = 16) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, y, z);
  return g;
}

export function createSkyCity(planet) {
  const rng = mulberry32(K.seed);
  const group = new THREE.Group();
  group.name = 'SkyCity';

  // --- placement: sunward, lifted off the ring plane so the rings arch overhead
  const dir = planet.sunBase.clone().add(new THREE.Vector3(0, 0.55, 0)).normalize();
  group.position.copy(dir).multiplyScalar(planet.radius + K.altitude);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

  const solid = []; // vertex-coloured standard-material geometry
  const glow = []; // emissive window bands and lamps
  const detail = []; // geometry only worth drawing up close
  const surfaces = []; // walkable: discs and rects
  const colliders = []; // circles: { x, z, r, top }

  const STONE = 0xb9a78a, STONE_D = 0x8d7c64, METAL = 0x5d6470, METAL_D = 0x3a3f49;
  const TOWER = [0xc9b89a, 0xa9b0b8, 0xd6c6a2, 0x8f9aa6, 0xbfa98a];
  const WARM = 0xffc878, TEAL = 0x66e0d0;

  // ---- main deck -----------------------------------------------------------
  solid.push(tint(cyl(K.deckR, K.deckR, 6, 0, -3, 0, 72), STONE));
  solid.push(tint(cyl(K.deckR + 5, K.deckR + 2, 8, 0, -10, 0, 72), METAL));
  solid.push(tint(cyl(K.deckR - 4, K.deckR - 22, 10, 0, -19, 0, 72), METAL_D));
  surfaces.push({ kind: 'disc', cx: 0, cz: 0, r: K.deckR, y: 0 });
  // a curb you step over, broken where the arms and the pier leave the deck
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const deg = (a * 180) / Math.PI;
    const nearGate = [0, 90, 180, 270].some((g) => Math.abs(((deg - g + 540) % 360) - 180) < 6);
    if (nearGate || i % 6 === 5) continue; // open gaps: nothing stops you
    solid.push(tint(box(1.2, 0.45, 14.6, Math.cos(a) * (K.deckR - 0.6), 0.22, Math.sin(a) * (K.deckR - 0.6), -a), STONE_D));
  }
  // rim lamps
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    glow.push(tint(box(0.8, 1.6, 2.4, Math.cos(a) * (K.deckR + 4.6), -9, Math.sin(a) * (K.deckR + 4.6), -a), i % 3 ? WARM : TEAL));
  }

  // ---- central terrace + dome ----------------------------------------------
  solid.push(tint(cyl(K.terraceR, K.terraceR + 1.5, K.terraceY, 0, K.terraceY / 2, 0, 48), STONE_D));
  surfaces.push({ kind: 'disc', cx: 0, cz: 0, r: K.terraceR, y: K.terraceY });
  colliders.push({ x: 0, z: 0, r: K.terraceR, top: K.terraceY }); // a wall from the deck, a floor from the ramps
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const ux = Math.cos(a), uz = Math.sin(a);
    const mid = K.terraceR - 0.5 + K.rampLen / 2;
    const g = new THREE.BoxGeometry(K.rampLen, 0.8, K.rampWidth);
    g.rotateZ(-Math.atan2(K.terraceY, K.rampLen)); // slopes down along +X
    g.rotateY(-a);
    g.translate(ux * mid, K.terraceY / 2 - 0.4, uz * mid);
    solid.push(tint(g, STONE));
    surfaces.push({
      kind: 'rect', cx: ux * mid, cz: uz * mid, ux, uz,
      hl: K.rampLen / 2 + 0.5, hw: K.rampWidth / 2, yA: K.terraceY, yB: 0,
    });
  }
  const domeR = 20;
  solid.push(tint(cyl(domeR + 2, domeR + 3, 5, 0, K.terraceY + 2.5, 0, 32), STONE));
  colliders.push({ x: 0, z: 0, r: domeR + 3, top: Infinity });
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(domeR, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0x2f8f86, metalness: 0.6, roughness: 0.22,
      emissive: 0x1c6f66, emissiveIntensity: 0.55,
    })
  );
  dome.position.y = K.terraceY + 5;
  group.add(dome);
  // dome ribs
  for (let i = 0; i < 8; i++) {
    const g = new THREE.TorusGeometry(domeR + 0.25, 0.35, 5, 24, Math.PI);
    g.rotateY((i / 8) * Math.PI);
    g.translate(0, K.terraceY + 5, 0);
    solid.push(tint(g, 0xd9b56a));
  }

  // ---- towers ---------------------------------------------------------------
  function tower(x, z, w, h, baseY, round, facing) {
    const hex = TOWER[Math.floor(rng() * TOWER.length)];
    const steps = h > 55 ? 3 : h > 28 ? 2 : 1;
    let y = baseY, ww = w, left = h;
    for (let s = 0; s < steps; s++) {
      const hh = s === steps - 1 ? left : h * (0.5 - s * 0.12);
      left -= hh;
      if (round) solid.push(tint(cyl(ww / 2, ww / 2 + 0.6, hh, x, y + hh / 2, z, 14), hex, 0.12, rng));
      else solid.push(tint(box(ww, hh, ww * 0.86, x, y + hh / 2, z, facing), hex, 0.12, rng));
      // window bands
      const bands = Math.max(2, Math.floor(hh / 5.5));
      const lamp = rng() < 0.3 ? TEAL : WARM;
      for (let b = 0; b < bands; b++) {
        if (rng() < 0.22) continue;
        const by = y + ((b + 0.6) / bands) * hh;
        if (round) glow.push(tint(cyl(ww / 2 + 0.12, ww / 2 + 0.12, 0.7, x, by, z, 14), lamp));
        else glow.push(tint(box(ww + 0.24, 0.7, ww * 0.86 + 0.24, x, by, z, facing), lamp));
      }
      y += hh;
      ww *= 0.72;
    }
    // crown: spire or small cupola
    if (h > 40) {
      solid.push(tint(cyl(0.15, ww * 0.35, h * 0.22, x, y + h * 0.11, z, 6), METAL));
      glow.push(tint(cyl(0.5, 0.5, 0.9, x, y + h * 0.22, z, 6), 0xff5a4a));
    } else {
      const g = new THREE.SphereGeometry(ww * 0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      g.translate(x, y, z);
      solid.push(tint(g, 0x3f9f94));
    }
    colliders.push({ x, z, r: round ? w / 2 + 0.6 : w * 0.56, top: Infinity });
  }
  // the heart: tall spires on the terrace, between the ramp heads
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    const r = 35;
    if (i === 0) continue; // this plot is the Lance Tower's (below)
    tower(Math.cos(a) * r, Math.sin(a) * r, 8 + rng() * 3, 62 + rng() * 62, K.terraceY, rng() < 0.5, -a);
  }

  // ---- the Lance Tower -------------------------------------------------------
  // The tallest thing in the city: a plain shaft with a gallery on top, and on
  // the gallery's roof the Lance, the gun the city keeps for the dragon. A lift
  // at the foot carries you up (src/skyWalk.js); the gallery is open-sided so
  // you can aim, and the walker is held inside its rail.
  const lanceA = 0.26;
  const lance = { x: Math.cos(lanceA) * 35, z: Math.sin(lanceA) * 35 };
  const roomY = K.terraceY + K.lanceH;
  {
    const { x, z } = lance;
    solid.push(tint(cyl(K.lanceR, K.lanceR + 1.5, K.lanceH - 1, x, K.terraceY + (K.lanceH - 1) / 2, z, 20), 0xd9cdb4));
    for (let b = 0; b < 30; b++) {
      if (b % 5 === 4) continue;
      glow.push(tint(cyl(K.lanceR + 0.25, K.lanceR + 0.3, 0.6, x, K.terraceY + 6 + b * 5.6, z, 20), b % 3 ? 0xff8a5a : WARM));
    }
    // gallery floor, flared out from the shaft
    solid.push(tint(cyl(K.roomR + 0.6, K.lanceR + 0.5, 4, x, roomY - 2, z, 24), METAL));
    // posts and a low rail: the view stays open
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      solid.push(tint(cyl(0.3, 0.3, 5.2, x + Math.cos(a) * K.roomR, roomY + 2.6, z + Math.sin(a) * K.roomR, 6), METAL_D));
    }
    const rail = new THREE.TorusGeometry(K.roomR, 0.14, 5, 40);
    rail.rotateX(Math.PI / 2);
    rail.translate(x, roomY + 1.05, z);
    solid.push(tint(rail, METAL_D));
    // roof
    solid.push(tint(cyl(K.roomR * 0.4, K.roomR + 1.2, 2.2, x, roomY + 6.3, z, 24), 0x7a2f2a));
    {
      const eave = new THREE.TorusGeometry(K.roomR + 1.1, 0.16, 5, 40);
      eave.rotateX(Math.PI / 2);
      eave.translate(x, roomY + 5.25, z);
      glow.push(tint(eave, 0xff5a4a));
    }
    // the firing console in the middle of the floor
    solid.push(tint(cyl(1.0, 1.3, 1.2, x, roomY + 0.6, z, 10), METAL_D));
    glow.push(tint(cyl(0.8, 0.8, 0.12, x, roomY + 1.26, z, 10), 0xff5a4a));
    // lift pads, top and bottom
    glow.push(tint(cyl(1.6, 1.6, 0.1, x + Math.cos(lanceA) * 9.5, K.terraceY + 0.06, z + Math.sin(lanceA) * 9.5, 16), TEAL));
    glow.push(tint(cyl(1.3, 1.3, 0.1, x - Math.cos(lanceA) * 6.2, roomY + 0.06, z - Math.sin(lanceA) * 6.2, 16), TEAL));
    surfaces.push({ kind: 'disc', cx: x, cz: z, r: K.roomR, y: roomY });
    colliders.push({ x, z, r: K.lanceR + 1.3, top: roomY }); // the shaft, from below
    colliders.push({ x, z, r: 1.3, top: Infinity, bottom: roomY - 1 }); // the console
  }
  // The Lance itself: a turret on the roof that swings to follow your aim.
  const turret = new THREE.Group();
  turret.position.set(lance.x, roomY + 8.4, lance.z);
  const barrelPivot = new THREE.Group();
  {
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x3a3d46, metalness: 0.8, roughness: 0.35 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 2, 14), gunMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 13, 12), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 6;
    const coil = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.3, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0xff4030 })
    );
    coil.position.z = 11.5;
    barrelPivot.add(barrel, coil);
    barrelPivot.position.y = 1.4;
    turret.add(base, barrelPivot);
  }
  group.add(turret);

  // Avenues stay clear along the four axes (pad pier at 90 deg, arms at 0, 180
  // and 270) and along the four ramp diagonals.
  const clearOf = (a, half) => {
    const deg = ((a * 180) / Math.PI + 360) % 360;
    for (let g = 0; g < 360; g += 45) {
      if (Math.abs(((deg - g + 540) % 360) - 180) < half) return false;
    }
    return true;
  };
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + 0.11;
    if (!clearOf(a, 7.5)) continue;
    const r = 84 + rng() * 18;
    tower(Math.cos(a) * r, Math.sin(a) * r, 11 + rng() * 6, 22 + rng() * 50, 0, rng() < 0.35, -a);
  }
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + 0.05;
    if (!clearOf(a, 5.5) || rng() < 0.3) continue;
    const r = 134 + rng() * 16;
    tower(Math.cos(a) * r, Math.sin(a) * r, 8 + rng() * 5, 7 + rng() * 16, 0, rng() < 0.5, -a);
  }

  // ---- gardens ---------------------------------------------------------------
  const treeSpots = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r = 114;
    const gx = Math.cos(a) * r, gz = Math.sin(a) * r, gr = 9 + rng() * 3;
    detail.push(tint(cyl(gr, gr, 0.3, gx, 0.15, gz, 20), 0x4f8a3c, 0.2, rng));
    for (let t = 0; t < 9; t++) {
      const ta = rng() * Math.PI * 2, tr = Math.sqrt(rng()) * (gr - 1.5);
      treeSpots.push([gx + Math.cos(ta) * tr, 0.3, gz + Math.sin(ta) * tr, 0.8 + rng() * 0.7]);
    }
  }
  // terrace planters around the dome
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    treeSpots.push([Math.cos(a) * 27.5, K.terraceY, Math.sin(a) * 27.5, 0.7 + rng() * 0.4]);
  }

  // ---- docking arms + pad pier ----------------------------------------------
  const cablePts = [];
  function arm(a, outer, width, platR, isPad) {
    const ux = Math.cos(a), uz = Math.sin(a);
    const len = outer - K.armInner;
    const mid = K.armInner + len / 2;
    solid.push(tint(box(len, 1.4, width, ux * mid, -0.7, uz * mid, -a), METAL));
    solid.push(tint(box(len, 3, width * 0.4, ux * mid, -2.9, uz * mid, -a), METAL_D));
    surfaces.push({ kind: 'rect', cx: ux * mid, cz: uz * mid, ux, uz, hl: len / 2 + 1, hw: width / 2, yA: 0, yB: 0 });
    const px = ux * (outer + platR - 2), pz = uz * (outer + platR - 2);
    solid.push(tint(cyl(platR, platR - 2, 2.4, px, -1.2, pz, 28), isPad ? STONE_D : METAL));
    solid.push(tint(cyl(platR * 0.5, 1.5, 9, px, -6.9, pz, 12), METAL_D));
    surfaces.push({ kind: 'disc', cx: px, cz: pz, r: platR, y: 0 });
    // guide lamps down both edges of the span
    for (let s = 0; s <= 6; s++) {
      const d = K.armInner + (s / 6) * len;
      for (const side of [-1, 1]) {
        glow.push(tint(box(0.5, 0.25, 0.5, ux * d - uz * side * (width / 2 - 0.4), 0.13, uz * d + ux * side * (width / 2 - 0.4)), isPad ? TEAL : WARM));
      }
    }
    // cables: the platform hangs from the city's flank
    for (const side of [-1, 1]) {
      const from = new THREE.Vector3(px - uz * side * platR * 0.8, -2, pz + ux * side * platR * 0.8);
      const to = new THREE.Vector3(ux * 120 - uz * side * 26, -44, uz * 120 + ux * side * 26);
      const sag = from.clone().lerp(to, 0.5);
      sag.y -= 34;
      cablePts.push([from, sag, to]);
    }
    return { x: px, z: pz };
  }
  arm(0, K.armOuter, K.armWidth, K.armPlatR, false);
  arm(Math.PI, K.armOuter - 14, K.armWidth, K.armPlatR - 2, false);
  arm(-Math.PI / 2, K.armOuter + 10, K.armWidth - 1, K.armPlatR + 2, false);
  const padSpot = arm(Math.PI / 2, K.padZ - K.padR + 2, K.pierWidth, K.padR, true);
  // pad markings
  {
    const ring = new THREE.RingGeometry(K.padR - 3.2, K.padR - 2.2, 48);
    ring.rotateX(-Math.PI / 2);
    ring.translate(padSpot.x, 0.06, padSpot.z);
    glow.push(tint(ring, TEAL));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      glow.push(tint(box(0.7, 0.3, 0.7, padSpot.x + Math.cos(a) * (K.padR - 0.9), 0.15, padSpot.z + Math.sin(a) * (K.padR - 0.9)), WARM));
    }
  }
  // small craft berthed on the arm platforms, so they read as docks
  for (const [a, d] of [[0, K.armOuter + 14], [Math.PI, K.armOuter - 2]]) {
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    solid.push(tint(box(11, 3, 5, x, 2.3, z, -a + 0.4), 0x9aa3ad));
    solid.push(tint(box(4, 1.6, 9, x, 2.6, z, -a + 0.4), 0x6f7883));
    glow.push(tint(box(1, 0.8, 5.2, x - Math.cos(a - 0.4) * 5.6, 2.3, z - Math.sin(a - 0.4) * 5.6, -a + 0.4), TEAL));
    colliders.push({ x, z, r: 5.2, top: Infinity });
  }

  // ---- the raceway -------------------------------------------------------------
  // A closed ribbon on pylons, looping outside and above the rim with no
  // barriers at all. The centre line is star-shaped about the city's axis
  // (radius as a function of bearing), which makes "am I on the track" a
  // lookup by angle rather than a search. Sample i sits at bearing i degrees.
  const track = { y: K.trackY, half: K.trackHalf, n: K.trackN, pts: [], length: 0 };
  {
    const rAt = (a) => 197 + 20 * Math.sin(3 * a + 0.4) + 7 * Math.sin(5 * a);
    for (let i = 0; i < K.trackN; i++) {
      const a = (i / K.trackN) * Math.PI * 2;
      track.pts.push({ x: Math.cos(a) * rAt(a), z: Math.sin(a) * rAt(a), tx: 0, tz: 0, s: 0, curv: 0 });
    }
    for (let i = 0; i < K.trackN; i++) {
      const p0 = track.pts[(i + K.trackN - 1) % K.trackN], p1 = track.pts[(i + 1) % K.trackN];
      const dx = p1.x - p0.x, dz = p1.z - p0.z, d = Math.hypot(dx, dz);
      track.pts[i].tx = dx / d;
      track.pts[i].tz = dz / d;
    }
    for (let i = 0; i < K.trackN; i++) {
      const p = track.pts[i], q = track.pts[(i + 1) % K.trackN];
      p.s = track.length;
      track.length += Math.hypot(q.x - p.x, q.z - p.z);
      // signed turn per unit length, for the drivers' corner speed
      p.curv = (p.tx * q.tz - p.tz * q.tx) / Math.hypot(q.x - p.x, q.z - p.z);
    }
    // ribbon
    const pos = [], col = [], idx = [];
    _c.set(0x3b3f48);
    const edge = new THREE.Color(0xd8dde4);
    for (let i = 0; i <= K.trackN; i++) {
      const p = track.pts[i % K.trackN];
      const nx = -p.tz, nz = p.tx; // left of travel
      for (const [off, c] of [[-K.trackHalf, edge], [-K.trackHalf + 0.6, _c], [K.trackHalf - 0.6, _c], [K.trackHalf, edge]]) {
        pos.push(p.x + nx * off, K.trackY, p.z + nz * off);
        col.push(c.r, c.g, c.b);
      }
      if (i < K.trackN) {
        const b = i * 4;
        for (let k = 0; k < 3; k++) idx.push(b + k, b + k + 4, b + k + 1, b + k + 1, b + k + 4, b + k + 5);
      }
    }
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    top.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    top.setIndex(idx);
    top.computeVertexNormals();
    const road = new THREE.Mesh(top, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide,
    }));
    group.add(road);
    // slab segments + pylons + centre dashes
    for (let i = 0; i < K.trackN; i += 3) {
      const p = track.pts[i];
      const ang = Math.atan2(p.tz, p.tx);
      solid.push(tint(box(11, 1.2, K.trackHalf * 2 - 1, p.x, K.trackY - 0.7, p.z, -ang), METAL_D));
      if (i % 6 === 0) glow.push(tint(box(2.4, 0.08, 0.35, p.x, K.trackY + 0.05, p.z, -ang), 0xfff0c0));
      if (i % 15 === 0) {
        const r = Math.hypot(p.x, p.z);
        const inx = (p.x / r) * (K.deckR - 2), inz = (p.z / r) * (K.deckR - 2);
        // a strut from under the road back to the rim band
        const mx = (p.x + inx) / 2, mz = (p.z + inz) / 2;
        const len = Math.hypot(r - (K.deckR - 2), K.trackY + 8);
        const g = new THREE.BoxGeometry(len, 1.1, 1.6);
        g.rotateZ(Math.atan2(K.trackY + 8, r - (K.deckR - 2)));
        g.rotateY(-Math.atan2(p.z, p.x));
        g.translate(mx, (K.trackY - 1.5 - 9) / 2, mz);
        solid.push(tint(g, METAL));
      }
    }
    // start/finish gantry at sample 0
    {
      const p = track.pts[0], ang = Math.atan2(p.tz, p.tx);
      const nx = -p.tz, nz = p.tx;
      for (const side of [-1, 1]) {
        solid.push(tint(cyl(0.4, 0.5, 8, p.x + nx * side * (K.trackHalf + 0.3), K.trackY + 4, p.z + nz * side * (K.trackHalf + 0.3), 8), METAL));
      }
      solid.push(tint(box(1, 1.4, K.trackHalf * 2 + 1.4, p.x, K.trackY + 8, p.z, -ang), METAL_D));
      glow.push(tint(box(1.1, 0.5, K.trackHalf * 2, p.x, K.trackY + 8, p.z, -ang), 0xff4a6a));
      glow.push(tint(box(1.4, 0.06, K.trackHalf * 2 - 1.2, p.x, K.trackY + 0.04, p.z, -ang), 0xffffff));
    }
  }
  // The check-in booth, on the rim under the start line.
  const booth = new THREE.Vector3(Math.cos(0.2) * 158, 0, Math.sin(0.2) * 158);
  {
    solid.push(tint(box(5, 3.4, 4, booth.x, 1.7, booth.z, -0.2), 0x2f6f8f));
    solid.push(tint(box(6.4, 0.4, 5.4, booth.x, 3.6, booth.z, -0.2), METAL_D));
    glow.push(tint(box(4.2, 0.9, 0.2, booth.x - Math.cos(0.2) * 2.1, 2.5, booth.z - Math.sin(0.2) * 2.1, Math.PI / 2 - 0.2), 0xff4a6a));
    glow.push(tint(cyl(1.7, 1.7, 0.1, booth.x - Math.cos(0.2) * 5, 0.06, booth.z - Math.sin(0.2) * 5, 16), 0xff4a6a));
    colliders.push({ x: booth.x, z: booth.z, r: 3.1, top: Infinity });
  }
  const boothSpot = new THREE.Vector3(booth.x - Math.cos(0.2) * 5, 0, booth.z - Math.sin(0.2) * 5);

  // ---- merged meshes ----------------------------------------------------------
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.72 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  glowMat.color.setScalar(1.6); // over the bloom threshold
  const merged = (list, mat) => {
    const m = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false), mat);
    list.forEach((g) => g.dispose());
    return m;
  };
  group.add(merged(solid, solidMat));
  group.add(merged(glow, glowMat));
  const detailGroup = new THREE.Group(); // hidden from far away
  detailGroup.add(merged(detail, solidMat));
  group.add(detailGroup);

  // trees: one instanced canopy + one instanced trunk
  {
    const canopy = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1.7, 0),
      new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 0.9, flatShading: true }),
      treeSpots.length
    );
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.16, 0.24, 2.4, 5),
      new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 }),
      treeSpots.length
    );
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    treeSpots.forEach(([x, y, z, k], i) => {
      m.compose(p.set(x, y + 1.2 * k, z), q, s.set(k, k, k));
      trunk.setMatrixAt(i, m);
      m.compose(p.set(x, y + 3.2 * k, z), q, s.set(k, k * 1.15, k));
      canopy.setMatrixAt(i, m);
      canopy.setColorAt(i, _c.setHSL(0.27 + rng() * 0.08, 0.5, 0.26 + rng() * 0.12));
    });
    detailGroup.add(canopy, trunk);
  }

  // cables
  {
    const geos = cablePts.map(([a, b, c]) =>
      new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, b, c), 14, 0.35, 5)
    );
    const cables = new THREE.Mesh(
      mergeGeometries(geos, false),
      new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.6, metalness: 0.5 })
    );
    geos.forEach((g) => g.dispose());
    group.add(cables);
  }

  // ---- the rock underneath ------------------------------------------------------
  {
    const g = new THREE.ConeGeometry(K.deckR - 12, 150, 44, 12, true);
    g.rotateX(Math.PI); // tip down
    g.translate(0, -24 - 75, 0);
    const pos = g.attributes.position;
    const hash = (x, y, z) => {
      const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      return s - Math.floor(s);
    };
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const depth = Math.min(Math.max((-24 - v.y) / 150, 0), 1);
      // quantise so the seam vertices (duplicated around the cone) agree
      const n = hash(Math.round(v.x * 2), Math.round(v.y * 2), Math.round(v.z * 2));
      const push = 1 + (n - 0.5) * 0.36 * Math.sin(depth * Math.PI * 0.9 + 0.2);
      pos.setXYZ(i, v.x * push, v.y - n * 9 * depth, v.z * push);
    }
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    const col = new Float32Array(flat.attributes.position.count * 3);
    for (let i = 0; i < flat.attributes.position.count; i += 3) {
      const y = flat.attributes.position.getY(i);
      _c.setHSL(0.07, 0.3, 0.2 + rng() * 0.1 + Math.max(0, (y + 80) / 500));
      for (let k = 0; k < 3; k++) col.set([_c.r, _c.g, _c.b], (i + k) * 3);
    }
    flat.setAttribute('color', new THREE.BufferAttribute(col, 3));
    group.add(new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })));
    g.dispose();
  }

  // ---- thrusters -----------------------------------------------------------------
  const plumeMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      void main() {
        float along = 1.0 - vUv.y;                 // 0 at the nozzle, 1 at the tail
        float flick = 0.86 + 0.14 * sin(uTime * 23.0 + vUv.x * 40.0) * sin(uTime * 7.3);
        float a = pow(1.0 - along, 1.6) * flick;
        vec3 hot = mix(vec3(1.0, 0.55, 0.16), vec3(1.0, 0.95, 0.8), pow(1.0 - along, 4.0));
        gl_FragColor = vec4(hot * a * 2.2, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  {
    const pods = [], plumes = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.5;
      const r = i === 0 ? 0 : 62;
      const x = i === 0 ? 0 : Math.cos(a) * r, z = i === 0 ? 0 : Math.sin(a) * r;
      const top = i === 0 ? -150 : -92;
      pods.push(tint(cyl(15, 12, 34, x, top - 17, z, 18), METAL_D));
      pods.push(tint(cyl(12.5, 15.5, 8, x, top - 38, z, 18), METAL));
      const p = new THREE.CylinderGeometry(11, 3.5, 150, 18, 1, true);
      p.translate(x, top - 42 - 75, z);
      plumes.push(p);
    }
    group.add(merged(pods, solidMat));
    const plume = new THREE.Mesh(mergeGeometries(plumes, false), plumeMat);
    plumes.forEach((g) => g.dispose());
    group.add(plume);
  }

  // ---- traffic: a few shuttles circling ------------------------------------------
  const shuttles = [];
  {
    const geo = mergeGeometries([
      tint(box(2.2, 1.2, 6, 0, 0, 0), 0xaab2bb),
      tint(box(6, 0.3, 2, 0, 0, 0.8), 0x7b848f),
    ], false);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(geo, solidMat);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), glowMat);
      lamp.position.z = -3.1;
      m.add(lamp);
      shuttles.push({ m, r: 200 + rng() * 160, h: 25 + rng() * 110, w: (0.05 + rng() * 0.06) * (i % 2 ? 1 : -1), ph: rng() * 6.28 });
      detailGroup.add(m);
    }
  }

  // ---- weather: a few clouds around and above the city --------------------------
  // The heavy deck is the planet's own cloud shell, below. These are the
  // stragglers that rise through it: soft clumps drifting slowly round the city.
  const cloudRing = new THREE.Group();
  {
    const puffs = [];
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2;
      const r = 360 + rng() * 1000;
      const y = i < 7 ? 190 + rng() * 240 : -150 + rng() * 300; // a handful overhead
      const size = 20 + rng() * 32;
      const n = 5 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        puffs.push([
          Math.cos(a) * r + (rng() - 0.5) * size * 2.6,
          y + (rng() - 0.5) * size * 0.45,
          Math.sin(a) * r + (rng() - 0.5) * size * 2.6,
          size * (0.55 + rng() * 0.6),
        ]);
      }
    }
    const mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 2),
      new THREE.MeshStandardMaterial({
        color: 0xfff6e6, roughness: 1, emissive: 0xd8b890, emissiveIntensity: 0.38,
        transparent: true, opacity: 0.9, depthWrite: false,
      }),
      puffs.length
    );
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3();
    puffs.forEach(([x, y, z, k], i) => {
      m.compose(pp.set(x, y, z), q, sc.set(k, k * 0.55, k));
      mesh.setMatrixAt(i, m);
    });
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    cloudRing.add(mesh);
  }
  group.add(cloudRing);

  // ---- the dragon ----------------------------------------------------------------
  const dragon = createDragon(group, { seed: K.seed });

  // gold bounce off the clouds below, so the undersides are not black
  const fill = new THREE.HemisphereLight(0xffe2b0, 0x8a5a2a, 0.55);
  group.add(fill);

  planet.group.add(group);

  // ---- queries ----------------------------------------------------------------
  // Highest walkable surface at (x, z) that the feet could be standing on:
  // nothing more than `snap` above feetY counts. -Infinity means open air.
  function floorYAt(x, z, feetY) {
    let best = -Infinity;
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      let y;
      if (s.kind === 'disc') {
        const dx = x - s.cx, dz = z - s.cz;
        if (dx * dx + dz * dz > s.r * s.r) continue;
        y = s.y;
      } else if (s.kind === 'rect') {
        const dx = x - s.cx, dz = z - s.cz;
        const along = dx * s.ux + dz * s.uz;
        const across = -dx * s.uz + dz * s.ux;
        if (Math.abs(along) > s.hl || Math.abs(across) > s.hw) continue;
        y = s.yA + (s.yB - s.yA) * ((along + s.hl) / (2 * s.hl));
      }
      if (y <= feetY + K.snap && y > best) best = y;
    }
    if (track.y <= feetY + K.snap && track.y > best && trackAt(x, z)) best = track.y;
    return best;
  }

  // Is (x, z) over the raceway? Returns { i, lateral } (nearest centre-line
  // sample and the signed distance left of it), or null. Sample i is at
  // bearing i degrees, so only the few samples around the point's own bearing
  // can be nearest.
  const _trackHit = { i: 0, lateral: 0 };
  function trackAt(x, z) {
    const r = Math.hypot(x, z);
    if (r < 150 || r > 245) return null;
    let a = Math.atan2(z, x);
    if (a < 0) a += Math.PI * 2;
    const i0 = Math.round((a / (Math.PI * 2)) * track.n);
    let bestD = Infinity, bi = 0;
    for (let k = -4; k <= 4; k++) {
      const i = (i0 + k + track.n) % track.n;
      const p = track.pts[i];
      const d = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
      if (d < bestD) { bestD = d; bi = i; }
    }
    const p = track.pts[bi];
    const lateral = -(x - p.x) * p.tz + (z - p.z) * p.tx;
    if (Math.abs(lateral) > track.half) return null;
    _trackHit.i = bi;
    _trackHit.lateral = lateral;
    return _trackHit;
  }

  const _cam = new THREE.Vector3();
  let flashT = 3;
  function update(dt, t, camWorld) {
    plumeMat.uniforms.uTime.value = t;
    if (camWorld) {
      group.getWorldPosition(_cam);
      detailGroup.visible = _cam.distanceToSquared(camWorld) < 5000 * 5000;
    }
    cloudRing.rotation.y = t * 0.004;
    // Lightning from the storm below throws a cold flicker up the city's flanks.
    flashT -= dt;
    if (flashT < -0.45) flashT = 2.5 + Math.random() * 7;
    const fl = flashT < 0 ? Math.exp(flashT * 9) * (0.6 + 0.4 * Math.sin(flashT * 70)) : 0;
    fill.intensity = 0.55 + fl * 2.2;
    fill.groundColor.setRGB(0.54 + fl * 0.4, 0.35 + fl * 0.6, 0.16 + fl * 0.9);
    cloudRing.visible = detailGroup.visible; // far too small to matter from orbit
    dragon.update(dt, t, detailGroup.visible);
    if (!detailGroup.visible) return;
    for (const s of shuttles) {
      const a = s.ph + t * s.w;
      s.m.position.set(Math.cos(a) * s.r, s.h, Math.sin(a) * s.r);
      s.m.rotation.y = -a + (s.w > 0 ? Math.PI : 0);
    }
  }

  return {
    group,
    planet,
    surfaces,
    colliders,
    floorYAt,
    update,
    snap: K.snap,
    deckR: K.deckR,
    terraceR: K.terraceR,
    terraceY: K.terraceY,
    track,
    trackAt,
    dragon,
    booth: boothSpot,
    // the Lance Tower: lift pads, the gallery the walker is held inside, the gun
    lance: {
      bottom: new THREE.Vector3(lance.x + Math.cos(lanceA) * 9.5, K.terraceY, lance.z + Math.sin(lanceA) * 9.5),
      top: new THREE.Vector3(lance.x - Math.cos(lanceA) * 6.2, roomY, lance.z - Math.sin(lanceA) * 6.2),
      room: { x: lance.x, z: lance.z, r: K.roomR - 0.9, y: roomY },
      turret,
      barrelPivot,
    },
    pad: new THREE.Vector3(padSpot.x, 0, padSpot.z),
    padR: K.padR,
    // where someone stepping out of the hatch stands: on the pad, city side
    spawn: new THREE.Vector3(padSpot.x - 8, 0, padSpot.z - 4),
  };
}
