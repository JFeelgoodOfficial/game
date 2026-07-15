// Bodies register here; returns summed gravitational acceleration at a point
// (GDD 3.2): a = Σ G·m·r̂ / max(r², softening).
//
// The softening term bounds acceleration as r → 0 so a fly-through never
// produces NaN or infinite velocity. Body positions live in the same local
// frame the ship flies in — register each body's mesh with origin.js and
// share the mesh's position vector so origin rebases cover both.

import * as THREE from 'three';
import { C } from './constants.js';

const bodies = [];

const _r = new THREE.Vector3();

// body: { position: THREE.Vector3, mass: number }
export function addBody(body) {
  bodies.push(body);
  return body;
}

export function accelAt(point, out) {
  out.set(0, 0, 0);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    _r.subVectors(b.position, point);
    const r2 = Math.max(_r.lengthSq(), C.GRAVITY_SOFTENING);
    // normalize() is safe at zero length (three.js divides by length || 1)
    out.addScaledVector(_r.normalize(), (C.G * b.mass) / r2);
  }
  return out;
}
