// Under the Ice: Season 1, chapter 3, as a system the light ship goes to
// (GDD 5.7.8 "Adding a chapter", 5.7.9; plans/season-1-arc.md).
//
// A rogue planet: no star. The freighter sets down by a bore melted through
// its ice (world/ice-surface.js, a dock for src/game.js SYSTEM_DOCK), and the
// vessel of Entry Zero goes down it into the ocean underneath (world/
// ice-ocean.js, walked under the pause). world/ice-dialogue.js is its words;
// this file is its stage machine, its save record, its doors and its place on
// the chart (src/systems.js).
//
// The stages, forward only:
//
//   arrived    the ship is here
//   forecast   the forecast has been shown: they will learn they are not alone
//   down       the vessel is in the water
//   heard      the first caller has been found by ear, and has gone quiet
//   answered   its call has been given back three times; the others have come
//   city       the vents, where they live, have been seen
//   asked      under the thinnest ice: SHOW THEM THE SKY, or LEAVE THEM
//   decided    chosen, and not yet lived through
//   contact    it is settled (src/fixedEvents.js has how: 'shown' | 'left')
//   done       back on the ice
//
// `decided` is never saved and never survives leaving the water: the choice
// is unmade (src/season.js) and the chapter is back at `asked`.
//
// Doors: `ice:down` into the bore, `ice:up` out of it, `ice:back` when the
// vessel is lost (back to the asking), `ice:ask` to the asking.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { ship } from '../src/ship.js';
import { createIceSurface } from './ice-surface.js';
import { createIceOcean } from './ice-ocean.js';
import { ICE } from './ice-dialogue.js';

export const ICE_STAGES = ['arrived', 'forecast', 'down', 'heard', 'answered', 'city', 'asked', 'decided', 'contact', 'done'];
const KEY = 'ch3.decision';
const DOCK_RADIUS = 800;
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

// ctx: { scene, camera, chapter, voyage, sunDir, save(), crewTalk(captain), season, fixed }
export function createIceSystem(ctx) {
  const { season, fixed } = ctx;
  let stage = 'arrived';
  const at = (s) => ICE_STAGES.indexOf(s);
  const story = {
    stage: () => stage,
    reached: (s) => at(stage) >= at(s),
    advance(to) {
      if (at(to) <= at(stage)) return false;
      stage = to;
      ctx.save();
      return true;
    },
    revert(to) {
      if (at(to) >= at(stage)) return false;
      stage = to;
      ctx.save();
      return true;
    },
  };
  const surface = createIceSurface(ctx, story);
  let ocean = null, oceanBroken = false;
  // the ocean is built the first time the vessel goes down
  function getOcean() {
    if (!ocean && !oceanBroken) {
      try {
        ocean = createIceOcean(ctx, story);
      } catch (err) {
        oceanBroken = true;
        console.warn('[voyage] the ocean under the ice could not be built', err);
      }
    }
    return ocean;
  }
  const below = (to) => {
    const s = getOcean();
    return s ? { site: s, spawn: s.spawn, yaw: s.spawnYaw, look: 'dive', ...to } : null;
  };

  return {
    docks: [{
      id: 'bore', label: ICE.shelf.label, pos: [-7000, -26000, 12000], site: surface, radius: DOCK_RADIUS, hover: 200,
      approach: ICE.shelf.approach, welcome: ICE.shelf.welcome, dockLabel: ICE.shelf.dockLabel, color: '#8fd8ff',
    }],
    planets: [],
    hop(key) {
      if (key === 'ice:down') return below();
      if (key === 'ice:back') {
        if (!getOcean()) return null;
        ocean.revive();
        return below();
      }
      if (key === 'ice:ask') {
        if (!getOcean()) return null;
        ocean.askAgain();
        return below();
      }
      if (key === 'ice:up') {
        ctx.voyage.place();
        return { site: surface, spawn: surface.fromBore, yaw: 0, out: true };
      }
      return null;
    },
    door() {
      for (const s of [surface, ocean]) {
        if (!s || !s.inside() || !s.portal) continue;
        const to = s.portal;
        s.portal = null;
        return to;
      }
      return null;
    },
    update() {
      // the world is solid: the freighter does not go through it (world/dusk-system.js does the same)
      if (surface.inside() || (ocean && ocean.inside())) return;
      _c.copy(surface.group.position).add(surface.globe.centre);
      _d.subVectors(ship.position, _c);
      const r = _d.length(), min = surface.globe.radius + 40;
      if (r < min && r > 1 && ship.position.distanceTo(surface.group.position) > DOCK_RADIUS * C.ATMO_SHELL + 60) {
        _d.multiplyScalar(1 / r);
        ship.position.copy(_c).addScaledVector(_d, min);
        const vin = ship.velocity.dot(_d);
        if (vin < 0) ship.velocity.addScaledVector(_d, -vin);
      }
    },
    talk: (captainId) => (fixed.resolved('contact') ? null : ICE.talk[captainId] || null),
    // back aboard with it settled: what the captains say on the bridge (world/basebridge.js plays it once)
    debrief() {
      if (stage !== 'done') return null;
      const how = fixed.outcome('contact')?.how;
      const D = ICE.debrief;
      return { title: D.title, complete: D.complete, lines: [D.open, ...(D[how] || D.left), D.close], nextCourse: D.nextCourse, nextNone: D.nextNone };
    },
    serialize() {
      if (stage === 'arrived') return undefined;
      return { stage: stage === 'decided' ? 'asked' : stage };
    },
    restore(raw) {
      if (raw && ICE_STAGES.includes(raw.stage)) stage = raw.stage === 'decided' ? 'asked' : raw.stage;
      // a choice made and not lived through when the game was left: back at the asking
      if (season.pending()?.key === KEY && season.get(KEY) != null) season.die();
    },
    state: () => ({
      stage, decision: season.get(KEY), pending: season.pending(), contact: fixed.outcome('contact'),
      surface: surface.info(), ocean: ocean ? ocean.info() : null, places: { surface: surface.places, ocean: ocean ? ocean.places : null },
    }),
    // --- dev (through __debug.tenretni.voyage().instance('ice')) ---
    // jump the stage, either way, with the season's record made to agree.
    // `opt`: 'show' | 'leave' for decided; 'shown' | 'left' for contact and done.
    go(s, opt) {
      if (!ICE_STAGES.includes(s)) return false;
      if (at(s) < at('contact')) {
        if (season.pending()?.key === KEY) season.survive(KEY);
        season.set(KEY, null);
        season.set('ch3.archived', null);
        season.clearEvent('contact');
        if (at(s) >= at('forecast')) fixed.forecast('contact');
        stage = s === 'decided' ? 'asked' : s;
        if (ocean) ocean.settle();
        if (s === 'decided' && ocean) ocean.dbg.decide(opt === 'show' ? 'show' : 'leave');
      } else {
        const how = opt === 'shown' || opt === 'left' ? opt : season.get(KEY) === 'show' ? 'shown' : 'left';
        season.decide(KEY, how === 'shown' ? 'show' : 'leave');
        if (season.pending()?.key === KEY) season.survive(KEY);
        fixed.resolve('contact', how, { archived: how === 'shown' });
        season.set('ch3.archived', how === 'shown');
        stage = s;
        if (ocean) ocean.settle();
      }
      ctx.save();
      return true;
    },
    seek: (u) => (ocean ? ocean.dbg.seek(u) : false),
    skip: () => (ocean ? ocean.dbg.skip() : false),
    decide: (option) => (ocean ? ocean.dbg.decide(option) : false),
    kill: (cause) => (ocean ? ocean.dbg.kill(cause) : false),
    get dbg() {
      return ocean ? ocean.dbg : null;
    },
    surface,
    ocean: () => ocean,
  };
}
