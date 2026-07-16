// Cockpit camera (GDD 3.4, 4.3). The camera chases the ship's orientation
// with a slerp lag — the gap between input and response is where "heavy"
// comes from — and offsets slightly against proper acceleration so burns
// are felt. Cockpit geometry arrives in Phase 2; the camera IS the cockpit
// for now.
//
// The lag lives in _lagQuat, not in camera.quaternion directly, so extra
// view rotations (the hold-V glance at the overhead window) compose on top
// of the lag without corrupting it.

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

const _lagQuat = new THREE.Quaternion();
const _lookQ = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const _driftTarget = new THREE.Vector3();
const _drift = new THREE.Vector3();
const _back = new THREE.Vector3();

// Boost pulls the camera back and widens the FOV, so you sink into the seat
// and see more of the cockpit as the ship surges forward. Smoothed so it
// eases in and out rather than snapping.
let boostBlend = 0;
// Glance up at the overhead window (hold V), eased so the head turns
// rather than snaps.
let lookBlend = 0;

export function updateCamera(ship) {
  const boosting = input.boost && (input.forward || input.reverse);
  const target = input.warp || boosting ? 1 : 0;
  boostBlend += (target - boostBlend) * 0.06;

  // warp gets a bigger FOV kick than boost — the speed rush
  const fovKick = input.warp ? C.WARP_FOV : C.BOOST_FOV;
  camera.fov = C.FOV + boostBlend * fovKick;
  camera.updateProjectionMatrix();

  // Rotation lag: slerp toward the ship, never snap.
  _lagQuat.slerp(ship.quaternion, C.CAMERA_LAG);

  // Overhead glance: pitch the head up on top of the lagged ship view.
  // Suppressed at warp — the star streaks are the forward show.
  const lookTarget = input.lookUp && !input.warp ? 1 : 0;
  lookBlend += (lookTarget - lookBlend) * C.LOOK_UP_EASE;
  _lookQ.setFromAxisAngle(X_AXIS, C.LOOK_UP_ANGLE * lookBlend);
  camera.quaternion.copy(_lagQuat).multiply(_lookQ);

  // Positional drift under acceleration, smoothed with the same lag factor.
  _driftTarget.copy(ship.properAccel).multiplyScalar(-C.CAMERA_DRIFT);
  const m = _driftTarget.length();
  if (m > MAX_DRIFT) _driftTarget.multiplyScalar(MAX_DRIFT / m);
  _drift.lerp(_driftTarget, C.CAMERA_LAG);

  // Pull back along the ship's local +z (behind the pilot) on boost.
  _back.set(0, 0, 1).applyQuaternion(ship.quaternion).multiplyScalar(boostBlend * C.BOOST_PULLBACK);

  camera.position.copy(ship.position).add(_drift).add(_back);
}

// Hard-set the camera to the ship's pose (resets/respawns), so the lag
// doesn't slerp in from wherever the camera last was.
export function snapCamera(ship) {
  _lagQuat.copy(ship.quaternion);
  lookBlend = 0;
  camera.position.copy(ship.position);
  camera.quaternion.copy(ship.quaternion);
}

export function resizeCamera() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
