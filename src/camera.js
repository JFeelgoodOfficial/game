// Cockpit camera (GDD 3.4, 4.3). The camera chases the ship's orientation
// with a slerp lag — the gap between input and response is where "heavy"
// comes from — and offsets slightly against proper acceleration so burns
// are felt. Cockpit geometry arrives in Phase 2; the camera IS the cockpit
// for now.

import * as THREE from 'three';
import { C } from './constants.js';

export const camera = new THREE.PerspectiveCamera(
  C.FOV,
  window.innerWidth / window.innerHeight,
  0.1,
  1e6
);

const MAX_DRIFT = 3.0; // clamp so gravity slingshots can't fling the view

const _driftTarget = new THREE.Vector3();
const _drift = new THREE.Vector3();

export function updateCamera(ship) {
  camera.fov = C.FOV;
  camera.updateProjectionMatrix();

  // Rotation lag: slerp toward the ship, never snap.
  camera.quaternion.slerp(ship.quaternion, C.CAMERA_LAG);

  // Positional drift under acceleration, smoothed with the same lag factor.
  _driftTarget.copy(ship.properAccel).multiplyScalar(-C.CAMERA_DRIFT);
  const m = _driftTarget.length();
  if (m > MAX_DRIFT) _driftTarget.multiplyScalar(MAX_DRIFT / m);
  _drift.lerp(_driftTarget, C.CAMERA_LAG);

  camera.position.copy(ship.position).add(_drift);
}

export function resizeCamera() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
