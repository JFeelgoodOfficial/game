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

  // Scatter field
  FIELD_DEFAULT_COUNT: 3,
  FIELD_MIN_SEPARATION: 250,
  FIELD_PLACEMENT_RADIUS: 900,    // how far out backdrop wonders may roam
  EXPLORABLE_PLACEMENT_RADIUS: 320,
};

const ALL_TYPES = [
  'elevator', 'arch', 'crystals', 'grove', 'monoliths', 'titan', 'ringworld',
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
// createWonderField for the duration of its builders. The 'rock' family bakes
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
};

// ---------------------------------------------------------------------------
// Public API — single wonder
// ---------------------------------------------------------------------------
/**
 * Build a single wonder of the given type.
 * @param {string} type - one of ALL_TYPES
 * @param {object} planet - { radius, surface, body:{groundAt} }
 * @param {THREE.Vector3} worldUp - world-space landing/placement direction
 * @param {object} opts - { seed, palette:{accent,secondary}, yaw }
 * @returns {{group:THREE.Group, update:Function, dispose:Function, collider:any}}
 */
export function createWonder(type, planet, worldUp, opts = {}) {
  const builder = BUILDERS[type];
  if (!builder) throw new Error(`wonders.js: unknown wonder type "${type}"`);
  const localDir = toLocalUp(planet, worldUp);
  const seed = opts.seed ?? hashSeed(worldUp, type.length);
  const palette = opts.palette ?? {};
  const result = builder(planet, localDir, seed, palette);
  planet.surface.add(result.group);
  return result;
}

// ---------------------------------------------------------------------------
// Public API — scatter field
// ---------------------------------------------------------------------------
/**
 * Deterministically scatter a curated set of wonders around a region.
 * @param {object} planet
 * @param {THREE.Vector3} worldUp - region center direction
 * @param {object} opts - {
 *   seed, count, types: string[] (allow-list, defaults to ALL_TYPES),
 *   palette, spreadRadius
 * }
 * @returns {{group:THREE.Group, update:Function, dispose:Function, wonders:Array}}
 */
export function createWonderField(planet, worldUp, opts = {}) {
  const seed = opts.seed ?? hashSeed(worldUp, 999);
  const rng = mulberry32(seed);
  const allow = (opts.types && opts.types.length) ? opts.types : ALL_TYPES;
  const count = opts.count ?? C.FIELD_DEFAULT_COUNT;
  const palette = opts.palette ?? {};

  const group = new THREE.Group();
  const wonders = [];
  const placedLocalDirs = [];
  const baseLocalDir = toLocalUp(planet, worldUp);
  const radius = (planet.radius ?? 900);

  let attempts = 0;
  while (wonders.length < count && attempts < count * 12) {
    attempts++;
    const type = allow[Math.floor(rng() * allow.length)];
    const isBackdrop = BACKDROP_TYPES.has(type);
    const maxR = isBackdrop ? C.FIELD_PLACEMENT_RADIUS : C.EXPLORABLE_PLACEMENT_RADIUS;
    const ang = rng() * Math.PI * 2;
    const dist = Math.sqrt(rng()) * maxR;

    // Offset a tangent point around baseLocalDir, then renormalize onto sphere.
    const tangentA = new THREE.Vector3().crossVectors(baseLocalDir, _yAxis).normalize();
    if (tangentA.lengthSq() < 1e-6) tangentA.set(1, 0, 0);
    const tangentB = new THREE.Vector3().crossVectors(baseLocalDir, tangentA).normalize();
    const offset = tangentA.multiplyScalar(Math.cos(ang) * dist / radius)
      .add(tangentB.multiplyScalar(Math.sin(ang) * dist / radius));
    const candidate = baseLocalDir.clone().add(offset).normalize();

    let tooClose = false;
    for (const placed of placedLocalDirs) {
      const worldDist = placed.angleTo(candidate) * radius;
      if (worldDist < C.FIELD_MIN_SEPARATION) { tooClose = true; break; }
    }
    if (tooClose) continue;

    const wSeed = Math.floor(rng() * 0xffffffff);
    const builder = BUILDERS[type];
    _registry = opts.materials ?? null; // stoneMat picks up the maps in here
    const result = builder(planet, candidate, wSeed, palette);
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
    group.add(result.group);
    wonders.push(result);
    placedLocalDirs.push(candidate);
  }

  function update(t, sunDot) {
    for (let i = 0; i < wonders.length; i++) wonders[i].update(t, sunDot);
  }

  function dispose() {
    for (let i = 0; i < wonders.length; i++) wonders[i].dispose();
    disposeGroup(group);
  }

  planet.surface.add(group);
  return { group, update, dispose, wonders };
}

// ---------------------------------------------------------------------------
// Wiring example (host main loop):
//
//   import { createWonderField, createWonder } from './wonders.js';
//   const field = createWonderField(planet, landingUp, {
//     seed: cityLandingSeed, count: 3,
//     types: ['crystals', 'monoliths', 'grove'],   // e.g. ice-world allow-list
//     palette: { accent: 0xd4408f, secondary: 0x40d4c8 },
//   });
//   // per frame: field.update(elapsedTime, sunDot);
//   // on teardown: field.dispose();
//   // colliders: field.wonders.flatMap(w => Array.isArray(w.collider) ? w.collider : (w.collider ? [w.collider] : []));
// ---------------------------------------------------------------------------