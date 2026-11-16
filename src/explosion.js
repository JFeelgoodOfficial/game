// A ship dying in space (src/fleets.js): flash, two shock rings, a ball of
// fire and a burst of embers. The Sky City dragon's explosion
// (world/skydragon.js) with the dragon taken out, pooled so that nothing is
// built when one goes off.
//
// Each explosion is a scene-level group registered with the floating origin,
// so a rebase in the three seconds it lasts does not throw it across the sky.

import * as THREE from 'three';
import { addShiftable } from './origin.js';

const LIFE = 3.2;
const EMBERS = 220;

export function createExplosions(scene, count = 6) {
  const pool = [];
  for (let i = 0; i < count; i++) {
    const group = new THREE.Group();
    group.visible = false;
    const add = (geo, color) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      group.add(m);
      return m;
    };
    const flash = add(new THREE.SphereGeometry(1, 16, 10), 0xffffff);
    const fire = add(new THREE.IcosahedronGeometry(1, 1), 0xffa040);
    const ringA = add(new THREE.RingGeometry(0.92, 1, 64), 0xfff0c0);
    const ringB = add(new THREE.RingGeometry(0.9, 1, 64), 0xff8a50);
    ringB.rotation.x = Math.PI / 2.6;
    const pos = new Float32Array(EMBERS * 3);
    const vel = new Float32Array(EMBERS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const embers = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffc070, size: 3, sizeAttenuation: false, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    embers.frustumCulled = false;
    group.add(embers);
    scene.add(group);
    addShiftable(group);
    pool.push({ group, flash, fire, ringA, ringB, embers, pos, vel, t: -1, scale: 1 });
  }
  let seed = 1;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  return {
    // `at`: world position (a Vector3 in the scene's frame). `scale`: the
    // radius of the thing that blew up.
    fire(at, scale) {
      let e = pool.find((x) => x.t < 0);
      if (!e) e = pool.reduce((a, b) => (a.t > b.t ? a : b)); // reuse the oldest
      e.t = 0;
      e.scale = scale;
      e.group.position.copy(at);
      e.group.visible = true;
      for (let i = 0; i < EMBERS; i++) {
        const z = rnd() * 2 - 1, th = rnd() * 6.2832, k = Math.sqrt(1 - z * z);
        const sp = scale * (0.4 + 1.6 * rnd());
        e.vel.set([k * Math.cos(th) * sp, k * Math.sin(th) * sp, z * sp], i * 3);
        e.pos.set([0, 0, 0], i * 3);
      }
    },
    update(dt, camera) {
      for (const e of pool) {
        if (e.t < 0) continue;
        e.t += dt;
        const k = e.t / LIFE;
        if (k >= 1) {
          e.t = -1;
          e.group.visible = false;
          continue;
        }
        const s = e.scale;
        e.flash.scale.setScalar(s * (0.6 + 5 * k));
        e.flash.material.opacity = Math.max(1 - k * 5, 0);
        e.fire.scale.setScalar(s * (0.3 + 1.6 * Math.sqrt(k)));
        e.fire.material.opacity = Math.max(1 - k * 1.6, 0) * 0.9;
        e.fire.rotation.y = e.t * 0.7;
        e.ringA.scale.setScalar(s * (0.5 + 7 * k));
        e.ringA.material.opacity = Math.max(1 - k * 1.3, 0) * 0.8;
        e.ringA.lookAt(camera.position);
        e.ringB.scale.setScalar(s * (0.4 + 5 * k));
        e.ringB.material.opacity = Math.max(1 - k * 1.5, 0) * 0.6;
        for (let i = 0; i < EMBERS * 3; i++) e.pos[i] += e.vel[i] * dt * (1 - k * 0.6);
        e.embers.geometry.attributes.position.needsUpdate = true;
        e.embers.material.opacity = 1 - k;
      }
    },
    active: () => pool.filter((e) => e.t >= 0).length,
  };
}
