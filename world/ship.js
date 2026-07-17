// ship.js
//
// Procedural single-seat spaceship exterior for the low-poly synthwave
// space game. Builds one THREE.Group containing:
//   - a single merged static mesh for the hull, fins, gear legs/footpads,
//     canopy frame, and accent trim (vertex-colored, MeshStandardMaterial)
//   - a separate tinted/reflective canopy bubble (MeshPhysicalMaterial)
//   - a tiny cluster of emissive meshes (twin engine nozzles + nav light)
//     that sit above the bloom threshold (~0.85 emissiveIntensity)
//
// Coordinate conventions (per current spec):
//   local forward = +Z, local up = +Y, ship is centered at the origin.
// Scale conventions: length ~12-16, width ~7-9, height ~3.5-5, astronaut ~1.9u.
//
// No scene lights are added; relies entirely on the engine's existing
// DirectionalLight/Hemisphere/Ambient lighting plus emissive materials.
// All randomness is derived from a seeded mulberry32 PRNG for determinism.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Tunables — every magic number lives here.
// ---------------------------------------------------------------------------
const C = {
  seed: 1337, // default PRNG seed, override via opts.seed

  // Overall hull envelope
  hullLength: 13.5, // nose-to-tail length along +Z
  hullWidth: 7.6, // max width along X
  hullHeight: 3.2, // max body height along Y (excludes canopy/gear)
  noseTaper: 0.42, // how much the nose narrows (0-1)
  tailTaper: 0.62, // how much the tail narrows (0-1)
  hullSegments: 6, // radial segments for hull cross-section (low-poly)

  // Canopy / cockpit bubble
  canopyRadius: 1.15, // bubble radius
  canopyZ: 3.6, // canopy center offset along +Z (front-ish)
  canopyY: 1.05, // canopy center offset along +Y
  canopyScaleZ: 1.25, // stretch bubble along Z for a teardrop look
  canopyOpacity: 0.55,

  // Boarding hatch (visual marker on side hull, +X side)
  hatchWidth: 1.1,
  hatchHeight: 1.7,
  hatchX: 3.75, // half-width offset, slightly outside hull surface
  hatchZ: -0.6, // hatch center along Z (just aft of midship)
  hatchY: -0.15,

  // Landing gear (3 legs: 1 nose, 2 rear)
  gearLegRadius: 0.11,
  gearLegLength: 1.9, // deployed length
  gearFootRadius: 0.55,
  gearFootHeight: 0.14,
  noseGearZ: 4.6,
  noseGearY: -0.9,
  rearGearZ: -3.6,
  rearGearX: 2.1,
  rearGearY: -0.75,
  gearSplayDeg: 14, // outward splay angle for rear legs

  // Fins/wings
  finSpan: 2.6,
  finChord: 2.2,
  finThickness: 0.12,
  finZ: -3.0,
  finY: 0.05,
  finSweepDeg: 22,

  // Engine nozzles
  nozzleRadius: 0.62,
  nozzleLength: 1.35,
  nozzleZ: -6.2,
  nozzleX: 1.55,
  nozzleY: -0.05,

  // Nav light
  navLightRadius: 0.09,
  navLightX: -3.4,
  navLightY: 0.35,
  navLightZ: 3.9,

  // Materials / palette
  hullColorA: 0x5a5f73, // base panel gray-indigo
  hullColorB: 0x40465c, // darker panel variant for breakup
  hullColorC: 0x6b7086, // lighter panel highlight
  accentMagenta: 0xd4408f, // signature trim color
  canopyTint: 0x8fd0ff, // pale blue-indigo tint
  engineGlowColor: 0xff4fc0, // hot magenta engine core
  navLightColor: 0xd4408f,

  hullMetalness: 0.55,
  hullRoughness: 0.55,
  trimEmissiveIntensity: 0.35, // below bloom threshold, restrained glow
  engineEmissiveBase: 1.1, // above bloom threshold (~0.85)
  engineEmissivePulseAmp: 0.35,
  navBlinkPeriod: 2.2, // seconds per blink cycle
  navBlinkOnFrac: 0.15, // fraction of cycle the nav light is bright

  groundClearance: 0.55, // approx clearance under footpads when parked
};

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function colorAttribute(geometry, hexColor) {
  const color = new THREE.Color(hexColor);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function tintColorAttribute(geometry, baseHex, rng, variance) {
  const base = new THREE.Color(baseHex);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const jitter = 1 + (rng() - 0.5) * variance;
    colors[i * 3] = Math.min(1, base.r * jitter);
    colors[i * 3 + 1] = Math.min(1, base.g * jitter);
    colors[i * 3 + 2] = Math.min(1, base.b * jitter);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function buildHullGeometry(rng) {
  // Main body: a tapered low-poly cylinder-ish hull built from a lathe-like
  // stack of scaled box cross-sections merged together, plus nose cone and
  // tail cap. Kept low-poly (hullSegments) for the silhouette-first look.
  const half = C.hullLength / 2;

  const body = new THREE.CylinderGeometry(
    (C.hullWidth / 2) * 0.94,
    (C.hullWidth / 2) * 0.94,
    C.hullLength * 0.62,
    C.hullSegments,
    1,
    false
  );
  body.rotateX(Math.PI / 2); // align cylinder axis to +Z
  body.scale(1, C.hullHeight / C.hullWidth, 1);
  body.translate(0, 0, 0);
  tintColorAttribute(body, C.hullColorA, rng, 0.08);

  const nose = new THREE.ConeGeometry(
    (C.hullWidth / 2) * 0.94,
    C.hullLength * C.noseTaper,
    C.hullSegments,
    1,
    false
  );
  nose.rotateX(Math.PI / 2);
  nose.scale(1, C.hullHeight / C.hullWidth, 1);
  nose.translate(0, 0, C.hullLength * 0.31 + (C.hullLength * C.noseTaper) / 2);
  tintColorAttribute(nose, C.hullColorC, rng, 0.06);

  const tail = new THREE.CylinderGeometry(
    (C.hullWidth / 2) * 0.94 * 0.55,
    (C.hullWidth / 2) * 0.94,
    C.hullLength * C.tailTaper,
    C.hullSegments,
    1,
    false
  );
  tail.rotateX(-Math.PI / 2);
  tail.scale(1, C.hullHeight / C.hullWidth, 1);
  tail.translate(0, 0, -(C.hullLength * 0.31 + (C.hullLength * C.tailTaper) / 2));
  tintColorAttribute(tail, C.hullColorB, rng, 0.08);

  // Dorsal spine ridge for silhouette break-up
  const spine = new THREE.BoxGeometry(0.4, 0.35, C.hullLength * 0.55);
  spine.translate(0, C.hullHeight * 0.42, 0.4);
  tintColorAttribute(spine, C.hullColorC, rng, 0.05);

  return [body, nose, tail, spine];
}

function buildFinGeometry(sign, rng) {
  // sign = +1 (right) or -1 (left)
  const fin = new THREE.BoxGeometry(C.finSpan, C.finThickness, C.finChord);
  fin.translate(sign * (C.hullWidth * 0.32 + C.finSpan / 2), C.finY, C.finZ);
  const sweep = THREE.MathUtils.degToRad(C.finSweepDeg) * sign;
  fin.rotateY(sweep);
  tintColorAttribute(fin, C.hullColorB, rng, 0.06);
  return fin;
}

function buildGearGeometry(rng) {
  const parts = [];

  // Nose gear (single, straight down-ish, slightly forward tilt)
  const noseLeg = new THREE.CylinderGeometry(
    C.gearLegRadius,
    C.gearLegRadius * 1.1,
    C.gearLegLength,
    5
  );
  noseLeg.translate(0, C.noseGearY - C.gearLegLength / 2, C.noseGearZ);
  tintColorAttribute(noseLeg, C.hullColorB, rng, 0.04);
  parts.push(noseLeg);

  const noseFoot = new THREE.CylinderGeometry(
    C.gearFootRadius,
    C.gearFootRadius * 1.1,
    C.gearFootHeight,
    6
  );
  noseFoot.translate(
    0,
    C.noseGearY - C.gearLegLength - C.gearFootHeight / 2,
    C.noseGearZ
  );
  tintColorAttribute(noseFoot, C.hullColorA, rng, 0.04);
  parts.push(noseFoot);

  // Rear gear pair, splayed outward
  for (const sign of [1, -1]) {
    const legGeo = new THREE.CylinderGeometry(
      C.gearLegRadius,
      C.gearLegRadius * 1.1,
      C.gearLegLength,
      5
    );
    legGeo.translate(0, -C.gearLegLength / 2, 0);
    legGeo.rotateZ(sign * -THREE.MathUtils.degToRad(C.gearSplayDeg));
    legGeo.translate(sign * C.rearGearX, C.rearGearY, C.rearGearZ);
    tintColorAttribute(legGeo, C.hullColorB, rng, 0.04);
    parts.push(legGeo);

    const footOffsetX =
      sign * (C.rearGearX + Math.sin(THREE.MathUtils.degToRad(C.gearSplayDeg)) * C.gearLegLength);
    const footOffsetY =
      C.rearGearY - Math.cos(THREE.MathUtils.degToRad(C.gearSplayDeg)) * C.gearLegLength - C.gearFootHeight / 2;

    const footGeo = new THREE.CylinderGeometry(
      C.gearFootRadius,
      C.gearFootRadius * 1.1,
      C.gearFootHeight,
      6
    );
    footGeo.translate(footOffsetX, footOffsetY, C.rearGearZ);
    tintColorAttribute(footGeo, C.hullColorA, rng, 0.04);
    parts.push(footGeo);
  }

  return parts;
}

function buildTrimGeometry(rng) {
  // Thin magenta accent strips along the hull sides — geometry only, no
  // emissive here (that's handled by the material on this sub-group being
  // slightly emissive but under the bloom threshold via vertex color +
  // shared material trick is avoided; instead we give trim its own tiny
  // emissive mesh group below in buildEmissiveBits for bloom-safe control).
  const strips = [];
  for (const sign of [1, -1]) {
    const strip = new THREE.BoxGeometry(0.06, 0.12, C.hullLength * 0.7);
    strip.translate(sign * (C.hullWidth / 2) * 0.95, 0.05, 0.3);
    tintColorAttribute(strip, C.accentMagenta, rng, 0.02);
    strips.push(strip);
  }
  return strips;
}

function buildHatchGeometry(rng) {
  // A shallow inset panel that visually reads as a hatch/door outline.
  const hatch = new THREE.BoxGeometry(0.08, C.hatchHeight, C.hatchWidth);
  hatch.translate(C.hatchX, C.hatchY, C.hatchZ);
  tintColorAttribute(hatch, C.hullColorC, rng, 0.03);
  return hatch;
}

function buildCanopyFrameGeometry(rng) {
  // Ring/frame around the canopy base so the bubble looks seated in hull.
  const frame = new THREE.TorusGeometry(C.canopyRadius * 1.02, 0.07, 5, 10);
  frame.rotateX(Math.PI / 2);
  frame.translate(0, C.canopyY, C.canopyZ);
  tintColorAttribute(frame, C.hullColorB, rng, 0.03);
  return frame;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * createShip(parent, opts)
 *
 * Builds a procedural, deterministic single-seat spaceship exterior and
 * attaches it to `parent`. Local forward is +Z, up is +Y, ship is centered
 * at the origin. Approx footprint: length ~13.5, width ~7.6, height ~3.2
 * (excluding canopy bulge and deployed gear).
 *
 * @param {THREE.Object3D} parent - node to attach the ship group to.
 * @param {Object} [opts]
 * @param {number} [opts.seed] - PRNG seed for deterministic variation.
 * @returns {{
 *   group: THREE.Group,
 *   update: (dt:number, t:number, sunDot:number) => void,
 *   dispose: () => void,
 *   hatchPoint: THREE.Vector3,   // local-space boarding point (UI prompt anchor)
 *   clearance: number            // approx ground clearance under gear (units)
 * }}
 */
export function createShip(parent, opts = {}) {
  const seed = opts.seed ?? C.seed;
  const rng = mulberry32(seed);

  const group = new THREE.Group();
  group.name = 'Ship';

  // --- Merge all static, non-emissive, non-canopy geometry into ONE mesh ---
  const staticGeos = [
    ...buildHullGeometry(rng),
    buildFinGeometry(1, rng),
    buildFinGeometry(-1, rng),
    ...buildGearGeometry(rng),
    ...buildTrimGeometry(rng),
    buildHatchGeometry(rng),
    buildCanopyFrameGeometry(rng),
  ];

  const mergedHullGeo = mergeGeometries(staticGeos, false);
  mergedHullGeo.computeVertexNormals();

  const hullMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: C.hullMetalness,
    roughness: C.hullRoughness,
    emissive: new THREE.Color(C.accentMagenta),
    emissiveIntensity: 0, // trim glow is driven per-frame below threshold
  });

  const hullMesh = new THREE.Mesh(mergedHullGeo, hullMaterial);
  hullMesh.name = 'ShipHull';
  hullMesh.castShadow = false;
  hullMesh.receiveShadow = false;
  group.add(hullMesh);

  // Dispose the now-merged source geometries (they were consumed by merge).
  for (const g of staticGeos) g.dispose();

  // --- Canopy bubble (separate mesh, tinted reflective material) ---
  const canopyGeo = new THREE.SphereGeometry(C.canopyRadius, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
  canopyGeo.scale(1, 0.85, C.canopyScaleZ);
  canopyGeo.translate(0, C.canopyY, C.canopyZ);

  const canopyMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(C.canopyTint),
    transparent: true,
    opacity: C.canopyOpacity,
    metalness: 0.1,
    roughness: 0.12,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
    reflectivity: 0.6,
    emissive: new THREE.Color(C.canopyTint),
    emissiveIntensity: 0.05, // kept low so it never blooms
    side: THREE.DoubleSide,
  });

  const canopyMesh = new THREE.Mesh(canopyGeo, canopyMaterial);
  canopyMesh.name = 'ShipCanopy';
  group.add(canopyMesh);

  // --- Emissive bits: twin engine nozzles + nav light (small, separate) ---
  const engineMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1a1a22),
    emissive: new THREE.Color(C.engineGlowColor),
    emissiveIntensity: C.engineEmissiveBase,
    metalness: 0.4,
    roughness: 0.5,
  });

  const nozzleGeoTemplate = new THREE.CylinderGeometry(
    C.nozzleRadius,
    C.nozzleRadius * 0.72,
    C.nozzleLength,
    8
  );

  const nozzleLeft = new THREE.Mesh(nozzleGeoTemplate, engineMaterial);
  nozzleLeft.position.set(-C.nozzleX, C.nozzleY, C.nozzleZ);
  nozzleLeft.rotation.x = Math.PI / 2;
  nozzleLeft.name = 'EngineNozzleLeft';
  group.add(nozzleLeft);

  const nozzleRight = new THREE.Mesh(nozzleGeoTemplate, engineMaterial);
  nozzleRight.position.set(C.nozzleX, C.nozzleY, C.nozzleZ);
  nozzleRight.rotation.x = Math.PI / 2;
  nozzleRight.name = 'EngineNozzleRight';
  group.add(nozzleRight);

  const navLightMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1a1a22),
    emissive: new THREE.Color(C.navLightColor),
    emissiveIntensity: 0.0,
    metalness: 0.2,
    roughness: 0.6,
  });
  const navLightGeo = new THREE.SphereGeometry(C.navLightRadius, 6, 6);
  const navLight = new THREE.Mesh(navLightGeo, navLightMaterial);
  navLight.position.set(C.navLightX, C.navLightY, C.navLightZ);
  navLight.name = 'NavLight';
  group.add(navLight);

  parent.add(group);

  // --- Boarding + clearance metadata -----------------------------------
  const hatchPoint = new THREE.Vector3(C.hatchX, C.hatchY, C.hatchZ);
  const clearance = C.groundClearance;

  // --- Idle animation state (no per-frame allocations) -----------------
  let lastPulse = -1;
  let lastBlinkOn = null;

  function update(dt, t, sunDot) {
    const time = t !== undefined ? t : 0;
    const dayLift = Math.max(sunDot ?? 0, 0); // 0 at night boost, but engines stay hot regardless

    // Soft engine pulse: base + sine wobble, always above bloom threshold.
    const pulse =
      C.engineEmissiveBase + Math.sin(time * 2.2) * C.engineEmissivePulseAmp * 0.5 + C.engineEmissivePulseAmp * 0.5;
    if (pulse !== lastPulse) {
      engineMaterial.emissiveIntensity = pulse;
      lastPulse = pulse;
    }

    // Blinking nav light: short bright flash, otherwise dim/off.
    const cyclePos = (time % C.navBlinkPeriod) / C.navBlinkPeriod;
    const blinkOn = cyclePos < C.navBlinkOnFrac;
    if (blinkOn !== lastBlinkOn) {
      navLightMaterial.emissiveIntensity = blinkOn ? 1.4 : 0.02;
      lastBlinkOn = blinkOn;
    }

    // Trim glow: restrained, scales slightly with night (low sunDot).
    hullMaterial.emissiveIntensity = C.trimEmissiveIntensity * (1 - dayLift * 0.5);
  }

  function dispose() {
    parent.remove(group);
    mergedHullGeo.dispose();
    hullMaterial.dispose();
    canopyGeo.dispose();
    canopyMaterial.dispose();
    nozzleGeoTemplate.dispose();
    engineMaterial.dispose();
    navLightGeo.dispose();
    navLightMaterial.dispose();
  }

  return { group, update, dispose, hatchPoint, clearance };
}

// ---------------------------------------------------------------------------
// Wiring example (for reference, not executed here):
//
//   import { createShip } from './ship.js';
//   const ship = createShip(scene, { seed: 42 });
//   // in animation loop:
//   ship.update(dt, elapsedTime, Math.max(dot(localUp, sunDir), 0));
//   // on teardown:
//   ship.dispose();
// ---------------------------------------------------------------------------