// Cockpit camera (GDD 3.4, 4.3). The camera chases the ship's orientation
// with a slerp lag — the gap between input and response is where "heavy"
// comes from — and offsets slightly against proper acceleration so burns
// are felt. Cockpit geometry arrives in Phase 2; the camera IS the cockpit
// for now.

import * as THREE from 'three';
import { C } from './constants.js';
import { input } from './input.js';

export const camera = new THREE.PerspectiveCamera(
  C.FOV,
  window.innerWidth / window.innerHeight,
  0.1,
  1e6
);

const MAX_DRIFT = 3.0; // clamp so gravity slingshots can't fling the view

const _driftTarget = new THREE.Vector3();
const _drift = new THREE.Vector3();
const _back = new THREE.Vector3();

// Boost pulls the camera back and widens the FOV, so you sink into the seat
// and see more of the cockpit as the ship surges forward. Smoothed so it
// eases in and out rather than snapping.
let boostBlend = 0;

export function updateCamera(ship) {
  const boosting = input.boost && (input.forward || input.reverse);
  const target = input.warp || boosting ? 1 : 0;
  boostBlend += (target - boostBlend) * 0.06;

  // warp gets a bigger FOV kick than boost — the speed rush
  const fovKick = input.warp ? C.WARP_FOV : C.BOOST_FOV;
  camera.fov = C.FOV + boostBlend * fovKick;
  camera.updateProjectionMatrix();

  // Rotation lag: slerp toward the ship, never snap.
  camera.quaternion.slerp(ship.quaternion, C.CAMERA_LAG);

  // Positional drift under acceleration, smoothed with the same lag factor.
  _driftTarget.copy(ship.properAccel).multiplyScalar(-C.CAMERA_DRIFT);
  const m = _driftTarget.length();
  if (m > MAX_DRIFT) _driftTarget.multiplyScalar(MAX_DRIFT / m);
  _drift.lerp(_driftTarget, C.CAMERA_LAG);

  // Pull back along the ship's local +z (behind the pilot) on boost.
  _back.set(0, 0, 1).applyQuaternion(ship.quaternion).multiplyScalar(boostBlend * C.BOOST_PULLBACK);

  camera.position.copy(ship.position).add(_drift).add(_back);
}

export function resizeCamera() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
