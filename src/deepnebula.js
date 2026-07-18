// Deep nebulae (owner feature) — flyable nebulae reinterpreted from the owner's
// paintings. Unlike the camera-following skybox in nebula.js, each of these is a
// DISCRETE body placed out in the world that you fly INTO and THROUGH. Each is a
// field of additive point clouds (the starfield.js technique) at a fixed world
// position (the blackhole.js placement pattern), so parallax and the fly-through
// come for free.
//
// Adding a painting is ONE config object appended to NEBULAE below — initDeepNebula
// auto-iterates and nav.js auto-lists it, exactly like a planet CONFIGS entry. The
// nebula-creator agent (.claude/agents/nebula-creator.md) writes those configs from
// a painting. The mapping, per entry:
//   - gas billows piled around a dark, hollow central spine (the painting's dark flow),
//   - warm emission clumps offset to one side (its bright accent patches),
//   - high-contrast stars embedded in the gas (its bright specks),
//   - a dark dust layer along the spine that occludes the gas behind it (the dense mass).
//
// All buffers are generated ONCE at init (like the starfield); per frame we only
// push a couple of uniforms. Nothing re-bakes. A tiny mass (no radius) gives a
// gentle, always-escapable pull — like the black hole, a nebula is not a hazard.

import * as THREE from 'three';
import { C } from './constants.js';
import { addShiftable } from './origin.js';
import { addBody } from './gravity.js';
import gasVert from './shaders/deepnebula.vert?raw';
import gasFrag from './shaders/deepnebula.frag?raw';
import dustFrag from './shaders/deepnebulaDust.frag?raw';
import { makeStarburst, makeGlow } from './starburst.js';

// Built nebulae, in NEBULAE order. Read by nav.js (auto-listing) and by the
// per-frame uniform push. Each record: { id, name, group, navColor, logDist,
// mats, intensity }.
export const deepNebulae = [];

// One config object per nebula. Coefficients coreR / shellR / shellW / clumpR /
// offset are FRACTIONS of `radius`, so a config scales cleanly to any size.
// `warm` or `dust` may be null / count 0 for an open, glowing cloud with no
// bright accents or no dark mass. Palettes are hex; dir/axis/warmSide are
// normalized in code.
//
// Two SHAPES exist. The default (no `shape`) is the spine cloud above: a bent
// dark flow with a bright shell around it. `shape: 'spiral'` instead builds a
// face-on marbled spiral galaxy — a thin log-spiral disc coloured by a multi-band
// palette, gold-leaf veins along the arms, and a blazing central star (the sun.js
// un-tonemapped core + halo recipe) with an optional four-point flare. The spiral
// path (buildSpiralNebula and friends) is fully gated behind that flag; the spine
// nebulae are untouched by it. In a spiral config `axis` is the disc NORMAL, and
// gas colour comes from `spiral.bands` rather than gas.crest/deep.
const NEBULAE = [
  {
    id: 'sisters',
    name: 'The Sisters Nebula',
    dir: [0.58, 0.2, -0.79], // world direction — the black hole's corner, past it
    distance: 46000,
    radius: 3500,
    mass: 8.0e4, // gentle, always-escapable pull; 0 = none. Never a radius (no hazard).
    intensity: 1.0,
    navColor: '#3fd0c8',
    axis: [0.35, 0.15, 1.0], // the spine — the flow of the painting's black paint
    warmSide: [-0.5, -0.75, 0.2], // where the gold-leaf emission gathers
    gas: {
      count: 9000, brightness: 0.06, crest: 0x2f9d92, deep: 0x123f4a,
      coreR: 0.16, shellR: 0.3, shellW: 0.22, sizeMin: 200, sizeAdd: 380,
    },
    warm: {
      count: 2200, clumps: 7, base: 0xffb347, hot: 0xffe4a3,
      clumpR: 0.12, offset: 0.26, sizeMin: 120, sizeAdd: 260,
    },
    stars: { count: 650, sizeMin: 20, sizeAdd: 45 },
    dust: { count: 2600, color: 0x0a1518, opacity: 0.25, coreR: 0.18 },
  },
  {
    id: 'father',
    name: 'The Father Nebula',
    shape: 'spiral', // face-on marbled spiral galaxy (buildSpiralNebula)
    dir: [-0.62, 0.34, 0.71], // opposite corner from The Sisters, up and forward
    distance: 58000,
    radius: 7000, // disc radius R (twice The Sisters — a large region to cross)
    mass: 9.0e4, // gentle, always-escapable pull; 0 = none. Never a radius (no hazard).
    intensity: 1.0,
    navColor: '#e8a63c',
    axis: [0.35, 1.0, 0.25], // the disc NORMAL — tilted so it reads ~face-on on approach
    spiral: {
      arms: 2, // log-spiral arm count
      twist: 3.6, // log-spiral tightness: theta = twist * ln(rad/holeR)
      holeR: 0.05, // inner hole (fraction of R) where the core sits
      armSharp: 2.4, // raised-cosine exponent: higher = tighter arms, darker lanes
      armFloor: 0.03, // inter-arm density floor (dark lanes between the arms)
      thickness: 0.04, // out-of-plane sigma (fraction of R) — a thin disc
      bulge: 2.2, // extra thickness toward the centre
      radBias: 1.05, // radius power > 1 packs samples toward the centre
      // ordered palette, centre → rim: the acrylic-pour marbling of the painting.
      // Saturated so distinct red/blue/gold survive the additive accumulation.
      bands: [
        { stop: 0.0, color: 0xffe9c0 }, // warm white (blends into the core)
        { stop: 0.14, color: 0xf3b444 }, // gold
        { stop: 0.32, color: 0xef4a24 }, // coral-red
        { stop: 0.5, color: 0x2360e0 }, // cobalt-blue
        { stop: 0.64, color: 0xd23020 }, // deep red
        { stop: 0.8, color: 0x2f6fd8 }, // blue-steel
        { stop: 1.0, color: 0x4a3c2c }, // taupe outer → dark
      ],
      // the blazing central star: sun.js un-tonemapped core + a soft glow sprite
      core: { coreColor: 0xffffff, coreR: 580, haloColor: 0xffcf94, haloR: 2200, haloOpacity: 0.44 },
      flare: true, // four-point starburst billboard at the core
      flareScale: 9, // flare sprite size as a multiple of coreR
    },
    gas: { count: 46000, brightness: 0.052, sizeMin: 100, sizeAdd: 210 }, // colours from spiral.bands
    warm: { count: 2800, clumps: 26, base: 0xe8c66a, hot: 0xfff0c0, clumpR: 0.08, sizeMin: 80, sizeAdd: 150 },
    stars: { count: 480, sizeMin: 11, sizeAdd: 22, bright: 0.5 }, // damped so bloomed stars don't fight the gas
    dust: { count: 0 }, // no dark spine in the spiral
  },
];

// --- stateless helpers (shared across all nebulae) ---

const SPINE_N = 32;
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

// Standard-normal sample (Box–Muller) — used for the spiral disc's thin
// out-of-plane scatter, so points cluster near the disc plane and thin out above
// and below it.
function gauss() {
  let u = 0;
  while (u < 1e-6) u = Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Sample an ordered band palette (parallel colors[] / stops[] arrays) at t in
// [0,1], writing the interpolated colour into `out`. Gives the spiral its
// concentric rings — red, blue, gold — as a function of radius.
function sampleBands(colors, stops, t, out) {
  let i = 0;
  while (i < stops.length - 1 && t > stops[i + 1]) i++;
  const j = Math.min(i + 1, stops.length - 1);
  const a = stops[i], b = stops[j];
  const s = b > a ? (t - a) / (b - a) : 0;
  const ca = colors[i], cb = colors[j];
  out.setRGB(ca.r + (cb.r - ca.r) * s, ca.g + (cb.g - ca.g) * s, ca.b + (cb.b - ca.b) * s);
  return out;
}

// The spine: a gently bent polyline through the field along cfg.axis, sampled
// once into a flat [x,y,z, ...] array in the group's local frame.
function buildSpine(cfg) {
  const R = cfg.radius;
  const axis = new THREE.Vector3(cfg.axis[0], cfg.axis[1], cfg.axis[2]).normalize();
  const up = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const perp1 = new THREE.Vector3().crossVectors(axis, up).normalize();
  const perp2 = new THREE.Vector3().crossVectors(axis, perp1).normalize();
  const half = 0.72 * R;
  const bend = 0.22 * R;
  const spine = new Float32Array(SPINE_N * 3);
  for (let i = 0; i < SPINE_N; i++) {
    const t = (i / (SPINE_N - 1)) * 2 - 1; // -1 .. 1
    const b1 = Math.sin(t * Math.PI * 0.9) * bend;
    const b2 = Math.sin(t * Math.PI * 1.7 + 0.6) * bend * 0.6;
    spine[i * 3] = axis.x * t * half + perp1.x * b1 + perp2.x * b2;
    spine[i * 3 + 1] = axis.y * t * half + perp1.y * b1 + perp2.y * b2;
    spine[i * 3 + 2] = axis.z * t * half + perp1.z * b1 + perp2.z * b2;
  }
  return spine;
}

function distToSpine(spine, px, py, pz) {
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

// Nearest point on the spine at parameter t in [0,1], into `out`.
function spineAt(spine, t, out) {
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

function makeCloud(mats, intensity, { positions, colors, sizes, frag, blending, renderOrder, opacity }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const uniforms = {
    uScale: { value: 1 },
    uPixelRatio: { value: 1 },
    uIntensity: { value: intensity },
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
  mats.push(mat);
  return points;
}

// The gas body: rejection-sample the field, carving a dark hollow around the
// spine and piling the gas into a bright shell hugging it. Low per-sprite
// brightness so additive overlap accumulates into smooth gas. Returns the
// positions too, so buildStars can embed stars in the gas.
function buildGas(cfg, spine, mats) {
  const g = cfg.gas;
  const N = g.count;
  const R = cfg.radius;
  const CORE_R = g.coreR * R;
  const SHELL_R = g.shellR * R;
  const SHELL_W = g.shellW * R;
  const crest = new THREE.Color(g.crest);
  const deep = new THREE.Color(g.deep);

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

    const ds = distToSpine(spine, px, py, pz);
    const wEdge = 1 - smoothstep(0.72 * R, R, rad);
    const wCore = smoothstep(CORE_R * 0.4, CORE_R * 1.3, ds); // 0 inside spine -> hollow
    const shell = Math.exp(-Math.pow((ds - SHELL_R) / SHELL_W, 2));
    const w = wEdge * wCore * (0.4 + 0.6 * shell);
    if (Math.random() > w) continue;

    positions[n * 3] = px;
    positions[n * 3 + 1] = py;
    positions[n * 3 + 2] = pz;

    // colour: deep tint in the wisps, bright crest at the billow ridges
    const c = shell;
    const b = g.brightness * (0.5 + Math.random());
    colors[n * 3] = (deep.r + (crest.r - deep.r) * c) * b;
    colors[n * 3 + 1] = (deep.g + (crest.g - deep.g) * c) * b;
    colors[n * 3 + 2] = (deep.b + (crest.b - deep.b) * c) * b;

    sizes[n] = g.sizeMin + g.sizeAdd * Math.random();
    n++;
  }
  const gasPositions = positions.subarray(0, n * 3);
  const points = makeCloud(mats, cfg.intensity, {
    positions: gasPositions,
    colors: colors.subarray(0, n * 3),
    sizes: sizes.subarray(0, n),
    frag: gasFrag,
    blending: THREE.AdditiveBlending,
    renderOrder: -3,
  });
  return { points, gasPositions };
}

// Warm emission: a handful of gaussian clumps offset toward cfg.warmSide, like
// the bright accent patches gathered to one side of the painting. Clump cores
// are pushed above 1.0 so the bloom pass makes them glow.
function buildWarm(cfg, spine, mats) {
  const w = cfg.warm;
  const N = w.count;
  const R = cfg.radius;
  const K = w.clumps;
  const CLUMP_R = w.clumpR * R;
  const OFFSET = w.offset * R;
  const side = new THREE.Vector3(cfg.warmSide[0], cfg.warmSide[1], cfg.warmSide[2]).normalize();
  const base = new THREE.Color(w.base);
  const hot = new THREE.Color(w.hot);

  const centers = [];
  const _s = new THREE.Vector3();
  for (let k = 0; k < K; k++) {
    const t = 0.15 + 0.7 * Math.random();
    spineAt(spine, t, _s);
    randDir(_d);
    centers.push(new THREE.Vector3(
      _s.x + side.x * OFFSET + _d.x * 0.06 * R,
      _s.y + side.y * OFFSET + _d.y * 0.06 * R,
      _s.z + side.z * OFFSET + _d.z * 0.06 * R
    ));
  }

  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const c = centers[i % K];
    randDir(_d);
    const rr = CLUMP_R * Math.pow(Math.random(), 1.6); // biased to the clump centre
    positions[i * 3] = c.x + _d.x * rr;
    positions[i * 3 + 1] = c.y + _d.y * rr;
    positions[i * 3 + 2] = c.z + _d.z * rr;

    const inner = 1 - rr / CLUMP_R; // 1 at core .. 0 at edge
    // restrained warmth; only the very cores punch past 1.0 so a few points
    // bloom without the whole clump washing to white
    const b = 0.13 * (0.4 + 0.6 * inner) + Math.pow(inner, 4) * 0.55;
    colors[i * 3] = (base.r + (hot.r - base.r) * inner) * b;
    colors[i * 3 + 1] = (base.g + (hot.g - base.g) * inner) * b;
    colors[i * 3 + 2] = (base.b + (hot.b - base.b) * inner) * b;

    sizes[i] = w.sizeMin + w.sizeAdd * Math.random();
  }
  return makeCloud(mats, cfg.intensity, {
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

function buildStars(cfg, gasPositions, mats) {
  const s = cfg.stars;
  const N = s.count;
  const R = cfg.radius;
  const gasN = gasPositions ? gasPositions.length / 3 : 0;

  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (gasN > 0 && Math.random() < 0.7) {
      const gi = Math.floor(Math.random() * gasN) * 3;
      randDir(_d);
      const j = 0.05 * R * Math.random();
      positions[i * 3] = gasPositions[gi] + _d.x * j;
      positions[i * 3 + 1] = gasPositions[gi + 1] + _d.y * j;
      positions[i * 3 + 2] = gasPositions[gi + 2] + _d.z * j;
    } else {
      randDir(_d);
      const rad = R * Math.pow(Math.random(), 0.5);
      positions[i * 3] = _d.x * rad;
      positions[i * 3 + 1] = _d.y * rad;
      positions[i * 3 + 2] = _d.z * rad;
    }
    starColor(_star);
    // cubic tail so a few punch past 1.0 and bloom; `bright` (default 1) lets a
    // config dampen the tail where big bloomed stars would compete with the gas.
    const b = (0.25 + 1.5 * Math.pow(Math.random(), 3)) * (s.bright ?? 1);
    colors[i * 3] = _star.r * b;
    colors[i * 3 + 1] = _star.g * b;
    colors[i * 3 + 2] = _star.b * b;
    sizes[i] = s.sizeMin + s.sizeAdd * Math.random();
  }
  return makeCloud(mats, cfg.intensity, {
    positions, colors, sizes,
    frag: gasFrag,
    blending: THREE.AdditiveBlending,
    renderOrder: -2,
  });
}

// Dark dust along the spine — NormalBlending, drawn last, so it occludes the
// bright gas behind it and gives the nebula its dense central mass.
function buildDust(cfg, spine, mats) {
  const d = cfg.dust;
  const N = d.count;
  const R = cfg.radius;
  const CORE_R = d.coreR * R;
  const col = new THREE.Color(d.color);

  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const _s = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const t = Math.random();
    spineAt(spine, t, _s);
    randDir(_d);
    const rr = CORE_R * Math.pow(Math.random(), 0.7);
    positions[i * 3] = _s.x + _d.x * rr;
    positions[i * 3 + 1] = _s.y + _d.y * rr;
    positions[i * 3 + 2] = _s.z + _d.z * rr;

    const v = 0.7 + 0.6 * Math.random(); // faint value variation
    colors[i * 3] = col.r * v;
    colors[i * 3 + 1] = col.g * v;
    colors[i * 3 + 2] = col.b * v;

    sizes[i] = 150 + 350 * Math.random();
  }
  return makeCloud(mats, cfg.intensity, {
    positions, colors, sizes,
    frag: dustFrag,
    blending: THREE.NormalBlending,
    renderOrder: -1,
    opacity: d.opacity,
  });
}

// === Spiral galaxy (shape: 'spiral') ===============================
// A face-on marbled spiral: a thin log-spiral disc built in the plane whose
// NORMAL is cfg.axis. Same additive point-sprite technique as the spine gas, but
// sampled into arms and coloured by a radial band palette instead of a shell +
// two-colour lerp. Shares makeCloud / buildStars with the spine path.

// Build the disc's local frame: axis is the disc normal, perp1/perp2 span the
// plane. Returned by reference in the passed vectors.
function discFrame(cfg, axis, perp1, perp2) {
  axis.set(cfg.axis[0], cfg.axis[1], cfg.axis[2]).normalize();
  const up = Math.abs(axis.y) > 0.9 ? _up.set(1, 0, 0) : _up.set(0, 1, 0);
  perp1.crossVectors(axis, up).normalize();
  perp2.crossVectors(axis, perp1).normalize();
}

const _axis = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _up = new THREE.Vector3();
const _col = new THREE.Color();

// The spiral gas disc. Rejection-sample the plane into arms, offset thinly out of
// plane, colour by the band palette. Returns positions so buildStars embeds stars
// in the arms, exactly like the spine gas.
function buildSpiralGas(cfg, mats) {
  const g = cfg.gas;
  const sp = cfg.spiral;
  const N = g.count;
  const R = cfg.radius;
  const HOLE = sp.holeR * R;
  const sep = (Math.PI * 2) / sp.arms;

  // pre-convert the band palette once
  const bandColors = sp.bands.map((b) => new THREE.Color(b.color));
  const bandStops = sp.bands.map((b) => b.stop);

  discFrame(cfg, _axis, _p1, _p2);

  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);

  let n = 0;
  let guard = 0;
  while (n < N && guard < N * 40) {
    guard++;
    const rad = HOLE + (R - HOLE) * Math.pow(Math.random(), sp.radBias);
    const phi = Math.random() * Math.PI * 2;

    // log-spiral arm modulation: distance in angle to the nearest arm centreline
    const armPhase = sp.twist * Math.log(rad / HOLE);
    let m = (phi - armPhase) % sep;
    if (m < 0) m += sep;
    if (m > sep * 0.5) m -= sep; // fold to [-sep/2, sep/2]
    const tArm = m / (sep * 0.5); // -1 .. 1 across the arm
    const wArm = Math.pow(0.5 + 0.5 * Math.cos(Math.PI * tArm), sp.armSharp);
    const w = sp.armFloor + (1 - sp.armFloor) * wArm;
    const wEdge = 1 - smoothstep(0.86 * R, R, rad);
    if (Math.random() > w * wEdge) continue;

    // place in the disc plane, then a thin gaussian offset along the normal
    const cphi = Math.cos(phi) * rad;
    const sphi = Math.sin(phi) * rad;
    const sigma = sp.thickness * R * (1 + sp.bulge * (1 - rad / R));
    const off = gauss() * sigma;
    positions[n * 3] = _p1.x * cphi + _p2.x * sphi + _axis.x * off;
    positions[n * 3 + 1] = _p1.y * cphi + _p2.y * sphi + _axis.y * off;
    positions[n * 3 + 2] = _p1.z * cphi + _p2.z * sphi + _axis.z * off;

    // colour by radial band; arm ridges read brighter, lanes dimmer
    sampleBands(bandColors, bandStops, rad / R, _col);
    const b = g.brightness * (0.5 + Math.random()) * (0.55 + 0.9 * wArm);
    colors[n * 3] = _col.r * b;
    colors[n * 3 + 1] = _col.g * b;
    colors[n * 3 + 2] = _col.b * b;

    sizes[n] = g.sizeMin + g.sizeAdd * Math.random();
    n++;
  }
  const gasPositions = positions.subarray(0, n * 3);
  const points = makeCloud(mats, cfg.intensity, {
    positions: gasPositions,
    colors: colors.subarray(0, n * 3),
    sizes: sizes.subarray(0, n),
    frag: gasFrag,
    blending: THREE.AdditiveBlending,
    renderOrder: -3,
  });
  return { points, gasPositions };
}

// Gold-leaf veins: warm emission clumps placed ALONG the spiral arms (cf.
// buildWarm, which places them along the spine). Only clump cores punch past 1.0
// so they bloom into gold flecks tracing the swirl.
function buildSpiralWarm(cfg, mats) {
  const w = cfg.warm;
  const sp = cfg.spiral;
  const N = w.count;
  const R = cfg.radius;
  const K = w.clumps;
  const HOLE = sp.holeR * R;
  const sep = (Math.PI * 2) / sp.arms;
  const CLUMP_R = w.clumpR * R;
  const base = new THREE.Color(w.base);
  const hot = new THREE.Color(w.hot);

  discFrame(cfg, _axis, _p1, _p2);

  // clump centres snapped onto arm centrelines, spread across the disc
  const centers = [];
  for (let k = 0; k < K; k++) {
    const rad = R * (0.15 + 0.65 * Math.random());
    const armPhase = sp.twist * Math.log(rad / HOLE);
    const arm = Math.floor(Math.random() * sp.arms);
    const phi = armPhase + arm * sep + (Math.random() - 0.5) * sep * 0.25;
    const sigma = sp.thickness * R;
    const off = gauss() * sigma;
    centers.push(new THREE.Vector3(
      _p1.x * Math.cos(phi) * rad + _p2.x * Math.sin(phi) * rad + _axis.x * off,
      _p1.y * Math.cos(phi) * rad + _p2.y * Math.sin(phi) * rad + _axis.y * off,
      _p1.z * Math.cos(phi) * rad + _p2.z * Math.sin(phi) * rad + _axis.z * off
    ));
  }

  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const c = centers[i % K];
    randDir(_d);
    const rr = CLUMP_R * Math.pow(Math.random(), 1.1); // spread, so cores don't pile into a white blob
    positions[i * 3] = c.x + _d.x * rr;
    positions[i * 3 + 1] = c.y + _d.y * rr;
    positions[i * 3 + 2] = c.z + _d.z * rr;

    const inner = 1 - rr / CLUMP_R;
    // restrained: only faint cores punch past 1.0, so veins read as gold flecks
    // tracing the arms rather than bloomed white squares
    const b = 0.12 * (0.4 + 0.6 * inner) + Math.pow(inner, 5) * 0.28;
    colors[i * 3] = (base.r + (hot.r - base.r) * inner) * b;
    colors[i * 3 + 1] = (base.g + (hot.g - base.g) * inner) * b;
    colors[i * 3 + 2] = (base.b + (hot.b - base.b) * inner) * b;

    sizes[i] = w.sizeMin + w.sizeAdd * Math.random();
  }
  return makeCloud(mats, cfg.intensity, {
    positions, colors, sizes,
    frag: gasFrag,
    blending: THREE.AdditiveBlending,
    renderOrder: -3,
  });
}

// The blazing central star. A small un-tonemapped white core SPHERE (bypasses
// ACES so it feeds the bloom pass hard — the solid brilliant centre) plus a soft
// round glow SPRITE for the halo. The halo is a sprite, not a sphere: an additive
// transparent sphere rim-brightens at its silhouette and draws an ugly ring. Both
// are visual only — no gravity radius — and being a mesh/sprite the gas near-fade
// and 900px point cap never apply, so the core stays brilliant on a close pass.
function buildSpiralCore(cfg) {
  const c = cfg.spiral.core;
  const grp = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(c.coreR, 32, 16),
    new THREE.MeshBasicMaterial({ color: c.coreColor, toneMapped: false })
  );
  core.renderOrder = 0; // after the additive gas (-3 / -2)
  grp.add(core, makeGlow(cfg));
  return grp;
}

function buildSpiralNebula(cfg) {
  const group = new THREE.Group();
  group.position
    .set(cfg.dir[0], cfg.dir[1], cfg.dir[2])
    .normalize()
    .multiplyScalar(cfg.distance);

  const mats = [];
  const gas = buildSpiralGas(cfg, mats);
  group.add(gas.points);
  const coreGroup = buildSpiralCore(cfg);
  group.add(coreGroup);
  if (cfg.warm && cfg.warm.count > 0) group.add(buildSpiralWarm(cfg, mats));
  group.add(buildStars(cfg, gas.gasPositions, mats)); // reused unchanged
  if (cfg.spiral.flare) group.add(makeStarburst(cfg)); // sprite, auto-billboards

  // The core mesh + glow + flare are meshes/sprites, so the gas vertex near-fade
  // never touches them — flown into, they would fill the screen and blow to white.
  // Collect their materials so updateDeepNebula can fade them as the camera nears
  // the centre. R marks where the fade begins; coreR where it is fully gone.
  const coreFade = [];
  coreGroup.traverse((o) => { if (o.material) coreFade.push({ mat: o.material, base: o.material.opacity }); });
  for (const child of group.children) {
    if (child.isSprite && !coreFade.some((f) => f.mat === child.material)) {
      coreFade.push({ mat: child.material, base: child.material.opacity });
    }
  }
  for (const f of coreFade) f.mat.transparent = true;

  return { group, mats, coreFade, coreR: cfg.spiral.core.coreR, radius: cfg.radius };
}

function buildNebula(cfg) {
  if (cfg.shape === 'spiral') return buildSpiralNebula(cfg);

  const group = new THREE.Group();
  group.position
    .set(cfg.dir[0], cfg.dir[1], cfg.dir[2])
    .normalize()
    .multiplyScalar(cfg.distance);

  const spine = buildSpine(cfg);
  const mats = [];

  const gas = buildGas(cfg, spine, mats);
  group.add(gas.points);
  if (cfg.warm && cfg.warm.count > 0) group.add(buildWarm(cfg, spine, mats));
  group.add(buildStars(cfg, gas.gasPositions, mats));
  if (cfg.dust && cfg.dust.count > 0) group.add(buildDust(cfg, spine, mats));

  return { group, mats };
}

export function initDeepNebula(scene) {
  for (const cfg of NEBULAE) {
    const { group, mats, coreFade, coreR, radius } = buildNebula(cfg);
    scene.add(group);
    addShiftable(group); // floating-origin: the field moves with the world

    // Gentle, always-escapable pull. No radius: never opts into the altitude
    // floor or heat systems — a nebula is not a hazard (cf. the black hole).
    if (cfg.mass > 0) addBody({ position: group.position, mass: cfg.mass });

    deepNebulae.push({
      id: cfg.id,
      name: cfg.name,
      group,
      navColor: cfg.navColor,
      logDist: cfg.logDist || C.NEBULA_LOG_DIST,
      mats,
      intensity: cfg.intensity,
      coreFade: coreFade || null, // spiral core meshes/sprites to fade near the centre
      fadeStart: (radius || 0) * 0.8, // full brightness beyond here
      fadeEnd: (radius || 0) * 0.42, // gone by here, so flying through never whites out
    });
  }
}

const _size = new THREE.Vector2();

// Per frame: map a world sprite radius to pixels (uScale depends on live FOV,
// which changes on boost/warp, and viewport). No geometry rebuild. For spiral
// nebulae, also fade the solid core / glow / flare as the camera nears the
// centre, so a fly-through dissolves them instead of blowing the screen white.
export function updateDeepNebula(renderer, camera) {
  renderer.getSize(_size);
  const scale = 0.5 * _size.y / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
  const pr = renderer.getPixelRatio();
  for (const n of deepNebulae) {
    const intensity = n.intensity * C.NEBULA_FIELD_INTENSITY;
    for (const m of n.mats) {
      m.uniforms.uScale.value = scale;
      m.uniforms.uPixelRatio.value = pr;
      m.uniforms.uIntensity.value = intensity;
    }
    if (n.coreFade) {
      const d = camera.position.distanceTo(n.group.position);
      const f = smoothstep(n.fadeEnd, n.fadeStart, d); // 0 at the centre, 1 far out
      for (const c of n.coreFade) c.mat.opacity = c.base * f;
    }
  }
}
