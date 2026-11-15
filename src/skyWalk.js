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
import { createCrowd } from '../world/aliens.js';
import { openDialogue, advanceDialogue, isDialogueOpen, closeDialogue } from './dialogue.js';
import {
  race, startRace, endRace, stepRace, raceHud, raceFinishedFor,
  RACE_FINISH_HOLD, RACE_FALL_DEPTH,
} from './skyRace.js';
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
  inRoom: false, // up in the Lance Tower's gallery (held inside its rail)
  lanceCool: 0, // seconds until the Lance can fire again
};

let astronaut = null; // shared with walk.js
let city = null; // world/skycity.js instance (owned by game.js, never disposed here)
let parked = null;
let camSnap = true;
let crowd = null; // the inhabitants (world/aliens.js), built on arrival
let beam = null; // the Lance's shot, a short-lived mesh in the city group
let beamT = -1;
const TALK_DIST = 2.8;
const LANCE_COOLDOWN = 2.0;
const BEAM_TIME = 0.75;
const BEAM_LENGTH = 3200;

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
const _muzzle = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);

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
  sWalk.inRoom = false;
  sWalk.lanceCool = 0;
  camSnap = true;

  // The people who live here. They keep to the main deck: gardens, the inner
  // ring road, the rim and the pad pier are their haunts.
  const haunts = [{ x: 0, z: 186 }];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    haunts.push({ x: Math.cos(a) * 114, z: Math.sin(a) * 114 });
    haunts.push({ x: Math.cos(a) * 161, z: Math.sin(a) * 161 });
    haunts.push({ x: Math.cos(a - Math.PI / 8) * 66, z: Math.sin(a - Math.PI / 8) * 66 });
  }
  crowd = createCrowd(
    {
      groundHeightAt: () => 0,
      plazaCenters: haunts,
      colliders: city.colliders.filter((c) => c.bottom === undefined).map((c) => ({ x: c.x, z: c.z, radius: c.r })),
      cityId: 'skycity',
    },
    { population: 44, maxRigs: 18, questChance: 0, seed: 7341 }
  );
  city.group.add(crowd.group);

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
  closeDialogue();
  endRace();
  if (crowd) {
    crowd.group.removeFromParent();
    crowd.dispose();
    crowd = null;
  }
  if (beam) {
    beam.removeFromParent();
    beam.geometry.dispose();
    beam.material.dispose();
    beam = null;
    beamT = -1;
  }
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
  if (race.active) return stepDriving(dt);
  sWalk.lanceCool = Math.max(sWalk.lanceCool - dt, 0);
  // Left mouse (or the touch FIRE button) fires the Lance from the gallery.
  if (sWalk.inRoom && ((input.fire && input.locked) || input.fireTouch)) fireLance();
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
  if (sWalk.inRoom) {
    // the gallery's rail: open to the view, closed to the feet
    const room = city.lance.room;
    const dx = sWalk.pos.x - room.x, dz = sWalk.pos.z - room.z;
    const d = Math.hypot(dx, dz);
    if (d > room.r) {
      sWalk.pos.x = room.x + (dx / d) * room.r;
      sWalk.pos.z = room.z + (dz / d) * room.r;
    }
  }

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
    if (c.bottom !== undefined && sWalk.pos.y < c.bottom) continue;
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
// Driving (src/skyRace.js): the walker rides the player's car
// ---------------------------------------------------------------------------

function stepDriving(dt) {
  input.mouseX = 0;
  input.mouseY = 0;
  stepRace(dt);
  const me = race.cars[0];
  sWalk.pos.set(me.x, me.y, me.z);
  sWalk.yaw = me.heading;
  sWalk.facingYaw = me.heading;
  sWalk.grounded = !me.out;
  sWalk.mode = 'idle';
  // Off the ribbon is off the city: the same fall, the same ending.
  if (me.out && !sWalk.falling && me.y < city.track.y - RACE_FALL_DEPTH) {
    sWalk.falling = true;
    sWalk.fallT = 0;
  }
  if (sWalk.falling) sWalk.fallT += dt;
  if (raceFinishedFor() >= RACE_FINISH_HOLD) leaveRace();
  toWorld(sWalk.pos, ship.position);
  ship.velocity.set(0, 0, 0);
}

// Out of the car and back on your feet at the booth.
function leaveRace() {
  const done = race.phase === 'done';
  const place = race.place;
  const field = race.cars.length;
  endRace();
  sWalk.pos.copy(city.booth);
  sWalk.vel.set(0, 0, 0);
  sWalk.vUp = 0;
  sWalk.grounded = true;
  sWalk.yaw = Math.atan2(-city.booth.x, -city.booth.z); // face the city
  sWalk.facingYaw = sWalk.yaw;
  sWalk.pitch = 0;
  camSnap = true;
  if (done) {
    showViewToast(place === 1 ? 'YOU WON THE RIM CIRCUIT' : `YOU FINISHED ${['', '1ST', '2ND', '3RD', '4TH', '5TH'][place]} OF ${field}`, 6);
  } else {
    showViewToast('RACE ABANDONED');
  }
}

// ---------------------------------------------------------------------------
// The Lance
// ---------------------------------------------------------------------------

function lookDir(out) {
  const cosP = Math.cos(sWalk.pitch);
  return out.set(Math.sin(sWalk.yaw) * cosP, Math.sin(sWalk.pitch), Math.cos(sWalk.yaw) * cosP);
}

function fireLance() {
  if (sWalk.lanceCool > 0 || !city) return false;
  sWalk.lanceCool = LANCE_COOLDOWN;
  lookDir(_look);
  _muzzle.copy(city.lance.turret.position);
  _muzzle.y += 1.4;
  _muzzle.addScaledVector(_look, 13);
  if (!beam) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    g.rotateX(Math.PI / 2); // along +Z
    g.translate(0, 0, 0.5); // from the muzzle forward
    const m = new THREE.MeshBasicMaterial({
      color: 0xff3a20, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    m.color.multiplyScalar(4);
    beam = new THREE.Mesh(g, m);
    beam.frustumCulled = false;
    const core = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    core.material.color.multiplyScalar(4);
    core.scale.set(0.35, 0.35, 1);
    core.frustumCulled = false;
    beam.add(core);
    city.group.add(beam);
  }
  beam.position.copy(_muzzle);
  beam.quaternion.setFromUnitVectors(_zAxis, _look);
  beam.visible = true;
  beamT = 0;
  if (city.dragon.hitTest(_muzzle, _look)) {
    city.dragon.explode();
    showViewToast('DIRECT HIT — THE DRAGON IS DOWN', 6);
  } else if (!city.dragon.alive) {
    showViewToast('NO DRAGON IN THE SKY — YET');
  }
  return true;
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
  astronaut.group.visible = sWalk.view === 'tp' && !race.active;
  if (crowd) crowd.update(dt, sWalk.pos, 0.8);
  // the Lance swings to wherever you are looking, while you are up there
  if (sWalk.inRoom) {
    city.lance.turret.rotation.y = sWalk.yaw;
    city.lance.barrelPivot.rotation.x = -sWalk.pitch;
  }
  if (beamT >= 0) {
    beamT += dt;
    const k = Math.min(beamT / BEAM_TIME, 1);
    const w = (1 - k) * (5 + 2 * Math.sin(beamT * 90));
    beam.scale.set(w, w, BEAM_LENGTH);
    beam.material.opacity = 1 - k * k;
    beam.children[0].material.opacity = 1 - k;
    if (k >= 1) {
      beam.visible = false;
      beamT = -1;
    }
  }
  if (parked) {
    _up.set(0, 1, 0).applyQuaternion(city.group.quaternion);
    parked.update(dt, t, Math.max(_up.dot(city.planet.sunDir), 0.2));
  }
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

const near = (spot, r) => {
  const dx = sWalk.pos.x - spot.x, dz = sWalk.pos.z - spot.z;
  return Math.abs(sWalk.pos.y - spot.y) < 2 && dx * dx + dz * dz < r * r;
};

// What E would do right now, or null.
function focus() {
  if (!city || sWalk.falling || race.active) return null;
  if (sWalk.inRoom) return near(city.lance.top, 2.2) ? 'down' : 'fire';
  if (near(city.lance.bottom, 3)) return 'up';
  if (near(city.booth, 3.4)) return 'race';
  if (crowd && sWalk.pos.y < 2 && crowd.nearestInteractable(sWalk.pos, TALK_DIST)) return 'talk';
  return null;
}

export function skyInteract() {
  if (isDialogueOpen()) return advanceDialogue();
  const f = focus();
  if (f === 'fire') return fireLance();
  if (f === 'up' || f === 'down') {
    const to = f === 'up' ? city.lance.top : city.lance.bottom;
    sWalk.inRoom = f === 'up';
    sWalk.pos.copy(to);
    sWalk.vel.set(0, 0, 0);
    sWalk.vUp = 0;
    camSnap = true;
    if (f === 'up') {
      showViewToast('THE LANCE GALLERY — AIM AND PRESS E OR CLICK TO FIRE', 6);
    } else {
      city.lance.barrelPivot.rotation.x = 0;
    }
    return undefined;
  }
  if (f === 'race') {
    startRace(city);
    camSnap = true;
    showViewToast('RIM CIRCUIT — 3 LAPS · W/S THROTTLE · A/D STEER · NO BARRIERS', 7);
    return undefined;
  }
  if (f === 'talk') {
    const who = crowd.nearestInteractable(sWalk.pos, TALK_DIST);
    const payload = crowd.interact(who);
    if (!payload || !payload.lines || !payload.lines.length) {
      crowd.endInteract(who);
      return undefined;
    }
    const mine = crowd;
    openDialogue({ ...payload, offer: undefined }, {
      onClose: () => mine.endInteract(who),
    });
  }
  return undefined;
}

export function skyPromptText() {
  if (race.active) return raceHud();
  if (sWalk.falling || isDialogueOpen()) return null;
  switch (focus()) {
    case 'fire': return sWalk.lanceCool > 0 ? 'THE LANCE IS RECHARGING' : 'E — FIRE THE LANCE';
    case 'down': return 'E — RIDE THE LIFT DOWN';
    case 'up': return 'E — RIDE THE LIFT TO THE LANCE';
    case 'race': return 'E — CHECK IN TO THE RACE';
    case 'talk': return 'E — TALK';
    default: return nearPad() ? 'G — BOARD' : null;
  }
}

export function nearPad() {
  if (!city || sWalk.falling || !sWalk.grounded || race.active) return false;
  const dx = sWalk.pos.x - city.pad.x;
  const dz = sWalk.pos.z - city.pad.z;
  return dx * dx + dz * dz < C.SKY_BOARD_RADIUS * C.SKY_BOARD_RADIUS;
}

// G pressed away from the pad. In a car, that is how you quit the race.
export function promptReturnToPad() {
  if (race.active) {
    if (race.phase !== 'fell') leaveRace();
    return;
  }
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

  if (race.active) {
    // chase camera: low behind the car, looking down the road
    const sy = Math.sin(sWalk.yaw), cy = Math.cos(sWalk.yaw);
    _target.set(sWalk.pos.x + sy * 7, sWalk.pos.y + 1.4, sWalk.pos.z + cy * 7);
    if (sWalk.falling || race.phase === 'fell') {
      _desired.copy(_camFrozen);
      _target.copy(sWalk.pos);
    } else {
      _desired.set(sWalk.pos.x - sy * 11, sWalk.pos.y + 4.4, sWalk.pos.z - cy * 11).sub(sWalk.pos);
      if (camSnap) {
        _camOffset.copy(_desired);
        camSnap = false;
      } else {
        _camOffset.lerp(_desired, 1 - Math.exp(-5 * delta));
      }
      _desired.copy(sWalk.pos).add(_camOffset);
      _camFrozen.copy(_desired);
    }
  } else if (sWalk.view === 'fp') {
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
    crowd,
    race,
    focus: focus(),
    fireLance,
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
