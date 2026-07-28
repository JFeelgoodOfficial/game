// cottage-flowers.js — the wildflower library for the cottage garden.
//
// Ported from a standalone demo module. The flower shapes themselves are kept
// as they were; what changed is everything around them, because the demo built
// one Mesh per petal and one Material per colour and this world cannot afford
// that. See world/cottage-garden.js for how it is used.
//
// THREE THINGS ARE DIFFERENT FROM THE SOURCE, and all three are load-bearing:
//
// 1. ONE GEOMETRY, ONE MATERIAL PER PROTOTYPE. The demo merged by material, so
//    a single daisy came out as four draw calls (stem, foliage, petals, and the
//    disc, whose material was allocated fresh on every call and never cached).
//    Nine types times three colour variants was ~95 instanced draws for the
//    meadow alone. Here each prototype is baked down to ONE geometry with the
//    colours written into a `color` attribute, drawn with one shared material.
//    Nine types, two variants: eighteen draws for the entire field.
//
// 2. NOT TRANSPARENT. The demo's petal material set `transparent: true` with
//    `opacity: 1`. That puts every flower in the transparent queue — per-draw
//    depth sorting, blending on, no early-Z — for no visual gain whatsoever.
//
// 3. SEEDED. The demo used Math.random(). world/cottage.js is seeded
//    (mulberry32) and the world is identical on every visit, so the random
//    source is injected. One stray Math.random() and the garden reshuffles
//    every time you fly into the sun.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;

/* ---------------------------------------------------------------- injected state */
// The cottage's seeded generator, and its disposal sink. Only one cottage
// exists at a time, which is what makes module-level state safe here — see
// useFlowerRandom/useMaterialSink and the note in cottage-garden.js.
let rand = (a = 0, b = 1) => a + Math.random() * (b - a);
let sink = null;
let DETAIL = 1;

export function useFlowerRandom(fn) { rand = fn; }
/**
 * Point the module at the live cottage's `track()`, so everything it keeps is
 * freed with that world. Clearing the shared material at the same time is the
 * important half: without it, a second visit hands back a material the first
 * visit's dispose() already destroyed.
 */
export function useMaterialSink(fn) { shared.mat = null; sink = fn; }

const pick = (arr) => arr[(rand(0, 1) * arr.length) | 0];
// Segment counts scale with DETAIL. These are 30 cm objects seen from standing
// height; the demo's tessellation was built for a macro shot of one bloom.
const seg = (n, min = 3) => Math.max(min, Math.round(n * DETAIL));

const shared = { mat: null };

/**
 * The one material every flower in the garden is drawn with. Colour comes from
 * the baked vertex attribute, so palette variety survives; per-material sheen
 * does not, which at this size is a trade worth making.
 */
export function flowerMaterial() {
  if (!shared.mat) {
    shared.mat = new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide,
      roughness: 0.82, metalness: 0,
    });
    sink?.(shared.mat);
  }
  return shared.mat;
}

/* ---------------------------------------------------------------- palettes */
export const PALETTE = {
  daisy: ['#fbfaf4', '#fdfdf8', '#f6f3e6'],
  cosmos: ['#e58fb4', '#f2b6cd', '#d1699b', '#f7dce7'],
  cornflower: ['#5b52c9', '#7a6fe0', '#4a3fae'],
  statice: ['#8b6fd0', '#c07fc0', '#6a5bbd', '#e0a8d4'],
  poppy: ['#d94f3d', '#e8663f', '#c93c46'],
  scabiosa: ['#b39ad8', '#cbb6e6', '#9d84cc'],
  spike: ['#5f3fa8', '#7952bd', '#4b3391'],
  queenannes: ['#fdfdf6'],
  seedhead: ['#b9ac96', '#c9bda6'],
};

/* ---------------------------------------------------------------- scratch materials */
// Builders still make Meshes, because that is the clearest way to express a
// flower and the shapes are the part worth keeping unchanged. These materials
// exist only to carry a colour as far as the bake, and are thrown away after.
const scratch = new Map();
function mat(color) {
  const key = String(color);
  if (!scratch.has(key)) {
    scratch.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(color) }));
  }
  return scratch.get(key);
}
const petalMat = (c) => mat(c);
const leafMat = (c = 0x4f6b32) => mat(c);

/* ---------------------------------------------------------------- petal geometry */
// A tapered, cupped petal lying in XZ, tip pointing +Z, root at origin.
function petalGeometry(len, wid, notch = 0, cup = 0.22, segs = 8) {
  const g = new THREE.BufferGeometry();
  const n = seg(segs, 3);
  const pos = [], idx = [], uv = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let w = Math.sin(Math.pow(t, 0.62) * Math.PI) * wid * 0.5 + wid * 0.06 * (1 - t);
    if (notch && t > 0.86) w *= 1 - notch * ((t - 0.86) / 0.14);
    const z = t * len;
    const y = Math.sin(t * Math.PI) * cup * len * 0.35 - Math.pow(t, 2) * cup * len * 0.5;
    pos.push(-w, y, z, w, y, z);
    uv.push(0, t, 1, t);
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function floretGeometry(r = 0.006, n = 5) {
  const geos = [];
  const p = petalGeometry(r, r * 0.85, 0, 0.3, 3);
  for (let i = 0; i < n; i++) {
    const c = p.clone();
    c.rotateX(-0.5);
    c.rotateY((i / n) * TAU);
    geos.push(c);
  }
  p.dispose();
  const out = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return out;
}

/* ---------------------------------------------------------------- stems & foliage */
function stemMesh(height, radius, curve = 0.05, color = 0x5c7a3a) {
  const pts = [];
  const bendX = rand(-curve, curve), bendZ = rand(-curve, curve);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector3(bendX * t * t, t * height, bendZ * t * t));
  }
  const path = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(path, seg(10, 4), radius, seg(5, 3), false);
  const m = new THREE.Mesh(g, leafMat(color));
  m.userData.tip = path.getPointAt(1);
  return m;
}

function bladeLeaf(len, wid, m) {
  return new THREE.Mesh(petalGeometry(len, wid, 0, 0.35, 6), m);
}

function addFoliage(group, height, kind = 'blade') {
  const m = leafMat(pick([0x4a6b2e, 0x56763a, 0x3f5f2a]));
  const n = kind === 'feathery' ? 8 : 4;
  for (let i = 0; i < n; i++) {
    const t = rand(0.12, 0.7);
    const len = kind === 'feathery' ? rand(0.05, 0.11) : rand(0.09, 0.19) * (1 - t * 0.4);
    const l = bladeLeaf(len, len * (kind === 'feathery' ? 0.12 : 0.26), m);
    l.position.y = height * t;
    l.rotation.y = rand(0, TAU);
    l.rotation.x = rand(-0.9, -0.25);
    group.add(l);
  }
}

/* ---------------------------------------------------------------- heads */
function discHead(r, h, color) {
  const g = new THREE.SphereGeometry(r, seg(16, 6), seg(10, 4), 0, TAU, 0, Math.PI * 0.52);
  g.scale(1, h / r, 1);
  return new THREE.Mesh(g, mat(color));
}

function rayHead({ petals, len, wid, color, notch = 0, tilt = 0.28, cup = 0.2, rows = 1,
  discColor = 0xe8b21c, discR = 0.012, discH = 0.005 }) {
  const head = new THREE.Group();
  const geo = petalGeometry(len, wid, notch, cup, 8);
  const m = petalMat(color);
  for (let r = 0; r < rows; r++) {
    const n = petals - r * 3;
    const off = r * 0.35;
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(geo, m);
      p.rotation.order = 'YXZ';
      p.rotation.y = (i / n) * TAU + rand(-0.06, 0.06) + r * 0.4;
      p.rotation.x = -tilt - off + rand(-0.09, 0.09);
      p.position.y = r * discH * 0.5;
      p.scale.setScalar(1 - r * 0.18 + rand(-0.08, 0.08));
      head.add(p);
    }
  }
  if (discR > 0) head.add(discHead(discR, discH, discColor));
  return head;
}

function clusterHead({ count, radius, flatten = 0.35, color, size = 0.007, jitter = 0.5, shape = 'dome' }) {
  const n = Math.max(4, Math.round(count * Math.min(1, DETAIL + 0.15)));
  const geo = floretGeometry(size, 5);
  const mesh = new THREE.InstancedMesh(geo, petalMat(color), n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    let x, y, z;
    if (shape === 'umbel') {
      const a = rand(0, TAU), rr = radius * Math.sqrt(rand(0, 1));
      x = Math.cos(a) * rr; z = Math.sin(a) * rr;
      y = -Math.pow(rr / radius, 2) * radius * flatten + rand(0, radius * 0.06);
    } else if (shape === 'spikeCluster') {
      const t = rand(0, 1);
      const rr = radius * (1 - t * 0.75) * Math.sqrt(rand(0, 1));
      const a = rand(0, TAU);
      x = Math.cos(a) * rr; z = Math.sin(a) * rr;
      y = t * radius * 5.5;
    } else {
      const a = rand(0, TAU), u = rand(0, 1);
      const rr = radius * Math.pow(u, 0.4);
      x = Math.cos(a) * rr; z = Math.sin(a) * rr;
      y = Math.sqrt(Math.max(0, 1 - (rr / radius) ** 2)) * radius * flatten;
    }
    d.position.set(x, y, z);
    d.rotation.set(rand(-jitter, jitter), rand(0, TAU), rand(-jitter, jitter));
    d.scale.setScalar(rand(0.7, 1.3));
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  }
  return mesh;
}

/* ---------------------------------------------------------------- builders */
const BUILDERS = {
  daisy(o) {
    const h = o.height ?? rand(0.26, 0.42);
    const g = new THREE.Group();
    const stem = stemMesh(h, 0.0035, 0.05);
    g.add(stem);
    addFoliage(g, h, 'blade');
    const head = rayHead({
      petals: 21, len: rand(0.022, 0.03), wid: 0.009, color: o.color || pick(PALETTE.daisy),
      notch: 0.3, tilt: 0.34, discColor: 0xe0a916, discR: 0.011, discH: 0.006,
    });
    head.position.copy(stem.userData.tip);
    g.add(head);
    return g;
  },
  cosmos(o) {
    const h = o.height ?? rand(0.5, 0.86);
    const g = new THREE.Group();
    const stem = stemMesh(h, 0.004, 0.12);
    g.add(stem);
    addFoliage(g, h, 'feathery');
    const head = rayHead({
      petals: 8, len: rand(0.04, 0.055), wid: 0.036, color: o.color || pick(PALETTE.cosmos),
      notch: 0.22, tilt: 0.2, cup: 0.28, discColor: 0xd8b83f, discR: 0.012, discH: 0.005,
    });
    head.position.copy(stem.userData.tip);
    head.rotation.z = rand(-0.35, 0.35);
    g.add(head);
    return g;
  },
  cornflower(o) {
    const h = o.height ?? rand(0.34, 0.55);
    const g = new THREE.Group();
    const stem = stemMesh(h, 0.0035, 0.07, 0x6b7f55);
    g.add(stem);
    addFoliage(g, h, 'blade');
    const c = o.color || pick(PALETTE.cornflower);
    const head = new THREE.Group();
    head.add(rayHead({ petals: 13, len: 0.021, wid: 0.014, color: c, notch: 0.55, tilt: 0.05, cup: 0.5, discR: 0 }));
    const inner = rayHead({ petals: 9, len: 0.012, wid: 0.009, color: c, notch: 0.5, tilt: 0.9, cup: 0.4, discR: 0 });
    inner.position.y = 0.004;
    head.add(inner);
    head.add(discHead(0.009, 0.008, 0x6d6f4a));
    const cal = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, seg(10, 5), seg(8, 4), 0, TAU, Math.PI * 0.45, Math.PI * 0.55),
      leafMat(0x7d8a5c));
    cal.position.y = -0.002;
    head.add(cal);
    head.position.copy(stem.userData.tip);
    g.add(head);
    return g;
  },
  queenannes(o) {
    const h = o.height ?? rand(0.55, 0.85);
    const g = new THREE.Group();
    const stem = stemMesh(h, 0.0045, 0.06, 0x5d7538);
    g.add(stem);
    addFoliage(g, h, 'feathery');
    const umbel = new THREE.Group();
    // The demo nested ten of these at 18 florets x 5 petals — ~6700 triangles,
    // an order of magnitude above every other flower here. Six sub-umbels.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + rand(-0.2, 0.2);
      const rr = rand(0.018, 0.055);
      const sub = clusterHead({ count: 12, radius: 0.022, flatten: 0.3, color: '#fdfdf6', size: 0.0045, shape: 'umbel' });
      sub.position.set(Math.cos(a) * rr, -Math.pow(rr / 0.06, 2) * 0.02, Math.sin(a) * rr);
      umbel.add(sub);
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0012, rr, 4), leafMat(0x6b8443));
      ray.position.set(Math.cos(a) * rr * 0.5, -0.012, Math.sin(a) * rr * 0.5);
      ray.rotation.z = -Math.atan2(Math.cos(a) * rr, 0.024);
      ray.rotation.y = -a;
      umbel.add(ray);
    }
    umbel.add(clusterHead({ count: 16, radius: 0.02, flatten: 0.25, color: '#fdfdf6', size: 0.0045, shape: 'umbel' }));
    umbel.position.copy(stem.userData.tip);
    g.add(umbel);
    return g;
  },
  statice(o) {
    const h = o.height ?? rand(0.32, 0.55);
    const g = new THREE.Group();
    const stem = stemMesh(h, 0.004, 0.09, 0x6f8250);
    g.add(stem);
    addFoliage(g, h, 'blade');
    const c = o.color || pick(PALETTE.statice);
    const head = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const br = clusterHead({ count: 11, radius: 0.011, color: c, size: 0.0055, shape: 'spikeCluster', jitter: 0.8 });
      const a = (i / 5) * TAU;
      br.position.set(Math.cos(a) * 0.014, rand(0, 0.02), Math.sin(a) * 0.014);
      br.rotation.z = -Math.cos(a) * 0.4;
      br.rotation.x = Math.sin(a) * 0.4;
      head.add(br);
    }
    head.position.copy(stem.userData.tip);
    g.add(head);
    return g;
  },
  spike(o) {
    const h = o.height ?? rand(0.45, 0.8);
    const g = new THREE.Group();
    const stem = stemMesh(h, 0.004, 0.14, 0x5a7038);
    g.add(stem);
    addFoliage(g, h, 'blade');
    const c = o.color || pick(PALETTE.spike);
    const geo = floretGeometry(0.0075, 5);
    const n = Math.round(30 * Math.min(1, DETAIL + 0.2));
    const mesh = new THREE.InstancedMesh(geo, petalMat(c), n);
    const d = new THREE.Object3D();
    const spikeLen = rand(0.1, 0.19);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const rr = 0.012 * (1 - t * 0.85);
      const a = i * 2.399;
      d.position.set(Math.cos(a) * rr, t * spikeLen, Math.sin(a) * rr);
      d.rotation.set(rand(0.6, 1.3), a, rand(-0.3, 0.3));
      d.scale.setScalar((1 - t * 0.5) * rand(0.8, 1.2));
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    }
    mesh.position.copy(stem.userData.tip);
    g.add(mesh);
    return g;
  },
  poppy(o) {
    const h = o.height ?? rand(0.4, 0.62);
    const g = new THREE.Group();
    const stem = stemMesh(h, 0.0045, 0.16, 0x6d7f4a);
    g.add(stem);
    const head = rayHead({
      petals: 5, len: 0.042, wid: 0.05, color: o.color || pick(PALETTE.poppy),
      notch: 0, tilt: 0.55, cup: 0.55, discColor: 0x2b2a20, discR: 0.011, discH: 0.011,
    });
    head.position.copy(stem.userData.tip);
    head.rotation.z = rand(-0.3, 0.3);
    g.add(head);
    return g;
  },
  scabiosa(o) {
    const h = o.height ?? rand(0.4, 0.66);
    const g = new THREE.Group();
    const stem = stemMesh(h, 0.0035, 0.1, 0x64784a);
    g.add(stem);
    addFoliage(g, h, 'feathery');
    const c = o.color || pick(PALETTE.scabiosa);
    const head = new THREE.Group();
    head.add(rayHead({ petals: 14, len: 0.019, wid: 0.016, color: c, notch: 0.45, tilt: 0.25, cup: 0.3, discR: 0 }));
    head.add(clusterHead({ count: 12, radius: 0.011, flatten: 0.55, color: c, size: 0.005 }));
    head.position.copy(stem.userData.tip);
    g.add(head);
    return g;
  },
  seedhead(o) {
    const h = o.height ?? rand(0.45, 0.7);
    const g = new THREE.Group();
    const stem = stemMesh(h, 0.003, 0.1, 0x8a8a63);
    g.add(stem);
    const head = new THREE.Group();
    const pod = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, seg(10, 5), seg(8, 4)),
      mat(o.color || pick(PALETTE.seedhead)));
    pod.scale.y = 1.3;
    head.add(pod);
    const brMat = leafMat(0x9a9271);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const l = rand(0.012, 0.024);
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0004, l, 3), brMat);
      br.position.set(Math.cos(a) * l * 0.4, 0.008 + l * 0.4, Math.sin(a) * l * 0.4);
      br.rotation.z = -Math.cos(a) * 0.8;
      br.rotation.x = Math.sin(a) * 0.8;
      head.add(br);
    }
    head.position.copy(stem.userData.tip);
    g.add(head);
    return g;
  },
};

export const FLOWER_TYPES = Object.keys(BUILDERS);
/** The tall stems the gardener actually cuts — they have to reach her hand. */
export const TALL_TYPES = ['cosmos', 'queenannes', 'spike', 'scabiosa', 'seedhead'];

/* ---------------------------------------------------------------- the bake */
// Collapse a built flower to ONE geometry carrying its colours as vertex data.
// InstancedMeshes are expanded on the way through; the throwaway meshes and
// their geometries are disposed here, so nothing but the result survives.
function bakeToOne(root) {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = [];
  const tmp = new THREE.Matrix4(), out = new THREE.Matrix4();

  const push = (geo, matrix, color) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // keep the attribute set identical across every part, or the merge fails
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    }
    parts.push(g);
  };

  root.traverse((o) => {
    if (o.isInstancedMesh) {
      o.updateWorldMatrix(true, false);
      const rel = new THREE.Matrix4().copy(inv).multiply(o.matrixWorld);
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, tmp);
        out.copy(rel).multiply(tmp);
        push(o.geometry, out, o.material.color);
      }
    } else if (o.isMesh) {
      o.updateWorldMatrix(true, false);
      out.copy(inv).multiply(o.matrixWorld);
      push(o.geometry, out, o.material.color);
    }
  });

  const merged = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
  parts.forEach((g) => g.dispose());
  root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  return merged;
}

/**
 * One baked geometry per (type x colour variant). These are the things that get
 * instanced across the garden, so this is the number that decides the draw
 * count — not how many flowers are planted.
 */
export function buildPrototypes({ types = FLOWER_TYPES, variants = 2, detail = 1 } = {}) {
  DETAIL = detail;
  const protos = [];
  for (const type of types) {
    const shades = PALETTE[type] || ['#ffffff'];
    for (let v = 0; v < variants; v++) {
      const src = BUILDERS[type]({ color: shades[v % shades.length] });
      const geo = bakeToOne(src);
      geo.computeBoundingSphere();
      sink?.(geo);
      protos.push({ type, geo });
    }
  }
  DETAIL = 1;
  return protos;
}

/** A single cut stem for the gardener's bouquet — one geometry, same material. */
export function buildSprig(type, { detail = 1, height = 0.3 } = {}) {
  DETAIL = detail;
  const src = BUILDERS[type]({ height });
  const geo = bakeToOne(src);
  geo.computeBoundingSphere();
  DETAIL = 1;
  sink?.(geo);
  return geo;
}

/* ---------------------------------------------------------------- scattering */
/**
 * Scatter every patch through ONE set of prototypes.
 *
 * Patches share the prototype set deliberately: calling this once per region
 * would rebuild the prototypes each time and multiply the draw calls by the
 * number of regions. `reject(x, z)` keeps flowers off the path, the pad, the
 * vegetable plot and out of the cottage — it is tested on the clump centres as
 * well as the final placements, because a placement is jittered up to a metre
 * off its centre and an unchecked centre leaks flowers through the stone path.
 */
export function scatterFlowers({ protos, patches, reject = null, jitter = 1.0 }) {
  const perProto = protos.map(() => []);
  const d = new THREE.Object3D();
  const blocked = (x, z) => (reject ? reject(x, z) : false);

  for (const p of patches) {
    const cx = p.cx ?? 0, cz = p.cz ?? 0;
    const inner = p.inner ?? 0, radius = p.radius ?? 6;
    const falloff = p.falloff ?? 0.55;
    const allowed = p.types
      ? protos.map((q, i) => (p.types.includes(q.type) ? i : -1)).filter((i) => i >= 0)
      : protos.map((_, i) => i);
    if (!allowed.length) continue;

    // clumped centres, each one reject-checked
    const centres = [];
    for (let i = 0, tries = 0; i < (p.clumps ?? 8) && tries < (p.clumps ?? 8) * 12; tries++) {
      const a = rand(0, TAU);
      const r = inner + Math.pow(rand(0, 1), falloff) * (radius - inner);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (blocked(x, z)) continue;
      centres.push({ x, z, proto: allowed[(rand(0, 1) * allowed.length) | 0] });
      i++;
    }
    if (!centres.length) continue;

    const want = p.count ?? 100;
    for (let i = 0, tries = 0; i < want && tries < want * 6; tries++) {
      const c = centres[(rand(0, 1) * centres.length) | 0];
      const a = rand(0, TAU), rr = rand(0, 1) * rand(0, 1) * jitter;
      const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
      if (blocked(x, z)) continue;
      const pi = rand(0, 1) < 0.75 ? c.proto : allowed[(rand(0, 1) * allowed.length) | 0];
      d.position.set(x, p.y ?? 0, z);
      d.rotation.set(rand(-0.09, 0.09), rand(0, TAU), rand(-0.09, 0.09));
      d.scale.setScalar((p.scale ?? 1) * rand(0.8, 1.3));
      d.updateMatrix();
      perProto[pi].push(d.matrix.clone());
      i++;
    }
  }

  const group = new THREE.Group();
  const material = flowerMaterial();
  const col = new THREE.Color();
  protos.forEach((p, i) => {
    const list = perProto[i];
    if (!list.length) return;
    const im = new THREE.InstancedMesh(p.geo, material, list.length);
    list.forEach((m, k) => {
      im.setMatrixAt(k, m);
      // a whisper of per-instance tint, so a drift of one prototype does not
      // read as a drift of clones
      col.setHSL(0, 0, 1).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.07, 0.05));
      im.setColorAt(k, col);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    // Sub-texel geometry in the depth pass buys nothing — the same argument
    // world/cottage.js already makes for its 11 000 grass tufts.
    im.castShadow = false;
    im.receiveShadow = false;
    group.add(im);
  });
  group.userData.instances = perProto.reduce((n, l) => n + l.length, 0);
  return group;
}

/**
 * The far band. At thirty metres a flower subtends under half a degree, so a
 * coloured dot at ankle height is the honest representation — and it is one
 * draw call for the whole treeline.
 */
export function createBloomDots({ inner = 12, radius = 46, count = 2400, reject = null, y = 0.22 }) {
  const geo = new THREE.SphereGeometry(0.075, 5, 4);
  // The shared material is vertexColors — a geometry without a `color`
  // attribute makes the shader read whatever happens to be bound, which paints
  // the dots black or worse. White here, so the per-instance hue is the colour.
  const white = new Float32Array(geo.attributes.position.count * 3).fill(1);
  geo.setAttribute('color', new THREE.BufferAttribute(white, 3));
  sink?.(geo);
  const mesh = new THREE.InstancedMesh(geo, flowerMaterial(), count);
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  let n = 0;
  for (let tries = 0; n < count && tries < count * 5; tries++) {
    const a = rand(0, TAU);
    const r = inner + Math.pow(rand(0, 1), 0.7) * (radius - inner);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (reject && reject(x, z)) continue;
    d.position.set(x, y + rand(-0.06, 0.16), z);
    d.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
    d.scale.setScalar(rand(0.6, 1.25));
    d.updateMatrix();
    mesh.setMatrixAt(n, d.matrix);
    col.setHSL(rand(0, 1) < 0.45 ? rand(0.87, 1.0) : rand(0.6, 0.78), rand(0.15, 0.5), rand(0.72, 0.93));
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * Drop the module-level caches. The scratch materials are transient and never
 * reach the cottage's disposables, so they are freed here; the shared material
 * and the baked geometries went through the sink and are freed with the world.
 */
export function disposeShared() {
  for (const m of scratch.values()) m.dispose();
  scratch.clear();
  shared.mat = null;
  sink = null;
}
