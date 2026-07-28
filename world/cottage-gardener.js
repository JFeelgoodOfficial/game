// cottage-gardener.js — the woman on the sunny side of the cottage, cutting
// flowers into a bouquet.
//
// Ported from a standalone demo module. She never notices you: there is no
// interaction here, deliberately, because nothing in this world asks anything
// of you. She is scenery that happens to be alive.
//
// WHAT CHANGED FROM THE SOURCE. The demo built her from 74 separate meshes —
// 28 of them individual TubeGeometry hair strands — on three
// MeshPhysicalMaterials. That is 74 draw calls for one figure in a scene that
// draws ~250 in total, and every one of them again in the shadow pass.
//
// Everything rigid within a bone is now fused into one mesh, so she costs ~17
// draws and animates identically: the arms still articulate at shoulder, elbow
// and wrist, because those are the only joints the picking loop actually moves.
// The hair is one mesh that sways as a mass, which is what the demo's per-
// strand wobble amounted to at any distance you ever see her from.
//
// She also has no feet — the skirt hem is the bottom of her. Sit her a few
// centimetres into the ground and leave the grass tufts alone underneath.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const lerp = THREE.MathUtils.lerp;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ---------------------------------------------------------------- fusing */
// Bake a pile of transformed meshes down to one geometry. Everything here
// shares a material by construction, so no vertex colours are needed.
function fuse(parts, material) {
  const geos = [];
  for (const m of parts) {
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrix);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    }
    geos.push(g);
    m.geometry.dispose();
  }
  const merged = geos.length > 1 ? mergeGeometries(geos) : geos[0];
  if (geos.length > 1) geos.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  return mesh;
}
const at = (geo, x = 0, y = 0, z = 0, rot = null, scale = null) => {
  const m = new THREE.Mesh(geo);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2], rot[3] || 'XYZ');
  if (scale) m.scale.set(scale[0], scale[1], scale[2]);
  return m;
};

/* ---------------------------------------------------------------- fabric */
function floralTexture(rand, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = '#fbfcfd'; x.fillRect(0, 0, size, size);
  const blues = ['#1f5f96', '#2c78b4', '#4a95c9', '#17466e', '#6fb0d8'];
  const petal = (cx, cy, r, rot, col) => {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(0, 0);
    x.bezierCurveTo(r * 0.75, -r * 0.4, r * 1.05, -r * 1.15, 0, -r * 1.5);
    x.bezierCurveTo(-r * 1.05, -r * 1.15, -r * 0.75, -r * 0.4, 0, 0);
    x.fill();
    x.restore();
  };
  const bloom = (cx, cy, r, col) => {
    const n = 5 + ((rand(0, 1) * 2) | 0);
    const rot0 = rand(0, TAU);
    for (let i = 0; i < n; i++) petal(cx, cy, r, rot0 + (i / n) * TAU, col);
    x.fillStyle = '#0f3d63';
    x.beginPath(); x.arc(cx, cy, r * 0.3, 0, TAU); x.fill();
  };
  const sprig = (cx, cy) => {
    const col = blues[(rand(0, 1) * blues.length) | 0];
    x.save(); x.translate(cx, cy); x.rotate(rand(0, TAU));
    x.strokeStyle = '#2a6d9f'; x.lineWidth = size * 0.0035;
    x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(size * 0.02, size * 0.03, size * 0.005, size * 0.06); x.stroke();
    x.fillStyle = '#3585bd';
    for (let i = 0; i < 3; i++) {
      const ly = size * (0.015 + i * 0.017);
      const s = i % 2 ? 1 : -1;
      x.beginPath();
      x.ellipse(s * size * 0.016, ly, size * 0.016, size * 0.006, s * 0.6, 0, TAU);
      x.fill();
    }
    bloom(0, 0, size * 0.026, col);
    bloom(size * 0.03, size * 0.028, size * 0.017, col);
    x.restore();
  };
  // Ditsy scatter. The source stamped each sprig nine times to wrap the seam;
  // only the four offsets that can actually reach the far edge are needed.
  for (let i = 0; i < 22; i++) {
    const cx = rand(0, size), cy = rand(0, size);
    sprig(cx, cy);
    if (cx > size * 0.9) sprig(cx - size, cy);
    if (cx < size * 0.1) sprig(cx + size, cy);
    if (cy > size * 0.9) sprig(cx, cy - size);
    if (cy < size * 0.1) sprig(cx, cy + size);
  }
  x.globalAlpha = 0.07;
  for (let i = 0; i < 5000; i++) {
    x.fillStyle = rand(0, 1) < 0.5 ? '#ffffff' : '#93a3b0';
    x.fillRect(rand(0, size), rand(0, size), rand(0.5, 3.5), 0.9);
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------------------------------------------------------- shells */
// Profile-swept surface with an angular ripple — cloth-like without a sim.
function shellGeometry({ profile, radial = 40, ripple = 0, rippleN = 14, taper = null }) {
  const rows = profile.length;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < rows; i++) {
    const [ry, rr, rz = 0] = profile[i];
    const v = i / (rows - 1);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const rip = ripple * rr * (0.35 + v) * Math.sin(a * rippleN + v * 1.6);
      let r = rr + rip;
      if (taper) r *= taper(a, v);
      pos.push(Math.cos(a) * r, ry, Math.sin(a) * r + rz);
      uv.push((j / radial) * 3.2, v * 3);
    }
  }
  const stride = radial + 1;
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * stride + j, b = a + stride;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function ruffleGeometry({ radius, width, segments = 56, waves = 16, amp = 0.35 }) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= segments; j++) {
    const a = (j / segments) * TAU;
    const w = width * (1 + amp * Math.sin(a * waves));
    const drop = -w * 0.75 + Math.sin(a * waves) * w * 0.25;
    pos.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    pos.push(Math.cos(a) * (radius + w * 0.55), drop, Math.sin(a) * (radius + w * 0.55));
    uv.push((j / segments) * 6, 0, (j / segments) * 6, 1);
    if (j < segments) { const i2 = j * 2; idx.push(i2, i2 + 1, i2 + 2, i2 + 1, i2 + 3, i2 + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function limbGeometry(len, r0, r1) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 10, 1, false);
  g.translate(0, -len / 2, 0);
  return g;
}

/* ---------------------------------------------------------------- the figure */
export function createGardener({
  rand = (a = 0, b = 1) => a + Math.random() * (b - a),
  low = false, skin = 0xe9c3a4, hair = 0x2a1c17,
  bouquet = null,          // { geo, material, max } — one InstancedMesh
  onPick = null, track = null,
} = {}) {
  const keep = (x) => { track?.(x); return x; };
  const group = new THREE.Group();

  const fabricTex = keep(floralTexture(rand, low ? 256 : 512));
  const fabricMat = keep(new THREE.MeshStandardMaterial({
    map: fabricTex, roughnessMap: fabricTex, roughness: 0.92, metalness: 0,
    side: THREE.DoubleSide, bumpMap: fabricTex, bumpScale: 0.006,
  }));
  const skinMat = keep(new THREE.MeshStandardMaterial({
    color: new THREE.Color(skin), roughness: 0.62, metalness: 0,
  }));
  const hairMat = keep(new THREE.MeshStandardMaterial({
    color: new THREE.Color(hair), roughness: 0.42, metalness: 0.05,
  }));
  const lipMat = keep(new THREE.MeshStandardMaterial({ color: 0xf0342f, roughness: 0.28 }));

  /* --- hips + skirt --- */
  const hips = new THREE.Group();
  hips.position.y = 0.98;
  group.add(hips);

  const prof = [];
  for (let i = 0; i < 20; i++) {
    const v = i / 19;
    const r = 0.155 + Math.sin(Math.min(v * 2.4, 1) * Math.PI * 0.5) * 0.06 + Math.pow(v, 1.7) * 0.24;
    prof.push([-v * 0.94, r, Math.pow(v, 2.2) * 0.03]);
  }
  const skirt = fuse([
    at(shellGeometry({
      profile: prof, ripple: 0.055, rippleN: 15,
      taper: (a, v) => 1 - 0.09 * v * Math.cos(a),
    })),
    at(ruffleGeometry({ radius: 0.4, width: 0.07, waves: 26, amp: 0.3 }), 0, -0.93, 0),
  ], fabricMat);
  skirt.receiveShadow = true;
  hips.add(skirt);

  /* --- torso --- */
  const torso = new THREE.Group();
  hips.add(torso);
  const bp = [];
  for (let i = 0; i < 14; i++) {
    const v = i / 13;
    bp.push([v * 0.42, 0.152 - Math.sin(v * Math.PI) * 0.022 + Math.pow(v, 2.6) * 0.02, 0]);
  }
  const bodice = fuse([at(shellGeometry({
    profile: bp, ripple: 0.028, rippleN: 34,
    taper: (a, v) => 1 - 0.12 * Math.pow(Math.max(0, Math.cos(a)), 2) * (1 - v),
  }))], fabricMat);
  torso.add(bodice);

  /* --- chest --- */
  const chest = new THREE.Group();
  chest.position.y = 0.42;
  torso.add(chest);
  const cp = [];
  for (let i = 0; i < 10; i++) {
    const v = i / 9;
    cp.push([v * 0.2, 0.15 - Math.pow(v, 1.8) * 0.035, 0]);
  }
  chest.add(fuse([
    at(shellGeometry({ profile: cp, ripple: 0.012, rippleN: 30 })),
    at(ruffleGeometry({ radius: 0.138, width: 0.036, waves: 17, amp: 0.35 }), 0, 0.14, 0),
    at(ruffleGeometry({ radius: 0.128, width: 0.03, waves: 15, amp: 0.4 }), 0, 0.105, 0),
  ], fabricMat));
  chest.add(fuse([
    at(new THREE.SphereGeometry(0.146, 18, 14, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.22, Math.PI * 0.6),
      0, 0.1, 0, null, [1, 1.5, 0.92]),
    at(new THREE.SphereGeometry(0.105, 16, 12), 0, 0.175, 0, null, [1.45, 0.5, 0.78]),
  ], skinMat));

  /* --- arms --- */
  const mkArm = (side) => {
    const root = new THREE.Group();
    root.position.set(0.158 * side, 0.092, 0.004);
    chest.add(root);
    root.add(fuse([
      at(limbGeometry(0.26, 0.042, 0.031)),
      at(new THREE.SphereGeometry(0.05, 14, 12), 0, 0.012, 0, null, [1.05, 1.05, 1]),
    ], skinMat));

    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    root.add(elbow);
    elbow.add(fuse([
      at(limbGeometry(0.23, 0.03, 0.022)),
      at(new THREE.SphereGeometry(0.031, 12, 10)),
    ], skinMat));

    const wrist = new THREE.Group();
    wrist.position.y = -0.23;
    elbow.add(wrist);
    wrist.add(fuse([
      at(new THREE.SphereGeometry(0.031, 12, 10), 0, -0.035, 0, null, [0.62, 1.25, 1]),
      at(new THREE.SphereGeometry(0.022, 10, 8)),
      at(limbGeometry(0.05, 0.011, 0.009), -0.026 * side, -0.05, 0.012, [-0.5, 0, side * 0.9]),
    ], skinMat));

    // Fingers fuse into one mesh and curl as a unit. The source curled each
    // one by a slightly different amount; at the size she is ever seen, the
    // difference between that and a single hinge is nothing.
    const fingers = new THREE.Group();
    wrist.add(fingers);
    const fParts = [];
    for (let i = 0; i < 4; i++) {
      fParts.push(at(limbGeometry(0.062, 0.0095, 0.0075),
        (i - 1.5) * 0.017, -0.06, 0.006, [-0.55 - i * 0.06, 0, side * 0.12]));
    }
    fingers.add(fuse(fParts, skinMat));
    return { root, elbow, wrist, fingers, side };
  };
  const armR = mkArm(1);
  const armL = mkArm(-1);

  /* --- the bouquet, one InstancedMesh that grows on each pick --- */
  const bouquetRoot = new THREE.Group();
  bouquetRoot.position.set(0, -0.055, 0.012);
  bouquetRoot.rotation.x = 0.42;
  armL.wrist.add(bouquetRoot);
  let bunch = null;
  if (bouquet?.geo) {
    bunch = new THREE.InstancedMesh(bouquet.geo, bouquet.material, bouquet.max ?? 12);
    bunch.count = 0;
    bunch.castShadow = false;
    bunch.receiveShadow = false;
    bunch.frustumCulled = false;
    bouquetRoot.add(bunch);
  }
  const _d = new THREE.Object3D();
  const _c = new THREE.Color();
  let picked = 0;
  function addToBouquet() {
    if (!bunch) return;
    const max = bunch.instanceMatrix.count;
    const n = picked % max;
    const a = n * 2.399;
    const r = 0.012 + Math.min(n, 10) * 0.004;
    _d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    _d.rotation.set(rand(-0.22, 0.22) + Math.cos(a) * 0.2, rand(0, TAU), rand(-0.22, 0.22) + Math.sin(a) * 0.2);
    _d.scale.setScalar(rand(0.85, 1.05));
    _d.updateMatrix();
    bunch.setMatrixAt(n, _d.matrix);
    _c.setHSL(0, 0, 1).offsetHSL(rand(-0.04, 0.04), 0, rand(-0.1, 0.06));
    bunch.setColorAt(n, _c);
    bunch.instanceMatrix.needsUpdate = true;
    if (bunch.instanceColor) bunch.instanceColor.needsUpdate = true;
    picked++;
    bunch.count = Math.min(picked, max);
  }

  /* --- head --- */
  const neck = new THREE.Group();
  neck.position.y = 0.215;
  chest.add(neck);
  neck.add(fuse([
    at(new THREE.CylinderGeometry(0.04, 0.056, 0.15, 12, 1), 0, 0.07, 0),
    at(new THREE.SphereGeometry(0.058, 14, 10), 0, 0.005, 0.012, null, [1.05, 0.6, 0.95]),
  ], skinMat));

  const head = new THREE.Group();
  head.position.y = 0.2;
  neck.add(head);
  // Deliberately close to featureless — cranial and jaw forms, and a mouth.
  const headParts = [
    at(new THREE.SphereGeometry(0.098, 20, 16), 0, 0, 0, null, [0.92, 1.08, 1]),
    at(new THREE.SphereGeometry(0.07, 14, 12), 0, -0.05, 0.01, null, [0.88, 0.85, 0.95]),
    at(new THREE.SphereGeometry(0.03, 12, 10), 0, -0.086, 0.048, null, [0.9, 0.85, 0.85]),
  ];
  for (const s of [-1, 1]) {
    headParts.push(at(new THREE.SphereGeometry(0.032, 12, 10), s * 0.046, -0.014, 0.055, null, [1.2, 0.8, 0.8]));
    headParts.push(at(new THREE.TorusGeometry(0.0125, 0.0035, 6, 12, Math.PI * 1.4),
      s * 0.083, -0.016, -0.014, [0.1, s * 1.5, -s * 0.25], [1, 1.25, 0.55]));
  }
  head.add(fuse(headParts, skinMat));

  const mouth = new THREE.Group();
  mouth.position.set(0, -0.05, 0.094);
  mouth.rotation.x = 0.12;
  head.add(mouth);
  const lipParts = [
    at(new THREE.SphereGeometry(0.014, 14, 10), 0, 0.006, 0, null, [1.55, 0.62, 0.55]),
    at(new THREE.SphereGeometry(0.0145, 14, 10), 0, -0.009, 0, null, [1.42, 0.8, 0.62]),
  ];
  for (const s of [-1, 1]) {
    lipParts.push(at(new THREE.SphereGeometry(0.0085, 10, 8), s * 0.0075, 0.0115, 0.001, null, [1, 0.75, 0.6]));
  }
  mouth.add(fuse(lipParts, lipMat));

  /* --- hair: one mesh, swaying as a mass --- */
  const hairGroup = new THREE.Group();
  head.add(hairGroup);
  const hairParts = [
    at(new THREE.SphereGeometry(0.108, 22, 18, 0, TAU, 0, Math.PI * 0.56), 0.004, 0.02, -0.03, null, [1, 1.12, 1]),
    at(new THREE.SphereGeometry(0.09, 16, 14), 0, -0.05, -0.075, null, [1.02, 1, 0.72]),
    at(new THREE.SphereGeometry(0.115, 18, 14, 0, TAU, 0, Math.PI * 0.62), 0, -0.22, -0.15, [-0.02, 0, 0], [1, 2.05, 0.46]),
  ];
  if (!low) {
    const mkLock = ({ side, startA, len, r, front, phase }) => {
      const pts = [];
      const startX = (front ? 0.088 : Math.sin(startA) * 0.085) * side;
      const startZ = front ? 0.012 - startA * 0.02 : -0.105 - Math.cos(startA) * 0.03;
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const wave = Math.sin(t * 6.2 + phase) * 0.022 * Math.pow(t, 0.7);
        const outward = front ? 0.13 : 0.07;
        pts.push(new THREE.Vector3(
          startX * (1 + t * 0.42) + wave * side * 0.7 + rand(-0.005, 0.005),
          0.03 - t * len - Math.pow(t, 2) * 0.02,
          startZ - t * outward + Math.cos(t * 5.4 + phase) * 0.014 * t));
      }
      hairParts.push(at(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, r, 5, false)));
    };
    for (let i = 0; i < 8; i++) {
      mkLock({ side: i % 2 ? 1 : -1, startA: rand(0.1, 0.5), len: rand(0.34, 0.5), r: rand(0.011, 0.018), front: true, phase: rand(0, TAU) });
    }
    for (let i = 0; i < 14; i++) {
      mkLock({ side: i % 2 ? 1 : -1, startA: rand(0.05, 1.0), len: rand(0.44, 0.68), r: rand(0.012, 0.021), front: false, phase: rand(0, TAU) });
    }
  }
  hairGroup.add(fuse(hairParts, hairMat));

  /* ---------------------------------------------------------------- pose */
  function setArm(arm, { sx, sz, elbow, twist = 0 }) {
    arm.root.rotation.set(sx, 0, sz * arm.side, 'YXZ');
    arm.elbow.rotation.set(elbow, twist * arm.side, 0);
  }
  setArm(armL, { sx: -0.34, sz: -0.16, elbow: -1.2, twist: 0.4 });
  setArm(armR, { sx: -0.26, sz: 0.24, elbow: -0.7 });

  let grabbed = false;

  /**
   * Drive her. `t` is wall-clock seconds; `cycle` is seconds per pick.
   * Nothing here early-outs on distance — she would freeze mid-reach and pop
   * when you walked up, and the cost is a few dozen rotation writes.
   */
  function update(t, dt = 0.016, { cycle = 7.5 } = {}) {
    const breathe = Math.sin(t * 1.05) * 0.008;
    const sway = Math.sin(t * 0.42) * 0.035;
    const lean = Math.sin(Math.min(1, ((t % cycle) / cycle) / 0.55) * Math.PI) * 0.13;

    hips.rotation.x = 0.05 + lean + Math.sin(t * 0.42) * 0.02;
    hips.rotation.z = sway * 0.5;
    hips.rotation.y = 0.12 + Math.sin(t * 0.31) * 0.06;
    torso.rotation.z = -sway * 0.6;
    torso.position.y = breathe;
    chest.rotation.y = Math.sin(t * 0.37 + 1) * 0.08;
    head.rotation.x = -0.06 + Math.sin(t * 0.6) * 0.04;
    head.rotation.y = Math.sin(t * 0.29 + 2) * 0.14;
    hairGroup.rotation.z = Math.sin(t * 0.9) * 0.05;
    hairGroup.rotation.x = Math.sin(t * 0.65 + 1.2) * 0.03;
    skirt.rotation.y = Math.sin(t * 0.33) * 0.05;

    setArm(armL, {
      sx: -0.34 + Math.sin(t * 0.7) * 0.04,
      sz: -0.16,
      elbow: -1.02 + Math.sin(t * 0.7) * 0.05,
      twist: 0.42,
    });

    // reach -> close -> draw back -> settle
    const p = (t % cycle) / cycle;
    let sx, sz, elbow, twist;
    if (p < 0.35) {
      const k = ease(p / 0.35);
      sx = lerp(-0.28, -0.66, k); sz = lerp(0.24, 0.46, k);
      elbow = lerp(-0.8, -0.22, k); twist = lerp(0, 0.4, k);
    } else if (p < 0.5) {
      const k = ease((p - 0.35) / 0.15);
      sx = -0.66 + Math.sin(k * Math.PI) * 0.07; sz = 0.46;
      elbow = -0.22 - k * 0.1; twist = 0.4;
      if (!grabbed && k > 0.55) { grabbed = true; addToBouquet(); onPick?.(); }
    } else if (p < 0.8) {
      const k = ease((p - 0.5) / 0.3);
      sx = lerp(-0.66, -0.5, k); sz = lerp(0.46, -0.22, k);
      elbow = lerp(-0.32, -1.3, k); twist = lerp(0.4, -0.1, k);
    } else {
      const k = ease((p - 0.8) / 0.2);
      sx = lerp(-0.5, -0.28, k); sz = lerp(-0.22, 0.24, k);
      elbow = lerp(-1.3, -0.8, k); twist = lerp(-0.1, 0, k);
      grabbed = false;
    }
    setArm(armR, { sx: sx + Math.sin(t * 2.2) * 0.012, sz, elbow, twist });
    armR.fingers.rotation.x = p > 0.35 && p < 0.85 ? -0.85 : -0.3;
  }

  function dispose() {
    group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    fabricTex.dispose();
    [fabricMat, skinMat, hairMat, lipMat].forEach((m) => m.dispose());
  }

  return { group, update, dispose, bouquet: bouquetRoot, handWorld: (v) => armR.wrist.getWorldPosition(v) };
}

export default createGardener;
