// Floating origin (GDD 5.3). The ship stays near (0,0,0); the universe
// translates around it.
//
// Everything that holds a position in the flyable frame registers here.
// When the ship drifts past ORIGIN_SHIFT_THRESHOLD, the ship's position is
// subtracted from every registered object and the ship snaps back to the
// origin. Velocities and orientations are frame-independent and untouched.
// The camera derives its position from the ship every frame, so it needs no
// registration.

import { C } from './constants.js';

const shiftables = []; // objects with a .position THREE.Vector3

// Absolute position of the local origin, accumulated in doubles. Bookkeeping
// only — nothing in Phase 1 reads it back, but later phases (and debugging)
// need to know where in the system the ship actually is.
export const originOffset = { x: 0, y: 0, z: 0 };

export function addShiftable(obj) {
  shiftables.push(obj);
  return obj;
}

// Call once per frame after physics. Returns true if a rebase happened.
export function updateOrigin(ship) {
  const p = ship.position;
  const t = C.ORIGIN_SHIFT_THRESHOLD;
  if (p.lengthSq() < t * t) return false;
  originOffset.x += p.x;
  originOffset.y += p.y;
  originOffset.z += p.z;
  for (let i = 0; i < shiftables.length; i++) {
    shiftables[i].position.sub(p);
  }
  p.set(0, 0, 0);
  return true;
}
