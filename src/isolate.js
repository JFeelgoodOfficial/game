// Isolated worlds — pausing the universe while the player walks a story planet.
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
// What is NOT paused: floating-origin bookkeeping. `updateOrigin` walks the
// shiftables list independently of anything here, and `updatePlanets` never
// moves a planet — it spins them and pokes shader uniforms — so skipping it for
// the six planets you can't see is free and safe. This mirrors the pattern
// stations.js already uses (distance-gate the animation, never the origin).
//
// Restoring is symmetric and total: every flag set here is unset in `release`,
// including the renderer and composer state, so a walk on an isolated world
// leaves nothing behind for the flight sim to trip over.

import * as THREE from 'three';
import { planets } from './planet.js';
import { sun } from './sun.js';
import { blackhole } from './blackhole.js';
import { deepNebulae } from './deepnebula.js';
import { stations } from './stations.js';
import { setStarfieldVisible } from './starfield.js';
import { setNebulaVisible } from './nebula.js';
import { settings } from './settings.js';

// Worlds that own their sky and light outright, and so can isolate. Both are
// total conversions dispatched by name in walk.js; keeping the list here means
// adding a third world is a one-line change.
const ISOLATING_WORLDS = new Set(['actuality']);

export function isIsolatingWorld(name) {
  return ISOLATING_WORLDS.has(name);
}

// Live state. `active` is the whole switch; `keep` is the planet we're standing
// on, which keeps updating while its six siblings do not.
const iso = {
  active: false,
  keep: null,
  prevShadow: false,
  prevShadowType: THREE.PCFShadowMap,
  prevFar: 1e6,
  prevExposure: 1,
  prevBloomThreshold: 0,
  prevBloomStrength: 0,
};

// Tone mapping exposure while isolated. The flight sim is calibrated for a
// black sky with a handful of bright objects in it; a daylit sky is orders of
// magnitude brighter and blows out at exposure 1.
const ISO_EXPOSURE = 0.32;

// Bloom on an isolated world has to be re-aimed. In space the sky is black, so
// a 0.85 threshold catches only stars and the accretion disc. Under a real sky
// almost every pixel clears that threshold, and bloom turns into a full-frame
// white haze that eats the whole image. Raising the threshold well above sky
// luminance puts the glow back where it belongs: the string lights, the
// gateway panes, the fire.
const ISO_BLOOM_THRESHOLD = 2.4;
const ISO_BLOOM_STRENGTH = 0.5;

// Far plane while isolated. The flight camera runs 0.1..1e6 because it has to
// hold a solar system, which leaves almost no depth precision at arm's length —
// fine for planets seen from orbit, useless for AO and contact shadows in a
// café. Nothing here is further than the far side of the planet you're standing
// on (radius 900, so ~1800 m), so 4000 covers everything with room to spare and
// buys back several orders of magnitude of depth resolution.
const ISO_FAR = 4000;

export const isolated = iso; // read-only for callers (game.js, __debug)

// Everything in the sky that belongs to the flight sim, toggled as one.
function setSpaceVisible(v, keep) {
  for (const p of planets) if (p !== keep) p.group.visible = v;
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
  // The painting nebulae push their records into deepNebulae too, so this one
  // loop covers both fields.
  for (const d of deepNebulae) if (d.group) d.group.visible = v;
  for (const s of stations) if (s.group) s.group.visible = v;
  setStarfieldVisible(v);
  setNebulaVisible(v);
}

// Called from enterWalk's host once the world module exists. `renderer` and the
// AO pass are handed in rather than imported so this module stays free of the
// composer's construction order.
export function acquire(planet, renderer, aoPass, camera, bloomPass) {
  if (iso.active) return;
  iso.active = true;
  iso.keep = planet;
  setSpaceVisible(false, planet);

  if (camera) {
    iso.prevFar = camera.far;
    camera.far = ISO_FAR;
    camera.updateProjectionMatrix();
  }

  iso.prevExposure = renderer.toneMappingExposure;
  renderer.toneMappingExposure = ISO_EXPOSURE;

  if (bloomPass) {
    iso.prevBloomThreshold = bloomPass.threshold;
    iso.prevBloomStrength = bloomPass.strength;
    bloomPass.threshold = ISO_BLOOM_THRESHOLD;
    bloomPass.strength = ISO_BLOOM_STRENGTH;
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

export function release(renderer, aoPass, camera, bloomPass) {
  if (!iso.active) return;
  setSpaceVisible(true, iso.keep);
  if (camera) {
    camera.far = iso.prevFar;
    camera.updateProjectionMatrix();
  }
  renderer.toneMappingExposure = iso.prevExposure;
  if (bloomPass) {
    bloomPass.threshold = iso.prevBloomThreshold;
    bloomPass.strength = iso.prevBloomStrength;
  }
  renderer.shadowMap.enabled = iso.prevShadow;
  renderer.shadowMap.type = iso.prevShadowType;
  renderer.shadowMap.needsUpdate = true;
  if (aoPass) aoPass.enabled = false;
  iso.active = false;
  iso.keep = null;
}
