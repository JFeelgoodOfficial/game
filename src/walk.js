// On-foot planet mode: disembark the ship over a rocky planet and explore its
// surface as an astronaut — walk, sprint (Shift), jump (Space), and swim in
// the ocean. First or third person (chosen once, toggled with T).
//
// The walker reuses ship.position as its world-space position (floating-origin
// frame), so origin rebasing, the atmosphere/skyfog passes, and gravity
// bookkeeping all keep working with no changes — control simply switches from
// flight to the walker.
//
// Ground collision is a snap-to-ground: each tick the walker's radial distance
// is pinned to planet.radius + groundAt(up), where groundAt (planet.js /
// terrain.js) is the exact CPU mirror of the surface.vert displacement. So
// your feet land on the same relief the surface shader draws. Water: the sea
// mesh sits at radius + WALK_WATER_LEVEL and the seabed is the base sphere, so
// water depth = WALK_WATER_LEVEL - groundAt; deep enough and the walker swims,
// riding the surface on buoyancy. Glacia's frozen sea is walkable ground.

import * as THREE from 'three';
import { C } from './constants.js';
import { input } from './input.js';
import { ship } from './ship.js';
import { planets, SUN } from './planet.js';
import { Astronaut } from './astronaut.js';
import { createDressing } from './dressing.js';
import {
  getViewPref,
  showViewChooser,
  showViewToast,
  hideViewUI,
  toggleViewPref,
} from './walkview.js';

const LOOK_SENS = 0.0022; // radians of look per pixel of mouse travel
const MAX_PITCH = 1.483; // ~85°, so you never flip past straight up/down
const GROUND_SNAP = 8.0; // max step-down (units) that still counts as "grounded"
const SWIM_SETTLE = 6.0; // buoyancy: per-second approach rate to the ride depth
const SHORE_HOP = 6.5; // upward kick when jumping out of shallow water
const FACE_TURN = 12.0; // per-second rate the body turns toward the velocity
const CAM_SMOOTH = 9.0; // third-person camera offset approach rate
const SPRINT_FOV_KICK = 6.0; // extra FOV at full sprint, third person

// Scratch vectors — reused every tick, never allocated in the loop.
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _basis = new THREE.Matrix4();

export const walk = {
  active: false,
  planet: null, // a terra entry from planets[]
  heading: new THREE.Vector3(0, 0, -1), // world-space tangent forward (look)
  pitch: 0, // camera-only, radians
  vUp: 0, // vertical velocity along the local up axis (jump/fall)
  jumpHeld: false, // for edge-triggered jump
  vel: new THREE.Vector3(), // world-space tangent velocity (persistent)
  mode: 'idle', // 'idle' | 'run' | 'jump' | 'swim' — drives astronaut + HUD
  speed01: 0, // horizontal speed / sprint speed, 0..1
  grounded: true,
  swimming: false,
  view: 'tp', // 'fp' | 'tp'
  camDist: 7.6, // third-person orbit distance (scroll wheel)
  facing: new THREE.Vector3(0, 0, -1), // astronaut body heading (follows vel)
};

let astronaut = null; // the visible third-person body (initWalk)
let dressing = null; // active surface-dressing patch, spawned per disembark
let camSnap = true; // snap (don't lerp) the TP camera on the next frame
let fovKick = 0; // eased 0..1 sprint FOV widen
let lastSpinAngle = 0; // surface.rotation.y at the previous walk tick (co-rotation)

// Build the astronaut once and keep it hidden until a disembark. Called from
// main.js after the scene exists.
export function initWalk(scene) {
  astronaut = new Astronaut();
  astronaut.group.visible = false;
  scene.add(astronaut.group);
}

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

// Radial distance of the walkable floor: the terrain, or the ice sheet where
// the sea is frozen (glacia — you stand on it, never swim under it).
function floorRadius(planet, up) {
  let r = planet.radius + planet.body.groundAt(up);
  if (planet.water && planet.water.frozen && r < planet.water.r) r = planet.water.r;
  return r;
}

// Liquid water depth under this direction (0 on dry or frozen worlds). The
// seabed is the base sphere (groundAt is 0 below sea level), so depth tops
// out at WALK_WATER_LEVEL just offshore.
function waterDepth(planet, up) {
  if (!planet.water || planet.water.frozen) return 0;
  return Math.max(planet.water.r - (planet.radius + planet.body.groundAt(up)), 0);
}

// Drop out of the ship onto the given terra planet, directly below where the
// ship was. Feet snap to the ground (or the body to the sea surface when
// disembarking over open water); the heading seeds from the ship's nose.
export function enterWalk(planet) {
  walk.active = true;
  walk.planet = planet;
  walk.pitch = 0;
  walk.vUp = 0;
  walk.jumpHeld = false;
  walk.vel.set(0, 0, 0);
  walk.mode = 'idle';
  walk.speed01 = 0;
  walk.grounded = true;
  walk.swimming = false;
  walk.camDist = C.WALK_CAM_DIST;
  camSnap = true;
  // Seed the spin tracker so the first stepWalk delta is ~0 (no jump on entry).
  lastSpinAngle = planet.surface.rotation.y;

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
  walk.facing.copy(walk.heading);

  // Snap onto the surface directly below: feet on the ground, or afloat at
  // the sea surface when the water is deep enough to swim.
  const depth = waterDepth(planet, _up);
  const r =
    depth > C.WALK_SWIM_DEPTH
      ? planet.water.r - C.WALK_BUOYANCY
      : floorRadius(planet, _up);
  ship.position.copy(planet.body.position).addScaledVector(_up, r);
  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);

  // First disembark ever: offer the view choice (the game keeps running
  // behind the overlay). Afterwards the stored preference decides silently.
  const pref = getViewPref();
  if (pref) {
    walk.view = pref;
    showViewToast('T — TOGGLE VIEW');
  } else {
    walk.view = 'tp'; // watch your astronaut while the chooser is up
    showViewChooser((v) => {
      walk.view = v;
      camSnap = true;
    });
  }

  // Dress the landing site (terra/oceana get the full valley; ice and rock
  // worlds get boulders; gasless of course never reach here).
  dressing = createDressing(planet, _up);
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

  if (dressing) {
    dressing.dispose();
    dressing = null;
  }
  if (astronaut) astronaut.group.visible = false;
  hideViewUI();
  fovKick = 0;

  walk.active = false;
  walk.planet = null;
}

// T — switch first/third person on foot. Persists as the new preference.
export function toggleWalkView() {
  walk.view = toggleViewPref();
  camSnap = true;
  return walk.view;
}

export function stepWalk(dt) {
  const planet = walk.planet;

  // Co-rotate with the planet's spin so the ground doesn't slide underfoot —
  // you turn with the planet's day, the way standing on a world works. The
  // surface (and sea/clouds) spin about world +Y (planet.js: rotation.y =
  // t * spin; the group has no axial tilt); without this the walker holds a
  // fixed world direction and the terrain streams past. We rotate by the exact
  // delta of surface.rotation.y — the same angle groundAt() un-rotates by — so
  // the walker's total turn always equals the surface's, framerate-independent.
  // The world-space position and every world-space heading/velocity ride along.
  const spinAngle = planet.surface.rotation.y;
  const dphi = spinAngle - lastSpinAngle;
  lastSpinAngle = spinAngle;
  if (dphi !== 0) {
    const c = Math.cos(dphi), s = Math.sin(dphi);
    const px = ship.position.x - planet.body.position.x;
    const pz = ship.position.z - planet.body.position.z;
    ship.position.x = planet.body.position.x + px * c + pz * s;
    ship.position.z = planet.body.position.z - px * s + pz * c;
    rotateXZ(walk.heading, c, s);
    rotateXZ(walk.facing, c, s);
    rotateXZ(walk.vel, c, s);
  }

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

  // --- environment at the current spot ---
  let r = ship.position.distanceTo(planet.body.position);
  let depth = waterDepth(planet, _up);
  // Swimming: deep water and the body at (or under) the surface.
  walk.swimming =
    depth > C.WALK_SWIM_DEPTH && planet.water && r <= planet.water.r + 0.05;
  const wading = !walk.swimming && depth > C.WALK_WADE_DEPTH;

  // --- planar movement: velocity approaches the wish direction ---
  _right.crossVectors(walk.heading, _up).normalize();
  const fwd = (input.forward ? 1 : 0) - (input.reverse ? 1 : 0);
  const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  _wish.set(0, 0, 0);
  _wish.addScaledVector(walk.heading, fwd);
  _wish.addScaledVector(_right, strafe);
  const targetSpeed = walk.swimming
    ? C.WALK_SWIM_SPEED
    : wading
      ? C.WALK_WADE_SPEED
      : input.boost
        ? C.WALK_RUN_SPEED
        : C.WALK_SPEED;
  if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(targetSpeed);

  // Keep the persistent velocity in the current tangent plane (the plane
  // tilts as you move around the sphere), then move it toward the wish at a
  // state-dependent acceleration: crisp on the ground, weak in the air,
  // syrupy in the water.
  projectTangent(walk.vel, _up);
  const accel = walk.swimming
    ? C.WALK_ACCEL_SWIM
    : walk.grounded
      ? C.WALK_ACCEL_GROUND
      : C.WALK_ACCEL_AIR;
  _move.subVectors(_wish, walk.vel);
  const gap = _move.length();
  const step = accel * dt;
  if (gap > step && gap > 1e-6) walk.vel.addScaledVector(_move, step / gap);
  else walk.vel.copy(_wish);
  ship.position.addScaledVector(walk.vel, dt);

  // Recompute up / radius after the horizontal step.
  _up.subVectors(ship.position, planet.body.position);
  r = _up.length();
  _up.normalize();
  const surfaceR = floorRadius(planet, _up);
  depth = waterDepth(planet, _up);
  walk.swimming =
    depth > C.WALK_SWIM_DEPTH && planet.water && r <= planet.water.r + 0.05;

  // --- vertical: swim buoyancy / ground snap / jump-fall integration ---
  if (walk.swimming) {
    walk.grounded = false;
    walk.vUp = 0;
    // Buoyancy eases the body to its ride depth just under the surface.
    const rideR = planet.water.r - C.WALK_BUOYANCY;
    r += (rideR - r) * Math.min(1, SWIM_SETTLE * dt);
    if (r < surfaceR + 0.1) r = surfaceR + 0.1; // never through the seabed
    // Near the shore a jump hops the swimmer out of the water.
    if (input.brake && !walk.jumpHeld && depth < C.WALK_SWIM_DEPTH + 0.35) {
      walk.vUp = SHORE_HOP;
      r += walk.vUp * dt;
    }
  } else if (walk.vUp <= 0 && r <= surfaceR + GROUND_SNAP) {
    r = surfaceR; // grounded: follow the terrain up and down
    walk.grounded = true;
    walk.vUp = 0;
    if (input.brake && !walk.jumpHeld) walk.vUp = C.WALK_JUMP; // edge-triggered jump
  } else {
    walk.grounded = false;
    walk.vUp -= C.WALK_GRAVITY * dt;
    r += walk.vUp * dt;
    if (r <= surfaceR) {
      r = surfaceR;
      walk.grounded = true;
      walk.vUp = 0;
    }
  }
  walk.jumpHeld = input.brake;

  ship.position.copy(planet.body.position).addScaledVector(_up, r);
  ship.velocity.set(0, 0, 0);

  // --- animation state: mode, speed fraction, body facing ---
  const hSpeed = walk.vel.length();
  walk.mode = walk.swimming
    ? 'swim'
    : !walk.grounded
      ? 'jump'
      : hSpeed > 0.6
        ? 'run'
        : 'idle';
  walk.speed01 = Math.min(hSpeed / C.WALK_RUN_SPEED, 1);
  if (hSpeed > 0.4) {
    // The body turns smoothly toward where it's actually moving.
    _fwd.copy(walk.vel).multiplyScalar(1 / hSpeed);
    walk.facing.lerp(_fwd, Math.min(1, FACE_TURN * dt));
  }
  projectTangent(walk.facing, _up);
  if (walk.facing.lengthSq() < 1e-6) walk.facing.copy(walk.heading);
  walk.facing.normalize();
}

// Once per render frame: pose the astronaut on the walker point and advance
// its procedural animation + the dressing (grass sway, night dimming).
// `t` is wall-clock seconds.
export function updateWalkVisuals(dt, t) {
  if (!walk.active || !astronaut) return;
  const planet = walk.planet;
  _up.subVectors(ship.position, planet.body.position).normalize();

  astronaut.group.position.copy(ship.position);
  // Tangent basis with the model's +Z on the body facing and +Y on planet-up.
  _right.crossVectors(_up, walk.facing).normalize();
  _fwd.crossVectors(_right, _up).normalize();
  _basis.makeBasis(_right, _up, _fwd);
  astronaut.group.quaternion.setFromRotationMatrix(_basis);
  astronaut.update(dt, walk.mode, walk.speed01);
  // The body is only drawn in third person: the FP camera sits inside the
  // helmet and the rig has no first-person-safe arms.
  astronaut.group.visible = walk.view === 'tp';

  if (dressing) dressing.update(t, Math.max(_up.dot(SUN), 0));
}

// The on-foot camera. First person: eye-level, rolled so the planet's up is
// screen-up. Third person: an orbit behind the astronaut in the same tangent
// frame, smoothed rebase-safely (the lerp state is an OFFSET from
// ship.position — absolute positions would smear across a floating-origin
// rebase, which does fire on foot).
export function updateWalkCamera(camera, delta = 0) {
  const planet = walk.planet;
  _up.subVectors(ship.position, planet.body.position).normalize();
  _right.crossVectors(walk.heading, _up).normalize();
  _look.copy(walk.heading).applyAxisAngle(_right, walk.pitch);

  if (walk.view === 'fp') {
    const eye = walk.swimming ? C.WALK_TP_SWIM_EYE : C.WALK_EYE_HEIGHT;
    camera.position.copy(ship.position).addScaledVector(_up, eye);
    _target.copy(camera.position).add(_look);
    camera.up.copy(_up);
    camera.lookAt(_target);
    if (camera.fov !== C.FOV) {
      camera.fov = C.FOV;
      camera.updateProjectionMatrix();
    }
    return;
  }

  // --- third person ---
  // Scroll zoom (accumulated in input.js; consumed here).
  if (input.wheel !== 0) {
    walk.camDist = Math.min(
      Math.max(walk.camDist + input.wheel * 0.004, C.WALK_CAM_MIN),
      C.WALK_CAM_MAX
    );
    input.wheel = 0;
  }

  const eyeH = walk.mode === 'swim' ? C.WALK_TP_SWIM_EYE : C.WALK_TP_EYE;
  _target.copy(ship.position).addScaledVector(_up, eyeH);
  _desired.copy(_target).addScaledVector(_look, -walk.camDist);

  // Keep the camera above the terrain and out of the water.
  _camDir.subVectors(_desired, planet.body.position);
  const camR = _camDir.length();
  _camDir.multiplyScalar(1 / camR);
  let minR = planet.radius + planet.body.groundAt(_camDir) + 1.15;
  if (planet.water && minR < planet.water.r + 0.4) minR = planet.water.r + 0.4;
  if (camR < minR) _desired.copy(planet.body.position).addScaledVector(_camDir, minR);

  // Rebase-safe smoothing: ease the offset-from-walker, then re-anchor.
  _desired.sub(ship.position);
  if (camSnap) {
    _camOffset.copy(_desired);
    camSnap = false;
  } else {
    _camOffset.lerp(_desired, 1 - Math.exp(-CAM_SMOOTH * delta));
  }
  camera.position.copy(ship.position).add(_camOffset);
  camera.up.copy(_up);
  camera.lookAt(_target);

  // A touch of extra FOV at full sprint — the demo's speed rush.
  const wantKick =
    walk.mode === 'run' && input.boost && walk.speed01 > 0.55 ? 1 : 0;
  fovKick += (wantKick - fovKick) * Math.min(1, 5 * delta);
  const fov = C.FOV + SPRINT_FOV_KICK * fovKick;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

// Remove v's component along the (unit) up vector, leaving it in the tangent
// plane. Does not renormalize.
function projectTangent(v, up) {
  v.addScaledVector(up, -v.dot(up));
}

// Rotate v about world +Y by the angle whose cos/sin are (c, s) — matches
// THREE's rotation.y (planet.js spins the surface about +Y), so co-rotating
// the walker glues it to the ground rather than counter-rotating.
function rotateXZ(v, c, s) {
  const x = v.x, z = v.z;
  v.x = x * c + z * s;
  v.z = -x * s + z * c;
}
