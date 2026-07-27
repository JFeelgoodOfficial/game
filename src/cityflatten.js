// ---------------------------------------------------------------------------
// City ground levelling
//
// Towns are laid out on a flat deck (world/city.js drapes its streets, plaza
// and building pads through flattenedHeight), but the planet's terrain sphere
// underneath knew nothing about that — so raw relief pushed up through the
// deck and a town read as "hills and ground in it randomly".
//
// This levels the terrain field itself under every registry town, as a FILTER
// on the shared height function rather than a patch applied afterwards:
//
//   planet.js sample()      -> body.levelAt(dir, rawHeight)  (walker, camera,
//                              dive system, flight floor, placement queries)
//   planet.js bake slice    -> body.levelAt(dir, rawHeight)  (the rendered mesh)
//
// Because both paths run the same filter, the geometry you see and the field
// you walk on cannot drift apart. And because the filter is installed BEFORE
// startPlanetBake(), the mesh is baked flat the first time — no re-stamping a
// baked sphere, no replay, no runtime cost beyond a dot product per query.
//
// Town sites are fixed and surface-local (world/cityRegistry.js `site`, the
// same frame padLocalDir/wonderLocalDir build from), so every disc is known at
// boot and never moves.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { groundHeight } from './terrain.js';
import * as C from './constants.js';
import { CITIES } from '../world/cityRegistry.js';

// How far past the flat core the ground eases back to natural terrain. Wide
// enough that a town never sits on a plateau with a cliff around it.
const BLEND = 90;
// Margin past the landing pad, so the pad and the gate walkway are on the flat
// core rather than out on the easing ring.
const PAD_MARGIN = 30;

// Level `raw` toward the town height across each disc covering this direction.
// Discs are far apart in practice, so the nearest one wins outright — no
// additive stacking, which would double-count where two rings overlapped.
function makeLeveller(discs, radius) {
  return (dx, dy, dz, raw) => {
    let out = raw;
    let bestW = 0;
    for (let i = 0; i < discs.length; i++) {
      const d = discs[i];
      const dot = dx * d.x + dy * d.y + dz * d.z;
      if (dot <= d.dotMin) continue;
      const dist = Math.sqrt(Math.max(2 - 2 * dot, 0)) * radius;
      const w = 1 - THREE.MathUtils.smoothstep(dist, d.r0, d.r1);
      if (w > bestW) {
        bestW = w;
        out = THREE.MathUtils.lerp(raw, d.h, w);
      }
    }
    return out;
  };
}

// Install the levelling filter on every terra planet that carries a town.
// MUST be called after initPlanets() and BEFORE startPlanetBake(), so the
// bake writes already-levelled vertices.
export function initCityFlatten(planets) {
  for (const p of planets) {
    if (p.cfg.type !== 'terra' || !p.body) continue;
    const defs = CITIES.filter((c) => c.world === p.cfg.name);
    if (defs.length === 0) continue;

    const cfg = p.cfg;
    const shape = cfg.shape || null;
    const deepAmp = cfg.oceanDepth ? cfg.oceanDepth() : 0;
    const seaLevel = cfg.seaLevel();
    const amp = cfg.terrainHeight();

    const discs = defs.map((def) => {
      const s = def.site;
      // Town height, read from the RAW field — this runs before the filter is
      // installed, so it can't read its own output. Never level a town below
      // the sea surface, matching world/city.js's baseRadius clamp.
      let h = groundHeight(s.x, s.y, s.z, seaLevel, amp, shape, deepAmp);
      if (cfg.water) h = Math.max(h, C.WALK_WATER_LEVEL + 0.4);
      // Flat core has to reach past the landing pad (which the registry pins
      // OUTSIDE def.radius), or the pad ends up on the easing ring.
      const padD = def.pad ? Math.hypot(def.pad.x, def.pad.z) : 0;
      const r0 = Math.max(def.radius, padD + PAD_MARGIN);
      const r1 = r0 + BLEND;
      const chord = r1 / p.radius;
      return {
        x: s.x, y: s.y, z: s.z,
        r0, r1, h,
        dotMin: 1 - (chord * chord) / 2 - 1e-5,
      };
    });

    p.body.levelAt = makeLeveller(discs, p.radius);
    p.flattenDiscs = discs; // debug/inspection
  }
}
