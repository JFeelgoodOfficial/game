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

// Built nebulae, in NEBULAE order. Read by nav.js (auto-listing) and by the
// per-frame uniform push. Each record: { id, name, group, navColor, logDist,
// mats, intensity }.
export const deepNebulae = [];

// One config object per nebula. Coefficients coreR / shellR / shellW / clumpR /
// offset are FRACTIONS of `radius`, so a config scales cleanly to any size.
// `warm` or `dust` may be null / count 0 for an open, glowing cloud with no
// bright accents or no dark mass. Palettes are hex; dir/axis/warmSide are
// normalized in code.
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
    dir: [-0.62, 0.34, 0.71], // opposite corner from The Sisters, up and forward
    distance: 58000,
    radius: 7000, // twice The Sisters Nebula (3500) — a large region to cross
    mass: 9.0e4, // gentle, always-escapable pull; 0 = none. Never a radius (no hazard).
    intensity: 1.0,
    navColor: '#e8a63c',
    axis: [1.0, 0.5, 0.3], // the diagonal flow of the bloom (coral upper-left → blue lower-right)
    warmSide: [0.2, -0.3, 0.1], // the gold-leaf heart gathers near-centre, a touch low-right
    gas: {
      count: 17000, brightness: 0.05, crest: 0xe8b98a, deep: 0x5a2a20,
      coreR: 0.1, shellR: 0.26, shellW: 0.24, sizeMin: 300, sizeAdd: 560,
    },
    warm: {
      count: 4600, clumps: 10, base: 0xd8a848, hot: 0xf5e2a0,
      clumpR: 0.14, offset: 0.1, sizeMin: 190, sizeAdd: 400,
    },
    stars: { count: 1300, sizeMin: 28, sizeAdd: 64 },
    dust: { count: 0, color: 0x241410, opacity: 0.18, coreR: 0.14 }, // count 0: radiant bloom, no dark spine
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
    const b = 0.25 + 1.5 * Math.pow(Math.random(), 3);
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

function buildNebula(cfg) {
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
    const { group, mats } = buildNebula(cfg);
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
    });
  }
}

const _size = new THREE.Vector2();

// Per frame: map a world sprite radius to pixels (uScale depends on live FOV,
// which changes on boost/warp, and viewport). No geometry rebuild.
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
  }
}
