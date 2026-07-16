// On-foot walk mode (proof-of-concept). Disembark the ship over a rocky
// planet and walk its surface; the walker reuses ship.position as its
// world-space position (floating-origin frame), so origin rebasing, the
// atmosphere/skyfog passes, and gravity bookkeeping all keep working with no
// changes — control simply switches from flight to a first-person walker.
//
// Collision is a snap-to-ground: each tick the walker's radial distance is
// pinned to planet.radius + groundAt(up), where groundAt (planet.js /
// terrain.js) is the exact CPU mirror of the surface.vert displacement. So
// your feet land on the same relief the surface shader draws.

import * as THREE from 'three';
import { C } from './constants.js';
import { input } from './input.js';
import { ship } from './ship.js';
import { planets } from './planet.js';

const LOOK_SENS = 0.0022; // radians of look per pixel of mouse travel
const MAX_PITCH = 1.483; // ~85°, so you never flip past straight up/down
const GROUND_SNAP = 8.0; // max step-down (units) that still counts as "grounded"

// Scratch vectors — reused every tick, never allocated in the loop.
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();

export const walk = {
  active: false,
  planet: null, // a terra entry from planets[]
  heading: new THREE.Vector3(0, 0, -1), // world-space tangent forward
  pitch: 0, // camera-only, radians
  vUp: 0, // vertical velocity along the local up axis (jump/fall)
  jumpHeld: false, // for edge-triggered jump
};

// The nearest rocky (terra) planet you could stand on, and your altitude above
// its local terrain floor. Null if there are no terra planets. Mirrors the
// altitude math in gravity.js:altitudeAboveFloor.
export function nearestTerraFloor(pos) {
  let best = null;
  let bestAlt = Infinity;
  for (const p of planets) {
    if (p.cfg.type !== 'terra') continue;
    _up.subVectors(pos, p.body.position);
    const r = _up.length();
    _up.normalize();
    const ground = p.body.groundAt ? p.body.groundAt(_up) : 0;
    const altitude = r - p.radius - ground;
    if (altitude < bestAlt) {
      bestAlt = altitude;
      best = p;
    }
  }
  return best ? { planet: best, altitude: bestAlt } : null;
}

// Drop out of the ship onto the given terra planet, directly below where the
// ship was. Feet snap to the ground; the heading seeds from the ship's nose.
export function enterWalk(planet) {
  walk.active = true;
  walk.planet = planet;
  walk.pitch = 0;
  walk.vUp = 0;
  walk.jumpHeld = false;

  _up.subVectors(ship.position, planet.body.position).normalize();

  // Seed heading from the ship's forward (-Z), projected onto the tangent
  // plane. Fall back to an arbitrary tangent if it was pointing straight up.
  walk.heading.set(0, 0, -1).applyQuaternion(ship.quaternion);
  projectTangent(walk.heading, _up);
  if (walk.heading.lengthSq() < 1e-6) {
    walk.heading.set(1, 0, 0);
    projectTangent(walk.heading, _up);
  }
  walk.heading.normalize();

  // Snap feet onto the terrain directly below.
  const ground = planet.body.groundAt(_up);
  ship.position.copy(planet.body.position).addScaledVector(_up, planet.radius + ground);
  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
}

// Board the ship: lift back to disembark altitude, nose pointed away from the
// planet so thrust climbs, at rest. (Near-planet gravity still needs boost to
// climb out — that's the flight model, unchanged.)
export function exitWalk(camera) {
  const planet = walk.planet;
  _up.subVectors(ship.position, planet.body.position).normalize();
  const ground = planet.body.groundAt(_up);
  const liftR = planet.radius + ground + C.WALK_LAND_ALTITUDE;
  ship.position.copy(planet.body.position).addScaledVector(_up, liftR);
  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  // Point the nose along "up" so W thrust climbs away from the surface.
  ship.quaternion.setFromUnitVectors(_look.set(0, 0, -1), _up);

  // Snap the lagging camera to the ship so it doesn't slerp across the sky.
  if (camera) {
    camera.position.copy(ship.position);
    camera.quaternion.copy(ship.quaternion);
    camera.fov = C.FOV;
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
  }

  walk.active = false;
  walk.planet = null;
}

export function stepWalk(dt) {
  const planet = walk.planet;

  // Current up (radial, planet center → walker).
  _up.subVectors(ship.position, planet.body.position).normalize();

  // --- mouse look ---
  const yaw = -input.mouseX * LOOK_SENS; // mouse right → turn right
  walk.pitch -= input.mouseY * LOOK_SENS; // mouse up → look up
  walk.pitch = Math.min(Math.max(walk.pitch, -MAX_PITCH), MAX_PITCH);
  input.mouseX = 0;
  input.mouseY = 0;

  // Re-project heading onto the (possibly changed) tangent plane, then yaw it.
  projectTangent(walk.heading, _up);
  if (walk.heading.lengthSq() < 1e-6) walk.heading.copy(_right); // degenerate guard
  walk.heading.normalize();
  walk.heading.applyAxisAngle(_up, yaw);
  projectTangent(walk.heading, _up);
  walk.heading.normalize();

  // --- planar movement (tangent to the surface) ---
  _right.crossVectors(walk.heading, _up).normalize();
  const fwd = (input.forward ? 1 : 0) - (input.reverse ? 1 : 0);
  const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  _move.set(0, 0, 0);
  _move.addScaledVector(walk.heading, fwd);
  _move.addScaledVector(_right, strafe);
  if (_move.lengthSq() > 0) {
    _move.normalize().multiplyScalar(C.WALK_SPEED * dt);
    ship.position.add(_move);
  }

  // Recompute up / radius after the horizontal step.
  _up.subVectors(ship.position, planet.body.position);
  let r = _up.length();
  _up.normalize();
  const surfaceR = planet.radius + planet.body.groundAt(_up);

  // --- vertical: glue to the ground on gentle slopes; integrate a jump/fall ---
  if (walk.vUp <= 0 && r <= surfaceR + GROUND_SNAP) {
    r = surfaceR; // grounded: follow the terrain up and down
    walk.vUp = 0;
    if (input.brake && !walk.jumpHeld) walk.vUp = C.WALK_JUMP; // edge-triggered jump
  } else {
    walk.vUp -= C.WALK_GRAVITY * dt;
    r += walk.vUp * dt;
    if (r <= surfaceR) {
      r = surfaceR;
      walk.vUp = 0;
    }
  }
  walk.jumpHeld = input.brake;

  ship.position.copy(planet.body.position).addScaledVector(_up, r);
  ship.velocity.set(0, 0, 0);
}

// Eye-level first-person camera, rolled so the planet's up is screen-up.
export function updateWalkCamera(camera) {
  const planet = walk.planet;
  _up.subVectors(ship.position, planet.body.position).normalize();
  camera.position.copy(ship.position).addScaledVector(_up, C.WALK_EYE_HEIGHT);

  _right.crossVectors(walk.heading, _up).normalize();
  _look.copy(walk.heading).applyAxisAngle(_right, walk.pitch);
  _target.copy(camera.position).add(_look);
  camera.up.copy(_up);
  camera.lookAt(_target);
}

// Remove v's component along the (unit) up vector, leaving it in the tangent
// plane. Does not renormalize.
function projectTangent(v, up) {
  v.addScaledVector(up, -v.dot(up));
}
