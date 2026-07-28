// cottage-vegbeds.js — the cedar raised-bed kitchen garden behind the cottage.
//
// Ported from a standalone demo module. The crops themselves are the source's;
// four things about how they were built had to change.
//
// 1. THE BED PITCH WAS ON THE WRONG AXIS. `createBed` lays a bed out with its
//    `length` along X and its `width` along Z — but the plot then spaced bed
//    COLUMNS by `bedWidth + aisle` and ROWS by `bedLength + pathWidth`. With
//    the demo's own defaults that put 2.4-long beds on a 1.95 pitch: adjacent
//    beds interpenetrated by 0.45 while the other axis left a 2.4 void. The
//    parameters here are named bedX/bedZ so it cannot happen again.
//
// 2. NO TRANSMISSION. Every rosette leaf was built `{waxy: true, thin: true}`,
//    and `thin` set `transmission: 0.12`. A non-zero transmission puts the
//    object in three's transmissive list and triggers renderTransmissionPass —
//    the ENTIRE SCENE re-rendered into a separate target, every frame, so that
//    lettuce can be slightly translucent. world/cottage.js explicitly refuses
//    to pay that for its window glass; it is not paying it for cabbages.
//
// 3. ONE PROTOTYPE PER CROP, INSTANCED. The demo built every leaf of every
//    plant as its own Mesh: a nine-bed plot is ~2700 draw calls. Merging whole
//    beds instead is ~4.8 MB of unique vertex buffer per bed. So each crop is
//    built once, baked to a single vertex-coloured geometry, and scattered as
//    an InstancedMesh — ~20 draws and about a megabyte for the whole plot.
//
// 4. SEEDED, like everything else in this world.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;

let rand = (a = 0, b = 1) => a + Math.random() * (b - a);
let sink = null;
let DETAIL = 1;
const shared = { wood: null, soil: null, mulch: null, crop: null };

export function useVegRandom(fn) { rand = fn; }
export function useVegSink(fn) {
  for (const k in shared) shared[k] = null;   // never hand back a disposed material
  sink = fn;
}
const seg = (n, min = 3) => Math.max(min, Math.round(n * DETAIL));

/* ---------------------------------------------------------------- textures */
function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  sink?.(t);
  return t;
}

function cedarTexture() {
  return makeCanvas(512, 128, (x, w, h) => {
    x.fillStyle = '#b9a382'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const y = rand(0, h), l = rand(30, 240), g = rand(0, 1);
      x.strokeStyle = `hsla(${28 + g * 12}, ${18 + g * 22}%, ${g * 34 + 34}%, ${rand(0.05, 0.3)})`;
      x.lineWidth = rand(0.5, 2.4);
      x.beginPath();
      x.moveTo(rand(0, w), y);
      x.bezierCurveTo(rand(0, w), y + rand(-4, 4), rand(0, w), y + rand(-4, 4), rand(0, w) + l, y + rand(-3, 3));
      x.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const cx = rand(0, w), cy = rand(0, h);
      for (let r = 12; r > 0; r -= 1.6) {
        x.strokeStyle = `rgba(90,64,40,${0.06 + (12 - r) * 0.02})`;
        x.lineWidth = 1.2;
        x.beginPath(); x.ellipse(cx, cy, r * 1.7, r * 0.7, rand(-0.3, 0.3), 0, TAU); x.stroke();
      }
    }
    x.globalAlpha = 0.12;
    for (let i = 0; i < 2000; i++) {
      x.fillStyle = rand(0, 1) < 0.5 ? '#8d8578' : '#d8cbb2';
      x.fillRect(rand(0, w), rand(0, h), rand(1, 9), rand(0.5, 2));
    }
  });
}

function soilTexture() {
  return makeCanvas(256, 256, (x, w, h) => {
    x.fillStyle = '#33261c'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const g = rand(0, 1);
      x.fillStyle = `hsl(${20 + g * 18}, ${18 + g * 20}%, ${6 + g * 22}%)`;
      const s = rand(1, 5);
      x.fillRect(rand(0, w), rand(0, h), s, s * rand(0.5, 1.2));
    }
    for (let i = 0; i < 400; i++) {
      x.fillStyle = `hsla(38,26%,${rand(38, 62)}%,${rand(0.2, 0.6)})`;
      x.fillRect(rand(0, w), rand(0, h), rand(2, 7), rand(1, 2.5));
    }
  });
}

function mulchTexture() {
  return makeCanvas(256, 256, (x, w, h) => {
    x.fillStyle = '#4a3826'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 3500; i++) {
      const g = rand(0, 1);
      x.save();
      x.translate(rand(0, w), rand(0, h));
      x.rotate(rand(0, TAU));
      x.fillStyle = `hsl(${22 + g * 16}, ${20 + g * 22}%, ${10 + g * 26}%)`;
      x.fillRect(0, 0, rand(3, 13), rand(1.2, 3.4));
      x.restore();
    }
  });
}

function mats() {
  if (!shared.wood) {
    const wood = cedarTexture();
    shared.wood = new THREE.MeshStandardMaterial({
      map: wood, bumpMap: wood, bumpScale: 0.012, roughness: 0.92, metalness: 0,
    });
    const soil = soilTexture();
    soil.repeat.set(3, 6);
    shared.soil = new THREE.MeshStandardMaterial({ map: soil, bumpMap: soil, bumpScale: 0.02, roughness: 1 });
    const mulch = mulchTexture();
    mulch.repeat.set(18, 18);
    shared.mulch = new THREE.MeshStandardMaterial({ map: mulch, bumpMap: mulch, bumpScale: 0.03, roughness: 1 });
    // One material for every crop in the plot. Colour is baked per vertex, so
    // the chard stems stay yellow and the tomatoes stay red without four
    // materials per rosette ring.
    shared.crop = new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.78, metalness: 0,
    });
    [shared.wood, shared.soil, shared.mulch, shared.crop].forEach((m) => sink?.(m));
  }
  return shared;
}

/* ---------------------------------------------------------------- scratch colours */
const scratch = new Map();
function leafMat(color) {
  const key = String(color);
  if (!scratch.has(key)) scratch.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(color) }));
  return scratch.get(key);
}

/* ---------------------------------------------------------------- leaf geometry */
// Cupped, wavy-edged leaf in XZ, tip at +Z. The demo ran this at segs 10 /
// radial 9 — 180 triangles for a leaf 10 cm long, seen from standing height.
function leafGeometry({ len = 0.12, wid = 0.09, cup = 0.5, ruffle = 0, waves = 7,
  segs = 5, radial = 4, round = 0.6 } = {}) {
  const S = seg(segs, 3), R = seg(radial, 3);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const base = Math.sin(Math.pow(t, round) * Math.PI) * wid * 0.5 + wid * 0.04;
    for (let j = 0; j <= R; j++) {
      const u = j / R;
      const s = (u - 0.5) * 2;
      let w = base * s;
      if (ruffle) w += Math.sin(t * waves * 3.1) * ruffle * base * 0.35 * Math.abs(s);
      const y = -Math.pow(t, 1.7) * cup * len * 0.55 + Math.pow(Math.abs(s), 2) * cup * len * 0.5
        + (ruffle ? Math.sin(u * Math.PI * waves) * ruffle * len * 0.05 * t : 0);
      pos.push(w, y, t * len);
      uv.push(u, t);
    }
    if (i < S) for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j, b = a + R + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function rosette({ rings = 4, perRing = 6, leaf, color, scaleStep = 0.78,
  tiltOuter = 1.35, tiltInner = 0.35, colorVar = 0.06 }) {
  const g = new THREE.Group();
  const geo = leafGeometry(leaf);
  for (let r = 0; r < rings; r++) {
    const rt = r / Math.max(1, rings - 1);
    const n = Math.max(3, Math.round(perRing - r * 0.8));
    const m = leafMat(new THREE.Color(color).offsetHSL(0, 0, (0.5 - rt) * colorVar).getHex());
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = (i / n) * TAU + r * 1.1 + rand(-0.12, 0.12);
      mesh.rotation.x = -(tiltOuter - (tiltOuter - tiltInner) * rt) + rand(-0.12, 0.12);
      mesh.rotation.z = rand(-0.2, 0.2);
      mesh.position.y = rt * (leaf.len || 0.12) * 0.42;
      mesh.scale.setScalar(Math.pow(scaleStep, r) * rand(0.9, 1.1));
      g.add(mesh);
    }
  }
  return g;
}

function stemTube(pts, r, m, s = 6) {
  return new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg(s, 3), r, seg(5, 3), false), m);
}

/* ---------------------------------------------------------------- crops */
export const CROPS = {
  lettuce: () => rosette({
    rings: 4, perRing: 7, color: 0x7fae3e, scaleStep: 0.74, tiltOuter: 1.45, tiltInner: 0.2,
    leaf: { len: 0.1, wid: 0.095, cup: 0.75, ruffle: 0.9, waves: 9, round: 0.45 },
  }),
  redlettuce: () => rosette({
    rings: 4, perRing: 7, color: 0x8e4b52, scaleStep: 0.74, tiltOuter: 1.4, tiltInner: 0.2, colorVar: 0.12,
    leaf: { len: 0.095, wid: 0.09, cup: 0.8, ruffle: 1.0, waves: 10, round: 0.45 },
  }),
  romaine: () => rosette({
    rings: 5, perRing: 6, color: 0x8fbe4b, scaleStep: 0.8, tiltOuter: 0.6, tiltInner: 0.1,
    leaf: { len: 0.17, wid: 0.062, cup: 0.85, ruffle: 0.35, waves: 6, round: 0.75 },
  }),
  cabbage: () => {
    const g = rosette({
      rings: 3, perRing: 7, color: 0x8fae74, scaleStep: 0.85, tiltOuter: 1.5, tiltInner: 0.9,
      leaf: { len: 0.15, wid: 0.15, cup: 0.85, ruffle: 0.3, waves: 5, round: 0.4 },
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.058, seg(14, 6), seg(10, 5)), leafMat(0xa8c184));
    head.scale.y = 0.85; head.position.y = 0.05;
    g.add(head);
    const wrap = rosette({
      rings: 2, perRing: 6, color: 0x9dbb85, scaleStep: 0.8, tiltOuter: 0.9, tiltInner: 0.35,
      leaf: { len: 0.085, wid: 0.09, cup: 1.1, ruffle: 0.25, waves: 5, round: 0.4 },
    });
    wrap.position.y = 0.05;
    g.add(wrap);
    return g;
  },
  broccoli: () => {
    const g = rosette({
      rings: 3, perRing: 6, color: 0x5f7f4a, scaleStep: 0.85, tiltOuter: 1.15, tiltInner: 0.55, colorVar: 0.08,
      leaf: { len: 0.17, wid: 0.11, cup: 0.7, ruffle: 0.5, waves: 6, round: 0.5 },
    });
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.019, 0.1, seg(8, 5)), leafMat(0x6d8a52));
    stalk.position.y = 0.05;
    g.add(stalk);
    const crown = new THREE.Group();
    crown.position.y = 0.1;
    const budMat = leafMat(0x3f6337);
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU), rr = Math.pow(rand(0, 1), 0.5) * 0.045;
      const bud = new THREE.Mesh(new THREE.SphereGeometry(rand(0.011, 0.02), 6, 5), budMat);
      bud.position.set(Math.cos(a) * rr, Math.sqrt(Math.max(0, 1 - (rr / 0.05) ** 2)) * 0.022, Math.sin(a) * rr);
      bud.scale.y = 0.85;
      crown.add(bud);
    }
    g.add(crown);
    return g;
  },
  kale: () => rosette({
    rings: 4, perRing: 6, color: 0x476b47, scaleStep: 0.8, tiltOuter: 0.95, tiltInner: 0.15, colorVar: 0.1,
    leaf: { len: 0.2, wid: 0.075, cup: 0.6, ruffle: 1.5, waves: 14, round: 0.7 },
  }),
  chard: () => {
    const g = new THREE.Group();
    const stemMat = leafMat(0xd8c33f);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + rand(-0.2, 0.2);
      const h = rand(0.12, 0.2);
      const lean = rand(0.1, 0.35);
      g.add(stemTube([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(Math.cos(a) * h * lean * 0.4, h * 0.55, Math.sin(a) * h * lean * 0.4),
        new THREE.Vector3(Math.cos(a) * h * lean, h, Math.sin(a) * h * lean),
      ], 0.005, stemMat));
      const leaf = new THREE.Mesh(
        leafGeometry({ len: rand(0.1, 0.15), wid: 0.075, cup: 0.55, ruffle: 1.3, waves: 11, round: 0.6 }),
        leafMat(0x2f5c34));
      leaf.position.set(Math.cos(a) * h * lean, h, Math.sin(a) * h * lean);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.y = a;
      leaf.rotation.x = -rand(0.5, 1.1);
      g.add(leaf);
    }
    return g;
  },
  tomato: () => {
    const g = new THREE.Group();
    const h = rand(0.42, 0.62);
    g.add(stemTube([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(rand(-0.02, 0.02), h * 0.5, rand(-0.02, 0.02)),
      new THREE.Vector3(rand(-0.05, 0.05), h, rand(-0.05, 0.05)),
    ], 0.008, leafMat(0x53703a), 8));
    const leafGeo = leafGeometry({ len: 0.07, wid: 0.045, cup: 0.4, ruffle: 0.6, waves: 5, round: 0.65 });
    for (let i = 0; i < 10; i++) {
      const t = rand(0.15, 1);
      const compound = new THREE.Group();
      compound.position.set(rand(-0.03, 0.03), h * t, rand(-0.03, 0.03));
      compound.rotation.y = i * 2.399;
      compound.rotation.x = -rand(0.2, 0.7);
      for (let k = 0; k < 5; k++) {
        const l = new THREE.Mesh(leafGeo, leafMat(0x466b31));
        l.position.set((k % 2 ? 1 : -1) * 0.028, 0, (k >> 1) * 0.045);
        l.rotation.y = (k % 2 ? 1 : -1) * 1.1;
        l.scale.setScalar(1 - (k >> 1) * 0.15);
        compound.add(l);
      }
      g.add(compound);
    }
    const fruitMat = leafMat(0xc23a26), greenMat = leafMat(0x86a24e);
    for (let i = 0; i < 6; i++) {
      const t = rand(0.3, 0.8), a = rand(0, TAU), r = rand(0.016, 0.026);
      const f = new THREE.Mesh(new THREE.SphereGeometry(r, seg(12, 6), seg(10, 5)),
        rand(0, 1) < 0.65 ? fruitMat : greenMat);
      f.scale.y = 0.86;
      f.position.set(Math.cos(a) * rand(0.03, 0.07), h * t - r, Math.sin(a) * rand(0.03, 0.07));
      g.add(f);
    }
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, h * 1.15, 5), leafMat(0xb9a382));
    stake.position.set(0.05, h * 0.575, 0.02);
    g.add(stake);
    return g;
  },
  pepper: () => {
    const g = new THREE.Group();
    const h = rand(0.2, 0.3);
    g.add(stemTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h, 0)], 0.007, leafMat(0x4f6b39)));
    const geo = leafGeometry({ len: 0.075, wid: 0.045, cup: 0.35, ruffle: 0.2, waves: 4, round: 0.7 });
    for (let i = 0; i < 10; i++) {
      const l = new THREE.Mesh(geo, leafMat(0x37652f));
      l.position.y = h * rand(0.25, 1);
      l.rotation.order = 'YXZ';
      l.rotation.y = i * 2.399;
      l.rotation.x = -rand(0.15, 0.7);
      g.add(l);
    }
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.03, 4, seg(8, 5)), leafMat(0x4f8c34));
      const a = rand(0, TAU);
      p.position.set(Math.cos(a) * 0.03, h * rand(0.4, 0.7), Math.sin(a) * 0.03);
      p.rotation.x = rand(-0.3, 0.3);
      g.add(p);
    }
    return g;
  },
  carrot: () => {
    const g = new THREE.Group();
    const m = leafMat(0x568437);
    const frond = leafGeometry({ len: 0.028, wid: 0.02, cup: 0.5, ruffle: 1.4, waves: 8, round: 0.5 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const h = rand(0.1, 0.17);
      g.add(stemTube([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(Math.cos(a) * h * 0.2, h * 0.7, Math.sin(a) * h * 0.2),
      ], 0.0025, leafMat(0x6a8f45), 4));
      for (let k = 0; k < 5; k++) {
        const f = new THREE.Mesh(frond, m);
        f.position.set(Math.cos(a) * h * 0.2 * rand(0.5, 1.4), h * rand(0.5, 1), Math.sin(a) * h * 0.2 * rand(0.5, 1.4));
        f.rotation.set(-rand(0.2, 1.1), rand(0, TAU), 0, 'YXZ');
        g.add(f);
      }
    }
    return g;
  },
  onion: () => {
    const g = new THREE.Group();
    const m = leafMat(0x6f9455);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + rand(-0.3, 0.3);
      const h = rand(0.14, 0.24);
      g.add(stemTube([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(Math.cos(a) * h * 0.12, h * 0.6, Math.sin(a) * h * 0.12),
        new THREE.Vector3(Math.cos(a) * h * 0.5, h, Math.sin(a) * h * 0.5),
      ], 0.006, m, 6));
    }
    return g;
  },
  seedling: () => {
    const g = new THREE.Group();
    const m = leafMat(0x8cbf5a);
    const geo = leafGeometry({ len: 0.03, wid: 0.024, cup: 0.4, ruffle: 0.3, waves: 4, round: 0.55 });
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(geo, m);
      l.rotation.order = 'YXZ';
      l.rotation.y = (i / 4) * TAU + rand(-0.2, 0.2);
      l.rotation.x = -rand(0.7, 1.2);
      l.position.y = 0.012;
      g.add(l);
    }
    g.add(stemTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.015, 0)], 0.002, leafMat(0x7fae53), 3));
    return g;
  },
};

export const CROP_TYPES = Object.keys(CROPS);

/* ---------------------------------------------------------------- the bake */
function bakeToOne(root) {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = [];
  const out = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.updateWorldMatrix(true, false);
    out.copy(inv).multiply(o.matrixWorld);
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(out);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = o.material.color, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    }
    parts.push(g);
  });
  const merged = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
  parts.forEach((g) => g.dispose());
  root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** One baked geometry per (crop x variant) — this is what decides the draw count. */
export function buildCropPrototypes({ types = CROP_TYPES, variants = 2, detail = 1 } = {}) {
  DETAIL = detail;
  const protos = [];
  for (const type of types) {
    for (let v = 0; v < variants; v++) {
      const geo = bakeToOne(CROPS[type]());
      sink?.(geo);
      protos.push({ type, geo, size: geo.boundingBox.getSize(new THREE.Vector3()) });
    }
  }
  DETAIL = 1;
  return protos;
}

/* ---------------------------------------------------------------- the plot */
/**
 * The whole kitchen garden: mulch, beds, planting, fence.
 *
 * `bedX`/`bedZ` are the bed's footprint along each world axis — see note 1 at
 * the top of the file. `gateGap` opens a hole in the +Z fence run, on the
 * cottage side, so the plot can actually be walked into.
 *
 * Returns the group plus `bedRects` and `fenceRects`, which the caller turns
 * into colliders: the walker's GROUND_SNAP would otherwise let it climb a bed
 * and then drop through, because floorYAt knows nothing about them.
 */
export function createBedPlot({
  bedsPerRow = 3, rows = 3, bedX = 2.0, bedZ = 0.9, height = 0.32,
  boardH = 0.16, thickness = 0.038, aisle = 1.35, pathWidth = 1.35,
  fencePad = 1.1, plan = null, fence = true, gateGap = 0.9, low = false,
  protos = [],
} = {}) {
  const M = mats();
  const g = new THREE.Group();

  const colPitch = bedX + aisle;        // columns are spaced by the bed's X extent
  const rowPitch = bedZ + pathWidth;    // rows by its Z extent
  const totalW = bedsPerRow * colPitch - aisle;
  const totalL = rows * rowPitch - pathWidth;
  const fx = totalW / 2 + fencePad, fz = totalL / 2 + fencePad;
  const courses = Math.max(1, Math.round(height / boardH));
  const realH = courses * boardH;

  /* --- mulch ground, stopping at the fence line --- */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(fx * 2 - 0.2, fz * 2 - 0.2), M.mulch);
  ground.rotation.x = -Math.PI / 2;
  // 2 cm, not the source's 2 mm: the cottage renders with a 4000-unit far
  // plane and depth precision at 2 mm over the grass loses the fight in
  // patches. Still well inside the bottom board, so nothing shows.
  ground.position.y = 0.02;
  ground.receiveShadow = true;
  sink?.(ground.geometry);
  g.add(ground);

  /* --- one bed frame prototype, instanced nine times --- */
  const frameParts = [];
  const addBox = (w, h, d, x, y, z) => {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, y, z);
    frameParts.push(b);
  };
  for (let c = 0; c < courses; c++) {
    const y = boardH * (c + 0.5);
    addBox(bedX, boardH, thickness, 0, y, bedZ / 2 - thickness / 2);
    addBox(bedX, boardH, thickness, 0, y, -bedZ / 2 + thickness / 2);
    addBox(thickness, boardH, bedZ - thickness * 2, bedX / 2 - thickness / 2, y, 0);
    addBox(thickness, boardH, bedZ - thickness * 2, -bedX / 2 + thickness / 2, y, 0);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    addBox(0.06, realH + 0.02, 0.06, sx * (bedX / 2 - 0.03), (realH + 0.02) / 2 - 0.01, sz * (bedZ / 2 - 0.03));
  }
  // Cap rail at 0.03, not the source's 0.018: the sun's shadow normalBias is
  // 0.03, and a rail thinner than that peter-pans off its own bed.
  for (const sz of [-1, 1]) {
    addBox(bedX, 0.03, thickness + 0.018, 0, realH + 0.015, sz * (bedZ / 2 - thickness / 2));
  }
  const frameGeo = mergeGeometries(frameParts);
  frameParts.forEach((b) => b.dispose());
  sink?.(frameGeo);

  const nBeds = bedsPerRow * rows;
  const frames = new THREE.InstancedMesh(frameGeo, M.wood, nBeds);
  frames.castShadow = true; frames.receiveShadow = true;

  const soilY = realH - 0.055;
  const soilGeo = new THREE.PlaneGeometry(bedX - thickness * 2, bedZ - thickness * 2, 8, 4);
  soilGeo.rotateX(-Math.PI / 2);
  soilGeo.translate(0, soilY, 0);
  sink?.(soilGeo);
  const soils = new THREE.InstancedMesh(soilGeo, M.soil, nBeds);
  soils.receiveShadow = true;

  const innerGeo = new THREE.BoxGeometry(bedX - thickness * 2, soilY, bedZ - thickness * 2);
  innerGeo.translate(0, soilY / 2, 0);
  sink?.(innerGeo);
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x241a13, roughness: 1 });
  sink?.(innerMat);
  const inners = new THREE.InstancedMesh(innerGeo, innerMat, nBeds);

  /* --- lay the beds out and plant them --- */
  const d = new THREE.Object3D();
  const bedRects = [];
  const perProto = protos.map(() => []);
  const protoIndex = (crop) => {
    const hits = protos.map((p, i) => (p.type === crop ? i : -1)).filter((i) => i >= 0);
    return hits.length ? hits[(rand(0, 1) * hits.length) | 0] : -1;
  };
  const col = new THREE.Color();
  const perProtoCol = protos.map(() => []);

  let i = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < bedsPerRow; c++) {
    const bx = (c - (bedsPerRow - 1) / 2) * colPitch;
    const bz = (r - (rows - 1) / 2) * rowPitch;
    d.position.set(bx, 0, bz);
    d.rotation.set(0, rand(-0.012, 0.012), 0);
    d.scale.setScalar(1);
    d.updateMatrix();
    frames.setMatrixAt(i, d.matrix);
    soils.setMatrixAt(i, d.matrix);
    inners.setMatrixAt(i, d.matrix);
    bedRects.push({ x: bx, z: bz, w: bedX, d: bedZ });

    const crop = plan ? plan[i % plan.length] : protos[(rand(0, 1) * protos.length) | 0]?.type;
    i++;
    if (crop === 'bare') continue;
    const pi0 = protoIndex(crop);
    if (pi0 < 0) continue;
    const sz = protos[pi0].size;
    const sp = Math.max(sz.x, sz.z) * 1.08;
    const usableL = (bedX - thickness * 2) * 0.86;
    const usableW = (bedZ - thickness * 2) * 0.86;
    const nc = Math.max(1, Math.floor(usableL / sp));
    const nr = Math.max(1, Math.floor(usableW / sp));
    const dx = nc > 1 ? usableL / (nc - 1) : 0;
    const dz = nr > 1 ? usableW / (nr - 1) : 0;
    for (let pr = 0; pr < nr; pr++) for (let pc = 0; pc < nc; pc++) {
      if (low && (pr + pc) % 3 === 2) continue;
      const pi = protoIndex(crop);
      d.position.set(
        bx + (pc - (nc - 1) / 2) * dx + rand(-0.03, 0.03) * sp,
        soilY - 0.005,
        bz + (pr - (nr - 1) / 2) * dz + rand(-0.03, 0.03) * sp);
      d.rotation.set(rand(-0.06, 0.06), rand(0, TAU), 0);
      d.scale.setScalar(rand(0.86, 1.14));
      d.updateMatrix();
      perProto[pi].push(d.matrix.clone());
      col.setHSL(0, 0, 1).offsetHSL(rand(-0.025, 0.025), 0, rand(-0.08, 0.06));
      perProtoCol[pi].push(col.clone());
    }
  }
  [frames, soils, inners].forEach((m) => { m.instanceMatrix.needsUpdate = true; g.add(m); });

  protos.forEach((p, k) => {
    const list = perProto[k];
    if (!list.length) return;
    const im = new THREE.InstancedMesh(p.geo, M.crop, list.length);
    list.forEach((m, n) => { im.setMatrixAt(n, m); im.setColorAt(n, perProtoCol[k][n]); });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    // No shadows: 10 cm leaves on dark soil, inside a frame whose own shadow
    // already grounds the bed — and they are DoubleSide, which would double
    // their cost in the depth pass.
    im.castShadow = false; im.receiveShadow = false;
    g.add(im);
  });

  /* --- fence, from an explicit segment list so the gate is a real hole --- */
  const fenceRects = [];
  if (fence) {
    const parts = [];
    const post = (x, z) => {
      const b = new THREE.BoxGeometry(0.09, 1.05, 0.09);
      b.translate(x, 0.5, z);
      parts.push(b);
    };
    const rail = (x0, z0, x1, z1) => {
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
      for (const y of [0.42, 0.8]) {
        const b = new THREE.BoxGeometry(len, 0.075, 0.03);
        b.rotateY(-Math.atan2(dx, dz) + Math.PI / 2);
        b.translate(x0 + dx / 2, y, z0 + dz / 2);
        parts.push(b);
      }
    };
    const run = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) return;
      const n = Math.max(1, Math.round(len / 1.9));
      for (let k = 0; k <= n; k++) post(x0 + (x1 - x0) * (k / n), z0 + (z1 - z0) * (k / n));
      rail(x0, z0, x1, z1);
      fenceRects.push({
        x: (x0 + x1) / 2, z: (z0 + z1) / 2,
        w: Math.max(0.2, Math.abs(x1 - x0)), d: Math.max(0.2, Math.abs(z1 - z0)),
      });
    };
    run(-fx, -fz, fx, -fz);            // back
    run(-fx, -fz, -fx, fz);            // -X
    run(fx, -fz, fx, fz);              // +X
    run(-fx, fz, -gateGap, fz);        // cottage side, left of the gate
    run(gateGap, fz, fx, fz);          // cottage side, right of the gate
    const fenceGeo = mergeGeometries(parts);
    parts.forEach((b) => b.dispose());
    sink?.(fenceGeo);
    const fm = new THREE.Mesh(fenceGeo, M.wood);
    fm.castShadow = true; fm.receiveShadow = true;
    g.add(fm);
  }

  g.userData = { bedRects, fenceRects, extent: { x: fx, z: fz }, gateGap };
  return g;
}

export function disposeShared() {
  for (const m of scratch.values()) m.dispose();
  scratch.clear();
  for (const k in shared) shared[k] = null;
  sink = null;
}
