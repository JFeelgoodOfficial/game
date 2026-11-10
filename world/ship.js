// ship.js
//
// The player's freighter, as seen parked on a landing pad. One THREE.Group:
//   - a single merged static mesh for the hold, nose, engine block, fins,
//     gear, ramp and trim (vertex-coloured, MeshStandardMaterial)
//   - one merged glass mesh: the cockpit canopy at the nose, the roof strip
//     over the gallery hall and the tall windows down both flanks — the same
//     openings you look out of from inside (src/interior.js)
//   - a small cluster of emissive meshes (twin engine nozzles + nav light)
//     that sit above the bloom threshold (~0.85 emissiveIntensity)
//
// Coordinate conventions: local forward = +Z, local up = +Y, the hull is
// centred at the origin. About 24 long, 9 wide, 5 tall; astronaut ~1.9 u.
// The interior you walk is larger than this hull, as game interiors are: the
// exterior is sized to sit on a 20 x 14 town landing pad.
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

  // The hold: the long box that carries the gallery hall
  holdWidth: 9.0,
  holdHeight: 4.6,
  holdZ0: -9.5, // aft face
  holdZ1: 5.0, // forward face, where the nose section starts
  hullSegments: 6, // radial segments for the nose taper (low-poly)

  // Nose section + cockpit bubble
  noseLength: 7.0, // tapers from the hold's forward face to the tip
  noseTipScale: 0.3,
  canopyRadius: 1.5,
  canopyZ: 7.4, // canopy centre along +Z
  canopyY: 1.25,
  canopyScaleZ: 1.3, // stretch bubble along Z for a teardrop look
  canopyOpacity: 0.55,

  // Glass: roof strip over the hall, windows down each flank
  roofGlassWidth: 5.6,
  roofGlassZ0: -8.6,
  roofGlassZ1: 4.2,
  sideWindows: 5,
  sideWindowWidth: 1.7,
  sideWindowHeight: 2.6,
  sideWindowPitch: 2.75, // centre-to-centre along Z

  // Boarding hatch + ramp, +X side just aft of the nose
  hatchWidth: 1.5,
  hatchHeight: 2.2,
  hatchZ: 3.1,
  hatchY: -1.2,
  rampLength: 4.2,

  // Landing gear: nose leg plus two pairs under the hold. Every footpad
  // bottoms out at -gearDrop, which is what PARK_LIFT (constants.js) matches.
  gearLegRadius: 0.17,
  gearFootRadius: 0.75,
  gearFootHeight: 0.18,
  gearDrop: 3.9, // footpad underside, below the hull origin
  noseGearZ: 8.2,
  noseGearTop: -1.0,
  holdGearX: 3.3,
  holdGearZ: [-7.6, 1.6],

  // Tail fins
  finHeight: 2.6,
  finChord: 3.4,
  finThickness: 0.16,
  finX: 3.4,
  finZ: -9.3,

  // Engine block + nozzles
  engineBlockLength: 2.5,
  nozzleRadius: 1.25,
  nozzleLength: 1.9,
  nozzleZ: -12.6,
  nozzleX: 2.25,
  nozzleY: -0.2,

  // Nav light
  navLightRadius: 0.13,
  navLightX: -4.6,
  navLightY: 1.2,
  navLightZ: 4.4,

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
  trimEmissiveIntensity: 0.16, // below bloom threshold, restrained glow
  engineEmissiveBase: 1.1, // above bloom threshold (~0.85)
  engineEmissivePulseAmp: 0.35,
  navBlinkPeriod: 2.2, // seconds per blink cycle
  navBlinkOnFrac: 0.15, // fraction of cycle the nav light is bright

  groundClearance: 1.6, // approx clearance under the hold when parked
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

function tintedBox(w, h, d, x, y, z, hex, rng, variance = 0.06) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return tintColorAttribute(g, hex, rng, variance);
}

function buildHullGeometry(rng) {
  const parts = [];
  const W = C.holdWidth;
  const H = C.holdHeight;
  const len = C.holdZ1 - C.holdZ0;
  const zc = (C.holdZ0 + C.holdZ1) / 2;

  // The hold, with a shoulder step so it does not read as a plain crate:
  // full-width belly, slightly narrower upper works.
  parts.push(tintedBox(W, H * 0.56, len, 0, -H * 0.22, zc, C.hullColorA, rng, 0.08));
  parts.push(tintedBox(W * 0.94, H * 0.46, len - 0.4, 0, H * 0.27, zc, C.hullColorC, rng, 0.06));
  // keel plate + panel bands for break-up
  parts.push(tintedBox(W * 0.7, 0.3, len * 0.9, 0, -H / 2 - 0.1, zc, C.hullColorB, rng, 0.05));
  for (let i = 0; i < 4; i++) {
    const z = C.holdZ0 + 1.6 + i * ((len - 3.2) / 3);
    parts.push(tintedBox(W + 0.16, H * 0.5, 0.35, 0, -H * 0.2, z, C.hullColorB, rng, 0.05));
  }

  // Roof frame around the glass strip, with ribs across it
  const rz = (C.roofGlassZ0 + C.roofGlassZ1) / 2;
  const rl = C.roofGlassZ1 - C.roofGlassZ0;
  for (const sx of [-1, 1]) {
    parts.push(tintedBox(0.4, 0.36, rl + 0.6, sx * (C.roofGlassWidth / 2 + 0.2), H / 2 + 0.1, rz, C.hullColorB, rng, 0.04));
  }
  for (let i = 0; i <= 5; i++) {
    const z = C.roofGlassZ0 + (rl * i) / 5;
    parts.push(tintedBox(C.roofGlassWidth + 0.8, 0.3, 0.26, 0, H / 2 + 0.12, z, C.hullColorB, rng, 0.04));
  }

  // Nose: tapers from the hold's forward face to a blunt tip
  const r = (W / 2) * 0.86;
  const nose = new THREE.CylinderGeometry(r * C.noseTipScale, r, C.noseLength, C.hullSegments, 1, false);
  nose.rotateX(Math.PI / 2); // cylinder top -> +Z
  nose.scale(1, (H * 0.86) / (r * 2), 1);
  nose.translate(0, -0.15, C.holdZ1 + C.noseLength / 2);
  parts.push(tintColorAttribute(nose, C.hullColorC, rng, 0.06));

  // Engine block across the stern
  const eb = C.engineBlockLength;
  parts.push(tintedBox(W * 0.84, H * 0.74, eb, 0, -0.1, C.holdZ0 - eb / 2, C.hullColorB, rng, 0.08));
  return parts;
}

function buildFinGeometry(sign, rng) {
  // twin vertical tail fins, raked aft
  const fin = new THREE.BoxGeometry(C.finThickness, C.finHeight, C.finChord);
  fin.translate(0, C.finHeight / 2, 0);
  fin.rotateX(-0.32);
  fin.translate(sign * C.finX, C.holdHeight / 2 - 0.2, C.finZ);
  return tintColorAttribute(fin, C.hullColorB, rng, 0.06);
}

function buildGearGeometry(rng) {
  const parts = [];
  const leg = (x, top, z) => {
    const len = C.gearDrop - C.gearFootHeight + top;
    const g = new THREE.CylinderGeometry(C.gearLegRadius, C.gearLegRadius * 1.15, len, 6);
    g.translate(x, top - len / 2, z);
    parts.push(tintColorAttribute(g, C.hullColorB, rng, 0.04));
    const foot = new THREE.CylinderGeometry(C.gearFootRadius, C.gearFootRadius * 1.1, C.gearFootHeight, 8);
    foot.translate(x, -C.gearDrop + C.gearFootHeight / 2, z);
    parts.push(tintColorAttribute(foot, C.hullColorA, rng, 0.04));
  };
  leg(0, C.noseGearTop, C.noseGearZ);
  for (const z of C.holdGearZ) {
    for (const sign of [1, -1]) leg(sign * C.holdGearX, -C.holdHeight / 2, z);
  }
  return parts;
}

function buildTrimGeometry(rng) {
  // Thin magenta accent strips along the flanks, under the windows.
  const strips = [];
  const len = C.holdZ1 - C.holdZ0;
  for (const sign of [1, -1]) {
    const strip = new THREE.BoxGeometry(0.08, 0.14, len * 0.94);
    strip.translate(sign * (C.holdWidth / 2 + 0.02), -1.25, (C.holdZ0 + C.holdZ1) / 2);
    strips.push(tintColorAttribute(strip, C.accentMagenta, rng, 0.02));
  }
  return strips;
}

function buildHatchGeometry(rng) {
  // Door panel on the +X flank, and the boarding ramp down to the pad.
  const x = C.holdWidth / 2;
  const hatch = tintedBox(0.1, C.hatchHeight, C.hatchWidth, x + 0.03, C.hatchY, C.hatchZ, C.hullColorC, rng, 0.03);
  const sill = C.hatchY - C.hatchHeight / 2;
  const drop = C.gearDrop + sill;
  const run = Math.sqrt(Math.max(0.01, C.rampLength * C.rampLength - drop * drop));
  const ramp = new THREE.BoxGeometry(C.rampLength, 0.12, C.hatchWidth);
  ramp.rotateZ(-Math.atan2(drop, run));
  ramp.translate(x + run / 2, sill - drop / 2, C.hatchZ);
  return [hatch, tintColorAttribute(ramp, C.hullColorB, rng, 0.04)];
}

function buildCanopyFrameGeometry(rng) {
  // Ring/frame around the canopy base so the bubble looks seated in hull.
  const frame = new THREE.TorusGeometry(C.canopyRadius * 1.02, 0.09, 5, 12);
  frame.rotateX(Math.PI / 2);
  frame.scale(1, 1, C.canopyScaleZ);
  frame.translate(0, C.canopyY, C.canopyZ);
  tintColorAttribute(frame, C.hullColorB, rng, 0.03);
  return frame;
}

// Every pane of glass on the ship, merged into one mesh.
function buildGlassGeometry() {
  const parts = [];
  const canopy = new THREE.SphereGeometry(C.canopyRadius, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
  canopy.scale(1, 0.85, C.canopyScaleZ);
  canopy.translate(0, C.canopyY, C.canopyZ);
  parts.push(canopy);
  const roof = new THREE.BoxGeometry(C.roofGlassWidth, 0.1, C.roofGlassZ1 - C.roofGlassZ0);
  roof.translate(0, C.holdHeight / 2 + 0.08, (C.roofGlassZ0 + C.roofGlassZ1) / 2);
  parts.push(roof);
  const z0 = (C.holdZ0 + C.holdZ1) / 2 - ((C.sideWindows - 1) * C.sideWindowPitch) / 2;
  for (let i = 0; i < C.sideWindows; i++) {
    for (const sign of [1, -1]) {
      // the hatch takes the forward-most bay on the +X flank
      if (sign === 1 && Math.abs(z0 + i * C.sideWindowPitch - C.hatchZ) < 1.6) continue;
      const pane = new THREE.BoxGeometry(0.08, C.sideWindowHeight, C.sideWindowWidth);
      pane.translate(sign * (C.holdWidth * 0.47 + 0.03), 0.75, z0 + i * C.sideWindowPitch);
      parts.push(pane);
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * createShip(parent, opts)
 *
 * Builds the procedural, deterministic freighter exterior and attaches it
 * to `parent`. Local forward is +Z, up is +Y, the hull is centred at the
 * origin. Approx footprint: length ~24, width ~9, height ~5 (excluding the
 * tail fins and deployed gear).
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
    ...buildHatchGeometry(rng),
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

  // --- Glass: canopy, roof strip, flank windows (one mesh, one material) ---
  const canopyGeo = buildGlassGeometry();

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
  const hatchPoint = new THREE.Vector3(C.holdWidth / 2, C.hatchY, C.hatchZ);
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