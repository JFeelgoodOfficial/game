/**
 * city.js — Permanent flagship towns draped over a spherical planet surface.
 *
 * v2 — towns of real people. The old instanced-box skyline (windows painted
 * on by shader, doorways faked with lit panels) is gone. A town is now:
 *   - ONE building per citizen (world/cityRegistry.js citizens[]), each fully
 *     enterable: real floor slab, real walls with GLASS window openings, an
 *     OPEN doorway (no door leaf), a high ceiling (5.2 u), and furnishing
 *     keyed to the resident's role. All of it merged into shared per-material
 *     meshes built from the PBR material registry (world/actuality-materials).
 *   - An ELEVATOR TOWER: ground lobby, enclosed moving cab with call buttons
 *     (the town's one ride), and a glass PENTHOUSE on top where the governor
 *     lives, overlooking the town from a balcony.
 *   - A central plaza, a landing pad OUTSIDE the town edge, and a lit walkway
 *     from the pad through a gate into town.
 *
 * COORDINATE ASSUMPTIONS (unchanged from v1)
 * - The city `group` is parented to `planet.surface` and lives in UNROTATED
 *   object space: the planet's own spin + floating-origin rebasing carry the
 *   city along for free.
 * - `worldUp` (THREE.Vector3, world-space) is the radial site direction. We
 *   build in a local frame where local +Y = site dir, group.quaternion =
 *   setFromUnitVectors(+Y, dir), group.position = dir * baseRadius.
 * - Inside the group children use a flat X/Z grid; sampleGroundLocalY solves
 *   the sphere exactly per point so everything sits ON the terrain.
 * - Buildings are axis-aligned in city-local space so walkable surfaces and
 *   wall AABBs stay simple (the makeStructure contract walk.js consumes).
 *
 * MATERIAL OWNERSHIP (the v2 rule)
 * - `opts.materials` is the shared registry. Everything it hands out
 *   (make/glassFor/tiledSet/steel/...) is REGISTRY-OWNED and must never be
 *   disposed here — walk.js disposes the registry last, after every consumer.
 * - Locally created materials/textures go into ownedMaterials/ownedTextures
 *   and only those are disposed. dispose() frees all geometry but no longer
 *   blanket-disposes materials off the scene graph.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import basicVert from './shaders/basic.vert?raw';
import cityHazeFrag from './shaders/cityHaze.frag?raw';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const C = {
  BASE_HEIGHT_OFFSET: 0.05, // lift above sampled ground to avoid z-fight
  // Drop below analytic ground. This used to be 0.35 to compensate for the
  // coarse render mesh (~16 u vertex spacing) dipping between verts on rolling
  // terrain. src/cityflatten.js now bakes every vertex inside the town disc to
  // the same height, so the mesh interpolates exactly flat and the old margin
  // would just let terrain render above the street.
  SINK: 0.05,
  PLAZA_RADIUS: 14,
  // Houses are built at 2x the authored kit footprint and 2x the ceiling
  // height: the third-person camera boom is 7.6 units, and at the old 11-16
  // unit room width it had nowhere to sit indoors except through a wall.
  HOUSE_SCALE: 2,
  HOUSE_RING_MIN: 34, // floor for the house ring — the real radius is derived
  HOUSE_RING_MAX: 52, //   from the largest footprint (see the slot layout)
  ROOM_H: 10.4, // interior ceiling height — high, airy, easy to walk and talk in
  WALL_T: 0.35,
  DOOR_HALF: 1.3, // open doorway: 2.6 wide ...
  DOOR_H: 4.6, // ... and 4.6 tall
  WIN_W: 2.6, // window opening width
  WIN_H: 3.2, // window opening height
  WIN_SILL: 1.1, // sill height above the floor (human scale — does not scale)
  ROOF_T: 0.35,
  PAD_LENGTH: 20,
  PAD_WIDTH: 14,
  PAD_RING_SEGMENTS: 48,
  WALKWAY_W: 6,
  STREETLIGHT_HEIGHT: 6,
  NEON_BLOOM_INTENSITY: 1.6, // above 0.85 bloom threshold
  NEON_DIM_INTENSITY: 0.25,
  MOTE_COUNT: 40,
  MOTE_RISE_SPEED: 0.6,
  MOTE_SPREAD: 110,
  MOTE_HEIGHT: 40,
  TRAFFIC_COUNT: 10, // grav-car streaks circling above the tower
  // Elevator tower
  TOWER_HALF: 5.5, // 11 x 11 footprint
  TOWER_TOP: 42, // penthouse floor level above the tower base
  LOBBY_H: 5.0,
  PENT_H: 5.2,
  PARAPET: 1.1,
  KNEE: 1.0, // penthouse glass sits on a solid knee wall — see out, never fall out
  CAB_RIDE_SPEED: 2.8, // u/s — 0.047 u/frame @60Hz, far under walk.js STEP_UP 0.7,
                       // so the rising cab floor carries the player like a slow stair
  CAB_CEIL: 4.6, // tall cab: a jump inside (apex ~2.1 over feet) stays under it
};

const YAXIS = new THREE.Vector3(0, 1, 0);
const GATE_DISABLED = 1e9; // wall record y0 sentinel — resolveWalls never matches

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

// Registry-material recipe fallback: what a town is built FROM when its style
// doesn't say. Families index world/actuality-materials.js; colors tint the
// luminance-baked maps.
const DEFAULT_BUILD = {
  wall: 'concrete', wallColor: 0x9aa0ae,
  floor: 'wood', floorColor: 0x8a6a48,
  roof: 'concrete', roofColor: 0x5f6470,
  plazaFam: 'stone', plazaColor: 0x8b8578,
  walkFam: 'concrete', walkColor: 0x8f8c96,
};

// ---------------------------------------------------------------------------
// Per-world style presets (opts.style): the town's neon identity (palette)
// plus its build recipe (registry material families + tints). One code path,
// seven distinct worlds.
// ---------------------------------------------------------------------------
export const CITY_STYLES = [
  {
    name: 'neonMetropolis', // terra capital — steel-and-concrete under loud neon
    palette: {
      neonPrimary: 0xff2fa0, neonSecondaryA: 0x2fe8ff, neonSecondaryB: 0xd8ff2f,
      hullA: 0x2c2a44, hullB: 0x1d1b30, street: 0x16141f, plaza: 0x201b33,
      windowWarm: '#ffe9b0',
    },
    build: {
      wall: 'concrete', wallColor: 0x9aa0b4, floor: 'wood', floorColor: 0x8a6a48,
      roof: 'concrete', roofColor: 0x565a6a, plazaFam: 'stone', plazaColor: 0x7f7c8c,
      walkFam: 'concrete', walkColor: 0x8f8c9c,
    },
  },
  {
    name: 'dustOutpost', // rustia frontier town — plaster and oxide amber
    palette: {
      neonPrimary: 0xffb347, neonSecondaryA: 0xff7847, neonSecondaryB: 0xffd9a0,
      hullA: 0x4a3d33, hullB: 0x3a3028, street: 0x2a231c, plaza: 0x332a20,
      windowWarm: '#ffd9a0',
    },
    build: {
      wall: 'plaster', wallColor: 0xc9a97e, floor: 'wood', floorColor: 0x8a6a48,
      roof: 'plaster', roofColor: 0xa8895f, plazaFam: 'aggregate', plazaColor: 0x9a8264,
      walkFam: 'aggregate', walkColor: 0xa48a6a,
    },
  },
  {
    name: 'verdantTerrace', // garden town — warm plaster, living wood
    palette: {
      neonPrimary: 0x40d4c8, neonSecondaryA: 0x7dff6a, neonSecondaryB: 0xb47dff,
      hullA: 0x2f4038, hullB: 0x243329, street: 0x1b241d, plaza: 0x223026,
      windowWarm: '#eaffd8',
    },
    build: {
      wall: 'plaster', wallColor: 0xd8d2ba, floor: 'wood', floorColor: 0x8a6a48,
      roof: 'wood', roofColor: 0x6f5640, plazaFam: 'stone', plazaColor: 0x8f8a76,
      walkFam: 'stone', walkColor: 0x9a9480,
    },
  },
  {
    name: 'tideLuminous', // shore town — wet concrete, shell-glisten trim
    palette: {
      neonPrimary: 0x4adfff, neonSecondaryA: 0x9a6aff, neonSecondaryB: 0x6a8fff,
      hullA: 0x1a1f4a, hullB: 0x252a5e, street: 0x101430, plaza: 0x161b3c,
      windowWarm: '#9ab8ff',
    },
    build: {
      wall: 'concrete', wallColor: 0x9aa4bc, floor: 'stone', floorColor: 0x7f8aa8,
      roof: 'concrete', roofColor: 0x6a7490, plazaFam: 'stone', plazaColor: 0x76809c,
      walkFam: 'concrete', walkColor: 0x8892ac,
    },
  },
  {
    name: 'basecampNeon', // wyattmattoe ridge resort — timber lodges, lift-line neon
    palette: {
      neonPrimary: 0xff7a2f, neonSecondaryA: 0x4adfff, neonSecondaryB: 0xf4f8ff,
      hullA: 0x37404e, hullB: 0x272e3a, street: 0x1a2029, plaza: 0x232b36,
      windowWarm: '#ffe9b0',
    },
    build: {
      wall: 'wood', wallColor: 0x9a7b5a, floor: 'wood', floorColor: 0x8a6a48,
      roof: 'stone', roofColor: 0x6b7280, plazaFam: 'stone', plazaColor: 0x7c828e,
      walkFam: 'stone', walkColor: 0x878d99,
    },
  },
  {
    name: 'abyssGlow', // neptunia trench port — sealed concrete, violet strobe
    palette: {
      neonPrimary: 0x9a6aff, neonSecondaryA: 0x4adfff, neonSecondaryB: 0x304aff,
      hullA: 0x141838, hullB: 0x0e1128, street: 0x0a0d20, plaza: 0x101430,
      windowWarm: '#9ab8ff',
    },
    build: {
      wall: 'concrete', wallColor: 0x767e9e, floor: 'concrete', floorColor: 0x565e7e,
      roof: 'steel', roofColor: 0x4a5068, plazaFam: 'concrete', plazaColor: 0x5c6484,
      walkFam: 'concrete', walkColor: 0x6a7292,
    },
  },
  {
    name: 'graniteCamp', // stone village — granite walls, lantern amber
    palette: {
      neonPrimary: 0xffb347, neonSecondaryA: 0xf4f8ff, neonSecondaryB: 0x4adfff,
      hullA: 0x4a4f58, hullB: 0x343941, street: 0x22262c, plaza: 0x2b3037,
      windowWarm: '#ffe9b0',
    },
    build: {
      wall: 'stone', wallColor: 0x9aa0aa, floor: 'wood', floorColor: 0x8a6a48,
      roof: 'stone', roofColor: 0x757c88, plazaFam: 'stone', plazaColor: 0x828892,
      walkFam: 'stone', walkColor: 0x8d939d,
    },
  },
];

// ---------------------------------------------------------------------------
// Walkable-structure helper: given axis-aligned slab/ramp surfaces and wall
// AABBs in an origin-local frame, returns the {surfaceYAt, resolveWalls}
// contract walk.js consumes. Shared by every citizen house and the elevator
// tower here, and exported for stationWalk.js / actuality.js.
// The surfaces/walls ARRAYS are captured live — mutating a record (the
// elevator cab floor/gates) is legal and takes effect on the next query.
// ---------------------------------------------------------------------------
const STRUCT_STEP_UP = 0.7;
export function makeStructure(ox, oz, baseY, surfaces, walls, halfExtent) {
  return {
    x: ox, z: oz, baseY, halfExtent,
    // Highest walkable slab/ramp under (x,z) reachable from feetY, or null.
    surfaceYAt(x, z, feetY) {
      const lx = x - ox, lz = z - oz;
      if (lx < -halfExtent - 0.4 || lx > halfExtent + 0.4 ||
          lz < -halfExtent - 0.4 || lz > halfExtent + 0.4) return null;
      let best = null;
      for (const s of surfaces) {
        if (lx < s.x0 || lx > s.x1 || lz < s.z0 || lz > s.z1) continue;
        let y;
        if (s.ramp) {
          const t = THREE.MathUtils.clamp((lz - s.zA) / (s.zB - s.zA), 0, 1);
          y = s.yA + (s.yB - s.yA) * t;
        } else {
          y = s.y;
        }
        y += baseY;
        if (y <= feetY + STRUCT_STEP_UP && (best === null || y > best)) best = y;
      }
      return best;
    },
    // 2D AABB push-out for walls whose height band overlaps the body. p is a
    // city-local position (y = feet); returns true if it moved.
    resolveWalls(p, r) {
      let lx = p.x - ox, lz = p.z - oz;
      if (Math.abs(lx) > halfExtent + 2 || Math.abs(lz) > halfExtent + 2) return false;
      const feet = p.y - baseY;
      let pushed = false;
      for (const w of walls) {
        if (feet >= w.y1 || feet + 1.7 <= w.y0) continue;
        const ex0 = w.x0 - r, ex1 = w.x1 + r, ez0 = w.z0 - r, ez1 = w.z1 + r;
        if (lx <= ex0 || lx >= ex1 || lz <= ez0 || lz >= ez1) continue;
        const dx = Math.min(lx - ex0, ex1 - lx);
        const dz = Math.min(lz - ez0, ez1 - lz);
        if (dx < dz) lx = lx - ex0 < ex1 - lx ? ex0 : ex1;
        else lz = lz - ez0 < ez1 - lz ? ez0 : ez1;
        pushed = true;
      }
      if (pushed) { p.x = ox + lx; p.z = oz + lz; }
      return pushed;
    },
    // First wall crossed by the city-local segment (x0,z0)->(x1,z1) at foot
    // height feetY: the fraction along it, or null for a clear line. The walk
    // camera uses this to shorten its boom instead of sitting outside the wall
    // the player is standing behind. Same height-band gate resolveWalls uses,
    // so glass counts exactly as much as stone — both stop the view.
    segmentHit(x0, z0, x1, z1, feetY) {
      const ax = x0 - ox, az = z0 - oz;
      const bx = x1 - ox, bz = z1 - oz;
      const lim = halfExtent + 2;
      if ((ax < -lim && bx < -lim) || (ax > lim && bx > lim) ||
          (az < -lim && bz < -lim) || (az > lim && bz > lim)) return null;
      const feet = feetY - baseY;
      const dx = bx - ax, dz = bz - az;
      let best = null;
      for (const w of walls) {
        if (feet >= w.y1 || feet + 1.7 <= w.y0) continue;
        let t0 = 0, t1 = 1;
        if (dx === 0) {
          if (ax < w.x0 || ax > w.x1) continue;
        } else {
          let ta = (w.x0 - ax) / dx, tb = (w.x1 - ax) / dx;
          if (ta > tb) { const s = ta; ta = tb; tb = s; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
        if (dz === 0) {
          if (az < w.z0 || az > w.z1) continue;
        } else {
          let ta = (w.z0 - az) / dz, tb = (w.z1 - az) / dz;
          if (ta > tb) { const s = ta; ta = tb; tb = s; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
        if (t1 < 0 || t0 > 1) continue;
        // t0 <= 0 means the segment starts inside this wall — nothing to clamp.
        if (t0 > 0 && (best === null || t0 < best)) best = t0;
      }
      return best;
    },
  };
}

// ---------------------------------------------------------------------------
// House kits: what each citizen role lives in. half = footprint half-extent.
// ---------------------------------------------------------------------------
const ROLE_KITS = {
  merchant: { kind: 'shop', half: 7 },
  artisan: { kind: 'studio', half: 6.5 },
  farmer: { kind: 'greenhouse', half: 7 },
  gardener: { kind: 'greenhouse', half: 7 },
  scholar: { kind: 'study', half: 6 },
  entertainer: { kind: 'stage', half: 7 },
  guide: { kind: 'cottage', half: 5.5 },
  apprentice: { kind: 'cottage', half: 5.5 },
  caretaker: { kind: 'cottage', half: 5.5 },
  elite: { kind: 'villa', half: 8 },
  governor: { kind: 'villa', half: 8 }, // only if not homed in the penthouse
  resident: { kind: 'cottage', half: 5.5 },
};

// ---------------------------------------------------------------------------
// Main factory
// ---------------------------------------------------------------------------
export function createCity(planet, worldUp, opts = {}) {
  const radius = opts.radius ?? 150;
  const style = opts.style ?? null;
  const palette = { ...DEFAULT_PALETTE, ...(style?.palette ?? {}), ...(opts.palette ?? {}) };
  const build = { ...DEFAULT_BUILD, ...(style?.build ?? {}) };
  const M = opts.materials ?? null; // shared PBR registry (walk.js surfaceMaterials)
  const roster = opts.citizens ?? [];
  // Cities are permanent: the layout seed always comes from the registry
  // (world/cityRegistry.js), never from the landing direction — a player who
  // lands twice must find the same streets both times.
  const seed = opts.seed ?? 0;
  const rng = mulberry32(seed);

  const group = new THREE.Group();
  group.name = 'City';

  // Everything created LOCALLY (not by the registry) that must die with the
  // city. Registry-owned materials are never pushed here — see header rule.
  const ownedMaterials = [];
  const ownedTextures = [];
  const own = (m) => { ownedMaterials.push(m); return m; };

  // Registry material accessors with plain-material fallbacks so the module
  // still works if a caller has no registry in hand.
  const fam = (family, o = {}) => M
    ? M.make(family, { repeat: o.repeat ?? 3, color: o.color ?? 0xffffff, roughness: o.roughness ?? 0.95, metalness: o.metalness ?? 0.05 })
    : own(new THREE.MeshStandardMaterial({ color: o.color ?? 0x888888, roughness: o.roughness ?? 0.95, metalness: o.metalness ?? 0.05 }));
  const glass = M ? M.glassFor(palette.neonSecondaryA) : {
    pane: own(new THREE.MeshStandardMaterial({ color: 0xdfe8f2, metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.17, depthWrite: false, side: THREE.DoubleSide })),
    scrim: own(new THREE.MeshBasicMaterial({ color: palette.neonSecondaryA, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })),
  };
  const mullionMat = M ? M.steelBright : fam('none', { color: 0xb9bec6, metalness: 0.9, roughness: 0.5 });

  // Fill light: the global scene ambient is very dim (built for the vacuum of
  // space); a hemisphere fill models the facades better than a flat ambient.
  const fillLight = new THREE.HemisphereLight(0x7d8ab0, palette.plaza, 0.75);
  group.add(fillLight);

  // Shared FX uniforms for shader-driven elements (haze).
  const fx = { uTime: { value: 0 }, uNight: { value: 0 } };
  const structures = []; // every enterable building: houses + elevator tower
  const homes = []; // per-citizen home manifest (world/citizens.js)

  // The group lives as a child of planet.surface (UNROTATED object space) —
  // undo the current spin to convert the world-space site dir into that frame.
  const dirSeeded = worldUp.clone().normalize();
  const rotY = planet.surface?.rotation?.y ?? 0;
  const dirLocal = dirSeeded.clone().applyAxisAngle(YAXIS, -rotY);

  const quat = new THREE.Quaternion().setFromUnitVectors(YAXIS, dirLocal);
  group.quaternion.copy(quat);

  const groundBase = planet.body?.groundAtLocal
    ? planet.body.groundAtLocal(dirLocal)
    : planet.body?.groundAt
      ? planet.body.groundAt(dirSeeded)
      : 0;
  let baseRadius = (planet.radius ?? 900) + groundBase + C.BASE_HEIGHT_OFFSET;
  // Never sink the deck below the sea surface (or ice sheet).
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
    tmpWorldPos.set(localX, 0, localZ).applyQuaternion(quat).add(group.position);
    tmpDir.copy(tmpWorldPos).normalize();
    const h = planet.body?.groundAtLocal ? planet.body.groundAtLocal(tmpDir) : 0;
    const planetR = planet.radius ?? 900;
    let rr = planetR + h;
    if (planet.water?.r) rr = Math.max(rr, planet.water.r + 0.4);
    // Drop the flat tangent-plane point onto the sphere exactly.
    const d2 = localX * localX + localZ * localZ;
    return Math.sqrt(Math.max(rr * rr - d2, 0)) - baseRadius - C.SINK;
  }

  // Is the terrain under this local point below the sea surface? A FROZEN sea
  // is solid ground (wyattmattoe's canyon lakes) — the deck clamp keeps it level.
  function isWetLocal(localX, localZ) {
    if (!planet.water?.r || planet.water.frozen) return false;
    tmpWorldPos.set(localX, 0, localZ).applyQuaternion(quat).add(group.position);
    tmpDir.copy(tmpWorldPos).normalize();
    const h = planet.body?.groundAtLocal ? planet.body.groundAtLocal(tmpDir) : 0;
    return (planet.radius ?? 900) + h < planet.water.r + 0.4;
  }

  // -------------------------------------------------------------------------
  // Flattening pads: list of {x,z,r,y} — locally flattened footprints
  // -------------------------------------------------------------------------
  const flattenPads = [];
  // Highest pad wins. Two things matter here: the raw sample is hoisted out of
  // the loop (one fbm evaluation instead of one per overlapping pad), and the
  // result is a max rather than "whichever pad happened to be pushed last" —
  // pads are pushed from five different places and overlap freely, so an
  // order-dependent rule let a house pad get dragged down into a neighbouring
  // lower plaza pad. Blend weights still fall to zero at each rim, so the
  // surface stays continuous.
  function flattenedHeight(x, z) {
    const raw = sampleGroundLocalY(x, z);
    let best = null;
    for (const p of flattenPads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > p.r) continue;
      const blend = 1 - THREE.MathUtils.smoothstep(d, p.r * 0.6, p.r);
      const y = THREE.MathUtils.lerp(raw, p.y, blend);
      if (best === null || y > best) best = y;
    }
    return best === null ? raw : best;
  }

  // -------------------------------------------------------------------------
  // Layout: plaza at the origin, pad outside the edge, gate + walkway between,
  // houses on a ring, elevator tower across the plaza from the gate.
  // -------------------------------------------------------------------------
  const plazaCenters = [{ x: 0, z: 0, r: C.PLAZA_RADIUS }];
  flattenPads.push({ x: 0, z: 0, r: C.PLAZA_RADIUS + 4, y: sampleGroundLocalY(0, 0) });

  // Landing pad: the registry pins it OUTSIDE the town radius (opts.padLocal —
  // the auto-land arc targets the same coordinates via cityRegistry.padLocalDir).
  const padCenter = new THREE.Vector2();
  if (opts.padLocal) {
    padCenter.set(opts.padLocal.x, opts.padLocal.z);
  } else {
    // Fallback for callers without a registry entry: just outside the edge.
    const ang = rng() * Math.PI * 2;
    padCenter.set(Math.cos(ang) * (radius + 34), Math.sin(ang) * (radius + 34));
  }
  const padDist = padCenter.length();
  const gateBearing = Math.atan2(padCenter.y, padCenter.x);
  const outerRadius = padDist + 25; // walk.js collision/ground gates extend here
  flattenPads.push({
    x: padCenter.x, z: padCenter.y,
    r: Math.max(C.PAD_LENGTH, C.PAD_WIDTH) * 0.75,
    y: sampleGroundLocalY(padCenter.x, padCenter.y),
  });

  // Town gate on the pad bearing, just inside the edge.
  const gateSpot = {
    x: Math.cos(gateBearing) * radius * 0.95,
    z: Math.sin(gateBearing) * radius * 0.95,
  };

  // Walkway flatten pads: pad apron -> gate -> plaza rim, every ~8 u, each at
  // its own sampled height so the strip hugs the terrain without cliffs.
  const walkwayPts = [];
  {
    const from = padCenter, mid = gateSpot;
    const addLeg = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const steps = Math.max(2, Math.ceil(len / 8));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        walkwayPts.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t });
      }
    };
    addLeg(from.x, from.y, mid.x, mid.z);
    const rimX = Math.cos(gateBearing) * (C.PLAZA_RADIUS - 2);
    const rimZ = Math.sin(gateBearing) * (C.PLAZA_RADIUS - 2);
    addLeg(mid.x, mid.z, rimX, rimZ);
    for (const p of walkwayPts) {
      flattenPads.push({ x: p.x, z: p.z, r: C.WALKWAY_W, y: sampleGroundLocalY(p.x, p.z) });
    }
  }

  // Elevator tower: across the plaza from the gate, on the nearest dry
  // cardinal so its geometry stays axis-aligned (makeStructure needs AABBs).
  const towerDist = C.PLAZA_RADIUS + C.TOWER_HALF + 6.5;
  let towerU = null; // unit cardinal from tower TOWARD the plaza
  let towerSpot = null;
  {
    const want = gateBearing + Math.PI;
    const cardinals = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .sort((a, b) => (b[0] * Math.cos(want) + b[1] * Math.sin(want)) -
                      (a[0] * Math.cos(want) + a[1] * Math.sin(want)));
    for (const c of cardinals) {
      const tx = c[0] * towerDist, tz = c[1] * towerDist;
      if (!isWetLocal(tx, tz)) { towerSpot = { x: tx, z: tz }; towerU = [-c[0], -c[1]]; break; }
    }
    if (!towerSpot) { // pathological site: put it opposite the gate regardless
      towerSpot = { x: Math.cos(want) * towerDist, z: Math.sin(want) * towerDist };
      towerU = [-Math.sign(Math.round(Math.cos(want))) || 1, 0];
    }
    flattenPads.push({ x: towerSpot.x, z: towerSpot.z, r: C.TOWER_HALF + 6, y: sampleGroundLocalY(towerSpot.x, towerSpot.z) });
  }
  const towerBearing = Math.atan2(towerSpot.z, towerSpot.x);

  // House slots: one per grounded citizen, ringed around the plaza, keeping
  // clear of the walkway corridor and the tower.
  const angDiff = (a, b) => {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  };
  const groundedCitizens = [];
  let penthouseCitizen = null;
  for (let i = 0; i < roster.length; i++) {
    const c = roster[i];
    if (c.home === 'penthouse' && !penthouseCitizen) penthouseCitizen = { ...c, idx: i };
    else groundedCitizens.push({ ...c, idx: i });
  }
  const houseSlots = [];
  {
    const n = Math.max(groundedCitizens.length, 1);
    const start = gateBearing + 0.7;
    const span = Math.PI * 2 - 1.4; // leave the gate corridor open
    // Derive the ring from the largest house rather than using a fixed radius:
    // at 2x scale a villa is 32 units wide, and the old 34-52 ring put adjacent
    // slots ~21 apart, so neighbours would interpenetrate. Tangential spacing
    // at distance d is d * span/n, so solve that for "wider than the biggest
    // house plus clearance". Clamped to stay inside the town (and therefore
    // inside the levelled ground disc).
    const maxHalf = Math.max(...groundedCitizens.map(
      (c) => (ROLE_KITS[c.build ?? c.role] ?? ROLE_KITS.resident).half
    ), 0) * C.HOUSE_SCALE;
    const need = (2 * maxHalf + 8) / (span / n);
    const ringMin = Math.max(C.HOUSE_RING_MIN, need);
    const ringMax = Math.max(ringMin + 1, Math.min(ringMin * 1.5, radius - maxHalf - 8));
    const ringSpread = ringMax - ringMin;
    for (let i = 0; i < groundedCitizens.length; i++) {
      let a = start + ((i + 0.5) / n) * span;
      // nudge out of the tower's wedge
      if (angDiff(a, towerBearing) < 0.5) a += (a > towerBearing ? 1 : -1) * (0.55 - angDiff(a, towerBearing));
      a += (rng() - 0.5) * 0.12;
      let d = ringMin + rng() * ringSpread;
      let hx = Math.cos(a) * d, hz = Math.sin(a) * d;
      // snap to dry ground: walk the bearing/distance a little if needed
      for (let attempt = 0; attempt < 10 && isWetLocal(hx, hz); attempt++) {
        a += 0.13 * (attempt % 2 === 0 ? 1 : -1) * (attempt + 1);
        d = ringMin + ((attempt * 7) % ringSpread);
        hx = Math.cos(a) * d; hz = Math.sin(a) * d;
      }
      houseSlots.push({ x: hx, z: hz, citizen: groundedCitizens[i] });
    }
  }

  // -------------------------------------------------------------------------
  // Ground: draped street disc + plaza paving + walkway strip
  // -------------------------------------------------------------------------
  const streetMat = fam(build.walkFam, { repeat: 10, color: palette.street, roughness: 0.95 });
  const plazaMat = fam(build.plazaFam, { repeat: 6, color: build.plazaColor });
  const walkMat = fam(build.walkFam, { repeat: 8, color: build.walkColor });

  const drapeInto = (geo, bucket, lift = 0) => {
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      posAttr.setY(i, flattenedHeight(x, z) + lift);
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
    bucket.push(geo);
  };
  {
    const streetGeos = [];
    const ringGeo = new THREE.RingGeometry(2, radius, 64, 20);
    ringGeo.rotateX(-Math.PI / 2);
    drapeInto(ringGeo, streetGeos, -0.05);
    const capGeo = new THREE.CircleGeometry(2.05, 16);
    capGeo.rotateX(-Math.PI / 2);
    drapeInto(capGeo, streetGeos, -0.05);
    const streetMesh = new THREE.Mesh(mergeGeometries(streetGeos), streetMat);
    streetMesh.frustumCulled = false;
    group.add(streetMesh);

    const plazaGeos = [];
    const plazaGeo = new THREE.CircleGeometry(C.PLAZA_RADIUS + 1, 48);
    plazaGeo.rotateX(-Math.PI / 2);
    drapeInto(plazaGeo, plazaGeos, 0.02);
    const plazaMesh = new THREE.Mesh(mergeGeometries(plazaGeos), plazaMat);
    plazaMesh.frustumCulled = false;
    group.add(plazaMesh);

    // Walkway: one long strip pad->gate + a short strip gate->plaza, both
    // subdivided along their length and draped.
    const walkGeos = [];
    const strip = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1) return;
      const geo = new THREE.PlaneGeometry(len, C.WALKWAY_W, Math.max(4, Math.ceil(len / 4)), 2);
      geo.rotateX(-Math.PI / 2);
      geo.rotateY(-Math.atan2(z1 - z0, x1 - x0));
      geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      drapeInto(geo, walkGeos, 0.04);
    };
    strip(padCenter.x, padCenter.y, gateSpot.x, gateSpot.z);
    strip(gateSpot.x, gateSpot.z,
      Math.cos(gateBearing) * (C.PLAZA_RADIUS - 2), Math.sin(gateBearing) * (C.PLAZA_RADIUS - 2));
    const walkMesh = new THREE.Mesh(mergeGeometries(walkGeos), walkMat);
    walkMesh.frustumCulled = false;
    group.add(walkMesh);
  }

  // -------------------------------------------------------------------------
  // Shared merged-geometry buckets for every building (houses + tower shell).
  // One mesh per material family for the whole town.
  // -------------------------------------------------------------------------
  const wallGeos = [], floorGeos = [], roofGeos = [];
  const trimGeos = [], warmGeos = [];
  const paneGeos = [], scrimGeos = [], mullionGeos = [];
  const furnGeos = [], metalGeos = [], plantGeos = [];

  const wallMat = fam(build.wall, { repeat: 3, color: build.wallColor });
  const floorMat = fam(build.floor, { repeat: 4, color: build.floorColor });
  const roofMat = fam(build.roof, { repeat: 3, color: build.roofColor });
  const furnMat = fam('wood', { repeat: 2, color: 0x9a7a55 });
  const metalMat = M ? M.steel : fam('none', { color: 0x777d88, metalness: 0.85, roughness: 0.6 });
  const plantMat = fam('groundCover', { repeat: 2, color: 0x69a054 });
  const trimMat = own(new THREE.MeshStandardMaterial({
    color: 0x220016, emissive: new THREE.Color(palette.neonPrimary),
    emissiveIntensity: C.NEON_BLOOM_INTENSITY, roughness: 0.3,
  }));
  const warmMat = own(new THREE.MeshStandardMaterial({
    color: 0x120a04, emissive: new THREE.Color(palette.windowWarm),
    emissiveIntensity: C.NEON_BLOOM_INTENSITY * 0.6, roughness: 0.5,
  }));

  const colliders = [];
  const collidersLocal = []; // city-flat {x,z,radius,height,baseY} — NPC steering
  const worldPosScratch = new THREE.Vector3();

  // Axis-aligned box into a bucket: absolute city-local center/dims.
  const emitBox = (bucket, cx, cy, cz, w, h, d) => {
    const g = new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01));
    g.translate(cx, cy, cz);
    bucket.push(g);
  };

  // -------------------------------------------------------------------------
  // House builder. Each house is axis-aligned; the door faces the plaza along
  // the dominant axis. A local (u,v) frame — +U toward the plaza — keeps the
  // kit code readable while everything stays an AABB underneath.
  // -------------------------------------------------------------------------
  function buildHouse(slot) {
    const citizen = slot.citizen;
    const kit = ROLE_KITS[citizen.build ?? citizen.role] ?? ROLE_KITS.resident;
    const S = C.HOUSE_SCALE;
    const half = kit.half * S;
    const cx = slot.x, cz = slot.z;
    const by = flattenedHeight(cx, cz);
    flattenPads.push({ x: cx, z: cz, r: half + 3, y: by });

    // +U points from the house toward the plaza (door side), axis-aligned.
    const axisX = Math.abs(cx) >= Math.abs(cz);
    const ux = axisX ? (cx > 0 ? -1 : 1) : 0;
    const uz = axisX ? 0 : (cz > 0 ? -1 : 1);
    const vxAxis = -uz, vzAxis = ux; // +V is "sideways"
    const faceYaw = Math.atan2(ux, uz); // yaw looking toward the plaza

    const surfaces = [], walls = [];
    // (u,v) rect -> RELATIVE city-local x/z bounds (makeStructure's frame:
    // records are compared against x - ox / z - oz).
    const rect = (u0, u1, v0, v1) => {
      const xA = u0 * ux + v0 * vxAxis, xB = u1 * ux + v1 * vxAxis;
      const zA = u0 * uz + v0 * vzAxis, zB = u1 * uz + v1 * vzAxis;
      return {
        x0: Math.min(xA, xB), x1: Math.max(xA, xB),
        z0: Math.min(zA, zB), z1: Math.max(zA, zB),
      };
    };
    // Box from a (u,v) rect and a RELATIVE y band; optional wall record.
    const boxUV = (bucket, u0, u1, v0, v1, y0, y1, solid = false) => {
      const r = rect(u0, u1, v0, v1);
      emitBox(bucket, cx + (r.x0 + r.x1) / 2, by + (y0 + y1) / 2, cz + (r.z0 + r.z1) / 2,
        r.x1 - r.x0, y1 - y0, r.z1 - r.z0);
      if (solid) walls.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0, y1 });
    };

    const H = C.ROOM_H, T = C.WALL_T;

    // Floor slab (walkable top at +0.3) and roof slab (walkable — free rooftop).
    boxUV(floorGeos, -half, half, -half, half, -0.3, 0.3);
    surfaces.push({ ...rect(-half, half, -half, half), y: 0.3 });
    boxUV(roofGeos, -half - 0.3, half + 0.3, -half - 0.3, half + 0.3, H, H + C.ROOF_T);
    surfaces.push({ ...rect(-half - 0.3, half + 0.3, -half - 0.3, half + 0.3), y: H + C.ROOF_T });
    // low parapet (visual only — no wall record, the roof is a bonus perch)
    for (const [a0, a1, b0, b1] of [
      [-half, half, half, half + 0.25], [-half, half, -half - 0.25, -half],
      [half, half + 0.25, -half, half], [-half - 0.25, -half, -half, half],
    ]) boxUV(roofGeos, a0, a1, b0, b1, H + C.ROOF_T, H + C.ROOF_T + 0.5);

    // Front wall (+U): open doorway — two side segments + lintel, neon frame.
    const u0 = half - T, u1 = half; // wall band in U
    for (const s of [-1, 1]) {
      boxUV(wallGeos, u0, u1, s === -1 ? -half : C.DOOR_HALF, s === -1 ? -C.DOOR_HALF : half, 0, H, true);
    }
    boxUV(wallGeos, u0, u1, -C.DOOR_HALF, C.DOOR_HALF, C.DOOR_H, H, true);
    // glowing door frame + a warm threshold light over the opening
    for (const s of [-1, 1]) boxUV(trimGeos, half + 0.02, half + 0.14, s * (C.DOOR_HALF + 0.12) - 0.08, s * (C.DOOR_HALF + 0.12) + 0.08, 0, C.DOOR_H);
    boxUV(trimGeos, half + 0.02, half + 0.14, -C.DOOR_HALF - 0.2, C.DOOR_HALF + 0.2, C.DOOR_H + 0.02, C.DOOR_H + 0.18);
    boxUV(warmGeos, u0 + 0.05, u1 - 0.05, -C.DOOR_HALF, C.DOOR_HALF, C.DOOR_H - 0.12, C.DOOR_H - 0.02);

    // Other three walls: real window openings with glass panes and mullions.
    // The wall is decomposed into 4 boxes around each opening; the collision
    // record stays one solid full-height AABB (the 1.1 sill blocks walking).
    const windowWall = (side) => {
      // side: 'back' (-U) or +V / -V
      const isBack = side === 'back';
      const sV = side === '+v' ? 1 : -1;
      // One window per ~4.5 units of wall, so the doubled walls get more
      // openings rather than the same two stretched across twice the span.
      const wins = THREE.MathUtils.clamp(Math.round(half / 4.5), 1, 3);
      const positions = wins === 3 ? [-half * 0.55, 0, half * 0.55]
        : wins === 2 ? [-half * 0.45, half * 0.45] : [0];
      const w0 = C.WIN_SILL, w1 = C.WIN_SILL + C.WIN_H; // vertical band
      // helper emitting a wall box in this wall's own coordinates: `along` is
      // the lateral axis of the wall, band [a0,a1]; the wall's U/V band is fixed.
      const wallBox = (a0, a1, y0, y1) => {
        if (isBack) boxUV(wallGeos, -half, -half + T, a0, a1, y0, y1);
        else boxUV(wallGeos, a0, a1, sV > 0 ? half - T : -half, sV > 0 ? half : -half + T, y0, y1);
      };
      // full-height collision record for the whole wall
      const r = isBack ? rect(-half, -half + T, -half, half)
        : rect(-half, half, sV > 0 ? half - T : -half, sV > 0 ? half : -half + T);
      walls.push({ ...r, y0: 0, y1: H });

      let cursor = -half;
      for (const p of positions) {
        const o0 = p - C.WIN_W / 2, o1 = p + C.WIN_W / 2;
        wallBox(cursor, o0, 0, H); // pier before the opening
        wallBox(o0, o1, 0, w0); // below sill
        wallBox(o0, o1, w1, H); // above lintel
        // glass: pane + scrim, inset into the opening; thin boxes so no
        // orientation bookkeeping is needed.
        const paneBox = (bucket, inset, thick) => {
          if (isBack) boxUV(bucket, -half + inset, -half + inset + thick, o0 + 0.08, o1 - 0.08, w0 + 0.06, w1 - 0.06);
          else boxUV(bucket, o0 + 0.08, o1 - 0.08, sV > 0 ? half - inset - thick : -half + inset, sV > 0 ? half - inset : -half + inset + thick, w0 + 0.06, w1 - 0.06);
        };
        paneBox(paneGeos, 0.14, 0.05);
        paneBox(scrimGeos, 0.2, 0.03);
        // mullion cross + frame
        const mull = (a0, a1, y0, y1) => {
          if (isBack) boxUV(mullionGeos, -half + 0.1, -half + 0.22, a0, a1, y0, y1);
          else boxUV(mullionGeos, a0, a1, sV > 0 ? half - 0.22 : -half + 0.1, sV > 0 ? half - 0.1 : -half + 0.22, y0, y1);
        };
        mull(p - 0.04, p + 0.04, w0, w1); // vertical
        mull(o0, o1, (w0 + w1) / 2 - 0.04, (w0 + w1) / 2 + 0.04); // horizontal
        mull(o0, o1, w0 - 0.06, w0 + 0.02); // sill plate
        cursor = o1;
      }
      wallBox(cursor, half, 0, H); // pier after the last opening
    };
    windowWall('back');
    windowWall('+v');
    windowWall('-v');

    // Warm ceiling cove: a slim lit ring below the ceiling — the "beautiful
    // interior" light source that makes the doorway glow at night.
    boxUV(warmGeos, -half + 1, half - 1, -half + 1, -half + 0.9, H - 0.25, H - 0.15);
    boxUV(warmGeos, -half + 1, half - 1, half - 0.9, half - 1 + 0.1, H - 0.25, H - 0.15);

    // ------------------------- furnishing kits ------------------------------
    // Kits place along (u,v): the door is at +U, the back wall at -U.
    //
    // Everything below is authored against the ORIGINAL kit footprint, in
    // absolute insets from the wall ("-half + 1.0"). Doubling `half` alone
    // would leave human-scale furniture hugging the walls of a cavernous empty
    // room, so the block shadows `half`, `H`, `rect` and `boxUV` to scale the
    // layout about the room centre — the kit lines themselves are untouched.
    //
    // U/V only, never Y: scaling height would lift furniture off the floor slab
    // and push the stage riser past STRUCT_STEP_UP, making it unclimbable.
    const boxUVFull = boxUV, rectFull = rect;
    let anchor;
    {
      const half = kit.half; // eslint-disable-line no-shadow
      const H = C.ROOM_H / S; // eslint-disable-line no-shadow
      const rect = (u0, u1, v0, v1) => rectFull(u0 * S, u1 * S, v0 * S, v1 * S); // eslint-disable-line no-shadow
      const boxUV = (b, u0, u1, v0, v1, y0, y1, solid) => // eslint-disable-line no-shadow
        boxUVFull(b, u0 * S, u1 * S, v0 * S, v1 * S, y0, y1, solid);
    anchor = { u: -half + 2.2, v: 0 };
    const K = kit.kind;
    if (K === 'shop') {
      boxUV(furnGeos, -half + 1.0, -half + 1.8, -half + 1.2, half - 1.2, 0.3, 1.3); // counter
      boxUV(warmGeos, -half + 1.05, -half + 1.75, -half + 1.4, half - 1.4, 1.3, 1.38); // counter light
      boxUV(furnGeos, -half + 0.6, -half + 1.0, -half + 1.0, half - 1.0, 0.3, 2.4); // backwall shelving
      boxUV(furnGeos, half - 2.6, half - 1.6, -half + 1.0, -half + 2.2, 0.3, 1.1); // crate stack
      boxUV(furnGeos, half - 2.4, half - 1.8, -half + 1.2, -half + 2.0, 1.1, 1.7);
      anchor = { u: -half + 2.6, v: 0 };
    } else if (K === 'studio') {
      boxUV(furnGeos, -half + 1.0, -half + 2.0, -half + 1.2, half - 1.2, 0.3, 1.25); // workbench
      boxUV(metalGeos, -half + 1.2, -half + 1.8, -half + 1.6, -half + 2.6, 1.25, 1.5); // tools
      boxUV(wallGeos, -half + 1.2, -half + 3.2, half - 2.6, half - 1.0, 0.3, 2.2); // kiln block
      boxUV(warmGeos, -half + 2.0, -half + 2.6, half - 2.65, half - 2.55, 0.7, 1.5); // kiln mouth glow
      anchor = { u: -half + 2.8, v: -1.0 };
    } else if (K === 'greenhouse') {
      for (const v of [-half + 1.8, 0, half - 1.8]) {
        boxUV(furnGeos, -half + 1.0, half - 2.6, v - 0.55, v + 0.55, 0.3, 0.85); // planter trough
        boxUV(plantGeos, -half + 1.1, half - 2.7, v - 0.45, v + 0.45, 0.85, 1.25); // greens
      }
      boxUV(metalGeos, -half + 0.6, -half + 0.9, -half + 1.0, half - 1.0, 0.3, 2.0); // tool wall
      anchor = { u: 0, v: half - 2.6 }; // between the planter rows
    } else if (K === 'study') {
      boxUV(furnGeos, -half + 1.2, -half + 2.0, -1.2, 1.2, 0.3, 1.1); // desk
      boxUV(furnGeos, -half + 2.4, -half + 3.0, -0.3, 0.3, 0.3, 0.8); // chair
      for (const sv of [-1, 1]) boxUV(furnGeos, -half + 0.6, half - 2.0, sv * (half - 1.0) - 0.3, sv * (half - 1.0) + 0.3, 0.3, H - 1.2); // shelf walls
      boxUV(trimGeos, -half + 0.55, -half + 0.65, -1.4, 1.4, 2.2, 3.6); // star-chart panel
      anchor = { u: -half + 2.7, v: 0 };
    } else if (K === 'stage') {
      const r = rect(-half + 1.0, -half + 3.6, -half + 1.0, half - 1.0);
      boxUV(floorGeos, -half + 1.0, -half + 3.6, -half + 1.0, half - 1.0, 0.3, 0.7); // riser
      surfaces.push({ ...r, y: 0.7 });
      boxUV(trimGeos, -half + 1.1, -half + 1.3, -half + 1.2, half - 1.2, 0.7, 3.8); // neon backdrop
      for (const sv of [-1, 1]) boxUV(furnGeos, half - 3.4, half - 1.4, sv * (half - 1.5) - 0.35, sv * (half - 1.5) + 0.35, 0.3, 0.75); // benches
      anchor = { u: -half + 2.3, v: 0, y: 0.7 };
    } else if (K === 'villa') {
      boxUV(furnGeos, -half + 1.2, -half + 3.2, -half + 1.2, -half + 2.4, 0.3, 0.9); // long lounge
      boxUV(furnGeos, -half + 1.6, -half + 2.8, -0.6, 0.6, 0.3, 0.75); // low table
      boxUV(warmGeos, -half + 2.0, -half + 2.4, -0.2, 0.2, 0.75, 1.05); // table lamp
      boxUV(furnGeos, -half + 1.2, -half + 2.2, half - 2.6, half - 1.2, 0.3, 1.0); // bed
      boxUV(plantGeos, half - 2.2, half - 1.4, -half + 1.2, -half + 2.0, 0.3, 1.3); // court plant
      anchor = { u: -half + 3.0, v: 0 };
    } else { // cottage
      boxUV(furnGeos, -half + 1.0, -half + 2.6, half - 2.4, half - 1.0, 0.3, 0.85); // bed
      boxUV(furnGeos, -half + 1.4, -half + 2.6, -1.9, -0.7, 0.3, 1.05); // table
      for (const sv of [-1, 1]) boxUV(furnGeos, -half + 1.7 + (sv > 0 ? 1.2 : -0.9), -half + 2.3 + (sv > 0 ? 1.2 : -0.9), -1.3 + sv * 0.9, -0.7 + sv * 0.9, 0.3, 0.75);
      boxUV(wallGeos, half - 2.2, half - 1.0, -half + 1.0, -half + 1.9, 0.3, 1.9); // hearth block
      boxUV(warmGeos, half - 1.9, half - 1.3, -half + 1.05, -half + 1.15, 0.55, 1.25); // hearth glow
      anchor = { u: -half + 2.4, v: -1.3 };
    }
    } // end kit-space block
    // Lift the resident's standing spot into the scaled room (Y is untouched).
    anchor.u *= S;
    anchor.v *= S;

    // Structure + NPC steering collider + world-frame collider.
    structures.push(makeStructure(cx, cz, by, surfaces, walls, half + 0.6));
    collidersLocal.push({
      x: cx, z: cz, radius: half * Math.SQRT2 + 0.4,
      height: H + 1, baseY: by, npcOnly: true,
    });
    worldPosScratch.set(cx, 0, cz).applyQuaternion(quat).add(group.position);
    colliders.push({ center: worldPosScratch.clone(), radius: half * Math.SQRT2 + 0.4, height: H + 1 });

    // Home manifest: where the resident stands (anchor) and lives.
    const ax = cx + anchor.u * ux + anchor.v * vxAxis;
    const az = cz + anchor.u * uz + anchor.v * vzAxis;
    homes.push({
      idx: citizen.idx, role: citizen.role, kind: K,
      x: cx, z: cz, floorY: by + 0.3, half,
      doorX: cx + (half + 1.2) * ux, doorZ: cz + (half + 1.2) * uz,
      doorYaw: faceYaw,
      anchor: { x: ax, z: az, y: by + 0.3 + (anchor.y ?? 0), face: faceYaw },
    });
  }

  for (const slot of houseSlots) buildHouse(slot);

  // -------------------------------------------------------------------------
  // ELEVATOR TOWER — ground lobby wrapping a 4x4 shaft, enclosed moving cab,
  // glass penthouse + balcony on top. The town's tall landmark and the
  // governor's address. All shell geometry goes into the shared buckets; the
  // CAB is its own small group so update() can slide it.
  // -------------------------------------------------------------------------
  let elevator = null;
  let penthouseHome = null;
  {
    const cx = towerSpot.x, cz = towerSpot.z;
    const by = flattenedHeight(cx, cz);
    const EH = C.TOWER_HALF, TOP = C.TOWER_TOP;
    const totalH = TOP + C.PENT_H + C.PARAPET;
    const [ux, uz] = towerU; // +U looks from the tower toward the plaza
    const vxAxis = -uz, vzAxis = ux;
    const faceYaw = Math.atan2(ux, uz);

    const surfaces = [], walls = [];
    // RELATIVE bounds — same frame contract as the house builder above.
    const rect = (u0, u1, v0, v1) => {
      const xA = u0 * ux + v0 * vxAxis, xB = u1 * ux + v1 * vxAxis;
      const zA = u0 * uz + v0 * vzAxis, zB = u1 * uz + v1 * vzAxis;
      return {
        x0: Math.min(xA, xB), x1: Math.max(xA, xB),
        z0: Math.min(zA, zB), z1: Math.max(zA, zB),
      };
    };
    const boxUV = (bucket, u0, u1, v0, v1, y0, y1, solid = false) => {
      const r = rect(u0, u1, v0, v1);
      emitBox(bucket, cx + (r.x0 + r.x1) / 2, by + (y0 + y1) / 2, cz + (r.z0 + r.z1) / 2,
        r.x1 - r.x0, y1 - y0, r.z1 - r.z0);
      if (solid) walls.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0, y1 });
      return r;
    };
    // Collision WITHOUT geometry. The tower's envelope is glass, but a glass
    // wall still stops you — this pushes the same AABB the opaque box used to
    // while the visible surface is emitted separately by curtain().
    const wallOnly = (u0, u1, v0, v1, y0, y1) => {
      const r = rect(u0, u1, v0, v1);
      walls.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0, y1 });
      return r;
    };

    // Shaft interior: u in [-4.9,-0.9], v in [-2,2]. Cab doorway faces +U.
    const SU0 = -4.9, SU1 = -0.9, SV = 2.0;
    const DOOR_V = 1.0, DOOR_H2 = 3.6; // shaft/cab doorway: 2 wide, 3.6 tall

    // Ground slab + lobby floor (walkable), penthouse slab with a shaft hole.
    boxUV(floorGeos, -EH - 0.3, EH + 0.3, -EH - 0.3, EH + 0.3, -0.3, 0.3);
    surfaces.push({ ...rect(-EH, EH, -EH, EH), y: 0.3 });
    // Penthouse floor: three rects around the shaft hole.
    boxUV(floorGeos, SU1, EH, -EH, EH, TOP, TOP + 0.3);
    surfaces.push({ ...rect(SU1, EH, -EH, EH), y: TOP + 0.3 });
    for (const sv of [-1, 1]) {
      boxUV(floorGeos, -EH, SU1, sv > 0 ? SV : -EH, sv > 0 ? EH : -SV, TOP, TOP + 0.3);
      surfaces.push({ ...rect(-EH, SU1, sv > 0 ? SV : -EH, sv > 0 ? EH : -SV), y: TOP + 0.3 });
    }
    // Lobby ceiling (visual; leaves the shaft column clear for the cab) and
    // penthouse roof + parapet.
    boxUV(wallGeos, SU1, EH, -EH, EH, C.LOBBY_H, C.LOBBY_H + 0.3);
    for (const sv of [-1, 1]) {
      boxUV(wallGeos, -EH, SU1, sv > 0 ? SV : -EH, sv > 0 ? EH : -SV, C.LOBBY_H, C.LOBBY_H + 0.3);
    }
    boxUV(roofGeos, -EH - 0.4, EH + 0.4, -EH - 0.4, EH + 0.4, TOP + C.PENT_H, TOP + C.PENT_H + C.ROOF_T);
    for (const [a0, a1, b0, b1] of [
      [-EH, EH, EH, EH + 0.3], [-EH, EH, -EH - 0.3, -EH],
      [EH, EH + 0.3, -EH, EH], [-EH - 0.3, -EH, -EH, EH],
    ]) boxUV(roofGeos, a0, a1, b0, b1, TOP + C.PENT_H + C.ROOF_T, TOP + C.PENT_H + C.ROOF_T + 0.6);

    // Shell walls, ground to penthouse floor (the shaft section). The envelope
    // is GLASS all the way up — these calls carry the collision only, and
    // curtain() below emits the visible glazing. Front (+U) keeps the lobby
    // doorway; the rest run uninterrupted.
    const T = C.WALL_T;
    // front wall: two segments + band above the door up to TOP
    for (const s of [-1, 1]) {
      wallOnly(EH - T, EH, s === -1 ? -EH : DOOR_V + 0.1, s === -1 ? -(DOOR_V + 0.1) : EH, 0, TOP);
    }
    wallOnly(EH - T, EH, -(DOOR_V + 0.1), DOOR_V + 0.1, DOOR_H2, TOP);
    // entry frame neon
    for (const s of [-1, 1]) boxUV(trimGeos, EH + 0.02, EH + 0.14, s * (DOOR_V + 0.24) - 0.1, s * (DOOR_V + 0.24) + 0.1, 0, DOOR_H2);
    boxUV(trimGeos, EH + 0.02, EH + 0.14, -(DOOR_V + 0.34), DOOR_V + 0.34, DOOR_H2 + 0.02, DOOR_H2 + 0.2);
    // back + side shells, full height
    wallOnly(-EH, -EH + T, -EH, EH, 0, TOP);
    for (const sv of [-1, 1]) {
      wallOnly(-EH, EH, sv > 0 ? EH - T : -EH, sv > 0 ? EH : -EH + T, 0, TOP);
    }
    // Corner neon strips: the town's night landmark, full height.
    for (const su of [-1, 1]) for (const sv of [-1, 1]) {
      boxUV(trimGeos, su * EH - 0.08 + su * 0.14, su * EH + 0.08 + su * 0.14,
        sv * EH - 0.08 + sv * 0.14, sv * EH + 0.08 + sv * 0.14, 0.3, totalH);
    }

    // Shaft internal walls (lobby side): front shaft wall with the cab doorway
    // opening at the BOTTOM and the penthouse level; sides solid full height.
    // Between floors the doorway band is covered by the moving gates below.
    // Glass here too, so the cab is visible climbing the core from the lobby.
    // These are thin internal partitions rather than the outer envelope, so
    // they go in as plain glass boxes — no mullion grid needed.
    const SF0 = SU1, SF1 = SU1 + 0.35; // shaft front wall band in U
    for (const s of [-1, 1]) {
      boxUV(paneGeos, SF0, SF1, s === -1 ? -SV : DOOR_V, s === -1 ? -DOOR_V : SV, 0, TOP, true);
    }
    // band above the bottom doorway up to the top doorway
    boxUV(paneGeos, SF0, SF1, -DOOR_V, DOOR_V, DOOR_H2, TOP, true);
    for (const sv of [-1, 1]) {
      boxUV(paneGeos, SU0 - 0.35, SU1, sv > 0 ? SV : -SV - 0.35, sv > 0 ? SV + 0.35 : -SV, 0, TOP, true);
    }

    // Penthouse: glazed floor to ceiling on all four sides. The knee walls are
    // now collision-only (they used to be the opaque base of the curtain), so
    // the governor's suite is a glass box. The front knee is still split around
    // a 2-wide balcony doorway at v = 0 — the only way out onto the deck.
    const P0 = TOP + 0.3, P1 = TOP + C.PENT_H;
    void P0;
    for (const s of [-1, 1]) {
      wallOnly(EH - T, EH, s === -1 ? -EH : 1.0, s === -1 ? -1.0 : EH, TOP, TOP + C.KNEE);
    }
    for (const sv of [-1, 1]) wallOnly(-EH, EH, sv > 0 ? EH - T : -EH, sv > 0 ? EH : -EH + T, TOP, TOP + C.KNEE);
    wallOnly(-EH, -EH + T, -EH, EH, TOP, P1); // back, full height

    // Glass curtain: pane + scrim + mullions on any of the four faces, over any
    // height band. `spans` are the ranges along the face; `withScrim` is off for
    // the tall shell below — the scrim is ADDITIVE, and four 42-unit panels of
    // it read as a solid glowing slab through the bloom pass.
    const curtain = (side, spans, g0, g1, withScrim = true) => {
      const horiz = side === 'front' || side === 'back';
      const s = side === 'front' || side === '+v' ? 1 : -1;
      // Emit a box on the face, `inset` in from it and `thick` deep, spanning
      // [a0,a1] along the face and [y0,y1] in height.
      const face = (bucket, inset, thick, a0, a1, y0, y1) => {
        const n0 = s > 0 ? EH - inset - thick : -EH + inset;
        const n1 = s > 0 ? EH - inset : -EH + inset + thick;
        if (horiz) boxUV(bucket, n0, n1, a0, a1, y0, y1);
        else boxUV(bucket, a0, a1, n0, n1, y0, y1);
      };
      for (const [a0, a1] of spans) {
        face(paneGeos, 0.12, 0.05, a0, a1, g0, g1);
        if (withScrim) face(scrimGeos, 0.18, 0.03, a0, a1, g0, g1);
        // vertical mullions every <= 2.2 units
        const span = a1 - a0;
        const n = Math.max(1, Math.ceil(span / 2.2));
        for (let i = 0; i <= n; i++) {
          const a = a0 + (i / n) * span;
          face(mullionGeos, 0.1, 0.14, a - 0.05, a + 0.05, g0, g1);
        }
        // horizontal transoms every 10 units, so the tall shell reads as
        // stacked floors rather than one blank sheet. No-ops on short bands.
        for (let y = g0 + 10; y < g1 - 1; y += 10) {
          face(mullionGeos, 0.1, 0.14, a0, a1, y - 0.05, y + 0.05);
        }
      }
    };

    // Shell glazing: ground to the penthouse floor, all four faces. Scrim off
    // (see curtain) — 42 units of additive glass would read as a light column.
    const SG0 = 0.3; // sits on the ground slab
    curtain('front', [[-EH + 0.35, -(DOOR_V + 0.1)], [DOOR_V + 0.1, EH - 0.35]], SG0, TOP, false);
    curtain('front', [[-(DOOR_V + 0.1), DOOR_V + 0.1]], DOOR_H2, TOP, false); // over the lobby door
    curtain('back', [[-EH + 0.35, EH - 0.35]], SG0, TOP, false);
    curtain('+v', [[-EH + 0.35, EH - 0.35]], SG0, TOP, false);
    curtain('-v', [[-EH + 0.35, EH - 0.35]], SG0, TOP, false);

    // Penthouse glazing: floor to ceiling on all four sides now (the knee walls
    // above are collision-only), leaving the balcony doorway open on the front.
    const PG0 = TOP + 0.05, PG1 = P1 - 0.1;
    curtain('front', [[-EH + 0.4, -1.1], [1.1, EH - 0.4]], PG0, PG1);
    curtain('+v', [[-EH + 0.4, EH - 0.4]], PG0, PG1);
    curtain('-v', [[-EH + 0.4, EH - 0.4]], PG0, PG1);
    curtain('back', [[-EH + 0.4, EH - 0.4]], PG0, PG1);

    // Balcony doorway trim: glowing posts flanking the opening.
    for (const s of [-1, 1]) boxUV(trimGeos, EH - 0.05, EH + 0.08, s * 1.08 - 0.06, s * 1.08 + 0.06, TOP, TOP + C.KNEE + 0.4);
    const BAL = 3.0; // balcony depth
    const BO = EH + BAL; // balcony outer edge
    // The deck wraps the whole penthouse. Four rects tile the square annulus
    // without overlapping — the ±U pieces run the full depth and the ±V pieces
    // stop short of them, so no two coplanar faces ever land on each other.
    for (const [u0, u1, v0, v1] of [
      [EH, BO, -BO, BO], [-BO, -EH, -BO, BO],
      [-EH, EH, EH, BO], [-EH, EH, -BO, -EH],
    ]) {
      boxUV(floorGeos, u0, u1, v0, v1, TOP, TOP + 0.3);
      surfaces.push({ ...rect(u0, u1, v0, v1), y: TOP + 0.3 });
    }
    // Parapet ring + neon lip around all four outer edges, tiled the same way.
    for (const [u0, u1, v0, v1] of [
      [BO - 0.15, BO, -BO, BO], [-BO, -BO + 0.15, -BO, BO],
      [-BO + 0.15, BO - 0.15, BO - 0.15, BO], [-BO + 0.15, BO - 0.15, -BO, -BO + 0.15],
    ]) {
      boxUV(wallGeos, u0, u1, v0, v1, TOP, TOP + C.PARAPET, true);
      boxUV(trimGeos, u0, u1, v0, v1, TOP + C.PARAPET, TOP + C.PARAPET + 0.08);
    }

    // Penthouse furnishing: the governor's suite.
    boxUV(furnGeos, SU1 + 0.8, SU1 + 3.0, -EH + 0.8, -EH + 2.0, TOP + 0.3, TOP + 1.2); // lounge
    boxUV(furnGeos, SU1 + 1.2, SU1 + 2.6, -0.7, 0.7, TOP + 0.3, TOP + 0.8); // low table
    boxUV(warmGeos, SU1 + 1.7, SU1 + 2.1, -0.2, 0.2, TOP + 0.8, TOP + 1.1); // lamp
    boxUV(furnGeos, EH - 3.0, EH - 1.4, EH - 2.4, EH - 1.0, TOP + 0.3, TOP + 1.0); // desk
    boxUV(metalGeos, EH - 2.6, EH - 1.8, EH - 3.0, EH - 2.4, TOP + 0.3, TOP + 1.6); // telescope-ish
    boxUV(plantGeos, -EH + 0.8, -EH + 1.8, EH - 1.8, EH - 0.8, TOP + 0.3, TOP + 1.4); // planter
    // warm cove around the penthouse ceiling
    boxUV(warmGeos, SU1 + 0.4, EH - 0.4, -EH + 0.5, -EH + 0.62, P1 - 0.28, P1 - 0.18);
    boxUV(warmGeos, SU1 + 0.4, EH - 0.4, EH - 0.62, EH - 0.5, P1 - 0.28, P1 - 0.18);
    // lobby warm cove
    boxUV(warmGeos, -EH + 0.8, EH - 0.8, -EH + 0.7, -EH + 0.82, C.LOBBY_H - 0.3, C.LOBBY_H - 0.2);
    boxUV(warmGeos, -EH + 0.8, EH - 0.8, EH - 0.82, EH - 0.7, C.LOBBY_H - 0.3, C.LOBBY_H - 0.2);

    // ----------------------------- the CAB -----------------------------------
    // Enclosed: floor, three walls, doorway on +U, tall ceiling. Its own group
    // (registry materials, geometry owned) so update() slides one position.y.
    const cabGroup = new THREE.Group();
    const cabW = SV * 2 - 0.4; // 3.6 exterior
    const cabU0 = SU0 + 0.2, cabU1 = SU1 - 0.2;
    {
      const cabGeos = [];
      const cabWarm = [];
      const cabBox = (arr, u0, u1, v0, v1, y0, y1) => {
        const r = rect(u0, u1, v0, v1); // relative — cabGroup sits at (cx, by, cz)
        const g = new THREE.BoxGeometry(r.x1 - r.x0, y1 - y0, r.z1 - r.z0);
        g.translate((r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2);
        arr.push(g);
      };
      cabBox(cabGeos, cabU0, cabU1, -cabW / 2, cabW / 2, 0, 0.25); // floor
      cabBox(cabGeos, cabU0, cabU0 + 0.15, -cabW / 2, cabW / 2, 0.25, C.CAB_CEIL); // back
      for (const s of [-1, 1]) cabBox(cabGeos, cabU0, cabU1, s * cabW / 2 - s * 0.15, s * cabW / 2, 0.25, C.CAB_CEIL); // sides
      for (const s of [-1, 1]) cabBox(cabGeos, cabU1 - 0.15, cabU1, s === -1 ? -cabW / 2 : DOOR_V, s === -1 ? -DOOR_V : cabW / 2, 0.25, C.CAB_CEIL); // front jamb strips
      cabBox(cabGeos, cabU1 - 0.15, cabU1, -DOOR_V, DOOR_V, DOOR_H2, C.CAB_CEIL); // front lintel
      cabBox(cabGeos, cabU0, cabU1, -cabW / 2, cabW / 2, C.CAB_CEIL, C.CAB_CEIL + 0.15); // ceiling
      cabBox(cabWarm, cabU0 + 0.3, cabU1 - 0.3, -cabW / 2 + 0.3, cabW / 2 - 0.3, C.CAB_CEIL - 0.08, C.CAB_CEIL - 0.02); // cab light
      const cabMesh = new THREE.Mesh(mergeGeometries(cabGeos), metalMat);
      cabMesh.frustumCulled = false;
      const cabWarmMesh = new THREE.Mesh(mergeGeometries(cabWarm), warmMat);
      cabWarmMesh.frustumCulled = false;
      cabGroup.add(cabMesh, cabWarmMesh);
      cabGroup.position.set(cx, by, cz);
      group.add(cabGroup);
    }

    // Mutable structure records for the ride. The walkable cab-floor record
    // spans the whole shaft cross-section plus a lip over each sill, so there
    // is never a fall-through crack between cab floor and landing floor.
    const cabFloorSurf = { ...rect(SU0, SU1 + 0.25, -SV, SV), y: 0.25 }; // y mutated to cabY + 0.25
    surfaces.push(cabFloorSurf);
    // cab walls (move with the cab): back, sides, front jambs — solid records
    const cabWalls = [];
    const pushCabWall = (u0, u1, v0, v1) => {
      const r = rect(u0, u1, v0, v1);
      const w = { ...r, y0: 0, y1: C.CAB_CEIL };
      walls.push(w);
      cabWalls.push(w);
      return w;
    };
    pushCabWall(cabU0, cabU0 + 0.15, -cabW / 2, cabW / 2);
    pushCabWall(cabU0, cabU1, -cabW / 2, -cabW / 2 + 0.15);
    pushCabWall(cabU0, cabU1, cabW / 2 - 0.15, cabW / 2);
    pushCabWall(cabU1 - 0.15, cabU1, -cabW / 2, -DOOR_V);
    pushCabWall(cabU1 - 0.15, cabU1, DOOR_V, cabW / 2);
    // cab doorway gate: covers the cab opening while moving
    const cabDoorGate = { ...rect(cabU1 - 0.15, cabU1, -DOOR_V, DOOR_V), y0: GATE_DISABLED, y1: GATE_DISABLED + 1 };
    walls.push(cabDoorGate);
    // bottom shaft gate: blocks the lobby-side shaft doorway when the cab is away
    const bottomGate = { ...rect(SF0, SF1 + 0.15, -DOOR_V, DOOR_V), y0: GATE_DISABLED, y1: GATE_DISABLED + 1 };
    walls.push(bottomGate);
    // top hole gate: blocks stepping into the open shaft from the penthouse
    const topGate = { ...rect(SU0, SU1, -SV, SV), y0: GATE_DISABLED, y1: GATE_DISABLED + 1 };
    walls.push(topGate);

    // Buttons: glowing pads — bottom call (lobby, beside the shaft door), cab
    // panel (rides with the cab), top call (penthouse, beside the shaft).
    const btnGeo = (u, v, yRel, intoCab) => {
      const r = rect(u - 0.12, u + 0.12, v - 0.12, v + 0.12); // relative
      const g = new THREE.BoxGeometry(Math.max(r.x1 - r.x0, 0.1), 0.24, Math.max(r.z1 - r.z0, 0.1));
      if (intoCab) g.translate((r.x0 + r.x1) / 2, yRel, (r.z0 + r.z1) / 2);
      else g.translate(cx + (r.x0 + r.x1) / 2, by + yRel, cz + (r.z0 + r.z1) / 2);
      return g;
    };
    const btnMesh = new THREE.Mesh(
      mergeGeometries([btnGeo(SU1 + 0.5, DOOR_V + 0.55, 1.4, false), btnGeo(SU1 + 0.5, DOOR_V + 0.55, TOP + 1.4, false)]),
      trimMat
    );
    btnMesh.frustumCulled = false;
    group.add(btnMesh);
    const cabBtnMesh = new THREE.Mesh(btnGeo(cabU1 - 0.35, DOOR_V + 0.35, 1.4, true), trimMat);
    cabBtnMesh.frustumCulled = false;
    cabGroup.add(cabBtnMesh);

    const btnPt = (u, v) => {
      const r = rect(u, u, v, v); // relative — entities live in absolute city-local
      return { x: cx + r.x0, z: cz + r.z0 };
    };
    const pB = btnPt(SU1 + 0.5, DOOR_V + 0.55);
    const pC = btnPt(cabU1 - 0.35, DOOR_V + 0.35);
    const entities = [
      { kind: 'callBottom', pos: new THREE.Vector2(pB.x, pB.z), y: by + 1.4, prompt: 'E — CALL ELEVATOR' },
      { kind: 'cab', pos: new THREE.Vector2(pC.x, pC.z), y: by + 1.4, prompt: 'E — PENTHOUSE' },
      { kind: 'callTop', pos: new THREE.Vector2(pB.x, pB.z), y: by + TOP + 1.4, prompt: 'E — CALL ELEVATOR' },
    ];

    // State machine — stepped from walk.js stepWalk (physics-synced).
    const cabMidU = (SU0 + SU1) / 2;
    const elev = {
      state: 'parkedBottom', // parkedBottom | rising | parkedTop | descending
      cabY: 0,
      baseY: by,
      topY: TOP,
      // Standing point inside the cab (absolute city-local) — verification
      // and NPC use.
      cabSpot: { x: cx + cabMidU * ux, z: cz + cabMidU * uz },
      // interaction contract (walk.js scanModule / walkInteract)
      nearestInteractable(playerLocal, maxDist) {
        let best = null, bestD2 = maxDist * maxDist;
        for (const e of entities) {
          if (Math.abs(e.y - playerLocal.y) > 3) continue;
          const dx = e.pos.x - playerLocal.x, dz = e.pos.y - playerLocal.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD2) { best = e; bestD2 = d2; }
        }
        if (best) {
          // live prompt per state
          if (best.kind === 'cab') {
            best.prompt = elev.state === 'parkedBottom' ? 'E — PENTHOUSE'
              : elev.state === 'parkedTop' ? 'E — GROUND FLOOR' : 'ELEVATOR MOVING';
          } else {
            const here = best.kind === 'callBottom' ? 'parkedBottom' : 'parkedTop';
            best.prompt = elev.state === here ? 'E — ELEVATOR READY' : 'E — CALL ELEVATOR';
          }
        }
        return best;
      },
      interact(e) {
        if (e.kind === 'cab') {
          if (elev.state === 'parkedBottom') elev.state = 'rising';
          else if (elev.state === 'parkedTop') elev.state = 'descending';
        } else if (e.kind === 'callBottom') {
          if (elev.state === 'parkedTop') elev.state = 'descending';
        } else if (e.kind === 'callTop') {
          if (elev.state === 'parkedBottom') elev.state = 'rising';
        }
        return null; // no dialogue — walk.js releases the entity on null
      },
      endInteract() {},
      // step(dt): move the cab, keep records + visuals in lockstep.
      step(dt) {
        if (elev.state === 'rising') {
          elev.cabY = Math.min(elev.cabY + C.CAB_RIDE_SPEED * dt, TOP);
          if (elev.cabY >= TOP) elev.state = 'parkedTop';
        } else if (elev.state === 'descending') {
          elev.cabY = Math.max(elev.cabY - C.CAB_RIDE_SPEED * dt, 0);
          if (elev.cabY <= 0) elev.state = 'parkedBottom';
        }
        const y = elev.cabY;
        cabGroup.position.y = by + y;
        cabFloorSurf.y = y + 0.25;
        for (const w of cabWalls) { w.y0 = y; w.y1 = y + C.CAB_CEIL; }
        // gates: cab doorway sealed while moving; shaft openings sealed while
        // the cab is away from that landing.
        const moving = elev.state === 'rising' || elev.state === 'descending';
        if (moving) { cabDoorGate.y0 = y; cabDoorGate.y1 = y + C.CAB_CEIL; }
        else { cabDoorGate.y0 = GATE_DISABLED; cabDoorGate.y1 = GATE_DISABLED + 1; }
        if (elev.state !== 'parkedBottom') { bottomGate.y0 = 0; bottomGate.y1 = DOOR_H2; }
        else { bottomGate.y0 = GATE_DISABLED; bottomGate.y1 = GATE_DISABLED + 1; }
        // The penthouse shaft-hole gate rides ABOVE the cab ceiling: it always
        // guards the open hole, can never overlap a rider inside the cab, and
        // self-disables when the cab parks flush (y0 climbs past the band).
        topGate.y0 = y + C.CAB_CEIL;
        topGate.y1 = TOP + 2.4;
        // cab button rides along
        entities[1].y = by + y + 1.4;
      },
    };
    elev.step(0); // initialize gates for parkedBottom
    elevator = elev;

    structures.push(makeStructure(cx, cz, by, surfaces, walls, EH + BAL + 0.6));
    collidersLocal.push({
      x: cx, z: cz, radius: EH * Math.SQRT2 + 0.5,
      height: totalH, baseY: by, npcOnly: true,
    });
    worldPosScratch.set(cx, 0, cz).applyQuaternion(quat).add(group.position);
    colliders.push({ center: worldPosScratch.clone(), radius: EH * Math.SQRT2 + 0.5, height: totalH });

    // Penthouse home manifest for the governor.
    if (penthouseCitizen) {
      const au = SU1 + 2.0, av = 0;
      penthouseHome = {
        idx: penthouseCitizen.idx, role: penthouseCitizen.role, kind: 'penthouse',
        x: cx, z: cz, floorY: by + TOP + 0.3, half: EH,
        doorX: cx + (EH + 1.2) * ux, doorZ: cz + (EH + 1.2) * uz, doorYaw: faceYaw,
        penthouse: true,
        anchor: {
          x: cx + au * ux + av * vxAxis,
          z: cz + au * uz + av * vzAxis,
          y: by + TOP + 0.3, face: faceYaw,
        },
      };
      homes.push(penthouseHome);
    }
  }

  // Emit the shared building meshes (one draw per material family).
  const bucketMeshes = [
    [wallGeos, wallMat], [floorGeos, floorMat], [roofGeos, roofMat],
    [trimGeos, trimMat], [warmGeos, warmMat],
    [paneGeos, glass.pane], [scrimGeos, glass.scrim], [mullionGeos, mullionMat],
    [furnGeos, furnMat], [metalGeos, metalMat], [plantGeos, plantMat],
  ];
  for (const [geos, mat] of bucketMeshes) {
    if (!geos.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // -------------------------------------------------------------------------
  // Landing pad — flat deck ringed with a neon strip, just outside town.
  // -------------------------------------------------------------------------
  const padY = flattenedHeight(padCenter.x, padCenter.y);
  const padDeckMat = M ? M.pad : fam('none', { color: 0xa8a49c });
  const padMesh = new THREE.Mesh(new THREE.BoxGeometry(C.PAD_LENGTH, 0.3, C.PAD_WIDTH), padDeckMat);
  // long axis faces town so the parked ship noses at the gate
  padMesh.rotation.y = -gateBearing;
  padMesh.position.set(padCenter.x, padY + 0.15, padCenter.y);
  group.add(padMesh);

  const ringMat = own(new THREE.MeshStandardMaterial({
    color: 0x220016, emissive: new THREE.Color(palette.neonPrimary), emissiveIntensity: C.NEON_BLOOM_INTENSITY,
  }));
  const ringMesh = new THREE.Mesh(
    new THREE.TorusGeometry(Math.max(C.PAD_LENGTH, C.PAD_WIDTH) * 0.52, 0.18, 8, C.PAD_RING_SEGMENTS),
    ringMat
  );
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.scale.set(C.PAD_LENGTH / C.PAD_WIDTH, 1, 1);
  ringMesh.rotation.z = gateBearing;
  ringMesh.position.set(padCenter.x, padY + 0.25, padCenter.y);
  group.add(ringMesh);

  // Gate pylons: two neon columns flanking the walkway at the town edge.
  {
    const sideX = -Math.sin(gateBearing), sideZ = Math.cos(gateBearing);
    const pylonGeos = [];
    for (const s of [-1, 1]) {
      const px = gateSpot.x + sideX * s * (C.WALKWAY_W / 2 + 1.2);
      const pz = gateSpot.z + sideZ * s * (C.WALKWAY_W / 2 + 1.2);
      const py = flattenedHeight(px, pz);
      const g = new THREE.BoxGeometry(0.5, 7, 0.5);
      g.translate(px, py + 3.5, pz);
      pylonGeos.push(g);
      const cap = new THREE.BoxGeometry(0.8, 0.3, 0.8);
      cap.translate(px, py + 7.15, pz);
      pylonGeos.push(cap);
    }
    const pylons = new THREE.Mesh(mergeGeometries(pylonGeos), trimMat);
    pylons.frustumCulled = false;
    group.add(pylons);
  }

  const boardingPadLocal = new THREE.Vector3(padCenter.x, padY + 0.3, padCenter.y);
  const boardingPadWorld = boardingPadLocal.clone().applyQuaternion(quat).add(group.position);

  // -------------------------------------------------------------------------
  // Streetlights + planters: plaza ring, walkway line, one per house door.
  // -------------------------------------------------------------------------
  const dressingGeos = [];
  const lightHeadGeos = [];
  const lightHeadMat = own(new THREE.MeshStandardMaterial({
    color: 0x220016, emissive: new THREE.Color(palette.neonSecondaryA),
    emissiveIntensity: C.NEON_BLOOM_INTENSITY * 0.7,
  }));
  const lamp = (x, z) => {
    if (isWetLocal(x, z)) return;
    const y = flattenedHeight(x, z);
    const pole = new THREE.CylinderGeometry(0.12, 0.15, C.STREETLIGHT_HEIGHT, 6);
    pole.translate(x, y + C.STREETLIGHT_HEIGHT / 2, z);
    dressingGeos.push(pole);
    const head = new THREE.IcosahedronGeometry(0.35, 0);
    head.translate(x, y + C.STREETLIGHT_HEIGHT, z);
    lightHeadGeos.push(head);
  };
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    lamp(Math.cos(a) * (C.PLAZA_RADIUS + 2.5), Math.sin(a) * (C.PLAZA_RADIUS + 2.5));
  }
  for (let i = 1; i < walkwayPts.length; i += 3) {
    const p = walkwayPts[i];
    const sideX = -Math.sin(gateBearing), sideZ = Math.cos(gateBearing);
    lamp(p.x + sideX * (C.WALKWAY_W / 2 + 0.8), p.z + sideZ * (C.WALKWAY_W / 2 + 0.8));
  }
  const latePlantGeos = []; // the shared plant bucket mesh is already emitted
  for (const h of homes) {
    if (h.penthouse) continue;
    lamp(h.doorX + 1.6, h.doorZ + 1.6);
    if (rng() < 0.5) {
      const py = flattenedHeight(h.doorX - 1.8, h.doorZ - 1.8);
      const planter = new THREE.CylinderGeometry(0.6, 0.7, 0.6, 8);
      planter.translate(h.doorX - 1.8, py + 0.3, h.doorZ - 1.8);
      dressingGeos.push(planter);
      const green = new THREE.IcosahedronGeometry(0.5, 0);
      green.translate(h.doorX - 1.8, py + 0.85, h.doorZ - 1.8);
      latePlantGeos.push(green);
    }
  }
  const dressingMat = own(new THREE.MeshStandardMaterial({ color: 0x1e1c2a, roughness: 0.8 }));
  if (dressingGeos.length) {
    const dressingMesh = new THREE.Mesh(mergeGeometries(dressingGeos), dressingMat);
    dressingMesh.frustumCulled = false;
    group.add(dressingMesh);
  }
  if (lightHeadGeos.length) {
    const lightHeadMesh = new THREE.Mesh(mergeGeometries(lightHeadGeos), lightHeadMat);
    lightHeadMesh.frustumCulled = false;
    group.add(lightHeadMesh);
  }
  if (latePlantGeos.length) {
    const doorPlants = new THREE.Mesh(mergeGeometries(latePlantGeos), plantMat);
    doorPlants.frustumCulled = false;
    group.add(doorPlants);
  }

  // -------------------------------------------------------------------------
  // Drifting light motes (small InstancedMesh, animated in update() only)
  // -------------------------------------------------------------------------
  const moteMat = own(new THREE.MeshStandardMaterial({
    color: 0x220016, emissive: new THREE.Color(palette.neonSecondaryB), emissiveIntensity: C.NEON_BLOOM_INTENSITY * 0.8,
    transparent: true, opacity: 0.85,
  }));
  const moteMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 0), moteMat, C.MOTE_COUNT);
  moteMesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const moteSeeds = [];
  for (let i = 0; i < C.MOTE_COUNT; i++) {
    moteSeeds.push({
      x: (rng() - 0.5) * C.MOTE_SPREAD,
      z: (rng() - 0.5) * C.MOTE_SPREAD,
      phase: rng() * Math.PI * 2,
      speed: 0.5 + rng() * 0.5,
    });
    dummy.position.set(moteSeeds[i].x, C.MOTE_HEIGHT * rng(), moteSeeds[i].z);
    dummy.updateMatrix();
    moteMesh.setMatrixAt(i, dummy.matrix);
  }
  moteMesh.instanceMatrix.needsUpdate = true;
  group.add(moteMesh);

  // -------------------------------------------------------------------------
  // Aerial traffic — a couple of counter-rotating grav-car lanes above the
  // tower. Purely visual, zero-alloc updates.
  // -------------------------------------------------------------------------
  const trafficMat = own(new THREE.MeshStandardMaterial({
    color: 0x0a0a12, emissive: new THREE.Color(palette.neonSecondaryA),
    emissiveIntensity: C.NEON_BLOOM_INTENSITY * 0.9, roughness: 0.4,
  }));
  const trafficMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.5, 0.18, 2.6), trafficMat, C.TRAFFIC_COUNT
  );
  trafficMesh.frustumCulled = false;
  const laneAlt = C.TOWER_TOP + C.PENT_H + 16;
  const trafficSeeds = [];
  for (let i = 0; i < C.TRAFFIC_COUNT; i++) {
    trafficSeeds.push({
      lane: i % 2,
      r: radius * (i % 2 ? 0.72 : 0.48) * (0.92 + rng() * 0.16),
      alt: laneAlt + (i % 2 ? 14 : 4) + rng() * 5,
      speed: 0.08 + rng() * 0.07,
      phase: rng() * Math.PI * 2,
    });
  }
  group.add(trafficMesh);

  // -------------------------------------------------------------------------
  // Rim haze — additive cards around the town edge (cityHaze.frag).
  // -------------------------------------------------------------------------
  {
    const hazeGeos = [];
    const hm = new THREE.Matrix4(), hq = new THREE.Quaternion();
    const hp = new THREE.Vector3(), hs = new THREE.Vector3(1, 1, 1);
    const cards = 8;
    const hazeW = ((Math.PI * 2 * radius) / cards) * 1.15;
    for (let i = 0; i < cards; i++) {
      const ang = (i / cards) * Math.PI * 2;
      const hx = Math.cos(ang) * radius * 1.02;
      const hz = Math.sin(ang) * radius * 1.02;
      const geo = new THREE.PlaneGeometry(hazeW, 40);
      hp.set(hx, sampleGroundLocalY(hx, hz) + 17, hz);
      hq.setFromAxisAngle(YAXIS, -ang + Math.PI / 2);
      geo.applyMatrix4(hm.compose(hp, hq, hs));
      hazeGeos.push(geo);
    }
    const hazeMat = own(new THREE.ShaderMaterial({
      vertexShader: basicVert,
      fragmentShader: cityHazeFrag,
      uniforms: {
        uNight: fx.uNight,
        uColor: {
          value: new THREE.Color(palette.neonPrimary)
            .lerp(new THREE.Color(palette.windowWarm), 0.35),
        },
      },
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const hazeMesh = new THREE.Mesh(mergeGeometries(hazeGeos), hazeMat);
    hazeMesh.frustumCulled = false;
    hazeMesh.renderOrder = 1;
    group.add(hazeMesh);
  }

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
  // update(t, sunDot) — day/night neon, motes, traffic, and the elevator ride.
  // -------------------------------------------------------------------------
  const emissives = [ringMat, lightHeadMat, moteMat, trafficMat, trimMat, warmMat];
  const baseEmissive = emissives.map((m) => m.emissiveIntensity);
  let prevT = null;

  function update(t, sunDot) {
    const dt = prevT === null ? 0 : THREE.MathUtils.clamp(t - prevT, 0, 0.1);
    prevT = t;

    const nightLift = THREE.MathUtils.clamp(1 - Math.max(sunDot ?? 0, 0), 0, 1);
    fx.uTime.value = t;
    fx.uNight.value = nightLift;
    const level = THREE.MathUtils.lerp(C.NEON_DIM_INTENSITY, C.NEON_BLOOM_INTENSITY, nightLift);
    for (let i = 0; i < emissives.length; i++) {
      emissives[i].emissiveIntensity = level * (baseEmissive[i] / C.NEON_BLOOM_INTENSITY);
    }
    // Interiors must stay lit and inviting even at noon: keep the warm
    // channel from dipping as far as the outdoor neon.
    warmMat.emissiveIntensity = Math.max(warmMat.emissiveIntensity, C.NEON_BLOOM_INTENSITY * 0.35);

    // NOTE: the elevator cab is stepped from walk.js stepWalk (physics),
    // not here — dt below stays for any future visual-only timing needs.
    void dt;

    for (let i = 0; i < C.MOTE_COUNT; i++) {
      const s = moteSeeds[i];
      const y = ((t * C.MOTE_RISE_SPEED * s.speed + s.phase * 3) % C.MOTE_HEIGHT + C.MOTE_HEIGHT) % C.MOTE_HEIGHT;
      const sway = Math.sin(t * 0.3 + s.phase) * 2;
      dummy.position.set(s.x + sway, y, s.z);
      dummy.updateMatrix();
      moteMesh.setMatrixAt(i, dummy.matrix);
    }
    moteMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < trafficSeeds.length; i++) {
      const s = trafficSeeds[i];
      const dir = s.lane ? -1 : 1;
      const a = s.phase + t * s.speed * dir;
      const cos = Math.cos(a), sin = Math.sin(a);
      dummy.position.set(cos * s.r, s.alt + Math.sin(t * 0.7 + s.phase) * 1.5, sin * s.r);
      dummy.rotation.y = Math.atan2(-sin * dir, cos * dir);
      dummy.updateMatrix();
      trafficMesh.setMatrixAt(i, dummy.matrix);
    }
    dummy.rotation.y = 0;
    trafficMesh.instanceMatrix.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // dispose() — geometry always; ONLY locally-owned materials/textures.
  // Registry-owned materials (make/glassFor/steel/pad/...) belong to
  // walk.js's surfaceMaterials and are disposed there, last.
  // -------------------------------------------------------------------------
  function dispose() {
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.isInstancedMesh && obj.dispose) obj.dispose();
    });
    for (const m of ownedMaterials) m.dispose();
    for (const t of ownedTextures) t.dispose();
    ownedMaterials.length = 0;
    ownedTextures.length = 0;
    group.clear();
  }

  return {
    group,
    update,
    dispose,
    colliders, // surface-local {center,radius,height}
    collidersLocal, // city-flat {x,z,radius,height,baseY,npcOnly} — NPC steering
    groundHeightAt,
    groundLocalYAt: flattenedHeight, // (x,z) -> local Y
    plazaCenters, // city-flat {x,z,r} — citizen stroll waypoints
    boardingPad: boardingPadWorld,
    padLocal: boardingPadLocal, // city-flat pad center {x,y,z} — ship parking
    outerRadius, // pad sits outside `radius`; collision/ground gates use this
    gateSpot, // {x,z} town gate on the pad bearing
    structures, // every enterable building (houses + tower) — walk.js collision
    homes, // per-citizen manifests {idx,role,kind,x,z,floorY,half,anchor,...}
    elevator, // interaction module + {state,cabY} (see walk.js scan)
  };
}

// ---------------------------------------------------------------------------
// Wiring into the main loop:
//
//   import { createCity } from './city.js';
//   const city = createCity(planet, siteUpVector, {
//     radius, style, seed, padLocal, citizens, materials,
//   });
//   planet.surface.add(city.group);
//   // per frame: city.update(elapsedSeconds, sunDot) — includes the elevator.
//   // on teardown: city.dispose(); planet.surface.remove(city.group);
// ---------------------------------------------------------------------------
