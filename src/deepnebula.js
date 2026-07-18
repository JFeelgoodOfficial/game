// Deep nebula (owner request) — "The Sisters Nebula". A second nebula, unlike the
// camera-following skybox in nebula.js: this one is a DISCRETE body placed out
// in the world that you fly INTO and THROUGH. It is a field of additive point
// clouds (the starfield.js technique) at a fixed world position (the blackhole.js
// placement pattern), so parallax and the fly-through come for free.
//
// Reinterprets the owner's painting — black/teal marbled paint with gold-leaf
// flakes — as deep space:
//   - teal gas billows piled around a dark, hollow central spine (the black flow),
//   - warm golden-orange emission clumps offset to one side (the gold leaf),
//   - high-contrast stars embedded in the gas (the white specks),
//   - a near-black dust layer along the spine that occludes the gas behind it.
//
// All buffers are generated ONCE at init (like the starfield); per frame we only
// push a couple of uniforms. Nothing re-bakes. A tiny mass (no radius) gives a
// gentle, always-escapable pull — like the black hole, the nebula is not a hazard.

import * as THREE from 'three';
import { C } from './constants.js';
import { addShiftable } from './origin.js';
import { addBody } from './gravity.js';
import gasVert from './shaders/deepnebula.vert?raw';
import gasFrag from './shaders/deepnebula.frag?raw';
import dustFrag from './shaders/deepnebulaDust.frag?raw';

export const deepNebula = { group: null, mats: [] };

// World direction to the field: the black hole's corner (its dir is
// (0.52,0.14,-0.84)), but its own line and further out, so you don't reach it
// straight through the hole.
const FIELD_DIR = new THREE.Vector3(0.58, 0.20, -0.79).normalize();

// --- local frame: the spine axis (flow of the black paint) and the gold side ---
const AXIS = new THREE.Vector3(0.35, 0.15, 1.0).normalize();
const GOLD_SIDE = new THREE.Vector3(-0.5, -0.75, 0.2).normalize();

// Two axes perpendicular to AXIS, for the spine's lateral bend and jitter.
const PERP1 = new THREE.Vector3();
const PERP2 = new THREE.Vector3();
{
  const up = Math.abs(AXIS.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  PERP1.crossVectors(AXIS, up).normalize();
  PERP2.crossVectors(AXIS, PERP1).normalize();
}

// The spine: a gently bent polyline through the field, sampled once into a flat
// [x,y,z, x,y,z, ...] array. distToSpine() measures nearest distance to it.
const SPINE_N = 32;
const spine = new Float32Array(SPINE_N * 3);
{
  const R = C.NEBULA_FIELD_RADIUS;
  const half = 0.72 * R;
  const bend = 0.22 * R;
  for (let i = 0; i < SPINE_N; i++) {
    const t = (i / (SPINE_N - 1)) * 2 - 1; // -1 .. 1
    const b1 = Math.sin(t * Math.PI * 0.9) * bend;
    const b2 = Math.sin(t * Math.PI * 1.7 + 0.6) * bend * 0.6;
    spine[i * 3] = AXIS.x * t * half + PERP1.x * b1 + PERP2.x * b2;
    spine[i * 3 + 1] = AXIS.y * t * half + PERP1.y * b1 + PERP2.y * b2;
    spine[i * 3 + 2] = AXIS.z * t * half + PERP1.z * b1 + PERP2.z * b2;
  }
}

function distToSpine(px, py, pz) {
  let best = Infinity;
  for (let i = 0; i < SPINE_N - 1; i++) {
    const ax = spine[i * 3], ay = spine[i * 3 + 1], az = spine[i * 3 + 2];
    const bx = spine[i * 3 + 3], by = spine[i * 3 + 4], bz = spine[i * 3 + 5];
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const wx = px - ax, wy = py - ay, wz = pz - az;
    const len2 = ex * ex + ey * ey + ez * ez;
    let s = len2 > 0 ? (wx * ex + wy * ey + wz * ez) / len2 : 0;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    const dx = wx - ex * s, dy = wy - ey * s, dz = wz - ez * s;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

const _d = new THREE.Vector3();
function randDir(out) {
  let x, y, z, l;
  do {
    x = Math.random() * 2 - 1;
    y = Math.random() * 2 - 1;
    z = Math.random() * 2 - 1;
    l = x * x + y * y + z * z;
  } while (l > 1 || l < 1e-4);
  l = Math.sqrt(l);
  out.set(x / l, y / l, z / l);
  return out;
}

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

// Nearest point on the spine at parameter t in [0,1], into `out`.
function spineAt(t, out) {
  const f = t * (SPINE_N - 1);
  const i = Math.min(Math.floor(f), SPINE_N - 2);
  const s = f - i;
  out.set(
    spine[i * 3] + (spine[i * 3 + 3] - spine[i * 3]) * s,
    spine[i * 3 + 1] + (spine[i * 3 + 4] - spine[i * 3 + 1]) * s,
    spine[i * 3 + 2] + (spine[i * 3 + 5] - spine[i * 3 + 2]) * s
  );
  return out;
}

const _colTeal = new THREE.Color(C.NEBULA_TEAL);
const _colTealDeep = new THREE.Color(C.NEBULA_TEAL_DEEP);
const _colGold = new THREE.Color(C.NEBULA_GOLD);
const _colGoldHot = new THREE.Color(C.NEBULA_GOLD_HOT);
const _colDust = new THREE.Color(C.NEBULA_DUST_COLOR);

function makeCloud({ positions, colors, sizes, frag, blending, renderOrder, opacity }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const uniforms = {
    uScale: { value: 1 },
    uPixelRatio: { value: 1 },
    uIntensity: { value: C.NEBULA_FIELD_INTENSITY },
  };
  if (opacity !== undefined) uniforms.uOpacity = { value: opacity };

  const mat = new THREE.ShaderMaterial({
    vertexShader: gasVert,
    fragmentShader: frag,
    uniforms,
    transparent: true,
    blending,
    depthWrite: false,
    depthTest: true,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = renderOrder;
  deepNebula.mats.push(mat);
  return points;
}

// The teal body: rejection-sample the field, carving a dark hollow around the
// spine and piling the gas into a bright shell hugging it. Low per-sprite
// brightness so additive overlap accumulates into smooth gas. Keeps its
// positions for buildStars() to embed stars in the gas.
let gasPositions = null;

function buildGas() {
  const N = C.NEBULA_GAS_COUNT;
  const R = C.NEBULA_FIELD_RADIUS;
  const CORE_R = 0.16 * R;
  const SHELL_R = 0.30 * R;
  const SHELL_W = 0.22 * R;

  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);

  let n = 0;
  let guard = 0;
  while (n < N && guard < N * 40) {
    guard++;
    randDir(_d);
    const rad = R * Math.pow(Math.random(), 0.55);
    const px = _d.x * rad, py = _d.y * rad, pz = _d.z * rad;

    const ds = distToSpine(px, py, pz);
    const wEdge = 1 - smoothstep(0.72 * R, R, rad);
    const wCore = smoothstep(CORE_R * 0.4, CORE_R * 1.3, ds); // 0 inside spine -> hollow
    const shell = Math.exp(-Math.pow((ds - SHELL_R) / SHELL_W, 2));
    const w = wEdge * wCore * (0.4 + 0.6 * shell);
    if (Math.random() > w) continue;

    positions[n * 3] = px;
    positions[n * 3 + 1] = py;
    positions[n * 3 + 2] = pz;

    // colour: deep teal in the wisps, bright teal at the billow crests
    const crest = shell;
    const b = C.NEBULA_GAS_BRIGHTNESS * (0.5 + Math.random());
    colors[n * 3] = (_colTealDeep.r + (_colTeal.r - _colTealDeep.r) * crest) * b;
    colors[n * 3 + 1] = (_colTealDeep.g + (_colTeal.g - _colTealDeep.g) * crest) * b;
    colors[n * 3 + 2] = (_colTealDeep.b + (_colTeal.b - _colTealDeep.b) * crest) * b;

    sizes[n] = 200 + 380 * Math.random();
    n++;
  }
  // trim if rejection sampling fell short (it won't, but stay safe)
  gasPositions = positions.subarray(0, n * 3);
  return makeCloud({
    positions: positions.subarray(0, n * 3),
    colors: colors.subarray(0, n * 3),
    sizes: sizes.subarray(0, n),
    frag: gasFrag,
    blending: THREE.AdditiveBlending,
    renderOrder: -3,
  });
}

// Warm gold-leaf emission: a handful of gaussian clumps offset toward GOLD_SIDE,
// like the gold flakes gathered to one side/bottom of the painting. Clump cores
// are pushed above 1.0 so the bloom pass makes them glow.
function buildWarm() {
  const N = C.NEBULA_WARM_COUNT;
  const R = C.NEBULA_FIELD_RADIUS;
  const K = 7;
  const CLUMP_R = 0.12 * R;

  const centers = [];
  const _s = new THREE.Vector3();
  for (let k = 0; k < K; k++) {
    const t = 0.15 + 0.7 * Math.random();
    spineAt(t, _s);
    randDir(_d);
    centers.push(new THREE.Vector3(
      _s.x + GOLD_SIDE.x * 0.26 * R + _d.x * 0.06 * R,
      _s.y + GOLD_SIDE.y * 0.26 * R + _d.y * 0.06 * R,
      _s.z + GOLD_SIDE.z * 0.26 * R + _d.z * 0.06 * R
    ));
  }

  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const c = centers[i % K];
    // gaussian-ish offset: mean of two uniforms biased to the centre
    randDir(_d);
    const rr = CLUMP_R * Math.pow(Math.random(), 1.6);
    const px = c.x + _d.x * rr, py = c.y + _d.y * rr, pz = c.z + _d.z * rr;
    positions[i * 3] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;

    const inner = 1 - rr / CLUMP_R; // 1 at core .. 0 at edge
    // restrained warmth; only the very cores punch past 1.0 so a few points
    // bloom without the whole clump washing to white
    const b = 0.13 * (0.4 + 0.6 * inner) + Math.pow(inner, 4) * 0.55;
    colors[i * 3] = (_colGold.r + (_colGoldHot.r - _colGold.r) * inner) * b;
    colors[i * 3 + 1] = (_colGold.g + (_colGoldHot.g - _colGold.g) * inner) * b;
    colors[i * 3 + 2] = (_colGold.b + (_colGoldHot.b - _colGold.b) * inner) * b;

    sizes[i] = 120 + 260 * Math.random();
  }
  return makeCloud({
    positions, colors, sizes,
    frag: gasFrag,
    blending: THREE.AdditiveBlending,
    renderOrder: -3,
  });
}

// Embedded stars: mostly placed IN the gas (sample a gas point + jitter), plus a
// sparse uniform scatter. A cubic brightness tail so a few punch past 1.0 and
// bloom; biased white/blue with a warm minority.
const _star = new THREE.Color();
function starColor(out) {
  const t = Math.random();
  if (t < 0.6) out.setRGB(0.85 + 0.15 * Math.random(), 0.9 + 0.1 * Math.random(), 1.0);
  else if (t < 0.85) out.setRGB(1.0, 0.97 + 0.03 * Math.random(), 0.85 + 0.12 * Math.random());
  else out.setRGB(1.0, 0.6 + 0.2 * Math.random(), 0.42 + 0.2 * Math.random());
  return out;
}

function buildStars() {
  const N = C.NEBULA_STAR_COUNT;
  const R = C.NEBULA_FIELD_RADIUS;
  const gasN = gasPositions ? gasPositions.length / 3 : 0;

  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (gasN > 0 && Math.random() < 0.7) {
      const g = (Math.floor(Math.random() * gasN)) * 3;
      randDir(_d);
      const j = 0.05 * R * Math.random();
      positions[i * 3] = gasPositions[g] + _d.x * j;
      positions[i * 3 + 1] = gasPositions[g + 1] + _d.y * j;
      positions[i * 3 + 2] = gasPositions[g + 2] + _d.z * j;
    } else {
      randDir(_d);
      const rad = R * Math.pow(Math.random(), 0.5);
      positions[i * 3] = _d.x * rad;
      positions[i * 3 + 1] = _d.y * rad;
      positions[i * 3 + 2] = _d.z * rad;
    }
    starColor(_star);
    const b = 0.25 + 1.5 * Math.pow(Math.random(), 3);
    colors[i * 3] = _star.r * b;
    colors[i * 3 + 1] = _star.g * b;
    colors[i * 3 + 2] = _star.b * b;
    sizes[i] = 20 + 45 * Math.random();
  }
  return makeCloud({
    positions, colors, sizes,
    frag: gasFrag,
    blending: THREE.AdditiveBlending,
    renderOrder: -2,
  });
}

// Dark dust along the spine — NormalBlending, drawn last, so it occludes the
// bright gas behind it and gives the nebula its dense black central mass.
function buildDust() {
  const N = C.NEBULA_DUST_COUNT;
  if (N <= 0) return null;
  const R = C.NEBULA_FIELD_RADIUS;
  const CORE_R = 0.18 * R;

  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const _s = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const t = Math.random();
    spineAt(t, _s);
    randDir(_d);
    const rr = CORE_R * Math.pow(Math.random(), 0.7);
    positions[i * 3] = _s.x + _d.x * rr;
    positions[i * 3 + 1] = _s.y + _d.y * rr;
    positions[i * 3 + 2] = _s.z + _d.z * rr;

    const v = 0.7 + 0.6 * Math.random(); // faint value variation
    colors[i * 3] = _colDust.r * v;
    colors[i * 3 + 1] = _colDust.g * v;
    colors[i * 3 + 2] = _colDust.b * v;

    sizes[i] = 150 + 350 * Math.random();
  }
  return makeCloud({
    positions, colors, sizes,
    frag: dustFrag,
    blending: THREE.NormalBlending,
    renderOrder: -1,
    opacity: C.NEBULA_DUST_OPACITY,
  });
}

export function initDeepNebula(scene) {
  const group = new THREE.Group();
  group.position.copy(FIELD_DIR).multiplyScalar(C.NEBULA_FIELD_DISTANCE);

  const gas = buildGas();
  const warm = buildWarm();
  const stars = buildStars();
  const dust = buildDust();
  group.add(gas, warm, stars);
  if (dust) group.add(dust);

  scene.add(group);
  addShiftable(group); // floating-origin: the field moves with the world

  // Gentle, always-escapable pull. No radius: never opts into the altitude
  // floor or heat systems — a nebula is not a hazard (cf. the black hole).
  addBody({ position: group.position, mass: C.NEBULA_FIELD_MASS });

  deepNebula.group = group;
}

const _size = new THREE.Vector2();

// Per frame: map a world sprite radius to pixels (uScale depends on live FOV,
// which changes on boost/warp, and viewport). No geometry rebuild.
export function updateDeepNebula(renderer, camera) {
  renderer.getSize(_size);
  const scale = 0.5 * _size.y / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
  const pr = renderer.getPixelRatio();
  for (const m of deepNebula.mats) {
    m.uniforms.uScale.value = scale;
    m.uniforms.uPixelRatio.value = pr;
    m.uniforms.uIntensity.value = C.NEBULA_FIELD_INTENSITY;
  }
}
