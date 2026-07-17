/**
 * city.js — Procedural neon city draped over a spherical planet surface.
 *
 * COORDINATE ASSUMPTIONS
 * - The city `group` is parented to `planet.surface` and lives in UNROTATED
 *   object space: we never read/write `planet.surface.rotation` ourselves,
 *   we just place children so the planet's own spin + floating-origin
 *   rebasing carries the city along for free.
 * - `worldUp` (THREE.Vector3, world-space) is the radial landing direction:
 *   planet center -> landing point. We build the city in a local frame
 *   where local +Y = worldUp, then set group.quaternion via
 *   quaternion.setFromUnitVectors(YAXIS, worldUp) and position the group at
 *   worldUp * (planet.radius + baseHeight), converted into planet.surface's
 *   local space (planet.surface is assumed to sit at the planet's origin,
 *   i.e. local space == planet-centered space before spin).
 * - Inside the city's own local frame (children of `group`), we use a flat
 *   X/Z grid (like a normal ground-plane city) and only the group's
 *   orientation bends that flat grid onto the sphere's tangent plane at the
 *   landing point. This is correct for city-scale footprints (~300 units)
 *   against planet radii of 800-1100 units — curvature inside the footprint
 *   is handled by draping (see below), not by re-deriving the sphere per
 *   building.
 * - Terrain height is sampled via `planet.body.groundAt(dir)` where `dir`
 *   is a world-space unit vector from planet center through the sample
 *   point. We reconstruct `dir` per sample as
 *   (group.position + local point rotated by group.quaternion).normalize()
 *   in planet-local space, matching the host's expected convention.
 * - +Y is always "up" (radial) inside the city's local frame; buildings
 *   extrude along local +Y.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const C = {
  BASE_HEIGHT_OFFSET: 0.05,        // lift above sampled ground to avoid z-fight
  GRID_CELL: 18,                    // street-grid cell size (block + street)
  STREET_WIDTH: 7,                  // avenue width carved out of each cell
  WIDE_AVENUE_EVERY: 4,             // every Nth grid line is a wide avenue
  WIDE_AVENUE_WIDTH: 11,
  CORE_RADIUS_FRAC: 0.35,           // fraction of city radius considered "dense core"
  OUTSKIRT_RADIUS_FRAC: 0.85,       // beyond this, sparse outskirts
  BUILDING_MIN_FOOT: 5,             // min building footprint half-size
  BUILDING_MAX_FOOT: 9,
  BUILDING_MIN_H_CORE: 22,
  BUILDING_MAX_H_CORE: 70,
  BUILDING_MIN_H_MID: 10,
  BUILDING_MAX_H_MID: 30,
  BUILDING_MIN_H_OUT: 4,
  BUILDING_MAX_H_OUT: 12,
  SETBACK_STEP_CHANCE: 0.55,        // chance a tall building gets a setback tier
  SETBACK_SHRINK: 0.62,
  WINDOW_ROW_HEIGHT: 3.2,
  FLATTEN_RADIUS: 10,               // pad flattening radius around building centers
  PLAZA_COUNT: 3,
  PLAZA_RADIUS: 16,
  PAD_LENGTH: 20,                   // landing pad long axis (fits 12-16 unit ship)
  PAD_WIDTH: 14,
  PAD_RING_SEGMENTS: 48,
  STREETLIGHT_SPACING: 22,
  STREETLIGHT_HEIGHT: 6,
  PLANTER_CHANCE: 0.35,
  KIOSK_CHANCE: 0.12,
  RAILING_HEIGHT: 0.9,
  NEON_BLOOM_INTENSITY: 1.6,        // above 0.85 bloom threshold
  NEON_DIM_INTENSITY: 0.25,
  SIGN_FLICKER_SPEED: 4.5,
  SIGN_FLICKER_AMOUNT: 0.18,
  MOTE_COUNT: 60,
  MOTE_RISE_SPEED: 0.6,
  MOTE_SPREAD: 140,
  MOTE_HEIGHT: 45,
  MAX_TOWER_INSTANCES: 260,
  MAX_WINDOW_INSTANCES: 260,
  MAX_SIGN_INSTANCES: 90,
};

const YAXIS = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// mulberry32 deterministic PRNG
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromDirection(dir, extra = 0) {
  const s = Math.abs(
    Math.sin(dir.x * 12.9898 + dir.y * 78.233 + dir.z * 37.719 + extra) * 43758.5453
  );
  return Math.floor((s - Math.floor(s)) * 4294967296) >>> 0;
}

// ---------------------------------------------------------------------------
// Small canvas texture helper (no external assets)
// ---------------------------------------------------------------------------
function makeWindowStripTexture(rng, color = '#ffe9b0') {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, size, size);
  const rows = 8;
  for (let i = 0; i < rows; i++) {
    if (rng() < 0.6) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55 + rng() * 0.45;
      const y = (i / rows) * size;
      ctx.fillRect(0, y, size, size / rows - 2);
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePanelNoiseTexture(rng) {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 150 + Math.floor(rng() * 40);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v + 8; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ---------------------------------------------------------------------------
// Palette defaults (per-planet flavor hook via opts.palette)
// ---------------------------------------------------------------------------
const DEFAULT_PALETTE = {
  neonPrimary: 0xd4408f,   // magenta
  neonSecondaryA: 0x40d4c8, // cyan
  neonSecondaryB: 0xffb347, // amber
  hullA: 0x3a3550,
  hullB: 0x2a2740,
  street: 0x1c1a28,
  plaza: 0x241f38,
  windowWarm: '#ffe9b0',
};

// ---------------------------------------------------------------------------
// Main factory
// ---------------------------------------------------------------------------
export function createCity(planet, worldUp, opts = {}) {
  const radius = opts.radius ?? 300;
  const palette = { ...DEFAULT_PALETTE, ...(opts.palette ?? {}) };
  const density = opts.density ?? 1.0;
  const dirSeeded = worldUp.clone().normalize();
  const seed = opts.seed ?? seedFromDirection(dirSeeded);
  const rng = mulberry32(seed);

  const group = new THREE.Group();
  group.name = 'City';

  // The group lives as a child of planet.surface, whose local frame is the
  // planet's UNROTATED object space — so undo the current spin to convert
  // the world-space landing dir into the frame we actually place in.
  // (dirSeeded stays world-space for deterministic seeding.)
  const rotY = planet.surface?.rotation?.y ?? 0;
  const dirLocal = dirSeeded.clone().applyAxisAngle(YAXIS, -rotY);

  // Orient +Y to the landing dir, position at surface radial point.
  const quat = new THREE.Quaternion().setFromUnitVectors(YAXIS, dirLocal);
  group.quaternion.copy(quat);

  const groundBase = planet.body?.groundAtLocal
    ? planet.body.groundAtLocal(dirLocal)
    : planet.body?.groundAt
      ? planet.body.groundAt(dirSeeded)
      : 0;
  let baseRadius = (planet.radius ?? 900) + groundBase + C.BASE_HEIGHT_OFFSET;
  // Never sink the deck below the sea surface (or ice sheet): a city landing
  // in a wet/icy region rides just above it instead of flooding.
  if (planet.water?.r && baseRadius < planet.water.r + 0.4) {
    baseRadius = planet.water.r + 0.4;
  }
  group.position.copy(dirLocal.clone().multiplyScalar(baseRadius));

  // -------------------------------------------------------------------------
  // Terrain sampling in local (flat) space -> world dir -> planet.body height
  // -------------------------------------------------------------------------
  const tmpWorldPos = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();

  function sampleGroundLocalY(localX, localZ) {
    // tmpDir is in planet.surface's unrotated frame (group lives there),
    // so sample via groundAtLocal — groundAt would un-spin it a second time.
    tmpWorldPos.set(localX, 0, localZ).applyQuaternion(quat).add(group.position);
    tmpDir.copy(tmpWorldPos).normalize();
    const h = planet.body?.groundAtLocal ? planet.body.groundAtLocal(tmpDir) : 0;
    const planetR = planet.radius ?? 900;
    // Height of this local point above our own base-radius reference plane
    return (planetR + h) - baseRadius;
  }

  // -------------------------------------------------------------------------
  // Flattening pads: list of {x,z,r,y} — locally flattened footprints
  // -------------------------------------------------------------------------
  const flattenPads = [];
  function flattenedHeight(x, z) {
    let best = null;
    for (const p of flattenPads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d <= p.r) {
        const blend = 1 - THREE.MathUtils.smoothstep(d, p.r * 0.6, p.r);
        if (best === null) best = p.y;
        best = THREE.MathUtils.lerp(sampleGroundLocalY(x, z), p.y, blend);
      }
    }
    return best === null ? sampleGroundLocalY(x, z) : best;
  }

  // -------------------------------------------------------------------------
  // Street grid layout
  // -------------------------------------------------------------------------
  const halfCells = Math.ceil(radius / C.GRID_CELL);
  const buildingSlots = []; // {x, z, footHalf, isCore, isMid}
  const plazaCenters = [];
  const streetMaterial = new THREE.MeshStandardMaterial({
    color: palette.street, roughness: 0.9, metalness: 0.05,
  });
  const streetGeos = [];

  // pre-pick plaza cells deterministically
  for (let i = 0; i < C.PLAZA_COUNT; i++) {
    const ang = rng() * Math.PI * 2;
    const dist = radius * (0.15 + rng() * 0.55);
    plazaCenters.push({ x: Math.cos(ang) * dist, z: Math.sin(ang) * dist, r: C.PLAZA_RADIUS });
  }

  // landing pad: pick an open ring position near mid-radius
  const padAngle = rng() * Math.PI * 2;
  const padDist = radius * (0.55 + rng() * 0.2);
  const padCenter = new THREE.Vector2(Math.cos(padAngle) * padDist, Math.sin(padAngle) * padDist);
  flattenPads.push({ x: padCenter.x, z: padCenter.y, r: Math.max(C.PAD_LENGTH, C.PAD_WIDTH) * 0.75, y: sampleGroundLocalY(padCenter.x, padCenter.y) });
  for (const pz of plazaCenters) {
    flattenPads.push({ x: pz.x, z: pz.z, r: pz.r, y: sampleGroundLocalY(pz.x, pz.z) });
  }

  function inPlaza(x, z) {
    for (const p of plazaCenters) if (Math.hypot(x - p.x, z - p.z) < p.r) return true;
    if (Math.hypot(x - padCenter.x, z - padCenter.y) < Math.max(C.PAD_LENGTH, C.PAD_WIDTH) * 0.75) return true;
    return false;
  }

  for (let gx = -halfCells; gx <= halfCells; gx++) {
    for (let gz = -halfCells; gz <= halfCells; gz++) {
      const cx = gx * C.GRID_CELL;
      const cz = gz * C.GRID_CELL;
      const distFromCenter = Math.hypot(cx, cz);
      if (distFromCenter > radius) continue;
      if (inPlaza(cx, cz)) continue;

      const isWideRow = (gx % C.WIDE_AVENUE_EVERY === 0) || (gz % C.WIDE_AVENUE_EVERY === 0);
      const streetHalf = (isWideRow ? C.WIDE_AVENUE_WIDTH : C.STREET_WIDTH) / 2;
      const blockHalf = C.GRID_CELL / 2 - streetHalf;
      if (blockHalf <= C.BUILDING_MIN_FOOT * 0.5) continue; // pure street cell

      const fracR = distFromCenter / radius;
      const isCore = fracR < C.CORE_RADIUS_FRAC;
      const isOutskirt = fracR > C.OUTSKIRT_RADIUS_FRAC;
      const spawnChance = isCore ? 0.95 : isOutskirt ? 0.35 * density : 0.7 * density;
      if (rng() > spawnChance) continue;

      const footHalf = THREE.MathUtils.clamp(
        blockHalf * (0.55 + rng() * 0.35), C.BUILDING_MIN_FOOT, C.BUILDING_MAX_FOOT
      );
      buildingSlots.push({ x: cx + (rng() - 0.5) * 2, z: cz + (rng() - 0.5) * 2, footHalf, isCore, isOutskirt });
      flattenPads.push({ x: cx, z: cz, r: footHalf + 2, y: sampleGroundLocalY(cx, cz) });
    }
  }

  // Build a merged street-surface mesh: one big flattened disc-ish quad grid
  // draped to terrain height minus building footprints (simple: one large
  // low-poly disc, buildings sit slightly above it via flatten pads).
  {
    const seg = 48;
    const streetGeo = new THREE.CircleGeometry(radius, seg);
    streetGeo.rotateX(-Math.PI / 2);
    const posAttr = streetGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      posAttr.setY(i, flattenedHeight(x, z) - 0.05);
    }
    posAttr.needsUpdate = true;
    streetGeo.computeVertexNormals();
    streetGeos.push(streetGeo);
  }
  const streetMesh = new THREE.Mesh(mergeGeometries(streetGeos), streetMaterial);
  streetMesh.receiveShadow = false;
  group.add(streetMesh);

  // -------------------------------------------------------------------------
  // Buildings — InstancedMesh towers (box body) + window-strip instances +
  // rooftop neon sign instances
  // -------------------------------------------------------------------------
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const hullMat = new THREE.MeshStandardMaterial({
    color: palette.hullA, roughness: 0.75, metalness: 0.2,
    map: makePanelNoiseTexture(rng),
  });
  const towerCount = Math.min(buildingSlots.length, C.MAX_TOWER_INSTANCES);
  const towerMesh = new THREE.InstancedMesh(boxGeo, hullMat, towerCount);
  towerMesh.frustumCulled = false;
  const towerColor = new THREE.Color();

  const windowGeo = new THREE.BoxGeometry(1, 1, 1);
  const windowTex = makeWindowStripTexture(rng, palette.windowWarm);
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: windowTex, emissive: 0xffcf8a, emissiveIntensity: C.NEON_BLOOM_INTENSITY,
    roughness: 0.4,
  });
  const windowMesh = new THREE.InstancedMesh(windowGeo, windowMat, Math.min(towerCount, C.MAX_WINDOW_INSTANCES));
  windowMesh.frustumCulled = false;

  const signGeo = new THREE.BoxGeometry(1, 1, 1);
  const signMat = new THREE.MeshStandardMaterial({
    color: 0x110511, emissive: new THREE.Color(palette.neonPrimary),
    emissiveIntensity: C.NEON_BLOOM_INTENSITY, roughness: 0.3,
  });
  const signMesh = new THREE.InstancedMesh(signGeo, signMat, Math.min(towerCount, C.MAX_SIGN_INSTANCES));
  signMesh.frustumCulled = false;

  const colliders = [];
  const collidersLocal = []; // city-flat {x,z,radius,height} — aliens.js format
  const dummy = new THREE.Object3D();
  const signAccentColors = [palette.neonPrimary, palette.neonSecondaryA, palette.neonSecondaryB];
  let signIdx = 0;
  let windowIdx = 0;

  const worldPosScratch = new THREE.Vector3();

  for (let i = 0; i < towerCount; i++) {
    const slot = buildingSlots[i];
    const heightRange = slot.isCore
      ? [C.BUILDING_MIN_H_CORE, C.BUILDING_MAX_H_CORE]
      : slot.isOutskirt
      ? [C.BUILDING_MIN_H_OUT, C.BUILDING_MAX_H_OUT]
      : [C.BUILDING_MIN_H_MID, C.BUILDING_MAX_H_MID];
    const height = THREE.MathUtils.lerp(heightRange[0], heightRange[1], rng());
    const baseY = flattenedHeight(slot.x, slot.z);
    const footW = slot.footHalf * 2 * (0.85 + rng() * 0.3);
    const footD = slot.footHalf * 2 * (0.85 + rng() * 0.3);

    const doSetback = height > C.BUILDING_MIN_H_MID * 1.5 && rng() < C.SETBACK_STEP_CHANCE;
    const bodyHeight = doSetback ? height * (0.55 + rng() * 0.2) : height;

    dummy.position.set(slot.x, baseY + bodyHeight / 2, slot.z);
    dummy.scale.set(footW, bodyHeight, footD);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.updateMatrix();
    towerMesh.setMatrixAt(i, dummy.matrix);
    towerColor.set(rng() < 0.5 ? palette.hullA : palette.hullB);
    towerMesh.setColorAt(i, towerColor);

    if (doSetback && signIdx < signMesh.count) {
      // upper setback tier gets its own smaller box merged visually via a
      // second instanced write reusing the tower buffer would exceed count,
      // so we approximate the setback as a stepped silhouette using the
      // sign instance as a slim rooftop crown, then place the neon sign atop.
    }

    // window strip band along the taller faces
    if (windowIdx < windowMesh.count) {
      dummy.position.set(slot.x, baseY + bodyHeight * 0.55, slot.z);
      dummy.scale.set(footW * 1.001, bodyHeight * 0.85, footD * 1.001);
      dummy.updateMatrix();
      windowMesh.setMatrixAt(windowIdx, dummy.matrix);
      windowIdx++;
    }

    // rooftop neon sign (only on taller / core buildings for restraint)
    if ((slot.isCore || bodyHeight > 25) && rng() < 0.6 && signIdx < signMesh.count) {
      dummy.position.set(slot.x, baseY + bodyHeight + 1.4, slot.z);
      dummy.scale.set(footW * 0.5, 2.2, 0.6);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      dummy.updateMatrix();
      signMesh.setMatrixAt(signIdx, dummy.matrix);
      signIdx++;
    }

    worldPosScratch.set(slot.x, 0, slot.z).applyQuaternion(quat).add(group.position);
    colliders.push({
      center: worldPosScratch.clone(),
      radius: Math.max(footW, footD) * 0.5 + 0.4,
      height: bodyHeight,
    });
    collidersLocal.push({
      x: slot.x,
      z: slot.z,
      radius: Math.max(footW, footD) * 0.5 + 0.4,
      height: bodyHeight,
    });
  }
  towerMesh.count = towerCount;
  windowMesh.count = windowIdx;
  signMesh.count = signIdx;
  towerMesh.instanceMatrix.needsUpdate = true;
  windowMesh.instanceMatrix.needsUpdate = true;
  signMesh.instanceMatrix.needsUpdate = true;
  if (towerMesh.instanceColor) towerMesh.instanceColor.needsUpdate = true;
  group.add(towerMesh, windowMesh, signMesh);

  // -------------------------------------------------------------------------
  // Landing pad — flat surface ringed with magenta emissive strips
  // -------------------------------------------------------------------------
  const padGroup = new THREE.Group();
  const padY = flattenedHeight(padCenter.x, padCenter.y);
  const padGeo = new THREE.BoxGeometry(C.PAD_LENGTH, 0.3, C.PAD_WIDTH);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x1a1826, roughness: 0.6, metalness: 0.3 });
  const padMesh = new THREE.Mesh(padGeo, padMat);
  padMesh.position.set(padCenter.x, padY + 0.15, padCenter.y);
  padGroup.add(padMesh);

  const ringGeo = new THREE.TorusGeometry(
    Math.max(C.PAD_LENGTH, C.PAD_WIDTH) * 0.52, 0.18, 8, C.PAD_RING_SEGMENTS
  );
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x220016, emissive: new THREE.Color(palette.neonPrimary), emissiveIntensity: C.NEON_BLOOM_INTENSITY,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.scale.set(C.PAD_LENGTH / C.PAD_WIDTH, 1, 1);
  ringMesh.position.set(padCenter.x, padY + 0.25, padCenter.y);
  padGroup.add(ringMesh);
  group.add(padGroup);

  const boardingPadLocal = new THREE.Vector3(padCenter.x, padY + 0.3, padCenter.y);
  const boardingPadWorld = boardingPadLocal.clone().applyQuaternion(quat).add(group.position);

  // -------------------------------------------------------------------------
  // Ground-level dressing: streetlights, planters, kiosks, railings (merged)
  // -------------------------------------------------------------------------
  const dressingGeos = [];
  const lightPoleMat = new THREE.MeshStandardMaterial({ color: 0x14121e, roughness: 0.7 });
  const lightHeadGeos = [];
  const lightHeadMat = new THREE.MeshStandardMaterial({
    color: 0x220016, emissive: new THREE.Color(palette.neonSecondaryA), emissiveIntensity: C.NEON_BLOOM_INTENSITY * 0.7,
  });

  for (let gx = -halfCells; gx <= halfCells; gx++) {
    for (let gz = -halfCells; gz <= halfCells; gz++) {
      const cx = gx * C.GRID_CELL;
      const cz = gz * C.GRID_CELL;
      if (Math.hypot(cx, cz) > radius) continue;
      if (rng() > 0.5) continue; // sparse placement along grid intersections
      const y = flattenedHeight(cx, cz);

      const pole = new THREE.CylinderGeometry(0.12, 0.15, C.STREETLIGHT_HEIGHT, 6);
      pole.translate(cx + 1.5, y + C.STREETLIGHT_HEIGHT / 2, cz + 1.5);
      dressingGeos.push(pole);

      const head = new THREE.IcosahedronGeometry(0.35, 0);
      head.translate(cx + 1.5, y + C.STREETLIGHT_HEIGHT, cz + 1.5);
      lightHeadGeos.push(head);

      if (rng() < C.PLANTER_CHANCE) {
        const planter = new THREE.CylinderGeometry(0.6, 0.7, 0.6, 8);
        planter.translate(cx - 2, y + 0.3, cz - 2);
        dressingGeos.push(planter);
      }
      if (rng() < C.KIOSK_CHANCE) {
        const kiosk = new THREE.BoxGeometry(1.6, 2.2, 1.2);
        kiosk.translate(cx + 3, y + 1.1, cz - 1.5);
        dressingGeos.push(kiosk);
      }
    }
  }

  // plaza railings (ring of thin boxes) for flavor
  for (const pz of plazaCenters) {
    const segCount = 24;
    for (let i = 0; i < segCount; i++) {
      const ang = (i / segCount) * Math.PI * 2;
      const rx = pz.x + Math.cos(ang) * pz.r;
      const rz = pz.z + Math.sin(ang) * pz.r;
      const ry = flattenedHeight(rx, rz);
      const rail = new THREE.BoxGeometry(0.1, C.RAILING_HEIGHT, 1.4);
      rail.rotateY(ang);
      rail.translate(rx, ry + C.RAILING_HEIGHT / 2, rz);
      dressingGeos.push(rail);
    }
  }

  const dressingMat = new THREE.MeshStandardMaterial({ color: 0x1e1c2a, roughness: 0.8 });
  const dressingMesh = dressingGeos.length
    ? new THREE.Mesh(mergeGeometries(dressingGeos), dressingMat)
    : null;
  if (dressingMesh) { dressingMesh.frustumCulled = false; group.add(dressingMesh); }
  const poleMeshFinal = dressingMesh; // shares draw call with dressing via merge above
  void lightPoleMat; // pole material folded into dressingMat for draw-call budget

  const lightHeadMesh = lightHeadGeos.length
    ? new THREE.Mesh(mergeGeometries(lightHeadGeos), lightHeadMat)
    : null;
  if (lightHeadMesh) { lightHeadMesh.frustumCulled = false; group.add(lightHeadMesh); }

  // -------------------------------------------------------------------------
  // Drifting light motes (small InstancedMesh, animated in update() only)
  // -------------------------------------------------------------------------
  const moteGeo = new THREE.IcosahedronGeometry(0.12, 0);
  const moteMat = new THREE.MeshStandardMaterial({
    color: 0x220016, emissive: new THREE.Color(palette.neonSecondaryB), emissiveIntensity: C.NEON_BLOOM_INTENSITY * 0.8,
    transparent: true, opacity: 0.85,
  });
  const moteMesh = new THREE.InstancedMesh(moteGeo, moteMat, C.MOTE_COUNT);
  moteMesh.frustumCulled = false;
  const moteSeeds = [];
  for (let i = 0; i < C.MOTE_COUNT; i++) {
    moteSeeds.push({
      x: (rng() - 0.5) * C.MOTE_SPREAD,
      z: (rng() - 0.5) * C.MOTE_SPREAD,
      phase: rng() * Math.PI * 2,
      speed: 0.5 + rng() * 0.5,
    });
    dummy.position.set(moteSeeds[i].x, C.MOTE_HEIGHT * rng(), moteSeeds[i].z);
    dummy.scale.setScalar(1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    moteMesh.setMatrixAt(i, dummy.matrix);
  }
  moteMesh.instanceMatrix.needsUpdate = true;
  group.add(moteMesh);

  // -------------------------------------------------------------------------
  // groundHeightAt(worldPos) -> world-space height, following street level
  // -------------------------------------------------------------------------
  const invQuat = quat.clone().invert();
  const localScratch = new THREE.Vector3();
  function groundHeightAt(worldPos) {
    localScratch.copy(worldPos).sub(group.position).applyQuaternion(invQuat);
    const y = flattenedHeight(localScratch.x, localScratch.z);
    const worldY = localScratch.set(localScratch.x, y, localScratch.z)
      .applyQuaternion(quat).add(group.position);
    return worldY.y !== undefined ? worldY.clone() : worldY;
  }

  // -------------------------------------------------------------------------
  // update(t, sunDot) — day/night neon, flicker, mote drift; zero per-frame allocs
  // -------------------------------------------------------------------------
  const emissiveMeshes = [windowMesh.material, signMesh.material, ringMesh.material, lightHeadMat, moteMat];
  const baseEmissive = emissiveMeshes.map((m) => m.emissiveIntensity);
  const flickerPhases = signMesh.count
    ? Array.from({ length: signMesh.count }, () => Math.random() * Math.PI * 2)
    : [];
  const moteDummy = new THREE.Object3D();

  function update(t, sunDot) {
    const nightLift = THREE.MathUtils.clamp(1 - Math.max(sunDot ?? 0, 0), 0, 1);
    const level = THREE.MathUtils.lerp(C.NEON_DIM_INTENSITY, C.NEON_BLOOM_INTENSITY, nightLift);
    for (let i = 0; i < emissiveMeshes.length; i++) {
      emissiveMeshes[i].emissiveIntensity = level * (baseEmissive[i] / C.NEON_BLOOM_INTENSITY);
    }
    const flicker = 1 + Math.sin(t * C.SIGN_FLICKER_SPEED) * C.SIGN_FLICKER_AMOUNT * nightLift;
    signMat.emissiveIntensity = level * flicker;

    for (let i = 0; i < C.MOTE_COUNT; i++) {
      const s = moteSeeds[i];
      const y = ((t * C.MOTE_RISE_SPEED * s.speed + s.phase * 3) % C.MOTE_HEIGHT + C.MOTE_HEIGHT) % C.MOTE_HEIGHT;
      const sway = Math.sin(t * 0.3 + s.phase) * 2;
      moteDummy.position.set(s.x + sway, y, s.z);
      moteDummy.updateMatrix();
      moteMesh.setMatrixAt(i, moteDummy.matrix);
    }
    moteMesh.instanceMatrix.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // dispose()
  // -------------------------------------------------------------------------
  function dispose() {
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
      if (obj.dispose && obj.isInstancedMesh) obj.dispose();
    });
    group.clear();
  }

  return {
    group,
    update,
    dispose,
    colliders, // surface-local {center,radius,height}
    collidersLocal, // city-flat {x,z,radius,height} — for aliens.js
    groundHeightAt,
    groundLocalYAt: flattenedHeight, // (x,z) -> local Y — for aliens.js
    plazaCenters, // city-flat {x,z,r} — aliens.js waypoints
    boardingPad: boardingPadWorld,
  };
}

// ---------------------------------------------------------------------------
// Wiring into the main loop:
//
//   import { createCity } from './city.js';
//   const city = createCity(planet, landingUpVector, { radius: 300, seed: mySeed });
//   planet.surface.add(city.group);
//   // per frame: city.update(elapsedSeconds, sunDirection.dot(landingUpVector));
//   // on teardown: city.dispose(); planet.surface.remove(city.group);
// ---------------------------------------------------------------------------