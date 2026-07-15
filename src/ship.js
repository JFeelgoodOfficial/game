// The ship is a rigid body with linear and angular velocity persisting
// across frames — not a camera with a move speed (GDD 3).
//
// Fixed-timestep integration, semi-implicit Euler: forces update velocity,
// then velocity updates position. Mouse input applies torque, never
// rotation; angular damping bleeds it off. Releasing thrust does not
// decelerate — the ship coasts.

import * as THREE from 'three';
import { C } from './constants.js';
import { input } from './input.js';
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
};

const _grav = new THREE.Vector3();
const _thrust = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _brake = new THREE.Vector3();
const _euler = new THREE.Euler();
const _dq = new THREE.Quaternion();

export function stepShip(dt) {
  const av = ship.angularVelocity;

  // --- torque, not rotation (GDD 3.1) ---
  // Accumulated mouse travel becomes an angular-velocity impulse. Mouse
  // right yaws right (-Y), mouse up pitches up (+X, FPS convention).
  av.y -= input.mouseX * C.TORQUE_SCALE;
  av.x -= input.mouseY * C.TORQUE_SCALE;
  input.mouseX = 0;
  input.mouseY = 0;
  const roll = (input.rollLeft ? 1 : 0) - (input.rollRight ? 1 : 0);
  av.z += roll * C.ROLL_TORQUE;

  // Angular damping bleeds rotation off after input stops.
  av.multiplyScalar(C.ANGULAR_DAMPING);

  // Integrate orientation from ship-local angular velocity.
  _euler.set(av.x * dt, av.y * dt, av.z * dt, 'XYZ');
  _dq.setFromEuler(_euler);
  ship.quaternion.multiply(_dq).normalize();

  ship.properAccel.set(0, 0, 0);

  // --- thrust along local forward (GDD 3.1) ---
  const throttle = (input.forward ? 1 : 0) - (input.reverse ? 1 : 0);
  const thrustMag = C.THRUST * (input.boost ? C.BOOST_MULTIPLIER : 1);
  if (throttle !== 0) {
    _fwd.set(0, 0, -1).applyQuaternion(ship.quaternion);
    _thrust.copy(_fwd).multiplyScalar(throttle * thrustMag);
    // Soft speed cap (GDD 3.2): above SOFT_CAP_SPEED, thrust that would
    // increase speed fades smoothly to zero by 1.5× the cap. Decelerating
    // thrust keeps full authority — the engine tops out, it doesn't wall.
    const speed = ship.velocity.length();
    if (speed > C.SOFT_CAP_SPEED && _thrust.dot(ship.velocity) > 0) {
      const t = Math.min((speed - C.SOFT_CAP_SPEED) / (C.SOFT_CAP_SPEED * 0.5), 1);
      _thrust.multiplyScalar(1 - t * t * (3 - 2 * t));
    }
    ship.properAccel.add(_thrust);
    ship.velocity.addScaledVector(_thrust, dt);
  }

  // --- counter-thrust (GDD 3.3): kill velocity, held ---
  // Same engine authority as thrust, aimed against the velocity vector,
  // clamped so it never pushes through zero. No cap falloff — it only
  // ever decreases speed.
  if (input.brake) {
    const speed = ship.velocity.length();
    if (speed > 0) {
      const dv = thrustMag * dt;
      if (dv >= speed) {
        ship.properAccel.addScaledVector(ship.velocity, -1 / dt);
        ship.velocity.set(0, 0, 0);
      } else {
        _brake.copy(ship.velocity).multiplyScalar(-thrustMag / speed);
        ship.properAccel.add(_brake);
        ship.velocity.addScaledVector(_brake, dt);
      }
    }
  }

  // --- gravity, applied to velocity before integration (GDD 3.2) ---
  accelAt(ship.position, _grav);
  ship.velocity.addScaledVector(_grav, dt);

  // Exactly 1.0 in vacuum — no drag (GDD 3.4). Kept as a multiply so the
  // panel can experiment; becomes altitude-dependent in Phase 5.
  ship.velocity.multiplyScalar(C.LINEAR_DAMPING);

  // Altitude floor (GDD 5.1). Thickens drag near any body given a radius so
  // the ship skims the surface instead of passing through it.
  applyAltitudeFloor(ship.position, ship.velocity, dt);

  ship.position.addScaledVector(ship.velocity, dt);
}
