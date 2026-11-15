/**
 * embermine.js — the Emberdeep: the mine under Redline Claim (rustia), and the
 * cathedral its miners carved out of the ember ore between shifts.
 *
 * A self-contained FLAT world, like world/cottage.js: +Y up everywhere, the
 * cage landing at the local origin, the workings running out along +Z. The
 * host (src/mineWalk.js) parents `group` at the scene root, hides the planet,
 * and walks it with its own flat controller — nothing here knows about
 * planets, spin or the floating origin.
 *
 *   y = 0..SHAFT_H   the shaft: a 4.8 m square of rough rock the cage rides
 *   z   3..14        pit-bottom station
 *   z  14..44        haulage tunnel, with the working STOPE off its +X side
 *                    (the live seam — this is where the ore is picked up)
 *   z  44..53        narthex
 *   z  54..134       nave + side aisles, ten 8 m bays, three chapels a side
 *   z 134..144       chancel, altar, the Heart-ember, the great east window
 *
 * The look is warm emissive ore against dark rock, with bloom doing the
 * lifting — in the spirit of the salt cathedrals (Wieliczka, Zipaquirá),
 * where every carving is lit from behind or below and the rock itself glows.
 * Twelve point lights, none shadowed, held constant so no program recompiles.
 *
 * Everything is procedural and seeded; geometry is merged to one mesh per
 * material (the building is mirror-symmetric about x = 0, so half of it is
 * authored and the other half is a winding-corrected mirror). Collision is
 * inside-out: the walker must stay inside a union of room rectangles, and out
 * of a short list of obstacle boxes and circles (columns, pews, altars).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SHAFT_H = 120; // cage travel, top landing to pit bottom
const SHAFT_HW = 2.4; // shaft half-width
const CAGE_HW = 1.5; // cage interior half-width
const CAGE_CEIL = 2.7;

const NAVE_Z0 = 54;
const BAY = 8;
const BAYS = 10;
const NAVE_Z1 = NAVE_Z0 + BAY * BAYS; // 134
const END_Z = 144; // east wall
const NAVE_HW = 6.2; // clear nave half-width (arcade wall inner face)
const ARC_T = 1.6; // arcade wall thickness
const AISLE_X1 = 15; // aisle outer wall, inner face
const CAP_Y = 8.25; // column capital top / arcade spring
const VAULT_SPRING = 20;
const VAULT_APEX = 28;
const ARC_APEX = 12.9; // arcade arch apex
// The aisle vault springs just under the arcade apex: any lower and its mass
// would show through the top of every arcade arch from the nave.
const AISLE_SPRING = 11.8;
const AISLE_APEX = 14.6;
const AISLE_TOP = 15.4;
const CHAPEL_BAYS = [1, 4, 7];

const EMBER = 0xff5a14;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cheap lattice value noise — the rough-hewn walls and the canvas textures.
function h3(i, j, k) {
  let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1440662683);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), xf), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), xf), yf),
    l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), xf), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), xf), yf),
    zf
  );
}

// ---------------------------------------------------------------------------
// Canvas textures: a tileable rock normal map, the glowing vein network, and
// the mottled translucent-ore map the backlit "windows" use.
// ---------------------------------------------------------------------------
function tileNoise(x, y, period, seed) {
  // value noise that wraps at `period` lattice cells
  const xi = Math.floor(x), yi = Math.floor(y);
  let xf = x - xi, yf = y - yi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
  const w = (i) => ((i % period) + period) % period;
  const a = h3(w(xi), w(yi), seed), b = h3(w(xi + 1), w(yi), seed);
  const c = h3(w(xi), w(yi + 1), seed), d = h3(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

function makeRockNormal() {
  const N = 256;
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let h = 0, amp = 1, per = 8;
      for (let o = 0; o < 5; o++) {
        h += amp * tileNoise((x / N) * per, (y / N) * per, per, 11 + o);
        amp *= 0.5; per *= 2;
      }
      // chisel strokes: fine diagonal striations the carvers left
      // (kept coarse and faint: a fine, strong stroke pattern aliases into moire across a wall 80 m long)
      h += 0.035 * Math.sin(((x + y) / N) * Math.PI * 2 * 7 + tileNoise((x / N) * 6, (y / N) * 6, 6, 31) * 5);
      H[y * N + x] = h;
    }
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  const at = (x, y) => H[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.2;
      const il = 1 / Math.hypot(dx, dy, 1);
      const i = (y * N + x) * 4;
      img.data[i] = (-dx * il * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy * il * 0.5 + 0.5) * 255;
      img.data[i + 2] = (il * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Branching glow lines on black. Drawn nine times at wrapped offsets so the
// tile repeats without a seam. `count` sets how veined the rock is.
function makeVeinMap(seed, count) {
  const N = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, N, N);
  const rng = mulberry32(seed);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const strokes = [];
  const grow = (x, y, ang, len, w, depth) => {
    const pts = [[x, y]];
    const steps = Math.ceil(len / 9);
    for (let i = 0; i < steps; i++) {
      ang += (rng() - 0.5) * 0.75;
      x += Math.cos(ang) * 9; y += Math.sin(ang) * 9;
      pts.push([x, y]);
      if (depth < 2 && rng() < 0.16) grow(x, y, ang + (rng() < 0.5 ? 1 : -1) * (0.5 + rng() * 0.7), len * 0.45, w * 0.6, depth + 1);
    }
    strokes.push({ pts, w });
  };
  for (let i = 0; i < count; i++) grow(rng() * N, rng() * N, rng() * Math.PI * 2, 110 + rng() * 240, 0.5 + rng() * 0.9, 0);
  const pass = (width, color, blur) => {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.strokeStyle = color;
    for (const s of strokes) {
      ctx.lineWidth = s.w * width;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          ctx.beginPath();
          ctx.moveTo(s.pts[0][0] + ox * N, s.pts[0][1] + oy * N);
          for (let k = 1; k < s.pts.length; k++) ctx.lineTo(s.pts[k][0] + ox * N, s.pts[k][1] + oy * N);
          ctx.stroke();
        }
      }
    }
  };
  pass(2.2, 'rgba(140,40,8,0.25)', 4); // the heat soaking into the rock
  pass(1.0, 'rgba(255,104,22,0.95)', 1.5); // the vein
  pass(0.3, 'rgba(255,190,100,1)', 0); // its hot core
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Thin-carved ore lit from behind: cloudy amber with darker inclusions and
// brighter crystal faces.
function makePaneMap() {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let h = 0, amp = 0.55, per = 4;
      for (let o = 0; o < 4; o++) { h += amp * tileNoise((x / N) * per, (y / N) * per, per, 71 + o); amp *= 0.5; per *= 2; }
      const facets = tileNoise((x / N) * 24, (y / N) * 24, 24, 91) > 0.72 ? 0.25 : 0;
      const v = Math.min(1, Math.max(0, (h - 0.25) * 1.5 + facets));
      const i = (y * N + x) * 4;
      img.data[i] = 90 + 165 * v;
      img.data[i + 1] = 14 + 150 * v * v;
      img.data[i + 2] = 2 + 60 * v * v * v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeInscription(lines) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff6a1a';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffb36a';
  ctx.font = '600 44px Georgia, serif';
  ctx.fillText(lines[0], 512, 44);
  ctx.font = '26px Georgia, serif';
  ctx.fillText(lines[1], 512, 96);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// Geometry plumbing
// ---------------------------------------------------------------------------

// Every part is normalised to non-indexed position/normal/uv so any mix of
// box, lathe, extrude and hand-built geometry merges.
function prep(g) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  for (const k of Object.keys(n.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') n.deleteAttribute(k);
  }
  if (!n.attributes.uv) {
    n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((n.attributes.position.count) * 2), 2));
  }
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}

// Ore is drawn UNLIT, with a colour per facet: each face's glow is set from
// which way it points (plus a little noise), from deep red through ember to
// near white. An evenly emissive crystal reads as a flat orange cut-out; a
// crystal whose faces differ reads as a crystal, with no light needed — and
// only the brightest faces clear the bloom threshold, so they sparkle.
const _fl = new THREE.Vector3(0.36, 0.78, -0.5).normalize();
function facet(g) {
  const p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    // face normal from the corners: correct whatever the authored normals are
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    const ux = p.getX(i + 1) - ax, uy = p.getY(i + 1) - ay, uz = p.getZ(i + 1) - az;
    const vx = p.getX(i + 2) - ax, vy = p.getY(i + 2) - ay, vz = p.getZ(i + 2) - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const d = Math.max(0, nx * _fl.x + ny * _fl.y + nz * _fl.z);
    const r = h3(Math.round(ax * 97), Math.round(ay * 89 + i), Math.round(az * 83));
    const b = Math.min(1, 0.1 + 0.75 * d * d + 0.3 * r); // 0 dark .. 1 hot
    // dark ember -> ember -> white-hot
    const cr = b < 0.5 ? 0.45 + 1.4 * b : 1.15 + 0.9 * (b - 0.5);
    const cg = b < 0.5 ? 0.06 + 0.5 * b : 0.31 + 0.66 * (b - 0.5);
    const cb = b < 0.5 ? 0.01 + 0.07 * b : 0.045 + 0.18 * (b - 0.5);
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = cr; col[(i + k) * 3 + 1] = cg; col[(i + k) * 3 + 2] = cb;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Mirror across x = 0. A reflection reverses winding, so swap two corners of
// every triangle to keep the faces front-facing.
function mirrorX(g) {
  const m = g.clone();
  m.scale(-1, 1, 1);
  for (const k of Object.keys(m.attributes)) {
    const a = m.attributes[k];
    const s = a.itemSize;
    const arr = a.array;
    for (let i = 0; i < a.count; i += 3) {
      for (let c = 0; c < s; c++) {
        const t = arr[(i + 1) * s + c];
        arr[(i + 1) * s + c] = arr[(i + 2) * s + c];
        arr[(i + 2) * s + c] = t;
      }
    }
  }
  return m;
}

// World-scaled box-projected UVs, so one rock texture reads at one scale on
// every wall, vault and column regardless of how the part was authored.
function boxUV(g, scale) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u * scale, v * scale);
  }
}

// Pointed (two-centred) arch from the path's current point (u0, spring) over
// the apex to (u1, spring). Works in either direction.
function archTo(path, u0, u1, spring, apex) {
  const um = (u0 + u1) / 2;
  const k = spring + (apex - spring) * 0.74;
  path.quadraticCurveTo(u0, k, um, apex);
  path.quadraticCurveTo(u1, k, u1, spring);
}

// A closed lancet outline (for holes and glowing panels).
function lancetPath(u0, u1, bottom, spring, apex) {
  const p = new THREE.Path();
  p.moveTo(u0, bottom);
  p.lineTo(u0, spring);
  archTo(p, u0, u1, spring, apex);
  p.lineTo(u1, bottom);
  p.closePath();
  return p;
}
function lancetShape(u0, u1, bottom, spring, apex) {
  const s = new THREE.Shape();
  s.moveTo(u0, bottom);
  s.lineTo(u0, spring);
  archTo(s, u0, u1, spring, apex);
  s.lineTo(u1, bottom);
  s.closePath();
  return s;
}

// The band between an arch and a slightly smaller one inside it: ribs,
// archivolts, the carved frames round every opening.
function archBand(u0, u1, spring, apex, t) {
  const s = new THREE.Shape();
  s.moveTo(u0, spring);
  archTo(s, u0, u1, spring, apex);
  s.lineTo(u1 - t, spring);
  archTo(s, u1 - t, u0 + t, spring, apex - t * 1.25);
  s.closePath();
  return s;
}

const EXTR = (depth) => ({ depth, bevelEnabled: false, curveSegments: 10 });

// A shape drawn in the (z, y) plane, extruded toward -x from x = xMax.
function extrudeAlongX(shape, depth, xMax) {
  const g = new THREE.ExtrudeGeometry(shape, EXTR(depth));
  g.rotateY(-Math.PI / 2); // shape X -> world Z, extrusion -> world -X
  g.translate(xMax, 0, 0);
  return g;
}
// A shape drawn in the (x, y) plane, extruded toward +z from z = z0.
function extrudeAlongZ(shape, depth, z0) {
  const g = new THREE.ExtrudeGeometry(shape, EXTR(depth));
  g.translate(0, 0, z0);
  return g;
}

/**
 * @param opts { seed }
 */
export function createEmberMine(opts = {}) {
  const seed = opts.seed ?? 0xe3b3d33b;
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'emberdeep';

  const owned = []; // geometries, materials, textures — disposed together
  const own = (x) => { owned.push(x); return x; };

  // ---- materials ---------------------------------------------------------
  const rockNormal = own(makeRockNormal());
  // Veins are drawn at half the rock texture's frequency (each map carries
  // its own UV transform), so a tile of them spans 11-14 m of wall: sparse
  // enough that the ROCK is what you see, with fire running through it.
  const veinsSparse = own(makeVeinMap(seed ^ 0x51, 4));
  const veinsRich = own(makeVeinMap(seed ^ 0x77, 7));
  veinsSparse.repeat.set(0.5, 0.5);
  veinsRich.repeat.set(0.5, 0.5);
  const paneMap = own(makePaneMap());

  const MATS = {
    // the mine: blasted and picked, faceted, the odd vein showing
    rough: new THREE.MeshStandardMaterial({
      color: 0x6b5448, roughness: 0.96, metalness: 0, flatShading: true,
      normalMap: rockNormal, normalScale: new THREE.Vector2(0.9, 0.9),
      emissive: 0xffffff, emissiveMap: veinsSparse, emissiveIntensity: 0.7,
    }),
    // the shaft: as rough, but cut straight through the ore body — veined
    // like the cathedral, so the ride down shows what the claim is sitting on
    shaft: new THREE.MeshStandardMaterial({
      color: 0x5a463c, roughness: 0.96, metalness: 0, flatShading: true,
      normalMap: rockNormal, normalScale: new THREE.Vector2(0.9, 0.9),
      emissive: 0xffffff, emissiveMap: veinsRich, emissiveIntensity: 1.15,
    }),
    // the cathedral: the same rock, dressed smooth — and far richer in ore,
    // which is why they carved here
    smooth: new THREE.MeshStandardMaterial({
      color: 0x8c6c5c, roughness: 0.8, metalness: 0,
      normalMap: rockNormal, normalScale: new THREE.Vector2(0.55, 0.55),
      emissive: 0xffffff, emissiveMap: veinsRich, emissiveIntensity: 0.6,
    }),
    floor: new THREE.MeshStandardMaterial({
      color: 0x6a5246, roughness: 0.3, metalness: 0.15,
      normalMap: rockNormal, normalScale: new THREE.Vector2(0.25, 0.25),
    }),
    // unlit, coloured per facet (see facet()); `color` is the slow pulse
    ore: new THREE.MeshBasicMaterial({ vertexColors: true }),
    // backlit carved ore: the clerestory, the chapel reliefs, the great window
    pane: new THREE.MeshStandardMaterial({
      color: 0x1c0802, roughness: 0.6, emissive: 0xffffff, emissiveMap: paneMap, emissiveIntensity: 0.95,
    }),
    paneBig: new THREE.MeshStandardMaterial({
      color: 0x1c0802, roughness: 0.6, emissive: 0xffffff, emissiveMap: paneMap, emissiveIntensity: 1.2,
    }),
    // HDR basics: lamp cores and floor inlay. Above 1.0 on purpose — these
    // are what the bloom pass is looking for.
    hot: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 1.7, 0.7) }),
    inlay: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.36, 0.07) }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1d1b1b, roughness: 0.55, metalness: 0.85 }),
    timber: new THREE.MeshStandardMaterial({ color: 0x5a3f28, roughness: 0.92, metalness: 0 }),
  };
  for (const m of Object.values(MATS)) own(m);
  const ROCKY = { rough: 1 / 5.5, shaft: 1 / 5, smooth: 1 / 7, floor: 1 / 4, pane: 1 / 3.2, paneBig: 1 / 4.5 };

  // ---- buckets: B = as authored, S = authored at +x and mirrored ----------
  const B = {}, S = {};
  const put = (bk, mat, g) => { const n = prep(g); (bk[mat] ||= []).push(mat === 'ore' ? facet(n) : n); };
  const box = (bk, mat, x0, x1, y0, y1, z0, z1) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    put(bk, mat, g);
  };
  const at = (g, x, y, z, ry = 0, rx = 0, rz = 0) => {
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return g;
  };
  // an ore crystal: a stretched octahedron, tilted
  const crystal = (bk, mat, x, y, z, r, len, tilt = 0, yaw = 0) => {
    const g = new THREE.OctahedronGeometry(r, 0);
    g.scale(1, len / r, 1);
    put(bk, mat, at(g, x, y, z, yaw, tilt));
  };

  // Rough-hewn rock face: a grid pushed in and out by 3D noise. Edges are
  // pinned to the authored plane so neighbouring faces meet without a crack.
  // axisU x axisV must point INTO the room.
  const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
  let roughMat = 'rough'; // which bucket roughQuad fills (switched for the shaft)
  function roughQuad(ox, oy, oz, axisU, lenU, axisV, lenV, amp = 0.38, cell = 1.15) {
    const u = AX[axisU], v = AX[axisV];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const su = Math.max(1, Math.round(lenU / cell)), sv = Math.max(1, Math.round(lenV / cell));
    const P = new Float32Array((su + 1) * (sv + 1) * 3);
    for (let j = 0; j <= sv; j++) {
      for (let i = 0; i <= su; i++) {
        const a = (i / su) * lenU, b = (j / sv) * lenV;
        let x = ox + u[0] * a + v[0] * b, y = oy + u[1] * a + v[1] * b, z = oz + u[2] * a + v[2] * b;
        const edge = Math.min(1, Math.min(a, lenU - a, b, lenV - b) / 0.9);
        const d = (vnoise(x * 0.42 + 7, y * 0.42 + 3, z * 0.42 + 11) * 0.7 + vnoise(x * 1.3, y * 1.3, z * 1.3) * 0.3 - 0.42) * amp * 2 * edge;
        x -= nx * d; y -= ny * d; z -= nz * d; // dig away from the room, mostly
        const k = (j * (su + 1) + i) * 3;
        P[k] = x; P[k + 1] = y; P[k + 2] = z;
      }
    }
    const out = new Float32Array(su * sv * 18);
    let o = 0;
    const w = (k) => { out[o++] = P[k * 3]; out[o++] = P[k * 3 + 1]; out[o++] = P[k * 3 + 2]; };
    for (let j = 0; j < sv; j++) {
      for (let i = 0; i < su; i++) {
        const p00 = j * (su + 1) + i, p10 = p00 + 1, p01 = p00 + su + 1, p11 = p01 + 1;
        w(p00); w(p10); w(p11);
        w(p00); w(p11); w(p01);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    g.computeVertexNormals();
    // Guard the winding: the first face must look along the intended normal.
    _a.fromArray(out, 0); _b.fromArray(out, 3); _c.fromArray(out, 6);
    _b.sub(_a); _c.sub(_a); _b.cross(_c);
    if (_b.x * nx + _b.y * ny + _b.z * nz < 0) {
      for (let i = 0; i < out.length; i += 9) {
        for (let c = 0; c < 3; c++) { const t = out[i + 3 + c]; out[i + 3 + c] = out[i + 6 + c]; out[i + 6 + c] = t; }
      }
      g.computeVertexNormals();
    }
    put(B, roughMat, g);
  }
  // room-facing shorthands (the comment is the way the face LOOKS)
  const wallPX = (x, y0, y1, z0, z1, amp) => roughQuad(x, y0, z0, 'y', y1 - y0, 'z', z1 - z0, amp); // faces +x
  const wallNX = (x, y0, y1, z0, z1, amp) => roughQuad(x, y0, z0, 'z', z1 - z0, 'y', y1 - y0, amp); // faces -x
  const wallPZ = (z, x0, x1, y0, y1, amp) => roughQuad(x0, y0, z, 'x', x1 - x0, 'y', y1 - y0, amp); // faces +z
  const wallNZ = (z, x0, x1, y0, y1, amp) => roughQuad(x0, y0, z, 'y', y1 - y0, 'x', x1 - x0, amp); // faces -z
  const ceil = (y, x0, x1, z0, z1, amp) => roughQuad(x0, y, z0, 'x', x1 - x0, 'z', z1 - z0, amp); // faces -y

  // ---- collision ----------------------------------------------------------
  // Rooms: the walker's CENTRE must be inside one of these. [x0, x1, z0, z1, ceiling]
  const rooms = [];
  const room = (x0, x1, z0, z1, ceilY) => rooms.push([x0, x1, z0, z1, ceilY]);
  const obBox = []; // obstacles: [x0, x1, z0, z1]
  const obCyl = []; // obstacles: [x, z, r]
  const solidBox = (x0, x1, z0, z1) => obBox.push([x0, x1, z0, z1]);
  const solidBoxSym = (x0, x1, z0, z1) => { solidBox(x0, x1, z0, z1); solidBox(-x1, -x0, z0, z1); };
  const solidCyl = (x, z, r) => obCyl.push([x, z, r]);
  const solidCylSym = (x, z, r) => { solidCyl(x, z, r); solidCyl(-x, z, r); };

  const lights = [];
  const lamp = (color, intensity, range, x, y, z, parent = group) => {
    const l = new THREE.PointLight(color, intensity, range, 2);
    l.position.set(x, y, z);
    parent.add(l);
    lights.push(l);
    return l;
  };

  // =========================================================================
  // THE SHAFT
  // =========================================================================
  const TOP = SHAFT_H + 7;
  roughMat = 'shaft';
  wallPX(-SHAFT_HW, 0, TOP, -SHAFT_HW, SHAFT_HW, 0.3);
  wallNX(SHAFT_HW, 0, TOP, -SHAFT_HW, SHAFT_HW, 0.3);
  wallPZ(-SHAFT_HW, -SHAFT_HW, SHAFT_HW, 0, TOP, 0.3);
  wallNZ(SHAFT_HW, -SHAFT_HW, SHAFT_HW, 3.4, TOP, 0.3); // open to the station below 3.4
  roughMat = 'rough';
  box(B, 'floor', -SHAFT_HW, SHAFT_HW, -0.6, -0.02, -SHAFT_HW, SHAFT_HW);
  // steel sets every 6 m, guide rails full height
  for (let y = 6; y < TOP; y += 6) {
    box(B, 'iron', -SHAFT_HW + 0.02, SHAFT_HW - 0.02, y - 0.1, y + 0.1, -SHAFT_HW + 0.02, -SHAFT_HW + 0.2);
    box(B, 'iron', -SHAFT_HW + 0.02, SHAFT_HW - 0.02, y - 0.1, y + 0.1, SHAFT_HW - 0.2, SHAFT_HW - 0.02);
    box(B, 'iron', -SHAFT_HW + 0.02, -SHAFT_HW + 0.2, y - 0.1, y + 0.1, -SHAFT_HW, SHAFT_HW);
    box(B, 'iron', SHAFT_HW - 0.2, SHAFT_HW - 0.02, y - 0.1, y + 0.1, -SHAFT_HW, SHAFT_HW);
  }
  for (const sx of [-1, 1]) box(B, 'iron', sx * 1.95 - 0.06, sx * 1.95 + 0.06, 0, TOP, -0.08, 0.08);
  // shaft lamps: caged bulbs, alternating walls. Pure emissive — the cage
  // carries the one real light, so the walls brighten as it passes.
  for (let y = 9, i = 0; y < SHAFT_H; y += 12, i++) {
    const sx = i % 2 ? 1 : -1;
    box(B, 'hot', sx * 2.2 - 0.07, sx * 2.2 + 0.07, y - 0.16, y + 0.16, -1.3, -1.0);
    box(B, 'iron', sx * 2.28 - 0.1, sx * 2.28 + 0.1, y + 0.18, y + 0.26, -1.4, -0.9);
  }
  // Ore showing in the walls — thin near the top, thick near the bottom: the
  // ride down is the first sight of what the town is here for.
  for (let i = 0; i < 120; i++) {
    const depth01 = Math.pow(rng(), 0.55); // biased deep
    const y = SHAFT_H + 2 - depth01 * (SHAFT_H - 4);
    const side = Math.floor(rng() * 4);
    const t = (rng() - 0.5) * 3.8;
    const n = 2 + Math.floor(rng() * 4 * (0.4 + depth01));
    for (let k = 0; k < n; k++) {
      const off = (rng() - 0.5) * 0.9, oy = (rng() - 0.5) * 1.0;
      // (half-length capped: the cage passes 0.7 m from these walls)
      const r = 0.09 + rng() * 0.2 * (0.5 + depth01), len = Math.min(0.5, r * (1.6 + rng() * 2.4));
      const tilt = 1.1 + rng() * 0.8, yaw = rng() * 6.28;
      // keep the cage door wall (+z) clear below the lintel
      if (side === 0) crystal(B, 'ore', -SHAFT_HW + 0.12, y + oy, t + off, r, len, tilt, yaw);
      else if (side === 1) crystal(B, 'ore', SHAFT_HW - 0.12, y + oy, t + off, r, len, tilt, yaw);
      else if (side === 2) crystal(B, 'ore', t + off, y + oy, -SHAFT_HW + 0.12, r, len, tilt, yaw);
      else if (y > 5) crystal(B, 'ore', t + off, y + oy, SHAFT_HW - 0.12, r, len, tilt, yaw);
    }
  }
  // Daylight at the collar: a pale disc that shrinks to a star as you descend.
  {
    const sky = new THREE.Mesh(
      own(new THREE.PlaneGeometry(SHAFT_HW * 2, SHAFT_HW * 2)),
      own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.7, 1.5), fog: false }))
    );
    sky.rotation.x = Math.PI / 2;
    sky.position.y = TOP - 0.2;
    group.add(sky);
  }

  // ---- the cage (moves) ---------------------------------------------------
  const cage = new THREE.Group();
  cage.name = 'cage';
  group.add(cage);
  const cageGate = new THREE.Group(); // the +z gate: lifts when parked
  cage.add(cageGate);
  {
    const parts = { iron: [], hot: [] };
    const cb = (mat, x0, x1, y0, y1, z0, z1) => {
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      parts[mat].push(prep(g));
    };
    const W = CAGE_HW + 0.12;
    cb('iron', -W, W, -0.12, 0, -W, W); // deck
    // roof: a grating, not a plate — looking UP the shaft at the rope, the
    // sets going past and the daylight shrinking is half the ride
    for (const s of [-1, 1]) {
      cb('iron', -W, W, CAGE_CEIL, CAGE_CEIL + 0.1, s * W - 0.07, s * W + 0.07);
      cb('iron', s * W - 0.07, s * W + 0.07, CAGE_CEIL, CAGE_CEIL + 0.1, -W, W);
    }
    for (let i = -2; i <= 2; i++) {
      if (i !== 0) cb('iron', i * 0.54 - 0.025, i * 0.54 + 0.025, CAGE_CEIL + 0.02, CAGE_CEIL + 0.08, -W, W);
    }
    cb('iron', -W, W, CAGE_CEIL, CAGE_CEIL + 0.1, -0.2, 0.2); // crosshead beam
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cb('iron', sx * W - 0.07, sx * W + 0.07, 0, CAGE_CEIL, sz * W - 0.07, sz * W + 0.07);
    // mesh sides: bars on three walls, a waist rail
    for (let i = -4; i <= 4; i++) {
      const t = (i / 4.6) * W;
      for (const sx of [-1, 1]) cb('iron', sx * W - 0.02, sx * W + 0.02, 0, CAGE_CEIL, t - 0.02, t + 0.02);
      cb('iron', t - 0.02, t + 0.02, 0, CAGE_CEIL, -W - 0.02, -W + 0.02);
    }
    for (const sx of [-1, 1]) cb('iron', sx * W - 0.04, sx * W + 0.04, 1.05, 1.15, -W, W);
    cb('iron', -W, W, 1.05, 1.15, -W - 0.04, -W + 0.04);
    // crosshead + bulb
    cb('iron', -0.2, 0.2, CAGE_CEIL + 0.1, CAGE_CEIL + 0.7, -0.2, 0.2);
    cb('hot', -0.22, 0.22, CAGE_CEIL - 0.1, CAGE_CEIL - 0.02, -0.22, 0.22);
    for (const k of Object.keys(parts)) {
      const m = new THREE.Mesh(own(mergeGeometries(parts[k], false)), MATS[k]);
      m.frustumCulled = false; // rides the walker; never out of view
      cage.add(m);
      for (const g of parts[k]) g.dispose();
    }
    const gparts = [];
    for (let i = -4; i <= 4; i++) {
      const t = (i / 4.6) * W;
      const g = new THREE.BoxGeometry(0.04, 2.1, 0.04);
      g.translate(t, 1.05, W);
      gparts.push(prep(g));
    }
    for (const y of [0.05, 1.1, 2.1]) {
      const g = new THREE.BoxGeometry(W * 2, 0.06, 0.06);
      g.translate(0, y, W);
      gparts.push(prep(g));
    }
    const gm = new THREE.Mesh(own(mergeGeometries(gparts, false)), MATS.iron);
    gm.frustumCulled = false;
    cageGate.add(gm);
    for (const g of gparts) g.dispose();
  }
  // hoist rope: unit-height, scaled each frame to reach the headgear
  const rope = new THREE.Mesh(own(new THREE.CylinderGeometry(0.035, 0.035, 1, 6)), MATS.iron);
  rope.frustumCulled = false;
  cage.add(rope);
  const cageLight = lamp(0xffb070, 15, 16, 0, CAGE_CEIL - 0.5, 0, cage);

  // =========================================================================
  // PIT-BOTTOM STATION  (z 2.4..14, x ±6, 5.5 high)
  // =========================================================================
  const ST = { hw: 6, z0: SHAFT_HW, z1: 14, h: 5.5 };
  wallPZ(ST.z0, -ST.hw, -SHAFT_HW, 0, ST.h);
  wallPZ(ST.z0, SHAFT_HW, ST.hw, 0, ST.h);
  wallPZ(ST.z0, -SHAFT_HW, SHAFT_HW, 3.4, ST.h, 0.15);
  wallPX(-ST.hw, 0, ST.h, ST.z0, ST.z1);
  wallNX(ST.hw, 0, ST.h, ST.z0, ST.z1);
  ceil(ST.h, -ST.hw, ST.hw, ST.z0, ST.z1);
  const TUN = { hw: 2.8, z0: 14, z1: 44, h: 4.4 };
  wallNZ(ST.z1, -ST.hw, -TUN.hw, 0, ST.h);
  wallNZ(ST.z1, TUN.hw, ST.hw, 0, ST.h);
  wallNZ(ST.z1, -TUN.hw, TUN.hw, TUN.h, ST.h, 0.15);
  // shaft portal frame
  box(B, 'iron', -SHAFT_HW - 0.2, -SHAFT_HW + 0.1, 0, 3.6, ST.z0 - 0.1, ST.z0 + 0.25);
  box(B, 'iron', SHAFT_HW - 0.1, SHAFT_HW + 0.2, 0, 3.6, ST.z0 - 0.1, ST.z0 + 0.25);
  box(B, 'iron', -SHAFT_HW - 0.2, SHAFT_HW + 0.2, 3.4, 3.75, ST.z0 - 0.1, ST.z0 + 0.25);
  box(B, 'hot', -0.5, 0.5, 3.75, 3.87, ST.z0 + 0.05, ST.z0 + 0.2);
  // signal box + bell wire, crates, a bench
  box(B, 'iron', -5.7, -5.2, 0.9, 2.0, 5, 5.8);
  box(B, 'hot', -5.19, -5.17, 1.5, 1.7, 5.2, 5.4);
  box(B, 'timber', 3.6, 5.2, 0, 0.9, 4.2, 5.6);
  box(B, 'timber', 4.0, 5.0, 0.9, 1.6, 4.5, 5.4);
  box(B, 'timber', -5.4, -4.6, 0, 0.5, 9, 12.4);
  solidBox(3.6, 5.2, 4.2, 5.6);
  solidBox(-5.4, -4.6, 9, 12.4);
  lamp(0xffa560, 70, 24, 0, 4.4, 8.5);
  box(B, 'hot', -0.16, 0.16, 4.9, 5.1, 8.3, 8.7);
  box(B, 'iron', -0.3, 0.3, 5.1, 5.2, 8.1, 8.9);
  room(-ST.hw + 0.5, ST.hw - 0.5, ST.z0 + 0.5, ST.z1 - 0.3, ST.h);

  // =========================================================================
  // HAULAGE TUNNEL (z 14..44) + THE STOPE off its +x wall (z 24..33)
  // =========================================================================
  const STOPE = { x1: 11.5, z0: 24, z1: 33, h: 5.2 };
  wallPX(-TUN.hw, 0, TUN.h, TUN.z0, TUN.z1);
  wallNX(TUN.hw, 0, TUN.h, TUN.z0, STOPE.z0);
  wallNX(TUN.hw, 0, TUN.h, STOPE.z1, TUN.z1);
  ceil(TUN.h, -TUN.hw, TUN.hw, TUN.z0, TUN.z1, 0.3);
  // timber sets: two legs and a cap every 3 m; a caged bulb on every other cap
  for (let z = TUN.z0 + 1.5, i = 0; z < TUN.z1; z += 3, i++) {
    const inStope = z > STOPE.z0 && z < STOPE.z1;
    box(B, 'timber', -TUN.hw + 0.05, -TUN.hw + 0.4, 0, TUN.h - 0.5, z - 0.17, z + 0.17);
    if (!inStope) box(B, 'timber', TUN.hw - 0.4, TUN.hw - 0.05, 0, TUN.h - 0.5, z - 0.17, z + 0.17);
    box(B, 'timber', -TUN.hw + 0.05, TUN.hw - 0.05, TUN.h - 0.5, TUN.h - 0.15, z - 0.2, z + 0.2);
    if (i % 2 === 0) {
      box(B, 'hot', -0.1, 0.1, TUN.h - 0.78, TUN.h - 0.56, z - 0.1, z + 0.1);
      box(B, 'iron', -0.2, 0.2, TUN.h - 0.56, TUN.h - 0.5, z - 0.2, z + 0.2);
    }
  }
  // rails from the cage to the narthex door, sleepers under them
  for (const sx of [-1, 1]) box(B, 'iron', sx * 0.55 - 0.04, sx * 0.55 + 0.04, 0, 0.1, SHAFT_HW + 0.2, TUN.z1 - 1.5);
  for (let z = SHAFT_HW + 0.6; z < TUN.z1 - 1.6; z += 1.1) box(B, 'timber', -0.95, 0.95, 0, 0.06, z - 0.1, z + 0.1);
  box(B, 'timber', -1.0, 1.0, 0, 0.7, TUN.z1 - 1.5, TUN.z1 - 1.2); // buffer stop
  lamp(0xffa560, 40, 20, 0, 3.4, 20);
  lamp(0xffa560, 40, 20, 0, 3.4, 38);
  room(-TUN.hw + 0.45, TUN.hw - 0.45, TUN.z0 - 0.6, TUN.z1 + 0.9, TUN.h);

  // An ore tub: tapered iron body on wheels, heaped with glowing ore.
  function tub(x, z, yaw, load) {
    const body = new THREE.CylinderGeometry(0.95, 0.68, 0.85, 4, 1, true);
    body.rotateY(Math.PI / 4);
    body.scale(0.8, 1, 1.25);
    put(B, 'iron', at(body, x, 0.8, z, yaw));
    put(B, 'iron', at(new THREE.BoxGeometry(1.0, 0.1, 1.5), x, 0.36, z, yaw));
    for (const dz of [-0.5, 0.5]) {
      const axle = new THREE.CylinderGeometry(0.2, 0.2, 1.3, 10);
      put(B, 'iron', at(axle, x + Math.sin(yaw) * dz, 0.2, z + Math.cos(yaw) * dz, yaw, 0, Math.PI / 2));
    }
    for (let k = 0; k < load; k++) {
      const a = rng() * 6.28, d = rng() * 0.45;
      crystal(B, 'ore', x + Math.cos(a) * d * 0.7, 1.12 + rng() * 0.3, z + Math.sin(a) * d * 1.1, 0.12 + rng() * 0.12, 0.2 + rng() * 0.25, rng() * 3, rng() * 6);
    }
    solidCyl(x, z, 0.95);
  }
  tub(0, 36.5, 0, 12); // on the rails, with room to pass either side
  tub(4.7, 26.4, 0.6, 9); // hand-trammed in from the face

  // the stope: where the seam is being worked right now
  wallPZ(STOPE.z0, TUN.hw, STOPE.x1, 0, STOPE.h, 0.5);
  wallNZ(STOPE.z1, TUN.hw, STOPE.x1, 0, STOPE.h, 0.5);
  wallNX(STOPE.x1, 0, STOPE.h, STOPE.z0, STOPE.z1, 0.55);
  ceil(STOPE.h, TUN.hw, STOPE.x1, STOPE.z0, STOPE.z1, 0.5);
  wallPX(TUN.hw, TUN.h, STOPE.h, STOPE.z0, STOPE.z1, 0.1); // the step up in the roof
  room(TUN.hw - 0.8, STOPE.x1 - 0.9, STOPE.z0 + 0.6, STOPE.z1 - 0.6, STOPE.h);
  // The seam: a thick diagonal band of crystal across the far wall and round
  // onto the side walls, hot at its heart.
  // (small crystals standing OUT of the rock, like a druse — big flat shards
  // read as paper)
  for (let i = 0; i < 230; i++) {
    const t = rng();
    const zz = STOPE.z0 + 0.6 + t * (STOPE.z1 - STOPE.z0 - 1.2);
    const band = (rng() + rng() + rng()) / 3 - 0.5; // bunched on the seam's centre line
    const yy = 0.5 + t * 3.5 + band * 2.2;
    const r = 0.05 + rng() * 0.1, len = r * (1.8 + rng() * 2.6);
    crystal(B, rng() < 0.03 ? 'hot' : 'ore', STOPE.x1 - 0.12 - rng() * 0.22, yy, zz, r, len,
      Math.PI / 2 + (rng() - 0.5) * 1.0, -Math.PI / 2 + (rng() - 0.5) * 1.0);
  }
  for (let i = 0; i < 70; i++) {
    const lo = rng() < 0.5; // the seam leaves low through one side wall, high through the other
    const sz = lo ? STOPE.z0 + 0.15 : STOPE.z1 - 0.15;
    const xx = STOPE.x1 - 0.3 - rng() * rng() * 5;
    const r = 0.035 + rng() * 0.075, len = r * (1.8 + rng() * 2.4);
    crystal(B, 'ore', xx, (lo ? 0.6 : 3.9) + (rng() - 0.5) * 1.4, sz, r, len,
      (lo ? 1 : -1) * Math.PI / 2 + (rng() - 0.5) * 1.0, (rng() - 0.5) * 1.0);
  }
  // rubble on the floor, props against the hanging wall
  for (let i = 0; i < 16; i++) {
    crystal(B, rng() < 0.5 ? 'ore' : 'rough', STOPE.x1 - 0.9 - rng() * 2.2, 0.08 + rng() * 0.1, STOPE.z0 + 1 + rng() * 7, 0.1 + rng() * 0.16, 0.12 + rng() * 0.16, rng() * 3, rng() * 6);
  }
  box(B, 'timber', 6.2, 6.5, 0, STOPE.h - 0.2, 25.2, 25.5);
  box(B, 'timber', 6.2, 6.5, 0, STOPE.h - 0.2, 31.5, 31.8);
  solidBox(6.2, 6.5, 25.2, 25.5);
  solidBox(6.2, 6.5, 31.5, 31.8);
  lamp(0xff8a40, 32, 16, 7.4, 3.6, 28.5);
  // THE LOOSE CHUNK the player takes: on an upturned crate, ringed in light.
  const orePos = new THREE.Vector3(8.2, 0, 28.5);
  box(B, 'timber', orePos.x - 0.45, orePos.x + 0.45, 0, 0.7, orePos.z - 0.45, orePos.z + 0.45);
  solidBox(orePos.x - 0.45, orePos.x + 0.45, orePos.z - 0.45, orePos.z + 0.45);
  const oreChunk = new THREE.Group();
  {
    const gs = [];
    const r2 = mulberry32(seed ^ 0xabc);
    for (let k = 0; k < 7; k++) {
      const g = new THREE.OctahedronGeometry(0.1 + r2() * 0.09, 0);
      g.scale(1, 1.4 + r2() * 1.2, 1);
      gs.push(prep(at(g, (r2() - 0.5) * 0.24, 0.12 + r2() * 0.08, (r2() - 0.5) * 0.24, r2() * 6, (r2() - 0.5) * 1.2)));
    }
    oreChunk.add(new THREE.Mesh(own(facet(mergeGeometries(gs, false))), MATS.ore));
    for (const g of gs) g.dispose();
    const core = new THREE.Mesh(own(new THREE.OctahedronGeometry(0.07, 0)), MATS.hot);
    core.position.y = 0.16;
    oreChunk.add(core);
  }
  oreChunk.position.set(orePos.x, 0.72, orePos.z);
  group.add(oreChunk);
  // the marker ring on the floor round the crate (pulses in update)
  const oreRingMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.6, 0.12), transparent: true, opacity: 0.9, depthWrite: false }));
  const oreRing = new THREE.Mesh(own(new THREE.RingGeometry(0.95, 1.08, 40)), oreRingMat);
  oreRing.rotation.x = -Math.PI / 2;
  oreRing.position.set(orePos.x, 0.03, orePos.z);
  group.add(oreRing);

  // =========================================================================
  // THE FLOOR — one slab under everything past the shaft
  // =========================================================================
  box(B, 'floor', -26, 26, -0.6, 0, SHAFT_HW, END_Z + 2);

  // =========================================================================
  // NARTHEX (z 44..53)
  // =========================================================================
  const NX = { hw: 10, z0: 44, z1: 53, h: 10 };
  {
    // west wall with the tunnel doorway
    const s = new THREE.Shape();
    s.moveTo(-NX.hw - 1, 0);
    s.lineTo(-2.5, 0); s.lineTo(-2.5, 2.9);
    archTo(s, -2.5, 2.5, 2.9, 4.5);
    s.lineTo(2.5, 0); s.lineTo(NX.hw + 1, 0);
    s.lineTo(NX.hw + 1, NX.h + 1); s.lineTo(-NX.hw - 1, NX.h + 1);
    s.closePath();
    put(B, 'smooth', extrudeAlongZ(s, 1.2, NX.z0 - 0.6));
    put(B, 'smooth', extrudeAlongZ(archBand(-2.9, 2.9, 2.9, 4.95, 0.4), 1.5, NX.z0 - 0.75));
  }
  box(S, 'smooth', NX.hw, NX.hw + 1, 0, NX.h + 1, NX.z0, NX.z1);
  box(B, 'smooth', -NX.hw - 1, NX.hw + 1, NX.h, NX.h + 1, NX.z0, NX.z1);
  // ceiling ribs + a carved cornice
  for (const z of [46.5, 49.5, 52]) box(B, 'smooth', -NX.hw, NX.hw, NX.h - 0.45, NX.h, z - 0.3, z + 0.3);
  box(S, 'smooth', NX.hw - 0.35, NX.hw, 7.2, 7.7, NX.z0, NX.z1);
  // blind arcading on the side walls, a guardian in each centre niche
  for (const zc of [46.2, 48.5, 50.8]) {
    put(S, 'smooth', extrudeAlongX(archBand(zc - 1.0, zc + 1.0, 4.2, 6.3, 0.22), 0.3, NX.hw + 0.02));
    put(S, 'pane', extrudeAlongX(lancetShape(zc - 0.78, zc + 0.78, 1.2, 4.2, 6.0), 0.06, NX.hw + 0.0));
  }
  room(-NX.hw + 0.5, NX.hw - 0.5, NX.z0 + 0.4, NX.z1 - 0.3, NX.h);
  // the font: a carved bowl of raw ore, lit from inside
  {
    const prof = [[0.0, 0], [0.9, 0], [0.9, 0.18], [0.45, 0.3], [0.35, 0.8], [0.5, 0.95], [1.25, 1.2], [1.3, 1.34], [1.05, 1.34], [0.9, 1.15], [0.0, 1.1]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    put(B, 'smooth', at(new THREE.LatheGeometry(prof, 20), 0, 0, 48.5));
    const r3 = mulberry32(seed ^ 0xf0);
    for (let k = 0; k < 14; k++) {
      const a = r3() * 6.28, d = r3() * 0.75;
      crystal(B, k < 3 ? 'hot' : 'ore', Math.cos(a) * d, 1.22 + r3() * 0.22, 48.5 + Math.sin(a) * d, 0.1 + r3() * 0.1, 0.16 + r3() * 0.3, r3() * 1.4, r3() * 6);
    }
    solidCyl(0, 48.5, 1.35);
  }
  lamp(0xff9a50, 120, 30, 0, 6.5, 48.5);

  // =========================================================================
  // Carved figures: a hooded miner holding a lamp. Unit height; scaled.
  // =========================================================================
  function statue(bk, x, z, h, yaw) {
    const parts = [];
    const P = (g, px, py, pz, ry = 0, rx = 0, rz = 0) => parts.push(at(g, px, py, pz, ry, rx, rz));
    P(new THREE.CylinderGeometry(0.2, 0.22, 0.07, 8), 0, 0.035, 0); // plinth
    P(new THREE.CylinderGeometry(0.105, 0.17, 0.58, 10), 0, 0.36, 0); // robe
    P(new THREE.CylinderGeometry(0.135, 0.105, 0.2, 10), 0, 0.74, 0); // chest
    P(new THREE.SphereGeometry(0.075, 10, 8), 0, 0.905, 0.01); // head
    P(new THREE.ConeGeometry(0.105, 0.2, 10), 0, 0.955, -0.02, 0, -0.25); // hood
    // arms: down from the shoulder, forearms brought together to cup a lamp
    const limb = (ax, ay, az, bx, by, bz, r) => {
      const d = new THREE.Vector3(bx - ax, by - ay, bz - az);
      const g = new THREE.CylinderGeometry(r * 0.88, r, d.length(), 7);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
      g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      parts.push(g);
    };
    for (const sx of [-1, 1]) {
      limb(sx * 0.135, 0.8, 0.0, sx * 0.15, 0.63, 0.045, 0.04);
      limb(sx * 0.15, 0.63, 0.045, sx * 0.035, 0.635, 0.17, 0.034);
    }
    P(new THREE.CylinderGeometry(0.036, 0.044, 0.05, 8), 0, 0.615, 0.185); // the lamp's bowl
    for (const g of parts) {
      g.scale(h, h, h);
      put(bk, 'smooth', at(g, x, 0, z, yaw));
    }
    const flame = new THREE.OctahedronGeometry(0.03 * h, 0);
    flame.scale(0.8, 1.5, 0.8);
    put(bk, 'hot', at(flame, x + Math.sin(yaw) * 0.185 * h, 0.675 * h, z + Math.cos(yaw) * 0.185 * h));
  }
  statue(S, NX.hw - 1.0, 48.5, 4.2, -Math.PI / 2);
  solidCylSym(NX.hw - 1.0, 48.5, 1.0);

  // =========================================================================
  // WEST WALL of the nave: the portal, and a rose of backlit ore above it
  // =========================================================================
  {
    const s = new THREE.Shape();
    s.moveTo(-AISLE_X1 - 1.2, 0);
    s.lineTo(-3.8, 0); s.lineTo(-3.8, 4.6);
    archTo(s, -3.8, 3.8, 4.6, 7.8);
    s.lineTo(3.8, 0); s.lineTo(AISLE_X1 + 1.2, 0);
    s.lineTo(AISLE_X1 + 1.2, 30); s.lineTo(-AISLE_X1 - 1.2, 30);
    s.closePath();
    const rose = new THREE.Path();
    rose.absarc(0, 19, 3.6, 0, Math.PI * 2, true);
    s.holes.push(rose);
    put(B, 'smooth', extrudeAlongZ(s, 1.2, NAVE_Z0 - 1.0));
    // carved orders round the portal, both faces
    put(B, 'smooth', extrudeAlongZ(archBand(-4.3, 4.3, 4.6, 8.4, 0.5), 1.7, NAVE_Z0 - 1.25));
    put(B, 'smooth', extrudeAlongZ(archBand(-4.9, 4.9, 4.6, 9.0, 0.35), 1.45, NAVE_Z0 - 1.12));
    box(S, 'smooth', 3.8, 4.9, 4.3, 4.7, NAVE_Z0 - 1.3, NAVE_Z0 + 0.5); // impost
    // the rose: pane behind, rock tracery in front
    const disc = new THREE.CircleGeometry(3.75, 40);
    put(B, 'paneBig', at(disc, 0, 19, NAVE_Z0 - 0.7));
    const ringAt = (r, tube, cx, cy) => put(B, 'smooth', at(new THREE.TorusGeometry(r, tube, 6, 36), cx, cy, NAVE_Z0 + 0.1));
    ringAt(3.6, 0.3, 0, 19);
    ringAt(1.25, 0.16, 0, 19);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const g = new THREE.BoxGeometry(0.16, 2.3, 0.22);
      g.translate(0, 2.4, 0);
      g.rotateZ(a);
      put(B, 'smooth', at(g, 0, 19, NAVE_Z0 + 0.1));
      ringAt(0.42, 0.09, Math.cos(a + Math.PI / 12) * 2.95, 19 + Math.sin(a + Math.PI / 12) * 2.95);
    }
    crystal(B, 'hot', 0, 19, NAVE_Z0 + 0.15, 0.3, 0.3);
    // the inscription over the door, narthex side
    const insc = new THREE.Mesh(
      own(new THREE.PlaneGeometry(7.6, 0.95)),
      own(new THREE.MeshBasicMaterial({
        map: own(makeInscription(['THE EMBERDEEP CATHEDRAL', 'carved by the Redline shifts  ·  every pillar a year  ·  every arch a life'])),
        color: new THREE.Color(1.5, 1.5, 1.5),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }))
    );
    insc.rotation.y = Math.PI;
    insc.position.set(0, 9.42, NAVE_Z0 - 1.32);
    group.add(insc);
  }
  room(-3.4, 3.4, NX.z1 - 0.6, NAVE_Z0 + 1.0, 7); // the portal throat

  // =========================================================================
  // THE NAVE — columns, arcades, clerestory, vaults (authored at +x, mirrored)
  // =========================================================================
  const colX = NAVE_HW + ARC_T / 2; // 7.0
  const colProfile = [
    [0, 0], [1.75, 0], [1.75, 0.34], [1.55, 0.5], [1.55, 0.78], [1.3, 0.98], [1.2, 1.1],
    [1.2, 6.9], [1.32, 7.0], [1.32, 7.14], [1.22, 7.26], [1.34, 7.5], [1.78, 7.92], [1.82, 8.0], [1.82, CAP_Y], [0, CAP_Y],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  for (let i = 0; i <= BAYS; i++) {
    const z = NAVE_Z0 + i * BAY;
    put(S, 'smooth', at(new THREE.LatheGeometry(colProfile, 16), colX, 0, z));
    // four attached colonnettes on the diagonals
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      put(S, 'smooth', at(new THREE.CylinderGeometry(0.27, 0.27, 6.2, 8), colX + Math.cos(a) * 1.3, 4.0, z + Math.sin(a) * 1.3));
    }
    // a ring of raw ore left standing proud of the capital
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.3;
      crystal(S, 'ore', colX + Math.cos(a) * 1.72, 7.62, z + Math.sin(a) * 1.72, 0.13, 0.26);
    }
    // vaulting shaft up the nave face to the springing, with a carved corbel
    put(S, 'smooth', at(new THREE.CylinderGeometry(0.3, 0.3, VAULT_SPRING - CAP_Y, 8), NAVE_HW - 0.1, (VAULT_SPRING + CAP_Y) / 2, z));
    put(S, 'smooth', at(new THREE.CylinderGeometry(0.62, 0.3, 0.7, 8), NAVE_HW - 0.1, VAULT_SPRING - 0.35, z));
    crystal(S, 'ore', NAVE_HW - 0.42, VAULT_SPRING - 1.0, z, 0.16, 0.34);
    solidCylSym(colX, z, 1.5);
  }
  for (let b = 0; b < BAYS; b++) {
    const z0 = NAVE_Z0 + b * BAY, z1 = z0 + BAY, zc = z0 + BAY / 2;
    // arcade wall for this bay: the big arch below, two lancets above
    const s = new THREE.Shape();
    s.moveTo(z0, 0);
    s.lineTo(z0 + 0.85, 0); s.lineTo(z0 + 0.85, CAP_Y);
    archTo(s, z0 + 0.85, z1 - 0.85, CAP_Y, ARC_APEX);
    s.lineTo(z1 - 0.85, 0); s.lineTo(z1, 0);
    s.lineTo(z1, VAULT_SPRING + 0.4); s.lineTo(z0, VAULT_SPRING + 0.4);
    s.closePath();
    s.holes.push(lancetPath(zc - 2.5, zc - 0.5, 15.3, 17.9, 19.5));
    s.holes.push(lancetPath(zc + 0.5, zc + 2.5, 15.3, 17.9, 19.5));
    put(S, 'smooth', extrudeAlongX(s, ARC_T, NAVE_HW + ARC_T));
    // moulded archivolt, proud of both faces
    put(S, 'smooth', extrudeAlongX(archBand(z0 + 0.85, z1 - 0.85, CAP_Y, ARC_APEX, 0.42), ARC_T + 0.5, NAVE_HW + ARC_T + 0.25));
    put(S, 'smooth', extrudeAlongX(archBand(z0 + 0.5, z1 - 0.5, CAP_Y, ARC_APEX + 0.55, 0.2), ARC_T + 0.26, NAVE_HW + ARC_T + 0.13));
    // string course under the clerestory, sill blocks, lancet frames
    box(S, 'smooth', NAVE_HW - 0.22, NAVE_HW, 14.5, 14.9, z0, z1);
    for (const lz of [zc - 1.5, zc + 1.5]) {
      put(S, 'smooth', extrudeAlongX(archBand(lz - 1.18, lz + 1.18, 17.9, 19.75, 0.2), 0.2, NAVE_HW + 0.02));
      box(S, 'smooth', NAVE_HW - 0.18, NAVE_HW, 15.1, 15.3, lz - 1.2, lz + 1.2);
    }
    // a keystone crystal over each arcade arch
    crystal(S, 'ore', NAVE_HW - 0.2, ARC_APEX + 0.4, zc, 0.2, 0.42);
    // the clerestory: thin-carved ore behind the lancets, lit from within
    box(S, 'pane', NAVE_HW + ARC_T - 0.14, NAVE_HW + ARC_T - 0.04, 15.0, 19.8, zc - 2.8, zc + 2.8);
  }
  // nave vault: a pointed barrel, chancel included
  {
    const s = new THREE.Shape();
    s.moveTo(-NAVE_HW, VAULT_SPRING);
    archTo(s, -NAVE_HW, NAVE_HW, VAULT_SPRING, VAULT_APEX);
    s.lineTo(NAVE_HW + 1.6, VAULT_SPRING); s.lineTo(NAVE_HW + 1.6, VAULT_APEX + 2);
    s.lineTo(-NAVE_HW - 1.6, VAULT_APEX + 2); s.lineTo(-NAVE_HW - 1.6, VAULT_SPRING);
    s.closePath();
    put(B, 'smooth', extrudeAlongZ(s, END_Z - NAVE_Z0 + 1, NAVE_Z0 - 0.2));
    // transverse ribs on every column line, intermediate ribs at mid-bay,
    // a ridge rib, and a glowing boss wherever two meet
    for (let i = 0; i <= BAYS; i++) {
      const z = NAVE_Z0 + i * BAY;
      put(B, 'smooth', extrudeAlongZ(archBand(-NAVE_HW, NAVE_HW, VAULT_SPRING, VAULT_APEX, 0.6), 0.9, z - 0.45));
      crystal(B, 'ore', 0, VAULT_APEX - 0.95, z, 0.34, 0.5);
      if (i < BAYS) {
        put(B, 'smooth', extrudeAlongZ(archBand(-NAVE_HW, NAVE_HW, VAULT_SPRING, VAULT_APEX, 0.28), 0.4, z + BAY / 2 - 0.2));
        crystal(B, 'ore', 0, VAULT_APEX - 0.55, z + BAY / 2, 0.18, 0.28);
      }
    }
    box(B, 'smooth', -0.22, 0.22, VAULT_APEX - 0.5, VAULT_APEX + 0.1, NAVE_Z0, END_Z);
    // tiercerons: two more longitudinal ribs a third of the way down the vault
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.3, 0.3, END_Z - NAVE_Z0);
      put(B, 'smooth', at(g, sx * 3.45, VAULT_APEX - 2.55, (NAVE_Z0 + END_Z) / 2, 0, 0, sx * -0.72));
    }
  }
  // aisle vault + ribs + outer wall + chapels
  {
    const AX0 = NAVE_HW + ARC_T; // 7.8
    const s = new THREE.Shape();
    s.moveTo(AX0, AISLE_SPRING);
    archTo(s, AX0, AISLE_X1, AISLE_SPRING, AISLE_APEX);
    s.lineTo(AISLE_X1 + 1.2, AISLE_SPRING); s.lineTo(AISLE_X1 + 1.2, AISLE_TOP); s.lineTo(AX0 - 0.2, AISLE_TOP); s.lineTo(AX0 - 0.2, AISLE_SPRING);
    s.closePath();
    put(S, 'smooth', extrudeAlongZ(s, NAVE_Z1 - NAVE_Z0, NAVE_Z0));
    for (let i = 0; i <= BAYS; i++) {
      const z = NAVE_Z0 + i * BAY;
      put(S, 'smooth', extrudeAlongZ(archBand(AX0, AISLE_X1, AISLE_SPRING, AISLE_APEX, 0.38), 0.7, z - 0.35));
      // respond against the outer wall
      put(S, 'smooth', at(new THREE.CylinderGeometry(0.42, 0.5, AISLE_SPRING, 8), AISLE_X1 - 0.1, AISLE_SPRING / 2, z));
      crystal(S, 'ore', AISLE_X1 - 0.5, AISLE_SPRING - 0.5, z, 0.14, 0.3);
    }
    for (let b = 0; b < BAYS; b++) {
      const z0 = NAVE_Z0 + b * BAY, z1 = z0 + BAY, zc = z0 + BAY / 2;
      const chapel = CHAPEL_BAYS.includes(b);
      const w = new THREE.Shape();
      w.moveTo(z0, 0);
      if (chapel) {
        w.lineTo(zc - 2.7, 0); w.lineTo(zc - 2.7, 4.6);
        archTo(w, zc - 2.7, zc + 2.7, 4.6, 7.5);
        w.lineTo(zc + 2.7, 0);
      }
      w.lineTo(z1, 0); w.lineTo(z1, AISLE_TOP); w.lineTo(z0, AISLE_TOP);
      w.closePath();
      put(S, 'smooth', extrudeAlongX(w, 1.2, AISLE_X1 + 1.2));
      if (chapel) {
        put(S, 'smooth', extrudeAlongX(archBand(zc - 3.1, zc + 3.1, 4.6, 8.0, 0.42), 1.5, AISLE_X1 + 1.35));
        crystal(S, 'ore', AISLE_X1 - 0.1, 8.25, zc, 0.2, 0.4);
      } else {
        // a blind niche: carved frame, a recessed glowing panel, a shelf
        // with one crystal left on it by whoever cut this bay
        put(S, 'smooth', extrudeAlongX(archBand(zc - 1.7, zc + 1.7, 4.4, 6.9, 0.3), 0.3, AISLE_X1 + 0.02));
        put(S, 'pane', extrudeAlongX(lancetShape(zc - 1.4, zc + 1.4, 1.4, 4.4, 6.55), 0.05, AISLE_X1 + 0.0));
        box(S, 'smooth', AISLE_X1 - 0.5, AISLE_X1, 1.15, 1.4, zc - 1.7, zc + 1.7);
        crystal(S, 'ore', AISLE_X1 - 0.25, 1.75, zc, 0.16, 0.36);
        box(S, 'smooth', AISLE_X1 - 0.12, AISLE_X1, 0, 1.15, zc - 1.7, zc + 1.7);
      }
    }
    // aisle east end: a small altar-relief closing each aisle
    box(S, 'smooth', AX0 - 0.2, AISLE_X1 + 1.2, 0, AISLE_TOP, NAVE_Z1, NAVE_Z1 + 1);
    const ex = (AX0 + AISLE_X1) / 2;
    {
      const g = new THREE.ExtrudeGeometry(lancetShape(-1.5, 1.5, 1.6, 5.2, 7.6), EXTR(0.06));
      put(S, 'pane', at(g, ex, 0, NAVE_Z1 - 0.07));
      const f = new THREE.ExtrudeGeometry(archBand(-1.85, 1.85, 5.2, 8.0, 0.32), EXTR(0.3));
      put(S, 'smooth', at(f, ex, 0, NAVE_Z1 - 0.3));
      box(S, 'smooth', ex - 1.9, ex + 1.9, 0, 1.6, NAVE_Z1 - 0.9, NAVE_Z1);
      crystal(S, 'ore', ex, 2.25, NAVE_Z1 - 0.45, 0.28, 0.65);
      for (const dx of [-1.2, 1.2]) box(S, 'hot', ex + dx - 0.04, ex + dx + 0.04, 1.6, 2.0, NAVE_Z1 - 0.5, NAVE_Z1 - 0.42);
      solidBoxSym(ex - 1.9, ex + 1.9, NAVE_Z1 - 0.9, NAVE_Z1);
    }
    // aisle west end stays plain: the west wall already closes it

    // chapels
    for (let ci = 0; ci < CHAPEL_BAYS.length; ci++) {
      const zc = NAVE_Z0 + CHAPEL_BAYS[ci] * BAY + BAY / 2;
      const X0 = AISLE_X1 + 1.2, X1 = 23.4, HWZ = 3.7, H = 8.2;
      box(S, 'smooth', X1, X1 + 1, 0, H + 1, zc - HWZ - 1, zc + HWZ + 1); // back wall
      box(S, 'smooth', X0, X1, 0, H + 1, zc - HWZ - 1, zc - HWZ);
      box(S, 'smooth', X0, X1, 0, H + 1, zc + HWZ, zc + HWZ + 1);
      box(S, 'smooth', X0, X1, H, H + 1, zc - HWZ, zc + HWZ);
      // crossed ceiling ribs and a boss
      for (const sgn of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.3, 0.3, 10.2);
        put(S, 'smooth', at(g, (X0 + X1) / 2, H - 0.12, zc, sgn * 0.77));
      }
      crystal(S, 'ore', (X0 + X1) / 2, H - 0.5, zc, 0.24, 0.42);
      // the relief on the back wall: a glowing lancet with a different
      // device carved across it in each chapel
      put(S, 'smooth', extrudeAlongX(archBand(zc - 2.2, zc + 2.2, 4.6, 7.5, 0.34), 0.34, X1 + 0.02));
      put(S, 'pane', extrudeAlongX(lancetShape(zc - 1.86, zc + 1.86, 1.5, 4.6, 7.1), 0.06, X1 + 0.0));
      const dev = (g, y, rx = 0) => put(S, 'smooth', at(g, X1 - 0.16, y, zc, Math.PI / 2, rx));
      if (ci === 0) {
        // the Lamp: a ring with rays — the light they carry down
        dev(new THREE.TorusGeometry(0.9, 0.13, 6, 28), 4.3);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const g = new THREE.BoxGeometry(0.12, 0.7, 0.2);
          g.translate(0, 1.4, 0);
          g.rotateZ(a);
          dev(g, 4.3);
        }
      } else if (ci === 1) {
        // the Pick: crossed tools over a flame-shaped lozenge
        for (const sgn of [-1, 1]) {
          const g = new THREE.BoxGeometry(0.14, 3.0, 0.2);
          g.rotateZ(sgn * 0.6);
          dev(g, 4.1);
          const head = new THREE.BoxGeometry(1.1, 0.16, 0.2);
          head.translate(0, 1.45, 0);
          head.rotateZ(sgn * 0.6);
          dev(head, 4.1);
        }
      } else {
        // the Cage: a barred frame — the ride down, and the ride back
        const g = new THREE.BoxGeometry(1.9, 0.14, 0.2);
        dev(g.clone(), 2.9); dev(g, 5.3);
        for (let k = -2; k <= 2; k++) {
          const bar = new THREE.BoxGeometry(0.12, 2.5, 0.2);
          bar.translate(k * 0.44, 0, 0);
          dev(bar, 4.1);
        }
      }
      // altar, candles, a crystal offering, and a figure keeping watch
      box(S, 'smooth', X1 - 1.9, X1 - 0.6, 0, 1.05, zc - 1.3, zc + 1.3);
      box(S, 'smooth', X1 - 2.0, X1 - 0.5, 1.05, 1.2, zc - 1.4, zc + 1.4);
      crystal(S, 'ore', X1 - 1.25, 1.62, zc, 0.22, 0.44);
      for (const dz of [-0.95, 0.95]) {
        box(S, 'smooth', X1 - 1.3, X1 - 1.2, 1.2, 1.55, zc + dz - 0.05, zc + dz + 0.05);
        box(S, 'hot', X1 - 1.28, X1 - 1.22, 1.55, 1.66, zc + dz - 0.03, zc + dz + 0.03);
      }
      solidBoxSym(X1 - 2.0, X1 - 0.5, zc - 1.4, zc + 1.4);
      statue(S, X0 + 1.2, zc - HWZ + 0.9, 2.6, 0.5);
      solidCylSym(X0 + 1.2, zc - HWZ + 0.9, 0.7);
      // chapel footprint (the throat through the wall, then the room)
      room(AISLE_X1 - 0.6, X0 + 0.6, zc - 2.25, zc + 2.25, 7);
      room(-(X0 + 0.6), -(AISLE_X1 - 0.6), zc - 2.25, zc + 2.25, 7);
      room(X0 + 0.4, X1 - 0.4, zc - HWZ + 0.4, zc + HWZ - 0.4, H);
      room(-(X1 - 0.4), -(X0 + 0.4), zc - HWZ + 0.4, zc + HWZ - 0.4, H);
    }
  }
  room(-AISLE_X1 + 0.4, AISLE_X1 - 0.4, NAVE_Z0 + 0.6, NAVE_Z1 - 0.4, 12);

  // pews: stone benches facing the altar, a clear aisle down the middle
  for (let z = 61; z <= 126; z += 4) {
    box(S, 'smooth', 1.9, 5.1, 0, 0.48, z, z + 0.62);
    box(S, 'smooth', 1.9, 5.1, 0.48, 1.05, z, z + 0.16);
    box(S, 'smooth', 1.8, 2.0, 0, 1.2, z - 0.05, z + 0.7); // carved bench end
    box(S, 'smooth', 5.0, 5.2, 0, 1.2, z - 0.05, z + 0.7);
    solidBoxSym(1.8, 5.2, z - 0.05, z + 0.7);
  }
  // floor inlay: two lines of ore let into the stone, running to the altar,
  // tied across at every bay; a ring where the people stop and the chancel begins
  for (const x of [1.25]) box(S, 'inlay', x - 0.05, x + 0.05, 0.0, 0.02, NAVE_Z0 + 1, NAVE_Z1 - 1.2);
  for (let i = 1; i < BAYS; i++) box(B, 'inlay', -1.25, 1.25, 0.0, 0.02, NAVE_Z0 + i * BAY - 0.04, NAVE_Z0 + i * BAY + 0.04);
  for (const [r0, r1] of [[2.2, 2.34], [1.2, 1.28]]) {
    const g = new THREE.RingGeometry(r0, r1, 48);
    put(B, 'inlay', at(g, 0, 0.022, NAVE_Z1 - 4, 0, -Math.PI / 2));
  }
  box(S, 'inlay', AISLE_X1 - 3.7, AISLE_X1 - 3.62, 0.0, 0.02, NAVE_Z0 + 1, NAVE_Z1 - 1.5);

  // =========================================================================
  // CHANCEL + EAST END
  // =========================================================================
  // side walls: two tall glowing lancets each
  {
    const s = new THREE.Shape();
    s.moveTo(NAVE_Z1, 0); s.lineTo(END_Z, 0); s.lineTo(END_Z, VAULT_SPRING + 0.4); s.lineTo(NAVE_Z1, VAULT_SPRING + 0.4);
    s.closePath();
    for (const lz of [136.6, 141.2]) {
      s.holes.push(lancetPath(lz - 1.0, lz + 1.0, 5.5, 15.5, 17.6));
      put(S, 'smooth', extrudeAlongX(archBand(lz - 1.3, lz + 1.3, 15.5, 17.95, 0.26), 0.25, NAVE_HW + 0.02));
      box(S, 'smooth', NAVE_HW - 0.25, NAVE_HW, 5.2, 5.5, lz - 1.4, lz + 1.4);
      box(S, 'paneBig', NAVE_HW + ARC_T - 0.14, NAVE_HW + ARC_T - 0.04, 5.3, 17.8, lz - 1.2, lz + 1.2);
      // a single carved mullion up the middle of each
      box(S, 'smooth', NAVE_HW + 0.5, NAVE_HW + 0.75, 5.5, 16.6, lz - 0.09, lz + 0.09);
    }
    put(S, 'smooth', extrudeAlongX(s, ARC_T, NAVE_HW + ARC_T));
    box(S, 'smooth', NAVE_HW - 0.22, NAVE_HW, 19.2, 19.6, NAVE_Z1, END_Z);
  }
  // the dais: three steps
  for (let k = 0; k < 3; k++) {
    box(B, 'floor', -NAVE_HW, NAVE_HW, 0.2 * k, 0.2 * (k + 1), NAVE_Z1 - 0.6 + k * 0.5, END_Z);
    box(B, 'inlay', -NAVE_HW + 0.3, NAVE_HW - 0.3, 0.2 * (k + 1), 0.2 * (k + 1) + 0.012, NAVE_Z1 - 0.57 + k * 0.5, NAVE_Z1 - 0.5 + k * 0.5);
  }
  const DAIS = 0.6;
  // east wall with the GREAT WINDOW: a wall of backlit ore behind carved
  // tracery — five lancets under a rose, the whole east end alight
  {
    const s = new THREE.Shape();
    s.moveTo(-NAVE_HW - 1.6, 0); s.lineTo(NAVE_HW + 1.6, 0); s.lineTo(NAVE_HW + 1.6, 30); s.lineTo(-NAVE_HW - 1.6, 30);
    s.closePath();
    s.holes.push(lancetPath(-5.0, 5.0, 4.6, 17.0, 25.6));
    put(B, 'smooth', extrudeAlongZ(s, 1.4, END_Z));
    box(B, 'paneBig', -5.3, 5.3, 4.3, 26, END_Z + 0.95, END_Z + 1.05);
    const TZ = END_Z + 0.25; // tracery plane
    put(B, 'smooth', extrudeAlongZ(archBand(-5.45, 5.45, 17.0, 26.15, 0.5), 0.75, END_Z - 0.4));
    put(B, 'smooth', extrudeAlongZ(archBand(-6.0, 6.0, 17.0, 26.9, 0.3), 0.5, END_Z - 0.25));
    box(B, 'smooth', -5.6, 5.6, 4.1, 4.6, END_Z - 0.5, END_Z + 0.4); // sill
    // four mullions -> five lancets, each with its own carved head
    for (let k = 0; k < 4; k++) {
      const x = -3 + k * 2;
      box(B, 'smooth', x - 0.14, x + 0.14, 4.6, 14.2, TZ - 0.2, TZ + 0.2);
    }
    for (let k = 0; k < 5; k++) {
      const x0 = -5 + k * 2;
      put(B, 'smooth', extrudeAlongZ(archBand(x0 + 0.02, x0 + 1.98, 12.6, 14.9, 0.2), 0.36, TZ - 0.18));
    }
    box(B, 'smooth', -5.0, 5.0, 14.75, 15.05, TZ - 0.18, TZ + 0.18); // transom
    // the rose
    const ring = (r, tube, cx, cy) => put(B, 'smooth', at(new THREE.TorusGeometry(r, tube, 6, 40), cx, cy, TZ));
    ring(3.05, 0.24, 0, 19.3);
    ring(1.05, 0.14, 0, 19.3);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
      const g = new THREE.BoxGeometry(0.15, 1.95, 0.24);
      g.translate(0, 2.05, 0);
      g.rotateZ(a - Math.PI / 2);
      put(B, 'smooth', at(g, 0, 19.3, TZ));
      ring(0.36, 0.08, Math.cos(a + Math.PI / 10) * 2.45, 19.3 + Math.sin(a + Math.PI / 10) * 2.45);
    }
    // two daughter roundels and the apex eye
    ring(1.0, 0.14, -3.55, 16.6); ring(1.0, 0.14, 3.55, 16.6);
    ring(0.6, 0.1, 0, 23.6);
    for (const cx of [-3.55, 3.55]) {
      for (let k = 0; k < 3; k++) {
        const g = new THREE.BoxGeometry(0.1, 2.0, 0.2);
        g.rotateZ((k / 3) * Math.PI);
        put(B, 'smooth', at(g, cx, 16.6, TZ));
      }
    }
    crystal(B, 'hot', 0, 19.3, TZ - 0.1, 0.34, 0.34);
  }
  // the altar
  box(B, 'smooth', -2.0, 2.0, DAIS, DAIS + 1.05, 138.3, 139.7);
  box(B, 'smooth', -2.2, 2.2, DAIS + 1.05, DAIS + 1.25, 138.15, 139.85);
  box(B, 'pane', -1.6, 1.6, DAIS + 0.2, DAIS + 0.9, 138.27, 138.31);
  for (const dx of [-1.6, -0.8, 0.8, 1.6]) {
    box(B, 'smooth', dx - 0.05, dx + 0.05, DAIS + 1.25, DAIS + 1.7, 138.95, 139.05);
    box(B, 'hot', dx - 0.03, dx + 0.03, DAIS + 1.7, DAIS + 1.84, 138.97, 139.03);
  }
  solidBox(-2.2, 2.2, 138.15, 139.85);
  // THE HEART-EMBER: the first crystal they struck, left standing where it grew
  {
    const r4 = mulberry32(seed ^ 0x4ea7);
    put(B, 'smooth', at(new THREE.CylinderGeometry(1.5, 1.9, 0.9, 10), 0, DAIS + 0.45, 142.0));
    const spikes = [[0, 0, 0.62, 5.2, 0, 0], [-0.75, 0.2, 0.42, 3.4, 0.28, 0.4], [0.8, 0.1, 0.46, 3.9, -0.3, 2.1],
      [0.2, -0.6, 0.36, 2.8, 0.36, 4.0], [-0.4, 0.55, 0.3, 2.3, -0.42, 5.2], [1.15, -0.3, 0.26, 1.9, -0.55, 1.2], [-1.2, -0.2, 0.26, 1.7, 0.6, 3.0]];
    for (const [x, z, r, len, tilt, yaw] of spikes) {
      crystal(B, 'ore', x, DAIS + 0.9 + len * 0.8, 142.0 + z, r, len, tilt, yaw);
      crystal(B, 'hot', x, DAIS + 0.9 + len * 0.72, 142.0 + z, r * 0.3, len * 0.55, tilt, yaw);
    }
    for (let k = 0; k < 12; k++) {
      const a = r4() * 6.28, d = 0.9 + r4() * 0.7;
      crystal(B, 'ore', Math.cos(a) * d, DAIS + 1.0 + r4() * 0.4, 142.0 + Math.sin(a) * d * 0.7, 0.12 + r4() * 0.12, 0.3 + r4() * 0.5, (r4() - 0.5), r4() * 6);
    }
    solidCyl(0, 142.0, 2.0);
  }
  // two colossi flanking the window, lamps raised
  statue(S, 4.4, 141.6, 8.5, Math.PI);
  solidCylSym(4.4, 141.6, 1.5);
  room(-NAVE_HW + 0.45, NAVE_HW - 0.45, NAVE_Z1 - 0.8, END_Z - 0.5, 20);

  // =========================================================================
  // MERGE
  // =========================================================================
  const meshes = {};
  for (const key of Object.keys(MATS)) {
    const geos = [...(B[key] || [])];
    for (const g of S[key] || []) { geos.push(g); geos.push(mirrorX(g)); }
    if (!geos.length) continue;
    const merged = own(mergeGeometries(geos, false));
    for (const g of geos) g.dispose();
    if (ROCKY[key]) boxUV(merged, ROCKY[key]);
    const m = new THREE.Mesh(merged, MATS[key]);
    m.name = 'emberdeep-' + key;
    // One mesh spans the whole mine, so its bounding sphere is always on
    // screen — skip the test rather than pay for it.
    m.frustumCulled = false;
    group.add(m);
    meshes[key] = m;
  }

  // =========================================================================
  // CHANDELIERS — carved ore on iron hoops, hung down the nave
  // =========================================================================
  const chandeliers = [];
  {
    const P = { iron: [], ore: [], hot: [] };
    const cp = (mat, g) => P[mat].push(prep(g));
    cp('iron', at(new THREE.TorusGeometry(2.3, 0.07, 6, 36), 0, 0, 0, 0, Math.PI / 2));
    cp('iron', at(new THREE.TorusGeometry(1.2, 0.06, 6, 28), 0, -1.0, 0, 0, Math.PI / 2));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const g = new THREE.OctahedronGeometry(0.2, 0);
      g.scale(1, 2.8, 1);
      cp('ore', at(g, Math.cos(a) * 2.3, -0.55, Math.sin(a) * 2.3));
      if (k % 2 === 1) cp('hot', at(new THREE.OctahedronGeometry(0.06, 0), Math.cos(a) * 2.3, 0.2, Math.sin(a) * 2.3));
      if (k % 2 === 0) {
        const g2 = new THREE.OctahedronGeometry(0.16, 0);
        g2.scale(1, 2.6, 1);
        cp('ore', at(g2, Math.cos(a) * 1.2, -1.5, Math.sin(a) * 1.2));
      }
      if (k % 3 === 0) {
        // stays from the hoop up to the crown
        const st = new THREE.CylinderGeometry(0.02, 0.02, 3.3, 4);
        st.translate(0, 1.65, 0);
        st.rotateZ(0.77);
        st.rotateY(-a);
        cp('iron', at(st, Math.cos(a) * 2.3, 0, Math.sin(a) * 2.3));
      }
    }
    const big = new THREE.OctahedronGeometry(0.42, 0);
    big.scale(1, 3.2, 1);
    cp('ore', at(big, 0, -1.3, 0));
    cp('hot', at(new THREE.OctahedronGeometry(0.16, 0), 0, -1.3, 0));
    cp('iron', at(new THREE.CylinderGeometry(0.03, 0.03, 11, 5), 0, 7.8, 0)); // the drop chain
    const G = {};
    for (const k of Object.keys(P)) { G[k] = own(mergeGeometries(P[k], false)); for (const g of P[k]) g.dispose(); }
    facet(G.ore);
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Group();
      // pivot at the vault so the sway is a real pendulum
      const z = NAVE_Z0 + BAY * 1.5 + i * BAY * 2 - (i === 4 ? 2 : 0);
      c.position.set(0, VAULT_APEX - 0.6, z);
      const drop = new THREE.Group();
      drop.position.y = -(VAULT_APEX - 0.6 - 14.2);
      c.add(drop);
      for (const k of Object.keys(G)) drop.add(new THREE.Mesh(G[k], MATS[k]));
      group.add(c);
      chandeliers.push({ g: c, ph: rng() * 6.28 });
      lamp(0xffa25a, 260, 44, 0, 11.6, z);
    }
  }
  // the great window throws the last and strongest light
  lamp(0xff8438, 240, 50, 0, 12, END_Z - 5.5);

  // =========================================================================
  // DUST — motes hanging in the nave, catching the light
  // =========================================================================
  let dust = null;
  {
    const N = 700;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rng() - 0.5) * 2 * (AISLE_X1 - 1);
      pos[i * 3 + 1] = 0.5 + rng() * 22;
      pos[i * 3 + 2] = NAVE_Z0 + rng() * (END_Z - NAVE_Z0);
      if (Math.abs(pos[i * 3]) > NAVE_HW - 0.5 && pos[i * 3 + 1] > 7) pos[i * 3 + 1] = 0.5 + rng() * 6.5;
    }
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dust = new THREE.Points(g, own(new THREE.PointsMaterial({
      color: new THREE.Color(1.2, 0.7, 0.35), size: 0.045, sizeAttenuation: true,
      transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    dust.frustumCulled = false;
    group.add(dust);
  }

  // =========================================================================
  // MINERS — five of them, each a small articulated-looking figure built from
  // merged primitives. They turn to face you; E talks.
  // =========================================================================
  const minerMats = {
    cloth: own(new THREE.MeshStandardMaterial({ color: 0x3d4652, roughness: 0.9 })),
    cloth2: own(new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 0.9 })),
    skin: own(new THREE.MeshStandardMaterial({ color: 0xb98466, roughness: 0.8 })),
    hat: own(new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.5, metalness: 0.1 })),
  };
  const minerGeo = {};
  {
    const P = { cloth: [], cloth2: [], skin: [], hat: [], hot: [] };
    const mp = (mat, g, x, y, z, rx = 0, rz = 0) => P[mat].push(prep(at(g, x, y, z, 0, rx, rz)));
    for (const sx of [-1, 1]) {
      mp('cloth', new THREE.CylinderGeometry(0.085, 0.075, 0.82, 8), sx * 0.1, 0.45, 0); // leg
      mp('cloth2', new THREE.BoxGeometry(0.13, 0.1, 0.27), sx * 0.1, 0.05, 0.04); // boot
      mp('cloth', new THREE.CylinderGeometry(0.055, 0.05, 0.6, 7), sx * 0.26, 1.13, 0.02, 0.1, sx * 0.1); // arm
      mp('skin', new THREE.SphereGeometry(0.05, 7, 6), sx * 0.29, 0.82, 0.05); // hand
    }
    mp('cloth', new THREE.CylinderGeometry(0.2, 0.17, 0.62, 10), 0, 1.15, 0); // torso
    mp('cloth2', new THREE.CylinderGeometry(0.205, 0.205, 0.07, 10), 0, 0.9, 0); // belt
    mp('skin', new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), 0, 1.5, 0); // neck
    mp('skin', new THREE.SphereGeometry(0.105, 10, 8), 0, 1.62, 0); // head
    mp('hat', new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.65, 0); // hard hat
    mp('hat', new THREE.CylinderGeometry(0.15, 0.15, 0.015, 12), 0, 1.655, 0.02); // brim
    mp('hot', new THREE.SphereGeometry(0.028, 6, 5), 0, 1.71, 0.118); // cap lamp
    for (const k of Object.keys(P)) { minerGeo[k] = own(mergeGeometries(P[k], false)); for (const g of P[k]) g.dispose(); }
  }
  const miners = [];
  function miner(x, z, yaw, name, role, lines, y = 0) {
    const g = new THREE.Group();
    for (const k of Object.keys(minerGeo)) g.add(new THREE.Mesh(minerGeo[k], k === 'hot' ? MATS.hot : minerMats[k]));
    const s = 0.96 + rng() * 0.12;
    g.scale.setScalar(s);
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    group.add(g);
    solidCyl(x, z, 0.42);
    miners.push({ group: g, pos: new THREE.Vector3(x, y, z), homeYaw: yaw, yaw, name, role, lines, ph: rng() * 6.28 });
  }
  miner(-3.6, 6.4, 1.2, 'Hoistman Brek', 'Cage tender, Emberdeep No. 1', [
    'Mind the gap. Hundred and twenty metres of rope above your head and every strand of it mine to answer for.',
    'Tunnel runs straight to the cathedral. Aye, a cathedral. Folk on top think we only dig.',
    'When you want daylight again, step in the cage and give the word. E does it.',
  ]);
  miner(6.2, 30.6, -2.2, 'Dessa Varn', 'Face worker, the live seam', [
    'That glow is the seam. Ember ore — warm as bread, and it never goes out.',
    'There’s a loose piece on the crate there. Take it. One lump won’t be missed.',
    'Show it to Baron Rynva up in the penthouse. He goes soft over good ore — he’ll want to do something for your ship.',
  ]);
  miner(-9.6, 70, 1.9, 'Old Tamsin', 'Retired carver', [
    'Four generations cut this, between shifts and on rest days. Nobody was paid a chit for it.',
    'Every pillar took a year. My grandmother dressed the third on the left. You can still see where her chisel slipped.',
    'We left the ore in the walls on purpose. Stone that lights itself — why would you take that out?',
  ]);
  miner(3.4, 131.4, 2.9, 'Carver Ilo', 'Keeper of the east window', [
    'The window is one slab, pared so thin the heat behind it shows through. It took eleven years and we cracked two.',
    'And that in front is the Heart-ember. First crystal the claim ever struck. They built the nave to point at it.',
  ]);
  miner(19.8, 90.6, 1.57, 'Quiet Maro', 'Night shift', [
    'Shh. I come here before I go on. The Cage chapel. For getting back up.',
  ]);

  // =========================================================================
  // Base light so nothing is ever pure black
  // =========================================================================
  group.add(new THREE.HemisphereLight(0x6a3e28, 0x1a0c07, 0.6));

  // ---- queries -------------------------------------------------------------
  const CAGE_ROOM = [-CAGE_HW + 0.38, CAGE_HW - 0.38, -CAGE_HW + 0.38, CAGE_HW - 0.38];
  // the doorway between the cage and the station, open only at pit bottom
  const CAGE_DOOR = [-CAGE_HW + 0.38, CAGE_HW - 0.38, CAGE_HW - 0.5, SHAFT_HW + 0.7];

  // Is (x, z) somewhere the walker's centre may be? `cageOpen`: the cage is
  // parked at the bottom with its gate up.
  function inside(x, z, cageOpen) {
    if (x >= CAGE_ROOM[0] && x <= CAGE_ROOM[1] && z >= CAGE_ROOM[2] && z <= CAGE_ROOM[3]) return true;
    if (!cageOpen) return false;
    if (x >= CAGE_DOOR[0] && x <= CAGE_DOOR[1] && z >= CAGE_DOOR[2] && z <= CAGE_DOOR[3]) return true;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      if (x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3]) return true;
    }
    return false;
  }
  function blocked(x, z, rad) {
    for (let i = 0; i < obBox.length; i++) {
      const b = obBox[i];
      if (x > b[0] - rad && x < b[1] + rad && z > b[2] - rad && z < b[3] + rad) return true;
    }
    for (let i = 0; i < obCyl.length; i++) {
      const c = obCyl[i];
      const dx = x - c[0], dz = z - c[1], rr = c[2] + rad;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }
  function inCage(x, z) {
    return Math.abs(x) <= CAGE_HW && Math.abs(z) <= CAGE_HW;
  }
  // Floor height (the dais steps); the cage deck is the host's business.
  function floorYAt(x, z) {
    if (Math.abs(x) < NAVE_HW && z > NAVE_Z1 - 0.6) {
      const k = Math.min(3, Math.floor((z - (NAVE_Z1 - 0.6)) / 0.5) + 1);
      return 0.2 * k;
    }
    return 0;
  }
  // Clear height above the floor — for the third-person camera.
  function ceilAt(x, z) {
    if (inCage(x, z)) return CAGE_CEIL;
    if (z > NAVE_Z0 - 1 && Math.abs(x) < NAVE_HW) return 22;
    let best = 0;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      if (x >= r[0] - 0.6 && x <= r[1] + 0.6 && z >= r[2] - 0.6 && z <= r[3] + 0.6 && r[4] > best) best = r[4];
    }
    return best || 2.5;
  }

  // ---- per-frame ------------------------------------------------------------
  let cageY = 0;
  function setCage(y, gateOpen01) {
    cageY = y;
    cage.position.y = y;
    cageGate.position.y = gateOpen01 * 2.3;
    const len = Math.max(1, TOP - y - CAGE_CEIL - 0.7);
    rope.scale.y = len;
    rope.position.y = CAGE_CEIL + 0.7 + len / 2;
  }
  setCage(0, 1);

  let oreShown = true;
  function setOreAvailable(on) {
    oreShown = on;
    oreChunk.visible = on;
    oreRing.visible = on;
  }

  const _d = new THREE.Vector3();
  function update(dt, t, playerPos) {
    // the veins breathe, slowly, out of step with each other
    MATS.rough.emissiveIntensity = 0.7 + 0.2 * Math.sin(t * 0.7);
    MATS.shaft.emissiveIntensity = 1.15 + 0.3 * Math.sin(t * 0.9 + 2.0);
    MATS.smooth.emissiveIntensity = 0.6 + 0.16 * Math.sin(t * 0.45 + 1.3);
    MATS.ore.color.setScalar(1 + 0.12 * Math.sin(t * 1.1 + 0.4));
    MATS.paneBig.emissiveIntensity = 1.2 + 0.1 * Math.sin(t * 0.3);
    for (const c of chandeliers) {
      c.g.rotation.z = Math.sin(t * 0.55 + c.ph) * 0.012;
      c.g.rotation.x = Math.sin(t * 0.43 + c.ph * 1.7) * 0.009;
    }
    if (dust) {
      dust.position.y = Math.sin(t * 0.11) * 0.6;
      dust.position.x = Math.sin(t * 0.07 + 1) * 0.5;
    }
    if (oreShown) {
      oreChunk.rotation.y = t * 0.6;
      oreChunk.position.y = 0.74 + Math.sin(t * 1.8) * 0.03;
      oreRingMat.opacity = 0.55 + 0.4 * Math.sin(t * 3.0);
      const s = 1 + 0.06 * Math.sin(t * 3.0);
      oreRing.scale.set(s, s, 1);
    }
    for (const m of miners) {
      // breathe; turn to face a visitor, turn back when they leave
      _d.subVectors(playerPos, m.pos);
      const near = _d.x * _d.x + _d.z * _d.z < 49 && Math.abs(_d.y) < 3;
      const want = near ? Math.atan2(_d.x, _d.z) : m.homeYaw;
      let dy = want - m.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      m.yaw += dy * Math.min(1, 3 * dt);
      m.group.rotation.y = m.yaw;
      m.group.position.y = m.pos.y + Math.sin(t * 1.4 + m.ph) * 0.006;
    }
  }

  function dispose() {
    group.parent?.remove(group);
    group.clear();
    for (const o of owned) o.dispose();
    owned.length = 0;
  }

  return {
    group,
    cage,
    cageLight,
    setCage,
    get cageY() { return cageY; },
    shaftH: SHAFT_H,
    cageHalf: CAGE_HW,
    cageCeil: CAGE_CEIL,
    spawn: new THREE.Vector3(0, 0, 0),
    orePos,
    setOreAvailable,
    miners,
    inside,
    blocked,
    inCage,
    floorYAt,
    ceilAt,
    update,
    dispose,
    lights,
    // Named places, for the walker's compass and for headless checks.
    places: {
      cage: { x: 0, z: 0 },
      station: { x: 0, z: 8 },
      tunnel: { x: 0, z: 30 },
      stope: { x: 5.5, z: 28.5 },
      ore: { x: orePos.x, z: orePos.z },
      narthex: { x: 0, z: 46 },
      naveWest: { x: 0, z: 57 },
      naveMid: { x: 0, z: 94 },
      aisle: { x: 11, z: 94 },
      chapel: { x: 19.5, z: 94 },
      chancel: { x: 0, z: 136.5 },
      column: { x: colX, z: NAVE_Z0 + 3 * BAY },
    },
    info() {
      return {
        rooms: rooms.length, boxes: obBox.length, cylinders: obCyl.length, lights: lights.length,
        tris: Object.values(meshes).reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0),
        nave: { z0: NAVE_Z0, z1: NAVE_Z1, end: END_Z, halfWidth: NAVE_HW, aisle: AISLE_X1, apex: VAULT_APEX },
      };
    },
  };
}
