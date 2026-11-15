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
  race, startRace, endRace, stepRace, raceHud, raceFinishedFor, raceTowedFor,
  RACE_FINISH_HOLD, RACE_SHOP_HOLD,
} from './skyRace.js';
import { playLanceCharge, playLanceFire, playDragonExplosion, skyAudioState } from '../world/skycity-audio.js';
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
  gunning: false, // seated at the Lance: the mouse aims the gun, not the walker
  gunYaw: 0, // where the barrel actually points (it slews after the aim)
  gunPitch: 0,
  charge: -1, // -1 idle, 0..1 while the coil winds up to a shot
  shake: 0, // camera shake, 0..1, decays
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
const GUN_SENS = 0.0011; // the sight is zoomed, so the mouse is geared down
const GUN_SLEW = 0.8; // rad/s: the turret is heavy and takes time to swing
const GUN_PITCH_MIN = -0.95;
const GUN_PITCH_MAX = 1.25;
const GUN_CHARGE = 0.55; // seconds from trigger to beam
const GUN_FOV = 46;
const GUN_SLACK = 4; // how far wide of the body a shot may pass and still count
let reticle = null; // the gun sight (DOM), built when you first take the seat
let triggerHeld = false;

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
  sWalk.gunning = false;
  sWalk.charge = -1;
  sWalk.shake = 0;
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
  leaveGun();
  if (reticle) {
    reticle.root.remove();
    reticle = null;
  }
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
  if (sWalk.gunning) return stepGunning(dt);
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
  // Off the ribbon is not the end: a recovery drone brings the car (and you)
  // back to the mechanics' yard, and you are handed back there on foot.
  if (raceFinishedFor() >= RACE_FINISH_HOLD || raceTowedFor() >= RACE_SHOP_HOLD) leaveRace();
  toWorld(sWalk.pos, ship.position);
  ship.velocity.set(0, 0, 0);
}

// Out of the car and back on your feet at the booth.
function leaveRace() {
  const done = race.phase === 'done';
  const towed = race.phase === 'fell';
  const place = race.place;
  const field = race.cars.length;
  const rival = race.rival;
  const engine = race.engineWon;
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
    showViewToast(place === 1
      ? `YOU BEAT ${rival} — THE MECHANICS FIT A ${engine} ENGINE. CHECK THE POSTER`
      : `${['', '1ST', '2ND', '3RD', '4TH', '5TH'][place]} OF ${field} — ${rival} IS STILL ON THE POSTER`, 8);
  } else if (towed) {
    showViewToast('TOWED IN — YOUR CAR IS IN THE SHOP. CHECK IN AGAIN WHEN YOU ARE READY', 7);
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

function gunDir(out) {
  const cosP = Math.cos(sWalk.gunPitch);
  return out.set(Math.sin(sWalk.gunYaw) * cosP, Math.sin(sWalk.gunPitch), Math.cos(sWalk.gunYaw) * cosP);
}

// The bore: where the barrel's axis starts, and its direction.
function bore(origin, dir) {
  gunDir(dir);
  origin.copy(city.lance.turret.position);
  origin.y += 1.4;
  origin.addScaledVector(dir, 13);
}

// Take the seat. From here the mouse aims the gun, and G steps back out.
function manGun() {
  sWalk.gunning = true;
  sWalk.vel.set(0, 0, 0);
  // start the aim where the barrel already points, so nothing jumps
  sWalk.yaw = sWalk.gunYaw;
  sWalk.pitch = sWalk.gunPitch;
  sWalk.charge = -1;
  triggerHeld = true; // the E that sat you down is not also a shot
  if (!reticle) reticle = buildReticle();
  reticle.root.style.display = 'block';
  showViewToast('THE LANCE — MOUSE AIMS · CLICK, SPACE OR E FIRES · G STEPS BACK', 7);
}

function leaveGun() {
  if (!sWalk.gunning) return;
  sWalk.gunning = false;
  sWalk.charge = -1;
  if (reticle) reticle.root.style.display = 'none';
  camSnap = true;
}

function stepGunning(dt) {
  // the aim point follows the mouse at once; the gun follows the aim, slowly
  sWalk.yaw -= input.mouseX * GUN_SENS;
  sWalk.pitch = Math.min(Math.max(sWalk.pitch - input.mouseY * GUN_SENS, GUN_PITCH_MIN), GUN_PITCH_MAX);
  input.mouseX = 0;
  input.mouseY = 0;
  let dy = sWalk.yaw - sWalk.gunYaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  const step = GUN_SLEW * dt;
  sWalk.gunYaw += Math.max(Math.min(dy, step), -step);
  const dp = sWalk.pitch - sWalk.gunPitch;
  sWalk.gunPitch += Math.max(Math.min(dp, step), -step);

  const trigger = (input.fire && input.locked) || input.fireTouch || input.brake;
  if (trigger && !triggerHeld) pullTrigger();
  triggerHeld = trigger;

  if (sWalk.charge >= 0) {
    sWalk.charge += dt / GUN_CHARGE;
    sWalk.shake = Math.max(sWalk.shake, sWalk.charge * 0.12); // the mount hums as it winds up
    if (sWalk.charge >= 1) {
      sWalk.charge = -1;
      bore(_muzzle, _look);
      fireLance(_muzzle, _look, GUN_SLACK);
    }
  }
  toWorld(sWalk.pos, ship.position);
  ship.velocity.set(0, 0, 0);
}

// Start winding the coil, if the gun is ready. The shot goes where the barrel
// points when the charge completes, so you keep tracking through it.
function pullTrigger() {
  if (!sWalk.gunning || sWalk.charge >= 0 || sWalk.lanceCool > 0) return false;
  sWalk.charge = 0;
  playLanceCharge(GUN_CHARGE);
  return true;
}

// The beam itself, from `origin` along unit `dir` (city-local).
function fireLance(origin, dir, slack) {
  if (!city) return false;
  if (!origin) {
    // debug / headless: fire along the walker's look, with the old generous aim
    lookDir(_look);
    _muzzle.copy(city.lance.turret.position);
    _muzzle.y += 1.4;
    origin = _muzzle;
    dir = _look;
  }
  sWalk.lanceCool = LANCE_COOLDOWN;
  sWalk.shake = Math.max(sWalk.shake, 0.55); // recoil
  playLanceFire();
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
  beam.position.copy(origin);
  beam.quaternion.setFromUnitVectors(_zAxis, dir);
  beam.visible = true;
  beamT = 0;
  if (city.dragon.hitTest(origin, dir, slack)) {
    city.dragon.explode();
    playDragonExplosion(16, 0.07); // one pop per body segment, in step with the fireballs
    sWalk.shake = 1;
    if (reticle) reticle.flash = 1;
    showViewToast('DIRECT HIT — THE DRAGON IS DOWN', 6);
  } else if (city.dragon.alive) {
    showViewToast('MISSED — KEEP THE SIGHT ON IT THROUGH THE CHARGE');
  } else if (!city.dragon.dying) {
    showViewToast('NO DRAGON IN THE SKY — YET');
  }
  return true;
}

// The gun sight: a ring with ticks, a status line, and a full-screen wash for
// the moment a shot connects. Plain DOM, centred, never takes the pointer.
function buildReticle() {
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;display:none;font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;';
  root.innerHTML = `
    <div data-flash style="position:absolute;inset:0;background:#fff3d6;opacity:0"></div>
    <svg data-ring viewBox="-60 -60 120 120" width="150" height="150"
         style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)" fill="none" stroke-width="1.6">
      <circle r="34" stroke-dasharray="40 13.4"/>
      <circle data-charge r="24" stroke-width="3" stroke-dasharray="0 151" transform="rotate(-90)"/>
      <path d="M0-58V-40M0 58V40M-58 0H-40M58 0H40M0-7V7M-7 0H7"/>
    </svg>
    <div data-aim style="position:absolute;width:10px;height:10px;margin:-5px;border:1.5px solid;border-radius:50%;opacity:.8"></div>
    <div data-text style="position:absolute;left:0;right:0;top:calc(50% + 92px);text-align:center"></div>`;
  document.body.appendChild(root);
  return {
    root,
    ring: root.querySelector('[data-ring]'),
    charge: root.querySelector('[data-charge]'),
    aim: root.querySelector('[data-aim]'),
    text: root.querySelector('[data-text]'),
    flashEl: root.querySelector('[data-flash]'),
    flash: 0,
    last: '',
  };
}

function updateReticle(dt) {
  const r = reticle;
  bore(_muzzle, _look);
  const locked = city.dragon.hitTest(_muzzle, _look, GUN_SLACK);
  const state = sWalk.charge >= 0 ? 'CHARGING'
    : sWalk.lanceCool > 0 ? 'RECHARGING'
      : locked ? 'LOCKED — FIRE'
        : city.dragon.alive ? 'TRACKING' : city.dragon.dying ? 'TARGET DESTROYED' : 'SKY CLEAR — WATCH FOR THE DRAGON';
  const colour = locked ? '#ff5a3a' : sWalk.lanceCool > 0 ? '#8a94a0' : '#7fe8ff';
  if (state + colour !== r.last) {
    r.last = state + colour;
    r.text.textContent = state;
    r.root.style.color = colour;
    r.ring.setAttribute('stroke', colour);
    r.aim.style.borderColor = colour;
  }
  const c = Math.max(sWalk.charge, 0);
  r.charge.setAttribute('stroke-dasharray', `${(c * 151).toFixed(1)} 151`);
  // the small pip is where you are asking the gun to point; the ring is where it is
  let dy = sWalk.yaw - sWalk.gunYaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  const pxPerRad = window.innerHeight / ((GUN_FOV * Math.PI) / 180);
  const ax = Math.max(Math.min(-dy * pxPerRad, window.innerWidth * 0.45), -window.innerWidth * 0.45);
  const ay = Math.max(Math.min(-(sWalk.pitch - sWalk.gunPitch) * pxPerRad, window.innerHeight * 0.45), -window.innerHeight * 0.45);
  r.aim.style.left = `calc(50% + ${ax.toFixed(1)}px)`;
  r.aim.style.top = `calc(50% + ${ay.toFixed(1)}px)`;
  if (r.flash > 0) {
    r.flash = Math.max(r.flash - dt * 3.2, 0);
    r.flashEl.style.opacity = (r.flash * r.flash * 0.55).toFixed(3);
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
  astronaut.group.visible = sWalk.view === 'tp' && !race.active;
  if (crowd) crowd.update(dt, sWalk.pos, 0.8);
  astronaut.group.visible = astronaut.group.visible && !sWalk.gunning;
  // the Lance: barrel on its slewed heading, coil swelling as it charges
  city.lance.turret.rotation.y = sWalk.gunYaw;
  city.lance.barrelPivot.rotation.x = -sWalk.gunPitch;
  const coil = city.lance.barrelPivot.children[1];
  const hot = Math.max(sWalk.charge, 0);
  coil.scale.setScalar(1 + hot * 1.3 + (hot > 0 ? 0.12 * Math.sin(t * 60) : 0));
  coil.material.color.setRGB(1 + hot * 5, 0.25 + hot * 3, 0.19 + hot * 1.5);
  sWalk.shake = Math.max(sWalk.shake - dt * 0.9, 0);
  if (sWalk.gunning && reticle) updateReticle(dt);
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
  if (sWalk.gunning) return 'fire';
  if (sWalk.inRoom) {
    if (near(city.lance.top, 2.2)) return 'down';
    return near(city.lance.room, 4.2) ? 'man' : null;
  }
  if (near(city.lance.bottom, 3)) return 'up';
  if (near(city.booth, 3.4)) return 'race';
  if (crowd && sWalk.pos.y < 2 && crowd.nearestInteractable(sWalk.pos, TALK_DIST)) return 'talk';
  return null;
}

export function skyInteract() {
  if (isDialogueOpen()) return advanceDialogue();
  const f = focus();
  if (f === 'fire') return pullTrigger();
  if (f === 'man') return manGun();
  if (f === 'up' || f === 'down') {
    const to = f === 'up' ? city.lance.top : city.lance.bottom;
    sWalk.inRoom = f === 'up';
    sWalk.pos.copy(to);
    sWalk.vel.set(0, 0, 0);
    sWalk.vUp = 0;
    camSnap = true;
    if (f === 'up') {
      showViewToast('THE LANCE GALLERY — TAKE THE CONSOLE IN THE MIDDLE', 6);
    } else {
      city.lance.barrelPivot.rotation.x = 0;
    }
    return undefined;
  }
  if (f === 'race') {
    startRace(city);
    camSnap = true;
    showViewToast(`RIM CIRCUIT VS ${race.rival} — 3 LAPS · TWO JUMPS: KEEP YOUR SPEED UP · NO BARRIERS`, 8);
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
    case 'fire': return null; // the sight has its own status line
    case 'man': return 'E — MAN THE LANCE';
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
  if (sWalk.gunning) return leaveGun();
  if (race.active) {
    leaveRace();
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

  let fov = C.FOV;
  if (sWalk.gunning) {
    // the gun sight: just above and behind the breech, looking down the bore
    gunDir(_look);
    _desired.copy(city.lance.turret.position);
    _desired.y += 3.4;
    _desired.addScaledVector(_look, -7.5);
    _target.copy(city.lance.turret.position).addScaledVector(_look, 400);
    _target.y += 1.4;
    fov = GUN_FOV;
  } else if (race.active) {
    // chase camera: low behind the car, looking down the road
    const sy = Math.sin(sWalk.yaw), cy = Math.cos(sWalk.yaw);
    _target.set(sWalk.pos.x + sy * 7, sWalk.pos.y + 1.4, sWalk.pos.z + cy * 7);
    if (race.phase === 'fell') {
      // the rescue: stand off to the side and a little above, watching the
      // car, the wire and the drone against the city
      _target.copy(sWalk.pos);
      _target.y += 3.5;
      const out = Math.hypot(sWalk.pos.x, sWalk.pos.z) || 1;
      _desired.set(sWalk.pos.x / out * 19, 8, sWalk.pos.z / out * 19);
      _camOffset.lerp(_desired, 1 - Math.exp(-2.5 * delta));
      _desired.copy(sWalk.pos).add(_camOffset);
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
  if (sWalk.shake > 0) {
    const k = sWalk.shake * sWalk.shake * 1.6;
    const n = performance.now();
    camera.position.x += Math.sin(n * 0.093) * k;
    camera.position.y += Math.sin(n * 0.127 + 2.1) * k;
    camera.position.z += Math.sin(n * 0.071 + 4.4) * k;
  }
  if (camera.fov !== fov) {
    camera.fov = fov;
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
    pullTrigger,
    audio: skyAudioState(),
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
