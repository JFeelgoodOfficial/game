// The ship is a rigid body with linear and angular velocity persisting
// across frames — not a camera with a move speed (GDD 3).
//
// Fixed-timestep integration, semi-implicit Euler: forces update velocity,
// then velocity updates position. Mouse input applies torque, never
// rotation; angular damping bleeds it off. Releasing thrust does not
// decelerate — the ship coasts.

import * as THREE from 'three';
import { C } from './constants.js';
import { input, throttleAxis } from './input.js';
import { accelAt, applyAltitudeFloor } from './gravity.js';

export const ship = {
  position: new THREE.Vector3(), // local (floating-origin) frame
  velocity: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  angularVelocity: new THREE.Vector3(), // rad/s, ship-local axes
  // Proper acceleration (thrust + counter-thrust, NOT gravity) from the last
  // tick. Camera drift reads this: free fall is weightless and shouldn't
  // shove the camera; engine burns should.
  properAccel: new THREE.Vector3(),
  // Where there is a flat horizon to be crooked against (the megaworld,
  // src/farside.js sets it): the up the wings are eased level with while
  // nobody is rolling. null everywhere else: space has no level.
  levelUp: null,
};

const _grav = new THREE.Vector3();
const _thrust = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _warpTarget = new THREE.Vector3();
const _euler = new THREE.Euler();
const _dq = new THREE.Quaternion();

let wasWarping = false;

// piloted=false while the pilot is out of the seat (interior.js): controls
// and mouse torque disengage — the walk controller owns the mouse — but the
// ship still coasts, falls, and feels the altitude floor. Attitude hold
// gently settles any residual spin so the porthole view calms down.
export function stepShip(dt, piloted = true) {
  const av = ship.angularVelocity;

  if (piloted) {
    // --- torque, not rotation (GDD 3.1) ---
    // Accumulated mouse travel becomes an angular-velocity impulse. Mouse
    // right yaws right (-Y), mouse up pitches up (+X, FPS convention).
    av.y -= input.mouseX * C.TORQUE_SCALE;
    av.x -= input.mouseY * C.TORQUE_SCALE;
    input.mouseX = 0;
    input.mouseY = 0;
    // Roll. It was taken out with the old dash and came back as two paddles
    // by the CODEX disc: yaw with the nose up turns into bank against a
    // horizon, and with no roll there was no way to take it off again.
    const roll = (input.rollLeft ? 1 : 0) - (input.rollRight ? 1 : 0);
    if (roll) av.z += roll * C.ROLL_TORQUE;
    else if (ship.levelUp) {
      // wings level: the right wing's height against the horizon is the
      // error. It fades out as the nose nears straight up or down, where
      // "level" stops meaning anything.
      _fwd.set(1, 0, 0).applyQuaternion(ship.quaternion);
      const tilt = Math.max(-1, Math.min(1, _fwd.dot(ship.levelUp)));
      _thrust.set(0, 0, -1).applyQuaternion(ship.quaternion);
      const nose = Math.abs(_thrust.dot(ship.levelUp));
      _grav.set(0, 1, 0).applyQuaternion(ship.quaternion);
      const err = _grav.dot(ship.levelUp) < 0 ? (tilt < 0 ? -1.2 : 1.2) : Math.asin(tilt);
      av.z -= err * C.AUTO_LEVEL * Math.max(0, 1 - nose * nose * 1.4);
    }
  } else {
    av.multiplyScalar(C.INTERIOR_SPIN_CALM); // attitude hold
    // station-keeping: the autopilot bleeds speed off so the ship does not
    // sail into a planet while the pilot is looking at paintings
    ship.velocity.multiplyScalar(C.INTERIOR_BRAKE);
  }

  // Angular damping bleeds rotation off after input stops.
  av.multiplyScalar(C.ANGULAR_DAMPING);

  // Integrate orientation from ship-local angular velocity.
  _euler.set(av.x * dt, av.y * dt, av.z * dt, 'XYZ');
  _dq.setFromEuler(_euler);
  ship.quaternion.multiply(_dq).normalize();

  ship.properAccel.set(0, 0, 0);

  if (input.warp && piloted) {
    // --- warp (user mechanic): boost x100, stops dead on release ---
    // Velocity slews toward WARP_SPEED along the nose, ignoring the soft cap
    // and normal thrust. The altitude floor still arrests a warp dive.
    _fwd.set(0, 0, -1).applyQuaternion(ship.quaternion);
    _warpTarget.copy(_fwd).multiplyScalar(C.WARP_SPEED);
    ship.velocity.lerp(_warpTarget, C.WARP_RAMP);
    ship.properAccel.copy(_fwd).multiplyScalar(C.THRUST * 24); // strong felt push
    wasWarping = true;
  } else {
    // Dropping out of warp cuts all velocity — the sudden stop.
    if (wasWarping) {
      ship.velocity.set(0, 0, 0);
      wasWarping = false;
    }

    // --- thrust along local forward (GDD 3.1) ---
    // One control: the throttle (the dash lever, or W/S as its full throw).
    // The walk controller owns W/S while unpiloted.
    const throttle = piloted ? throttleAxis() : 0;
    if (throttle !== 0) {
      _fwd.set(0, 0, -1).applyQuaternion(ship.quaternion);
      // Forward is the boost, scaled by how far the lever is pushed. Pulled
      // back, the engine gives the same authority only while it is SLOWING the
      // ship — there is no brake any more, so the lever has to be one — and
      // base thrust once it is actually backing up: reverse is for backing
      // off, not for going fast.
      const along = ship.velocity.dot(_fwd);
      const strong = throttle > 0 || along > 0;
      const thrustMag = C.THRUST * (strong ? C.BOOST_MULTIPLIER : 1);
      _thrust.copy(_fwd).multiplyScalar(throttle * thrustMag);
      // Soft speed cap (GDD 3.2): above the cap, thrust that would increase
      // speed fades smoothly to zero by 1.5× the cap. Decelerating thrust
      // keeps full authority — the engine tops out, it doesn't wall. A full
      // push doubles the cap too; easing off doesn't brake you, the falloff
      // just stops adding speed while you coast back down.
      const cap = C.SOFT_CAP_SPEED * (1 + Math.max(throttle, 0));
      const speed = ship.velocity.length();
      if (speed > cap && _thrust.dot(ship.velocity) > 0) {
        const t = Math.min((speed - cap) / (cap * 0.5), 1);
        _thrust.multiplyScalar(1 - t * t * (3 - 2 * t));
      }
      ship.properAccel.add(_thrust);
      ship.velocity.addScaledVector(_thrust, dt);
    }
  }

  // --- gravity, applied to velocity before integration (GDD 3.2) ---
  accelAt(ship.position, _grav);
  ship.velocity.addScaledVector(_grav, dt);

  // Exactly 1.0 in vacuum — no drag (GDD 3.4). Kept as a multiply so the
  // panel can experiment; becomes altitude-dependent in Phase 5.
  ship.velocity.multiplyScalar(C.LINEAR_DAMPING);

  // Altitude floor (GDD 5.1). Thickens drag near any body given a radius so
  // the ship skims the surface instead of passing through it. dt lets it
  // add a hard anti-tunnel stop that only bites at warp speeds.
  applyAltitudeFloor(ship.position, ship.velocity, dt);

  ship.position.addScaledVector(ship.velocity, dt);
}
