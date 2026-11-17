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
//   towers   one instanced box on a tile that wraps round the camera
//   cages    the nearest few caged stars, built in full
//   stars    every other caged star out to the horizon, one point each
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
import groundVert from '../src/shaders/megaGround.vert?raw';
import groundFrag from '../src/shaders/megaGround.frag?raw';
import towerVert from '../src/shaders/megaTower.vert?raw';
import hullFrag from '../src/shaders/tenretniHull.frag?raw';

// Towers by quality tier (medium is the Iris Xe target, GDD 2.1).
const TOWERS = { low: 2500, medium: 6000, high: 12000, ultra: 20000 };
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

function buildGround() {
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
    uHorizon: { value: 300000 },
    uFade: { value: 0 },
    uHaze: { value: new THREE.Color(C.FAR_HAZE) },
  };
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    vertexShader: groundVert,
    fragmentShader: CAGE_GLSL + groundFrag,
    uniforms,
  }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -4; // the first opaque thing down: everything stands on it
  return { mesh, uniforms };
}

// --- the towers ---

function buildTowers(sunDir) {
  // Every tier's towers are laid out once; the tier only says how many of
  // them are drawn, so a change of quality in flight costs one number.
  const count = Math.max(...Object.values(TOWERS));
  // half-block lots: two towers can share a block's frontage
  const LOT = C.FAR_BLOCK / 2;
  const side = Math.round(C.FAR_TILE / LOT);
  const lots = side * side;
  const r = rng(0x7e17e7);
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
      if (r() < 0.12 + 0.88 * k * k) break;
    }
    base[i * 2] = (lx + 0.5) * LOT;
    base[i * 2 + 1] = (lz + 0.5) * LOT;
    const h = r();
    dim[i * 3] = LOT * (0.45 + 0.45 * r());
    dim[i * 3 + 1] = C.FAR_TOWER_MIN + (C.FAR_TOWER_MAX - C.FAR_TOWER_MIN) * h * h * (0.25 + 0.75 * k) + (r() > 0.985 ? 160 : 0);
    dim[i * 3 + 2] = LOT * (0.45 + 0.45 * r());
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
  const drawn = () => Math.min(TOWERS[Q.tier] || TOWERS.medium, n);
  geo.instanceCount = drawn();
  onQualityChange(() => {
    geo.instanceCount = drawn();
  });
  const uniforms = {
    uSun: { value: sunDir },
    uHdr: { value: C.TENRETNI_HDR },
    uWin: { value: 0.032 },
    uTime: { value: 0 },
    uCore: { value: new THREE.Vector4(0, 0, 0, 0) },
    uS: { value: C.FAR_CAGE_SPACING },
    uTileOff: { value: new THREE.Vector2() },
    uOffCage: { value: new THREE.Vector2() },
    uTile: { value: C.FAR_TILE },
    uPad: { value: C.FAR_CAGE_PAD },
    uR: { value: C.FAR_RADIUS },
    uFade: { value: 0 },
  };
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    vertexShader: CAGE_GLSL + towerVert,
    fragmentShader: hullFrag,
    uniforms,
  }));
  mesh.frustumCulled = false;
  return { mesh, uniforms, count: () => geo.instanceCount };
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

function frameGeometry() {
  const H = C.FAR_CAGE_HEIGHT, R = C.FAR_CAGE_RING_R, T = C.FAR_CAGE_TUBE;
  const parts = [];
  const add = (g) => parts.push(g.toNonIndexed());
  // three meridian rings, one sixth of a turn apart
  for (let i = 0; i < 3; i++) add(new THREE.TorusGeometry(R, T, 8, 56).rotateY((i * Math.PI) / 3).translate(0, H, 0));
  // the equator, and a lighter ring in each hemisphere
  add(new THREE.TorusGeometry(R, T * 1.15, 8, 56).rotateX(Math.PI / 2).translate(0, H, 0));
  const lat = 0.7;
  for (const s of [-1, 1]) {
    add(new THREE.TorusGeometry(R * Math.cos(lat), T * 0.75, 8, 48).rotateX(Math.PI / 2).translate(0, H + s * R * Math.sin(lat), 0));
  }
  // the pedestal: a drum on the plate, a column up to the south pole
  add(new THREE.CylinderGeometry(R * 0.82, R * 1.18, 1300, 28).translate(0, 650, 0));
  add(new THREE.CylinderGeometry(R * 0.2, R * 0.46, H - R - 1300 + T, 14).translate(0, 1300 + (H - R - 1300 + T) / 2, 0));
  // four pylons carrying the equator
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    add(new THREE.CylinderGeometry(T * 0.8, T * 1.5, H, 8).translate(Math.cos(a) * (R + T * 1.2), H / 2, Math.sin(a) * (R + T * 1.2)));
  }
  // the spire on the north pole, with two yards
  const top = H + R;
  add(new THREE.CylinderGeometry(T * 0.22, T * 1.3, 4400, 8).translate(0, top + 2200, 0));
  add(new THREE.BoxGeometry(2400, T * 0.5, T * 0.5).translate(0, top + 1500, 0));
  add(new THREE.BoxGeometry(T * 0.5, T * 0.5, 1500).translate(0, top + 2700, 0));
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  geo.computeBoundingSphere();
  return geo;
}

function buildCages(sunDir) {
  const H = C.FAR_CAGE_HEIGHT;
  const starU = { uTime: { value: 0 }, uHdr: { value: C.FAR_STAR_HDR }, uFade: { value: 0 } };
  const starMat = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: starU });
  const frameU = {
    uSun: { value: sunDir },
    uHdr: { value: C.TENRETNI_HDR * 0.3 }, // a frame is structure, not a street: small lights, low
    uWin: { value: 0.011 },
    uTime: { value: 0 },
    uCore: { value: new THREE.Vector4(0, H, 0, 2.6) },
  };
  const frameMat = new THREE.ShaderMaterial({ vertexShader: FRAME_VERT, fragmentShader: hullFrag, uniforms: frameU });
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
    cages.push({ group, glow });
  }
  return { cages, starU, frameU };
}

// --- every other caged star, out to the horizon ---

const POINT_VERT = /* glsl */ `
  uniform float uR;
  uniform float uH; // star centre above the plane
  uniform float uStarR;
  uniform float uScale; // pixels per world unit at distance 1
  uniform float uCamAlt;
  varying float vFade;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    float d = distance(w.xz, cameraPosition.xz);
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
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    if (r > 1.0) discard;
    // a white-hot disc the size of the star, and its glow out to the edge
    float core = 1.0 - smoothstep(0.46, 0.60, r);
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

// Everything, unplaced and hidden. `sunDir`: the live unit vector toward the
// light (src/farside.js keeps it), shared by every hull material here.
export function buildMegaworld(sunDir) {
  const root = new THREE.Group();
  root.visible = false;
  const ground = buildGround();
  const towers = buildTowers(sunDir);
  const cage = buildCages(sunDir);
  const stars = buildPoints();
  root.add(ground.mesh, towers.mesh, stars.points);
  for (const c of cage.cages) root.add(c.group);
  return { root, ground, towers, cage, stars };
}
