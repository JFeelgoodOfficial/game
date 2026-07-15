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
const _up = new THREE.Vector3();

// body: { position: THREE.Vector3, mass: number, radius?: number }
// A radius opts the body into the altitude floor (see applyAltitudeFloor).
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

// Altitude floor (GDD 5.1) — a Phase 5 mechanic pulled forward so a body with
// a radius reads as a planet you skim rather than fly through. For each such
// body, once the ship descends below MIN_ALTITUDE above its surface:
//   - light isotropic drag bleeds speed (the air thickens),
//   - the inward (descending) component is removed so a fast plunge arrests
//     without ever impeding a climb back out,
//   - an outward cushion, growing toward the surface, gives a stable skim
//     altitude you can still boost away from.
// Never a collision, never a hard stop (GDD 5.1, 8). Mutates velocity in place.
export function applyAltitudeFloor(pos, vel, dt) {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b.radius) continue;
    _up.subVectors(pos, b.position);
    const altitude = _up.length() - b.radius;
    if (altitude >= C.MIN_ALTITUDE) continue;
    _up.normalize(); // radial "up", surface → ship
    // depth: 0 at the top of the band, 1 at the surface.
    const depth = Math.min(Math.max(1 - altitude / C.MIN_ALTITUDE, 0), 1);
    const k = Math.pow(depth, C.FLOOR_DRAG_POWER);
    vel.multiplyScalar(1 - C.FLOOR_DRAG_MAX * k);
    const vRadial = vel.dot(_up);
    if (vRadial < 0) vel.addScaledVector(_up, -vRadial * k);
    vel.addScaledVector(_up, C.FLOOR_PUSH * depth * dt);
  }
}
