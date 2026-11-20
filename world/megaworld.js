// The Tenretni megaworld: what is on the far side of the wormhole
// (src/farside.js; GDD 5.7.3).
//
// A machine world so large its surface is flat to the horizon, with captive
// stars held over it in cages of ring frames. Nothing here is a sphere: the
// camera's depth range could not hold one, and no planet in the game has the
// tessellation for it. The world is four things, all of them pure functions
// of where the camera is:
//
//   ground   one polar disc under the camera; the city is its fragment shader
//   towers   instanced boxes on tiles that wrap round the camera: the near
//            towers, the distant city's blocks out to ~45 km, and the spires
//            for a skyline out to ~60 km; all drawn into the ground's haze
//   cages    the nearest few caged stars, built in full; the rest in range
//            (LITE_RANGE, by tier) as a lighter instanced cage and star
//   stars    every other caged star out to the horizon, one point each (only
//            its halo where a lite cage is drawn)
//
// The cages stand on a jittered lattice. Which cells hold one, and where in
// the cell, is an integer hash small enough to be exact in fp32, written once
// in GLSL (CAGE_GLSL) and once here (cageAt): the ground shader lays the plate,
// the pool of light and the conduits under a cage from the same numbers this
// file stands the cage on.
//
// Builders only. src/farside.js places everything, every frame.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C } from '../src/constants.js';
import { Q, onQualityChange } from '../src/quality.js';
import { makeGlowSprite } from '../src/starburst.js';
import { holeDirection } from './farhole.js';
import { ERA, RITE, DAY } from '../src/era.js';
import groundVert from '../src/shaders/megaGround.vert?raw';
import groundFrag from '../src/shaders/megaGround.frag?raw';
import towerVert from '../src/shaders/megaTower.vert?raw';
import hullFrag from '../src/shaders/tenretniHull.frag?raw';

// Towers by quality tier (medium is the Iris Xe target, GDD 2.1).
const TOWERS = { low: 4000, medium: 11000, high: 17000, ultra: 24000 };
// The megastructures: kilometre-scale spires on a wider tile, for a skyline.
const SPIRES = { low: 360, medium: 880, high: 1440, ultra: 2080 };
// The distant city: big blocks on a wide tile, standing from where the towers
// sink to where the haze takes everything, so the roofscape runs on to the
// skyline instead of ending in a flat grid a few kilometres out.
const BLOCKS = { low: 6000, medium: 18000, high: 26000, ultra: 34000 };
// Caged stars drawn as real cages (a lighter build of the frame) out to this
// far; beyond it a star is a point.
const LITE_RANGE = { low: 90000, medium: 160000, high: 240000, ultra: 320000 };
export const liteRange = () => LITE_RANGE[Q.tier] || LITE_RANGE.medium;
export const LITE_MAX = 160; // instances the lite cages are built for
// The top of a cage: the north pole of the frame and the spire on it.
const SPIRE_H = 4400;
export const CAGE_TOP = C.FAR_CAGE_HEIGHT + C.FAR_CAGE_RING_R + SPIRE_H;
export const CAGE_PERIOD = 64; // the lattice repeats every this many cells
export const PATTERN_PERIOD = 1024; // ...and each ground pattern every this many of its own

// The lattice, GLSL side. `cell` is an integer cell id (any size: it is wrapped
// here); returns the cage's centre in the same space as the ids * uS, and 1 if
// the cell holds a cage at all. Every product stays far below 2^24.
export const CAGE_GLSL = /* glsl */ `
uniform float uS; // lattice spacing
vec3 cage(vec2 cell) {
  vec2 w = mod(cell, ${CAGE_PERIOD}.0);
  float a = mod(w.x * w.x * 5.0 + w.y * w.y * 7.0 + w.x * w.y * 3.0 + w.x * 17.0 + w.y * 31.0, 16.0);
  float b = mod(w.x * w.x * 3.0 + w.y * w.y * 11.0 + w.x * w.y * 5.0 + w.x * 13.0 + w.y * 23.0 + 3.0, 16.0);
  float pr = mod(w.x * 7.0 + w.y * 13.0 + w.x * w.y, 5.0);
  return vec3((cell + 0.5 + (vec2(a, b) / 16.0 - 0.46875) * 0.5) * uS, step(0.5, pr));
}
`;

// The lattice, JS side: the same integers. Fills out.x / out.z (lattice space)
// and returns whether cell (ix, iz) holds a cage.
export function cageAt(ix, iz, out) {
  const x = ((ix % CAGE_PERIOD) + CAGE_PERIOD) % CAGE_PERIOD;
  const z = ((iz % CAGE_PERIOD) + CAGE_PERIOD) % CAGE_PERIOD;
  const a = (x * x * 5 + z * z * 7 + x * z * 3 + x * 17 + z * 31) % 16;
  const b = (x * x * 3 + z * z * 11 + x * z * 5 + x * 13 + z * 23 + 3) % 16;
  out.x = (ix + 0.5 + (a / 16 - 0.46875) * 0.5) * C.FAR_CAGE_SPACING;
  out.z = (iz + 0.5 + (b / 16 - 0.46875) * 0.5) * C.FAR_CAGE_SPACING;
  return (x * 7 + z * 13 + x * z) % 5 !== 0;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- the ground ---

function buildGround(haze) {
  // rings spaced by a constant ratio: metres apart under the camera, tens of
  // kilometres apart at the rim, where a triangle is still a few pixels
  const SEG = 96, RINGS = 64, R0 = 40;
  const pos = new Float32Array((RINGS * SEG + 1) * 3);
  const idx = [];
  for (let r = 0; r < RINGS; r++) {
    const rad = R0 * Math.pow(C.FAR_DISC_RADIUS / R0, r / (RINGS - 1));
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const o = (1 + r * SEG + s) * 3;
      pos[o] = Math.cos(a) * rad;
      pos[o + 2] = Math.sin(a) * rad;
    }
  }
  // wound so the face normal is +y (seen from above)
  for (let s = 0; s < SEG; s++) idx.push(0, 1 + ((s + 1) % SEG), 1 + s);
  for (let r = 0; r < RINGS - 1; r++) {
    for (let s = 0; s < SEG; s++) {
      const a = 1 + r * SEG + s, b = 1 + r * SEG + ((s + 1) % SEG);
      const c = a + SEG, d = b + SEG;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const uniforms = {
    uR: { value: C.FAR_RADIUS },
    uS: { value: C.FAR_CAGE_SPACING },
    uAged: haze.uAged, // 0 as the pilot found it .. 1 a thousand years on (GDD 5.7.4)
    // a million years on (GDD 5.7.5): shared, set by src/farside.js
    uEra: ERA,
    uRite: RITE,
    uDayCol: DAY.col,
    uDayK: DAY.k,
    uOffPlate: { value: new THREE.Vector2() },
    uOffBlock: { value: new THREE.Vector2() },
    uOffDistrict: { value: new THREE.Vector2() },
    uOffCage: { value: new THREE.Vector2() },
    uPlate: { value: C.FAR_PLATE },
    uBlock: { value: C.FAR_BLOCK },
    uDistrict: { value: C.FAR_DISTRICT },
    uPad: { value: C.FAR_CAGE_PAD },
    uTime: { value: 0 },
    uHdr: { value: C.TENRETNI_HDR },
    uStarHdr: { value: C.FAR_STAR_HDR },
    uHorizon: haze.uHorizon,
    uFade: { value: 0 },
    uHaze: haze.uHaze,
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: groundVert,
    fragmentShader: CAGE_GLSL + groundFrag,
    uniforms,
    // tens of kilometres out the depth buffer is coarser than a block is
    // tall: pushed back a step, the ground never comes up through what
    // stands on it
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
  });
  // the traces and the relief are look, not structure: above the low tier only
  const detail = () => {
    const on = Q.tier !== 'low';
    if (!!material.defines.DETAIL === on) return;
    if (on) material.defines.DETAIL = '';
    else delete material.defines.DETAIL;
    material.needsUpdate = true;
  };
  detail();
  onQualityChange(detail);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -4; // the first opaque thing down: everything stands on it
  return { mesh, uniforms };
}

// --- the towers ---

// One layer of towers. `o`: { counts by tier, tile, lot, hMin, hMax, wide (of
// the lot), win, taper, seed, inner: [from, to] the range it rises over from
// the camera (where a finer layer hands over to it) }.
function buildTowers(sunDir, haze, o) {
  // Every tier's towers are laid out once; the tier only says how many of
  // them are drawn, so a change of quality in flight costs one number.
  const count = Math.max(...Object.values(o.counts));
  const LOT = o.lot;
  const side = Math.round(o.tile / LOT);
  const lots = side * side;
  const r = rng(o.seed);
  // pick `count` distinct lots (a partial shuffle)
  const order = new Uint32Array(lots);
  for (let i = 0; i < lots; i++) order[i] = i;
  const n = Math.min(count, lots);
  const base = new Float32Array(n * 2);
  const dim = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  // downtowns: some districts are built up and tall, their neighbours low and
  // thin, so the roofscape has a skyline instead of an even stubble
  const built = (lx, lz) => {
    const dx = Math.floor((lx * LOT) / C.FAR_DISTRICT), dz = Math.floor((lz * LOT) / C.FAR_DISTRICT);
    return ((dx * 7 + dz * 13 + dx * dz * 3) % 5) / 4;
  };
  for (let i = 0; i < n; i++) {
    // a lot not taken yet, drawn again (a few times at most) if its district is a thin one
    let lx = 0, lz = 0, k = 0;
    for (let tries = 0; tries < 6; tries++) {
      const j = i + Math.floor(r() * (lots - i));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
      lx = order[i] % side;
      lz = Math.floor(order[i] / side);
      k = built(lx, lz);
      if (r() < 0.4 + 0.6 * k * k) break; // built up everywhere, more so downtown
    }
    base[i * 2] = (lx + 0.5) * LOT;
    base[i * 2 + 1] = (lz + 0.5) * LOT;
    const h = r();
    dim[i * 3] = LOT * (o.wide + 0.45 * r());
    dim[i * 3 + 1] = o.hMin + (o.hMax - o.hMin) * h * h * (0.25 + 0.75 * k) + (r() > 0.985 ? o.hMin * 1.4 : 0);
    dim[i * 3 + 2] = LOT * (o.wide + 0.45 * r());
    seed[i] = r();
  }
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = box.index;
  geo.setAttribute('position', box.getAttribute('position'));
  geo.setAttribute('normal', box.getAttribute('normal'));
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 2));
  geo.setAttribute('aDim', new THREE.InstancedBufferAttribute(dim, 3));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  const drawn = () => Math.min(o.counts[Q.tier] || o.counts.medium, n);
  geo.instanceCount = drawn();
  onQualityChange(() => {
    geo.instanceCount = drawn();
  });
  const uniforms = {
    uSun: { value: sunDir },
    uHdr: { value: C.TENRETNI_HDR },
    uWin: { value: o.win },
    uTime: { value: 0 },
    uCore: { value: new THREE.Vector4(0, 0, 0, 0) },
    uEra: ERA,
    uDayK: DAY.k,
    uS: { value: C.FAR_CAGE_SPACING },
    uTileOff: { value: new THREE.Vector2() },
    uOffCage: { value: new THREE.Vector2() },
    uTaper: { value: o.taper },
    uLand: { value: new THREE.Vector3(0, 0, 0) },
    uTile: { value: o.tile },
    uPad: { value: C.FAR_CAGE_PAD },
    uR: { value: C.FAR_RADIUS },
    uFade: { value: 0 },
    uInner: { value: new THREE.Vector2(...(o.inner || [-2, -1])) },
    ...haze,
  };
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    vertexShader: CAGE_GLSL + towerVert,
    fragmentShader: hullFrag,
    uniforms,
    defines: { HAZE: '' },
  }));
  mesh.frustumCulled = false;
  return { mesh, uniforms, tile: o.tile, count: () => geo.instanceCount };
}

// --- a caged star ---

const NOISE = /* glsl */ `
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
`;

// The star itself: the sun's photosphere (src/sun.js), small and close.
const STAR_VERT = /* glsl */ `
  varying vec3 vDir;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vDir = normalize(position);
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const STAR_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uHdr;
  uniform float uFade;
  varying vec3 vDir;
  varying vec3 vN;
  varying vec3 vView;
  ${NOISE}
  void main() {
    float mu = max(dot(normalize(vN), normalize(vView)), 0.0);
    float limb = 0.34 + 0.66 * pow(mu, 0.55);
    float t = uTime * 0.05;
    float g = 0.55 * vnoise(vDir * 7.0 + t) + 0.3 * vnoise(vDir * 19.0 - t * 1.6) + 0.15 * vnoise(vDir * 47.0 + t * 2.3);
    // kept orange: a caged star is seen close, and a white disc has no surface
    vec3 cool = vec3(0.90, 0.20, 0.02);
    vec3 hot = vec3(1.0, 0.60, 0.16);
    vec3 col = mix(cool, hot, smoothstep(0.25, 0.95, limb * (0.45 + 0.75 * g))) * limb * (0.7 + 0.6 * g);
    gl_FragColor = vec4(col * uHdr * uFade, 1.0);
  }
`;

// The cage's frame: local units, y = 0 on the ground. Pairs with the hull
// fragment shader; vUp is held at 0 (its roof glow is a tower's, not a ring's).
const FRAME_VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vWorldNormal;
  varying vec3 vView;
  varying float vUp;
  void main() {
    vPos = position;
    vUp = 0.0;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Where the time conduits land on a cage (world/farhole.js conduit()): two
// collectors on its gantry ring, either side of the bearing to the hole. Cage-
// local, y = 0 on the ground.
const GANTRY_H = 1500;
function collectorSpots() {
  const d = holeDirection(new THREE.Vector3());
  const az = Math.atan2(d.z, d.x);
  const R = C.FAR_CAGE_PAD * 0.9;
  return [-1.05, 1.05].map((off) => new THREE.Vector3(Math.cos(az + off) * R, GANTRY_H + 620, Math.sin(az + off) * R));
}

// `lite`: the build drawn for the cages beyond the nearest few, instanced by
// the dozen: a third of the segments round each ring, half round each tube, and tubes a little heavier so a frame
// tens of kilometres off is still a line and not a shimmer.
function frameGeometry(lite = false) {
  const H = C.FAR_CAGE_HEIGHT, R = C.FAR_CAGE_RING_R, T = C.FAR_CAGE_TUBE * (lite ? 1.3 : 1);
  const n = (k) => (lite ? Math.max(4, Math.round(k / 3)) : k); // segments round a ring
  const m = (k) => (lite ? Math.max(3, Math.round(k / 2)) : k); // ...and round a tube
  const parts = [];
  const add = (g) => parts.push(g.toNonIndexed());
  // three meridian rings, one sixth of a turn apart
  for (let i = 0; i < 3; i++) add(new THREE.TorusGeometry(R, T, m(8), n(56)).rotateY((i * Math.PI) / 3).translate(0, H, 0));
  // the equator, and a lighter ring in each hemisphere
  add(new THREE.TorusGeometry(R, T * 1.15, m(8), n(56)).rotateX(Math.PI / 2).translate(0, H, 0));
  const lat = 0.7;
  for (const s of [-1, 1]) {
    add(new THREE.TorusGeometry(R * Math.cos(lat), T * 0.75, m(8), n(48)).rotateX(Math.PI / 2).translate(0, H + s * R * Math.sin(lat), 0));
  }
  // the pedestal: a drum on the plate, a column up to the south pole
  add(new THREE.CylinderGeometry(R * 0.82, R * 1.18, 1300, m(28)).translate(0, 650, 0));
  add(new THREE.CylinderGeometry(R * 0.2, R * 0.46, H - R - 1300 + T, m(14)).translate(0, 1300 + (H - R - 1300 + T) / 2, 0));
  // four pylons carrying the equator
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    add(new THREE.CylinderGeometry(T * 0.8, T * 1.5, H, m(8)).translate(Math.cos(a) * (R + T * 1.2), H / 2, Math.sin(a) * (R + T * 1.2)));
  }
  // a gantry ring round the foot of it all, on eight legs, over the roofs
  const GR = C.FAR_CAGE_PAD * 0.9, GH = GANTRY_H;
  add(new THREE.TorusGeometry(GR, T * 0.7, m(8), n(72)).rotateX(Math.PI / 2).translate(0, GH, 0));
  add(new THREE.TorusGeometry(GR * 0.78, T * 0.4, m(6), n(64)).rotateX(Math.PI / 2).translate(0, GH * 0.62, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    add(new THREE.CylinderGeometry(T * 0.45, T * 0.8, GH, m(6)).translate(Math.cos(a) * GR, GH / 2, Math.sin(a) * GR));
    // a spar from each leg in to the pedestal
    add(new THREE.BoxGeometry(GR - R * 1.1, T * 0.35, T * 0.35).translate((GR + R * 1.1) / 2, GH * 0.62, 0).rotateY(-a));
  }
  // the collectors: a drum on the ring with a throat for what comes down
  for (const p of collectorSpots()) {
    add(new THREE.CylinderGeometry(560, 760, 420, m(16)).translate(p.x, GH + 210, p.z));
    add(new THREE.CylinderGeometry(300, 520, 260, m(16)).translate(p.x, GH + 520, p.z));
    add(new THREE.TorusGeometry(640, T * 0.3, m(6), n(28)).rotateX(Math.PI / 2).translate(p.x, GH + 430, p.z));
  }
  // the spire on the north pole, with two yards
  const top = H + R;
  add(new THREE.CylinderGeometry(T * 0.22, T * 1.3, SPIRE_H, m(8)).translate(0, top + SPIRE_H / 2, 0));
  add(new THREE.BoxGeometry(2400, T * 0.5, T * 0.5).translate(0, top + 1500, 0));
  add(new THREE.BoxGeometry(T * 0.5, T * 0.5, 1500).translate(0, top + 2700, 0));
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  geo.computeBoundingSphere();
  return geo;
}

// The lite cages (every cage in range but the nearest few): the frame and the
// star, each one instanced draw. `aOff` is the cage's foot from the mesh's own
// origin, which src/farside.js keeps at the camera's lattice cell corner, so
// fp32 only ever holds a few hundred kilometres.
const LITE_FRAME_VERT = /* glsl */ `
  attribute vec3 aOff;
  uniform float uR;
  varying vec3 vPos;
  varying vec3 vWorldNormal;
  varying vec3 vView;
  varying float vUp;
  void main() {
    vPos = position;
    vUp = 0.0;
    vWorldNormal = normal;
    vec4 world = modelMatrix * vec4(aOff.x + position.x, position.y, aOff.z + position.z, 1.0);
    vec2 foot = (modelMatrix * vec4(aOff.x, 0.0, aOff.z, 1.0)).xz - cameraPosition.xz;
    world.y -= dot(foot, foot) / (2.0 * uR); // on the curve the ground is drawn with
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const LITE_STAR_VERT = /* glsl */ `
  attribute vec3 aOff;
  uniform float uR;
  uniform float uH;
  varying vec3 vDir;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vDir = normalize(position);
    vN = normal;
    vec4 world = modelMatrix * vec4(aOff.x + position.x, uH + position.y, aOff.z + position.z, 1.0);
    vec2 foot = (modelMatrix * vec4(aOff.x, 0.0, aOff.z, 1.0)).xz - cameraPosition.xz;
    world.y -= dot(foot, foot) / (2.0 * uR);
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

function buildCages(sunDir, haze) {
  const H = C.FAR_CAGE_HEIGHT;
  const starU = { uTime: { value: 0 }, uHdr: { value: C.FAR_STAR_HDR }, uFade: { value: 0 } };
  const starMat = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: starU });
  const frameU = {
    uSun: { value: sunDir },
    uHdr: { value: C.TENRETNI_HDR * 0.3 }, // a frame is structure, not a street: small lights, low
    uWin: { value: 0.011 },
    uTime: { value: 0 },
    uCore: { value: new THREE.Vector4(0, H, 0, 2.6) },
    uEra: ERA,
    uDayK: DAY.k,
    ...haze,
  };
  const frameMat = new THREE.ShaderMaterial({ vertexShader: FRAME_VERT, fragmentShader: hullFrag, uniforms: frameU, defines: { HAZE: '' } });
  const starGeo = new THREE.SphereGeometry(C.FAR_CAGE_STAR_R, 40, 24);
  const frameGeo = frameGeometry();
  const glow0 = makeGlowSprite(0xffa050, C.FAR_CAGE_STAR_R * 2.4, 0.22);
  const cages = [];
  for (let i = 0; i < C.FAR_CAGE_FULL; i++) {
    const group = new THREE.Group();
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.y = H;
    const glow = i === 0 ? glow0 : glow0.clone();
    glow.position.y = H;
    group.add(new THREE.Mesh(frameGeo, frameMat), star, glow);
    group.visible = false;
    cages.push({ group, glow, star });
  }

  // ...and the rest, lite
  const off = new THREE.InstancedBufferAttribute(new Float32Array(LITE_MAX * 3), 3);
  off.setUsage(THREE.DynamicDrawUsage);
  const instanced = (src) => {
    const g = new THREE.InstancedBufferGeometry();
    g.index = src.index;
    for (const k of ['position', 'normal']) g.setAttribute(k, src.getAttribute(k));
    g.setAttribute('aOff', off);
    g.instanceCount = 0;
    return g;
  };
  const uR = { value: C.FAR_RADIUS };
  const liteFrame = new THREE.Mesh(
    instanced(frameGeometry(true)),
    new THREE.ShaderMaterial({ vertexShader: LITE_FRAME_VERT, fragmentShader: hullFrag, uniforms: { ...frameU, uR }, defines: { HAZE: '' } })
  );
  const liteStar = new THREE.Mesh(
    instanced(new THREE.SphereGeometry(C.FAR_CAGE_STAR_R, 20, 12)),
    new THREE.ShaderMaterial({ vertexShader: LITE_STAR_VERT, fragmentShader: STAR_FRAG, uniforms: { ...starU, uR, uH: { value: H } } })
  );
  const lite = new THREE.Group();
  for (const m of [liteFrame, liteStar]) {
    m.frustumCulled = false;
    lite.add(m);
  }
  // how many of the attribute's slots are drawn
  const setLite = (n) => {
    liteFrame.geometry.instanceCount = liteStar.geometry.instanceCount = n;
    lite.visible = n > 0;
  };
  return { cages, starU, frameU, lite: { group: lite, star: liteStar, attr: off, set: setLite } };
}

// --- every other caged star, out to the horizon ---

const POINT_VERT = /* glsl */ `
  uniform float uR;
  uniform float uH; // star centre above the plane
  uniform float uStarR;
  uniform float uScale; // pixels per world unit at distance 1
  uniform float uCamAlt;
  uniform float uLite; // inside this the star is drawn as a sphere in its cage: only the halo here
  varying float vFade;
  varying float vCore;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    float d = distance(w.xz, cameraPosition.xz);
    vCore = smoothstep(uLite * 0.9, uLite, d);
    w.y += uH - d * d / (2.0 * uR);
    // seen only while the world's own curve has not taken it
    float reach = sqrt(2.0 * uR * max(uCamAlt, 1.0)) + sqrt(2.0 * uR * (uH + uStarR));
    vFade = 1.0 - smoothstep(0.86, 1.0, d / reach);
    vec4 mv = viewMatrix * w;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * uStarR * 3.4 / max(-mv.z, 1.0), 2.0, 96.0);
    if (d > reach) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;
const POINT_FRAG = /* glsl */ `
  uniform float uHdr;
  uniform float uFade;
  varying float vFade;
  varying float vCore;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    if (r > 1.0) discard;
    // a white-hot disc the size of the star, and its glow out to the edge
    float core = (1.0 - smoothstep(0.46, 0.60, r)) * vCore;
    float halo = pow(1.0 - r, 2.6);
    vec3 col = vec3(1.0, 0.62, 0.26) * core * uHdr * 0.9 + vec3(1.0, 0.42, 0.12) * halo * 0.3;
    gl_FragColor = vec4(col * vFade * uFade, 1.0);
  }
`;

function buildPoints() {
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(new Float32Array(C.FAR_CAGE_POINTS * 3), 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr);
  geo.setDrawRange(0, 0);
  const uniforms = {
    uR: { value: C.FAR_RADIUS },
    uH: { value: C.FAR_CAGE_HEIGHT },
    uStarR: { value: C.FAR_CAGE_STAR_R },
    uScale: { value: 600 },
    uCamAlt: { value: C.FAR_ARRIVE_ALT },
    uLite: { value: 0 },
    uHdr: { value: C.FAR_STAR_HDR },
    uFade: { value: 0 },
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    uniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  points.frustumCulled = false;
  return { points, attr, uniforms };
}

// The one star that was kept (GDD 5.7.5, EZ_LIGHT 'sun'): uncaged, a long way
// off, and the megaworld goes round it. One point, drawn as a disc and its
// glare; src/farside.js puts it where the day's light comes from.
const SUN_VERT = /* glsl */ `
  uniform float uSize;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize;
  }
`;
const SUN_FRAG = /* glsl */ `
  uniform vec3 uCol;
  uniform float uFade;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    if (r > 1.0) discard;
    float core = 1.0 - smoothstep(0.1, 0.14, r);
    float glare = pow(1.0 - r, 3.2);
    gl_FragColor = vec4(uCol * (core * 5.0 + glare * 0.9) * uFade, 1.0);
  }
`;
function buildSun() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const uniforms = { uSize: { value: 220 }, uCol: DAY.col, uFade: { value: 0 } };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: SUN_VERT, fragmentShader: SUN_FRAG, uniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  points.frustumCulled = false;
  points.visible = false;
  return { points, uniforms };
}

// Everything, unplaced and hidden. `sunDir`: the live unit vector toward the
// light (src/farside.js keeps it), shared by every hull material here.
export function buildMegaworld(sunDir) {
  const root = new THREE.Group();
  root.visible = false;
  // the haze, shared by the ground and everything standing on it; uHorizon is
  // set from the camera's height every frame (src/farside.js)
  const haze = {
    uHaze: { value: new THREE.Color(C.FAR_HAZE) },
    uHorizon: { value: 300000 },
    uAged: { value: 0 },
    uDayCol: DAY.col,
  };
  const ground = buildGround(haze);
  // half-block lots: two towers can share a block's frontage
  const towers = buildTowers(sunDir, haze, {
    counts: TOWERS, tile: C.FAR_TILE, lot: C.FAR_BLOCK / 2, hMin: C.FAR_TOWER_MIN, hMax: C.FAR_TOWER_MAX,
    wide: 0.45, win: 0.032, taper: 0, seed: 0x7e17e7,
  });
  // one to a district, and far fewer than there are districts
  const spires = buildTowers(sunDir, haze, {
    counts: SPIRES, tile: C.FAR_SPIRE_TILE, lot: C.FAR_DISTRICT, hMin: 800, hMax: C.FAR_SPIRE_MAX,
    wide: 0.16, win: 0.0075, taper: 0.62, seed: 0x5e17a,
  });
  // the distant city: rises where the towers sink, and runs on into the haze
  const blocks = buildTowers(sunDir, haze, {
    counts: BLOCKS, tile: C.FAR_BLOCK_TILE, lot: C.FAR_DISTRICT / 4, hMin: 140, hMax: 980,
    wide: 0.4, win: 0.012, taper: 0.3, seed: 0xb10c5,
    inner: [0.3 * C.FAR_TILE, 0.44 * C.FAR_TILE],
  });
  const cage = buildCages(sunDir, haze);
  const stars = buildPoints();
  const kept = buildSun();
  root.add(ground.mesh, towers.mesh, blocks.mesh, spires.mesh, cage.lite.group, stars.points, kept.points);
  for (const c of cage.cages) root.add(c.group);
  return { root, ground, towers, blocks, spires, cage, stars, kept, haze, collectors: collectorSpots() };
}
