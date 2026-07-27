// Nav auto-warp (user mechanic). Confirming a destination in the navigation
// hologram (holonav.js) hands the ship to this module: it turns the nose to
// the chosen world, then engages warp and flies to just outside the world's
// orbit — the same "fills the canopy" distance discovery uses. Not cancelable
// by the pilot (their input is suppressed for the trip); the only abort is a
// hull-heat spike, so an uncancelable script can never cook the ship.
//
// It drives the ship through the existing systems rather than around them:
// it steers by writing ship.quaternion (like the auto-land slerp) and warps
// by asserting input.warp, so ship.js's warp block, the FOV kick, and the
// full-window camera zoom all follow for free.

import * as THREE from 'three';
import { C } from './constants.js';
import { input } from './input.js';
import { ship } from './ship.js';

let ap = null; // { body, phase: 'align' | 'warp' }

const _dir = new THREE.Vector3();
const _up = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _target = new THREE.Quaternion();

export function startAutoWarp(body) {
  if (!body) return;
  ap = { body, phase: 'align' };
  ship.velocity.set(0, 0, 0); // halt and pivot in place, then warp
}

export function autopilotActive() {
  return !!ap;
}

export function cancelAutopilot() {
  if (ap) {
    ap = null;
    input.warp = false;
  }
}

// Called each physics tick BEFORE stepShip, in the free-flight branch.
// `heat` is the current hull heat 0..1.
export function stepAutopilot(dt, heat) {
  if (!ap) return;

  // safety valve: the only way out of an otherwise uncancelable trip
  if (heat > 0.5) {
    cancelAutopilot();
    return;
  }

  // suppress the pilot — the ship flies itself until arrival
  input.mouseX = 0;
  input.mouseY = 0;
  input.forward = input.reverse = input.brake = false;
  input.rollLeft = input.rollRight = false;
  input.warp = false;
  ship.angularVelocity.set(0, 0, 0);

  // live target (re-read every tick, so orbiting stations are tracked)
  _dir.subVectors(ap.body.pos, ship.position);
  const dist = _dir.length();
  if (dist < 1e-3) {
    finish();
    return;
  }

  // face the target with the ship's -Z, keeping current roll
  _up.set(0, 1, 0).applyQuaternion(ship.quaternion);
  _m.lookAt(ship.position, ap.body.pos, _up);
  _target.setFromRotationMatrix(_m);
  ship.quaternion.rotateTowards(_target, C.AUTOPILOT_TURN_RATE * dt);

  if (ap.phase === 'align') {
    if (ship.quaternion.angleTo(_target) < 0.02) ap.phase = 'warp';
  }
  if (ap.phase === 'warp') {
    input.warp = true; // ship.js's warp block does the flying
    // arrive at the discovery distance (a few radii out)
    if (dist - ship.velocity.length() * dt <= ap.body.logDist) finish();
  }
}

function finish() {
  ship.velocity.set(0, 0, 0);
  input.warp = false;
  ap = null;
}
