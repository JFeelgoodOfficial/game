// Isolated worlds — pausing the universe while the player is down on a story planet.
//
// Most of the game is a solar system: seven planets, a sun, a black hole, two
// nebula fields, the painting nebulae, the stations and 13,800 stars, all of
// them updating and drawing every frame. On a bespoke narrative world none of
// that is visible or relevant — the world module authors its own sky, its own
// light, and a horizon it never lets you see past.
//
// So we switch the rest of the universe off and spend the whole frame budget on
// the one place the player is standing. What that buys, concretely: shadow maps
// and an ambient-occlusion pass, neither of which the space sim could afford.
//
// TWO STAGES, because they start at different moments.
//
//   universe (`iso.active`)  — acquired the instant the skids touch down. Stops
//     the simulation: game.js skips the starfield/nebula/planet/station updates,
//     and the far field (sibling planets, nebulae, stations) is hidden. Nothing
//     the player can see from the parked cockpit changes, so there is no pop.
//
//   surface (`iso.surface`) — acquired when they step out and the world module's
//     own sky exists. This is the render-mode switch: near far-plane, world
//     exposure, re-aimed bloom, shadow maps, ambient occlusion, and hiding the
//     things that read as sky (the sun disc, the starfield, the black hole, the
//     planet's own atmosphere shell and cloud layer) now that something else is
//     drawing the sky.
//
// The gap between them is the parked-in-the-seat window. The ship is stationary
// for all of it, which is exactly why freezing those systems there is invisible.
//
// What is NOT paused: floating-origin bookkeeping. `updateOrigin` walks the
// shiftables list independently of anything here, and `updatePlanets` never
// moves a planet — it spins them and pokes shader uniforms — so skipping it for
// the six planets you can't see is free and safe. This mirrors the pattern
// stations.js already uses (distance-gate the animation, never the origin).
//
// Restoring is symmetric and total: every flag set here is unset in the matching
// release, including the renderer and composer state, so a trip down to an
// isolated world leaves nothing behind for the flight sim to trip over.

import * as THREE from 'three';
import { planets } from './planet.js';
import { sun } from './sun.js';
import { blackhole } from './blackhole.js';
import { deepNebulae } from './deepnebula.js';
import { stations } from './stations.js';
import { setStarfieldVisible } from './starfield.js';
import { setNebulaVisible } from './nebula.js';
import { settings } from './settings.js';

// Worlds that own their sky and light outright, and so can isolate. The story
// worlds bring their own sky modules; every other landable world gets the
// generic player-riding sky from world/planetsky.js (created in enterWalk, so
// the sky exists before acquireSurface hides the flight sim's) — which is what
// lets the whole roster pause the universe the way shadowreach does.
const ISOLATING_WORLDS = new Set([
  'actuality',
  'shadowreach',
  'terra',
  'oceana',
  'glacia',
  'rustia',
  'neptunia',
  'wyattmattoe',
  'wavemall prime',
]);

export function isIsolatingWorld(name) {
  return ISOLATING_WORLDS.has(name);
}

// Live state. `active` is the universe freeze, `surface` the render-mode switch;
// `keep` is the planet we're standing on, which keeps updating while its six
// siblings do not.
const iso = {
  active: false,
  surface: false,
  keep: null,
  // The surface stage holds its own reference. `keep` belongs to the universe
  // stage and is nulled when that releases, and the two release in either order
  // depending on which exit path we're on — so the sky restore cannot borrow it.
  surfaceKeep: null,
  prevShadow: false,
  prevShadowType: THREE.PCFShadowMap,
  prevFar: 1e6,
  prevExposure: 1,
  prevBloomThreshold: 0,
  prevBloomStrength: 0,
  prevSunLight: -1,
  prevAmbient: -1,
};

// Exposure and bloom while standing on an isolated world, PER WORLD.
//
// Exposure: the flight sim is calibrated for a black sky with a handful of
// bright objects in it; a daylit sky is orders of magnitude brighter and blows
// out at exposure 1. But how far to stop down depends on what the world authors.
// Actuality's sky presets drive exposure themselves and only need a sane opening
// value. Shadowreach's twelve point lights and thirty-odd emissives were written
// at exposure 1, so it opens up much further and lets its own presets take over.
//
// Bloom: in space the sky is black, so a 0.85 threshold catches only stars and
// the accretion disc. Under a real sky almost every pixel clears that threshold
// and bloom becomes a full-frame white haze. Raising it above sky luminance puts
// the glow back where it belongs — but Shadowreach deliberately authors its
// round-room spiral, its lightning and the finale's blue tear to cross 0.85, so
// lifting the threshold to Actuality's 2.4 would erase all three.
//
// `soleLight` stands the system-wide DirectionalLight + AmbientLight down for
// the duration. A world that draws its own sky also plants its own sun in it,
// and the two keys otherwise stack: two suns from different directions, plus a
// flat ambient underneath an environment map that is already doing that job
// properly. Actuality does NOT take this — it was calibrated with the globals in
// place and its materials expect them.
// Generic worlds run world/planetsky.js, whose day/night presets drive the
// exposure per frame once walking starts — the value here is only the opening
// stop. soleLight: the planetsky sun + hemisphere + environment map replace
// the system-wide globals, exactly like shadowreach. Bloom threshold sits
// above the daylit sky's luminance but below the city neon so the permanent
// registry cities still glow at night.
const GENERIC_RENDER = { exposure: 0.4, bloomThreshold: 2.2, bloomStrength: 0.5, soleLight: true };
const WORLD_RENDER = {
  actuality: { exposure: 0.32, bloomThreshold: 2.4, bloomStrength: 0.5 },
  shadowreach: { exposure: 0.62, bloomThreshold: 1.15, bloomStrength: 0.62, soleLight: true },
  terra: GENERIC_RENDER,
  oceana: GENERIC_RENDER,
  glacia: GENERIC_RENDER,
  rustia: GENERIC_RENDER,
  neptunia: GENERIC_RENDER,
  wyattmattoe: GENERIC_RENDER,
  'wavemall prime': { ...GENERIC_RENDER, bloomThreshold: 1.2 },
};
const DEFAULT_RENDER = WORLD_RENDER.actuality;

// Far plane while isolated. The flight camera runs 0.1..1e6 because it has to
// hold a solar system, which leaves almost no depth precision at arm's length —
// fine for planets seen from orbit, useless for AO and contact shadows in a
// café. Nothing here is further than the far side of the planet you're standing
// on (radius 900, so ~1800 m), so 4000 covers everything with room to spare and
// buys back several orders of magnitude of depth resolution.
const ISO_FAR = 4000;

export const isolated = iso; // read-only for callers (game.js, __debug)

// The far field: too small and too distant to read as anything but specks
// through a daylit atmosphere, so hiding it the moment the skids touch is
// invisible. Toggled with the universe stage.
function setFarFieldVisible(v, keep) {
  for (const p of planets) if (p !== keep) p.group.visible = v;
  // The painting nebulae push their records into deepNebulae too, so this one
  // loop covers both fields.
  for (const d of deepNebulae) if (d.group) d.group.visible = v;
  for (const s of stations) if (s.group) s.group.visible = v;
  setNebulaVisible(v);
}

// Everything that reads as SKY. This waits for the surface stage: pull it at
// touchdown and the sun disc and the stars visibly wink out while the player is
// still sitting in the seat, under a sky that is still the flight sim's.
function setSkyVisible(v, keep) {
  // The planet you're standing on keeps its terrain, but not its orbital
  // dressing: the atmosphere limb is an additive shell designed to be seen from
  // outside, and from the ground it just lays white haze over the whole world.
  // The global cloud layer goes for the same reason — the world module has its
  // own sky, with its own clouds, at a believable altitude.
  if (keep) {
    if (keep.atmosphere) keep.atmosphere.visible = v;
    if (keep.clouds) keep.clouds.visible = v;
  }
  if (sun.group) sun.group.visible = v;
  if (blackhole.group) blackhole.group.visible = v;
  setStarfieldVisible(v);
}

// Stage one — touchdown. Stops the simulation and clears the far field.
export function acquireUniverse(planet) {
  if (iso.active) return;
  iso.active = true;
  iso.keep = planet;
  setFarFieldVisible(false, planet);
}

// Stage one release — liftoff, or boarding the ship (which on a walkable world
// puts you back in free flight, not back on the pad).
export function releaseUniverse() {
  if (!iso.active) return;
  setFarFieldVisible(true, iso.keep);
  iso.active = false;
  iso.keep = null;
}

// Stage two — stepping out, once the world module exists and owns the sky.
// `renderer` and the AO pass are handed in rather than imported so this module
// stays free of the composer's construction order.
export function acquireSurface(planet, renderer, aoPass, camera, bloomPass) {
  if (iso.surface) return;
  iso.surface = true;
  iso.surfaceKeep = planet ?? iso.keep;
  const R = WORLD_RENDER[iso.surfaceKeep?.cfg?.name] ?? DEFAULT_RENDER;
  setSkyVisible(false, iso.surfaceKeep);

  if (camera) {
    iso.prevFar = camera.far;
    camera.far = ISO_FAR;
    camera.updateProjectionMatrix();
  }

  iso.prevExposure = renderer.toneMappingExposure;
  renderer.toneMappingExposure = R.exposure;

  if (R.soleLight && sun.light) {
    iso.prevSunLight = sun.light.intensity;
    iso.prevAmbient = sun.ambient ? sun.ambient.intensity : -1;
    sun.light.intensity = 0;
    if (sun.ambient) sun.ambient.intensity = 0;
  }

  if (bloomPass) {
    iso.prevBloomThreshold = bloomPass.threshold;
    iso.prevBloomStrength = bloomPass.strength;
    bloomPass.threshold = R.bloomThreshold;
    bloomPass.strength = R.bloomStrength;
  }

  // Shadows: off everywhere else in the game (a planet-scale shadow camera is
  // useless), worth it here where the whole world fits in ~60 m.
  iso.prevShadow = renderer.shadowMap.enabled;
  iso.prevShadowType = renderer.shadowMap.type;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.needsUpdate = true;

  // AO is the difference between "boxes in a room" and "a place": it draws the
  // contact darkening where surfaces meet, which no amount of PBR gives you.
  // LOW quality skips it — it is the single most expensive thing we add, and
  // the headless verify harness runs on software GL.
  if (aoPass) aoPass.enabled = settings.quality !== 'low';
}

// Stage two release. Guards on `surface`, NOT on `active` — the two stages are
// independent, and gating this on the universe flag would make it a no-op
// whenever the universe was already thawed.
export function releaseSurface(renderer, aoPass, camera, bloomPass) {
  if (!iso.surface) return;
  setSkyVisible(true, iso.surfaceKeep);
  if (camera) {
    camera.far = iso.prevFar;
    camera.updateProjectionMatrix();
  }
  renderer.toneMappingExposure = iso.prevExposure;
  if (iso.prevSunLight >= 0 && sun.light) {
    sun.light.intensity = iso.prevSunLight;
    if (sun.ambient && iso.prevAmbient >= 0) sun.ambient.intensity = iso.prevAmbient;
    iso.prevSunLight = iso.prevAmbient = -1;
  }
  if (bloomPass) {
    bloomPass.threshold = iso.prevBloomThreshold;
    bloomPass.strength = iso.prevBloomStrength;
  }
  renderer.shadowMap.enabled = iso.prevShadow;
  renderer.shadowMap.type = iso.prevShadowType;
  renderer.shadowMap.needsUpdate = true;
  if (aoPass) aoPass.enabled = false;
  iso.surface = false;
  iso.surfaceKeep = null;
}

// Belt-and-braces for the exit paths that bypass both liftoff and boarding —
// the collapse/respawn reset, the menu, and the actuality finale's game reset.
// Both stages, in the right order, and safe to call when neither is held.
export function releaseAll(renderer, aoPass, camera, bloomPass) {
  releaseSurface(renderer, aoPass, camera, bloomPass);
  releaseUniverse();
}
