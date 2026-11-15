// On-foot mine mode — the Emberdeep under Redline Claim (world/embermine.js).
//
// A flat walker, like cottageWalk.js, but NESTED inside a planet walk rather
// than replacing it: the player rides the cage down from rustia's town, walks
// the mine and its cathedral, and rides back up to exactly where they left.
// walk.js stays `walk.active` throughout with the town built and merely
// hidden — its own step/visual functions are not called while we hold the
// floor, so the surface (and its warzone) is frozen in place until we return.
//
// walk.js reaches this through ONE generic hook rather than a guard pair per
// export: `enterMine()` returns a sub-walker object (`step`, `visuals`,
// `camera`, `interact`, ...) and walk.js forwards to whichever sub-walker is
// active. A future nested interior registers the same way.
//
// FRAME. The mine never teleports the player: its group is parked so that the
// cage's top landing coincides with where the player was standing, and
// ship.position (which the rest of the game treats as "where the player is")
// is rewritten from the walker every tick. The planet is hidden, so where the
// mine sits relative to it does not matter. A floating-origin rebase can
// still fire under us (ship.position is zeroed by updateOrigin); `sync()`
// spots the jump and moves the mine group by the same amount.
//
// RENDER STATE. The surface's sky module owns scene.fog / scene.environment
// and rewrites exposure every frame; we stash those, put up our own (dark fog,
// no environment, a bloom threshold low enough for the ore to carry the
// lighting) and hand them back on the way out. On an ABORT — a reset or the
// menu tearing the whole walk down while we are underground — isolate.js has
// already restored the renderer for flight, so only the scene state is undone.

import * as THREE from 'three';
import { C } from './constants.js';
import { input, moveAxes } from './input.js';
import { ship } from './ship.js';
import { createEmberMine } from '../world/embermine.js';
import { getViewPref, showViewToast, toggleViewPref } from './walkview.js';
import { openDialogue, advanceDialogue, isDialogueOpen, closeDialogue } from './dialogue.js';
import { grantCargo, hasCargo, hasUpgrade, takeCargo, grantUpgrade } from './inventory.js';
import { questStage, setQuestStage } from './journal.js';

const LOOK_SENS = 0.0022;
const MAX_PITCH = 1.483;
const FACE_TURN = 12.0;
const CAM_SMOOTH = 9.0;
const PLAYER_RADIUS = 0.38;
const CAM_MIN = 2.0;
const CAM_MAX = 8;
const GROUND_SNAP = 0.9; // step up the dais
const WALK_SPEED = 4.6; // u/s — the nave is 80 m long; cottage pace would take a minute
const RUN_SPEED = 9.5;
const RIDE_SPEED = 13.0; // cage, m/s at full rope speed
const RIDE_ACCEL = 5.0;
const GATE_TIME = 0.7; // seconds for the cage gate to lift or drop
const ORE_REACH = 2.3;
const TALK_REACH = 2.9;
const TALK_BREAK = 7;

// Render calibration underground. Bloom threshold well under the ore's
// radiance so every crystal and lit pane halos; the rock itself stays below it.
const MINE_EXPOSURE = 0.9;
const MINE_BLOOM_THRESHOLD = 0.95;
const MINE_BLOOM_STRENGTH = 0.7;
const MINE_FOG = 0x1a0b06;
const MINE_FOG_DENSITY = 0.0095;

// The quest's journal key (journal.js quest stages): undefined -> 'found'
// (been down) -> 'ore' (carrying a piece) -> 'done' (patio fitted).
export const EMBER_QUEST = 'rustia-emberdeep';

export const mWalk = {
  active: false,
  pos: new THREE.Vector3(), // MINE-LOCAL: +Y up, cage landing at the origin
  yaw: 0, // look heading (0 = +Z, down the tunnel)
  pitch: 0,
  vel: new THREE.Vector3(),
  vUp: 0,
  jumpHeld: false,
  grounded: true,
  mode: 'idle',
  speed01: 0,
  view: 'tp',
  camDist: 5,
  facingYaw: 0,
  ride: null, // null | 'down' | 'up'
  rideV: 0,
  cageY: 0,
  gate: 1, // 0 shut .. 1 open
};

let astronaut = null;
let scene = null;
let mine = null;
let ctx = null; // { hide: Object3D[], onExit(aborted) } from walk.js
let hiddenPrev = null;
let prev = null; // stashed scene/render state
let bloomRef = null;
let fog = null;
let camSnap = true;
let elapsed = 0;
let talkMiner = null;
let fadeEl = null;
let fadingOut = false; // the ascent's cut to black has been started
let ridePromptKey = NaN; // the ride prompt, cached per metre
let ridePrompt = null;

const _lastShip = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _move = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _bearingOut = { angle: 0, dist: 0, label: 'CAGE' };

export function initMineWalk(astronautRef, sceneRef) {
  astronaut = astronautRef;
  scene = sceneRef;
}

export function mineActive() {
  return mWalk.active;
}

// ---------------------------------------------------------------------------
// The cut to black. One DOM element; CSS runs the fade so nothing here needs a
// frame callback (the fade back in after an ascent outlives this walker).
// ---------------------------------------------------------------------------
function fadeTo(opacity, seconds) {
  if (typeof document === 'undefined') return;
  if (!fadeEl) {
    fadeEl = document.createElement('div');
    fadeEl.id = 'mineFade';
    fadeEl.style.cssText =
      'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:5;';
    document.body.appendChild(fadeEl);
  }
  fadeEl.style.transition = seconds > 0 ? `opacity ${seconds}s ease` : 'none';
  if (seconds <= 0) void fadeEl.offsetWidth; // commit the jump before any later transition
  fadeEl.style.opacity = String(opacity);
}

// ---------------------------------------------------------------------------
// Enter / leave
// ---------------------------------------------------------------------------

// Called by walk.js when the player takes the cage at the mine head. Builds
// the mine around the player's current position and starts the ride down.
// Returns the sub-walker interface, or null if it could not start.
export function enterMine(context) {
  if (!scene || mWalk.active) return null;
  ctx = context;
  closeDialogue();

  fadeTo(1, 0); // black first: the build below is one long frame
  mine = createEmberMine({});
  // Park the mine so the cage's TOP landing is where the player stands.
  mine.group.position.copy(ship.position);
  mine.group.position.y -= mine.shaftH;
  scene.add(mine.group);

  hiddenPrev = [];
  for (const o of ctx.hide ?? []) {
    hiddenPrev.push(o.visible);
    o.visible = false;
  }
  prev = {
    fog: scene.fog,
    env: scene.environment,
    envIntensity: scene.environmentIntensity,
    exposure: -1, // filled by the first preRender, which is the first to see the renderer
    bloomThreshold: 0,
    bloomStrength: 0,
  };
  fog = new THREE.FogExp2(MINE_FOG, MINE_FOG_DENSITY);
  scene.fog = fog;
  scene.environment = null;

  mWalk.active = true;
  mWalk.pos.set(0, mine.shaftH, 0);
  mWalk.vel.set(0, 0, 0);
  mWalk.vUp = 0;
  mWalk.jumpHeld = true; // swallow a held Space
  mWalk.grounded = true;
  mWalk.mode = 'idle';
  mWalk.speed01 = 0;
  mWalk.yaw = 0; // face the gate: the tunnel is beyond it at the bottom
  mWalk.pitch = 0;
  mWalk.facingYaw = 0;
  mWalk.camDist = 5;
  mWalk.view = getViewPref() ?? 'fp';
  mWalk.ride = 'down';
  mWalk.rideV = 0;
  mWalk.cageY = mine.shaftH;
  mWalk.gate = 0;
  mine.setCage(mWalk.cageY, 0);
  mine.setOreAvailable(oreAvailable());
  camSnap = true;
  elapsed = 0;
  talkMiner = null;
  fadingOut = false;

  writeShip();
  if (questStage(EMBER_QUEST) === undefined) setQuestStage(EMBER_QUEST, 'found');
  showViewToast('EMBERDEEP No. 1 — GOING DOWN', 5);
  fadeTo(0, 1.4);
  return SUB;
}

function teardown(aborted) {
  if (!mWalk.active) return;
  closeDialogue();
  talkMiner = null;
  if (mine) {
    mine.dispose();
    mine = null;
  }
  if (ctx?.hide && hiddenPrev) {
    for (let i = 0; i < ctx.hide.length; i++) ctx.hide[i].visible = hiddenPrev[i];
  }
  hiddenPrev = null;
  if (prev) {
    scene.fog = prev.fog;
    scene.environment = prev.env;
    scene.environmentIntensity = prev.envIntensity;
    if (!aborted && bloomRef && prev.exposure >= 0) {
      bloomRef.pass.threshold = prev.bloomThreshold;
      bloomRef.pass.strength = prev.bloomStrength;
      bloomRef.renderer.toneMappingExposure = prev.exposure;
    }
    prev = null;
  }
  bloomRef = null;
  fog = null;
  if (astronaut) astronaut.group.visible = false;
  mWalk.active = false;
  mWalk.ride = null;
  const cb = ctx?.onExit;
  ctx = null;
  fadeTo(0, aborted ? 0 : 1.0);
  if (cb) cb(aborted);
}

// ship.position is the game's idea of where the player is — keep it on the
// walker, and remember what we wrote so a floating-origin rebase is visible.
function writeShip() {
  ship.position.copy(mine.group.position).add(mWalk.pos);
  ship.velocity.set(0, 0, 0);
  _lastShip.copy(ship.position);
}
function sync() {
  if (!mine) return;
  if (ship.position.x !== _lastShip.x || ship.position.y !== _lastShip.y || ship.position.z !== _lastShip.z) {
    mine.group.position.add(ship.position).sub(_lastShip);
    _lastShip.copy(ship.position);
  }
}

function cageOpen() {
  return mWalk.ride === null && mWalk.gate > 0.9;
}
function oreAvailable() {
  return !hasCargo('emberOre') && !hasUpgrade('patio');
}

// ---------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------
function step(dt) {
  if (!mWalk.active) return;
  sync();

  mWalk.yaw -= input.mouseX * LOOK_SENS;
  mWalk.pitch -= input.mouseY * LOOK_SENS;
  mWalk.pitch = Math.min(Math.max(mWalk.pitch, -MAX_PITCH), MAX_PITCH);
  input.mouseX = 0;
  input.mouseY = 0;

  // --- the cage ---
  if (mWalk.ride) {
    const goal = mWalk.ride === 'down' ? 0 : mine.shaftH;
    if (mWalk.gate > 0) {
      // gate drops before the rope takes up
      mWalk.gate = Math.max(0, mWalk.gate - dt / GATE_TIME);
    } else {
      const left = Math.abs(goal - mWalk.cageY);
      // brake so it settles on the landing rather than hitting it
      const vMax = Math.min(RIDE_SPEED, Math.sqrt(2 * RIDE_ACCEL * left) + 0.4);
      mWalk.rideV = Math.min(mWalk.rideV + RIDE_ACCEL * dt, vMax);
      const d = Math.min(left, mWalk.rideV * dt);
      mWalk.cageY += mWalk.ride === 'down' ? -d : d;
      if (mWalk.ride === 'up' && left < 7 && !fadingOut) {
        fadingOut = true;
        fadeTo(1, 0.45); // into the daylight
      }
      if (left - d <= 1e-4) {
        mWalk.cageY = goal;
        mWalk.rideV = 0;
        if (mWalk.ride === 'up') {
          teardown(false); // back on the surface; walk.js takes over next tick
          return;
        }
        mWalk.ride = null;
        showViewToast('PIT BOTTOM — THE CATHEDRAL IS DOWN THE TUNNEL', 6);
      }
    }
  } else if (mWalk.gate < 1) {
    mWalk.gate = Math.min(1, mWalk.gate + dt / GATE_TIME);
  }
  mine.setCage(mWalk.cageY, mWalk.gate);

  // --- walking ---
  const sinY = Math.sin(mWalk.yaw);
  const cosY = Math.cos(mWalk.yaw);
  const axes = moveAxes();
  _wish.set(sinY * axes.fwd - cosY * axes.strafe, 0, cosY * axes.fwd + sinY * axes.strafe);
  const targetSpeed = input.sprint ? RUN_SPEED : WALK_SPEED;
  if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(targetSpeed * axes.mag);

  const accel = mWalk.grounded ? C.WALK_ACCEL_GROUND : C.WALK_ACCEL_AIR;
  _move.subVectors(_wish, mWalk.vel);
  const gap = _move.length();
  const stepV = accel * dt;
  if (gap > stepV && gap > 1e-6) mWalk.vel.addScaledVector(_move, stepV / gap);
  else mWalk.vel.copy(_wish);

  // One axis at a time, so a blocked diagonal slides along the wall.
  const open = cageOpen();
  const nx = mWalk.pos.x + mWalk.vel.x * dt;
  if (canStand(nx, mWalk.pos.z, open)) mWalk.pos.x = nx;
  else mWalk.vel.x = 0;
  const nz = mWalk.pos.z + mWalk.vel.z * dt;
  if (canStand(mWalk.pos.x, nz, open)) mWalk.pos.z = nz;
  else mWalk.vel.z = 0;

  // --- vertical ---
  const inCage = mine.inCage(mWalk.pos.x, mWalk.pos.z);
  if (inCage) {
    // the deck is the floor, and it moves: no jumping under a 2.7 m roof
    mWalk.pos.y = mWalk.cageY;
    mWalk.grounded = true;
    mWalk.vUp = 0;
  } else {
    const gy = mine.floorYAt(mWalk.pos.x, mWalk.pos.z);
    if (mWalk.vUp <= 0 && mWalk.pos.y <= gy + GROUND_SNAP) {
      mWalk.pos.y = gy;
      mWalk.grounded = true;
      mWalk.vUp = 0;
      if (input.brake && !mWalk.jumpHeld) mWalk.vUp = C.WALK_JUMP * 0.62;
    } else {
      mWalk.grounded = false;
      mWalk.vUp -= C.WALK_GRAVITY * dt;
      mWalk.pos.y += mWalk.vUp * dt;
      if (mWalk.pos.y <= gy) {
        mWalk.pos.y = gy;
        mWalk.grounded = true;
        mWalk.vUp = 0;
      }
    }
  }
  mWalk.jumpHeld = input.brake;

  const hSpeed = mWalk.vel.length();
  mWalk.mode = !mWalk.grounded ? 'jump' : hSpeed > 0.6 ? 'run' : 'idle';
  mWalk.speed01 = Math.min(hSpeed / RUN_SPEED, 1);
  if (hSpeed > 0.4) {
    const targetYaw = Math.atan2(mWalk.vel.x, mWalk.vel.z);
    let d = targetYaw - mWalk.facingYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    mWalk.facingYaw += d * Math.min(1, FACE_TURN * dt);
  }

  writeShip();
}

function canStand(x, z, open) {
  return mine.inside(x, z, open) && !mine.blocked(x, z, PLAYER_RADIUS);
}

// ---------------------------------------------------------------------------
// Visuals (render rate)
// ---------------------------------------------------------------------------
function viewMode() {
  // Third person inside a 3 m cage is a camera pressed against bars.
  return mine && mine.inCage(mWalk.pos.x, mWalk.pos.z) ? 'fp' : mWalk.view;
}

function visuals(dt, t) {
  if (!mWalk.active || !astronaut) return;
  sync();
  elapsed += dt;
  astronaut.group.position.copy(mine.group.position).add(mWalk.pos);
  astronaut.group.quaternion.setFromAxisAngle(_yAxis, mWalk.facingYaw);
  astronaut.update(dt, mWalk.mode, mWalk.speed01);
  astronaut.group.visible = viewMode() === 'tp';
  mine.update(dt, elapsed, mWalk.pos);
  // Walk away from a miner mid-sentence and the panel closes, as in town.
  if (talkMiner && isDialogueOpen()) {
    const dx = talkMiner.pos.x - mWalk.pos.x, dz = talkMiner.pos.z - mWalk.pos.z;
    if (dx * dx + dz * dz > TALK_BREAK * TALK_BREAK) closeDialogue();
  }
}

// Pre-composer hook: the only place a renderer (and the bloom pass) is handed
// out. Written every frame — cheap scalars — so nothing else can drift them.
function preRender(renderer, bloomPass) {
  if (!mWalk.active || !prev) return;
  if (prev.exposure < 0) {
    prev.exposure = renderer.toneMappingExposure;
    if (bloomPass) {
      prev.bloomThreshold = bloomPass.threshold;
      prev.bloomStrength = bloomPass.strength;
    }
    bloomRef = bloomPass ? { pass: bloomPass, renderer } : null;
  }
  renderer.toneMappingExposure = MINE_EXPOSURE;
  if (bloomPass) {
    bloomPass.threshold = MINE_BLOOM_THRESHOLD;
    bloomPass.strength = MINE_BLOOM_STRENGTH;
  }
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------
function nearOre() {
  if (!oreAvailable()) return false;
  const dx = mine.orePos.x - mWalk.pos.x, dz = mine.orePos.z - mWalk.pos.z;
  return dx * dx + dz * dz < ORE_REACH * ORE_REACH;
}
function nearestMiner() {
  let best = null, bestD = TALK_REACH * TALK_REACH;
  for (const m of mine.miners) {
    const dx = m.pos.x - mWalk.pos.x, dz = m.pos.z - mWalk.pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { best = m; bestD = d; }
  }
  return best;
}
function canRideUp() {
  return mWalk.ride === null && mWalk.gate >= 1 && mine.inCage(mWalk.pos.x, mWalk.pos.z);
}

function interact() {
  if (!mWalk.active) return;
  if (isDialogueOpen()) {
    advanceDialogue();
    return;
  }
  if (canRideUp()) {
    mWalk.ride = 'up';
    mWalk.rideV = 0;
    showViewToast('GOING UP', 3);
    return;
  }
  if (nearOre()) {
    takeOre();
    return;
  }
  const m = nearestMiner();
  if (m) {
    talkMiner = m;
    openDialogue(
      { speaker: { name: m.name, species: m.role, cityId: 'Redline Claim' }, lines: m.lines },
      { onClose: () => { talkMiner = null; } }
    );
  }
}

function takeOre() {
  if (!grantCargo('emberOre')) return false;
  mine.setOreAvailable(false);
  setQuestStage(EMBER_QUEST, 'ore');
  showViewToast('EMBER ORE — SHOW IT TO BARON RYNVA, IN THE TOWN PENTHOUSE', 8);
  return true;
}

function promptText() {
  if (!mWalk.active || isDialogueOpen()) return null;
  if (mWalk.ride) {
    // Rebuilt once per metre, not once per frame (this is polled every frame).
    const m = Math.round(mWalk.ride === 'down' ? mWalk.cageY : mine.shaftH - mWalk.cageY);
    const key = mWalk.ride === 'down' ? m : -m - 1;
    if (key !== ridePromptKey) {
      ridePromptKey = key;
      ridePrompt = mWalk.ride === 'down' ? `GOING DOWN — ${m} M TO PIT BOTTOM` : `GOING UP — ${m} M TO THE SURFACE`;
    }
    return ridePrompt;
  }
  if (canRideUp()) return 'E — RIDE THE CAGE UP';
  if (nearOre()) return 'E — TAKE THE EMBER ORE';
  if (nearestMiner()) return 'E — TALK';
  return null;
}

function toggleView() {
  mWalk.view = toggleViewPref();
  camSnap = true;
  return mWalk.view;
}

function promptReturn() {
  showViewToast('THE SHIP IS ON THE SURFACE — RIDE THE CAGE BACK UP');
}

// Compass: back to the cage. If you are carrying ore, that is where you are
// going; if you are not, it is still the only way out.
function bearing() {
  if (!mWalk.active) return null;
  const dx = -mWalk.pos.x, dz = -mWalk.pos.z;
  const len = Math.hypot(dx, dz);
  _bearingOut.dist = len;
  _bearingOut.label = 'CAGE';
  if (len < 1e-6) {
    _bearingOut.angle = 0;
    return _bearingOut;
  }
  const sinY = Math.sin(mWalk.yaw), cosY = Math.cos(mWalk.yaw);
  const fx = dx / len, fz = dz / len;
  _bearingOut.angle = Math.atan2(fx * -cosY + fz * sinY, fx * sinY + fz * cosY);
  return _bearingOut;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
function camera(cam, delta = 0) {
  if (!mWalk.active) return;
  sync();
  const cosP = Math.cos(mWalk.pitch);
  _look.set(Math.sin(mWalk.yaw) * cosP, Math.sin(mWalk.pitch), Math.cos(mWalk.yaw) * cosP);
  const base = mine.group.position;

  if (viewMode() === 'fp') {
    cam.position.copy(base).add(mWalk.pos);
    cam.position.y += C.WALK_EYE_HEIGHT;
    _target.copy(cam.position).add(_look);
    cam.up.set(0, 1, 0);
    cam.lookAt(_target);
    camSnap = true; // re-seat the orbit when third person resumes
  } else {
    if (input.wheel !== 0) {
      mWalk.camDist = Math.min(Math.max(mWalk.camDist + input.wheel * 0.004, CAM_MIN), CAM_MAX);
      input.wheel = 0;
    }
    // Orbit target at head height; pull the boom in until the camera is
    // inside a room and under its roof (the walls are rock, not glass).
    const tx = mWalk.pos.x, ty = mWalk.pos.y + C.WALK_TP_EYE, tz = mWalk.pos.z;
    let dist = mWalk.camDist;
    for (let i = 0; i < 10; i++) {
      const cx = tx - _look.x * dist, cy = ty - _look.y * dist, cz = tz - _look.z * dist;
      const floor = mine.floorYAt(cx, cz);
      if (mine.inside(cx, cz, true) && cy < floor + mine.ceilAt(cx, cz) - 0.35 && !mine.blocked(cx, cz, 0.15)) break;
      dist *= 0.78;
    }
    _desired.set(-_look.x * dist, C.WALK_TP_EYE - _look.y * dist, -_look.z * dist);
    const minY = 0.4;
    if (_desired.y < minY) _desired.y = minY;
    if (camSnap) {
      _camOffset.copy(_desired);
      camSnap = false;
    } else {
      _camOffset.lerp(_desired, 1 - Math.exp(-CAM_SMOOTH * delta));
    }
    cam.position.copy(base).add(mWalk.pos).add(_camOffset);
    _target.copy(base).add(mWalk.pos);
    _target.y += C.WALK_TP_EYE;
    cam.up.set(0, 1, 0);
    cam.lookAt(_target);
  }
  if (cam.fov !== C.FOV) {
    cam.fov = C.FOV;
    cam.updateProjectionMatrix();
  }
}

// The sub-walker interface walk.js forwards to while the mine holds the floor.
const SUB = {
  name: 'mine',
  step,
  visuals,
  preRender,
  camera,
  interact,
  promptText,
  toggleView,
  promptReturn,
  bearing,
  // A reset, the menu or a debug exit is tearing the walk down around us.
  abort() { teardown(true); },
};

// ---------------------------------------------------------------------------
// The governor's half of the quest (walk.js governorInteract calls in).
// ---------------------------------------------------------------------------

// Carrying ore and no patio yet: the Baron takes the piece and fits the deck.
// Returns the dialogue payload, or null to let the ordinary tour dialogue run.
export function emberDelivery(def, speaker, fillLine) {
  const m = def?.mine;
  if (!m || !hasCargo('emberOre') || hasUpgrade('patio')) return null;
  takeCargo('emberOre');
  grantUpgrade('patio');
  setQuestStage(EMBER_QUEST, 'done');
  return { speaker, lines: m.deliver.map(fillLine) };
}

// One extra line on the end of whatever else the Baron says: a nudge toward
// the mine before the patio, a remark about it after.
export function emberAside(def, fillLine) {
  const m = def?.mine;
  if (!m) return [];
  return [fillLine(hasUpgrade('patio') ? m.after : m.hint)];
}

// dev/verification handle (__debug.walkSite().mine)
export function mineSite() {
  if (!mWalk.active || !mine) return null;
  return {
    mWalk,
    mine,
    info: mine.info(),
    places: mine.places,
    lights: mine.lights.length,
    fog: scene.fog === fog,
    promptText,
    interact,
    // Teleport the walker (mine-local). Refuses a spot that is not standable.
    place(x, z) {
      if (!canStand(x, z, true)) return false;
      mWalk.pos.set(x, mine.inCage(x, z) ? mWalk.cageY : mine.floorYAt(x, z), z);
      mWalk.vel.set(0, 0, 0);
      camSnap = true;
      writeShip();
      return true;
    },
    canStand: (x, z) => canStand(x, z, cageOpen()),
    // Skip the rest of a ride (headless checks need not sit through 11 s).
    finishRide() {
      if (mWalk.ride === 'down') { mWalk.gate = 0; mWalk.cageY = 0.01; mWalk.rideV = 1; }
      else if (mWalk.ride === 'up') { mWalk.gate = 0; mWalk.cageY = mine.shaftH - 0.01; mWalk.rideV = 1; }
    },
  };
}
