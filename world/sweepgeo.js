// Bodies from code: tubes swept along curves, sacs turned on a lathe.
//
// The siege monsters (world/monsters.js) and the life of the hollow
// (world/hollowlife.js) are built from these. Everything returned carries
// position and normal only and is not indexed, so any of it merges with any
// other (three's mergeGeometries).
//
//   path(pts, radii)          a curve through points with a radius at each
//   sweep(path, o)            a ring swept along it
//   tube(pts, radii, o)       the two together
//   fang(...)                 a tooth, a claw, a spine
//   sac(r, droop, lump, seed) a drop turned on a lathe
//   bead(r)                   a pinprick
//   prep(g), at(g, ...)       strip to position + normal; place

import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

// position + normal only, not indexed: everything here merges with everything
export function prep(g) {
  const o = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(o.attributes)) if (name !== 'position' && name !== 'normal') o.deleteAttribute(name);
  if (o !== g) g.dispose();
  return o;
}
export function at(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  g.applyMatrix4(_m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
  return g;
}

// A curve through points with a radius at each: at(u), r(u), and the u
// nearest a value on one axis (to find the body's girth at a station).
export function path(pts, radii) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
  const n = radii.length - 1;
  const r = (u) => {
    const f = Math.min(Math.max(u, 0), 1) * n, i = Math.min(Math.floor(f), n - 1), k = f - i;
    const e = k * k * (3 - 2 * k);
    return radii[i] + (radii[i + 1] - radii[i]) * e;
  };
  const nearest = (axis, v) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= 60; i++) {
      const d = Math.abs(curve.getPoint(i / 60)[axis] - v);
      if (d < bd) { bd = d; best = i / 60; }
    }
    return best;
  };
  return { curve, r, nearest, at: (u) => curve.getPoint(u) };
}

// Sweep a ring along a path. o: { seg, rad, sx, sy (ring squash across /
// along the frame's up), lump (uneven girth), ring + ringAmp (ridges, like a
// windpipe), open (no end caps) }.
export function sweep(pa, o = {}) {
  const seg = o.seg ?? 14, rad = o.rad ?? 8, sx = o.sx ?? 1, sy = o.sy ?? 1;
  const a0 = pa.at(0), a1 = pa.at(1);
  const ref = Math.abs(a1.y - a0.y) > Math.hypot(a1.x - a0.x, a1.z - a0.z) ? Z : Y;
  const pos = [], idx = [];
  const t = new THREE.Vector3(), nn = new THREE.Vector3(), bb = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const c = pa.at(u);
    pa.curve.getTangent(u, t);
    nn.copy(ref).addScaledVector(t, -ref.dot(t)).normalize();
    bb.crossVectors(t, nn);
    let r = pa.r(u);
    if (o.ring) r *= 1 + (o.ringAmp ?? 0.15) * Math.max(0, Math.sin(u * o.ring * Math.PI * 2)) ** 2;
    for (let k = 0; k < rad; k++) {
      const a = (k / rad) * Math.PI * 2;
      const rr = o.lump ? r * (1 + o.lump * Math.sin(u * 23 + k * 2.4) * Math.sin(u * 7 + k * 1.3 + 1)) : r;
      pos.push(
        c.x + (nn.x * Math.cos(a) * sy + bb.x * Math.sin(a) * sx) * rr,
        c.y + (nn.y * Math.cos(a) * sy + bb.y * Math.sin(a) * sx) * rr,
        c.z + (nn.z * Math.cos(a) * sy + bb.z * Math.sin(a) * sx) * rr
      );
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let k = 0; k < rad; k++) {
      const A = i * rad + k, B = i * rad + ((k + 1) % rad), Cc = A + rad, D = B + rad;
      idx.push(A, B, Cc, B, D, Cc);
    }
  }
  if (!o.open) {
    const c0 = pos.length / 3;
    pos.push(a0.x, a0.y, a0.z, a1.x, a1.y, a1.z);
    for (let k = 0; k < rad; k++) {
      idx.push(c0, (k + 1) % rad, k);
      idx.push(c0 + 1, seg * rad + k, seg * rad + ((k + 1) % rad));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return prep(g);
}
export const tube = (pts, radii, o) => sweep(path(pts, radii), o);

// a tooth, a claw, a spine: from a base, along a direction, bending by `curl`
export function fang(x, y, z, dx, dy, dz, len, r, cx = 0, cy = 0, cz = 0, o) {
  const l = Math.hypot(dx, dy, dz) || 1;
  const ux = (dx / l) * len, uy = (dy / l) * len, uz = (dz / l) * len;
  return tube(
    [[x, y, z], [x + ux * 0.55 + cx * 0.4, y + uy * 0.55 + cy * 0.4, z + uz * 0.55 + cz * 0.4], [x + ux + cx, y + uy + cy, z + uz + cz]],
    [r, r * 0.62, r * 0.04], { seg: 5, rad: 5, ...o }
  );
}

// a sac: a drop turned on a lathe, heavy at the bottom by `droop`, uneven by `lump`
export function sac(r, droop = 0.15, lump = 0.04, seed = 1) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    pts.push(new THREE.Vector2(Math.max(0.0001, r * Math.sin(a) * (1 + droop * Math.cos(a))), -r * Math.cos(a)));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const k = 1 + lump * Math.sin(x * 4.1 / r + seed) * Math.sin(y * 3.3 / r + seed * 2) * Math.cos(z * 3.7 / r + seed * 3);
    pa.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return prep(g);
}
// (a pinprick: an eye, a bead of drool)
export const bead = (r) => prep(new THREE.IcosahedronGeometry(r, 1));
