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
// a radius reads as a planet you skim rather than fly through. Drag alone,
// no outward push: an earlier version added a buoyant cushion, but a spring
// with too little damping trampolines — the ship bounced off an invisible
// wall, exactly the failure GDD 3.2 warns about. Pure drag can't bounce.
//
// The air begins at ATMOS_TOP above the surface and thickens toward the
// floor at MIN_ALTITUDE:
//   - light drag bleeds speed (the air gets thick),
//   - the inward (descending) component is removed, fully by the floor, so
//     the ship settles smoothly and can't push lower — but climbing is never
//     impeded (only inward motion is touched), so thrust always frees you.
// Never a collision, never a hard stop (GDD 5.1, 8). Mutates velocity in place.
export function applyAltitudeFloor(pos, vel) {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b.radius) continue;
    _up.subVectors(pos, b.position);
    const altitude = _up.length() - b.radius;
    if (altitude >= C.ATMOS_TOP) continue;
    _up.normalize(); // radial "up", surface → ship
    // t: 0 at the top of the atmosphere, ramping to 1 at the floor and below.
    const t = Math.min(
      Math.max((C.ATMOS_TOP - altitude) / (C.ATMOS_TOP - C.MIN_ALTITUDE), 0),
      1
    );
    const k = Math.pow(t, C.FLOOR_DRAG_POWER);
    vel.multiplyScalar(1 - C.FLOOR_DRAG_MAX * k);
    const vRadial = vel.dot(_up);
    if (vRadial < 0) vel.addScaledVector(_up, -vRadial * k);
  }
}
