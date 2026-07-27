// world/planetsky.js
//
// The real sky for every generic landable world — the third consumer of
// world/actuality-sky.js after actuality (fixed anchor, per-zone cuts) and
// shadowreach (player-riding anchor, path-keyed blend). This one is the
// planet-agnostic generalization: a player-riding anchor like shadowreach's,
// but with the sun DERIVED from geometry instead of authored. The world's real
// sun direction (planet.js SUN) is resolved into the anchor's local frame every
// frame, so the sky's sun sits exactly where the terrain shader's terminator
// says it should: land on the day side and it's a blue, lightly clouded
// afternoon; land on the dark side and the same two presets blend down to a
// near-black sky full of twinkling stars. Walk across the terminator (or let
// the planet's day carry you across it) and the sky rides the blend
// continuously — no cuts, PMREM re-bakes self-throttled inside applyBlend.
//
// Two presets per world, 'pDay' and 'pNight', built from the planet config so
// each world keeps its identity (rustia's sky is dustier, wyattmattoe's crisper,
// fog tinted from cfg.skyColor / palette). Both are COMPLETE outdoor presets —
// applyBlend dereferences cloud.* and fog.* unguarded, and interior/none
// presets are rejected there, so every field is always present.
//
// Underwater (divable worlds — neptunia): the skyfog post pass that used to
// carry the dive grading is disabled whenever a world holds the isolation
// surface stage (game.js gates it on !isolated.surface), so the grading lives
// here instead: setUnderwater(depth01) hides the sky dome (the Preetham mesh,
// cloud slab and stars ignore scene.fog and would read as clear air overhead),
// swaps scene.fog for a depth-keyed indigo, dims the sun and the environment,
// and drives the custom fog uniforms on the planet's terrain and sea-surface
// shaders — raw ShaderMaterials that scene.fog cannot reach.
//
// Zero per-frame allocation: all scratch lives at module scope.

import * as THREE from 'three';
import { SUN } from '../src/planet.js';
import { createActualitySky } from './actuality-sky.js';

const _yAxis = new THREE.Vector3(0, 1, 0);
const _upLocal = new THREE.Vector3();
const _sunLocal = new THREE.Vector3();
const _invQ = new THREE.Quaternion();
const _origin = new THREE.Vector3(); // anchor rides the player, so their local offset is 0
const _fogC = new THREE.Color();
const _c1 = new THREE.Color();
// Underwater grading bands — same endpoints the old skyfog hijack used.
const _uwShallow = new THREE.Color(0x2a4ab8);
const _uwDeep = new THREE.Color(0x0a0830);

// Per-world atmosphere character. Only what differs from the clearBlue-derived
// base below — absent worlds get the base. Fog colour always comes from
// cfg.skyColor, so even the defaults stay recognisably "their" world.
const SKY_TUNE = {
  terra: {},
  rustia: { turbidity: 3.4, rayleigh: 2.0, cloudCover: 0.1, fogDensity: 0.0018, sunColor: 0xffd9a8 },
  'wavemall prime': { turbidity: 2.6, cloudCover: 0.24 },
  neptunia: { rayleigh: 1.8, cloudCover: 0.38 },
  wyattmattoe: { turbidity: 1.7, fogDensity: 0.0012, cloudCover: 0.32 },
};

// Two complete outdoor presets from a planet config. elevation/azimuth are
// placeholders — update() overwrites both every frame with the derived sun.
function makePlanetPresets(cfg) {
  const o = SKY_TUNE[cfg.name] ?? {};
  const dayFog = _c1.set(cfg.skyColor()).lerp(_fogC.set(0xffffff), 0.45).getHex();
  const nightFog = _c1.set(0x141c30).lerp(_fogC.set(cfg.palette?.deep ?? 0x1a2438), 0.4).getHex();
  const cover = o.cloudCover ?? 0.3;
  const day = {
    turbidity: o.turbidity ?? 2.2,
    rayleigh: o.rayleigh ?? 1.4,
    mie: 0.004, mieG: 0.82,
    elevation: 30, azimuth: 145,
    sunColor: o.sunColor ?? 0xfff2dc, sunIntensity: 3.2,
    cloud: { cover, altitude: 1150, thickness: 420, drift: 0.9, tint: 0xffffff, ambient: 2.6 },
    fog: { color: dayFog, density: o.fogDensity ?? 0.0016 },
    exposure: 0.4,
    stars: 0,
    envIntensity: 0.45,
  };
  const night = {
    turbidity: 8.0, rayleigh: 2.2, mie: 0.004, mieG: 0.8,
    elevation: -8, azimuth: 145,
    sunColor: 0x9fb6e0, sunIntensity: 0.9, // moonlight: cool, weak, a real key
    cloud: { cover: Math.min(cover + 0.12, 0.6), altitude: 1100, thickness: 480, drift: 0.4, tint: 0x8fa4c8, ambient: 0.16 },
    fog: { color: nightFog, density: 0.005 },
    exposure: 0.95,
    stars: 0.9,
    envIntensity: 0.8,
  };
  return { day, night };
}

/**
 * @param planet  a planets[] record (terra type). The caller parents `group`
 *                under planet.surface, so the anchor works in surface-local.
 * @param scene   the root scene — fog and environment live there.
 * @param opts    { quality: 'high'|'low' }
 */
export function createPlanetSky(planet, scene, opts = {}) {
  const group = new THREE.Group();
  const anchor = new THREE.Object3D();
  group.add(anchor);

  const presets = makePlanetPresets(planet.cfg);
  const sky = createActualitySky(anchor, scene, {
    quality: opts.quality,
    presets: { pDay: presets.day, pNight: presets.night },
  });
  sky.setShadowExtent(70, 280);

  // The sky dome, cloud slab and star points — everything under the anchor
  // that draws. Hidden underwater (they ignore scene.fog); the lights stay.
  const skyMeshes = anchor.children.filter((c) => c.isMesh || c.isPoints);

  // Custom fog hooks on the raw terrain/water ShaderMaterials — the one part
  // of the world scene.fog can't reach. Density 0 = compiled-out no-op.
  const surfU = planet.surface?.material?.uniforms ?? null;
  const waterU = planet.waterMesh?.material?.uniforms ?? null;

  let blendK = 0; // 0 = full day preset, 1 = full night
  let uw = 0; // underwater depth, 0 dry .. 1 at the deep grading floor
  let lastT = 0;
  let lastDt = 0;
  let dryEnv = null; // last dry-frame environmentIntensity (a bake output)

  // Per-frame, from updateWalkVisuals. `playerLocal` is the player position in
  // planet.surface's unrotated local frame.
  function update(t, dt, playerLocal) {
    lastT = t;
    lastDt = dt;

    // Anchor: the player's ground point, +Y at their radial up (shadowreach's
    // rig — the path here is the whole planet, so the horizon must re-level
    // under the player continuously).
    _upLocal.copy(playerLocal).normalize();
    let ground = planet.radius + (planet.body?.terrainAtLocal ? planet.body.terrainAtLocal(_upLocal) : 0);
    if (planet.water && ground < planet.water.r) ground = planet.water.r;
    anchor.position.copy(_upLocal).multiplyScalar(ground);
    anchor.quaternion.setFromUnitVectors(_yAxis, _upLocal);

    // The real sun, resolved into the anchor's local frame. anchor +Y is the
    // radial up, so _sunLocal.y is exactly upWorld·SUN — the same scalar the
    // terrain shader's terminator and walk.js's sunDot run on.
    const rotY = planet.surface?.rotation?.y ?? 0;
    // planet.sunDir is SUN except while the spin is frozen underfoot, where the
    // sun swings instead so the day keeps moving over rigid ground.
    _sunLocal.copy(planet.sunDir ?? SUN).applyAxisAngle(_yAxis, -rotY); // world -> surface-local
    _invQ.copy(anchor.quaternion).invert();
    _sunLocal.applyQuaternion(_invQ); // surface-local -> anchor-local
    const sunUp = THREE.MathUtils.clamp(_sunLocal.y, -1, 1);

    // Preetham degrades below ~-10°; darkness past there is carried by the
    // blend factor, so clamping the authored elevation loses nothing.
    const elevDeg = Math.max(THREE.MathUtils.radToDeg(Math.asin(sunUp)), -10);
    // Same convention applyPreset decomposes with: x = cos·sin(az), z = cos·cos(az).
    const azDeg = THREE.MathUtils.radToDeg(Math.atan2(_sunLocal.x, _sunLocal.z));
    presets.day.elevation = presets.night.elevation = elevDeg;
    presets.day.azimuth = presets.night.azimuth = azDeg;

    // Night rises across the same terminator band surface.frag shades with
    // (smoothstep -0.12..0.28 on the dot); slightly narrower so stars are
    // fully out by the time the ground goes dark.
    blendK = 1 - THREE.MathUtils.smoothstep(sunUp, -0.08, 0.25);
  }

  // Depth into the underwater grading, 0..1 (walk.js: divable worlds only).
  function setUnderwater(depth01) {
    uw = THREE.MathUtils.clamp(depth01, 0, 1);
  }

  // Pre-composer hook — the only one with a renderer (PMREM bakes need it).
  function preRender(renderer) {
    sky.applyBlend('pDay', 'pNight', blendK, renderer);
    sky.update(lastT, lastDt, _origin, renderer);

    if (uw > 0) {
      // applyBlend just re-showed the dome and rewrote fog/sun — override in
      // place, every frame, in this order.
      for (const m of skyMeshes) m.visible = false;
      _fogC.copy(_uwShallow).lerp(_uwDeep, uw);
      // Night dives go properly dark — the water column has no light to carry.
      _fogC.multiplyScalar(1 - 0.8 * blendK);
      if (!(scene.fog instanceof THREE.FogExp2)) scene.fog = new THREE.FogExp2(0, 0);
      scene.fog.color.copy(_fogC);
      scene.fog.density = 0.045 + 0.11 * uw;
      if (dryEnv === null) dryEnv = scene.environmentIntensity;
      scene.environmentIntensity = dryEnv * (1 - 0.8 * uw);
      sky.sunLight.intensity *= 1 - 0.85 * uw; // rewritten by applyBlend above, so no compounding
      if (surfU) {
        surfU.uFogColor.value.copy(_fogC);
        surfU.uFogDensity.value = scene.fog.density;
      }
      if (waterU) {
        waterU.uFogColor.value.copy(_fogC);
        waterU.uFogDensity.value = scene.fog.density;
      }
    } else {
      for (const m of skyMeshes) m.visible = true;
      dryEnv = scene.environmentIntensity;
      if (surfU && surfU.uFogDensity.value !== 0) surfU.uFogDensity.value = 0;
      if (waterU && waterU.uFogDensity.value !== 0) waterU.uFogDensity.value = 0;
    }
  }

  function dispose() {
    if (surfU) surfU.uFogDensity.value = 0;
    if (waterU) waterU.uFogDensity.value = 0;
    sky.dispose(); // restores scene.fog / environment / environmentIntensity
  }

  return {
    group,
    update,
    preRender,
    setUnderwater,
    setShadowExtent: sky.setShadowExtent,
    dispose,
    sky,
    // Headless verification: the derived state this module owns.
    debugSky() {
      return {
        k: blendK,
        underwater: uw,
        elevation: presets.day.elevation,
        azimuth: presets.day.azimuth,
        preset: sky.preset,
        starAmount: (1 - blendK) * 0 + blendK * 0.9,
      };
    },
  };
}
