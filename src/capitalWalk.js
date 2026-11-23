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
//   platform.setWalker(localPos | null, walker)   so the figures can watch the player
//                        (walker: the live { pos, yaw, pitch }, for a carried light)
//   platform.gun         { pivot, targets(), onHit(id) } on a warship: a console
//                        with `gun: true` seats the walker at it (src/turretGun.js)
//
// and, optionally (the far side's landing and the City of Light, src/farside.js):
//
//   platform.noShip      nothing is parked here and nothing is boarded: a place
//                        reached on foot, left by platform.exit { x, z }
//   platform.leaveHint   what G says there instead of "return to the pad"
//   platform.mark()      { x, z, label } for the compass to point at instead of the way out, or null
//   platform.onEnter() / onLeave()   the walker has arrived / is gone, however
//                        it left (a door, the menu, a world reset)
//   platform.tick(dt, t) every rendered frame while walked, isolated or not
//   platform.speed       a multiple of the usual walking and running pace
//   platform.held()      true while the place is showing the walker something:
//                        they stand still and nothing can be used
//   platform.camera(pos, target) -> true if the place has taken the camera
//                        (writes both, platform-local; src/chapter.js scenes)
//   platform.resolveWalls(pos, r)   push the walker out of the platform's own
//                        box walls (the circle colliders are not enough for a hull)
//   console.off()        true while a console is not there to be used
//   platform.act()       E, while the place is holding the walker (leave a race);
//                        a dialogue payload it returns is opened
//   platform.pilotPose()  { x, z, yaw, mode } while the place has sat the pilot
//                        somewhere (a seat, a chair at a table): the figure is
//                        shown there in that pose whatever the view, or null
//   platform.heldPrompt()  what the prompt line says then
//
// walk.js dispatches its public surface here whenever capitalActive().

import * as THREE from 'three';
import { C } from './constants.js';
import { input, moveAxes } from './input.js';
import { ship } from './ship.js';
import { createShip as createParkedShip } from '../world/ship.js';
import { openDialogue, advanceDialogue, isDialogueOpen, closeDialogue } from './dialogue.js';
import { cineHeld, cineCamera } from './cineTalk.js';
import { gun, enterGun, leaveGun, stepGun, pullTrigger, updateGunVisuals, gunCamera } from './turretGun.js';
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
const _pp = new THREE.Vector3();
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

// `opts`: { spawn: Vector3 (platform-local), yaw, quiet } — arriving somewhere
// other than off the ship (through a door), with no view prompt.
export function enterCapitalWalk(siteRef, opts = {}) {
  if (!astronaut || !siteRef) return false;
  if (cWalk.active) teardown();
  site = siteRef;

  cWalk.active = true;
  cWalk.pos.copy(opts.spawn || site.spawn);
  cWalk.vel.set(0, 0, 0);
  cWalk.vUp = 0;
  cWalk.jumpHeld = false;
  cWalk.grounded = true;
  cWalk.mode = 'idle';
  cWalk.speed01 = 0;
  cWalk.pitch = 0;
  cWalk.yaw = opts.yaw ?? Math.PI; // the plaza is at -Z from the pad
  cWalk.facingYaw = cWalk.yaw;
  cWalk.camDist = 7;
  camSnap = true;

  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  toWorld(cWalk.pos, ship.position);

  if (!site.noShip) {
    parked = createParkedShip(site.group, {});
    parked.group.position.copy(site.pad);
    parked.group.position.y += C.PARK_LIFT;
    parked.group.rotation.y = Math.PI;
  }
  if (site.onEnter) site.onEnter();

  const pref = getViewPref();
  if (pref) {
    cWalk.view = pref;
    if (!opts.quiet) showViewToast('T — TOGGLE VIEW');
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
  leaveGun();
  closeDialogue();
  if (parked) {
    parked.dispose();
    parked = null;
  }
  if (site) {
    site.setWalker(null);
    if (site.onLeave) site.onLeave();
  }
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
  if (gun.active) {
    // seated at the lance: the mouse is the gun's, the walker stays put
    stepGun(dt, toWorld);
    toWorld(cWalk.pos, ship.position);
    ship.velocity.set(0, 0, 0);
    return;
  }
  if (cineHeld()) input.mouseX = input.mouseY = 0; // a scene has the camera
  cWalk.yaw -= input.mouseX * LOOK_SENS;
  cWalk.pitch -= input.mouseY * LOOK_SENS;
  cWalk.pitch = Math.min(Math.max(cWalk.pitch, -MAX_PITCH), MAX_PITCH);
  input.mouseX = 0;
  input.mouseY = 0;

  const sinY = Math.sin(cWalk.yaw);
  const cosY = Math.cos(cWalk.yaw);
  const axes = moveAxes();
  _wish.set(sinY * axes.fwd + -cosY * axes.strafe, 0, cosY * axes.fwd + sinY * axes.strafe);
  const targetSpeed = (input.sprint ? C.SKY_RUN_SPEED : C.SKY_WALK_SPEED) * (site.speed || 1);
  if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(targetSpeed * axes.mag);
  if (isDialogueOpen() || (site.held && site.held())) _wish.set(0, 0, 0); // stand still while spoken to, or shown something

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
  // a platform with box walls of its own (the wreck's bulkheads)
  if (site.resolveWalls) site.resolveWalls(cWalk.pos, PLAYER_RADIUS);
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
  // (a place that has sat the pilot down shows them there, seated, whatever the view)
  const pp = site.pilotPose ? site.pilotPose() : null;
  if (pp) {
    _pp.set(pp.x, pp.y ?? cWalk.pos.y, pp.z);
    toWorld(_pp, astronaut.group.position);
    _q.setFromAxisAngle(_yAxis, pp.yaw);
  } else {
    toWorld(cWalk.pos, astronaut.group.position);
    _q.setFromAxisAngle(_yAxis, cWalk.facingYaw);
  }
  astronaut.group.quaternion.copy(site.group.quaternion).multiply(_q);
  astronaut.update(dt, pp ? pp.mode || 'lift' : cWalk.mode, pp ? 0 : cWalk.speed01);
  astronaut.group.visible = pp ? true : cWalk.view === 'tp' && !gun.active && !site.hidePilot; // (hidePilot: seated out of sight, at a vehicle's controls)
  updateGunVisuals(dt, toWorld);
  site.setWalker(cWalk.pos, cWalk);
  if (site.tick) site.tick(dt, t);
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
  if (site.held && site.held()) return null;
  for (const c of site.consoles) {
    if (c.off && c.off()) continue;
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
  if (gun.active) {
    pullTrigger();
    return undefined;
  }
  if (isDialogueOpen()) {
    advanceDialogue();
    return undefined;
  }
  if (site.held && site.held()) {
    const p = site.act ? site.act() : null;
    if (p && p.lines && p.lines.length) {
      openDialogue(p, { onOffer: (offer) => (offer.kind === 'choice' ? site?.onChoice(offer.outcomeTag) ?? null : null) });
    }
    return undefined;
  }
  const f = focus();
  if (!f) return undefined;
  if (f.kind === 'use' && f.it.gun && site.gun) {
    enterGun(site, f.it.gunYaw || 0);
    return undefined;
  }
  const payload = f.kind === 'use' ? f.it.use() : f.it.talk();
  if (!payload || !payload.lines || !payload.lines.length) return undefined;
  talkAt = f.kind === 'talk' ? f.it : null; // who the cinematic camera frames
  openDialogue(payload, {
    onOffer: (offer) => (offer.kind === 'choice' ? site?.onChoice(offer.outcomeTag) ?? null : null),
    onClose: () => { talkAt = null; },
  });
  return undefined;
}

export function capitalPromptText() {
  if (gun.active) return 'G — STAND DOWN';
  if (isDialogueOpen()) return null;
  if (site.held && site.held()) return site.heldPrompt ? site.heldPrompt() : null;
  const f = focus();
  if (f) return f.kind === 'use' ? f.it.prompt : 'E — TALK';
  return nearPad() ? 'G — BOARD' : null;
}

export function nearPad() {
  if (!site || site.noShip || !cWalk.grounded || gun.active) return false;
  const dx = cWalk.pos.x - site.pad.x;
  const dz = cWalk.pos.z - site.pad.z;
  return dx * dx + dz * dz < C.SKY_BOARD_RADIUS * C.SKY_BOARD_RADIUS;
}

export function promptReturnToPad() {
  if (gun.active) return leaveGun();
  showViewToast(site?.leaveHint || 'RETURN TO THE LANDING PAD TO LEAVE');
}

export function toggleCapitalView() {
  cWalk.view = toggleViewPref();
  camSnap = true;
  return cWalk.view;
}

export function padBearing() {
  if (!cWalk.active || !site) return null;
  // (where there is no ship, the compass points at the way out)
  // (...unless the place has somewhere it wants found: { x, z, label })
  const mark = site.mark ? site.mark() : null;
  const to = mark || (site.noShip ? site.exit : site.pad);
  const dx = to.x - cWalk.pos.x;
  const dz = to.z - cWalk.pos.z;
  const len = Math.hypot(dx, dz);
  _bearingOut.dist = len;
  _bearingOut.label = mark ? mark.label : site.noShip ? 'DOOR' : 'SHIP';
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

let talkAt = null; // the npc being spoken to, while a dialogue is open
const _cineP = new THREE.Vector3();
const _cineS = new THREE.Vector3();

export function updateCapitalCamera(camera, delta = 0) {
  const cosP = Math.cos(cWalk.pitch);
  _look.set(Math.sin(cWalk.yaw) * cosP, Math.sin(cWalk.pitch), Math.cos(cWalk.yaw) * cosP);
  _up.set(0, 1, 0).applyQuaternion(site.group.quaternion);
  if (gun.active) {
    gunCamera(camera, toWorld, _up);
    camSnap = true;
    return;
  }
  // a cinematic talk frames whoever is speaking (cineTalk.js)
  if (cineHeld() && talkAt && site) {
    toWorld(cWalk.pos, _cineP);
    toWorld(_cineS.set(talkAt.x, talkAt.y ?? cWalk.pos.y, talkAt.z), _cineS);
    // deck figures (robots, fleet captains) stand taller than a citizen
    if (cineCamera(camera, _cineP, _cineS, _up, delta, talkAt.h ?? 2.7)) {
      camSnap = true;
      return;
    }
  }
  // the place has the camera (a scene being shown): take its word for it
  if (site.camera && site.camera(_desired, _target)) {
    toWorld(_desired, camera.position);
    toWorld(_target, _target);
    camera.up.copy(_up);
    camera.lookAt(_target);
    camSnap = true;
    return;
  }

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
    // Indoors (a site with `rooms`): the boom shortens until the camera is
    // under the same roof as the walker, or in the next room through a door.
    if (site.rooms && roomAt(cWalk.pos.x, cWalk.pos.z, cWalk.pos.y + 0.5, 0)) {
      let d = cWalk.camDist;
      while (d > 0.6 && !roomAt(_desired.x, _desired.z, _desired.y, 0.35)) {
        d -= 0.4;
        _desired.copy(_target).addScaledVector(_look, -d);
      }
    }
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

// The roofed room (site.rooms) holding a platform-local point, `m` inside its
// walls and ceiling; null in the open.
function roomAt(x, z, y, m) {
  const rs = site.rooms;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    if (x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m && y < r.ceil - m) return r;
  }
  return null;
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
    rooms: site.rooms || null,
    places: site.places || null,
    place(x, y, z) {
      cWalk.pos.set(x, y, z);
      cWalk.vel.set(0, 0, 0);
      cWalk.vUp = 0;
      camSnap = true;
    },
    interact: capitalInteract,
    gun,
    prompt: capitalPromptText,
  };
}
