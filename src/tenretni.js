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
// ACT TWO runs straight on (journal stage 'done' -> 'ship'):
//
//   92      terra stops turning (spinLock) — everything after is static in its frame
//   94–132  the city takes the whole surface; spires rise behind the front
//   120–152 the bore opens: surface cut away over the magma core, shell inside
//   140–163 three engines grow opposite the bore, and light
//   160–165 the capital (world/capital.js) comes up on the strike point
//
// After that the world is a SHIP. game.js docks the player's ship on the
// capital's pad as it does at the Sky City; src/capitalWalk.js walks it; the
// robots there ask for a planet with water, and the navigation console sends
// the whole world to wyattmattoe or neptunia (sail(), below), where it parks.
//
// The wormhole and the loose ring frames must not travel with it, so the
// event frame hangs off its own origin-shifted anchor at terra's first
// position rather than off terra's group.
//
// The swarm is one THREE.Points whose motion is entirely in its vertex shader;
// the rest is a dozen draw calls. Nothing allocates per frame.

import * as THREE from 'three';
import { C } from './constants.js';
import { ship } from './ship.js';
import { input } from './input.js';
import { Q } from './quality.js';
import { questStage, setQuestStage, addCodex } from './journal.js';
import { setPlanetDrain, setPlanetShip, setPlanetScale, setPlanetMelt, removePlanet, planets } from './planet.js';
import { createAssimilator } from './assimilate.js';
import { createFleets } from './fleets.js';
import { createExplosions } from './explosion.js';
import { createEndgame } from './endgame.js';
import { grantUpgrade, hasUpgrade } from './inventory.js';
import { sun } from './sun.js';
import { addShiftable } from './origin.js';
import { createCapital } from '../world/capital.js';
import coreFrag from './shaders/tenretniCore.frag?raw';
import shellFrag from './shaders/tenretniShell.frag?raw';
import { showNavToast, hideNavToast, setNavHidden } from './nav.js';
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
const SCRIPT = 90; // act one's length, on the clock every beat time is written against
const END = 165; // ...and act two's last beat
const T_LOCK = 92; // terra stops turning
const T_CAPITAL = 160;
const BORE_ANGLE = 0.66; // rad, half-angle of the opening
const SPIRES = 700;
const SAIL_TIME = 42; // seconds for a voyage
const SAIL_STANDOFF = 2500; // gap left between the two worlds on arrival
const WATER_WORLDS = { wyattmattoe: 'Wyattmattoe', neptunia: 'Neptunia' };
// Every world the worldship can end up beside, by the name it is saved under.
const LABELS = {
  ...WATER_WORLDS, shadowreach: 'Shadowreach', actuality: 'Actuality', stevenlacey: 'Stevenlacey',
  'wavemall prime': 'Wavemall Prime', saturnia: 'Saturnia', rustia: 'Rustia',
};
// Once both water worlds are gone the worldship stops taking headings and
// feeds by the clock: these three a minute apart, then these three slowly.
const QUICK = ['shadowreach', 'actuality', 'stevenlacey'];
const SIEGE = ['wavemall prime', 'saturnia', 'rustia'];
const QUICK_SAIL = 18;
const SIEGE_SAIL = 30;
const SMALL_GROWTH = 1.12;
const EXIT_TIME = 34; // seconds from the last meal to gone through the wormhole
// The holodeck's programs: assimilated worlds with something worth keeping.
const PROGRAMS = [
  { id: 'wyattmattoe', label: 'WYATTMATTOE', note: 'THE SKI HILL' },
  { id: 'shadowreach', label: 'SHADOWREACH', note: 'THE DREAM' },
  { id: 'actuality', label: 'ACTUALITY', note: 'THE GROUNDS' },
  { id: 'stevenlacey', label: 'STEVENLACEY', note: 'THE COIN' },
];
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
// waiting for the pilot on the patio · 'play' the script is running · 'rest'
// the script is over and the world is a ship
let state = 'idle';
let held = false; // the script was started from the patio: the ship stays pinned
let boreDir = null; // axis of the bore, unit, in terra.surface's own frame
let rotLock = null; // the angle terra's surface is latched at
let at = 'terra'; // where the worldship is parked
let sail = null; // { name, target, t, rel: Vector3, off: Vector3 } while under way
let capital = null; // world/capital.js, built at T_CAPITAL
let shipBuilt = false;
const sailVel = new THREE.Vector3();
// What the worldship has done since: the planets it has taken apart
// (src/assimilate.js), how big that has made it, and the one it is on now.
let eaten = [];
let size = 1; // multiple of terra's built size
let eating = null;
let assim = null;
let shield = null;
let shieldU = null;
let coin = null; // stevenlacey (world/coinworld.js): a world, but not a planet
let clockT = 0; // seconds idle since the last meal
let exit = null; // { t, rel: Vector3 } while leaving through the wormhole
let ended = null; // 'gone' once it has left; 'star' once the fleets have killed it
let endgame = null; // src/endgame.js, built with the fleets
let starSaved = null; // the new star's absolute position (saved)
// The war (src/fleets.js): begins with the worldship's first meal.
let fleets = null;
let explosions = null;
const lost = new Set(); // ships destroyed by gunfire (saved); siege losses follow from `eaten`
const comms = {}; // faction -> true once its captain has opened a channel (saved)
const _siege = { name: null, k: 0 };
const waterDone = () => Object.keys(WATER_WORLDS).every((k) => eaten.includes(k));
// A world by name: a planet record, or the coin dressed as one.
const worldByName = (name) => planets.find((p) => p.cfg.name === name) || (name === 'stevenlacey' ? coin : null);
const GROWTH = 1.5; // each water world makes it half as big again
const anchor = new THREE.Group(); // terra's first position; the event frame hangs here
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
let boreGroup, innerShell, core, rim, engines, spires;
let coreU, shellU, rimU, spireU, engineU, plumeU;

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
  // terra is still where it began when this runs (init moves it afterwards)
  anchor.position.copy(terra.group.position);
  anchor.add(root);
  scene.add(anchor);
  addShiftable(anchor);
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

const readDir = (c) =>
  Array.isArray(c) && c.length === 3 && c.every(Number.isFinite)
    ? new THREE.Vector3(c[0], c[1], c[2]).normalize()
    : null;

function loadSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    cityDir = readDir(raw?.city);
    boreDir = readDir(raw?.bore);
    if (Number.isFinite(raw?.rotY)) rotLock = raw.rotY;
    if (raw?.at && LABELS[raw.at]) at = raw.at;
    if (Array.isArray(raw?.eaten)) eaten = raw.eaten.filter((n) => !!LABELS[n]);
    if (raw?.end === 'gone' || raw?.end === 'star') ended = raw.end;
    if (Array.isArray(raw?.star) && raw.star.length === 3 && raw.star.every(Number.isFinite)) starSaved = raw.star;
    if (raw?.calling) ended = 'star'; // the call was made: it finished
    if (Array.isArray(raw?.lost)) for (const id of raw.lost) if (typeof id === 'string') lost.add(id);
    if (raw?.comms && typeof raw.comms === 'object') for (const k of Object.keys(raw.comms)) if (raw.comms[k]) comms[k] = true;
    if (Number.isFinite(raw?.size) && raw.size >= 1) size = raw.size;
    if (typeof raw?.eating === 'string') eating = raw.eating;
  } catch {
    // unreadable save: whatever is missing is recomputed
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      city: cityDir ? cityDir.toArray() : undefined,
      bore: boreDir ? boreDir.toArray() : undefined,
      rotY: rotLock ?? undefined,
      at,
      eaten,
      size,
      eating: eating ?? undefined,
      end: ended ?? undefined,
      star: (endgame && endgame.starAbs()) || starSaved || undefined,
      calling: endgame && endgame.active() ? true : undefined,
      lost: lost.size ? [...lost] : undefined,
      comms: Object.keys(comms).length ? comms : undefined,
    }));
  } catch {
    // storage full or blocked: the world still changes for this session
  }
}

let scene = null;

export function init(deps, fxOut) {
  terra = deps.planets.find((p) => p.cfg.name === 'terra');
  camera = deps.camera;
  scene = deps.scene;
  fx = fxOut;
  coin = deps.coin || null;
  if (coin && !coin.cfg) coin.cfg = { name: 'stevenlacey' };
  buildFrame();
  buildWormhole();
  buildSphere();
  buildSwarm();
  buildTunnel();
  buildCity();
  assim = createAssimilator({
    scene, terra, camera, fx, sunWorld, setRumble,
    find: worldByName,
    grow: growTo,
    done: ateOne,
  });
  const stage = questStage(SECRET);
  if (stage === 'ship') {
    // the finished world: everything in its last pose, parked where it was left
    loadSaved();
    if (cityDir) placeCity();
    if (rotLock !== null) terra.spinLock = rotLock;
    state = 'rest';
    pose(END);
    restoreEaten();
  } else if (stage === 'done') {
    // act one was seen; act two has not run. It runs now, wherever the ship is.
    loadSaved();
    if (cityDir) placeCity();
    state = 'play';
    held = false;
    playT = (SCRIPT * C.TENRETNI_DURATION) / SCRIPT;
    lastU = SCRIPT;
    pose(SCRIPT);
  } else pose(0);
}

// ---------------------------------------------------------------------------
// act two: what terra is rebuilt into
// ---------------------------------------------------------------------------

// Pick the bore's axis and build everything that hangs off it. Runs once, when
// terra stops turning (or at load into a later stage).
function buildShip() {
  if (shipBuilt) return;
  shipBuilt = true;
  const R = terra.radius;
  const rotY = rotLock ?? terra.surface.rotation.y;
  if (!boreDir) {
    // Facing the patio, swung a little further round from the city so the
    // opening and the capital do not meet: both worked out in the event frame.
    const v = _a.copy(terraC).negate().normalize(); // terra -> patio
    const c = _b.copy(cityDir).applyAxisAngle(Y, rotY).applyQuaternion(viewQuatInv);
    _c.crossVectors(c, v);
    if (_c.lengthSq() < 1e-6) _c.set(0, 1, 0);
    _c.normalize();
    boreDir = v.clone().applyAxisAngle(_c, 0.56).applyQuaternion(viewQuat).applyAxisAngle(Y, -rotY).normalize();
  }

  boreGroup = new THREE.Group();
  boreGroup.quaternion.setFromUnitVectors(Y, boreDir);
  terra.surface.add(boreGroup);

  shellU = { uTime: { value: 0 }, uHeat: { value: 0 }, uHdr: { value: C.TENRETNI_HDR } };
  innerShell = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.9, 64, 40),
    new THREE.ShaderMaterial({ vertexShader: commonVert, fragmentShader: shellFrag, uniforms: shellU, side: THREE.BackSide })
  );
  boreGroup.add(innerShell);

  coreU = { uTime: { value: 0 }, uHeat: { value: 0 } };
  core = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.44, 48, 32),
    new THREE.ShaderMaterial({ vertexShader: commonVert, fragmentShader: coreFrag, uniforms: coreU })
  );
  boreGroup.add(core);

  // the rim: a unit ring, scaled and slid along the axis as the bore opens
  const rimMat = hullMaterial(46); // the ring is built at unit radius
  rimU = rimMat.uniforms;
  rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 10, 96).rotateX(Math.PI / 2), rimMat);
  boreGroup.add(rim);

  // the shield: an iris of plates that closes over the bore once the world
  // has fed (uClose 0 open .. 1 shut, closing from the rim inward)
  shieldU = { uClose: { value: 0 }, uSun: { value: sunWorld }, uTime: { value: 0 }, uHdr: { value: C.TENRETNI_HDR } };
  shield = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.006, 72, 24, 0, Math.PI * 2, 0, BORE_ANGLE + 0.03),
    new THREE.ShaderMaterial({
      uniforms: shieldU,
      vertexShader: commonVert,
      fragmentShader: `varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vView;
        uniform float uClose; uniform vec3 uSun; uniform float uTime; uniform float uHdr;
        void main() {
          if (vUv.y > uClose) discard;                 // v = 0 at the rim, 1 at the centre
          float petal = fract(vUv.x * 12.0 + vUv.y * 0.6);
          float seam = 1.0 - smoothstep(0.0, 0.035, min(petal, 1.0 - petal));
          float band = 1.0 - smoothstep(0.0, 0.04, abs(fract(vUv.y * 5.0) - 0.5));
          vec3 N = normalize(vWorldNormal), S = normalize(uSun), V = normalize(vView);
          float day = smoothstep(-0.1, 0.5, dot(N, S));
          vec3 base = vec3(0.16, 0.17, 0.18) * (0.8 + 0.4 * step(0.5, fract(vUv.x * 6.0)));
          vec3 lit = base * (0.07 + 1.3 * day) * (1.0 - 0.7 * seam);
          lit += vec3(0.6) * pow(max(dot(N, normalize(S + V)), 0.0), 30.0) * day;
          lit += vec3(0.15, 1.0, 0.45) * (seam * 0.5 + band * 0.12) * uHdr * (0.7 + 0.3 * sin(uTime * 1.3));
          lit += vec3(1.0, 0.5, 0.15) * smoothstep(uClose - 0.03, uClose, vUv.y) * 2.0; // the closing lip, lit from inside
          gl_FragColor = vec4(lit, 1.0);
        }`,
      side: THREE.DoubleSide,
    })
  );
  shield.visible = false;
  boreGroup.add(shield);

  // engines: three bells opposite the bore, each with a plume
  engines = new THREE.Group();
  engines.rotation.x = Math.PI; // +Y of the group now points away from the bore
  boreGroup.add(engines);
  const engMat = hullMaterial(0.05);
  engineU = engMat.uniforms;
  plumeU = { uTime: { value: 0 }, uOn: { value: 0 } };
  const plumeMat = new THREE.ShaderMaterial({
    uniforms: plumeU,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uOn;
      void main(){ float a = pow(vUv.y, 1.6) * (0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 18.0));
        vec3 c = mix(vec3(0.1, 1.0, 0.5), vec3(0.9, 1.0, 0.95), pow(vUv.y, 6.0));
        gl_FragColor = vec4(c * a * uOn * 2.6, 1.0); }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const tilt = 0.34;
    const e = new THREE.Group();
    e.position.set(Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a)).multiplyScalar(R * 0.96);
    e.quaternion.setFromUnitVectors(Y, _a.copy(e.position).normalize());
    e.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.2, R * 0.11, R * 0.34, 20, 1, true).translate(0, R * 0.17, 0), engMat));
    e.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.115, R * 0.115, R * 0.1, 20).translate(0, R * 0.02, 0), engMat));
    // plume: uv.y = 1 at the bell, 0 at the tip
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.02, R * 0.17, R * 1.5, 20, 1, true).translate(0, R * 1.02, 0), plumeMat);
    pl.geometry.attributes.uv.array.forEach((_, k, arr) => { if (k % 2) arr[k] = 1 - arr[k]; });
    pl.frustumCulled = false;
    e.add(pl);
    engines.add(e);
  }
  engMat.side = THREE.DoubleSide;

  // spires over the rest of the globe, away from the bore and the first city
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const rad = new THREE.InstancedBufferAttribute(new Float32Array(SPIRES), 1);
  geo.setAttribute('aRad', rad);
  const spMat = hullMaterial(0.14);
  spireU = spMat.uniforms;
  spires = new THREE.InstancedMesh(geo, spMat, SPIRES);
  spires.frustumCulled = false;
  const r = rng(9091);
  const cosBore = Math.cos(BORE_ANGLE + 0.07);
  const cosCity = Math.cos(C.TENRETNI_CITY_SPAN + 0.03);
  for (let i = 0; i < SPIRES; i++) {
    do {
      const z = r() * 2 - 1, th = r() * Math.PI * 2, k = Math.sqrt(1 - z * z);
      _a.set(k * Math.cos(th), z, k * Math.sin(th));
    } while (_a.dot(boreDir) > cosBore || _a.dot(cityDir) > cosCity);
    const ground = terra.body.groundAtLocal ? terra.body.groundAtLocal(_a) : 0;
    const tall = 18 + 110 * r() * r();
    const wide = 10 + 26 * r();
    _q.setFromUnitVectors(Y, _a);
    _q2.setFromAxisAngle(Y, r() * Math.PI);
    _q.multiply(_q2);
    rad.setX(i, Math.acos(Math.min(Math.max(_a.dot(cityDir), -1), 1)) / Math.PI);
    _b.copy(_a).multiplyScalar(R + ground - 2);
    _m.compose(_b, _q, _s.set(wide, tall, wide * (0.6 + 0.8 * r())));
    spires.setMatrixAt(i, _m);
  }
  terra.surface.add(spires);
}

function poseShip(u) {
  const locked = u >= T_LOCK;
  if (locked && terra.spinLock == null) {
    if (rotLock === null) rotLock = terra.surface.rotation.y;
    terra.spinLock = rotLock;
  } else if (!locked && terra.spinLock != null && state !== 'rest') {
    terra.spinLock = null; // debug seek backwards
    rotLock = null;
  }
  if (locked && cityDir) buildShip();
  const spread = ease(seg(u, 94, 132));
  const bore = ease(seg(u, 120, 152));
  const air = 1 - ease(seg(u, 96, 124));
  setPlanetShip('terra', air, boreDir, bore > 0 ? Math.cos(BORE_ANGLE * bore) : 1);
  if (!shipBuilt) return spread;

  const R = terra.radius;
  const open = bore > 0;
  boreGroup.visible = locked;
  innerShell.visible = core.visible = rim.visible = open;
  const ang = BORE_ANGLE * Math.max(bore, 0.02);
  rim.position.y = R * Math.cos(ang);
  rim.scale.set(R * Math.sin(ang), R * Math.sin(ang), R * Math.sin(ang));
  const heat = clamp01(0.25 + 0.75 * ease(seg(u, 130, 158)) + (sail ? 0.4 : 0));
  coreU.uHeat.value = heat;
  shellU.uHeat.value = heat;

  const grow = ease(seg(u, 140, 158));
  engines.visible = grow > 0;
  engines.scale.setScalar(Math.max(grow, 0.001));
  plumeU.uOn.value = ease(seg(u, 158, 163)) * (sail ? 1 : 0.28);

  spires.visible = spread > 0;
  spireU.uGrow.value = spread;

  // the capital, on the strike point
  if (u >= T_CAPITAL && !capital && cityDir) {
    capital = createCapital(terra, cityDir, rotLock ?? terra.surface.rotation.y, STORY);
  }
  if (capital) capital.group.visible = u >= T_CAPITAL;
  return spread;
}

// ---------------------------------------------------------------------------
// the capital's story: what the robots say and what the console does
// ---------------------------------------------------------------------------

const ROBOT_NAMES = {
  warden: 'The Warden', navigator: 'Navigator', sentry: 'Sentry', operator: 'Operator', counter: 'Counter',
};
const who = (role) => ({ name: ROBOT_NAMES[role] || 'Unit', species: 'Tenretni', cityId: 'Tenretni Capital' });
const CONSOLE = { name: 'Navigation Console', species: 'Tenretni Capital', cityId: 'Tenretni Capital' };
const hereName = () => LABELS[at] || 'Terra';

const STORY = {
  talk(role, i) {
    const speaker = who(role);
    if (sail) {
      return { speaker, lines: role === 'warden'
        ? [`Under way. Heading: ${LABELS[sail.name]}. Do not leave the deck.`]
        : ['Under way.'] };
    }
    if (assim.active()) {
      return { speaker, lines: role === 'warden'
        ? [`${LABELS[assim.target()]} is being taken in. Watch, if you like.`]
        : ['Assimilating.'] };
    }
    if (role === 'warden' && eaten.length) {
      const left = Object.keys(WATER_WORLDS).filter((k) => !eaten.includes(k));
      return { speaker, lines: left.length
        ? [
          `${WATER_WORLDS[eaten[eaten.length - 1]]} is part of this world now. We are larger. The count is correct.`,
          `One world with water remains in your log: ${WATER_WORLDS[left[0]]}. The navigation deck is open to you.`,
        ]
        : [
          'Two oceans. Both ours. This world has air again, and a shield over its heart.',
          'You have been useful, pilot. Tenretni does not forget what is useful: your vessel has a new room. Starboard side of your gallery.',
          'It holds what we hold. Every world we take in will be there for you to walk. The first is the ice world you gave us.',
          'We no longer need a heading. The count continues without you.',
        ] };
    }
    if (role === 'warden') {
      if (at !== 'terra') {
        return { speaker, lines: [
          `${hereName()}. Water confirmed. The count is correct.`,
          'We hold here. What happens next is not yours to choose.',
          'The navigation deck remains open to you. There is one other world with water in your log.',
        ] };
      }
      return { speaker, lines: [
        'Pilot. Your vessel was read on approach. Its navigation log has been copied. All of it.',
        'This world has been recompiled. Its core is the engine. It moves now.',
        'It does not move without a heading. The heading is yours to give. That is the arrangement.',
        'We require a planet with water. Your log holds two. Go to the navigation deck and choose.',
      ] };
    }
    if (role === 'navigator') {
      return { speaker, lines: at === 'terra'
        ? ['The chart is yours. We drew it from your log.', 'Two worlds with water. Use the console.']
        : [`Arrived: ${hereName()}.`, 'The console will still take a heading.'] };
    }
    if (role === 'sentry') return { speaker, lines: ['You are expected. Walk.'] };
    if (role === 'operator') return { speaker, lines: ['Core output nominal.', 'Do not touch the consoles. Not these.'] };
    const counts = [
      'Four hundred and twelve trillion, nine hundred billion, six. Seven. Eight.',
      'One ocean. Removed. Next.',
      'Tenretni counts. Tenretni is never wrong. Tenretni counts.',
    ];
    return { speaker, lines: [counts[i % counts.length]] };
  },
  useConsole() {
    if (sail) return { speaker: CONSOLE, lines: [`HEADING LOCKED: ${LABELS[sail.name].toUpperCase()}. UNDER WAY.`] };
    if (assim.active()) {
      return { speaker: CONSOLE, lines: [`ASSIMILATING: ${LABELS[assim.target()].toUpperCase()}. HELM LOCKED.`] };
    }
    if (waterDone()) {
      const next = nextMeal();
      return { speaker: CONSOLE, lines: [
        'HELM: AUTONOMOUS. PILOT INPUT NO LONGER REQUIRED.',
        next ? `NEXT: ${LABELS[next].toUpperCase()}.` : 'NEXT: THE WAY WE CAME.',
      ] };
    }
    const options = Object.keys(WATER_WORLDS)
      .filter((k) => k !== at && !eaten.includes(k))
      .map((k) => ({
        label: k === 'wyattmattoe' ? 'Wyattmattoe — the ice world' : 'Neptunia — the deep ocean',
        outcomeTag: `tenretni:sail:${k}`,
      }));
    if (!options.length) {
      return { speaker: CONSOLE, lines: ['NAVIGATION DATA: EXHAUSTED.', 'NO WORLDS WITH WATER REMAIN IN YOUR LOG.'] };
    }
    options.push({ label: 'Not yet.', outcomeTag: 'tenretni:sail:none' });
    return {
      speaker: CONSOLE,
      lines: [
        'NAVIGATION DATA: IMPORTED FROM VISITING VESSEL.',
        `PRESENT POSITION: ${hereName().toUpperCase()}. WORLDS WITH WATER IN RANGE: ${options.length - 1}.`,
      ],
      offer: { kind: 'choice', prompt: 'Set a heading for this world?', options },
    };
  },
  choice(tag) {
    const m = /^tenretni:sail:(\w+)$/.exec(tag ?? '');
    if (!m || !WATER_WORLDS[m[1]] || !startSail(m[1])) return null;
    return { speaker: CONSOLE, lines: [`HEADING ACCEPTED: ${WATER_WORLDS[m[1]].toUpperCase()}.`, 'CORE TO DRIVE. HOLD ON TO SOMETHING.'] };
  },
};

// ---------------------------------------------------------------------------
// the voyage: the whole world goes to another world and stops beside it
// ---------------------------------------------------------------------------

// Where the worldship parks at `target`: on the line back toward `from`.
function standoff(target, fromDir, out) {
  // (the target's built size: it may since have been scaled away to nothing)
  return out.copy(fromDir).multiplyScalar((target.baseRadius ?? target.radius) + terra.radius + SAIL_STANDOFF);
}

function startSail(name, dur = SAIL_TIME) {
  const target = worldByName(name);
  if (!target || sail || exit || ended || name === at || state !== 'rest' || assim.active() || eaten.includes(name)) return false;
  const rel = new THREE.Vector3().subVectors(terra.group.position, target.group.position);
  const off = standoff(target, _a.copy(rel).normalize(), new THREE.Vector3());
  rel.sub(off); // from the parking spot back to where terra is now
  sail = { name, target, t: 0, rel, off, dur };
  at = name; // saved at once: a reload mid-voyage has already arrived
  save();
  fx.kick = 0.8;
  uiSound('impact');
  return true;
}

function stepSail(delta) {
  sail.t = Math.min(sail.t + delta / sail.dur, 1);
  const k = ease(sail.t);
  // written between live vectors, so a floating-origin rebase cannot fight it
  _a.copy(sail.target.group.position).add(sail.off).addScaledVector(sail.rel, 1 - k);
  if (delta > 0) sailVel.copy(_a).sub(terra.group.position).divideScalar(delta);
  terra.group.position.copy(_a);
  setRumble(0.35 + 0.4 * Math.sin(Math.PI * sail.t));
  if (sail.t >= 1) {
    const name = LABELS[sail.name];
    sail = null;
    sailVel.set(0, 0, 0);
    setRumble(0);
    fx.kick = 0.6;
    showNavToast(`${name.toUpperCase()} — THE WORLD HOLDS HERE`, 7);
    beginEat(at);
  }
}

// ---------------------------------------------------------------------------
// feeding: the worldship takes the planet it has been brought to
// ---------------------------------------------------------------------------

function beginEat(name) {
  const water = !!WATER_WORLDS[name];
  if (eaten.includes(name) || !assim.start(name, size, size * (water ? GROWTH : SMALL_GROWTH), !water)) return;
  eating = name; // saved: a reload part-way finds the planet already gone
  save();
}

// The worldship is `k` times its built size; `g` 0..1 through this growth.
function growTo(k, g) {
  setPlanetScale(terra, k);
  if (capital) capital.reseat(k);
  dressShip(eaten.length + (g > 0 ? g : 0));
}

// What it wears for how much it has eaten (fractional while growing): after
// one world the shield closes over the bore; after two it has air again.
function dressShip(fed) {
  if (!shipBuilt) return;
  const close = clamp01(fed);
  shield.visible = close > 0;
  shieldU.uClose.value = ease(close);
  const air = clamp01(fed - 1) * 0.55; // thin: a haze, not a glare
  const a = terra.atmosphere.userData;
  terra.atmosphere.visible = air > 0.02;
  a.limbMat.uniforms.uColor.value.setRGB(0.1, 0.75, 0.38).multiplyScalar(air);
  a.scatterMat.uniforms.uBeta.value
    .set(0.1, 0.75, 0.38)
    .multiplyScalar((C.ATMO_TAU / C.ATMO_SCALE_HEIGHT / 0.75) * air);
}

function ateOne(name, k1) {
  eaten.push(name);
  size = k1;
  eating = null;
  clockT = 0;
  growTo(size, 0);
  save();
  addCodex(`${LABELS[name] || name}, assimilated`);
  thank();
  if (!fleets && !ended) {
    startWar();
    showNavToast('THE OTHER WORLDS HAVE SEEN IT. FLEETS ARE LAUNCHING.', 8);
  }
  if (PROGRAMS.some((p) => p.id === name) && hasUpgrade('holodeck')) {
    showViewToast(`HOLODECK — NEW PROGRAM: ${LABELS[name].toUpperCase()}`, 7);
  }
}

// Two oceans delivered: the worldship pays with a room (src/holodeck.js).
function thank() {
  if (!waterDone() || hasUpgrade('holodeck')) return;
  grantUpgrade('holodeck');
}

// --- the war: the fleets of the worlds it has not reached yet ---

function startWar() {
  if (fleets || ended === 'gone' || !eaten.length) return;
  explosions = createExplosions(scene);
  fleets = createFleets({
    scene,
    find: worldByName,
    explode: (pos, scale) => {
      explosions.fire(pos, scale);
      // close enough to feel it
      if (pos.distanceToSquared(camera.position) < 9e6) fx.kick = Math.max(fx.kick, 0.5);
    },
    lost,
    onLost: (id) => {
      lost.add(id);
      save();
    },
    story: FLEET_STORY,
    sunDir: sunWorld,
  });
  endgame = createEndgame({
    scene, camera, terra, fx, setRumble,
    extra: coin ? [coin] : [],
    fleets: () => fleets,
    explode: (pos, scale) => explosions.fire(pos, scale),
    comms,
    worldshipAlive: () => !ended && !exit && state === 'rest',
    killWorldship: () => {
      if (assim.active()) assim.finishNow();
      sail = null;
      sailVel.set(0, 0, 0);
      ended = 'star';
      removePlanet(terra, true);
      setNavHidden(terra.group.position, true);
      addCodex('The New Star');
    },
    save,
  });
  if (ended === 'star') endgame.restore(starSaved || fallbackStar());
}

// A save that says the call was made but not where the star is (it was written
// before the volley): where the worldship is now will do.
const fallbackStar = () => [terra.group.position.x, terra.group.position.y, terra.group.position.z];

// What the fleets' people say. A captain will open a comm channel if asked;
// with all three open the pilot can call them together (the ending).
const CAPTAINS = {
  rustia: { title: 'Shift-Captain', names: ['Orrin Vask', 'Dela Roon', 'Haim Kett'] },
  saturnia: { title: 'Cantor', names: ['Ilse Marrow', 'Teo Vandry', 'Suvi Aln'] },
  'wavemall prime': { title: 'Floor Manager', names: ['Brandi Lux', 'Chad Meridian', 'Tawny Voss'] },
};
const VOICE = {
  rustia: {
    hello: [
      'You are the pilot off that freighter. Wipe your boots. This deck was a smelter floor before it was a warship.',
      'We watched that thing drink two oceans. Rustia has no ocean, and it is coming anyway.',
      'Three fleets, three peoples who do not like each other much. Nobody has got us all in one place.',
    ],
    ask: 'Open a channel to this ship?',
    yes: ['Done. One word from you and every furnace I have is pointed where you say.', 'Get the other two. Then get close to it, and call.'],
    open: ['Channel is open. We are listening for you. Do not waste it.'],
    crew: ['Seam pressure is holding. Mostly.', 'My brother went down the Emberdeep and came up a gunner. Strange days.'],
  },
  saturnia: {
    hello: [
      'Be welcome. You have come a long way through a great deal of noise.',
      'We have sung over every world it has taken. We are tired of that song.',
      'Our lances are true but they are few. It would take all of us, at once, at its heart.',
    ],
    ask: 'Ask for a channel to this ship?',
    yes: ['It is given. When you call, the halos will answer.', 'Go to the iron people, and to the bright ones. Then stand before it and call.'],
    open: ['We hold the channel open and we hold you in mind.'],
    crew: ['The rings ring true today.', 'I have never fired in anger. I am practising the anger.'],
  },
  'wavemall prime': {
    hello: [
      'Hi! Welcome aboard the fleet, are you finding everything okay?',
      'So that planet thing is technically a competitor now. Corporate has approved a response.',
      'We cannot coordinate with the other fleets without a customer-side point of contact. That could be you!',
    ],
    ask: 'Sign up for a direct channel?',
    yes: ['Amazing. You are all signed up. Call us any time and the whole fleet attends, no purchase necessary.', 'Get the other two on board and we will see you at the event.'],
    open: ['Your channel is active! Is there anything else I can help you with today?'],
    crew: ['Clean up on deck nine. It is always deck nine.', 'These lights were for the sales floor. Now they are targeting. Same lights.'],
  },
};
const captainOf = (ship) => {
  const c = CAPTAINS[ship.faction];
  const i = Number(ship.id.slice(-1)) % c.names.length;
  return { name: `${c.title} ${c.names[i]}`, species: LABELS[ship.faction], cityId: ship.name };
};
const FLEET_STORY = {
  captain(ship) {
    const v = VOICE[ship.faction];
    const speaker = captainOf(ship);
    if (ended) return { speaker, lines: ['It is over.'] };
    if (comms[ship.faction]) {
      const n = Object.keys(VOICE).filter((f) => comms[f]).length;
      return { speaker, lines: [...v.open, n >= 3 ? 'All three fleets are on your word. Go and stand in front of it.' : `${n} of three fleets are with you.`] };
    }
    return {
      speaker,
      lines: v.hello.slice(),
      offer: {
        kind: 'choice',
        prompt: v.ask,
        options: [
          { label: 'Yes. Open it.', outcomeTag: `fleet:comm:${ship.faction}` },
          { label: 'Not now.', outcomeTag: 'fleet:comm:none' },
        ],
      },
    };
  },
  crew(ship, i) {
    return { speaker: { name: 'Crew', species: LABELS[ship.faction], cityId: ship.name }, lines: [VOICE[ship.faction].crew[i % 2]] };
  },
  choice(tag, ship) {
    const m = /^fleet:comm:(.+)$/.exec(tag ?? '');
    if (!m || !VOICE[m[1]] || m[1] !== ship.faction) return null;
    comms[m[1]] = true;
    save();
    showViewToast(`COMM CHANNEL OPEN — ${ship.label}`, 6);
    return { speaker: captainOf(ship), lines: VOICE[m[1]].yes.slice() };
  },
  // everything else out there, for the lance: the hull you stand on is not a target
  targets(ship) {
    _targets.length = 0;
    for (const s of fleets.ships) {
      if (!s.alive || s === ship || !s.group.visible) continue;
      _targets.push({ id: s.id, pos: s.group.position, r: s.cls.radius, label: s.label });
    }
    return _targets;
  },
  onHit(id) {
    if (fleets.destroy(id)) showViewToast('TARGET DESTROYED. THAT WAS ONE OF OURS.', 6);
  },
};
const _targets = [];

// Docking and boarding (src/game.js): the nearest ship, its deck, and holding
// a ship in existence while the pilot is on it.
export const nearestVessel = (pos) => (fleets && !ended ? fleets.nearest(pos) : null);
export const vesselSite = (ship) => (fleets ? fleets.site(ship) : null);
export const holdVessel = (id) => fleets && fleets.hold(id);
export const commState = () => ({ ...comms });

// Which planet the swarm is fighting over, and how far gone it is: the one
// being eaten, else the next of the last three once the quick ones are done.
function siege() {
  const now = assim.active() ? assim.target() : null;
  if (now && SIEGE.includes(now)) {
    _siege.name = now;
    _siege.k = assim.progress();
    return _siege;
  }
  const next = !sail || SIEGE.includes(sail.name) ? nextMeal() : null;
  if (next && SIEGE.includes(next) && waterDone()) {
    _siege.name = next;
    _siege.k = 0;
    return _siege;
  }
  return null;
}

// --- the clock: what it does once it needs no pilot ---

const nextMeal = () => QUICK.concat(SIEGE).find((n) => !eaten.includes(n) && worldByName(n)) || null;

// `aboard`: the pilot is docked at or walking the capital. It will not leave
// through the wormhole with them on it.
function stepClock(delta, aboard, flying) {
  if (ended || exit || sail || assim.active() || !waterDone()) return;
  clockT += delta;
  const next = nextMeal();
  if (next) {
    const quick = QUICK.includes(next);
    if (clockT < (quick ? C.TENRETNI_QUICK_WAIT : C.TENRETNI_SIEGE_WAIT)) return;
    if (startSail(next, quick ? QUICK_SAIL : SIEGE_SAIL) && flying) {
      showNavToast(`THE WORLDSHIP IS MOVING — ${LABELS[next].toUpperCase()}`, 6);
    }
  } else if (clockT > 20 && !aboard) {
    // nothing left: back the way Tenretni came
    worm.getWorldPosition(_c);
    exit = { t: 0, rel: new THREE.Vector3().subVectors(terra.group.position, _c), k0: size };
    if (flying) showNavToast('THE WORLDSHIP IS LEAVING', 7);
  }
}

function stepExit(delta) {
  exit.t = Math.min(exit.t + delta / EXIT_TIME, 1);
  const k = ease(exit.t);
  worm.getWorldPosition(_c);
  terra.group.position.copy(_c).addScaledVector(exit.rel, 1 - k);
  // it goes in the way the first one did: smaller, into the light
  setPlanetScale(terra, exit.k0 * (1 - 0.985 * ease(seg(exit.t, 0.55, 1))));
  if (capital) capital.reseat(terra.scale);
  setRumble(0.5 * Math.sin(Math.PI * exit.t));
  wormU.uPower.value = 0.85 + 0.6 * Math.sin(Math.PI * seg(exit.t, 0.5, 1));
  if (exit.t >= 1) {
    exit = null;
    setRumble(0);
    fx.kick = 0.8;
    fx.flash = 0.5;
    gone();
    save();
    addCodex('The Worldship, departed');
    showNavToast('IT HAS GONE THROUGH. THERE IS NOTHING LEFT HERE.', 10);
  }
}

// The worldship is out of this system for good.
function gone() {
  ended = 'gone';
  if (fleets) fleets.clear();
  removePlanet(terra, true);
  setNavHidden(terra.group.position, true);
  wormU.uPower.value = 0.65;
}

// --- the holodeck (src/holodeck.js, src/holoPanel.js; sessions in game.js) ---

export const programs = () => PROGRAMS.map((p) => ({ ...p, unlocked: eaten.includes(p.id) }));

// Put an assimilated world back the way it was for a holodeck session, or put
// it away again afterwards. Returns the world (a planet record or the coin).
export function holoWorld(id, on) {
  const w = worldByName(id);
  if (!w || !eaten.includes(id)) return null;
  if (w.surface) {
    if (on) {
      removePlanet(w, false);
      setPlanetScale(w, 1);
      setPlanetDrain(id, 0, null, 0);
      if (w.meltBase) setPlanetMelt(w, 0);
      w.spinLock = undefined;
    } else removePlanet(w, true);
  } else {
    w.removed = !on;
    w.group.visible = on;
    w.group.scale.setScalar(1);
  }
  return w;
}

// Load into a worldship that has already fed: its size, its parking spot,
// and the planets that are no longer in space.
function restoreEaten() {
  if (eating && !eaten.includes(eating)) {
    eaten.push(eating); // the save was made part-way through that one
    size *= GROWTH;
  }
  eating = null;
  if (size !== 1) setPlanetScale(terra, size);
  if (capital) capital.reseat(size);
  dressShip(eaten.length);
  if (at !== 'terra') parkAt(at);
  for (const name of eaten) {
    const w = worldByName(name);
    if (!w || w.removed) continue;
    if (w.surface) removePlanet(w, true);
    else {
      w.removed = true;
      w.group.visible = false;
    }
    setNavHidden(w.group.position, true);
  }
  thank(); // a save from before the room existed
  if (ended === 'gone') gone();
  else {
    if (ended === 'star') {
      removePlanet(terra, true);
      setNavHidden(terra.group.position, true);
    }
    startWar();
  }
}

// Put terra straight at its parking spot beside `name` (load, world reset).
// Terra must be at its first position when this is called.
function parkAt(name) {
  const target = worldByName(name);
  if (!target) return;
  _b.subVectors(terra.group.position, target.group.position).normalize();
  terra.group.position.copy(target.group.position).add(standoff(target, _b, _a));
}

// Lighting: terra's bearing to the sun was fixed at boot; a world that moves
// has to keep it current, and so do the materials here that share it.
function trackSun() {
  terra.sunBase.subVectors(sun.group.position, terra.group.position).normalize();
  sunWorld.copy(terra.sunBase);
}

export const capitalSite = () => (state === 'rest' && capital && !ended && !exit ? capital : null);
export const sailVelocity = () => (sail ? sailVel : null);

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
  if (u < T_STRIKE && cityDir && state === 'play' && questStage(SECRET) === 'armed') cityDir = null; // debug seek backwards

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
  // act two widens the city from its first patch to the whole globe
  const spread = u > SCRIPT ? ease(seg(u, 94, 132)) : 0;
  const span = C.TENRETNI_CITY_SPAN + (Math.PI - C.TENRETNI_CITY_SPAN) * spread;
  setPlanetDrain('terra', drain, cityDir, tech, span);
  cityHolder.visible = tech > 0;
  towerU.uGrow.value = tech;
  poseShip(u);
}

// Ring frames along the tunnel. They appear as it passes them and are pulled
// back in when it breaks — all but two, which are left to drift.
function poseRings(u, len, gone) {
  const drift = Math.min(Math.max(u - 74, 0), END - 74);
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
  // act two
  if (hit(SCRIPT)) finishActOne();
  if (flying && hit(96)) showViewToast('TERRA — THE CITY IS SPREADING', 6);
  if (hit(121)) {
    fx.kick = 0.7;
    uiSound('impact');
    if (flying) showViewToast('TERRA — CRUST BREACH. CORE EXPOSED', 6);
  }
  if (hit(158)) {
    fx.kick = 0.9;
    uiSound('impact');
    if (flying) showViewToast('TERRA — DRIVE IGNITION', 5);
  }
}

function rumbleAt(u) {
  const open = ease(seg(u, 0, 10)) * (1 - ease(seg(u, 84, 90)));
  const transit = Math.sin(Math.PI * seg(u, 11, 27)) + Math.sin(Math.PI * seg(u, 77, 89));
  const pipe = seg(u, 40, T_STRIKE) * (1 - seg(u, 73, 76));
  const rebuild = 0.25 * seg(u, 94, 100) + 0.3 * Math.sin(Math.PI * seg(u, 120, 152)) + 0.35 * seg(u, 156, 160);
  return clamp01(0.2 * open + 0.45 * transit + 0.5 * pipe + (u > SCRIPT ? rebuild * (1 - seg(u, 162, END)) : 0));
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

export const holding = () => state === 'glide' || state === 'wait' || (state === 'play' && held);

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

export function update(delta, t, onDeck, flying, aboard) {
  time = t;
  wormU.uTime.value = t;
  sphereU.uTime.value = t;
  tubeU.uTime.value = t;
  ringU.uTime.value = t;
  towerU.uTime.value = t;
  if (shipBuilt) {
    coreU.uTime.value = t;
    shellU.uTime.value = t;
    rimU.uTime.value = t;
    spireU.uTime.value = t;
    engineU.uTime.value = t;
    plumeU.uTime.value = t;
  }
  if (worm.visible) worm.lookAt(camera.position);
  swarmU.uScale.value = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((camera.fov * Math.PI) / 360);

  if (state === 'wait') {
    if (onDeck) {
      state = 'play';
      held = true;
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
    const u = Math.min((playT * SCRIPT) / C.TENRETNI_DURATION, END);
    pose(u);
    beats(lastU, u, flying);
    setRumble(rumbleAt(u));
    lastU = u;
    if (u >= END) finish(flying);
  } else if (state === 'rest') {
    // the two loose ring frames keep turning; the world may be under way
    poseRings(END, tunnelL, 1);
    if (sail) {
      stepSail(delta);
      plumeU.uOn.value = 0.28 + 0.72 * Math.sin(Math.PI * Math.min(sail ? sail.t : 1, 1));
      const hot = clamp01(1 + 0.4);
      coreU.uHeat.value = hot;
      shellU.uHeat.value = hot;
    } else if (plumeU.uOn.value !== 0.28) {
      plumeU.uOn.value = 0.28;
      coreU.uHeat.value = 1;
      shellU.uHeat.value = 1;
    }
    if (exit) stepExit(delta);
    if (!ended) {
      trackSun();
      if (!endgame || !endgame.active()) stepClock(delta, aboard, flying);
    }
    if (endgame) endgame.update(delta, t, flying);
    if (assim.active()) assim.update(delta, t, flying);
    if (fleets) {
      fleets.update(delta, t, ended || (endgame && endgame.active()) ? null : siege());
      explosions.update(delta, camera);
    }
    if (shieldU) shieldU.uTime.value = t;
    if (capital) capital.update(delta, t, camera.position, sail ? 1 : 0);
  }
}

// Act one is over (script time 90): terra is drained and that is saved. The
// script carries straight on into act two.
function finishActOne() {
  save();
  setQuestStage(SECRET, 'done');
  addCodex('Tenretni');
  showNavToast('TENRETNI HAS GONE. SOMETHING IS STILL MOVING ON TERRA.', 8);
}

// Act two is over: the world is a ship and the capital is open.
function finish(flying) {
  state = 'rest';
  held = false;
  setRumble(0);
  save();
  setQuestStage(SECRET, 'ship');
  addCodex('The Worldship');
  if (flying) showNavToast('TERRA IS A SHIP NOW. A LANDING BEACON IS LIT ON ITS CAPITAL.', 9);
}

// World reset (death, the actuality loop). restoreShiftables has just put
// terra back where it began, so the anchor is re-read from it and a parked
// worldship is put back beside its water world. An event still in act one is
// dropped (the stage is still 'armed'); act two simply carries on, unheld.
export function abort() {
  anchor.position.copy(terra.group.position);
  held = false;
  if (state === 'rest') {
    if (sail) {
      sail = null;
      sailVel.set(0, 0, 0);
      setRumble(0);
    }
    // a planet half-eaten when the world reset is simply finished off
    if (assim.active()) assim.finishNow();
    if (exit) {
      // half-way out when the world reset: it finishes leaving
      exit = null;
      gone();
      save();
    }
    if (at !== 'terra' && !ended) parkAt(at);
    // the ending, re-laid on the freshly restored system
    if (endgame && (endgame.active() || endgame.done())) {
      if (endgame.active() && !endgame.starAbs()) starSaved = fallbackStar();
      ended = 'star';
      removePlanet(terra, true);
      endgame.restore(endgame.starAbs() || starSaved);
    }
    return;
  }
  if (questStage(SECRET) !== 'armed') return; // act two in progress
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
  if (state === 'rest') return;
  state = 'play';
  held = true;
  playT = 0;
  lastU = 0;
}

export const debugSail = (name) => startSail(name);
export const debugEat = (u) => assim.seek(u);
export const debugClock = (sec) => { clockT = sec; };
export const debugFleets = () => fleets;
export const debugEnd = () => endgame;
export const debugComms = (on) => { for (const f of Object.keys(VOICE)) { if (on) comms[f] = true; else delete comms[f]; } };
export const debugStory = () => STORY;

export function debugSeek(u) {
  if (state === 'rest') return;
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
    u: state === 'play' ? lastU : state === 'rest' ? END : 0,
    held,
    at,
    sailing: sail ? { to: sail.name, t: sail.t } : null,
    eaten: eaten.slice(),
    clock: clockT,
    next: waterDone() ? nextMeal() : null,
    exiting: exit ? exit.t : null,
    ended,
    size,
    radius: terra.radius,
    eatingNow: assim ? assim.state() : null,
    removed: planets.filter((p) => p.removed).map((p) => p.cfg.name),
    fleets: fleets ? fleets.state() : null,
    bore: boreDir ? boreDir.toArray() : null,
    spinLock: terra.spinLock ?? null,
    capital: !!capital,
    terraPos: terra.group.position.toArray(),
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
