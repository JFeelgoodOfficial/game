/**
 * wonders.js
 * -----------------------------------------------------------------------
 * Library of large procedural landmarks ("wonders") plus a scatter helper
 * to place a curated set of them across a planet's surface/skyline.
 *
 * Coordinate frame (same as city.js):
 *   - Everything is parented to `planet.surface` (the spinning mesh) and
 *     positioned in UNROTATED object space, so planet spin + floating-
 *     origin rebasing carry it along for free.
 *   - `worldUp` is the world-space landing direction. We convert it into
 *     the surface's local (unrotated) frame by undoing `surface.rotation.y`
 *     before sampling terrain / placing objects, exactly like city.js.
 *   - Local +Y of every wonder group is aligned to the local radial "up"
 *     via `quaternion.setFromUnitVectors(yAxis, localUp)`; a yaw about that
 *     axis gives facing.
 *   - Explorable wonders sit inside/near the play radius and carry a
 *     `collider` (or per-part colliders folded into one array). Backdrop-
 *     class wonders (space elevator ribbon, ringworld arc) may sit far
 *     beyond the play radius and carry `collider: null`.
 *
 * All geometry is procedural (Box/Cylinder/Cone/Icosahedron/Extrude/Lathe),
 * no external assets, no custom lights (bloom threshold ~0.85 handles the
 * magenta neon). Randomness is seeded via mulberry32 so a given worldUp +
 * seed always regenerates identically.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import basicVert from './shaders/basic.vert?raw';
import pulseGlowVert from './shaders/pulseGlow.vert?raw';
import pulseGlowFrag from './shaders/pulseGlow.frag?raw';
import ribbonFrag from './shaders/ribbon.frag?raw';
import beamFrag from './shaders/beam.frag?raw';
import gatefilmFrag from './shaders/gatefilm.frag?raw';
import crystalVert from './shaders/crystal.vert?raw';
import crystalFrag from './shaders/crystal.frag?raw';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const C = {
  ASTRONAUT_HEIGHT: 1.9,          // reference scale unit
  BLOOM_THRESHOLD: 0.85,          // emissiveIntensity above this blooms
  MAGENTA: 0xd4408f,
  CYAN: 0x40d4c8,
  AMBER: 0xffb347,
  INDIGO: 0x2a1e4a,
  STONE: 0x6b6470,

  // Space elevator / orbital tether
  ELEVATOR_BASE_RADIUS: 22,       // anchor station base radius
  ELEVATOR_PLAZA_RADIUS: 30,      // walkable plaza around base
  ELEVATOR_TOWER_HEIGHT: 140,     // visible tower before ribbon thins to a line
  ELEVATOR_RIBBON_HEIGHT: 2600,   // total backdrop height (dwarfs everything)
  ELEVATOR_RIBBON_SEGMENTS: 14,   // tapered segments along the ribbon
  ELEVATOR_RIBBON_BASE_W: 9,      // ribbon width at ground
  ELEVATOR_RIBBON_TOP_W: 0.6,     // ribbon width near vanishing point
  ELEVATOR_PULSE_SPEED: 0.6,

  // Mega-arch / world gate
  ARCH_SPAN: 110,                 // clear width between legs
  ARCH_LEG_W: 16,                 // leg thickness
  ARCH_LEG_H: 90,                 // leg height to underside of lintel
  ARCH_THICKNESS: 22,             // arch depth (along walk axis)
  ARCH_RISE: 55,                  // extra height of the arch crown above legs
  ARCH_INLAY_COUNT: 5,

  // Crystal spire field
  CRYSTAL_COUNT: 22,
  CRYSTAL_FIELD_RADIUS: 60,
  CRYSTAL_MIN_H: 14,
  CRYSTAL_MAX_H: 70,
  CRYSTAL_MIN_R: 3,
  CRYSTAL_MAX_R: 9,
  CRYSTAL_GLOW_SPEED: 0.35,

  // Bioluminescent grove
  GROVE_TREE_COUNT: 26,
  GROVE_RADIUS: 55,
  GROVE_TRUNK_MIN_H: 10,
  GROVE_TRUNK_MAX_H: 26,
  GROVE_POD_COUNT_PER_TREE: 4,
  GROVE_SWAY_SPEED: 0.5,
  GROVE_SWAY_AMOUNT: 0.05,        // radians
  GROVE_SPORE_COUNT: 110,         // drifting additive spore points

  // Floating monoliths
  MONOLITH_COUNT: 7,
  MONOLITH_FIELD_RADIUS: 70,
  MONOLITH_MIN_H: 30,
  MONOLITH_MAX_H: 60,
  MONOLITH_MIN_HOVER: 8,
  MONOLITH_MAX_HOVER: 45,
  MONOLITH_BOB_SPEED: 0.25,
  MONOLITH_BOB_AMOUNT: 1.2,
  MONOLITH_SLAB_W: 26,
  MONOLITH_SLAB_D: 18,

  // Colossal statue / seated titan
  TITAN_SEAT_HEIGHT: 60,          // base/plinth height
  TITAN_TORSO_HEIGHT: 130,
  TITAN_TOTAL_HEIGHT: 260,        // roughly 137x astronaut height
  TITAN_SHOULDER_W: 90,
  TITAN_GAZE_PULSE_SPEED: 0.4,

  // Ringworld arc (optional backdrop)
  RINGWORLD_RADIUS: 4200,
  RINGWORLD_WIDTH: 60,
  RINGWORLD_SEGMENTS: 96,

  // Geyser organ (glacia — Hearthfall)
  GEYSER_CHIMNEYS: 9,
  GEYSER_MOUND_RADIUS: 46,
  GEYSER_MIN_H: 15,
  GEYSER_MAX_H: 60,
  GEYSER_CYCLE: 20,               // seconds between a chimney's vents
  GEYSER_PLUME_SECONDS: 4,

  // Colossal sundial (rustia — Solmara)
  SUNDIAL_GNOMON_H: 90,
  SUNDIAL_RING_RADIUS: 65,
  SUNDIAL_MARKERS: 12,
  SUNDIAL_DAY: 600,               // seconds for the bright marker's circuit

  // Leviathan ribs (neptunia — Indigo Reach)
  LEVIATHAN_RIB_PAIRS: 7,         // paired arcs -> 14 ribs
  LEVIATHAN_LENGTH: 200,          // nave length along the spine
  LEVIATHAN_RIB_MIN_H: 40,
  LEVIATHAN_RIB_MAX_H: 120,

  // Diamond veil (neptunia — Diamondwake)
  VEIL_RING_RADIUS: 30,
  VEIL_HOVER: 110,
  VEIL_POOL_RADIUS: 42,
  VEIL_STREAMS: 4,
  VEIL_STREAM_COUNT: 50,          // instanced glitter per stream

  // Ridge harp (wyattmattoe — Kite Saddle)
  HARP_PYLON_H: 80,
  HARP_SPAN: 120,
  HARP_STRINGS: 12,

  // Cirque bell (wyattmattoe — Cirquehollow)
  BELL_HEIGHT: 35,
  BELL_FRAME_H: 70,
  BELL_TOLL_PERIOD: 30,           // seconds between silent tolls
  BELL_TOLL_SECONDS: 4,

  // Frozen cascade (wyattmattoe — Icefall Landing)
  ICEFALL_CLIFF_H: 100,
  ICEFALL_WIDTH: 70,
  ICEFALL_SHEETS: 7,
  ICEFALL_POOL_RADIUS: 34,
};

const ALL_TYPES = [
  'elevator', 'arch', 'crystals', 'grove', 'monoliths', 'titan', 'ringworld',
  'geyser', 'sundial', 'leviathan', 'diamondveil', 'skyharp', 'bell', 'icefall',
];
const BACKDROP_TYPES = new Set(['elevator', 'ringworld']);

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(worldUp, salt = 0) {
  const s =
    Math.floor((worldUp.x + 2) * 73856093) ^
    Math.floor((worldUp.y + 2) * 19349663) ^
    Math.floor((worldUp.z + 2) * 83492791) ^
    (salt * 2654435761);
  return s >>> 0;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const _yAxis = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Convert a world-space up direction into the planet.surface's unrotated
 *  local frame (undo surface.rotation.y), matching city.js convention. */
function toLocalUp(planet, worldUp) {
  const dir = worldUp.clone().normalize();
  const rotY = planet.surface?.rotation?.y ?? 0;
  return dir.applyAxisAngle(_yAxis, -rotY);
}

/** Sample ground height above the base sphere at a local-up direction
 *  (unrotated object space — the frame toLocalUp produces). */
function sampleGround(planet, localDir) {
  if (typeof planet.body?.groundAtLocal === 'function') {
    return planet.body.groundAtLocal(localDir);
  }
  if (typeof planet.body?.groundAt === 'function') {
    // groundAt expects a WORLD (post-spin) dir and un-rotates internally:
    // re-apply the current spin so the two rotations cancel.
    const rotY = planet.surface?.rotation?.y ?? 0;
    return planet.body.groundAt(_v.copy(localDir).applyAxisAngle(_yAxis, rotY));
  }
  return 0;
}

/** Build a group oriented with +Y along localDir, positioned at the
 *  planet-surface radius + terrain height, in unrotated object space. */
function placeOnSurface(planet, localDir, yawRad = 0) {
  const group = new THREE.Group();
  const groundH = sampleGround(planet, localDir);
  const radius = (planet.radius ?? 900) + groundH;
  group.position.copy(localDir).multiplyScalar(radius);
  _quat.setFromUnitVectors(_yAxis, localDir);
  group.quaternion.copy(_quat);
  if (yawRad) group.rotateY(yawRad);
  return group;
}

function emissiveMat(color, intensity, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: opts.baseColor ?? 0x22182a,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: opts.roughness ?? 0.4,
    metalness: opts.metalness ?? 0.2,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
}

// Walk-session material registry (world/actuality-materials.js), installed by
// createWonder for the duration of its builder. The 'rock' family bakes
// luminance only, so the per-wonder tint colors below keep driving the hue —
// the maps just stop the megastructures reading as flat plastic. The registry
// owns the map clones; disposeGroup's material.dispose() never frees textures.
let _registry = null;

function stoneMat(color = C.STONE) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.05 });
  if (_registry) {
    const set = _registry.tiledSet('rock', 3, 3);
    m.map = set.map;
    m.roughnessMap = set.roughnessMap;
    m.normalMap = set.normalMap;
  }
  return m;
}

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    }
  });
  if (group.parent) group.parent.remove(group);
}

/** Radial keep-out collider (world-space) for a cylindrical footprint. */
function radialCollider(worldPos, radius, height) {
  return { type: 'cylinder', position: worldPos.clone(), radius, height };
}

/** Shared FX uniform pair: shader-driven parts of a wonder read time and
 *  night level from these, so update() writes two numbers per wonder. */
function makeFx() {
  return { uTime: { value: 0 }, uNight: { value: 0 } };
}

function nightOf(sunDot) {
  return Math.min(Math.max(1 - Math.max(sunDot, 0), 0), 1);
}

// Tiny shared radial-gradient sprite for spore/particle points. Module-level
// singleton (a few KB) — survives wonder disposal on purpose.
let sporeSprite = null;
function getSporeSprite() {
  if (sporeSprite) return sporeSprite;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  sporeSprite = new THREE.CanvasTexture(c);
  sporeSprite.colorSpace = THREE.SRGBColorSpace;
  return sporeSprite;
}

// ===========================================================================
// TYPE 1 — Space elevator / orbital tether
// ===========================================================================
function buildElevator(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const magenta = palette.accent ?? C.MAGENTA;

  // Anchor station base (walkable plaza deck).
  const plazaGeo = new THREE.CylinderGeometry(
    C.ELEVATOR_PLAZA_RADIUS, C.ELEVATOR_PLAZA_RADIUS * 1.05, 2, 24
  );
  const plaza = new THREE.Mesh(plazaGeo, stoneMat(C.INDIGO));
  plaza.position.y = 1;
  group.add(plaza);

  const ringGeo = new THREE.TorusGeometry(C.ELEVATOR_PLAZA_RADIUS - 1, 0.4, 8, 32);
  const ring = new THREE.Mesh(ringGeo, emissiveMat(magenta, 1.1));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 2.2;
  ring.name = 'elevatorRunLight';
  group.add(ring);

  // Tapered tower (parts merged for one draw call).
  const towerParts = [];
  const towerSteps = 6;
  for (let i = 0; i < towerSteps; i++) {
    const t0 = i / towerSteps, t1 = (i + 1) / towerSteps;
    const r0 = THREE.MathUtils.lerp(C.ELEVATOR_BASE_RADIUS, C.ELEVATOR_BASE_RADIUS * 0.55, t0);
    const r1 = THREE.MathUtils.lerp(C.ELEVATOR_BASE_RADIUS, C.ELEVATOR_BASE_RADIUS * 0.55, t1);
    const h = C.ELEVATOR_TOWER_HEIGHT / towerSteps;
    const geo = new THREE.CylinderGeometry(r1, r0, h, 12);
    geo.translate(0, C.ELEVATOR_TOWER_HEIGHT * t0 + h / 2 + 2, 0);
    towerParts.push(geo);
  }
  const towerMerged = mergeGeometries(towerParts, false);
  const tower = new THREE.Mesh(towerMerged, stoneMat(0x3a3448));
  group.add(tower);

  // Colossal thinning ribbon, backdrop only above tower height.
  const ribbonParts = [];
  const segs = C.ELEVATOR_RIBBON_SEGMENTS;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const w0 = THREE.MathUtils.lerp(C.ELEVATOR_RIBBON_BASE_W, C.ELEVATOR_RIBBON_TOP_W, t0);
    const w1 = THREE.MathUtils.lerp(C.ELEVATOR_RIBBON_BASE_W, C.ELEVATOR_RIBBON_TOP_W, t1);
    const h = C.ELEVATOR_RIBBON_HEIGHT / segs;
    const geo = new THREE.BoxGeometry((w0 + w1) / 2, h, 0.4);
    geo.translate(0, C.ELEVATOR_TOWER_HEIGHT + h * i + h / 2, 0);
    ribbonParts.push(geo);
  }
  const fx = makeFx();
  const ribbonMerged = mergeGeometries(ribbonParts, false);
  // Ribbon shader: base glow + bright cargo pulses racing up toward orbit.
  const ribbonMat = new THREE.ShaderMaterial({
    vertexShader: basicVert,
    fragmentShader: ribbonFrag,
    uniforms: {
      uTime: fx.uTime,
      uNight: fx.uNight,
      uColor: { value: new THREE.Color(magenta) },
      uHeight: { value: C.ELEVATOR_TOWER_HEIGHT + C.ELEVATOR_RIBBON_HEIGHT },
    },
    transparent: true,
  });
  const ribbon = new THREE.Mesh(ribbonMerged, ribbonMat);
  ribbon.frustumCulled = false;
  ribbon.name = 'elevatorRibbon';
  group.add(ribbon);

  // Climber cars riding the ribbon: eased ping-pong loops, phase-offset so
  // there's always one in view somewhere along the lower span.
  const climberMat = emissiveMat(magenta, 1.2, { baseColor: 0x241a2e });
  const climbers = [];
  for (let i = 0; i < 3; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 1.8), climberMat);
    car.userData.phase = i / 3;
    car.userData.speed = 0.012 + i * 0.004; // loops per second
    car.name = 'elevatorClimber';
    group.add(car);
    climbers.push(car);
  }

  const worldPos = new THREE.Vector3();
  group.getWorldPosition(worldPos);
  const collider = radialCollider(worldPos, C.ELEVATOR_PLAZA_RADIUS, 4);

  function update(t, sunDot) {
    const night = Math.max(1 - Math.max(sunDot, 0), 0.15);
    fx.uTime.value = t;
    fx.uNight.value = nightOf(sunDot);
    const pulse = (Math.sin(t * C.ELEVATOR_PULSE_SPEED) * 0.5 + 0.5);
    ring.material.emissiveIntensity = (0.9 + pulse * 0.8) * night;
    for (let i = 0; i < climbers.length; i++) {
      const car = climbers[i];
      const p = (t * car.userData.speed + car.userData.phase) % 1;
      const tri = p < 0.5 ? p * 2 : 2 - p * 2;
      const e = tri * tri * (3 - 2 * tri); // ease both ends of the run
      car.position.y = C.ELEVATOR_TOWER_HEIGHT + e * C.ELEVATOR_RIBBON_HEIGHT * 0.5;
    }
  }

  return { group, update, dispose: () => disposeGroup(group), collider };
}

// ===========================================================================
// TYPE 2 — Mega-arch / world gate
// ===========================================================================
function buildArch(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const magenta = palette.accent ?? C.MAGENTA;
  const half = C.ARCH_SPAN / 2 + C.ARCH_LEG_W / 2;

  const legGeoL = new THREE.BoxGeometry(C.ARCH_LEG_W, C.ARCH_LEG_H, C.ARCH_THICKNESS);
  legGeoL.translate(-half, C.ARCH_LEG_H / 2, 0);
  const legGeoR = new THREE.BoxGeometry(C.ARCH_LEG_W, C.ARCH_LEG_H, C.ARCH_THICKNESS);
  legGeoR.translate(half, C.ARCH_LEG_H / 2, 0);
  const legsMerged = mergeGeometries([legGeoL, legGeoR], false);
  const legs = new THREE.Mesh(legsMerged, stoneMat());
  group.add(legs);

  const crownGeo = new THREE.BoxGeometry(
    C.ARCH_SPAN + C.ARCH_LEG_W * 2, C.ARCH_RISE, C.ARCH_THICKNESS
  );
  crownGeo.translate(0, C.ARCH_LEG_H + C.ARCH_RISE / 2, 0);
  const crown = new THREE.Mesh(crownGeo, stoneMat(0x59505f));
  group.add(crown);

  // Emissive inlay strips embedded along the underside of the crown + legs.
  const inlayGeos = [];
  for (let i = 0; i < C.ARCH_INLAY_COUNT; i++) {
    const t = i / (C.ARCH_INLAY_COUNT - 1);
    const x = THREE.MathUtils.lerp(-half, half, t);
    const geo = new THREE.BoxGeometry(2, 3, C.ARCH_THICKNESS + 0.5);
    geo.translate(x, C.ARCH_LEG_H - 2, 0);
    inlayGeos.push(geo);
  }
  const inlayMerged = mergeGeometries(inlayGeos, false);
  const inlay = new THREE.Mesh(inlayMerged, emissiveMat(magenta, 1.0));
  inlay.name = 'archInlay';
  group.add(inlay);

  const legTopGeo = new THREE.BoxGeometry(2.5, C.ARCH_LEG_H, 3);
  const legStripL = new THREE.Mesh(legTopGeo, emissiveMat(magenta, 0.95));
  legStripL.position.set(-half, C.ARCH_LEG_H / 2, C.ARCH_THICKNESS / 2 + 0.2);
  const legStripR = legStripL.clone();
  legStripR.position.x = half;
  legStripL.name = legStripR.name = 'archLegStrip';
  group.add(legStripL, legStripR);

  // Gate film: a rippling energy membrane spanning the opening. Additive and
  // collider-free — walking through the world gate is the whole point.
  const fx = makeFx();
  const filmMat = new THREE.ShaderMaterial({
    vertexShader: basicVert,
    fragmentShader: gatefilmFrag,
    uniforms: {
      uTime: fx.uTime,
      uNight: fx.uNight,
      uColor: { value: new THREE.Color(magenta) },
    },
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const film = new THREE.Mesh(
    new THREE.PlaneGeometry(C.ARCH_SPAN, C.ARCH_LEG_H), filmMat
  );
  film.position.y = C.ARCH_LEG_H / 2;
  film.name = 'archGateFilm';
  group.add(film);

  const worldPosL = new THREE.Vector3(), worldPosR = new THREE.Vector3();
  legStripL.getWorldPosition(worldPosL);
  legStripR.getWorldPosition(worldPosR);
  const collider = [
    radialCollider(worldPosL, C.ARCH_LEG_W * 0.7, C.ARCH_LEG_H),
    radialCollider(worldPosR, C.ARCH_LEG_W * 0.7, C.ARCH_LEG_H),
  ];

  function update(t, sunDot) {
    const night = Math.max(1 - Math.max(sunDot, 0), 0.15);
    fx.uTime.value = t;
    fx.uNight.value = nightOf(sunDot);
    const pulse = 0.85 + Math.sin(t * 0.5) * 0.3;
    inlay.material.emissiveIntensity = pulse * night;
    legStripL.material.emissiveIntensity = pulse * night;
    legStripR.material.emissiveIntensity = pulse * night;
  }

  return { group, update, dispose: () => disposeGroup(group), collider };
}

// ===========================================================================
// TYPE 3 — Crystal spire field
// ===========================================================================
function buildCrystals(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const magenta = palette.accent ?? C.MAGENTA;
  const cyan = palette.secondary ?? C.CYAN;
  const fx = makeFx();

  // All spires merged into ONE geometry/draw call. Per-vertex aPhase/aTint
  // give each spire its own pulse clock and colour; the crystal shader adds
  // a fresnel rim and a slow internal energy swirl (replaces 22 costly
  // transmission materials).
  const geos = [];
  const colliders = [];
  const worldPos = new THREE.Vector3();
  group.updateMatrixWorld(true); // compose placement for collider positions

  for (let i = 0; i < C.CRYSTAL_COUNT; i++) {
    const ang = rng() * Math.PI * 2;
    const dist = Math.sqrt(rng()) * C.CRYSTAL_FIELD_RADIUS;
    const h = THREE.MathUtils.lerp(C.CRYSTAL_MIN_H, C.CRYSTAL_MAX_H, rng());
    const r = THREE.MathUtils.lerp(C.CRYSTAL_MIN_R, C.CRYSTAL_MAX_R, rng());
    const geo = new THREE.ConeGeometry(r, h, 6, 1);
    geo.rotateY(rng() * Math.PI * 2);
    geo.translate(Math.cos(ang) * dist, h / 2, Math.sin(ang) * dist);
    const count = geo.attributes.position.count;
    geo.setAttribute('aPhase',
      new THREE.BufferAttribute(new Float32Array(count).fill(rng() * Math.PI * 2), 1));
    geo.setAttribute('aTint',
      new THREE.BufferAttribute(new Float32Array(count).fill(rng() > 0.6 ? 1 : 0), 1));
    geos.push(geo);

    worldPos.set(Math.cos(ang) * dist, h / 2, Math.sin(ang) * dist)
      .applyMatrix4(group.matrixWorld);
    colliders.push(radialCollider(worldPos.clone(), r * 0.8, h));
  }

  const mat = new THREE.ShaderMaterial({
    vertexShader: crystalVert,
    fragmentShader: crystalFrag,
    uniforms: {
      uTime: fx.uTime,
      uNight: fx.uNight,
      uColorA: { value: new THREE.Color(magenta) },
      uColorB: { value: new THREE.Color(cyan) },
    },
    transparent: true,
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
  mesh.name = 'crystalSpires';
  group.add(mesh);

  function update(t, sunDot) {
    fx.uTime.value = t;
    fx.uNight.value = nightOf(sunDot);
  }

  return { group, update, dispose: () => disposeGroup(group), collider: colliders };
}

// ===========================================================================
// TYPE 4 — Bioluminescent grove
// ===========================================================================
function buildGrove(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const magenta = palette.accent ?? C.MAGENTA;
  const fx = makeFx();

  const trunks = []; // sway pivots
  const colliders = [];
  const worldPos = new THREE.Vector3();
  const magentaCol = new THREE.Color(magenta);

  // One shared pulse-glow material for every lantern pod in the grove; pods
  // are merged per tree (so they still sway with their trunk) and carry
  // per-vertex phase/tint — 104 materials become 1.
  const podMat = new THREE.ShaderMaterial({
    vertexShader: pulseGlowVert,
    fragmentShader: pulseGlowFrag,
    uniforms: {
      uTime: fx.uTime,
      uNight: fx.uNight,
      uBase: { value: 0.45 },
      uAmp: { value: 0.55 },
      uSpeed: { value: 0.8 },
      uFlicker: { value: 0 },
    },
  });

  for (let i = 0; i < C.GROVE_TREE_COUNT; i++) {
    const ang = rng() * Math.PI * 2;
    const dist = Math.sqrt(rng()) * C.GROVE_RADIUS;
    const h = THREE.MathUtils.lerp(C.GROVE_TRUNK_MIN_H, C.GROVE_TRUNK_MAX_H, rng());
    const px = Math.cos(ang) * dist, pz = Math.sin(ang) * dist;

    const pivot = new THREE.Group();
    pivot.position.set(px, 0, pz);
    pivot.userData.phase = rng() * Math.PI * 2;
    group.add(pivot);
    trunks.push(pivot);

    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.9, h, 6);
    trunkGeo.translate(0, h / 2, 0);
    const trunkMesh = new THREE.Mesh(trunkGeo, stoneMat(0x2f3a2a));
    pivot.add(trunkMesh);

    // Lantern pods near the crown, merged into one mesh per tree.
    const podGeos = [];
    for (let p = 0; p < C.GROVE_POD_COUNT_PER_TREE; p++) {
      const podGeo = new THREE.IcosahedronGeometry(0.8 + rng() * 0.6, 0);
      const podAng = rng() * Math.PI * 2;
      const podR = 1.5 + rng() * 2;
      podGeo.translate(
        Math.cos(podAng) * podR, h * (0.7 + rng() * 0.25), Math.sin(podAng) * podR
      );
      const count = podGeo.attributes.position.count;
      podGeo.setAttribute('aPhase',
        new THREE.BufferAttribute(new Float32Array(count).fill(rng() * Math.PI * 2), 1));
      const tint = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) {
        tint[v * 3] = magentaCol.r; tint[v * 3 + 1] = magentaCol.g; tint[v * 3 + 2] = magentaCol.b;
      }
      podGeo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
      podGeos.push(podGeo);
    }
    const pods = new THREE.Mesh(mergeGeometries(podGeos, false), podMat);
    pods.name = 'grovePods';
    pivot.add(pods);

    pivot.getWorldPosition(worldPos);
    colliders.push(radialCollider(worldPos.clone(), 1.2, h));
  }

  // Drifting spores: additive points rising and swirling through the grove.
  const sporeSeeds = [];
  const sporeGeo = new THREE.BufferGeometry();
  const sporePos = new Float32Array(C.GROVE_SPORE_COUNT * 3);
  for (let i = 0; i < C.GROVE_SPORE_COUNT; i++) {
    const ang = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * C.GROVE_RADIUS;
    sporeSeeds.push({
      x: Math.cos(ang) * d, z: Math.sin(ang) * d,
      phase: rng() * 30, speed: 0.5 + rng() * 0.8,
    });
  }
  sporeGeo.setAttribute('position', new THREE.BufferAttribute(sporePos, 3));
  const sporeMat = new THREE.PointsMaterial({
    map: getSporeSprite(), color: magenta, size: 0.7,
    transparent: true, opacity: 0.7, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const spores = new THREE.Points(sporeGeo, sporeMat);
  spores.frustumCulled = false;
  spores.name = 'groveSpores';
  group.add(spores);

  function update(t, sunDot) {
    fx.uTime.value = t;
    fx.uNight.value = nightOf(sunDot);
    for (let i = 0; i < trunks.length; i++) {
      const p = trunks[i];
      p.rotation.z = Math.sin(t * C.GROVE_SWAY_SPEED + p.userData.phase) * C.GROVE_SWAY_AMOUNT;
    }
    const pos = sporeGeo.attributes.position;
    for (let i = 0; i < sporeSeeds.length; i++) {
      const s = sporeSeeds[i];
      const y = (t * s.speed + s.phase) % (C.GROVE_TRUNK_MAX_H + 4);
      pos.setXYZ(
        i,
        s.x + Math.sin(t * 0.4 + s.phase) * 1.5,
        y,
        s.z + Math.cos(t * 0.33 + s.phase) * 1.5
      );
    }
    pos.needsUpdate = true;
    sporeMat.opacity = 0.2 + fx.uNight.value * 0.55;
  }

  return { group, update, dispose: () => disposeGroup(group), collider: colliders };
}

// ===========================================================================
// TYPE 5 — Floating monoliths / anti-grav platforms
// ===========================================================================
function buildMonoliths(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const magenta = palette.accent ?? C.MAGENTA;
  const fx = makeFx();

  // One shared anti-grav beam material: noise visibly streaming down the
  // open cylinders under every slab (beam.frag).
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: basicVert,
    fragmentShader: beamFrag,
    uniforms: {
      uTime: fx.uTime,
      uNight: fx.uNight,
      uColor: { value: new THREE.Color(magenta) },
      uFlow: { value: 0.9 },
    },
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });

  const slabs = [];
  const colliders = [];
  const worldPos = new THREE.Vector3();

  for (let i = 0; i < C.MONOLITH_COUNT; i++) {
    const ang = (i / C.MONOLITH_COUNT) * Math.PI * 2 + rng() * 0.4;
    const dist = C.MONOLITH_FIELD_RADIUS * (0.4 + rng() * 0.6);
    const h = THREE.MathUtils.lerp(C.MONOLITH_MIN_H, C.MONOLITH_MAX_H, rng());
    const hover = THREE.MathUtils.lerp(C.MONOLITH_MIN_HOVER, C.MONOLITH_MAX_HOVER, rng());

    const slabGeo = new THREE.BoxGeometry(C.MONOLITH_SLAB_W, h, C.MONOLITH_SLAB_D);
    const slabMat = stoneMat(0x453a52);
    const slab = new THREE.Mesh(slabGeo, slabMat);
    const baseY = hover + h / 2;
    slab.position.set(Math.cos(ang) * dist, baseY, Math.sin(ang) * dist);
    slab.userData.baseY = baseY;
    slab.userData.phase = rng() * Math.PI * 2;
    slab.userData.topY = h / 2; // local offset to reachable top pad
    slab.userData.spinDir = i % 2 ? 1 : -1; // slow alternating yaw drift
    slab.name = 'monolithSlab';
    group.add(slab);
    slabs.push(slab);

    const underGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(C.MONOLITH_SLAB_W * 0.45, C.MONOLITH_SLAB_W * 0.2, hover, 8, 1, true),
      beamMat
    );
    underGlow.position.set(slab.position.x, hover / 2, slab.position.z);
    underGlow.name = 'monolithBeam';
    underGlow.userData.parentSlab = slab;
    group.add(underGlow);
    slab.userData.beam = underGlow;

    slab.getWorldPosition(worldPos);
    colliders.push(radialCollider(worldPos.clone(), Math.max(C.MONOLITH_SLAB_W, C.MONOLITH_SLAB_D) / 2, h));
  }

  /** Host-usable helper: returns world Y of the nearest slab's walkable top
   *  if worldPos is above/near a slab footprint, else null. */
  function groundHeightAt(worldPos) {
    for (const slab of slabs) {
      const dx = worldPos.x - (slab.getWorldPosition(_v).x);
      const dz = worldPos.z - (_v.z);
      if (Math.abs(dx) < C.MONOLITH_SLAB_W / 2 && Math.abs(dz) < C.MONOLITH_SLAB_D / 2) {
        return _v.y + slab.userData.topY;
      }
    }
    return null;
  }

  function update(t, sunDot) {
    fx.uTime.value = t;
    fx.uNight.value = nightOf(sunDot);
    for (let i = 0; i < slabs.length; i++) {
      const s = slabs[i];
      s.position.y = s.userData.baseY + Math.sin(t * C.MONOLITH_BOB_SPEED + s.userData.phase) * C.MONOLITH_BOB_AMOUNT;
      s.rotation.y = s.userData.phase + t * 0.04 * s.userData.spinDir;
    }
  }

  return {
    group, update, dispose: () => disposeGroup(group), collider: colliders, groundHeightAt,
  };
}

// ===========================================================================
// TYPE 6 — Colossal statue / seated titan
// ===========================================================================
function buildTitan(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const magenta = palette.accent ?? C.MAGENTA;

  const seatGeo = new THREE.CylinderGeometry(70, 80, C.TITAN_SEAT_HEIGHT, 8);
  seatGeo.translate(0, C.TITAN_SEAT_HEIGHT / 2, 0);
  const seat = new THREE.Mesh(seatGeo, stoneMat(0x554d5e));
  group.add(seat);

  const torsoGeo = new THREE.CylinderGeometry(28, 42, C.TITAN_TORSO_HEIGHT, 8);
  torsoGeo.translate(0, C.TITAN_SEAT_HEIGHT + C.TITAN_TORSO_HEIGHT / 2, 0);
  const shoulderGeo = new THREE.BoxGeometry(C.TITAN_SHOULDER_W, 22, 30);
  shoulderGeo.translate(0, C.TITAN_SEAT_HEIGHT + C.TITAN_TORSO_HEIGHT - 10, 0);
  const bodyMerged = mergeGeometries([torsoGeo, shoulderGeo], false);
  const body = new THREE.Mesh(bodyMerged, stoneMat(0x625770));
  group.add(body);

  const headH = C.TITAN_TOTAL_HEIGHT - C.TITAN_SEAT_HEIGHT - C.TITAN_TORSO_HEIGHT;
  const headGeo = new THREE.IcosahedronGeometry(headH * 0.6, 0);
  headGeo.scale(1, 1.2, 0.9);
  headGeo.translate(0, C.TITAN_SEAT_HEIGHT + C.TITAN_TORSO_HEIGHT + headH * 0.5, 0);
  const head = new THREE.Mesh(headGeo, stoneMat(0x6b5f7a));
  group.add(head);

  const gazeGeo = new THREE.SphereGeometry(headH * 0.14, 8, 8);
  const gaze = new THREE.Mesh(gazeGeo, emissiveMat(magenta, 1.2));
  gaze.position.set(0, C.TITAN_SEAT_HEIGHT + C.TITAN_TORSO_HEIGHT + headH * 0.55, headH * 0.5);
  gaze.name = 'titanGaze';
  group.add(gaze);

  const fx = makeFx();

  // Searchlight gaze: an additive noise-streamed cone sweeping slowly across
  // the plain from the titan's eye (beam.frag, apex at the pivot).
  const beamLen = 140;
  const beamGeo = new THREE.ConeGeometry(16, beamLen, 20, 1, true);
  beamGeo.rotateX(-Math.PI / 2);        // axis onto Z: apex at -Z, base at +Z
  beamGeo.translate(0, 0, beamLen / 2); // apex at the pivot, base out along +Z
  const beamMesh = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
    vertexShader: basicVert,
    fragmentShader: beamFrag,
    uniforms: {
      uTime: fx.uTime,
      uNight: fx.uNight,
      uColor: { value: new THREE.Color(magenta) },
      uFlow: { value: 0.5 },
    },
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const beamPivot = new THREE.Group();
  beamPivot.position.copy(gaze.position);
  beamPivot.rotation.x = 0.3; // tilt the beam down toward the ground
  beamPivot.add(beamMesh);
  beamPivot.name = 'titanGazeBeam';
  group.add(beamPivot);

  // Plinth runes: eight glyph slabs around the seat pulsing in sequence
  // (ordered aPhase → a chase running around the pedestal). One merged mesh.
  {
    const runeGeos = [];
    const runeCol = new THREE.Color(magenta);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const geo = new THREE.BoxGeometry(3, 6, 0.6);
      geo.rotateY(-a);
      geo.translate(Math.cos(a) * 76, C.TITAN_SEAT_HEIGHT * 0.5, Math.sin(a) * 76);
      const count = geo.attributes.position.count;
      geo.setAttribute('aPhase',
        new THREE.BufferAttribute(new Float32Array(count).fill((i / 8) * Math.PI * 2), 1));
      const tint = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) {
        tint[v * 3] = runeCol.r; tint[v * 3 + 1] = runeCol.g; tint[v * 3 + 2] = runeCol.b;
      }
      geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
      runeGeos.push(geo);
    }
    const runeMat = new THREE.ShaderMaterial({
      vertexShader: pulseGlowVert,
      fragmentShader: pulseGlowFrag,
      uniforms: {
        uTime: fx.uTime,
        uNight: fx.uNight,
        uBase: { value: 0.3 },
        uAmp: { value: 0.9 },
        uSpeed: { value: 1.2 },
        uFlicker: { value: 0 },
      },
    });
    const runes = new THREE.Mesh(mergeGeometries(runeGeos, false), runeMat);
    runes.name = 'titanRunes';
    group.add(runes);
  }

  const worldPos = new THREE.Vector3();
  seat.getWorldPosition(worldPos);
  const collider = radialCollider(worldPos, 80, C.TITAN_SEAT_HEIGHT);

  function update(t, sunDot) {
    const night = Math.max(1 - Math.max(sunDot, 0), 0.2);
    fx.uTime.value = t;
    fx.uNight.value = nightOf(sunDot);
    gaze.material.emissiveIntensity = (0.9 + Math.sin(t * C.TITAN_GAZE_PULSE_SPEED) * 0.4) * night;
    beamPivot.rotation.y = Math.sin(t * 0.12) * 0.5; // slow searchlight sweep
  }

  return { group, update, dispose: () => disposeGroup(group), collider };
}

// ===========================================================================
// OPTIONAL EXTRA — Derelict ringworld arc (pure sky backdrop, no collider)
// ===========================================================================
function buildRingworld(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const magenta = palette.accent ?? C.MAGENTA;

  const geo = new THREE.TorusGeometry(
    C.RINGWORLD_RADIUS, C.RINGWORLD_WIDTH / 2, 6, C.RINGWORLD_SEGMENTS, Math.PI * 0.6
  );
  const mat = emissiveMat(magenta, 0.3, { baseColor: 0x151020, transparent: true, opacity: 0.5 });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = Math.PI / 2 + (rng() - 0.5) * 0.3;
  ring.position.y = C.RINGWORLD_RADIUS * 0.3;
  ring.frustumCulled = false;
  ring.name = 'ringworldArc';
  group.add(ring);

  function update(t, sunDot) {
    const night = Math.max(1 - Math.max(sunDot, 0), 0.3);
    ring.material.emissiveIntensity = (0.25 + Math.sin(t * 0.1) * 0.08) * night;
  }

  return { group, update, dispose: () => disposeGroup(group), collider: null };
}

// ===========================================================================
// TYPE 8 — The Geyser Organ (glacia): a travertine mound carrying a rank of
// hollow ice chimneys the planet plays like organ pipes — each vents a lit
// steam plume on a staggered cycle, its core light swelling a beat early.
// ===========================================================================
function buildGeyser(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const accent = palette.accent ?? C.CYAN;

  // Travertine terrace mound: stacked squashed cones.
  const moundGeos = [];
  for (let i = 0; i < 4; i++) {
    const r = C.GEYSER_MOUND_RADIUS * (1 - i * 0.22);
    const geo = new THREE.ConeGeometry(r, 4 + i * 1.5, 24);
    geo.translate(0, i * 3 + 2, 0);
    moundGeos.push(geo);
  }
  const mound = new THREE.Mesh(mergeGeometries(moundGeos, false), stoneMat(0x9fb3c0));
  group.add(mound);

  // The pipe rank: hollow-looking tapered chimneys in a rough line across the
  // mound, each with an emissive core column inside.
  const chimneys = [];
  const coreMat = emissiveMat(accent, 0.4, { baseColor: 0x0d1a20 });
  const iceMat = new THREE.MeshStandardMaterial({
    color: 0xcfe6f2, roughness: 0.25, metalness: 0.05,
    transparent: true, opacity: 0.82,
  });
  for (let i = 0; i < C.GEYSER_CHIMNEYS; i++) {
    const t = i / (C.GEYSER_CHIMNEYS - 1);
    const h = THREE.MathUtils.lerp(C.GEYSER_MIN_H, C.GEYSER_MAX_H,
      Math.sin(t * Math.PI) * (0.7 + rng() * 0.3));
    const x = (t - 0.5) * C.GEYSER_MOUND_RADIUS * 1.7;
    const z = (rng() - 0.5) * 14;
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2 + rng() * 1.2, 4.2 + rng() * 1.6, h, 10, 1, true),
      iceMat
    );
    shell.position.set(x, h / 2 + 6, z);
    group.add(shell);
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.3, h * 0.9, 6), coreMat.clone()
    );
    core.position.set(x, h * 0.45 + 6, z);
    group.add(core);
    // Vent plume: stacked additive ring shells, scaled/faded in update().
    const plumeMat = new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const plumeGeos = [];
    for (let s = 0; s < 4; s++) {
      const ring = new THREE.TorusGeometry(1.6 + s * 0.9, 0.35, 6, 16);
      ring.rotateX(Math.PI / 2);
      ring.translate(0, s * 3.4, 0);
      plumeGeos.push(ring);
    }
    const plume = new THREE.Mesh(mergeGeometries(plumeGeos, false), plumeMat);
    plume.position.set(x, h + 6, z);
    plume.visible = false;
    group.add(plume);
    chimneys.push({ core, plume, phase: (i * 2.31) % C.GEYSER_CYCLE, h });
  }

  const worldPos = new THREE.Vector3();
  const colliders = [];
  for (const ch of chimneys) {
    worldPos.copy(ch.plume.position).setY(0).applyQuaternion(group.quaternion)
      .add(group.position);
    colliders.push(radialCollider(worldPos.clone(), 4.5, ch.h + 8));
  }

  function update(t, sunDot) {
    const night = Math.max(1 - Math.max(sunDot, 0), 0.25);
    for (let i = 0; i < chimneys.length; i++) {
      const ch = chimneys[i];
      const cycle = (t + ch.phase) % C.GEYSER_CYCLE;
      // Core light swells one second before the vent blows.
      const preroll = THREE.MathUtils.clamp(
        (cycle - (C.GEYSER_CYCLE - C.GEYSER_PLUME_SECONDS - 1)) / 1, 0, 1
      );
      const venting = cycle > C.GEYSER_CYCLE - C.GEYSER_PLUME_SECONDS;
      const k = venting
        ? (cycle - (C.GEYSER_CYCLE - C.GEYSER_PLUME_SECONDS)) / C.GEYSER_PLUME_SECONDS
        : 0;
      ch.core.material.emissiveIntensity =
        (0.35 + preroll * 1.1 + (venting ? (1 - k) * 0.8 : 0)) * night;
      ch.plume.visible = venting;
      if (venting) {
        const grow = 1 + k * 2.2;
        ch.plume.scale.set(grow, 1 + k * 3.5, grow);
        ch.plume.material.opacity = (1 - k) * 0.5;
      }
    }
  }

  return { group, update, dispose: () => disposeGroup(group), collider: colliders };
}

// ===========================================================================
// TYPE 9 — The Colossal Sundial (rustia): a tilted gnomon blade over an
// inlaid ring of glyph markers. The bright marker walks the ring through the
// day — the whole settlement keeps time by it. The ring plaza is walkable.
// ===========================================================================
function buildSundial(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const amber = palette.accent ?? C.AMBER;

  // Inlaid plaza disc + rim.
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(C.SUNDIAL_RING_RADIUS + 8, C.SUNDIAL_RING_RADIUS + 8, 1.2, 48),
    stoneMat(0x4d3626)
  );
  plaza.position.y = 0.6;
  group.add(plaza);

  // The gnomon: a tilted oxide-dark blade.
  const gnomon = new THREE.Mesh(
    new THREE.BoxGeometry(6, C.SUNDIAL_GNOMON_H, 14), stoneMat(0x2e1a10)
  );
  gnomon.position.y = C.SUNDIAL_GNOMON_H / 2 + 1;
  gnomon.rotation.z = 0.42; // the timekeeping tilt
  group.add(gnomon);
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, C.SUNDIAL_GNOMON_H, 1.6), emissiveMat(amber, 0.9)
  );
  edge.position.set(-3.2, C.SUNDIAL_GNOMON_H / 2 + 1, 0);
  gnomon.add(edge);

  // Twelve glyph marker slabs around the ring.
  const markers = [];
  for (let i = 0; i < C.SUNDIAL_MARKERS; i++) {
    const a = (i / C.SUNDIAL_MARKERS) * Math.PI * 2;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(7, 1.6, 4), emissiveMat(amber, 0.25, { baseColor: 0x33200f })
    );
    slab.position.set(Math.cos(a) * C.SUNDIAL_RING_RADIUS, 1.6, Math.sin(a) * C.SUNDIAL_RING_RADIUS);
    slab.rotation.y = -a;
    group.add(slab);
    markers.push(slab);
  }

  const worldPos = new THREE.Vector3();
  group.getWorldPosition(worldPos);
  const collider = radialCollider(worldPos, 7, C.SUNDIAL_GNOMON_H); // gnomon base only

  function update(t, sunDot) {
    const night = Math.max(1 - Math.max(sunDot, 0), 0.2);
    // The lit marker circles once per SUNDIAL_DAY; neighbors get a soft falloff.
    const cursor = ((t / C.SUNDIAL_DAY) % 1) * C.SUNDIAL_MARKERS;
    for (let i = 0; i < markers.length; i++) {
      let d = Math.abs(i - cursor);
      d = Math.min(d, C.SUNDIAL_MARKERS - d);
      const lit = Math.max(0, 1 - d);
      markers[i].material.emissiveIntensity = (0.18 + lit * 1.4) * (0.4 + night * 0.6);
    }
    edge.material.emissiveIntensity = (0.5 + Math.sin(t * 0.3) * 0.2) * (0.4 + night * 0.6);
  }

  return { group, update, dispose: () => disposeGroup(group), collider };
}

// ===========================================================================
// TYPE 10 — Ribs of the Sound-Leviathan (neptunia): the bleached ribcage of
// something the size of a village, arched into a nave over the shore. The
// barnacle clusters along the bone still glow — brightest in the dark.
// ===========================================================================
function buildLeviathan(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const violet = palette.accent ?? 0x9a6aff;
  const boneMat = stoneMat(0xcac0d8);

  const colliders = [];
  const worldPos = new THREE.Vector3();
  const barnacleMat = emissiveMat(violet, 0.6, { baseColor: 0x1a1430 });
  const barnacles = [];

  for (let i = 0; i < C.LEVIATHAN_RIB_PAIRS * 2; i++) {
    const pair = Math.floor(i / 2);
    const side = i % 2 ? 1 : -1;
    const tz = pair / (C.LEVIATHAN_RIB_PAIRS - 1);
    const z = (tz - 0.5) * C.LEVIATHAN_LENGTH;
    const h = THREE.MathUtils.lerp(
      C.LEVIATHAN_RIB_MIN_H, C.LEVIATHAN_RIB_MAX_H, Math.sin(tz * Math.PI)
    ) * (0.9 + rng() * 0.2);
    // A rib: a torus arc leaning inward, foot planted wide of the spine.
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(h, 1.8 + (1 - tz) * 0.8, 8, 24, Math.PI * 0.52), boneMat
    );
    rib.position.set(side * h * 0.72, 0, z);
    rib.rotation.y = side > 0 ? Math.PI : 0; // arc curls over the spine
    rib.rotation.z = side > 0 ? -0.18 : 0.18;
    group.add(rib);
    // Barnacle clusters part-way up the bone.
    const count = 2 + Math.floor(rng() * 3);
    for (let b = 0; b < count; b++) {
      const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + rng() * 1.4, 0), barnacleMat.clone());
      const a = 0.5 + rng() * 1.2;
      knot.position.set(
        side * (h * 0.72 - Math.cos(a) * h), Math.sin(a) * h, z + (rng() - 0.5) * 4
      );
      knot.userData.phase = rng() * Math.PI * 2;
      group.add(knot);
      barnacles.push(knot);
    }
    worldPos.set(side * h * 0.72, 0, z).applyQuaternion(group.quaternion).add(group.position);
    colliders.push(radialCollider(worldPos.clone(), 3.2, 10));
  }

  // Spine walkway: flat slabs down the centerline.
  const slabGeos = [];
  for (let s = 0; s < 12; s++) {
    const geo = new THREE.BoxGeometry(8, 0.8, C.LEVIATHAN_LENGTH / 13);
    geo.translate((rng() - 0.5) * 1.2, 0.4, (s / 11 - 0.5) * C.LEVIATHAN_LENGTH);
    slabGeos.push(geo);
  }
  group.add(new THREE.Mesh(mergeGeometries(slabGeos, false), stoneMat(0x8a80a0)));

  function update(t, sunDot) {
    const night = Math.max(1 - Math.max(sunDot, 0), 0.15);
    for (let i = 0; i < barnacles.length; i++) {
      const b = barnacles[i];
      b.material.emissiveIntensity =
        (0.35 + Math.sin(t * 0.6 + b.userData.phase) * 0.25 + night * 0.9);
    }
  }

  return { group, update, dispose: () => disposeGroup(group), collider: colliders };
}

// ===========================================================================
// TYPE 11 — The Diamond Veil (neptunia): a levitating faceted crown ring
// high over a mirror pool, shedding four perpetual glitter streams — the
// diamond rain made monumental. The pool rides above the sea if wet.
// ===========================================================================
function buildDiamondveil(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const accent = palette.accent ?? C.CYAN;

  // A wet site: lift the whole wonder so the pool sits above the sea.
  if (planet.water?.r && group.position.length() < planet.water.r + 0.6) {
    group.position.setLength(planet.water.r + 0.6);
  }

  // Mirror pool disc.
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(C.VEIL_POOL_RADIUS, C.VEIL_POOL_RADIUS, 1, 48),
    new THREE.MeshStandardMaterial({ color: 0x10142e, roughness: 0.05, metalness: 0.9 })
  );
  pool.position.y = 0.5;
  group.add(pool);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(C.VEIL_POOL_RADIUS, 1.2, 8, 48), stoneMat(0x8a80a0)
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 1;
  group.add(rim);

  // The crown: a levitating torus studded with spike octahedra.
  const crown = new THREE.Group();
  crown.position.y = C.VEIL_HOVER;
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(C.VEIL_RING_RADIUS, 2.2, 8, 40),
    emissiveMat(accent, 0.7, { baseColor: 0x141838, metalness: 0.6, roughness: 0.3 })
  );
  band.rotation.x = Math.PI / 2;
  crown.add(band);
  const spikeMat = emissiveMat(0xffffff, 0.5, { baseColor: 0x202848, metalness: 0.8, roughness: 0.15 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.OctahedronGeometry(2.4 + rng() * 2.2, 0), spikeMat);
    spike.position.set(Math.cos(a) * C.VEIL_RING_RADIUS, (rng() - 0.5) * 3, Math.sin(a) * C.VEIL_RING_RADIUS);
    crown.add(spike);
  }
  group.add(crown);

  // Glitter streams: instanced octahedra falling ring -> pool, respawning.
  const streamMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.35, 0),
    emissiveMat(0xffffff, 1.1, { baseColor: 0x101020 }),
    C.VEIL_STREAMS * C.VEIL_STREAM_COUNT
  );
  streamMesh.frustumCulled = false;
  const glitter = [];
  const dummy = new THREE.Object3D();
  for (let s = 0; s < C.VEIL_STREAMS; s++) {
    const a = (s / C.VEIL_STREAMS) * Math.PI * 2 + 0.4;
    for (let i = 0; i < C.VEIL_STREAM_COUNT; i++) {
      glitter.push({
        x: Math.cos(a) * C.VEIL_RING_RADIUS + (rng() - 0.5) * 3,
        z: Math.sin(a) * C.VEIL_RING_RADIUS + (rng() - 0.5) * 3,
        phase: rng(),
        speed: 0.10 + rng() * 0.08, // fraction of the drop per second
        spin: rng() * Math.PI * 2,
      });
    }
  }
  group.add(streamMesh);

  const worldPos = new THREE.Vector3();
  group.getWorldPosition(worldPos);
  const collider = radialCollider(worldPos, C.VEIL_POOL_RADIUS + 1.5, 3);

  function update(t, sunDot) {
    const night = Math.max(1 - Math.max(sunDot, 0), 0.2);
    crown.rotation.y = t * 0.08;
    band.material.emissiveIntensity = (0.55 + Math.sin(t * 0.7) * 0.2) * (0.5 + night * 0.5);
    for (let i = 0; i < glitter.length; i++) {
      const g = glitter[i];
      const p = (t * g.speed + g.phase) % 1;
      dummy.position.set(g.x, C.VEIL_HOVER - p * (C.VEIL_HOVER - 1.5), g.z);
      dummy.rotation.set(0, g.spin + t * 2, 0);
      const tw = 0.7 + Math.sin(t * 6 + g.phase * 40) * 0.3;
      dummy.scale.setScalar(tw);
      dummy.updateMatrix();
      streamMesh.setMatrixAt(i, dummy.matrix);
    }
    streamMesh.instanceMatrix.needsUpdate = true;
  }

  return { group, update, dispose: () => disposeGroup(group), collider };
}

// ===========================================================================
// TYPE 12 — The Ridge Harp (wyattmattoe): two granite pylons strung across
// the saddle with emissive strings the wind plays — brightness pulses run
// down the strings in phase-offset shimmer. Prayer flags on the guys.
// ===========================================================================
function buildSkyharp(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const amber = palette.accent ?? C.AMBER;
  const half = C.HARP_SPAN / 2;

  const pylonGeoL = new THREE.CylinderGeometry(2.2, 5.5, C.HARP_PYLON_H, 8);
  pylonGeoL.translate(-half, C.HARP_PYLON_H / 2, 0);
  const pylonGeoR = new THREE.CylinderGeometry(2.2, 5.5, C.HARP_PYLON_H, 8);
  pylonGeoR.translate(half, C.HARP_PYLON_H / 2, 0);
  const pylons = new THREE.Mesh(mergeGeometries([pylonGeoL, pylonGeoR], false), stoneMat(0x4a4f58));
  group.add(pylons);

  // Strings: thin emissive cylinders spanning pylon to pylon.
  const strings = [];
  for (let i = 0; i < C.HARP_STRINGS; i++) {
    const y = 12 + (i / (C.HARP_STRINGS - 1)) * (C.HARP_PYLON_H - 18);
    const s = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, C.HARP_SPAN - 4, 5),
      emissiveMat(i % 3 === 0 ? 0xf4f8ff : amber, 0.5, { baseColor: 0x1a1a20 })
    );
    s.rotation.z = Math.PI / 2;
    s.position.y = y;
    s.userData.phase = i * 0.55;
    group.add(s);
    strings.push(s);
  }

  // Prayer-flag quads along the lower guys.
  const flagColors = [0xd44040, 0x40a0d4, 0xf7d06a, 0x60c060, 0xffffff];
  const flags = [];
  for (let i = 0; i < 16; i++) {
    const f = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.6),
      new THREE.MeshStandardMaterial({
        color: flagColors[i % flagColors.length], side: THREE.DoubleSide, roughness: 0.9,
      })
    );
    const t = i / 15;
    f.position.set(THREE.MathUtils.lerp(-half, half, t), 9 + Math.sin(t * Math.PI) * -2.5, 0.4);
    f.userData.phase = rng() * Math.PI * 2;
    group.add(f);
    flags.push(f);
  }

  const worldPosL = new THREE.Vector3(-half, 0, 0).applyQuaternion(group.quaternion).add(group.position);
  const worldPosR = new THREE.Vector3(half, 0, 0).applyQuaternion(group.quaternion).add(group.position);
  const collider = [
    radialCollider(worldPosL, 6, C.HARP_PYLON_H),
    radialCollider(worldPosR, 6, C.HARP_PYLON_H),
  ];

  function update(t, sunDot) {
    const night = Math.max(1 - Math.max(sunDot, 0), 0.25);
    for (let i = 0; i < strings.length; i++) {
      const s = strings[i];
      const pulse = Math.sin(t * 1.8 - s.userData.phase) * 0.5 + 0.5;
      s.material.emissiveIntensity = (0.25 + pulse * pulse * 1.1) * (0.45 + night * 0.55);
    }
    for (let i = 0; i < flags.length; i++) {
      const f = flags[i];
      f.rotation.x = Math.sin(t * 2.2 + f.userData.phase) * 0.35;
      f.rotation.y = Math.sin(t * 1.4 + f.userData.phase) * 0.2;
    }
  }

  return { group, update, dispose: () => disposeGroup(group), collider };
}

// ===========================================================================
// TYPE 13 — The Cirque Bell (wyattmattoe): a bronze bell the size of a house
// hung in a granite trilithon over the lake ice. Every half minute it swings
// through a silent toll — an expanding ring of light instead of sound.
// ===========================================================================
function buildBell(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const amber = palette.accent ?? C.AMBER;

  // Trilithon frame: two granite legs and a lintel.
  const legGeoL = new THREE.BoxGeometry(8, C.BELL_FRAME_H, 10);
  legGeoL.translate(-22, C.BELL_FRAME_H / 2, 0);
  const legGeoR = new THREE.BoxGeometry(8, C.BELL_FRAME_H, 10);
  legGeoR.translate(22, C.BELL_FRAME_H / 2, 0);
  const lintel = new THREE.BoxGeometry(56, 8, 12);
  lintel.translate(0, C.BELL_FRAME_H + 4, 0);
  const frame = new THREE.Mesh(
    mergeGeometries([legGeoL, legGeoR, lintel], false), stoneMat(0x4a4f58)
  );
  group.add(frame);

  // The bell: a lathe profile, hung from the lintel; pivot at the top so the
  // pendulum swing reads correctly.
  const pivot = new THREE.Group();
  pivot.position.y = C.BELL_FRAME_H;
  const profile = [];
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Bell curve: narrow shoulder to flared mouth.
    const r = 3 + Math.pow(t, 2.2) * (C.BELL_HEIGHT * 0.36);
    profile.push(new THREE.Vector2(r, -t * C.BELL_HEIGHT));
  }
  const bell = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 24),
    new THREE.MeshStandardMaterial({ color: 0x8a5c28, roughness: 0.35, metalness: 0.9 })
  );
  bell.position.y = -2;
  pivot.add(bell);
  const clapper = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.2, 0), emissiveMat(amber, 0.5, { baseColor: 0x33200f })
  );
  clapper.position.y = -C.BELL_HEIGHT + 2;
  pivot.add(clapper);
  group.add(pivot);

  // The silent toll: an expanding additive light ring at mouth height.
  const tollMat = new THREE.MeshBasicMaterial({
    color: amber, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const toll = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 48), tollMat);
  toll.rotation.x = -Math.PI / 2;
  toll.position.y = C.BELL_FRAME_H - C.BELL_HEIGHT;
  toll.visible = false;
  group.add(toll);

  const worldPos = new THREE.Vector3();
  const colliders = [];
  for (const x of [-22, 22]) {
    worldPos.set(x, 0, 0).applyQuaternion(group.quaternion).add(group.position);
    colliders.push(radialCollider(worldPos.clone(), 6, C.BELL_FRAME_H));
  }
  group.getWorldPosition(worldPos);
  colliders.push(radialCollider(worldPos.clone(), C.BELL_HEIGHT * 0.38, 4)); // under the mouth

  function update(t, sunDot) {
    const night = Math.max(1 - Math.max(sunDot, 0), 0.2);
    pivot.rotation.z = Math.sin(t * 0.9) * 0.07; // slow ±4° pendulum
    const cycle = t % C.BELL_TOLL_PERIOD;
    const tolling = cycle < C.BELL_TOLL_SECONDS;
    toll.visible = tolling;
    if (tolling) {
      const k = cycle / C.BELL_TOLL_SECONDS;
      const grow = 2 + k * 60;
      toll.scale.set(grow, grow, 1);
      toll.material.opacity = (1 - k) * 0.55;
    }
    clapper.material.emissiveIntensity = (tolling ? 1.4 : 0.35) * (0.4 + night * 0.6);
  }

  return { group, update, dispose: () => disposeGroup(group), collider: colliders };
}

// ===========================================================================
// TYPE 14 — The Frozen Cascade (wyattmattoe): a waterfall flash-frozen
// mid-leap down a cliff fin — stacked translucent sheets with icicle
// fringes and emissive veins that come alive at night. The plunge-pool
// disc at the base is walkable.
// ===========================================================================
function buildIcefall(planet, localDir, seed, palette) {
  const rng = mulberry32(seed);
  const group = placeOnSurface(planet, localDir, rng() * Math.PI * 2);
  const accent = palette.secondary ?? C.CYAN;

  // Cliff fin the cascade hangs from.
  const cliff = new THREE.Mesh(
    new THREE.BoxGeometry(C.ICEFALL_WIDTH, C.ICEFALL_CLIFF_H, 16), stoneMat(0x4a4f58)
  );
  cliff.position.set(0, C.ICEFALL_CLIFF_H / 2, -10);
  cliff.rotation.y = (rng() - 0.5) * 0.2;
  group.add(cliff);

  // Frozen sheets: stepped translucent slabs pouring over the lip.
  const iceMat = new THREE.MeshStandardMaterial({
    color: 0xd8ecf7, roughness: 0.18, metalness: 0.05,
    transparent: true, opacity: 0.8,
  });
  const sheetGeos = [];
  for (let i = 0; i < C.ICEFALL_SHEETS; i++) {
    const t = i / (C.ICEFALL_SHEETS - 1);
    const w = C.ICEFALL_WIDTH * (0.55 + rng() * 0.25) * (1 - t * 0.3);
    const h = (C.ICEFALL_CLIFF_H / C.ICEFALL_SHEETS) * 1.5;
    const geo = new THREE.BoxGeometry(w, h, 3 + t * 3);
    geo.translate(
      (rng() - 0.5) * 8,
      C.ICEFALL_CLIFF_H * (1 - t) - h * 0.3,
      -2 + t * 5 + Math.sin(t * Math.PI) * 2
    );
    sheetGeos.push(geo);
  }
  const sheets = new THREE.Mesh(mergeGeometries(sheetGeos, false), iceMat);
  group.add(sheets);

  // Icicle fringes along the sheet lips.
  const icicleGeos = [];
  for (let i = 0; i < 26; i++) {
    const geo = new THREE.ConeGeometry(0.5 + rng() * 0.5, 3 + rng() * 6, 5);
    geo.rotateX(Math.PI);
    geo.translate(
      (rng() - 0.5) * C.ICEFALL_WIDTH * 0.8,
      C.ICEFALL_CLIFF_H * (0.15 + rng() * 0.75),
      2 + rng() * 4
    );
    icicleGeos.push(geo);
  }
  group.add(new THREE.Mesh(mergeGeometries(icicleGeos, false), iceMat));

  // Emissive veins inside the fall — moonlight caught mid-drop.
  const veinGeos = [];
  for (let i = 0; i < 9; i++) {
    const geo = new THREE.BoxGeometry(0.8, 10 + rng() * 22, 0.8);
    geo.translate(
      (rng() - 0.5) * C.ICEFALL_WIDTH * 0.6,
      C.ICEFALL_CLIFF_H * (0.2 + rng() * 0.6),
      1 + rng() * 3
    );
    veinGeos.push(geo);
  }
  const veins = new THREE.Mesh(
    mergeGeometries(veinGeos, false), emissiveMat(accent, 0.5, { baseColor: 0x102030 })
  );
  group.add(veins);

  // Walkable plunge-pool disc at the base.
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(C.ICEFALL_POOL_RADIUS, C.ICEFALL_POOL_RADIUS, 1, 32),
    new THREE.MeshStandardMaterial({ color: 0xbfd8e8, roughness: 0.12, metalness: 0.1 })
  );
  pool.position.set(0, 0.5, 14);
  group.add(pool);

  const worldPos = new THREE.Vector3();
  worldPos.set(0, 0, -10).applyQuaternion(group.quaternion).add(group.position);
  const collider = radialCollider(worldPos, C.ICEFALL_WIDTH * 0.45, C.ICEFALL_CLIFF_H);

  function update(t, sunDot) {
    const night = Math.max(1 - Math.max(sunDot, 0), 0.15);
    veins.material.emissiveIntensity = (0.25 + Math.sin(t * 0.5) * 0.12 + night * 0.9);
  }

  return { group, update, dispose: () => disposeGroup(group), collider };
}

// ---------------------------------------------------------------------------
// Type registry
// ---------------------------------------------------------------------------
const BUILDERS = {
  elevator: buildElevator,
  arch: buildArch,
  crystals: buildCrystals,
  grove: buildGrove,
  monoliths: buildMonoliths,
  titan: buildTitan,
  ringworld: buildRingworld,
  geyser: buildGeyser,
  sundial: buildSundial,
  leviathan: buildLeviathan,
  diamondveil: buildDiamondveil,
  skyharp: buildSkyharp,
  bell: buildBell,
  icefall: buildIcefall,
};

// ---------------------------------------------------------------------------
// Public API — single wonder
// ---------------------------------------------------------------------------
/**
 * Build a single wonder of the given type. This is the only public entry:
 * every permanent city (world/cityRegistry.js) places exactly one, globally
 * unique wonder at a registry-fixed bearing/distance. The old scatter-field
 * API went away with the pop-up cities.
 * @param {string} type - one of ALL_TYPES
 * @param {object} planet - { radius, surface, body:{groundAt} }
 * @param {THREE.Vector3} worldUp - world-space placement direction
 * @param {object} opts - { seed, palette:{accent,secondary}, materials }
 * @returns {{group:THREE.Group, update:Function, dispose:Function, collider:any}}
 */
export function createWonder(type, planet, worldUp, opts = {}) {
  const builder = BUILDERS[type];
  if (!builder) throw new Error(`wonders.js: unknown wonder type "${type}"`);
  const localDir = toLocalUp(planet, worldUp);
  const seed = opts.seed ?? hashSeed(worldUp, type.length);
  const palette = opts.palette ?? {};
  _registry = opts.materials ?? null; // stoneMat picks up the maps in here
  const result = builder(planet, localDir, seed, palette);
  _registry = null;
  result.group.userData.wonderType = type;
  // Shadow flags for the isolated render mode: opaque structure casts and
  // catches; transparent/additive FX shells are left alone.
  result.group.traverse((obj) => {
    if (obj.isMesh && obj.material && !obj.material.transparent) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  planet.surface.add(result.group);
  return result;
}

// ---------------------------------------------------------------------------
// Wiring example (host main loop):
//
//   import { createWonder } from './wonders.js';
//   const wonder = createWonder('geyser', planet, wonderWorldDir, {
//     seed: cityDef.wonder.seed,
//     palette: { accent: 0xd4408f, secondary: 0x40d4c8 },
//     materials: surfaceMaterials,
//   });
//   // per frame: wonder.update(elapsedTime, sunDot);
//   // on teardown: wonder.dispose();   (detaches its own group)
//   // colliders: Array.isArray(wonder.collider) ? wonder.collider : [wonder.collider]
// ---------------------------------------------------------------------------