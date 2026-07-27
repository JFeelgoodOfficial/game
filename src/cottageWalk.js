// On-foot cottage mode — the third walk mode.
//
// The planet walker (walk.js) is radial: up is pos - planetCenter and the floor
// is a sphere. The station walker (stationWalk.js) is flat but rides a moving,
// spinning station group. This one is the simplest of the three: a flat world
// that does not move at all, parented at the scene origin, with +Y up
// everywhere and three walkable decks (grass, the cottage floorboards, the
// landing pad) resolved by one height query.
//
// Because the world sits at the local origin and the walker never strays more
// than ~45 u from it, cWalk.pos IS ship.position — no frame conversion, and the
// floating origin (C.ORIGIN_SHIFT_THRESHOLD, 5000) never rebases while we are
// here. Writing the walker into ship.position is the walk.js convention that
// keeps origin bookkeeping, music and the capture system working unchanged.
//
// walk.js dispatches its public surface here whenever cottageActive() —
// game.js keeps using phase 'walk' and never knows the difference.
//
// There is nothing to talk to and nothing to find. The only interaction in the
// whole world is G, at the pad, to go home.

import * as THREE from 'three';
import { C } from './constants.js';
import { input } from './input.js';
import { ship } from './ship.js';
import { createCottage } from '../world/cottage.js';
import { createShip as createParkedShip } from '../world/ship.js';
import { settings } from './settings.js';
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
const PLAYER_RADIUS = 0.34; // the cottage doorway is 1.5 wide — stay slim
const CAM_MIN = 2.2;        // the garden is small; keep the third-person orbit tight
const CAM_MAX = 9;
const SUN_DOT = 0.9;        // the parked ship's day/night term — it is midmorning here
const GROUND_SNAP = 1.2;    // step up onto the pad / over the threshold

export const cWalk = {
  active: false,
  pos: new THREE.Vector3(), // world = local: the world sits at the origin
  yaw: 0,                   // look heading (0 = +Z)
  pitch: 0,
  vel: new THREE.Vector3(), // horizontal only (y unused)
  vUp: 0,
  jumpHeld: false,
  grounded: true,
  mode: 'idle',             // 'idle' | 'run' | 'jump' — drives the astronaut + HUD
  speed01: 0,
  view: 'tp',
  camDist: 5.5,
  facingYaw: 0,             // body heading, follows the velocity
};

let astronaut = null; // shared with walk.js (initCottageWalk)
let scene = null;
let cottage = null;   // the world module instance
let parked = null;    // the player's ship, on the pad
let camSnap = true;
let elapsed = 0;

// Scratch — zero allocation in the per-frame paths.
const _yAxis = new THREE.Vector3(0, 1, 0);
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _move = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _bearingOut = { angle: 0, dist: 0, label: 'SHIP' };

export function initCottageWalk(astronautRef, sceneRef) {
  astronaut = astronautRef;
  scene = sceneRef;
}

export function cottageActive() {
  return cWalk.active;
}

// ---------------------------------------------------------------------------
// Enter / leave
// ---------------------------------------------------------------------------

// Called by game.js while the screen is fully white. The build is heavy — 16 k
// instanced tufts, two canvas textures, an extruded thatch roof — and all of it
// lands in this one long frame, which is precisely why the caller holds the
// flash at full white across it: the hitch reads as part of the explosion.
export function enterCottageWalk(opts = {}) {
  if (!scene) return false;
  if (cWalk.active) teardown(); // self-cleaning (reset hardening)

  cottage = createCottage(scene, {
    renderer: opts.renderer ?? null,
    quality: settings.quality,
  });
  scene.add(cottage.group);

  cWalk.active = true;
  cWalk.pos.copy(cottage.spawn);
  cWalk.vel.set(0, 0, 0);
  cWalk.vUp = 0;
  cWalk.jumpHeld = false;
  cWalk.grounded = true;
  cWalk.mode = 'idle';
  cWalk.speed01 = 0;
  cWalk.pitch = 0;
  // Face the cottage: it is at the origin, we are out at +Z on the pad.
  cWalk.yaw = Math.PI;
  cWalk.facingYaw = cWalk.yaw;
  cWalk.camDist = 5.5;
  camSnap = true;
  elapsed = 0;

  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  ship.position.copy(cWalk.pos);

  // The ship, set down on the pad, nose pointing out along +Z — already aimed
  // away from the cottage, so boarding and leaving is one motion.
  parked = createParkedShip(cottage.group, {});
  parked.group.position.copy(cottage.shipSpot);

  const pref = getViewPref();
  if (pref) {
    cWalk.view = pref;
    showViewToast('T — TOGGLE VIEW');
  } else {
    cWalk.view = 'tp';
    showViewChooser((v) => {
      cWalk.view = v;
      camSnap = true;
    });
  }
  return true;
}

function teardown() {
  if (parked) {
    parked.dispose(); // removes its own group from the cottage group
    parked = null;
  }
  if (cottage) {
    cottage.dispose(); // detaches the group and restores scene.fog / environment
    cottage = null;
  }
  if (astronaut) astronaut.group.visible = false;
  hideViewUI();
  cWalk.active = false;
}

// G at the pad. Teardown only — game.js owns the flash and the reset that puts
// the player back in front of Terra, because that is a phase transition and
// this module has no business knowing about phases.
export function exitCottageWalk() {
  teardown();
}

// ---------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------

export function stepCottageWalk(dt) {
  cWalk.yaw -= input.mouseX * LOOK_SENS;
  cWalk.pitch -= input.mouseY * LOOK_SENS;
  cWalk.pitch = Math.min(Math.max(cWalk.pitch, -MAX_PITCH), MAX_PITCH);
  input.mouseX = 0;
  input.mouseY = 0;

  const sinY = Math.sin(cWalk.yaw);
  const cosY = Math.cos(cWalk.yaw);
  const fwd = (input.forward ? 1 : 0) - (input.reverse ? 1 : 0);
  const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  // heading (sinY, cosY); right = heading x up = (-cosY, sinY) in xz
  _wish.set(sinY * fwd + -cosY * strafe, 0, cosY * fwd + sinY * strafe);
  const targetSpeed = input.sprint ? C.COTTAGE_RUN_SPEED : C.COTTAGE_WALK_SPEED;
  if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(targetSpeed);

  const accel = cWalk.grounded ? C.WALK_ACCEL_GROUND : C.WALK_ACCEL_AIR;
  _move.subVectors(_wish, cWalk.vel);
  const gap = _move.length();
  const step = accel * dt;
  if (gap > step && gap > 1e-6) cWalk.vel.addScaledVector(_move, step / gap);
  else cWalk.vel.copy(_wish);

  // Move and resolve, one axis at a time, so sliding along a wall works
  // (the cottage's colliders are axis-aligned boxes).
  const nx = cWalk.pos.x + cWalk.vel.x * dt;
  if (!blocked(nx, cWalk.pos.z)) cWalk.pos.x = nx;
  else cWalk.vel.x = 0;
  const nz = cWalk.pos.z + cWalk.vel.z * dt;
  if (!blocked(cWalk.pos.x, nz)) cWalk.pos.z = nz;
  else cWalk.vel.z = 0;

  // Don't walk off the edge of the world — the ground plane is 400 wide and the
  // fog is opaque long before it, so a soft ring at 120 is never seen.
  const r2 = cWalk.pos.x * cWalk.pos.x + cWalk.pos.z * cWalk.pos.z;
  if (r2 > 120 * 120) {
    const k = 120 / Math.sqrt(r2);
    cWalk.pos.x *= k;
    cWalk.pos.z *= k;
  }

  // vertical: the deck under the feet, with a normal-gravity jump
  const gy = cottage.floorYAt(cWalk.pos.x, cWalk.pos.z);
  if (cWalk.vUp <= 0 && cWalk.pos.y <= gy + GROUND_SNAP) {
    cWalk.pos.y = gy;
    cWalk.grounded = true;
    cWalk.vUp = 0;
    if (input.brake && !cWalk.jumpHeld) cWalk.vUp = C.WALK_JUMP;
  } else {
    cWalk.grounded = false;
    cWalk.vUp -= C.WALK_GRAVITY * dt;
    cWalk.pos.y += cWalk.vUp * dt;
    if (cWalk.pos.y <= gy) {
      cWalk.pos.y = gy;
      cWalk.grounded = true;
      cWalk.vUp = 0;
    }
  }
  cWalk.jumpHeld = input.brake;

  // The cottage has a real ceiling — cap the jump so heads stay indoors.
  if (cottage.insideHouse(cWalk.pos.x, cWalk.pos.z)) {
    const maxY = C.COTTAGE_CEILING - C.WALK_EYE_HEIGHT;
    if (cWalk.pos.y > maxY) {
      cWalk.pos.y = maxY;
      if (cWalk.vUp > 0) cWalk.vUp = 0;
    }
  }

  // animation state
  const hSpeed = cWalk.vel.length();
  cWalk.mode = !cWalk.grounded ? 'jump' : hSpeed > 0.6 ? 'run' : 'idle';
  cWalk.speed01 = Math.min(hSpeed / C.COTTAGE_RUN_SPEED, 1);
  if (hSpeed > 0.4) {
    const targetYaw = Math.atan2(cWalk.vel.x, cWalk.vel.z);
    let d = targetYaw - cWalk.facingYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    cWalk.facingYaw += d * Math.min(1, FACE_TURN * dt);
  }

  ship.position.copy(cWalk.pos);
  ship.velocity.set(0, 0, 0);
}

function blocked(x, z) {
  const cs = cottage.colliders;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (x > c.x0 - PLAYER_RADIUS && x < c.x1 + PLAYER_RADIUS &&
        z > c.z0 - PLAYER_RADIUS && z < c.z1 + PLAYER_RADIUS) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Visuals (render rate)
// ---------------------------------------------------------------------------

export function updateCottageVisuals(dt, t) {
  if (!cWalk.active || !astronaut) return;
  elapsed += dt;

  astronaut.group.position.copy(cWalk.pos);
  astronaut.group.quaternion.setFromAxisAngle(_yAxis, cWalk.facingYaw);
  astronaut.update(dt, cWalk.mode, cWalk.speed01);
  astronaut.group.visible = cWalk.view === 'tp';

  if (parked) parked.update(dt, t, SUN_DOT);
  cottage.update(dt, elapsed);
}

// Pre-composer hook: the cottage's PMREM environment bake needs a renderer, and
// this is the only place one is handed out.
export function cottagePreRender(renderer) {
  if (cWalk.active && cottage) cottage.preRender(renderer);
}

// ---------------------------------------------------------------------------
// Interaction — there isn't any, beyond leaving
// ---------------------------------------------------------------------------

export function cottageInteract() {
  // Nothing here asks anything of you. E does nothing on purpose.
}

export function cottagePromptText() {
  return nearPad() ? 'G — BOARD' : null;
}

export function nearPad() {
  if (!cottage) return false;
  const dx = cWalk.pos.x - cottage.pad.x;
  const dz = cWalk.pos.z - cottage.pad.z;
  return dx * dx + dz * dz < C.COTTAGE_BOARD_RADIUS * C.COTTAGE_BOARD_RADIUS;
}

export function promptReturnToPad() {
  showViewToast('RETURN TO THE SHIP TO LEAVE');
}

export function toggleCottageView() {
  cWalk.view = toggleViewPref();
  camSnap = true;
  return cWalk.view;
}

// Compass arrow back to the pad, mirroring walk.js's shipBearing.
export function padBearing() {
  if (!cWalk.active || !cottage) return null;
  const dx = cottage.pad.x - cWalk.pos.x;
  const dz = cottage.pad.z - cWalk.pos.z;
  _bearingOut.dist = Math.hypot(dx, dz);
  _bearingOut.label = 'SHIP';
  const len = _bearingOut.dist;
  if (len < 1e-6) {
    _bearingOut.angle = 0;
    return _bearingOut;
  }
  const sinY = Math.sin(cWalk.yaw);
  const cosY = Math.cos(cWalk.yaw);
  const fx = dx / len;
  const fz = dz / len;
  _bearingOut.angle = Math.atan2(fx * -cosY + fz * sinY, fx * sinY + fz * cosY);
  return _bearingOut;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export function updateCottageCamera(camera, delta = 0) {
  const cosP = Math.cos(cWalk.pitch);
  _look.set(Math.sin(cWalk.yaw) * cosP, Math.sin(cWalk.pitch), Math.cos(cWalk.yaw) * cosP);

  if (cWalk.view === 'fp') {
    camera.position.copy(cWalk.pos);
    camera.position.y += C.WALK_EYE_HEIGHT;
    _target.copy(camera.position).add(_look);
    camera.up.set(0, 1, 0);
    camera.lookAt(_target);
    if (camera.fov !== C.FOV) {
      camera.fov = C.FOV;
      camera.updateProjectionMatrix();
    }
    return;
  }

  if (input.wheel !== 0) {
    cWalk.camDist = Math.min(Math.max(cWalk.camDist + input.wheel * 0.004, CAM_MIN), CAM_MAX);
    input.wheel = 0;
  }
  _target.copy(cWalk.pos);
  _target.y += C.WALK_TP_EYE;
  _desired.copy(_target).addScaledVector(_look, -cWalk.camDist);
  // never let the camera dive under the deck the player is standing on
  const minY = cWalk.pos.y + 0.4;
  if (_desired.y < minY) _desired.y = minY;

  _desired.sub(cWalk.pos);
  if (camSnap) {
    _camOffset.copy(_desired);
    camSnap = false;
  } else {
    _camOffset.lerp(_desired, 1 - Math.exp(-CAM_SMOOTH * delta));
  }
  camera.position.copy(cWalk.pos).add(_camOffset);
  camera.up.set(0, 1, 0);
  camera.lookAt(_target);
  if (camera.fov !== C.FOV) {
    camera.fov = C.FOV;
    camera.updateProjectionMatrix();
  }
}

// dev/verification handle (__debug via walk.js walkSite)
export function cottageSite() {
  if (!cWalk.active || !cottage) return null;
  return {
    cWalk,
    parked,
    colliders: cottage.colliders.length,
    pad: cottage.pad.clone(),
    spawn: cottage.spawn.clone(),
    nearPad: nearPad(),
  };
}
