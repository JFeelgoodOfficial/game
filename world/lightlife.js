// The City of Light, lived in (world/lightcity.js; GDD 5.7.3-5.7.4).
//
// Two things, both always there, whatever the story has reached:
//
//   people   the three ships' companies about their day on the walks: Rustia's
//            miners, Saturnia's cantors and Wavemall Prime's floor staff
//            (world/species.js), crossing the bridges between the balcony,
//            the terrace, the gallery and the Pavilion, stopping, talking.
//            Three crowds from world/speciesCrowd.js: the nearest few of each
//            people stand as jointed figures, the rest as capsules.
//   traffic  their craft in the air round the platforms: Rustian ore haulers,
//            Saturnian skiffs under their rings, Wavemall shuttles in pink and
//            cyan. Each sort is two instanced meshes (body, lights) on closed
//            lanes that keep clear of every floor, the suite's tower and the
//            towers' own circle. A million years on, a third of them still fly.
//
// The districts and their people are world/lightdistricts.js and
// world/lightepilogue.js. Nothing in the frame loop allocates.

import * as THREE from 'three';
import { Q } from '../src/quality.js';
import { tint, box, mergedMesh } from './capital.js';
import { createSpeciesCrowd } from './speciesCrowd.js';

const PEOPLE = { low: 18, medium: 39, high: 54, ultra: 72 };
const FIGURES = { low: 0, medium: 5, high: 7, ultra: 9 }; // jointed figures per people
const CRAFT = { low: 18, medium: 36, high: 54, ultra: 72 };
const KINDS = ['rustia', 'saturnia', 'wavemall'];

// the walks, in the city's frame (world/lightcity.js, world/lightpavilion.js)
const AREAS = {
  balcony: { x: 0, z: -7, r0: 0, r1: 7 },
  terrace: { x: 0, z: -77, r0: 4.5, r1: 17 },
  gallery: { x: -112, z: -77, r0: 0, r1: 12 },
  pavilion: { x: 92, z: -77, r0: 7, r1: 23.5 },
};
// the bridges between them: the line down the middle, from the first area's end to the second's
const LINKS = [
  { a: 'balcony', b: 'terrace', pts: [[0, -15], [0, -21], [0, -58], [0, -61]] },
  { a: 'terrace', b: 'gallery', pts: [[-15, -77], [-20, -77], [-96, -77], [-100, -77]] },
  { a: 'terrace', b: 'pavilion', pts: [[15, -77], [20, -77], [62, -77], [68, -77]] },
];
// where the air is not free: the suite's tower, and the circle the city's towers stand outside
const TOWER = { x: 176, z: -176, r: 34 };
const CLEAR = { x: 0, z: -40, r: 222 };

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296);
}

// --- the craft, nose to +z, feet at the origin ---
function craftGeometry(kind) {
  const body = [], lights = [];
  if (kind === 'rustia') {
    // an ore hauler: a slab of a hull, a cab, an open bin of ore, four pods
    body.push(tint(box(3.2, 1.8, 7.6, 0, 0, 0), 0x8a3f20));
    body.push(tint(box(2.6, 1.1, 2.0, 0, 1.3, 2.4), 0x2a2420));
    body.push(tint(box(3.0, 0.9, 3.8, 0, 1.25, -1.6), 0x3a3634));
    for (let i = 0; i < 6; i++) body.push(tint(new THREE.IcosahedronGeometry(0.55, 0).translate(-0.9 + (i % 3) * 0.9, 1.75, -2.6 + Math.floor(i / 3) * 1.8), 0x6a3a22));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      body.push(tint(new THREE.CylinderGeometry(0.5, 0.6, 2.2, 10).rotateX(Math.PI / 2).translate(sx * 2.1, -0.4, sz * 2.6), 0x23201f));
      lights.push(tint(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 10).rotateX(Math.PI / 2).translate(sx * 2.1, -0.4, sz * 2.6 - 1.12), 0xff8a3a, 2.2));
    }
    lights.push(tint(box(2.3, 0.35, 0.05, 0, 1.35, 3.42), 0xffb070, 1.8));
    lights.push(tint(box(0.2, 0.2, 0.05, -1.5, 0.5, 3.82), 0xfff2d8, 2));
    lights.push(tint(box(0.2, 0.2, 0.05, 1.5, 0.5, 3.82), 0xfff2d8, 2));
  } else if (kind === 'saturnia') {
    // a skiff: a long pale hull under a tilted ring, like the people who fly it
    body.push(tint(new THREE.CylinderGeometry(0.28, 0.75, 6.4, 14).rotateX(Math.PI / 2).translate(0, 0, 0.4), 0xf1ecdf));
    body.push(tint(new THREE.SphereGeometry(0.75, 14, 10).scale(1, 1, 1.4).translate(0, 0, -2.8), 0xf1ecdf));
    body.push(tint(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1.8).translate(0, 0.45, -0.6), 0x2f4f86));
    body.push(tint(new THREE.TorusGeometry(1.9, 0.12, 6, 36).rotateX(Math.PI / 2 - 0.28).translate(0, 0.2, -0.4), 0xc9a455));
    for (const sx of [-1, 1]) body.push(tint(box(1.6, 0.06, 0.9, sx * 0.9, -0.1, -2.9, sx * 0.2), 0xc9a455));
    lights.push(tint(new THREE.TorusGeometry(1.9, 0.05, 4, 36).rotateX(Math.PI / 2 - 0.28).translate(0, 0.32, -0.4), 0xffd98a, 1.8));
    lights.push(tint(new THREE.SphereGeometry(0.32, 10, 8).translate(0, 0, -3.85), 0xa9d8ff, 2.2));
  } else {
    // a shuttle: a rounded bus of a thing, windows all down it, lit stripes
    body.push(tint(new THREE.CapsuleGeometry(1.25, 4.6, 6, 14).rotateX(Math.PI / 2), 0xf6f2f8));
    body.push(tint(box(2.56, 0.7, 4.4, 0, 0.35, 0), 0x1a1622));
    body.push(tint(box(3.6, 0.12, 1.3, 0, -0.5, -1.6), 0x1a1622));
    lights.push(tint(box(2.62, 0.08, 4.8, 0, -0.18, 0), 0xff5fa8, 1.9));
    lights.push(tint(box(2.62, 0.06, 4.0, 0, 0.82, 0), 0x82f7ff, 1.9));
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) lights.push(tint(box(0.04, 0.4, 0.5, sx * 1.29, 0.35, -1.75 + i * 0.7), 0xfff2d8, 1.1));
    lights.push(tint(box(1.4, 0.25, 0.05, 0, 0.1, 3.55), 0xffffff, 2.2));
    lights.push(tint(box(1.6, 0.2, 0.05, 0, 0.1, -3.55), 0xff5fa8, 2.2));
  }
  const flat = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));
  return { body: flat(body), lights: flat(lights) };
}

// k: { group, colliders }
export function createLightLife(k) {
  const root = new THREE.Group();
  k.group.add(root);
  const r = rng(0x11fe);
  const tier = Q.tier in PEOPLE ? Q.tier : 'medium';

  // ===================== people =====================
  const names = Object.keys(AREAS);
  const inArea = (name, o) => {
    const a = AREAS[name], ang = r() * Math.PI * 2, rad = Math.sqrt(a.r0 * a.r0 + r() * (a.r1 * a.r1 - a.r0 * a.r0));
    o.x = a.x + Math.cos(ang) * rad;
    o.z = a.z + Math.sin(ang) * rad;
    return o;
  };
  const total = PEOPLE[tier];
  const per = Math.ceil(total / 3);
  const people = [];
  const crowds = KINDS.map((species, si) => {
    const crowd = createSpeciesCrowd({ count: per, seed: 0x3c1 + si * 0x9e37, species, maxRigs: FIGURES[tier] });
    root.add(crowd.group);
    return crowd;
  });
  for (let i = 0; i < per * 3; i++) {
    const si = i % 3, ci = Math.floor(i / 3);
    // the first ones start on the busiest walks
    const area = names[i % 7 < 3 ? 1 : i % 7 < 5 ? 3 : i % 7 === 5 ? 0 : 2];
    const p = { crowd: crowds[si], ci, area, x: 0, z: 0, yaw: r() * 6.28, route: [], wait: r() * 3, speed: 2.3 + r() * 1.5, talk: false, stays: r() < 0.18, moving: 0 };
    inArea(area, p);
    people.push(p);
  }
  const _o = { x: 0, z: 0 };
  // the next thing a person does: somewhere else in the same place, or over a bridge to the next
  function plan(p) {
    const out = LINKS.filter((l) => l.a === p.area || l.b === p.area);
    if (!p.stays && r() < 0.42 && out.length) {
      const l = out[Math.floor(r() * out.length)];
      const fwd = l.a === p.area;
      const pts = fwd ? l.pts : [...l.pts].reverse();
      // keep to the right of the middle, the way the walk goes
      const [x0, z0] = pts[0], [x1, z1] = pts[pts.length - 1];
      const len = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      const lane = 0.9 + r() * 0.9;
      p.route.length = 0;
      for (const [x, z] of pts) p.route.push({ x: x - nx * lane, z: z - nz * lane });
      p.area = fwd ? l.b : l.a;
      const end = inArea(p.area, { x: 0, z: 0 });
      p.route.push(end);
    } else {
      p.route.length = 0;
      p.route.push(inArea(p.area, { x: 0, z: 0 }));
    }
  }
  const nearColliders = []; // refreshed now and then: those near any walk
  let colAt = 0;
  function refreshColliders() {
    nearColliders.length = 0;
    for (const c of k.colliders) {
      if (!Number.isFinite(c.x) || Math.abs(c.x) > 1e5) continue;
      if (c.r > 6) continue; // (a district's floor-sized solid is not anything a walker meets here)
      for (const n of names) {
        const a = AREAS[n];
        if (Math.hypot(c.x - a.x, c.z - a.z) < a.r1 + c.r + 2) {
          nearColliders.push(c);
          break;
        }
      }
    }
  }

  // ===================== traffic =====================
  const lanes = [];
  for (let tries = 0; lanes.length < 14 && tries < 400; tries++) {
    const upper = lanes.length % 3 !== 2;
    const lane = {
      cx: -40 + r() * 150, cz: -190 + r() * 200,
      a: 45 + r() * 150, b: 35 + r() * 120, rot: r() * Math.PI,
      y: upper ? 40 + r() * 85 : -108 + r() * 55, amp: 2 + r() * 7, freq: 1 + Math.floor(r() * 3), ph: r() * 6.28,
    };
    let ok = true;
    for (let i = 0; i < 48 && ok; i++) {
      const p = lanePoint(lane, (i / 48) * Math.PI * 2, _v);
      if (Math.hypot(p.x - TOWER.x, p.z - TOWER.z) < TOWER.r) ok = false;
      else if (Math.hypot(p.x - CLEAR.x, p.z - CLEAR.z) > CLEAR.r) ok = false;
      else if (p.x < -138) ok = false; // (the hangar's yard)
      else if (upper ? p.y < 36 : p.y > -46) ok = false;
    }
    if (ok) lanes.push(lane);
  }
  if (!lanes.length) lanes.push({ cx: 30, cz: -80, a: 90, b: 70, rot: 0, y: 60, amp: 3, freq: 1, ph: 0 });
  const nCraft = CRAFT[tier];
  const kinds = KINDS.map((kind) => {
    const g = craftGeometry(kind);
    const n = Math.ceil(nCraft / 3);
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1c1a17 });
    const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    const bodyGeo = mergedMesh(g.body, bodyMat).geometry, lightGeo = mergedMesh(g.lights, lightMat).geometry;
    const body = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
    const lights = new THREE.InstancedMesh(lightGeo, lightMat, n);
    for (const m of [body, lights]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(m);
    }
    return { kind, body, lights, n };
  });
  const craft = [];
  kinds.forEach((kd, ki) => {
    for (let i = 0; i < kd.n; i++) {
      const lane = lanes[(i * 3 + ki) % lanes.length];
      // haulers lumber, skiffs glide, shuttles hurry
      const v = (ki === 0 ? 22 : ki === 1 ? 34 : 42) * (0.8 + r() * 0.4);
      craft.push({ kd, i, lane, th: r() * Math.PI * 2, dir: (i + ki) % 2 ? 1 : -1, v, dy: (r() - 0.5) * 6, side: (r() - 0.5) * 8 });
    }
  });

  const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _f = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
  const _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _zero = new THREE.Vector3(0, 0, 0);
  const _pl = { x: 0, y: 0, z: 0 };

  return {
    group: root,
    tick(dt, t, walker, era) {
      dt = Math.min(dt, 0.1);
      // --- people ---
      colAt -= dt;
      if (colAt <= 0) {
        colAt = 2;
        refreshColliders();
      }
      for (const p of people) {
        let speed01 = 0;
        if (p.wait > 0) {
          p.wait -= dt;
          if (p.wait <= 0 && p.talk) {
            p.talk = false;
            p.crowd.setTalking(p.ci, false);
          }
        } else {
          if (!p.route.length) plan(p);
          const tgt = p.route[0];
          const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
          if (tgt !== p.for) {
            p.for = tgt;
            p.budget = d / p.speed + 3; // (a place inside a bench is never reached: give it up)
          }
          p.budget -= dt;
          if (d < 0.5 || p.budget < 0) {
            p.route.shift();
            if (!p.route.length) {
              // arrived: a look round, or (for some) a long stand and a talk
              p.wait = p.stays ? 6 + r() * 14 : 0.4 + r() * 3.5;
              if (p.stays && r() < 0.6) {
                p.talk = true;
                p.crowd.setTalking(p.ci, true);
              }
            }
          } else {
            const step = Math.min(d, p.speed * dt);
            p.x += (dx / d) * step;
            p.z += (dz / d) * step;
            let dyaw = Math.atan2(dx, dz) - p.yaw;
            while (dyaw > Math.PI) dyaw -= Math.PI * 2;
            while (dyaw < -Math.PI) dyaw += Math.PI * 2;
            p.yaw += dyaw * Math.min(1, dt * 7);
            speed01 = 0.6;
          }
        }
        // round anything solid, and round the pilot
        for (const c of nearColliders) {
          const ex = p.x - c.x, ez = p.z - c.z, rr = c.r + 0.35;
          const e2 = ex * ex + ez * ez;
          if (e2 < rr * rr && e2 > 1e-6) {
            const e = Math.sqrt(e2);
            p.x = c.x + (ex / e) * rr;
            p.z = c.z + (ez / e) * rr;
          }
        }
        if (walker && walker.y < 4) {
          const ex = p.x - walker.x, ez = p.z - walker.z, e = Math.hypot(ex, ez);
          if (e < 0.9 && e > 1e-4) {
            p.x = walker.x + (ex / e) * 0.9;
            p.z = walker.z + (ez / e) * 0.9;
          }
        }
        p.moving = speed01;
        p.crowd.setPersonPose(p.ci, p.x, 0, p.z, p.yaw, speed01, t);
      }
      if (walker) {
        _pl.x = walker.x;
        _pl.y = walker.y;
        _pl.z = walker.z;
      } else _pl.x = _pl.y = _pl.z = 1e5;
      for (const c of crowds) c.update(t, dt, _pl);

      // --- traffic ---
      for (const c of craft) {
        const ln = c.lane;
        const rad = (ln.a + ln.b) / 2;
        c.th += ((c.v * dt) / rad) * c.dir;
        lanePoint(ln, c.th, _p);
        lanePoint(ln, c.th + 0.02 * c.dir, _p2);
        _f.subVectors(_p2, _p).normalize();
        _x.crossVectors(_up, _f).normalize();
        // (each keeps to its own line inside the lane)
        _p.addScaledVector(_x, c.side);
        _p.y += c.dy;
        _y.crossVectors(_f, _x);
        // leaning into the turn: the top toward the middle of the loop (a
        // positive turn about the nose tips the top toward -x)
        const inward = (ln.cx - _p.x) * _x.x + (ln.cz - _p.z) * _x.z;
        const bank = Math.min(0.45, (c.v * c.v) / (rad * 55)) * (inward > 0 ? -1 : 1);
        _m.makeBasis(_x, _y, _f);
        _q.setFromRotationMatrix(_m);
        _m.makeRotationAxis(_f, bank);
        _q.premultiply(_q2.setFromRotationMatrix(_m));
        const hide = era && c.i % 3 !== 0; // a million years on, a third still fly
        _m.compose(_p, _q, hide ? _zero : _s);
        c.kd.body.setMatrixAt(c.i, _m);
        c.kd.lights.setMatrixAt(c.i, _m);
      }
      for (const kd of kinds) {
        kd.body.instanceMatrix.needsUpdate = true;
        kd.lights.instanceMatrix.needsUpdate = true;
      }
    },
    state: () => ({
      people: people.length,
      figures: crowds.reduce((n, c) => n + c.rigCount, 0),
      walking: people.filter((p) => p.moving > 0).length,
      at: people.slice(0, 6).map((p) => [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10, p.area]),
      lanes: lanes.length,
      craft: craft.length,
      craftAt: craft.slice(0, 3).map((c) => lanePoint(c.lane, c.th, new THREE.Vector3()).toArray().map(Math.round)),
    }),
  };
}

const _v = new THREE.Vector3();
const _q2 = new THREE.Quaternion();
// a point on a lane at angle th
function lanePoint(l, th, out) {
  const lx = Math.cos(th) * l.a, lz = Math.sin(th) * l.b;
  const c = Math.cos(l.rot), s = Math.sin(l.rot);
  return out.set(l.cx + lx * c - lz * s, l.y + l.amp * Math.sin(th * l.freq + l.ph), l.cz + lx * s + lz * c);
}
