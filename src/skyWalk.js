// On-foot Sky City mode — the fourth walk mode.
//
// A flat walker like the cottage's (src/cottageWalk.js): +Y up everywhere, one
// height query for the floor. The difference is where the world is. The cottage
// sits at the scene origin with the universe hidden; the Sky City is a child of
// Saturnia's group, out in the live solar system, tilted to the planet's radial
// and riding every floating-origin rebase. So the walker keeps its state in
// CITY-LOCAL coordinates and converts to world each step — ship.position is the
// converted point (the walk.js convention that keeps origin bookkeeping, music
// and capture working), never the source of truth.
//
// The other difference is the edge. Nothing clamps the walker to the deck: step
// past a rim and the floor query returns open air, and you fall until game.js
// (which polls skyFell) ends the run and puts you back at the start.
//
// walk.js dispatches its public surface here whenever skyActive().

import * as THREE from 'three';
import { C } from './constants.js';
import { input, moveAxes } from './input.js';
import { ship } from './ship.js';
import { createShip as createParkedShip } from '../world/ship.js';
import {
  getViewPref,
  showViewChooser,
  showViewToast,
  hideViewUI,
  toggleViewPref,
} from './walkview.js';

const LOOK_SENS = 0.0022;
const MAX_PITCH = 1.483;
const FACE_TURN = 12.0;
const CAM_SMOOTH = 9.0;
const PLAYER_RADIUS = 0.4;
const CAM_MIN = 3;
const CAM_MAX = 14;

export const sWalk = {
  active: false,
  pos: new THREE.Vector3(), // CITY-LOCAL
  yaw: 0, // look heading (0 = +Z, city-local)
  pitch: 0,
  vel: new THREE.Vector3(), // horizontal only
  vUp: 0,
  jumpHeld: false,
  grounded: true,
  mode: 'idle',
  speed01: 0,
  view: 'tp',
  camDist: 7,
  facingYaw: 0,
  falling: false, // past the point of no return
  fallT: 0,
};

let astronaut = null; // shared with walk.js
let city = null; // world/skycity.js instance (owned by game.js, never disposed here)
let parked = null;
let camSnap = true;

const _yAxis = new THREE.Vector3(0, 1, 0);
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _move = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _camOffset = new THREE.Vector3(); // city-local, relative to the walker
const _camFrozen = new THREE.Vector3(); // city-local camera spot held during a fall
const _origin = new THREE.Vector3(); // city origin, world
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _bearingOut = { angle: 0, dist: 0, label: 'SHIP' };

export function initSkyWalk(astronautRef) {
  astronaut = astronautRef;
}

export function skyActive() {
  return sWalk.active;
}

// True once the fall has run long enough that the caller should end it.
export function skyFell() {
  return sWalk.active && sWalk.falling && sWalk.fallT >= C.SKY_FALL_TIME;
}

// City-local -> world. The planet group carries no rotation, only a position
// (which the floating origin rebases), so the chain is one quaternion and two
// offsets, read live every call.
function toWorld(local, out) {
  _origin.copy(city.group.position).add(city.planet.group.position);
  return out.copy(local).applyQuaternion(city.group.quaternion).add(_origin);
}

// ---------------------------------------------------------------------------
// Enter / leave
// ---------------------------------------------------------------------------

export function enterSkyWalk(cityRef) {
  if (!astronaut || !cityRef) return false;
  if (sWalk.active) teardown();
  city = cityRef;

  sWalk.active = true;
  sWalk.pos.copy(city.spawn);
  sWalk.vel.set(0, 0, 0);
  sWalk.vUp = 0;
  sWalk.jumpHeld = false;
  sWalk.grounded = true;
  sWalk.mode = 'idle';
  sWalk.speed01 = 0;
  sWalk.pitch = 0;
  sWalk.yaw = Math.PI; // face the city: it is at -Z from the pad
  sWalk.facingYaw = sWalk.yaw;
  sWalk.camDist = 7;
  sWalk.falling = false;
  sWalk.fallT = 0;
  camSnap = true;

  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  toWorld(sWalk.pos, ship.position);

  // The freighter on the pad, nose toward the city — the pose the cockpit was
  // in a moment ago (game.js lands the ship facing the same way).
  parked = createParkedShip(city.group, {});
  parked.group.position.copy(city.pad);
  parked.group.position.y += C.PARK_LIFT;
  parked.group.rotation.y = Math.PI;

  const pref = getViewPref();
  if (pref) {
    sWalk.view = pref;
    showViewToast('T — TOGGLE VIEW');
  } else {
    sWalk.view = 'tp';
    showViewChooser((v) => {
      sWalk.view = v;
      camSnap = true;
    });
  }
  return true;
}

function teardown() {
  if (parked) {
    parked.dispose();
    parked = null;
  }
  if (astronaut) astronaut.group.visible = false;
  hideViewUI();
  sWalk.active = false;
  city = null;
}

export function exitSkyWalk() {
  teardown();
}

// ---------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------

export function stepSkyWalk(dt) {
  sWalk.yaw -= input.mouseX * LOOK_SENS;
  sWalk.pitch -= input.mouseY * LOOK_SENS;
  sWalk.pitch = Math.min(Math.max(sWalk.pitch, -MAX_PITCH), MAX_PITCH);
  input.mouseX = 0;
  input.mouseY = 0;

  const sinY = Math.sin(sWalk.yaw);
  const cosY = Math.cos(sWalk.yaw);
  const axes = moveAxes();
  _wish.set(sinY * axes.fwd + -cosY * axes.strafe, 0, cosY * axes.fwd + sinY * axes.strafe);
  const targetSpeed = input.sprint ? C.SKY_RUN_SPEED : C.SKY_WALK_SPEED;
  if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(targetSpeed * axes.mag);
  if (sWalk.falling) _wish.set(0, 0, 0); // nothing to push against

  const accel = sWalk.grounded ? C.WALK_ACCEL_GROUND : C.WALK_ACCEL_AIR;
  _move.subVectors(_wish, sWalk.vel);
  const gap = _move.length();
  const step = accel * dt;
  if (gap > step && gap > 1e-6) sWalk.vel.addScaledVector(_move, step / gap);
  else sWalk.vel.copy(_wish);

  sWalk.pos.x += sWalk.vel.x * dt;
  sWalk.pos.z += sWalk.vel.z * dt;
  pushOut();

  // vertical: the surface under the feet, or nothing at all
  const gy = city.floorYAt(sWalk.pos.x, sWalk.pos.z, sWalk.pos.y);
  if (sWalk.vUp <= 0 && sWalk.pos.y <= gy + city.snap) {
    sWalk.pos.y = gy;
    sWalk.grounded = true;
    sWalk.vUp = 0;
    if (input.brake && !sWalk.jumpHeld) {
      sWalk.vUp = C.WALK_JUMP;
      sWalk.grounded = false;
    }
  } else {
    sWalk.grounded = false;
    sWalk.vUp = Math.max(sWalk.vUp - C.WALK_GRAVITY * dt, -C.SKY_FALL_SPEED);
    sWalk.pos.y += sWalk.vUp * dt;
    if (sWalk.pos.y <= gy) {
      sWalk.pos.y = gy;
      sWalk.grounded = true;
      sWalk.vUp = 0;
    }
  }
  sWalk.jumpHeld = input.brake;

  if (!sWalk.falling && sWalk.pos.y < C.SKY_FALL_DEATH_Y) {
    sWalk.falling = true;
    sWalk.fallT = 0;
  }
  if (sWalk.falling) sWalk.fallT += dt;

  const hSpeed = sWalk.vel.length();
  sWalk.mode = !sWalk.grounded ? 'jump' : hSpeed > 0.6 ? 'run' : 'idle';
  sWalk.speed01 = Math.min(hSpeed / C.SKY_RUN_SPEED, 1);
  if (hSpeed > 0.4) {
    const targetYaw = Math.atan2(sWalk.vel.x, sWalk.vel.z);
    let d = targetYaw - sWalk.facingYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    sWalk.facingYaw += d * Math.min(1, FACE_TURN * dt);
  }

  toWorld(sWalk.pos, ship.position);
  ship.velocity.set(0, 0, 0);
}

// Circle colliders: slide around towers and the terrace wall. A collider with
// a finite `top` only blocks feet that are below it (the terrace is a wall from
// the deck and a floor once you have climbed a ramp).
function pushOut() {
  const cs = city.colliders;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (sWalk.pos.y >= c.top - city.snap) continue;
    const dx = sWalk.pos.x - c.x;
    const dz = sWalk.pos.z - c.z;
    const r = c.r + PLAYER_RADIUS;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    const d = Math.sqrt(d2);
    if (d < 1e-5) {
      sWalk.pos.x = c.x + r;
      continue;
    }
    sWalk.pos.x = c.x + (dx / d) * r;
    sWalk.pos.z = c.z + (dz / d) * r;
  }
}

// ---------------------------------------------------------------------------
// Visuals (render rate)
// ---------------------------------------------------------------------------

export function updateSkyVisuals(dt, t) {
  if (!sWalk.active || !astronaut) return;
  toWorld(sWalk.pos, astronaut.group.position);
  _q.setFromAxisAngle(_yAxis, sWalk.facingYaw);
  astronaut.group.quaternion.copy(city.group.quaternion).multiply(_q);
  astronaut.update(dt, sWalk.mode, sWalk.speed01);
  astronaut.group.visible = sWalk.view === 'tp';
  if (parked) {
    _up.set(0, 1, 0).applyQuaternion(city.group.quaternion);
    parked.update(dt, t, Math.max(_up.dot(city.planet.sunDir), 0.2));
  }
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

export function skyPromptText() {
  if (sWalk.falling) return null;
  return nearPad() ? 'G — BOARD' : null;
}

export function nearPad() {
  if (!city || sWalk.falling || !sWalk.grounded) return false;
  const dx = sWalk.pos.x - city.pad.x;
  const dz = sWalk.pos.z - city.pad.z;
  return dx * dx + dz * dz < C.SKY_BOARD_RADIUS * C.SKY_BOARD_RADIUS;
}

export function promptReturnToPad() {
  if (!sWalk.falling) showViewToast('RETURN TO THE LANDING PAD TO LEAVE');
}

export function toggleSkyView() {
  sWalk.view = toggleViewPref();
  camSnap = true;
  return sWalk.view;
}

export function padBearing() {
  if (!sWalk.active || !city) return null;
  const dx = city.pad.x - sWalk.pos.x;
  const dz = city.pad.z - sWalk.pos.z;
  const len = Math.hypot(dx, dz);
  _bearingOut.dist = len;
  _bearingOut.label = 'SHIP';
  if (len < 1e-6) {
    _bearingOut.angle = 0;
    return _bearingOut;
  }
  const sinY = Math.sin(sWalk.yaw);
  const cosY = Math.cos(sWalk.yaw);
  const fx = dx / len;
  const fz = dz / len;
  _bearingOut.angle = Math.atan2(fx * -cosY + fz * sinY, fx * sinY + fz * cosY);
  return _bearingOut;
}

// ---------------------------------------------------------------------------
// Camera — worked out city-local, then carried to world
// ---------------------------------------------------------------------------

export function updateSkyCamera(camera, delta = 0) {
  const cosP = Math.cos(sWalk.pitch);
  _look.set(Math.sin(sWalk.yaw) * cosP, Math.sin(sWalk.pitch), Math.cos(sWalk.yaw) * cosP);
  _up.set(0, 1, 0).applyQuaternion(city.group.quaternion);

  if (sWalk.view === 'fp') {
    _desired.copy(sWalk.pos);
    _desired.y += C.WALK_EYE_HEIGHT;
    _target.copy(_desired).add(_look);
  } else {
    if (input.wheel !== 0) {
      sWalk.camDist = Math.min(Math.max(sWalk.camDist + input.wheel * 0.004, CAM_MIN), CAM_MAX);
      input.wheel = 0;
    }
    _target.copy(sWalk.pos);
    _target.y += C.WALK_TP_EYE;
    if (sWalk.falling) {
      // The boom lets go: the camera stays where it was and watches you drop.
      _desired.copy(_camFrozen);
    } else {
      _desired.copy(_target).addScaledVector(_look, -sWalk.camDist);
      // never under the surface the walker is standing on (when there is one)
      const floor = city.floorYAt(_desired.x, _desired.z, sWalk.pos.y + 0.5);
      if (floor > -Infinity && _desired.y < floor + 0.4) _desired.y = floor + 0.4;
      _desired.sub(sWalk.pos);
      if (camSnap) {
        _camOffset.copy(_desired);
        camSnap = false;
      } else {
        _camOffset.lerp(_desired, 1 - Math.exp(-CAM_SMOOTH * delta));
      }
      _desired.copy(sWalk.pos).add(_camOffset);
      _camFrozen.copy(_desired);
    }
  }
  toWorld(_desired, camera.position);
  toWorld(_target, _target);
  camera.up.copy(_up);
  camera.lookAt(_target);
  if (camera.fov !== C.FOV) {
    camera.fov = C.FOV;
    camera.updateProjectionMatrix();
  }
}

// dev/verification handle (__debug via walk.js walkSite)
export function skySite() {
  if (!sWalk.active || !city) return null;
  return {
    sWalk,
    parked,
    nearPad: nearPad(),
    floor: city.floorYAt(sWalk.pos.x, sWalk.pos.z, sWalk.pos.y),
    // teleport the walker (city-local) for headless runs
    place(x, y, z) {
      sWalk.pos.set(x, y, z);
      sWalk.vel.set(0, 0, 0);
      sWalk.vUp = 0;
      camSnap = true;
    },
  };
}
