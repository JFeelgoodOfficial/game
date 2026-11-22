// Nav auto-warp (user mechanic). Confirming a destination in the navigation
// hologram (holonav.js) hands the ship to this module: it turns the nose to
// the chosen world, then engages warp and flies to just outside the world's
// orbit — the same "fills the canopy" distance discovery uses. Not cancelable
// by the pilot (their input is suppressed for the trip); the only aborts are
// a hull-heat spike, so an uncancelable script can never cook the ship, and a
// stall: a ship that has not moved for a few seconds of a trip is handed back.
//
// A course that would go straight through a world (picked from its surface,
// or with the world between) first climbs: nose to the sky over the world in
// the way, and warp until the straight line clears it. Without that the
// altitude floor (src/gravity.js) holds a dive into the ground dead still.
//
// It drives the ship through the existing systems rather than around them:
// it steers by writing ship.quaternion (like the auto-land slerp) and warps
// by asserting input.warp, so ship.js's warp block, the FOV kick, and the
// full-window camera zoom all follow for free.

import * as THREE from 'three';
import { C } from './constants.js';
import { input } from './input.js';
import { ship } from './ship.js';
import { bodyInTheWay } from './gravity.js';
import { showNavToast } from './nav.js';

let lastEnd = null; // how the last trip ended: 'arrived' | 'heat' | 'stall:<phase>' (for verification)
export const autopilotEnd = () => lastEnd;
let ap = null; // { body, phase: 'climb' | 'align' | 'warp', onArrive, still, from }
const CLEAR = 400; // how far above a world in the way the course has to pass
const STALL = 4; // seconds without getting anywhere before the controls are handed back

const _dir = new THREE.Vector3();
const _up = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _target = new THREE.Quaternion();
const _aim = new THREE.Vector3();

// `onArrive` (optional) is called once, at the stop — not on a heat abort.
export function startAutoWarp(body, onArrive = null) {
  if (!body) return;
  ap = { body, phase: bodyInTheWay(ship.position, body.pos, CLEAR) ? 'climb' : 'align', onArrive, still: 0, from: ship.position.clone() };
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
    lastEnd = 'heat';
    cancelAutopilot();
    return;
  }

  // suppress the pilot — the ship flies itself until arrival
  input.mouseX = 0;
  input.mouseY = 0;
  input.forward = input.reverse = false;
  input.throttle = 0;
  input.warp = false;
  ship.angularVelocity.set(0, 0, 0);

  // live target (re-read every tick, so orbiting stations are tracked)
  _dir.subVectors(ap.body.pos, ship.position);
  const dist = _dir.length();
  if (dist < 1e-3) {
    finish();
    return;
  }

  // a stall: the trip is going nowhere (held at a floor, or anything else), so it is handed back
  if (ap.phase !== 'align') {
    if (ship.position.distanceToSquared(ap.from) < 4) {
      if ((ap.still += dt) > STALL) {
        lastEnd = `stall:${ap.phase}`;
        cancelAutopilot();
        showNavToast('COURSE BLOCKED — THE CONTROLS ARE YOURS', 4);
        return;
      }
    } else {
      ap.still = 0;
      ap.from.copy(ship.position);
    }
  }

  // a world in the way: climb straight up off it until the line is clear
  if (ap.phase === 'climb') {
    const b = bodyInTheWay(ship.position, ap.body.pos, CLEAR);
    if (!b) {
      ap.phase = 'align';
      input.warp = false;
    } else {
      _dir.subVectors(ship.position, b.position).normalize(); // its sky
      _aim.copy(ship.position).add(_dir);
      // (roll: keep the ship's top, unless it already points up the climb, when its nose is used)
      _up.set(0, 1, 0).applyQuaternion(ship.quaternion);
      if (Math.abs(_up.dot(_dir)) > 0.95) _up.set(0, 0, 1).applyQuaternion(ship.quaternion);
      _m.lookAt(ship.position, _aim, _up);
      _target.setFromRotationMatrix(_m);
      ship.quaternion.rotateTowards(_target, C.AUTOPILOT_TURN_RATE * 1.5 * dt);
      if (ship.quaternion.angleTo(_target) < 0.15) input.warp = true;
      return;
    }
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
  lastEnd = 'arrived';
  ship.velocity.set(0, 0, 0);
  input.warp = false;
  const done = ap?.onArrive;
  ap = null;
  if (done) done();
}
