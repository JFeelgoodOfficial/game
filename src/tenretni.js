// Tenretni: the governor's secret (see src/tenretniLazy.js for the story and
// how this chunk gets loaded).
//
// Everything here lives in one frame, the EVENT FRAME: a group parented to
// terra, placed at the viewpoint the ship is parked at and turned the way the
// ship is turned. In it the patio's rail is at the origin, +z is straight out
// from the stern, the sun is `HALF_ANGLE` to the left and terra the same to
// the right. The wormhole and the sphere sit on +z. Because the frame hangs
// off terra's group it rides the floating origin for free.
//
// The event is a SCRIPT on a 90-second clock `u` (scaled to
// C.TENRETNI_DURATION). pose(u) places every object for a given u and is the
// whole of the animation: no state is carried from frame to frame except the
// one thing that genuinely happens once, the tunnel's strike point on terra.
// That is why the debug handle can seek, and why a reload into the finished
// world is just pose(90).
//
//   0–10   the wormhole opens
//   12–26  Tenretni comes through (clipped at the wormhole's plane)
//   26–34  beams; 27–42 the swarm leaves for terra
//   40–56  the tunnel reaches out; 56 it strikes
//   57–73  the sea runs up the tunnel; terra dries outward from the strike
//   60–76  the swarm's city grows at the strike
//   74–78  the tunnel breaks (two ring frames stay adrift), the swarm recalls
//   78–88  Tenretni goes back through; 84–90 the wormhole settles, and stays
//
// The swarm is one THREE.Points whose motion is entirely in its vertex shader;
// the rest is a dozen draw calls. Nothing allocates per frame.

import * as THREE from 'three';
import { C } from './constants.js';
import { ship } from './ship.js';
import { input } from './input.js';
import { Q } from './quality.js';
import { questStage, setQuestStage, addCodex } from './journal.js';
import { setPlanetDrain } from './planet.js';
import { showNavToast, hideNavToast } from './nav.js';
import { showViewToast } from './walkview.js';
import { setEventRumble, uiSound } from './sfx.js';
import commonVert from './shaders/tenretni.vert?raw';
import sphereFrag from './shaders/tenretni.frag?raw';
import wormFrag from './shaders/wormhole.frag?raw';
import swarmVert from './shaders/tenretniSwarm.vert?raw';
import swarmFrag from './shaders/tenretniSwarm.frag?raw';
import beamVert from './shaders/tenretniBeam.vert?raw';
import beamFrag from './shaders/tenretniBeam.frag?raw';
import tubeFrag from './shaders/tenretniTube.frag?raw';
import hullVert from './shaders/tenretniHull.vert?raw';
import hullFrag from './shaders/tenretniHull.frag?raw';

const SECRET = 'tenretni';
const STORE_KEY = 'fgsf.tenretni';
const SCRIPT = 90; // the clock every beat time below is written against
const T_STRIKE = 56;
const SWARM_COUNT = { low: 4000, medium: 12000, high: 30000, ultra: 30000 };
const BEAMS = 170;
const RINGS = 12;
const KEEP_A = 5; // the two ring frames left adrift when the tunnel breaks
const KEEP_B = 7;
const TOWERS = 420;

let terra = null;
let camera = null;
let fx = null;

// 'idle' nothing happening · 'glide' settling at the viewpoint · 'wait' parked,
// waiting for the pilot on the patio · 'play' the script is running · 'done'
let state = 'idle';
let glideT = 0;
let playT = 0; // seconds of script played
let lastU = 0;
let waitT = 0;
let time = 0;
let cityDir = null; // strike point, unit, in terra.surface's own frame
let aimFrozen = false;
let tunnelL = 1;
let lastRumble = 0;

// frame
const root = new THREE.Group();
const viewQuat = new THREE.Quaternion();
const viewQuatInv = new THREE.Quaternion();
const viewOffset = new THREE.Vector3(); // viewpoint, relative to terra's centre
const terraC = new THREE.Vector3(); // terra's centre in the event frame
const sunWorld = new THREE.Vector3();

// objects
let worm, sphere, beams, swarm, tunnel, shell, rings, cityHolder, towers;
let wormU, sphereU, beamU, swarmU, tubeU, ringU, towerU;

// scratch
const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d0 = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q0 = new THREE.Quaternion(); // ship attitude when the glide began
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _ident = new THREE.Quaternion();
let glideR0 = 0;

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const seg = (u, a, b) => clamp01((u - a) / (b - a));
const ease = (x) => x * x * (3 - 2 * x);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

function buildFrame() {
  // S: terra -> sun. P: in the view plane, perpendicular to S. U: up.
  const S = sunWorld.copy(terra.sunBase).normalize();
  const P = new THREE.Vector3().crossVectors(S, Y).normalize();
  const U = new THREE.Vector3().crossVectors(P, S).normalize();
  const a = C.TENRETNI_HALF_ANGLE;
  // aft view V sits between the sun (a to its left) and terra (a to its right)
  const V = new THREE.Vector3().copy(S).multiplyScalar(Math.cos(a)).addScaledVector(P, Math.sin(a));
  const Td = new THREE.Vector3().copy(S).multiplyScalar(Math.cos(2 * a)).addScaledVector(P, Math.sin(2 * a));
  const X = new THREE.Vector3().crossVectors(U, V);
  viewQuat.setFromRotationMatrix(_m.makeBasis(X, U, V));
  viewQuatInv.copy(viewQuat).invert();
  viewOffset.copy(Td).multiplyScalar(-C.TENRETNI_VIEW_DIST);
  terraC.set(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(C.TENRETNI_VIEW_DIST);
  root.position.copy(viewOffset);
  root.quaternion.copy(viewQuat);
  terra.group.add(root);
}

function buildWormhole() {
  wormU = {
    uTime: { value: 0 },
    uPower: { value: 0 },
    uHdr: { value: C.TENRETNI_HDR },
  };
  worm = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: commonVert,
      fragmentShader: wormFrag,
      uniforms: wormU,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  worm.position.set(0, 0, C.TENRETNI_WORM_DIST);
  worm.frustumCulled = false;
  root.add(worm);
}

function buildSphere() {
  sphereU = {
    uSun: { value: sunWorld },
    uTime: { value: 0 },
    uSpin: { value: 0 },
    uClip: { value: 1e6 },
    uHdr: { value: C.TENRETNI_HDR },
    uWake: { value: 0 },
  };
  sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.ShaderMaterial({ vertexShader: commonVert, fragmentShader: sphereFrag, uniforms: sphereU })
  );
  root.add(sphere);

  // beams: BEAMS segments in the sphere's unit space
  const r = rng(71);
  const pos = new Float32Array(BEAMS * 6);
  const end = new Float32Array(BEAMS * 2);
  const seed = new Float32Array(BEAMS * 2);
  for (let i = 0; i < BEAMS; i++) {
    const z = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const k = Math.sqrt(1 - z * z);
    const sd = r();
    for (let e = 0; e < 2; e++) {
      pos.set([k * Math.cos(th), k * Math.sin(th), z], i * 6 + e * 3);
      end[i * 2 + e] = e;
      seed[i * 2 + e] = sd;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  beamU = { uT: { value: 0 }, uOn: { value: 0 }, uHdr: { value: C.TENRETNI_HDR } };
  beams = new THREE.LineSegments(
    g,
    new THREE.ShaderMaterial({
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      uniforms: beamU,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  beams.frustumCulled = false;
  sphere.add(beams);
}

function buildSwarm() {
  const n = SWARM_COUNT[Q.tier] || SWARM_COUNT.medium;
  const r = rng(1313);
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const z = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const k = Math.sqrt(1 - z * z);
    pos.set([k * Math.cos(th), k * Math.sin(th), z], i * 3);
    seed.set([r(), r(), r(), r()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  swarmU = {
    uT: { value: 0 },
    uSphere: { value: new THREE.Vector3() },
    uRs: { value: C.TENRETNI_SPHERE_RADIUS },
    uTerra: { value: terraC },
    uRt: { value: terra.radius },
    uCity: { value: new THREE.Vector3() },
    uCitySpan: { value: C.TENRETNI_CITY_SPAN * terra.radius },
    uScale: { value: 600 },
    uSize: { value: 11 },
    uHdr: { value: C.TENRETNI_HDR },
  };
  swarm = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      vertexShader: swarmVert,
      fragmentShader: swarmFrag,
      uniforms: swarmU,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  swarm.frustumCulled = false;
  root.add(swarm);
}

function hullMaterial(win) {
  const uniforms = {
    uSun: { value: sunWorld },
    uHdr: { value: C.TENRETNI_HDR },
    uWin: { value: win },
    uTime: { value: 0 },
    uGrow: { value: 1 },
  };
  return new THREE.ShaderMaterial({ vertexShader: hullVert, fragmentShader: hullFrag, uniforms });
}

function buildTunnel() {
  const rad = C.TENRETNI_TUNNEL_RADIUS;
  tunnel = new THREE.Group();
  root.add(tunnel);
  tubeU = {
    uTime: { value: 0 },
    uLen: { value: 1 },
    uFlow: { value: 0 },
    uAlpha: { value: 1 },
  };
  shell = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 40, 1, true).translate(0, 0.5, 0),
    new THREE.ShaderMaterial({
      vertexShader: commonVert,
      fragmentShader: tubeFrag,
      uniforms: tubeU,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  shell.frustumCulled = false;
  tunnel.add(shell);

  const ringGeo = new THREE.TorusGeometry(rad * 1.14, rad * 0.11, 8, 36).rotateX(Math.PI / 2);
  ringGeo.setAttribute('aRad', new THREE.InstancedBufferAttribute(new Float32Array(RINGS), 1));
  const mat = hullMaterial(0.09);
  ringU = mat.uniforms;
  rings = new THREE.InstancedMesh(ringGeo, mat, RINGS);
  rings.frustumCulled = false;
  tunnel.add(rings);
}

function buildCity() {
  cityHolder = new THREE.Group();
  cityHolder.visible = false;
  terra.surface.add(cityHolder);
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  geo.setAttribute('aRad', new THREE.InstancedBufferAttribute(new Float32Array(TOWERS), 1));
  const mat = hullMaterial(0.14);
  towerU = mat.uniforms;
  towerU.uGrow.value = 0;
  towers = new THREE.InstancedMesh(geo, mat, TOWERS);
  towers.frustumCulled = false;
  cityHolder.add(towers);
}

// Stand the towers on the ground around `cityDir`. Runs once, at the strike
// (or at load into the finished world): TOWERS terrain samples.
function placeCity() {
  cityHolder.quaternion.setFromUnitVectors(Y, cityDir);
  const r = rng(4242);
  const span = C.TENRETNI_CITY_SPAN * 0.92;
  const rad = towers.geometry.getAttribute('aRad');
  for (let i = 0; i < TOWERS; i++) {
    const k = Math.pow(r(), 0.75); // 0 centre .. 1 edge, crowded inward
    const th = k * span;
    const ph = r() * Math.PI * 2;
    _a.set(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    _b.copy(_a).applyQuaternion(cityHolder.quaternion); // surface frame
    const ground = terra.body.groundAtLocal ? terra.body.groundAtLocal(_b) : 0;
    const tall = 14 + 150 * Math.pow(1 - k, 1.6) * (0.25 + 0.75 * r()) + (r() > 0.97 ? 90 : 0);
    const wide = 9 + 22 * r() * (1.2 - k);
    _q.setFromUnitVectors(Y, _a);
    _q2.setFromAxisAngle(Y, r() * Math.PI);
    _q.multiply(_q2);
    _b.copy(_a).multiplyScalar(terra.radius + ground - 2);
    _m.compose(_b, _q, _s.set(wide, tall, wide * (0.6 + 0.8 * r())));
    towers.setMatrixAt(i, _m);
    rad.setX(i, k);
  }
  towers.instanceMatrix.needsUpdate = true;
  rad.needsUpdate = true;
}

function loadSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    const c = raw?.city;
    if (Array.isArray(c) && c.length === 3 && c.every(Number.isFinite)) {
      cityDir = new THREE.Vector3(c[0], c[1], c[2]).normalize();
    }
  } catch {
    // unreadable save: the strike point is recomputed below
  }
}

function saveCity() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ city: [cityDir.x, cityDir.y, cityDir.z] }));
  } catch {
    // storage full or blocked: the world still changes for this session
  }
}

export function init(deps, fxOut) {
  terra = deps.planets.find((p) => p.cfg.name === 'terra');
  camera = deps.camera;
  fx = fxOut;
  buildFrame();
  buildWormhole();
  buildSphere();
  buildSwarm();
  buildTunnel();
  buildCity();
  if (questStage(SECRET) === 'done') {
    loadSaved();
    if (cityDir) placeCity();
    state = 'done';
    pose(SCRIPT);
  } else pose(0);
}

// ---------------------------------------------------------------------------
// the script
// ---------------------------------------------------------------------------

// The strike point as it is right now, in the event frame (terra turns).
function cityPoint(out) {
  return out
    .copy(cityDir)
    .applyAxisAngle(Y, terra.surface.rotation.y)
    .applyQuaternion(viewQuatInv)
    .multiplyScalar(terra.radius)
    .add(terraC);
}

// Where the tunnel is aimed before it lands, as a direction out of terra's
// centre in the event frame. Straight at the sphere would put the strike (and
// the city) over terra's limb as seen from the patio, so it is swung part of
// the way round toward the viewer: still in the sphere's line of sight, and
// on the face the pilot is looking at.
function aimDir(out) {
  _c.copy(terraC).negate().normalize(); // terra -> patio
  return out
    .set(0, 0, C.TENRETNI_SPHERE_DIST)
    .sub(terraC)
    .normalize()
    .multiplyScalar(1 - C.TENRETNI_STRIKE_BIAS)
    .addScaledVector(_c, C.TENRETNI_STRIKE_BIAS)
    .normalize();
}

function strike() {
  // the aim point, moved into the surface's own (turning) frame
  cityDir = aimDir(new THREE.Vector3())
    .applyQuaternion(viewQuat)
    .applyAxisAngle(Y, -terra.surface.rotation.y);
  placeCity();
}

function pose(u) {
  const RS = C.TENRETNI_SPHERE_RADIUS;
  const ZW = C.TENRETNI_WORM_DIST;

  // wormhole
  const open = ease(seg(u, 0, 10));
  const settle = ease(seg(u, 84, 90));
  const ws = open * (1 - (1 - C.TENRETNI_WORM_REST) * settle);
  worm.visible = ws > 0.001;
  worm.scale.setScalar(C.TENRETNI_WORM_RADIUS * Math.max(ws, 0.001));
  // brighter while something is in the throat
  const transit = Math.sin(Math.PI * seg(u, 11, 27)) + Math.sin(Math.PI * seg(u, 77, 89));
  wormU.uPower.value = Math.min(open * 1.3, 1) * (0.85 + 0.25 * transit - 0.2 * settle);

  // sphere: out of the throat, parked, back in
  const k = ease(seg(u, 12, 26)) * (1 - ease(seg(u, 78, 88)));
  const sc = RS * (0.8 + 0.2 * k);
  const z = ZW + sc * 1.05 + (C.TENRETNI_SPHERE_DIST - ZW - sc * 1.05) * k;
  sphere.visible = u > 12 && u < 88 && k > 0;
  sphere.position.set(0, 0, z);
  sphere.scale.setScalar(sc);
  sphereU.uClip.value = (ZW - z) / sc;
  sphereU.uSpin.value = u * 0.025;
  sphereU.uWake.value = ease(seg(u, 14, 24));

  // beams
  const on = ease(seg(u, 26, 34)) * (1 - ease(seg(u, 73, 78)));
  beams.visible = on > 0;
  beamU.uOn.value = on;
  beamU.uT.value = u;

  // the strike happens once
  if (u >= T_STRIKE && !cityDir) strike();
  if (u < T_STRIKE && cityDir && state !== 'done') cityDir = null; // debug seek backwards

  // swarm
  swarm.visible = u > 27 && u < 86;
  swarmU.uT.value = u;
  swarmU.uSphere.value.copy(sphere.position);
  if (cityDir) cityPoint(swarmU.uCity.value);

  // tunnel: from the sphere's hull to the strike point, which turns with terra
  const ext = Math.pow(seg(u, 40, T_STRIKE), 1.6);
  const gone = seg(u, 74, 78);
  // (measured from where the sphere PARKS: the tunnel only exists while it
  // is there, and the two frames left behind must not follow it home)
  if (!aimFrozen || u < 74) {
    if (cityDir) cityPoint(_a);
    else aimDir(_a).multiplyScalar(terra.radius).add(terraC);
    _d0.set(0, 0, C.TENRETNI_SPHERE_DIST);
    _b.subVectors(_a, _d0);
    const dist = _b.length();
    _b.divideScalar(dist);
    tunnelL = Math.max(dist - RS * 0.97, 1);
    tunnel.position.copy(_d0).addScaledVector(_b, RS * 0.97);
    tunnel.quaternion.setFromUnitVectors(Y, _b);
  }
  aimFrozen = u >= 74;
  const len = tunnelL * ext;
  tunnel.visible = ext > 0;
  shell.visible = gone < 1;
  shell.scale.set(C.TENRETNI_TUNNEL_RADIUS, Math.max(len, 0.01), C.TENRETNI_TUNNEL_RADIUS);
  tubeU.uLen.value = len;
  tubeU.uAlpha.value = 1 - gone;
  tubeU.uFlow.value = ease(seg(u, T_STRIKE + 0.5, 59)) * (1 - ease(seg(u, 72, 74)));
  poseRings(u, len, gone);

  // terra
  const drain = cityDir ? ease(seg(u, 57, 73)) : 0;
  const tech = cityDir ? ease(seg(u, 60, 76)) : 0;
  setPlanetDrain('terra', drain, cityDir, tech, C.TENRETNI_CITY_SPAN);
  cityHolder.visible = tech > 0;
  towerU.uGrow.value = tech;
}

// Ring frames along the tunnel. They appear as it passes them and are pulled
// back in when it breaks — all but two, which are left to drift.
function poseRings(u, len, gone) {
  const drift = Math.min(Math.max(u - 74, 0), SCRIPT - 74);
  for (let i = 0; i < RINGS; i++) {
    const y = ((i + 0.5) / RINGS) * tunnelL;
    const keep = i === KEEP_A || i === KEEP_B;
    const there = y < len && (keep || y < tunnelL * (1 - gone));
    if (!there) {
      _m.makeScale(0, 0, 0);
    } else if (keep && drift > 0) {
      const sgn = i === KEEP_A ? 1 : -1;
      _a.set(sgn * 6 * drift, y + sgn * 3 * drift, 4 * drift);
      _c.set(0.3 * sgn, 1, 0.5).normalize();
      _q.setFromAxisAngle(_c, sgn * (0.02 * drift + 0.03 * time));
      _m.compose(_a, _q, _s.set(1, 1, 1));
    } else {
      _m.makeTranslation(0, y, 0);
    }
    rings.setMatrixAt(i, _m);
  }
  rings.instanceMatrix.needsUpdate = true;
}

// What crossing a beat does once: a jolt, a flash, a sound, a line of text.
function beats(u0, u1, flying) {
  const hit = (t) => u0 < t && u1 >= t;
  if (hit(0.2)) fx.kick = 0.5;
  if (hit(12)) fx.kick = 0.6;
  if (hit(27)) fx.kick = 0.35;
  if (hit(T_STRIKE)) {
    fx.kick = 1;
    fx.flash = 0.7;
    uiSound('impact');
  }
  if (hit(74)) {
    fx.kick = 0.6;
    uiSound('impact');
  }
  if (hit(87.5)) fx.kick = 0.5;
  if (flying && hit(13)) showViewToast('UNKNOWN MASS IN TRANSIT', 5);
  if (flying && hit(58)) showViewToast('TERRA — OCEAN LEVEL FALLING', 6);
}

function rumbleAt(u) {
  const open = ease(seg(u, 0, 10)) * (1 - ease(seg(u, 84, 90)));
  const transit = Math.sin(Math.PI * seg(u, 11, 27)) + Math.sin(Math.PI * seg(u, 77, 89));
  const pipe = seg(u, 40, T_STRIKE) * (1 - seg(u, 73, 76));
  return clamp01(0.2 * open + 0.45 * transit + 0.5 * pipe);
}

function setRumble(r) {
  if (r === lastRumble) return;
  lastRumble = r;
  fx.rumble = r * 0.35;
  setEventRumble(r);
}

// ---------------------------------------------------------------------------
// the ship
// ---------------------------------------------------------------------------

// The armed warp has stopped off terra: take the ship the rest of the way.
export function arrive() {
  if (state !== 'idle' || questStage(SECRET) !== 'armed') return;
  state = 'glide';
  glideT = 0;
  _q0.copy(ship.quaternion);
  _d0.subVectors(ship.position, terra.group.position);
  glideR0 = _d0.length();
  if (glideR0 < 1) _d0.set(0, 0, 1);
  _d0.normalize();
  _d1.copy(viewOffset).normalize();
}

export const holding = () => state === 'glide' || state === 'wait' || state === 'play';

// Physics tick while holding(): game.js skips stepShip, so no thrust, no
// gravity. Glide round terra to the viewpoint (the bearing swings, the radius
// eases — the path cannot cut the planet), then stay pinned to it.
export function stepHold(dt) {
  input.warp = false;
  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  if (state === 'glide') {
    glideT += dt;
    const e = ease(clamp01(glideT / C.TENRETNI_GLIDE_TIME));
    _q.setFromUnitVectors(_d0, _d1);
    _q2.copy(_ident).slerp(_q, e);
    const r = glideR0 + (C.TENRETNI_VIEW_DIST - glideR0) * e;
    _a.copy(_d0).applyQuaternion(_q2).multiplyScalar(r);
    ship.position.copy(terra.group.position).add(_a);
    ship.quaternion.copy(_q0).slerp(viewQuat, e);
    if (glideT >= C.TENRETNI_GLIDE_TIME) {
      state = 'wait';
      waitT = 0;
    }
    return;
  }
  ship.position.copy(terra.group.position).add(viewOffset);
  ship.quaternion.copy(viewQuat);
}

// ---------------------------------------------------------------------------
// per frame
// ---------------------------------------------------------------------------

export function update(delta, t, onDeck, flying) {
  time = t;
  wormU.uTime.value = t;
  sphereU.uTime.value = t;
  tubeU.uTime.value = t;
  ringU.uTime.value = t;
  towerU.uTime.value = t;
  if (worm.visible) worm.lookAt(camera.position);
  swarmU.uScale.value = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((camera.fov * Math.PI) / 360);

  if (state === 'wait') {
    if (onDeck) {
      state = 'play';
      playT = 0;
      lastU = 0;
      hideNavToast();
    } else if (flying) {
      // parked and nothing happening: say where to go, and keep saying it
      if (waitT === 0 || waitT > 14) {
        showNavToast('HOLDING OFF TERRA — C — STAND, THEN WALK AFT TO THE PATIO', 7);
        waitT = 0.001;
      }
      waitT += delta;
    }
  }
  if (state === 'play') {
    playT += delta;
    const u = Math.min((playT * SCRIPT) / C.TENRETNI_DURATION, SCRIPT);
    pose(u);
    beats(lastU, u, flying);
    setRumble(rumbleAt(u));
    lastU = u;
    if (u >= SCRIPT) finish();
  } else if (state === 'done') {
    // the two loose ring frames keep turning
    poseRings(SCRIPT, tunnelL, 1);
  }
}

function finish() {
  state = 'done';
  setRumble(0);
  saveCity();
  setQuestStage(SECRET, 'done');
  addCodex('Tenretni');
  showNavToast('TENRETNI HAS GONE. TERRA WILL NOT RECOVER.', 8);
}

// World reset mid-event: put everything away. The stage is still 'armed'.
export function abort() {
  if (state === 'done') return;
  state = 'idle';
  playT = 0;
  lastU = 0;
  setRumble(0);
  cityDir = null;
  aimFrozen = false;
  pose(0);
}

// ---------------------------------------------------------------------------
// dev/verification (__debug.tenretni)
// ---------------------------------------------------------------------------

export function debugStart() {
  if (state === 'done') return;
  state = 'play';
  playT = 0;
  lastU = 0;
}

export function debugSeek(u) {
  if (state === 'done') return;
  state = 'play';
  playT = (u * C.TENRETNI_DURATION) / SCRIPT;
  lastU = u;
  aimFrozen = false;
}

function report() {
  return {
    loaded: true,
    state,
    stage: questStage(SECRET),
    u: state === 'play' ? lastU : state === 'done' ? SCRIPT : 0,
    city: cityDir ? cityDir.toArray() : null,
    swarm: swarm.geometry.getAttribute('position').count,
    sphere: { visible: sphere.visible, z: sphere.position.z, scale: sphere.scale.x },
    worm: { visible: worm.visible, scale: worm.scale.x },
    tunnel: { visible: tunnel.visible, length: tunnelL },
    drain: terra.drain || 0,
    noLand: !!terra.cfg.noLand,
  };
}
export { report as state };
