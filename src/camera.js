// Cockpit camera (GDD 3.4, 4.3). The camera chases the ship's orientation
// with a slerp lag — the gap between input and response is where "heavy"
// comes from — and offsets slightly against proper acceleration so burns
// are felt. It also leans forward in the seat as the ship accelerates
// (dashBlend below), sinking the 3D cockpit (cockpit3d.js) out of view for
// the full-window boost/warp rush.
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
const _zoom = new THREE.Vector3();

// The camera leans forward in the seat as the ship accelerates, so the
// dashboard drops out of view and the window fills the frame. W is now the
// boost itself (there is no separate boost key), so thrusting at all gives the
// full push past the console — the intermediate "nudge, buttons still visible"
// state no longer exists. Eased so it never snaps.
let boostBlend = 0;
// Glance up at the overhead window (hold V), eased so the head turns
// rather than snaps.
let lookBlend = 0;

// The dashboard-visibility signal (was the frame image's blend): 1 at rest,
// falling to 0 as the camera pushes into the full-window view. The DOM dash
// panels (radio, capture) ride this the way they used to ride the frame fade.
export function dashBlend() {
  return 1 - boostBlend;
}

export function updateCamera(ship) {
  const full = input.warp || input.forward || input.reverse ? 1 : 0;
  boostBlend += (full - boostBlend) * 0.06;

  // warp gets a bigger FOV kick than thrust — the speed rush
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

  // Positional drift under acceleration (the burn you feel as the seat pushes
  // back), smoothed with the same lag factor. Cut the instant a burn begins —
  // otherwise the backward burn (huge at full thrust) fights the forward zoom
  // and reveals more cabin exactly when the window should fill the frame.
  const driftLean = full ? 1 : 0;
  _driftTarget.copy(ship.properAccel).multiplyScalar(-C.CAMERA_DRIFT * (1 - driftLean));
  const m = _driftTarget.length();
  if (m > MAX_DRIFT) _driftTarget.multiplyScalar(MAX_DRIFT / m);
  _drift.lerp(_driftTarget, C.CAMERA_LAG);

  // Lean-forward zoom, in ship-local space (rises over the wheel at full).
  _zoom.set(0, boostBlend * C.COCKPIT_FULL_Y, boostBlend * C.COCKPIT_FULL_Z);
  _zoom.applyQuaternion(ship.quaternion);

  camera.position.copy(ship.position).add(_drift).add(_zoom);
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
