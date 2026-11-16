// On foot at the capital of the worldship (world/capital.js, src/tenretni.js).
//
// The Sky City's walker (src/skyWalk.js) with everything but the walking taken
// out: a flat controller in PLATFORM-LOCAL coordinates, converted to world
// every step, because the platform is a child of a planet group that rides
// floating-origin rebases — and, here, a planet that can be under way. No
// race, no gun, and no fall: the deck has no rail, so a step that would leave
// every walkable surface is simply not taken.
//
// It knows nothing about the story. The platform brings its own inhabitants
// and consoles:
//
//   platform.npcs[]      { x, y, z, talk() -> dialogue payload }
//   platform.consoles[]  { x, y, z, r, prompt, use() -> dialogue payload }
//   platform.onChoice(tag) -> follow-up payload | null   (a picked option)
//   platform.setWalker(localPos | null)   so the figures can watch the player
//
// walk.js dispatches its public surface here whenever capitalActive().

import * as THREE from 'three';
import { C } from './constants.js';
import { input, moveAxes } from './input.js';
import { ship } from './ship.js';
import { createShip as createParkedShip } from '../world/ship.js';
import { openDialogue, advanceDialogue, isDialogueOpen, closeDialogue } from './dialogue.js';
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
const TALK_DIST = 3.4;

export const cWalk = {
  active: false,
  pos: new THREE.Vector3(), // PLATFORM-LOCAL
  yaw: 0, // look heading (0 = +Z)
  pitch: 0,
  vel: new THREE.Vector3(),
  vUp: 0,
  jumpHeld: false,
  grounded: true,
  mode: 'idle',
  speed01: 0,
  view: 'tp',
  camDist: 7,
  facingYaw: 0,
};

let astronaut = null; // shared with walk.js
let site = null; // world/capital.js instance, owned by src/tenretni.js
let parked = null;
let camSnap = true;

const _yAxis = new THREE.Vector3(0, 1, 0);
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _move = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _bearingOut = { angle: 0, dist: 0, label: 'SHIP' };

export function initCapitalWalk(astronautRef) {
  astronaut = astronautRef;
}

export function capitalActive() {
  return cWalk.active;
}

// Platform-local -> world: one quaternion and two offsets, read live.
function toWorld(local, out) {
  _origin.copy(site.group.position).add(site.planet.group.position);
  return out.copy(local).applyQuaternion(site.group.quaternion).add(_origin);
}

// ---------------------------------------------------------------------------
// Enter / leave
// ---------------------------------------------------------------------------

export function enterCapitalWalk(siteRef) {
  if (!astronaut || !siteRef) return false;
  if (cWalk.active) teardown();
  site = siteRef;

  cWalk.active = true;
  cWalk.pos.copy(site.spawn);
  cWalk.vel.set(0, 0, 0);
  cWalk.vUp = 0;
  cWalk.jumpHeld = false;
  cWalk.grounded = true;
  cWalk.mode = 'idle';
  cWalk.speed01 = 0;
  cWalk.pitch = 0;
  cWalk.yaw = Math.PI; // the plaza is at -Z from the pad
  cWalk.facingYaw = cWalk.yaw;
  cWalk.camDist = 7;
  camSnap = true;

  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  toWorld(cWalk.pos, ship.position);

  parked = createParkedShip(site.group, {});
  parked.group.position.copy(site.pad);
  parked.group.position.y += C.PARK_LIFT;
  parked.group.rotation.y = Math.PI;

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
  closeDialogue();
  if (parked) {
    parked.dispose();
    parked = null;
  }
  if (site) site.setWalker(null);
  if (astronaut) astronaut.group.visible = false;
  hideViewUI();
  cWalk.active = false;
  site = null;
}

export function exitCapitalWalk() {
  teardown();
}

// ---------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------

export function stepCapitalWalk(dt) {
  cWalk.yaw -= input.mouseX * LOOK_SENS;
  cWalk.pitch -= input.mouseY * LOOK_SENS;
  cWalk.pitch = Math.min(Math.max(cWalk.pitch, -MAX_PITCH), MAX_PITCH);
  input.mouseX = 0;
  input.mouseY = 0;

  const sinY = Math.sin(cWalk.yaw);
  const cosY = Math.cos(cWalk.yaw);
  const axes = moveAxes();
  _wish.set(sinY * axes.fwd + -cosY * axes.strafe, 0, cosY * axes.fwd + sinY * axes.strafe);
  const targetSpeed = input.sprint ? C.SKY_RUN_SPEED : C.SKY_WALK_SPEED;
  if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(targetSpeed * axes.mag);
  if (isDialogueOpen()) _wish.set(0, 0, 0); // stand still while spoken to

  const accel = cWalk.grounded ? C.WALK_ACCEL_GROUND : C.WALK_ACCEL_AIR;
  _move.subVectors(_wish, cWalk.vel);
  const gap = _move.length();
  const step = accel * dt;
  if (gap > step && gap > 1e-6) cWalk.vel.addScaledVector(_move, step / gap);
  else cWalk.vel.copy(_wish);

  const px = cWalk.pos.x;
  const pz = cWalk.pos.z;
  cWalk.pos.x += cWalk.vel.x * dt;
  cWalk.pos.z += cWalk.vel.z * dt;
  pushOut();
  // the edge: no floor there, so no step. Try each axis alone before giving
  // up, which lets the walker slide along a rim instead of sticking to it.
  let gy = site.floorYAt(cWalk.pos.x, cWalk.pos.z, cWalk.pos.y);
  if (gy === -Infinity) {
    const nx = cWalk.pos.x;
    const nz = cWalk.pos.z;
    if ((gy = site.floorYAt(nx, pz, cWalk.pos.y)) > -Infinity) {
      cWalk.pos.z = pz;
      cWalk.vel.z = 0;
    } else if ((gy = site.floorYAt(px, nz, cWalk.pos.y)) > -Infinity) {
      cWalk.pos.x = px;
      cWalk.vel.x = 0;
    } else {
      cWalk.pos.x = px;
      cWalk.pos.z = pz;
      cWalk.vel.set(0, 0, 0);
      gy = site.floorYAt(px, pz, cWalk.pos.y);
      if (gy === -Infinity) gy = cWalk.pos.y;
    }
  }

  if (cWalk.vUp <= 0 && cWalk.pos.y <= gy + site.snap) {
    cWalk.pos.y = gy;
    cWalk.grounded = true;
    cWalk.vUp = 0;
    if (input.brake && !cWalk.jumpHeld && !isDialogueOpen()) {
      cWalk.vUp = C.WALK_JUMP;
      cWalk.grounded = false;
    }
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

  const hSpeed = cWalk.vel.length();
  cWalk.mode = !cWalk.grounded ? 'jump' : hSpeed > 0.6 ? 'run' : 'idle';
  cWalk.speed01 = Math.min(hSpeed / C.SKY_RUN_SPEED, 1);
  if (hSpeed > 0.4) {
    const targetYaw = Math.atan2(cWalk.vel.x, cWalk.vel.z);
    let d = targetYaw - cWalk.facingYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    cWalk.facingYaw += d * Math.min(1, FACE_TURN * dt);
  }

  toWorld(cWalk.pos, ship.position);
  ship.velocity.set(0, 0, 0);
}

// Circle colliders (the Sky City's rule: a finite `top` blocks only feet below it).
function pushOut() {
  const cs = site.colliders;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (cWalk.pos.y >= c.top - site.snap) continue;
    const dx = cWalk.pos.x - c.x;
    const dz = cWalk.pos.z - c.z;
    const r = c.r + PLAYER_RADIUS;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    const d = Math.sqrt(d2);
    if (d < 1e-5) {
      cWalk.pos.x = c.x + r;
      continue;
    }
    cWalk.pos.x = c.x + (dx / d) * r;
    cWalk.pos.z = c.z + (dz / d) * r;
  }
}

// ---------------------------------------------------------------------------
// Visuals (render rate)
// ---------------------------------------------------------------------------

export function updateCapitalVisuals(dt, t) {
  if (!cWalk.active || !astronaut) return;
  toWorld(cWalk.pos, astronaut.group.position);
  _q.setFromAxisAngle(_yAxis, cWalk.facingYaw);
  astronaut.group.quaternion.copy(site.group.quaternion).multiply(_q);
  astronaut.update(dt, cWalk.mode, cWalk.speed01);
  astronaut.group.visible = cWalk.view === 'tp';
  site.setWalker(cWalk.pos);
  if (parked) {
    _up.set(0, 1, 0).applyQuaternion(site.group.quaternion);
    parked.update(dt, t, Math.max(_up.dot(site.planet.sunDir), 0.2));
  }
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

// What E would act on right now: { kind: 'talk' | 'use', it } or null.
const _focus = { kind: null, it: null };
function focus() {
  _focus.kind = null;
  _focus.it = null;
  if (!site) return null;
  let best = Infinity;
  for (const c of site.consoles) {
    const dx = cWalk.pos.x - c.x, dz = cWalk.pos.z - c.z;
    const d2 = dx * dx + dz * dz;
    if (Math.abs(cWalk.pos.y - c.y) < 2.5 && d2 < c.r * c.r && d2 < best) {
      best = d2;
      _focus.kind = 'use';
      _focus.it = c;
    }
  }
  if (_focus.kind) return _focus;
  for (const n of site.npcs) {
    const dx = cWalk.pos.x - n.x, dz = cWalk.pos.z - n.z;
    const d2 = dx * dx + dz * dz;
    if (Math.abs(cWalk.pos.y - n.y) < 2.5 && d2 < TALK_DIST * TALK_DIST && d2 < best) {
      best = d2;
      _focus.kind = 'talk';
      _focus.it = n;
    }
  }
  return _focus.kind ? _focus : null;
}

export function capitalInteract() {
  if (!cWalk.active) return undefined;
  if (isDialogueOpen()) {
    advanceDialogue();
    return undefined;
  }
  const f = focus();
  if (!f) return undefined;
  const payload = f.kind === 'use' ? f.it.use() : f.it.talk();
  if (!payload || !payload.lines || !payload.lines.length) return undefined;
  openDialogue(payload, {
    onOffer: (offer) => (offer.kind === 'choice' ? site?.onChoice(offer.outcomeTag) ?? null : null),
  });
  return undefined;
}

export function capitalPromptText() {
  if (isDialogueOpen()) return null;
  const f = focus();
  if (f) return f.kind === 'use' ? f.it.prompt : 'E — TALK';
  return nearPad() ? 'G — BOARD' : null;
}

export function nearPad() {
  if (!site || !cWalk.grounded) return false;
  const dx = cWalk.pos.x - site.pad.x;
  const dz = cWalk.pos.z - site.pad.z;
  return dx * dx + dz * dz < C.SKY_BOARD_RADIUS * C.SKY_BOARD_RADIUS;
}

export function promptReturnToPad() {
  showViewToast('RETURN TO THE LANDING PAD TO LEAVE');
}

export function toggleCapitalView() {
  cWalk.view = toggleViewPref();
  camSnap = true;
  return cWalk.view;
}

export function padBearing() {
  if (!cWalk.active || !site) return null;
  const dx = site.pad.x - cWalk.pos.x;
  const dz = site.pad.z - cWalk.pos.z;
  const len = Math.hypot(dx, dz);
  _bearingOut.dist = len;
  _bearingOut.label = 'SHIP';
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
// Camera — worked out platform-local, then carried to world
// ---------------------------------------------------------------------------

export function updateCapitalCamera(camera, delta = 0) {
  const cosP = Math.cos(cWalk.pitch);
  _look.set(Math.sin(cWalk.yaw) * cosP, Math.sin(cWalk.pitch), Math.cos(cWalk.yaw) * cosP);
  _up.set(0, 1, 0).applyQuaternion(site.group.quaternion);

  if (cWalk.view === 'fp') {
    _desired.copy(cWalk.pos);
    _desired.y += C.WALK_EYE_HEIGHT;
    _target.copy(_desired).add(_look);
  } else {
    if (input.wheel !== 0) {
      cWalk.camDist = Math.min(Math.max(cWalk.camDist + input.wheel * 0.004, CAM_MIN), CAM_MAX);
      input.wheel = 0;
    }
    _target.copy(cWalk.pos);
    _target.y += C.WALK_TP_EYE;
    _desired.copy(_target).addScaledVector(_look, -cWalk.camDist);
    const floor = site.floorYAt(_desired.x, _desired.z, cWalk.pos.y + 0.5);
    if (floor > -Infinity && _desired.y < floor + 0.4) _desired.y = floor + 0.4;
    _desired.sub(cWalk.pos);
    if (camSnap) {
      _camOffset.copy(_desired);
      camSnap = false;
    } else {
      _camOffset.lerp(_desired, 1 - Math.exp(-CAM_SMOOTH * delta));
    }
    _desired.copy(cWalk.pos).add(_camOffset);
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
export function capitalSite() {
  if (!cWalk.active || !site) return null;
  const f = focus();
  return {
    cWalk,
    parked,
    focus: f ? f.kind : null,
    nearPad: nearPad(),
    floor: site.floorYAt(cWalk.pos.x, cWalk.pos.z, cWalk.pos.y),
    npcs: site.npcs.length,
    consoles: site.consoles.map((c) => ({ x: c.x, y: c.y, z: c.z, prompt: c.prompt })),
    place(x, y, z) {
      cWalk.pos.set(x, y, z);
      cWalk.vel.set(0, 0, 0);
      cWalk.vUp = 0;
      camSnap = true;
    },
    interact: capitalInteract,
    prompt: capitalPromptText,
  };
}
