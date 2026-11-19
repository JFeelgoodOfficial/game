// A crowd of one people, where a world's people are not human.
//
// world/people.js draws the humans of Terra and Wyattmattoe. A town or a mall
// whose people carry a signature (world/species.js) is drawn from here
// instead, behind the same surface, so the code that walks the citizens about
// (world/citizens.js, world/wavemallprime.js) does not change:
//
//   createSpeciesCrowd({ count, seed, species, maxRigs, place(i), build?(i) })
//     -> { group, update(t, dt, playerLocal), setPersonPose(i, x, y, z, yaw,
//          speed01, t), setTalking(i, on), startFade(s), faded, rigCount,
//          rigOf(i), dispose }
//
// Each person is one body for good: the figure (world/aliens.js buildRig) is
// built from that person's own seed the first time they come near, and kept.
// Up to `maxRigs` of the nearest stand as figures; the rest are capsules in
// their own skin colour and at their own height, one InstancedMesh.
// `build(i)` may return a figure of its own for a person (a governor: one of
// world/captainDress.js); it is then posed by `pose(rig, dt, t, talking)` if
// it carries one.
//
// The frame loop allocates nothing; a figure is built once, on first approach.

import * as THREE from 'three';
import { buildRig, poseRig } from './aliens.js';
import { measureRig, standRig } from './rigGround.js';
import { liveSignature } from './signatures.js';
import { SPECIES } from './species.js';

const PROMOTE = 38, DEMOTE = 44;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _a = new THREE.Color(), _b = new THREE.Color();

export function createSpeciesCrowd(opts) {
  const { count, species } = opts;
  const sp = SPECIES[species];
  const seed = (opts.seed ?? 1) >>> 0;
  const maxRigs = Math.min(opts.maxRigs ?? 8, count);
  const group = new THREE.Group();
  group.name = `people:${species}`;

  // --- everyone, as numbers ---
  const people = [];
  const rnd = mulberry32(seed ^ 0x5bd1e995);
  const span = (v) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * rnd() : v);
  for (let i = 0; i < count; i++) {
    const at = opts.place ? opts.place(i) : null;
    people.push({
      seed: (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0,
      x: at?.pos.x ?? 0, y: at?.pos.y ?? 0, z: at?.pos.z ?? 0, yaw: 0, speed: 0, t: rnd() * 10,
      talking: false, rig: null, shown: false, d2: Infinity,
      tall: span(sp.height), tone: rnd(),
    });
  }

  // --- the far ones ---
  const capGeo = new THREE.CapsuleGeometry(0.24, 1.3, 3, 8);
  const capMat = new THREE.MeshStandardMaterial({ roughness: sp.skinRoughness, metalness: 0.05, transparent: false });
  const caps = new THREE.InstancedMesh(capGeo, capMat, Math.max(count, 1));
  caps.frustumCulled = false;
  _b.set(sp.skin[1]);
  for (let i = 0; i < count; i++) caps.setColorAt(i, _a.set(sp.skin[0]).lerp(_b, people[i].tone));
  if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
  group.add(caps);

  let shown = 0, fade = -1, fadeLen = 1, faded = false;
  const fadeMats = [];

  function rigFor(i) {
    const p = people[i];
    if (p.rig) return p.rig;
    const own = opts.build ? opts.build(i) : null;
    const rig = own || measureRig(buildRig(p.seed, species, { species }));
    p.rig = rig;
    rig.group.visible = false;
    group.add(rig.group);
    return rig;
  }

  function setPersonPose(i, x, y, z, yaw, speed01 = 0, t = 0) {
    const p = people[i];
    if (!p) return;
    p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.speed = speed01;
    void t;
  }
  function setTalking(i, on) {
    if (people[i]) people[i].talking = !!on;
  }

  function update(t, dt, player) {
    // who is near: the nearest `maxRigs` inside PROMOTE stand as figures
    for (let i = 0; i < count; i++) {
      const p = people[i];
      const dx = p.x - player.x, dy = p.y - player.y, dz = p.z - player.z;
      p.d2 = dx * dx + dy * dy + dz * dz;
    }
    for (let i = 0; i < count; i++) {
      const p = people[i];
      if (p.shown && p.d2 > DEMOTE * DEMOTE && !p.talking) {
        p.shown = false;
        p.rig.group.visible = false;
        shown--;
      }
    }
    for (let i = 0; i < count && shown < maxRigs; i++) {
      const p = people[i];
      if (!p.shown && p.d2 < PROMOTE * PROMOTE && !faded) {
        rigFor(i).group.visible = true;
        p.shown = true;
        shown++;
      }
    }

    for (let i = 0; i < count; i++) {
      const p = people[i];
      if (p.shown) {
        const rig = p.rig;
        p.t += dt;
        const walking = p.speed > 0.02;
        rig.group.position.set(p.x, p.y, p.z);
        rig.group.rotation.y = p.yaw;
        poseRig(rig, dt, p.t, p.talking ? 'talk' : walking ? 'walk' : 'idle', p.speed);
        standRig(rig, p.y);
        if (rig.pose) rig.pose(rig, dt, p.t, p.talking);
        else liveSignature(rig, dt, p.t, p.talking);
        _m.makeScale(0, 0, 0);
      } else if (faded) {
        _m.makeScale(0, 0, 0);
      } else {
        const k = p.tall / 1.78;
        _p.set(p.x, p.y + 0.89 * k, p.z);
        _q.setFromAxisAngle(_up, p.yaw);
        _s.set(k, k, k);
        _m.compose(_p, _q, _s);
      }
      caps.setMatrixAt(i, _m);
    }
    caps.instanceMatrix.needsUpdate = true;

    if (fade >= 0 && !faded) {
      fade += dt;
      const o = Math.max(0, 1 - fade / fadeLen);
      for (let i = 0; i < fadeMats.length; i++) fadeMats[i].opacity = o;
      if (o <= 0) {
        faded = true;
        for (let i = 0; i < count; i++) {
          const p = people[i];
          if (p.shown) { p.shown = false; p.rig.group.visible = false; }
        }
        shown = 0;
      }
    }
  }

  // the same vanishing world/people.js crowds can do (allocates once, at the start)
  function startFade(seconds = 2) {
    if (fade >= 0) return;
    fade = 0;
    fadeLen = Math.max(seconds, 0.01);
    fadeMats.length = 0;
    capMat.transparent = true;
    fadeMats.push(capMat);
    for (const p of people) {
      if (!p.rig) continue;
      const ms = Array.isArray(p.rig.body.material) ? p.rig.body.material : [p.rig.body.material];
      for (const m of ms) { m.transparent = true; fadeMats.push(m); }
    }
  }

  function dispose() {
    for (const p of people) {
      if (!p.rig) continue;
      p.rig.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        if (o.skeleton) o.skeleton.dispose();
      });
    }
    capGeo.dispose();
    capMat.dispose();
    caps.dispose();
    group.clear();
  }

  return {
    group, update, setPersonPose, setTalking, startFade, dispose,
    rigOf: (i) => people[i]?.rig ?? null,
    get faded() { return faded; },
    get rigCount() { return shown; },
  };
}
