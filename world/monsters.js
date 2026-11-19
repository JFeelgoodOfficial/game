// Monsters — the things that come over the town wall.
//
// This module is bodies only: the archetype table (size, health, hit volumes,
// attack numbers), the per-world skins, and a kit that builds an articulated
// rig for an archetype and poses it from a handful of state numbers. The
// brains — where a monster goes, when it attacks, what its attack does to the
// player — live in warzone.js, which owns the player and the town.
//
// Everything is built in code. A body is tubes swept along spine and limb
// curves and sacs turned on a lathe, merged per joint and per material: one
// template per archetype per town, its geometry shared by every monster of
// that kind. No skinning, no models. Motion is code — gait from a phase that
// advances with distance walked, attack wind-ups from a 0..1 `tele`, strikes
// from `strike`. The lit, exposed part of each body sits on its CRIT sphere.
//
// Frame: monster-local, +Z forward, +Y up, origin on the ground between the
// feet. Metres. For scale: the player's eye is at 1.72.
//
// Hit volumes are spheres in that frame: [x, y, z, radius, multiplier]. A
// multiplier of CRIT marks a weak point (the weapon's own crit multiplier
// applies); anything else is a flat scale on damage.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CRIT = -1; // sentinel in a part's multiplier slot

export const ARCHETYPES = {
  // A quadruped the size of a truck. Charges in a straight line; up close it
  // rears and slams the ground, and the shock goes through walls.
  brute: {
    name: 'BRUTE', hp: 950, radius: 2.4, speed: 6.2, eyeY: 3.0, size: 0.55, score: 300,
    parts: [
      [0, 2.7, 0.9, 1.9, 1], [0, 2.6, -1.3, 1.7, 1], [0, 3.7, 0.6, 1.2, 1],
      [0, 2.3, 3.3, 1.05, CRIT],
    ],
    chargeSpeed: 17, chargeMin: 11, chargeMax: 46, chargeTele: 0.95, chargeDmg: 46,
    slamRange: 6.5, slamRadius: 8.5, slamTele: 0.8, slamDmg: 38,
    gait: 1.5, // phase radians per metre
  },
  // Tall, thin-legged, with a bloated glowing sac. Keeps its distance and
  // lobs acid that pools where it lands.
  spitter: {
    name: 'SPITTER', hp: 440, radius: 1.3, speed: 5.0, eyeY: 3.8, size: 0.35, score: 200,
    parts: [
      [0, 2.5, 0, 1.05, 1], [0, 3.9, 1.25, 0.6, 1.5], [0, 3.25, -0.95, 1.15, CRIT],
      [0, 1.1, 0, 0.7, 0.7],
    ],
    keepMin: 16, keepMax: 34, spitTele: 0.85, spitCd: 3.2,
    globSpeed: 24, globGravity: 16, globDmg: 30, globRadius: 3.6,
    poolTime: 4.5, poolDps: 14, poolRadius: 2.8,
    gait: 2.6,
  },
  // Four stilt legs and a small body seven metres up. Strides over cover,
  // then leaps onto where you are standing.
  stalker: {
    name: 'STALKER', hp: 680, radius: 1.5, speed: 9.0, eyeY: 5.6, size: 0.45, score: 350,
    parts: [
      [0, 5.6, 0, 1.35, 1], [0, 4.85, 0.25, 0.75, CRIT], [0, 5.5, 1.7, 0.6, 1.5],
      [2.4, 1.6, 2.4, 0.55, 0.5], [-2.4, 1.6, 2.4, 0.55, 0.5],
      [2.4, 1.6, -2.4, 0.55, 0.5], [-2.4, 1.6, -2.4, 0.55, 0.5],
    ],
    leapMin: 9, leapMax: 34, leapTele: 0.75, leapTime: 1.05, leapHeight: 9,
    landRadius: 4.6, landDmg: 42, swipeRange: 5.2, swipeDmg: 24, swipeTele: 0.45,
    gait: 0.9,
  },
  // The every-fifth-wave problem. Eighteen metres of it.
  titan: {
    name: 'TITAN', hp: 7200, radius: 3.0, speed: 3.6, eyeY: 15.5, size: 1, score: 2500,
    parts: [
      [0, 11.5, 0, 3.7, 1], [0, 7.4, 0, 2.5, 1], [0, 15.9, 1.2, 1.35, 1.5],
      [0, 11.6, 2.9, 1.5, CRIT], [3.7, 14.1, 0.2, 1.35, CRIT], [-3.7, 14.1, 0.2, 1.35, CRIT],
      [1.9, 4.2, 0, 1.5, 0.7], [-1.9, 4.2, 0, 1.5, 0.7],
      [1.9, 1.4, 0.3, 1.3, 0.7], [-1.9, 1.4, 0.3, 1.3, 0.7],
    ],
    stompRange: 15, stompRadius: 17, stompTele: 1.25, stompDmg: 48,
    volleyMin: 18, volleyTele: 1.0, volleyCount: 3, volleyCd: 6,
    globSpeed: 30, globGravity: 14, globDmg: 34, globRadius: 4.5,
    poolTime: 5, poolDps: 16, poolRadius: 3.4,
    gait: 0.42,
  },
};

// The swarm is instanced in warzone.js rather than rigged here.
export const SWARMLING = {
  name: 'SWARMLING', hp: 34, radius: 0.55, size: 0.05, score: 40,
  flock: 6, cruise: 11, diveSpeed: 23, orbitR: 13, orbitY: 7.5,
  diveTele: 0.5, biteReach: 1.5, biteDmg: 9,
};

// Per-world skin: hide, armour plate, and the colour everything glows.
export const SKINS = {
  terra: { name: 'THE CRIMSON BROOD', hide: 0x4a1d1b, plate: 0x1c1113, bone: 0xc9b99a, glow: 0xff3b2f, leap: 1 },
  rustia: { name: 'THE DUSTJAW HORDE', hide: 0x6d4a2b, plate: 0x2a1d14, bone: 0xd8c49c, glow: 0xff8a1f, leap: 1.35 },
  neptunia: { name: 'THE TRENCH LEVIATHANS', hide: 0x1b3d48, plate: 0x0c1c22, bone: 0xa9c4c4, glow: 0x3df0ff, leap: 1 },
  wyattmattoe: { name: 'THE WHITEOUT MAULERS', hide: 0x8c93a4, plate: 0x3a3f4c, bone: 0xe6e8ee, glow: 0xc46bff, leap: 1.25 },
};

// ---------------------------------------------------------------------------
// Geometry: tubes swept along curves, sacs turned on a lathe
// ---------------------------------------------------------------------------

function mulberry32(seed) {
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
function prep(g) {
  const o = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(o.attributes)) if (name !== 'position' && name !== 'normal') o.deleteAttribute(name);
  if (o !== g) g.dispose();
  return o;
}
function at(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  g.applyMatrix4(_m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
  return g;
}

// A curve through points with a radius at each: at(u), r(u), and the u
// nearest a value on one axis (to find the body's girth at a station).
function path(pts, radii) {
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
function sweep(pa, o = {}) {
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
const tube = (pts, radii, o) => sweep(path(pts, radii), o);

// a tooth, a claw, a spine: from a base, along a direction, bending by `curl`
function fang(x, y, z, dx, dy, dz, len, r, cx = 0, cy = 0, cz = 0, o) {
  const l = Math.hypot(dx, dy, dz) || 1;
  const ux = (dx / l) * len, uy = (dy / l) * len, uz = (dz / l) * len;
  return tube(
    [[x, y, z], [x + ux * 0.55 + cx * 0.4, y + uy * 0.55 + cy * 0.4, z + uz * 0.55 + cz * 0.4], [x + ux + cx, y + uy + cy, z + uz + cz]],
    [r, r * 0.62, r * 0.04], { seg: 5, rad: 5, ...o }
  );
}

// a sac: a drop turned on a lathe, heavy at the bottom by `droop`, uneven by `lump`
function sac(r, droop = 0.15, lump = 0.04, seed = 1) {
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
const bead = (r) => prep(new THREE.IcosahedronGeometry(r, 1));

// ---------------------------------------------------------------------------
// Skin: noise in the shader, per material
// ---------------------------------------------------------------------------
const NOISE = /* glsl */ `
  float mHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float mNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(mHash(i), mHash(i + vec3(1, 0, 0)), f.x), mix(mHash(i + vec3(0, 1, 0)), mHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(mHash(i + vec3(0, 0, 1)), mHash(i + vec3(1, 0, 1)), f.x), mix(mHash(i + vec3(0, 1, 1)), mHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float mFbm(vec3 p) { return 0.55 * mNoise(p) + 0.3 * mNoise(p * 2.1 + 3.7) + 0.15 * mNoise(p * 4.3 + 9.1); }
`;
const SKIN = {
  // hide: blotches, raw patches where it has worn through, pores; wet where it is dark
  hide: [/* glsl */ `
    float mB = mFbm(vMo * 0.85);
    float mRaw = smoothstep(0.6, 0.78, mNoise(vMo * 2.1 + 7.0));
    diffuseColor.rgb *= mix(0.45, 1.18, smoothstep(0.28, 0.7, mB));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.5, 0.62, 0.55) + vec3(0.03, 0.0, 0.0), mRaw * 0.55);
    diffuseColor.rgb *= 1.0 - 0.4 * smoothstep(0.7, 0.9, mNoise(vMo * 11.0));`,
  /* glsl */ `roughnessFactor = clamp(roughnessFactor - 0.4 * mRaw - 0.25 * (1.0 - smoothstep(0.28, 0.7, mB)), 0.25, 1.0);`],
  // bone: matte, stained, chipped
  bone: [/* glsl */ `
    float mB = mNoise(vMo * 5.5);
    diffuseColor.rgb *= 0.78 + 0.3 * mNoise(vMo * 1.3 + 2.0);
    diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.22, 0.42, mB));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 0.62, 0.45), smoothstep(0.55, 0.9, mNoise(vMo * 2.6 + 5.0)) * 0.6);`,
  /* glsl */ `roughnessFactor = 0.95;`],
  // carapace: dull, scuffed
  plate: [/* glsl */ `
    float mB = mFbm(vMo * 2.2);
    diffuseColor.rgb *= mix(0.6, 1.3, mB);`,
  /* glsl */ `roughnessFactor = clamp(roughnessFactor + 0.3 * (mB - 0.5), 0.2, 1.0);`],
  // the skin of a sac: thin enough to see through, and veined
  shell: [/* glsl */ `
    float mV = abs(mNoise(vMo * 2.6) - 0.5) + 0.35 * abs(mNoise(vMo * 6.5 + 4.0) - 0.5);
    float mVein = 1.0 - smoothstep(0.0, 0.07, mV);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.0, 0.015), mVein * 0.85);
    diffuseColor.a = mix(diffuseColor.a * (0.75 + 0.5 * mNoise(vMo * 1.4)), 0.96, mVein);`,
  /* glsl */ `totalEmissiveRadiance *= 1.0 - 0.8 * mVein;`, 'emissivemap_fragment'],
};
function skinned(mat, kind) {
  const [color, late, where = 'roughnessmap_fragment'] = SKIN[kind];
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMo = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMo;\n' + NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + color)
      .replace(`#include <${where}>`, `#include <${where}>\n` + late);
  };
  mat.customProgramCacheKey = () => 'monster-' + kind;
  return mat;
}
// (Material.clone() does not carry the shader patch)
function cloneSkinned(mat) {
  const c = mat.clone();
  c.onBeforeCompile = mat.onBeforeCompile;
  c.customProgramCacheKey = mat.customProgramCacheKey;
  return c;
}

// ---------------------------------------------------------------------------

export function createMonsterKit(skin) {
  const glowCol = new THREE.Color(skin.glow);
  const hideCol = new THREE.Color(skin.hide);
  // The materials. `hide` and `glow` are prototypes: every monster wears its
  // own clone of each (the hit flash, and a pulse that quickens through its
  // own wind-up). The rest are shared by the town.
  const M = {
    hide: skinned(new THREE.MeshStandardMaterial({
      color: skin.hide, roughness: 0.82, metalness: 0.05, emissive: 0xffffff, emissiveIntensity: 0,
    }), 'hide'),
    plate: skinned(new THREE.MeshStandardMaterial({ color: skin.plate, roughness: 0.55, metalness: 0.35 }), 'plate'),
    bone: skinned(new THREE.MeshStandardMaterial({ color: skin.bone, roughness: 0.95 }), 'bone'),
    glow: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: glowCol, emissiveIntensity: 2.6, roughness: 0.35 }),
    // mouths, gums, the bed of a wound: wet
    wet: new THREE.MeshPhysicalMaterial({
      color: hideCol.clone().lerp(new THREE.Color(0x2a0306), 0.75), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12,
      emissive: glowCol, emissiveIntensity: 0.05,
    }),
    // the skin of a sac, lit from inside
    shell: skinned(new THREE.MeshPhysicalMaterial({
      color: hideCol.clone().lerp(glowCol, 0.3).multiplyScalar(1.2), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1,
      emissive: glowCol, emissiveIntensity: 0.55, transparent: true, opacity: 0.5, depthWrite: false,
    }), 'shell'),
    // drool, acid on the lip
    slime: new THREE.MeshPhysicalMaterial({
      color: glowCol.clone().lerp(new THREE.Color(0xffffff), 0.5), roughness: 0.1, clearcoat: 1,
      emissive: glowCol, emissiveIntensity: 0.5, transparent: true, opacity: 0.6, depthWrite: false,
    }),
    eye: new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(3.2) }),
  };

  // the same crooked teeth on every monster of a kind: one roll per town
  const kr = mulberry32((skin.glow ^ 0xb0d1e5) >>> 0);
  const geos = []; // every geometry this kit made

  // ---- building: joints with buckets of geometry, baked to one mesh a material
  const J = (parent, name, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    g.userData.b = {};
    parent.add(g);
    return g;
  };
  const put = (joint, key, geo) => {
    (joint.userData.b[key] || (joint.userData.b[key] = [])).push(geo);
  };
  function bake(root) {
    const joints = [];
    root.traverse((o) => { if (o.userData.b) joints.push(o); });
    for (const g of joints) {
      for (const key of Object.keys(g.userData.b)) {
        const list = g.userData.b[key];
        const geo = list.length > 1 ? mergeGeometries(list, false) : list[0];
        if (list.length > 1) for (const l of list) l.dispose();
        geos.push(geo);
        const mesh = new THREE.Mesh(geo, M[key]);
        if (key === 'shell' || key === 'slime') mesh.renderOrder = 2;
        g.add(mesh);
      }
      delete g.userData.b;
    }
    return root;
  }

  // A beast's leg hanging from a hip: a thigh with meat on it, a knee showing
  // bone, a shin, and at the end hooked claws (`claw`: walked on the knuckles),
  // a split hoof (`hoof`) or broad clawed toes (`toe`).
  function beastLeg(parent, name, x, y, z, up, lo, t, kind) {
    const hip = J(parent, name + '.hip', x, y, z);
    put(hip, 'hide', tube([[0, 0.3 * t, 0], [0, -up * 0.45, -t * 0.35], [0, -up, 0]], [t * 1.08, t * 0.9, t * 0.52], { rad: 10, lump: 0.05 }));
    const knee = J(hip, name + '.knee', 0, -up, 0);
    put(knee, 'bone', tube([[0, 0.2 * t, -0.15 * t], [0, 0, -0.55 * t], [0, -0.3 * t, -0.35 * t]], [0.3 * t, 0.36 * t, 0.08 * t], { seg: 6, rad: 6 }));
    put(knee, 'hide', tube([[0, 0.1 * t, 0], [0, -lo * 0.5, t * 0.12], [0, -lo + t * 0.5, 0]], [t * 0.52, t * 0.36, t * 0.46], { rad: 8 }));
    const n = kind === 'hoof' ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const x0 = (k - (n - 1) / 2) * t * 0.45;
      if (kind === 'claw') {
        put(knee, 'bone', tube(
          [[x0, -lo + t * 0.55, t * 0.1], [x0 * 1.2, -lo + t * 0.55, t * 0.95], [x0 * 1.3, -lo + t * 0.14, t * 1.3], [x0 * 1.3, -lo, t * 0.8]],
          [t * 0.25, t * 0.21, t * 0.12, 0.012], { seg: 9, rad: 6 }));
      } else if (kind === 'hoof') {
        put(knee, 'bone', tube([[x0, -lo + t * 0.5, 0], [x0 * 1.2, -lo + t * 0.2, t * 0.5], [x0 * 1.2, -lo, t * 0.8]], [t * 0.32, t * 0.27, 0.03], { seg: 6, rad: 6 }));
      } else {
        put(knee, 'hide', tube([[x0, -lo + t * 0.6, 0], [x0 * 1.5, -lo + t * 0.25, t * 0.8], [x0 * 1.7, -lo + t * 0.12, t * 1.5]], [t * 0.42, t * 0.34, t * 0.2], { seg: 6, rad: 7 }));
        put(knee, 'bone', fang(x0 * 1.7, -lo + t * 0.14, t * 1.45, 0, -0.15, 1, t * 0.7, t * 0.17, 0, -t * 0.15, 0));
      }
    }
    return { hip, knee };
  }
  const legOf = (n, name) => ({ hip: n(name + '.hip'), knee: n(name + '.knee') });

  // a strand of drool: unit length, hanging down from its joint, a bead at the end
  function drool(parent, name, x, y, z) {
    const g = J(parent, name, x, y, z);
    put(g, 'slime', tube([[0, 0, 0], [0, -0.5, 0], [0, -1, 0]], [0.022, 0.008, 0.012], { seg: 4, rad: 5 }));
    put(g, 'slime', at(bead(0.028), 0, -1, 0));
    return g;
  }

  // ---- the five ---------------------------------------------------------------
  // Each builder returns a template root and a function that picks the joints
  // out of a copy of it by name.

  // A flayed boar-hyena the size of a truck.
  function brute() {
    const root = new THREE.Group();
    const body = J(root, 'body');
    // one tube from low hips over the shoulder hump to the neck
    const sp = path([[0, 2.0, -2.75], [0, 2.3, -1.7], [0, 2.7, -0.3], [0, 3.2, 0.9], [0, 2.95, 2.0], [0, 2.6, 2.8]], [0.4, 1.15, 1.45, 1.7, 1.2, 0.75]);
    put(body, 'hide', sweep(sp, { seg: 26, rad: 14, lump: 0.05 }));
    // the skin has split along the spine: the wet bed of it, and the vertebrae standing out
    const bed = [], bedR = [];
    for (let i = 0; i <= 7; i++) {
      const u = 0.1 + i * 0.115, c = sp.at(u);
      bed.push([0, c.y + sp.r(u) * 0.9, c.z]);
      bedR.push(i === 0 || i === 7 ? 0.08 : 0.3);
    }
    put(body, 'wet', tube(bed, bedR, { seg: 18, rad: 6, sy: 0.4 }));
    let opt = 0;
    for (let i = 0; i < 11; i++) {
      const u = 0.1 + i * 0.078, c = sp.at(u);
      const g = fang(0, c.y + sp.r(u) * 0.93, c.z, 0, 0.9, -0.5, 0.38 + kr() * 0.32, 0.12 + kr() * 0.04, 0, 0, -0.12);
      if (i === 3 || i === 7) put(J(body, 'opt.spine' + opt++), 'bone', g); // (one of these may be missing)
      else put(body, 'bone', g);
    }
    // ribs on the flank, and the furnace between them
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const z = -0.2 + i * 0.4;
        for (const lit of [0, 1]) {
          if (lit && i === 5) continue;
          const zz = z + lit * 0.2, u = sp.nearest('z', zz), c = sp.at(u), R = sp.r(u) * (lit ? 0.995 : 1.03);
          const pts = [];
          for (let k = 0; k < 5; k++) {
            const a = (lit ? 0.85 : 0.6) + k * (lit ? 0.3 : 0.44);
            pts.push([s * R * Math.sin(a), c.y + R * Math.cos(a), zz + (a - 1.4) * 0.14]);
          }
          put(body, lit ? 'glow' : 'bone', tube(pts, lit ? [0.02, 0.07, 0.085, 0.06, 0.02] : [0.05, 0.11, 0.1, 0.08, 0.03], { seg: 10, rad: 6 }));
        }
      }
      // the shoulder blade, through the hide
      put(body, 'bone', fang(s * 0.95, 4.35, 1.1, s * 0.3, 0.8, -0.5, 0.7, 0.2, 0, 0, -0.2));
    }

    const head = J(body, 'head', 0, 2.5, 2.6);
    // the skull, bare
    put(head, 'bone', tube([[0, 0.15, -0.4], [0, 0.22, 0.35], [0, 0.1, 1.05], [0, -0.05, 1.7], [0, -0.1, 2.05]], [0.55, 0.74, 0.58, 0.38, 0.2], { seg: 16, rad: 10, sy: 0.78 }));
    for (const s of [-1, 1]) {
      // four pinprick eyes, deep in the sockets
      put(head, 'wet', at(bead(0.1), s * 0.34, 0.42, 0.95));
      put(head, 'eye', at(bead(0.05), s * 0.37, 0.5, 1.0));
      put(head, 'wet', at(bead(0.075), s * 0.53, 0.33, 0.62));
      put(head, 'eye', at(bead(0.036), s * 0.585, 0.385, 0.66));
      put(head, 'bone', fang(s * 0.3, 0.6, 0.75, s * 0.3, 0.25, 0.9, 0.5, 0.11)); // brow ridge
      // the upper row, uneven
      for (let k = 0; k < 7; k++) {
        put(head, 'bone', fang(s * (0.44 - k * 0.035), -0.2 - k * 0.012, 0.6 + k * 0.2, s * 0.12, -1, 0.1, 0.1 + kr() * 0.32, 0.055 + kr() * 0.02));
      }
      // a tusk curving up past the snout, whole (F) or broken (B)
      const i = s < 0 ? 0 : 1;
      put(J(head, 'opt.tuskF' + i), 'bone', tube(
        [[s * 0.45, -0.3, 1.0], [s * 0.78, -0.36, 1.6], [s * 0.88, 0.05, 2.15], [s * 0.72, 0.62, 2.36]], [0.17, 0.15, 0.1, 0.012], { seg: 12, rad: 7 }));
      put(J(head, 'opt.tuskB' + i), 'bone', tube(
        [[s * 0.45, -0.3, 1.0], [s * 0.7, -0.36, 1.45], [s * 0.8, -0.3, 1.72]], [0.17, 0.155, 0.13], { seg: 6, rad: 7, lump: 0.25 }));
    }
    for (let k = -1; k <= 1; k++) put(head, 'bone', fang(k * 0.12, -0.2, 2.02, 0, -1, 0.25, 0.14 + kr() * 0.16, 0.05));
    put(head, 'wet', tube([[0, -0.12, 0.2], [0, -0.2, 1.1], [0, -0.16, 1.95]], [0.5, 0.42, 0.18], { seg: 8, rad: 8, sy: 0.4 })); // the roof of the mouth
    // the throat: the one soft thing at the front of it
    const throat = J(head, 'throat', 0, -0.55, 0.45);
    put(throat, 'glow', sac(0.38, 0.1, 0.1, 3));
    put(throat, 'shell', sac(0.55, 0.2, 0.06, 5));

    // the jaw hinges too far back
    const jaw = J(head, 'jaw', 0, -0.35, 0.5);
    for (const s of [-1, 1]) {
      put(jaw, 'bone', tube([[s * 0.56, 0.08, -0.3], [s * 0.5, -0.05, 0.6], [s * 0.32, -0.1, 1.3], [0, -0.1, 1.72]], [0.15, 0.17, 0.14, 0.1], { seg: 12, rad: 7 }));
      for (let k = 0; k < 6; k++) {
        const u = 0.3 + k * 0.12;
        put(jaw, 'bone', fang(s * (0.5 - u * u * 0.42), -0.02, -0.3 + u * 2.0, s * -0.08, 1, -0.08, 0.1 + kr() * 0.3, 0.05 + kr() * 0.02));
      }
    }
    put(jaw, 'wet', tube([[0, -0.12, -0.1], [0, -0.04, 0.8], [0, -0.1, 1.5]], [0.3, 0.24, 0.08], { seg: 8, rad: 7, sy: 0.5 })); // the tongue
    const dr = [drool(jaw, 'drool0', 0.22, -0.08, 1.45), drool(jaw, 'drool1', -0.3, -0.06, 1.2), drool(jaw, 'drool2', 0, -0.1, 1.72)];
    void dr;

    beastLeg(body, 'leg0', 1.35, 2.5, 1.9, 1.5, 1.35, 0.5, 'claw');
    beastLeg(body, 'leg1', -1.35, 2.5, 1.9, 1.5, 1.35, 0.5, 'claw');
    beastLeg(body, 'leg2', 1.3, 2.4, -1.9, 1.4, 1.3, 0.5, 'hoof');
    beastLeg(body, 'leg3', -1.3, 2.4, -1.9, 1.4, 1.3, 0.5, 'hoof');

    const tail = J(body, 'tail', 0, 2.3, -2.6);
    put(tail, 'hide', tube([[0, 0, 0.2], [0, -0.3, -0.7], [0, -1.0, -1.3], [0, -1.7, -1.45]], [0.32, 0.2, 0.11, 0.04], { seg: 10, rad: 6 }));
    for (let k = 0; k < 3; k++) put(tail, 'bone', fang(0, -1.2 - k * 0.2, -1.36 - k * 0.04, 0, 0.2, -1, 0.3, 0.05));

    return {
      root: bake(root),
      pick: (n) => ({
        body: n('body'), head: n('head'), jaw: n('jaw'), tail: n('tail'), throat: n('throat'),
        legs: [legOf(n, 'leg0'), legOf(n, 'leg1'), legOf(n, 'leg2'), legOf(n, 'leg3')],
        drool: [n('drool0'), n('drool1'), n('drool2')],
        mouth: n('drool2'),
        opt: { spines: [n('opt.spine0'), n('opt.spine1')], tuskF: [n('opt.tuskF0'), n('opt.tuskF1')], tuskB: [n('opt.tuskB0'), n('opt.tuskB1')] },
      }),
    };
  }

  // A starved, plucked bird with a tick's burden.
  function spitter() {
    const root = new THREE.Group();
    const body = J(root, 'body');
    const tp = path([[0, 1.85, -0.3], [0, 2.35, -0.05], [0, 2.95, 0.22], [0, 3.3, 0.45]], [0.4, 0.72, 0.6, 0.3]);
    put(body, 'hide', sweep(tp, { seg: 16, rad: 10, sx: 0.85, lump: 0.05 }));
    // ribs, standing out of it
    for (let i = 0; i < 6; i++) {
      const y = 2.05 + i * 0.2, u = tp.nearest('y', y), c = tp.at(u), R = tp.r(u) * 1.03;
      for (const s of [-1, 1]) {
        const pts = [];
        for (let k = 0; k < 5; k++) {
          const a = 0.35 + k * 0.6;
          pts.push([s * Math.sin(a) * R * 0.85, y - k * 0.03, c.z + Math.cos(a) * R]);
        }
        put(body, 'bone', tube(pts, [0.02, 0.04, 0.045, 0.04, 0.03], { seg: 8, rad: 5 }));
      }
    }
    for (const s of [-1, 1]) put(body, 'bone', fang(s * 0.3, 2.0, -0.3, s * 0.7, -0.2, -0.5, 0.5, 0.09)); // the hips
    for (let i = 0; i < 4; i++) put(body, 'bone', fang(0, 2.3 + i * 0.22, -0.62 + i * 0.1, 0, 0.3, -1, 0.16, 0.05)); // the back
    put(body, 'hide', tube([[0, 2.85, -0.1], [0, 3.1, -0.45], [0, 3.2, -0.8]], [0.3, 0.26, 0.38], { seg: 6, rad: 8 })); // what the sac hangs from

    // the sac: skin stretched thin over the light, with dark things adrift in it
    const sc = J(body, 'sac', 0, 3.25, -0.95);
    put(sc, 'glow', at(sac(0.5, 0.1, 0.16, 2), 0, -0.12, 0));
    put(sc, 'glow', at(sac(0.3, 0, 0.2, 7), 0.22, 0.3, -0.1));
    put(sc, 'shell', sac(1.0, 0.16, 0.05, 4));
    for (let i = 0; i < 4; i++) put(J(sc, 'sac.f' + i), 'plate', sac(0.11 + kr() * 0.09, 0.4, 0.3, i * 3 + 1));

    const neck = J(body, 'neck', 0, 3.1, 0.5);
    put(neck, 'hide', tube([[0, -0.2, -0.12], [0, 0.45, 0.2], [0, 0.98, 0.62]], [0.26, 0.17, 0.17], { seg: 18, rad: 9, ring: 7, ringAmp: 0.28 }));
    // no face: a tube, ending in a ring of teeth round a lit throat
    const head = J(neck, 'head', 0, 0.95, 0.6);
    put(head, 'hide', tube([[0, 0.02, -0.2], [0, -0.02, 0.35], [0, -0.06, 0.8]], [0.17, 0.22, 0.31], { seg: 8, rad: 11, open: true }));
    put(head, 'wet', at(prep(new THREE.TorusGeometry(0.3, 0.05, 6, 14)), 0, -0.06, 0.8));
    put(head, 'glow', at(prep(new THREE.ConeGeometry(0.27, 0.5, 10, 1, true)), 0, -0.04, 0.55, -Math.PI / 2));
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      put(head, 'bone', fang(c * 0.3, -0.06 + sn * 0.3, 0.8, -c * 0.5, -sn * 0.5, 0.85, 0.12 + kr() * 0.18, 0.04));
    }
    drool(head, 'drool0', 0.05, -0.36, 0.82);
    J(head, 'mouth', 0, -0.36, 0.85);

    // backward-kneed, on long toes
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const hip = J(body, `leg${i}.hip`, s * 0.7, 2.1, 0);
      put(hip, 'hide', tube([[s * -0.25, 0.15, 0], [0, -0.5, 0.04], [0, -1.15, 0]], [0.22, 0.13, 0.085], { seg: 8, rad: 7 }));
      const knee = J(hip, `leg${i}.knee`, 0, -1.15, 0);
      put(knee, 'bone', fang(0, 0.08, 0, 0, -0.3, 1, 0.22, 0.1));
      put(knee, 'hide', tube([[0, 0.05, 0], [0, -0.55, 0], [0, -1.05, 0]], [0.1, 0.055, 0.075], { seg: 6, rad: 6 }));
      for (let k = -1; k <= 1; k++) put(knee, 'bone', fang(k * 0.04, -1.06, 0, k * 0.4, 0.34, 0.94, 0.85, 0.06, 0, -0.06, 0));
      put(knee, 'bone', fang(0, -1.06, 0, 0, -0.34, -0.94, 0.4, 0.05));
    }
    // two useless hooked arms at the chest
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const arm = J(body, 'arm' + i, s * 0.5, 2.95, 0.42);
      put(arm, 'hide', tube([[0, 0, 0], [s * 0.12, -0.45, 0.3], [s * 0.04, -0.5, 0.75]], [0.07, 0.05, 0.04], { seg: 8, rad: 5 }));
      put(arm, 'bone', fang(s * 0.04, -0.5, 0.75, 0, -0.6, 0.6, 0.3, 0.04, 0, -0.1, -0.2));
    }
    return {
      root: bake(root),
      pick: (n) => ({
        body: n('body'), sac: n('sac'), neck: n('neck'), head: n('head'), mouth: n('mouth'),
        floaters: [n('sac.f0'), n('sac.f1'), n('sac.f2'), n('sac.f3')],
        legs: [legOf(n, 'leg0'), legOf(n, 'leg1')], arms: [n('arm0'), n('arm1')], drool: [n('drool0')],
        opt: {},
      }),
    };
  }

  // A harvestman crossed with a mantis, seven metres up.
  const PHI = 2.2, UP = 3.3, NEEDLE = 1.5;
  const KNEE_Y = 5.6 - Math.cos(PHI) * UP; // knee height above the ground
  function stalker() {
    const root = new THREE.Group();
    const body = J(root, 'body', 0, 5.6, 0);
    put(body, 'plate', tube([[0, 0.1, -1.5], [0, 0.3, -0.7], [0, 0.38, 0.2], [0, 0.2, 1.15]], [0.4, 0.95, 1.0, 0.5], { seg: 20, rad: 12, sy: 0.5, ring: 6, ringAmp: 0.14 }));
    put(body, 'hide', tube([[0, -0.08, -1.2], [0, -0.22, 0], [0, -0.08, 1.0]], [0.4, 0.72, 0.4], { seg: 10, rad: 10, sy: 0.45 }));
    for (let i = 0; i < 5; i++) {
      const g = fang(0, 0.72 - Math.abs(i - 2) * 0.1, 0.85 - i * 0.5, 0, 0.9, -0.5, 0.7 + kr() * 0.5, 0.11);
      if (i === 1 || i === 3) put(J(body, 'opt.spine' + (i === 1 ? 0 : 1)), 'bone', g);
      else put(body, 'bone', g);
    }
    // the core hangs under it like an egg sac on cords, and swings
    const core = J(body, 'core', 0, -0.3, 0.25);
    for (const [cx, cz] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
      put(core, 'wet', tube([[cx, 0.1, cz], [cx * 0.7, -0.1, cz * 0.7], [cx * 0.5, -0.32, cz * 0.5]], [0.035, 0.025, 0.035], { seg: 5, rad: 5 }));
    }
    put(core, 'glow', at(sac(0.36, 0.15, 0.12, 6), 0, -0.5, 0));
    put(core, 'shell', at(sac(0.55, 0.28, 0.06, 2), 0, -0.47, 0));

    const head = J(body, 'head', 0, -0.1, 1.5);
    put(head, 'hide', tube([[0, 0, -0.35], [0, 0.06, 0.2], [0, 0, 0.72]], [0.3, 0.42, 0.24], { seg: 9, rad: 9, sy: 0.8 }));
    // four eyes, no two the same size
    for (const [x, y, z, r] of [[0.26, 0.2, 0.52, 0.13], [-0.2, 0.25, 0.58, 0.09], [0.07, 0.31, 0.56, 0.06], [-0.34, 0.1, 0.42, 0.045]]) {
      put(head, 'eye', at(bead(r), x, y, z));
    }
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const md = J(head, 'mand' + i, s * 0.25, -0.15, 0.55);
      put(md, 'bone', tube([[0, 0, 0], [s * 0.2, -0.15, 0.45], [s * -0.03, -0.25, 0.8], [s * -0.2, -0.23, 0.9]], [0.09, 0.08, 0.05, 0.008], { seg: 9, rad: 6 }));
    }
    // Stilt legs: each rises out of the body to a knee above it, then drops to
    // an ankle low down and a needle that places the point.
    let li = 0;
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const yaw = J(body, `leg${li}.yaw`, sx * 0.7, 0, sz * 0.9);
      yaw.rotation.y = Math.atan2(-sz, sx); // local +x points out along the leg
      const hip = J(yaw, `leg${li}.hip`);
      hip.rotation.z = PHI;
      put(hip, 'plate', tube([[0, 0.1, 0], [0, -UP * 0.5, 0], [0, -UP, 0]], [0.2, 0.1, 0.12], { seg: 8, rad: 6 }));
      put(hip, 'bone', tube([[0, 0.25, 0], [0, 0, 0], [0, -0.3, 0]], [0.1, 0.27, 0.1], { seg: 5, rad: 7 }));
      const knee = J(hip, `leg${li}.knee`, 0, -UP, 0);
      knee.rotation.z = -PHI;
      put(knee, 'bone', tube([[0.1, 0.3, 0], [0, 0, 0], [0, -0.3, 0]], [0.04, 0.24, 0.1], { seg: 5, rad: 7 }));
      put(knee, 'plate', tube([[0, 0, 0], [0, -(KNEE_Y - NEEDLE) * 0.5, 0], [0, -(KNEE_Y - NEEDLE), 0]], [0.13, 0.075, 0.085], { seg: 8, rad: 6 }));
      const ankle = J(knee, `leg${li}.ankle`, 0, -(KNEE_Y - NEEDLE), 0);
      put(ankle, 'bone', tube([[0, 0.14, 0], [0, 0, 0], [0, -0.9, 0], [0, -NEEDLE, 0]], [0.05, 0.14, 0.05, 0.006], { seg: 9, rad: 6 }));
      li++;
    }
    // folded scythe arms, serrated on the inside edge
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const arm = J(body, 'scy' + i, s * 0.9, -0.2, 1.1);
      put(arm, 'hide', tube([[0, 0, 0], [0, -0.75, 0.52], [0, -1.5, 1.0]], [0.14, 0.1, 0.1], { seg: 8, rad: 6 }));
      const blade = J(arm, `scy${i}.blade`, 0, -1.5, 1.0);
      put(blade, 'bone', tube([[0, 0, 0], [0, 0.16, 0.9], [0, 0.06, 1.8], [0, -0.38, 2.5]], [0.11, 0.14, 0.1, 0.008], { seg: 14, rad: 6, sx: 0.22 }));
      for (let k = 0; k < 9; k++) {
        const z = 0.35 + k * 0.22;
        put(blade, 'bone', fang(0, 0.12 - (z - 0.9) * (z - 0.9) * 0.14 - 0.1, z, 0, -1, -0.5, 0.12 + kr() * 0.08, 0.035));
      }
    }
    const legJ = (n, i) => ({ yaw: n(`leg${i}.yaw`), hip: n(`leg${i}.hip`), knee: n(`leg${i}.knee`), ankle: n(`leg${i}.ankle`) });
    return {
      root: bake(root),
      pick: (n) => ({
        body: n('body'), head: n('head'), core: n('core'), mands: [n('mand0'), n('mand1')],
        legs: [0, 1, 2, 3].map((i) => { const L = legJ(n, i); L.base = L.yaw.rotation.y; return L; }),
        scythes: [n('scy0'), n('scy1')], blades: [n('scy0.blade'), n('scy1.blade')],
        opt: { spines: [n('opt.spine0'), n('opt.spine1')] },
      }),
    };
  }

  // A starved giant, hunched like a gorilla, skin hanging in folds.
  function titan() {
    const root = new THREE.Group();
    const body = J(root, 'body');
    const torso = J(body, 'torso', 0, 8.6, 0);
    const tp = path([[0, -2.3, -0.1], [0, -1.0, -0.25], [0, 1.2, -0.5], [0, 3.4, -0.35], [0, 5.4, 0.2], [0, 6.5, 0.75]], [1.5, 2.2, 2.5, 3.3, 2.7, 1.1]);
    put(torso, 'hide', sweep(tp, { seg: 30, rad: 16, sx: 1.15, sy: 0.8, lump: 0.07 }));
    // skin in folds: off the belly, off the flanks
    for (const [x, y, z, l] of [[-1.3, -0.4, 1.75, 2.4], [0.2, -0.9, 1.9, 2.0], [1.5, -0.2, 1.7, 2.7], [-2.7, 1.0, 0.6, 2.2], [2.75, 1.4, 0.4, 2.0]]) {
      put(torso, 'hide', tube([[x, y, z - 0.3], [x * 1.04, y - l * 0.55, z + 0.25], [x * 1.02, y - l, z]], [0.5, 0.62, 0.08], { seg: 8, rad: 8, sy: 0.32, lump: 0.1 }));
    }
    // the ribcage has split down the front: the wet bed of it, and each rib a bone of its own
    put(torso, 'wet', tube([[0, 0.5, 1.75], [0, 3.0, 2.05], [0, 5.3, 1.9]], [0.5, 1.5, 0.5], { seg: 10, rad: 10, sy: 0.4 }));
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const y = 1.2 + i * 0.85, out = 1.0 + Math.abs(i - 2) * 0.12;
        put(torso, 'bone', tube(
          [[s * 3.2, y + 0.35, 0.2], [s * 2.75, y + 0.15, 1.9], [s * 1.9, y - 0.05, 3.1], [s * out, y - 0.25, 3.8 - Math.abs(i - 2) * 0.45]],
          [0.2, 0.27, 0.22, 0.09], { seg: 12, rad: 7 }));
      }
    }
    // broken vertebrae down the back
    let opt = 0;
    for (let i = 0; i < 8; i++) {
      const y = -0.8 + i * 0.9, u = tp.nearest('y', y), c = tp.at(u);
      const broken = i === 2 || i === 5;
      const g = fang(0, y, c.z - tp.r(u) * 0.78, 0, 0.55, -0.85, broken ? 0.6 : 1.1 + kr() * 0.7, 0.34, 0, 0, broken ? 0 : -0.3, broken ? { lump: 0.3 } : undefined);
      if (i === 3 || i === 6) put(J(torso, 'opt.spine' + opt++), 'bone', g);
      else put(torso, 'bone', g);
    }
    // three sacs: the chest, bulging out between the ribs, and two torn up through the shoulders
    for (const [i, x, y, z, r] of [[0, 0, 3.0, 2.75, 1.3], [1, 3.7, 5.5, 0.2, 1.18], [2, -3.7, 5.5, 0.2, 1.18]]) {
      const sj = J(torso, 'sac' + i, x, y, z);
      put(sj, 'glow', sac(r * 0.62, 0.1, 0.14, i + 2));
      put(sj, 'shell', sac(r, 0.12, 0.05, i * 2 + 1));
      if (i) {
        // the hide it tore through, standing round it
        const col = [];
        for (let k = 0; k <= 6; k++) col.push(new THREE.Vector2(r * (1.12 - 0.035 * k * k * 0.3), -r * 1.0 + k * r * 0.17));
        const g = new THREE.LatheGeometry(col, 14);
        const pa = g.attributes.position;
        for (let v = 0; v < pa.count; v++) {
          const top = Math.max(0, (pa.getY(v) + r) / r);
          pa.setY(v, pa.getY(v) - top * 0.5 * r * Math.max(0, Math.sin(Math.atan2(pa.getZ(v), pa.getX(v)) * 5 + i)));
        }
        g.computeVertexNormals();
        put(torso, 'hide', at(prep(g), x, y, z));
      }
    }
    // the head: small, sunk between them
    const head = J(torso, 'head', 0, 7.0, 1.0);
    put(head, 'hide', tube([[0, -0.3, -0.8], [0, -0.1, 0], [0, -0.28, 0.78]], [0.7, 0.95, 0.6], { seg: 10, rad: 10, sy: 0.85, lump: 0.05 }));
    const eyeY = [0.1, 0.34, 0.04, 0.4, 0.16, 0.3], eyeR = [0.1, 0.14, 0.08, 0.12, 0.15, 0.09];
    for (let i = 0; i < 6; i++) {
      const a = -0.8 + i * 0.32;
      put(head, 'eye', at(bead(eyeR[i]), Math.sin(a) * 0.82, -0.05 + eyeY[i], 0.1 + Math.cos(a) * 0.72));
    }
    put(head, 'wet', tube([[0, -0.5, 0], [0, -0.6, 0.6], [0, -0.55, 1.15]], [0.6, 0.55, 0.25], { seg: 6, rad: 8, sy: 0.35 }));
    for (let k = 0; k < 9; k++) put(head, 'bone', fang(-0.52 + k * 0.13, -0.6, 1.0 - Math.abs(k - 4) * 0.07, 0, -1, 0.15, 0.2 + kr() * 0.35, 0.07));
    // the jaw, unhinged and running
    const jaw = J(head, 'jaw', 0, -0.6, 0.4);
    for (const s of [-1, 1]) {
      put(jaw, 'bone', tube([[s * 0.8, 0.15, -0.4], [s * 0.72, -0.1, 0.5], [s * 0.45, -0.18, 1.15], [0, -0.18, 1.5]], [0.2, 0.24, 0.2, 0.15], { seg: 10, rad: 7 }));
      for (let k = 0; k < 5; k++) {
        const u = 0.35 + k * 0.14;
        put(jaw, 'bone', fang(s * (0.72 - u * u * 0.65), -0.04, -0.4 + u * 1.9, 0, 1, -0.1, 0.18 + kr() * 0.36, 0.075));
      }
    }
    put(jaw, 'wet', tube([[0, -0.15, -0.1], [0, -0.1, 0.8], [0, -0.5, 1.6], [0, -1.1, 1.75]], [0.45, 0.36, 0.22, 0.08], { seg: 10, rad: 7, sy: 0.5 })); // the tongue, out
    drool(jaw, 'drool0', 0.3, -0.2, 1.3);
    drool(jaw, 'drool1', -0.2, -0.22, 1.45);
    J(jaw, 'mouth', 0, -0.2, 1.5);

    // arms long enough that the claws drag
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const sh = J(torso, `arm${i}.shoulder`, s * 4.4, 4.9, 0);
      put(sh, 'hide', tube([[s * -0.6, 0.5, 0], [0, -2.5, -0.35], [0, -5.2, 0]], [1.2, 0.9, 0.6], { seg: 12, rad: 10, lump: 0.07 }));
      put(sh, 'hide', tube([[0, -0.8, -0.5], [0, -2.6, -1.1], [0, -4.3, -0.5]], [0.3, 0.5, 0.06], { seg: 8, rad: 7, sx: 0.3, lump: 0.1 })); // a fold off the arm
      const el = J(sh, `arm${i}.elbow`, 0, -5.2, 0);
      put(el, 'bone', tube([[0, 0.4, -0.4], [0, 0, -0.85], [0, -0.5, -0.5]], [0.4, 0.5, 0.1], { seg: 6, rad: 7 }));
      put(el, 'hide', tube([[0, 0.2, 0], [0, -3.0, 0.3], [0, -6.0, 0.2]], [0.58, 0.55, 0.8], { seg: 12, rad: 12, lump: 0.05 }));
      for (let k = -1; k <= 1; k++) {
        const x = k * 0.52;
        put(el, 'bone', tube([[x, -5.9, 0.3], [x * 1.1, -6.9, 0.75], [x * 1.2, -7.7, 0.35], [x * 1.2, -7.95, -0.3]], [0.3, 0.26, 0.16, 0.015], { seg: 10, rad: 6 }));
      }
      J(el, `arm${i}.claw`, 0, -7.9, 0);
    }
    beastLeg(body, 'leg0', 1.9, 7.6, 0, 3.8, 3.8, 1.25, 'toe');
    beastLeg(body, 'leg1', -1.9, 7.6, 0, 3.8, 3.8, 1.25, 'toe');
    return {
      root: bake(root),
      pick: (n) => ({
        body: n('body'), torso: n('torso'), head: n('head'), jaw: n('jaw'), mouth: n('mouth'),
        sacs: [n('sac0'), n('sac1'), n('sac2')],
        arms: [0, 1].map((i) => ({ shoulder: n(`arm${i}.shoulder`), elbow: n(`arm${i}.elbow`), claw: n(`arm${i}.claw`) })),
        legs: [legOf(n, 'leg0'), legOf(n, 'leg1')], drool: [n('drool0'), n('drool1')],
        opt: { spines: [n('opt.spine0'), n('opt.spine1')] },
      }),
    };
  }

  const BUILD = { brute, spitter, stalker, titan };
  const templates = {}; // built the first time a kind is wanted

  // ---- posing ---------------------------------------------------------------
  // m: { type, j, phase, moving, tele, strike, flinch, deadK, attack, look }
  //   phase   gait phase (radians), advanced by distance walked
  //   moving  0..1
  //   tele    0..1 wind-up of the attack named in m.attack
  //   strike  1 at the moment of impact, decaying to 0
  //   deadK   0 alive .. 1 fully collapsed
  //   look    the bearing to the player from the way the body faces (radians);
  //           the head turns to it as far as a neck goes
  // Nothing stands still: breath, a twitch now and then, the head following.

  const clamp = THREE.MathUtils.clamp;

  function hang(g, i, t, m, pitch, len) {
    // drool: hangs straight down whatever the head is doing, and stretches
    g.rotation.x = -pitch;
    g.scale.y = len * (0.55 + 0.45 * Math.sin(t * 0.9 + i * 2.1 + m.seed * 3)) + 0.08;
  }

  function pose(m, t) {
    const j = m.j;
    const dt = Math.min(0.1, Math.max(0, t - m.lastT));
    m.lastT = t;
    const mv = m.moving;
    const tele = m.tele;
    const st = m.strike;
    const br = Math.sin(t * 1.7 + m.seed); // breathing
    const fl = m.flinch;
    const d = m.deadK;
    const dE = d * d * (3 - 2 * d);
    const alive = 1 - dE;
    // the light inside: a pulse that quickens through every wind-up
    m.pulseT += dt * (2.4 + tele * 16);
    const pulse = Math.sin(m.pulseT);
    // a twitch: brief, now and then
    const tw = Math.max(0, Math.sin(t * 0.83 + m.seed * 5.1)) ** 24 * Math.sin(t * 38) * alive;
    // the head comes round to the player
    m.lookE += (clamp(m.look || 0, -1, 1) * alive - m.lookE) * Math.min(1, dt * 3.2);
    const limp = (i) => (m.limp === i ? 0.42 : 1);
    let glowK = 1;

    if (m.type === 'brute') {
      const slam = m.attack === 'slam';
      j.body.position.y = Math.abs(Math.sin(m.phase)) * 0.14 * mv + br * 0.03 - dE * 1.2;
      // rear up for the slam, drop the head for the charge
      j.body.rotation.x = (slam ? -tele * 0.5 + st * 0.3 : tele * 0.16) + fl * 0.06;
      j.body.rotation.z = dE * 1.45 + (m.limp >= 0 ? Math.sin(m.phase) * 0.05 * mv : 0);
      j.body.scale.x = 1 + br * 0.018; // the flanks, breathing
      j.head.rotation.x = (slam ? -tele * 0.35 : tele * 0.4) + Math.sin(m.phase * 0.5) * 0.06 * mv + tw * 0.05;
      j.head.rotation.y = m.lookE * 0.55;
      j.head.rotation.z = tw * 0.1;
      // the jaw: to about fifty degrees on the slam
      j.jaw.rotation.x = 0.14 + br * 0.05 + (slam ? tele * 0.45 + st * 0.75 : tele * 0.6 + st * 0.3) + dE * 0.5;
      j.throat.scale.setScalar(1 + pulse * 0.07 + tele * 0.15);
      j.tail.rotation.y = Math.sin(m.phase * 0.5 + 1) * 0.3 * mv + br * 0.08 + tw * 0.4;
      const pitch = j.body.rotation.x + j.head.rotation.x + j.jaw.rotation.x;
      for (let i = 0; i < 3; i++) hang(j.drool[i], i, t, m, pitch, 0.5 + j.jaw.rotation.x * 0.9);
      for (let i = 0; i < 4; i++) {
        const diag = i === 0 || i === 3 ? 0 : Math.PI;
        const s = Math.sin(m.phase + diag);
        const front = i < 2;
        j.legs[i].hip.rotation.x = s * 0.5 * mv * limp(i) + (slam && front ? -tele * 1.2 + st * 1.0 : 0) - dE * 0.9;
        j.legs[i].knee.rotation.x = Math.max(0, -Math.cos(m.phase + diag)) * 0.7 * mv * limp(i) + (slam && front ? tele * 0.9 : 0);
      }
      // the furnace between the ribs, brightest as it winds up the charge
      glowK = 1 + tele * (slam ? 0.5 : 1.4);
    } else if (m.type === 'spitter') {
      j.body.position.y = Math.abs(Math.sin(m.phase)) * 0.1 * mv - dE * 1.6;
      j.body.rotation.x = -tele * 0.22 + st * 0.3 + fl * 0.1;
      j.body.rotation.z = dE * 1.5;
      // the sac fills through the wind-up and visibly empties on the spit
      const swell = 1 + br * 0.04 + pulse * 0.02 + tele * 0.3 - st * 0.42 - dE * 0.7;
      j.sac.scale.set(Math.max(0.2, swell), Math.max(0.2, swell - st * 0.25), Math.max(0.2, swell));
      for (let i = 0; i < 4; i++) {
        // the dark shapes inside, adrift
        const a = t * (0.22 + i * 0.07) + i * 1.7 + m.seed, b = t * 0.17 + i * 2.3;
        j.floaters[i].position.set(Math.cos(a) * 0.62 * Math.cos(b), Math.sin(b) * 0.5 + 0.05, Math.sin(a) * 0.62 * Math.cos(b));
        j.floaters[i].rotation.set(a, b, a * 0.5);
      }
      // the neck draws back, then whips
      j.neck.rotation.x = -tele * 0.75 + st * 1.0 + tw * 0.06;
      j.neck.rotation.y = m.lookE * 0.5;
      j.head.rotation.x = -tele * 0.3 + st * 0.45 + br * 0.03;
      j.head.rotation.y = m.lookE * 0.4;
      j.head.rotation.z = tw * 0.25;
      hang(j.drool[0], 0, t, m, j.body.rotation.x + j.neck.rotation.x + j.head.rotation.x, 0.45);
      for (let i = 0; i < 2; i++) {
        const s = Math.sin(m.phase + i * Math.PI);
        j.legs[i].hip.rotation.x = s * 0.55 * mv * limp(i) - 0.35;
        j.legs[i].knee.rotation.x = 0.7 + Math.max(0, -Math.cos(m.phase + i * Math.PI)) * 0.6 * mv;
        // the arms: no use, never still
        j.arms[i].rotation.x = br * 0.1 - tele * 0.6 + Math.sin(t * 9.1 + i * 2 + m.seed) * 0.06 + tw * (i ? -0.5 : 0.5);
        j.arms[i].rotation.z = Math.sin(t * 6.3 + i * 4) * 0.05;
      }
      glowK = 1 + tele * 0.9 - st * 0.4;
    } else if (m.type === 'stalker') {
      const leap = m.attack === 'leap', swipe = m.attack === 'swipe';
      // crouch for the leap, sink on death
      const y = 5.6 - tele * (leap ? 2.4 : 0.6) + br * 0.06 - dE * 4.6;
      // the core: a weight on cords, swung by whatever the body just did
      const lean = (swipe ? tele * 0.25 - st * 0.2 : -tele * 0.12) + fl * 0.08;
      const drive = -mv * 0.22 + Math.sin(m.phase * 2) * 0.06 * mv + (y - m.bodyY) * 0.9 - lean;
      m.swV += ((drive - m.sw) * 26 - m.swV * 2.4) * dt;
      m.sw = clamp(m.sw + m.swV * dt, -0.9, 0.9);
      m.bodyY = y;
      j.core.rotation.x = m.sw;
      j.core.rotation.z = Math.sin(t * 1.3 + m.seed) * 0.05 + m.swV * 0.04;
      j.core.scale.setScalar(1 + pulse * 0.05 + tele * 0.12);
      j.body.position.y = y;
      j.body.rotation.x = lean;
      j.body.rotation.z = dE * 0.5 + (m.limp >= 0 ? Math.sin(m.phase) * 0.03 * mv : 0);
      j.head.rotation.x = br * 0.05 + tele * 0.2;
      j.head.rotation.y = m.lookE * 0.7;
      j.head.rotation.z = tw * 0.3;
      for (let i = 0; i < 2; i++) j.mands[i].rotation.y = (i ? -1 : 1) * (Math.max(0, Math.sin(t * 2.3 + m.seed)) * 0.25 + tele * 0.5 - st * 0.4 + Math.abs(tw));
      for (let i = 0; i < 4; i++) {
        const L = j.legs[i];
        const off = i === 0 || i === 3 ? 0 : Math.PI;
        L.yaw.rotation.y = L.base + Math.sin(m.phase + off) * 0.34 * mv * limp(i);
        // lift on the forward swing; splay as the body drops
        const lift = Math.max(0, Math.cos(m.phase + off)) * 0.16 * mv * limp(i);
        const drop = (tele * (leap ? 2.4 : 0.6) + dE * 4.6) / 5.6;
        L.hip.rotation.z = PHI + lift + drop * 0.55;
        L.knee.rotation.z = -PHI - lift - drop * 0.55;
        // the needle: tucked as the leg lifts, reaching for its place as it comes down, like a spider's
        L.ankle.rotation.z = lift * 4.2 - Math.max(0, -Math.cos(m.phase + off)) * 0.1 * mv + drop * 0.5;
      }
      // the scythes stay folded until the swipe winds up, then come out fast
      const want = swipe ? Math.min(1, tele * 3.5) : st > 0.05 && m.unfold > 0.5 ? 1 : 0;
      m.unfold += (want - m.unfold) * Math.min(1, dt * (want > m.unfold ? 30 : 3.5));
      for (let i = 0; i < 2; i++) {
        j.scythes[i].rotation.x = -0.2 + br * 0.06 - (swipe ? tele * 1.5 : tele * 0.4) + st * 1.9;
        j.blades[i].rotation.x = -2.2 + m.unfold * 2.6 + tw * 0.15;
      }
      glowK = 1 + tele * 0.8;
    } else if (m.type === 'titan') {
      const stomp = m.attack === 'stomp';
      const step = Math.sin(m.phase);
      const slow = Math.sin(t * 0.8 + m.seed); // slow breath, the whole torso
      j.body.position.y = Math.abs(step) * 0.35 * mv - dE * 3.2;
      j.body.rotation.x = dE * 1.25;
      j.torso.position.y = 8.6 + slow * 0.1;
      j.torso.scale.set(1 + slow * 0.014, 1 + slow * 0.008, 1 + slow * 0.03);
      j.torso.rotation.z = step * 0.05 * mv + (m.limp >= 0 ? Math.max(0, step) * 0.03 * mv : 0);
      j.torso.rotation.x = (stomp ? -tele * 0.12 + st * 0.2 : tele * 0.22) + slow * 0.02 + fl * 0.03;
      j.head.rotation.x = br * 0.04 - (m.attack === 'volley' ? tele * 0.5 : 0) + tw * 0.04;
      j.head.rotation.y = m.lookE * 0.6;
      j.head.rotation.z = tw * 0.08;
      j.jaw.rotation.x = 0.28 + br * 0.06 + tele * 0.7;
      j.jaw.rotation.z = 0.14 + slow * 0.03; // off its hinge
      const pitch = j.body.rotation.x + j.torso.rotation.x + j.head.rotation.x + j.jaw.rotation.x;
      for (let i = 0; i < 2; i++) hang(j.drool[i], i, t, m, pitch, 2.2);
      for (let i = 0; i < 2; i++) {
        const s = Math.sin(m.phase + i * Math.PI);
        const raise = stomp && i === 0 ? tele * 1.05 - st * 1.0 : 0;
        j.legs[i].hip.rotation.x = s * 0.4 * mv * limp(i) - raise - dE * 0.8;
        j.legs[i].knee.rotation.x = Math.max(0, -Math.cos(m.phase + i * Math.PI)) * 0.55 * mv + raise * 1.1 + dE * 1.4;
        // the arms hang low and swing late, with their weight
        const sw = Math.sin(m.phase + i * Math.PI - 0.7);
        j.arms[i].shoulder.rotation.x = -sw * 0.36 * mv - (m.attack === 'volley' ? tele * 0.5 : 0) + dE * 0.6 + slow * 0.02;
        j.arms[i].shoulder.rotation.z = (i ? -1 : 1) * (0.1 + tele * 0.15);
        j.arms[i].elbow.rotation.x = -0.1 - Math.max(0, sw) * 0.16 * mv - (m.attack === 'volley' ? tele * 0.5 : 0);
      }
      // all three sacs pulse, out of step
      for (let i = 0; i < 3; i++) j.sacs[i].scale.setScalar(1 + Math.sin(m.pulseT * (0.8 + i * 0.13) + i * 2.1) * 0.06 + tele * 0.18 - dE * 0.5);
      glowK = 1 + tele * 0.7;
    }
    m.glow.emissiveIntensity = 2.6 * (0.74 + 0.26 * pulse) * glowK * (1 - dE * 0.85);
    // a hit flashes the hide white for a moment
    m.hide.emissiveIntensity = m.hitFlash * 0.55;
  }

  // No two quite alike: a broken tusk, a missing spine, a limp. From the
  // monster's own seed.
  function vary(m) {
    const r = mulberry32((Math.floor(m.seed * 1e5) ^ 0x51ed) >>> 0);
    const o = m.j.opt;
    if (o.spines) {
      const gone = r() < 0.6 ? Math.floor(r() * o.spines.length) : -1;
      for (let i = 0; i < o.spines.length; i++) o.spines[i].visible = i !== gone;
    }
    if (o.tuskF) {
      const broken = r() < 0.55 ? Math.floor(r() * 2) : -1;
      for (let i = 0; i < 2; i++) {
        o.tuskF[i].visible = i !== broken;
        o.tuskB[i].visible = i === broken;
      }
    }
    m.limp = r() < 0.35 ? Math.floor(r() * m.j.legs.length) : -1;
    const k = 0.985 + r() * 0.03; // and none quite the same size (the hit volumes do not change)
    m.root.scale.set(k, 0.985 + r() * 0.03, k);
  }

  function make(type, seed) {
    const tpl = templates[type] || (templates[type] = BUILD[type]());
    const root = tpl.root.clone(true);
    const hide = cloneSkinned(M.hide), glow = M.glow.clone();
    const names = {};
    root.traverse((o) => {
      if (o.name) names[o.name] = o;
      if (o.isMesh) {
        if (o.material === M.hide) o.material = hide;
        else if (o.material === M.glow) o.material = glow;
      }
    });
    const m = {
      type, root, j: tpl.pick((n) => names[n]), hide, glow, seed,
      phase: seed, moving: 0, tele: 0, strike: 0, flinch: 0, hitFlash: 0, deadK: 0, attack: null,
      look: 0, lookE: 0, lastT: 0, pulseT: seed * 3, limp: -1, sw: 0, swV: 0, bodyY: 5.6, unfold: 0,
    };
    vary(m);
    return m;
  }

  // A monster's hide and its light are its own (the hit flash, the pulse);
  // everything else is shared.
  function free(m) {
    m.hide.dispose();
    m.glow.dispose();
  }

  // Where a monster's mouth is (for what runs from it), and where a titan's
  // claws are (for what they do to the ground). From the last frame drawn.
  function mouthOf(m, out) {
    return m.j.mouth ? out.setFromMatrixPosition(m.j.mouth.matrixWorld) : null;
  }
  function clawOf(m, i, out) {
    return m.j.arms && m.j.arms[i] && m.j.arms[i].claw ? out.setFromMatrixPosition(m.j.arms[i].claw.matrixWorld) : null;
  }

  // ---- the swarm: two instanced meshes, body and wings -----------------------
  // A bat-winged lamprey, 2.5 m tip to tip. `aLit` says how much of the glow a
  // vertex carries: the mouth most, the veins of the wing some, the rest none.
  function lit(g, v, hex) {
    const n = g.attributes.position.count;
    const a = new Float32Array(n).fill(v), c = new Float32Array(n * 3);
    const col = new THREE.Color(hex);
    for (let i = 0; i < n; i++) col.toArray(c, i * 3);
    g.setAttribute('aLit', new THREE.BufferAttribute(a, 1));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  }
  function litMaterial(o) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: glowCol, ...o });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aLit;\nvarying float vLit;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLit;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vLit;');
    };
    mat.customProgramCacheKey = () => 'monster-lit';
    return mat;
  }
  function swarmMeshes(count) {
    const sr = mulberry32(0x5a4d);
    const bparts = [];
    // the body: a tube, open at the front
    bparts.push(lit(tube([[0, 0.02, -0.55], [0, 0.03, -0.2], [0, 0, 0.25], [0, -0.02, 0.56]], [0.05, 0.19, 0.21, 0.2], { seg: 10, rad: 8, open: true }), 0.03, skin.hide));
    // a round mouth ringed with teeth and lit from inside
    bparts.push(lit(at(prep(new THREE.ConeGeometry(0.19, 0.4, 8, 1, true)), 0, -0.02, 0.37, -Math.PI / 2), 1.6, 0x0a0a0a));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      bparts.push(lit(fang(c * 0.19, -0.02 + sn * 0.19, 0.55, -c * 0.5, -sn * 0.5, 0.8, 0.09 + sr() * 0.08, 0.03), 0.1, skin.bone));
    }
    for (const s of [-1, 1]) {
      // two hooked legs
      bparts.push(lit(tube([[s * 0.1, -0.12, -0.05], [s * 0.16, -0.36, 0.05], [s * 0.14, -0.46, 0.22], [s * 0.1, -0.4, 0.32]], [0.045, 0.035, 0.025, 0.004], { seg: 8, rad: 5 }), 0.03, skin.bone));
    }
    // a barbed tail
    bparts.push(lit(tube([[0, 0.02, -0.5], [0, 0.06, -0.85], [0, 0.02, -1.2]], [0.05, 0.03, 0.006], { seg: 8, rad: 5 }), 0.03, skin.hide));
    for (let k = 0; k < 3; k++) bparts.push(lit(fang(0, 0.04, -0.85 - k * 0.11, (k % 2 ? 1 : -1) * 0.8, 0.3, 0.6, 0.1, 0.016), 0.2, skin.bone));
    const body = mergeGeometries(bparts, false);
    for (const g of bparts) g.dispose();

    // wings: torn membrane on finger bones, in a shallow V; flipping scale.y flaps them
    const up = (x) => Math.abs(x) * 0.336;
    const wparts = [];
    const mem = [];
    const F = [[1.25, 0.34], [1.16, -0.12], [0.82, -0.52], [0.36, -0.62]];
    for (const s of [-1, 1]) {
      const S = [s * 0.08, 0.02, 0.12];
      for (let i = 0; i < F.length; i++) {
        const tip = [s * F[i][0], up(F[i][0]), F[i][1]];
        const mid = [s * F[i][0] * 0.5, up(F[i][0] * 0.5) + 0.03, F[i][1] * 0.5 + 0.08];
        wparts.push(lit(tube([S, mid, tip], [0.022, 0.016, 0.005], { seg: 6, rad: 4 }), 1.0, skin.bone));
        if (i === F.length - 1) continue;
        // the membrane between two fingers: a ragged trailing edge, pulled in and notched
        const nx = F[i + 1][0], nz = F[i + 1][1];
        let prev = tip;
        for (let k = 1; k <= 3; k++) {
          const u = k / 3, pull = k < 3 ? 0.22 + sr() * 0.22 : 0;
          const ex = (F[i][0] + (nx - F[i][0]) * u) * (1 - pull), ez = (F[i][1] + (nz - F[i][1]) * u) * (1 - pull) + pull * 0.12;
          const e = [s * ex, up(ex), ez];
          if (s > 0) mem.push(...S, ...prev, ...e); else mem.push(...S, ...e, ...prev);
          prev = e;
        }
      }
      // from the last finger back to the body
      const last = [s * F[3][0], up(F[3][0]), F[3][1]], root = [s * 0.06, 0.02, -0.4];
      if (s > 0) mem.push(...S, ...last, ...root); else mem.push(...S, ...root, ...last);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(mem, 3));
    mg.computeVertexNormals();
    wparts.push(lit(mg, 0.04, skin.plate));
    const wing = mergeGeometries(wparts, false);
    for (const g of wparts) g.dispose();

    const bodyMat = litMaterial({ roughness: 0.5, emissiveIntensity: 2.6 });
    const wingMat = litMaterial({ roughness: 0.6, side: THREE.DoubleSide, emissiveIntensity: 1.5 });
    const bodies = new THREE.InstancedMesh(body, bodyMat, count);
    const wings = new THREE.InstancedMesh(wing, wingMat, count);
    for (const im of [bodies, wings]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
    }
    return {
      bodies, wings,
      dispose() {
        body.dispose();
        wing.dispose();
        bodyMat.dispose();
        wingMat.dispose();
        bodies.dispose();
        wings.dispose();
      },
    };
  }

  function dispose() {
    for (const g of geos) g.dispose();
    for (const k in M) M[k].dispose();
  }

  return { make, pose, free, mouthOf, clawOf, swarmMeshes, dispose, glowColor: glowCol };
}
