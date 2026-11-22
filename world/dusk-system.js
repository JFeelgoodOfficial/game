// The Long Dusk: Season 1, chapter 2, as a system the light ship goes to
// (GDD 5.7.8 "Adding a chapter", 5.7.9; plans/season-1-arc.md).
//
// A red dwarf, and one world turned always the same way to it. The freighter
// sets down on a pad on the twilight line (src/game.js SYSTEM_DOCK), and the
// rest of the chapter is walked: world/dusk-ground.js is the place, world/
// dusk-dialogue.js its words, and this file its stage machine, its save
// record, its doors and its place on the chart (src/systems.js).
//
// The stages, forward only:
//
//   arrived    the ship is here
//   forecast   the flare's forecast has been shown (the fixed event, before it happens)
//   asked      Renn has asked for weapons
//   edge       the night edge has been seen; the lamp is in hand
//   seen       the lamp has shown what the tall are doing. Renn asks again.
//   decided    ARM or WARN has been chosen, and the clock to the flare is running
//   acted      the pilot is under the sledges and the flare is being watched
//   flare      it has happened (src/fixedEvents.js has how: 'rerouted' every group
//              out, 'partial' some, 'unheeded' none, or 'armed')
//   done       Renn has said goodbye
//
// `decided` and `acted` are never saved, and never survive leaving: a choice
// not yet lived through is unmade (src/season.js), and the chapter is back at
// `seen`, with Renn still asking. That is the season's rule for dying, and for
// walking away, both.
//
// The world is not a src/planet.js planet. It is a globe of the ground's own
// (see world/dusk-ground.js for why), so this file also keeps the freighter
// from flying through it.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { ship } from '../src/ship.js';
import { createDuskGround } from './dusk-ground.js';
import { DUSK } from './dusk-dialogue.js';

export const DUSK_STAGES = ['arrived', 'forecast', 'asked', 'edge', 'seen', 'decided', 'acted', 'flare', 'done'];
const KEY = 'ch2.decision';
const DOCK_RADIUS = 900;
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

// ctx: { scene, camera, chapter, voyage, sunDir, save(), crewTalk(captain), season, fixed }
export function createDuskSystem(ctx) {
  const { season, fixed } = ctx;
  let stage = 'arrived';
  const at = (s) => DUSK_STAGES.indexOf(s);
  const story = {
    stage: () => stage,
    reached: (s) => at(stage) >= at(s),
    advance(to) {
      if (at(to) <= at(stage)) return false;
      stage = to;
      ctx.save();
      return true;
    },
    // (only ever back to the asking: a choice that was not lived through)
    revert(to) {
      if (at(to) >= at(stage)) return false;
      stage = to;
      ctx.save();
      return true;
    },
  };
  const site = createDuskGround(ctx, story);

  // how the flare went, for a camp come back to
  function readOutcome() {
    const e = fixed.outcome('flare');
    if (!e || !e.how) return site.setOutcome(null);
    const d = e.detail || {};
    const groups = d.groups || 0;
    site.setOutcome({ how: e.how, groups, safe: d.safe || 0, young: d.young || 0, of: d.of || 9, key: e.how });
  }

  // --- the lean of the star: one slow clock (libration; world/dusk-ground.js) ---
  let clock = 0, pinned = null;
  const W = (Math.PI * 2) / C.DUSK_SWAY_PERIOD;

  return {
    docks: [{
      id: 'camp', label: DUSK.camp.label, pos: [5000, -30000, -9000], site, radius: DOCK_RADIUS, hover: 220,
      approach: DUSK.camp.approach, welcome: DUSK.camp.welcome, dockLabel: DUSK.camp.dockLabel, color: '#ff8a5a',
    }],
    planets: [],
    // its own doors: 'dusk:back' is dying here (the pilot is put where the season says)
    hop(key) {
      if (key !== 'dusk:back' && key !== 'dusk:ask' && key !== 'dusk:pad') return null;
      ctx.voyage.place();
      const to = key === 'dusk:back' ? site.revive() : key === 'dusk:ask' ? site.askAt() : { spawn: site.spawn.clone(), yaw: Math.PI };
      return { site, spawn: to.spawn, yaw: to.yaw, out: true };
    },
    door() {
      if (!site.inside() || !site.portal) return null;
      const to = site.portal;
      site.portal = null;
      return to;
    },
    update(dt) {
      // the star leans, and the twilight line moves across the ground with it.
      // (Held still while the pilot is being shown something or the flare's clock is running.)
      if (pinned == null && !site.scened()) clock += Math.min(dt, 0.1);
      const term = pinned ?? C.DUSK_SWAY_AMP * Math.sin(clock * W);
      const v = pinned != null || site.scened() ? 0 : C.DUSK_SWAY_AMP * W * Math.cos(clock * W);
      site.setTerm(term, v);
      // (the line a distance x toward the night means the star that angle above the horizon)
      const a = -term / C.DUSK_GLOBE_R;
      ctx.sunDir.set(Math.cos(a), Math.sin(a), 0);
      // the world is solid: the freighter does not go through it. Inside the
      // pad's reach the landing has the helm and this is left alone.
      if (!site.inside()) {
        _c.copy(site.group.position).add(site.globe.centre);
        _d.subVectors(ship.position, _c);
        const r = _d.length(), min = site.globe.radius + 40;
        if (r < min && r > 1 && ship.position.distanceTo(site.group.position) > DOCK_RADIUS * C.ATMO_SHELL + 60) {
          _d.multiplyScalar(1 / r);
          ship.position.copy(_c).addScaledVector(_d, min);
          const vin = ship.velocity.dot(_d);
          if (vin < 0) ship.velocity.addScaledVector(_d, -vin);
        }
      }
    },
    // what the captains say on the bridge while the ship is here, until the
    // flare; after it, src/fixedEvents.js remembers how it went, wherever the ship is
    talk: (captainId) => (fixed.resolved('flare') ? null : DUSK.talk[captainId] || null),
    // back aboard after Renn's goodbye: what the captains say on the bridge
    // (world/basebridge.js plays it once; src/voyage.js keeps that it has been)
    debrief() {
      if (stage !== 'done') return null;
      const how = fixed.outcome('flare')?.how;
      const D = DUSK.debrief;
      const body = D[how] || D.rerouted;
      return { title: D.title, complete: D.complete, lines: [D.open, ...body, D.close], nextCourse: D.nextCourse, nextNone: D.nextNone };
    },
    // the record: only once something has happened here
    serialize() {
      if (stage === 'arrived') return undefined;
      return { stage: stage === 'decided' || stage === 'acted' ? 'seen' : stage };
    },
    restore(raw) {
      if (raw && DUSK_STAGES.includes(raw.stage)) stage = raw.stage === 'decided' || raw.stage === 'acted' ? 'seen' : raw.stage;
      // a choice made and not lived through when the game was left: back at the asking
      if (season.pending()?.key === KEY && season.get(KEY) != null) season.die();
      readOutcome();
      site.settle();
    },
    state: () => ({
      stage, decision: season.get(KEY), pending: season.pending(), flare: fixed.outcome('flare'),
      clock: +clock.toFixed(1), pinned, ground: site.info(), places: site.places,
    }),
    // --- dev (through __debug.tenretni.voyage().instance('dusk')) ---
    // jump the stage, either way, with the season's record made to agree.
    // `opt`: 'arm' | 'warn' for decided; 'armed' | 'rerouted' | 'unheeded' | 'partial' for flare and done.
    go(s, opt) {
      if (!DUSK_STAGES.includes(s)) return false;
      if (at(s) < at('decided')) {
        if (season.pending()?.key === KEY) season.survive(KEY);
        season.set(KEY, null);
        season.set('ch2.young', null);
        season.clearEvent('flare');
        if (at(s) >= at('forecast')) fixed.forecast('flare');
        stage = s;
      } else if (s === 'decided' || s === 'acted') {
        season.set(KEY, null);
        season.clearEvent('flare');
        fixed.forecast('flare');
        stage = 'seen';
        readOutcome();
        site.settle();
        site.dbg.decide(opt === 'arm' ? 'arm' : 'warn');
        if (s === 'acted') site.dbg.shelter();
        ctx.save();
        return true;
      } else {
        const how = opt || (season.get(KEY) === 'arm' ? 'armed' : 'rerouted');
        const groups = how === 'rerouted' ? 3 : how === 'partial' ? 2 : 0;
        season.decide(KEY, how === 'armed' ? 'arm' : 'warn');
        if (season.pending()?.key === KEY) season.survive(KEY);
        fixed.resolve('flare', how, { young: groups * 3, of: 9, groups, safe: (1 << groups) - 1 });
        season.set('ch2.young', groups * 3);
        stage = s;
      }
      readOutcome();
      site.settle();
      ctx.save();
      return true;
    },
    seek: (u) => site.dbg.seek(u),
    skip: () => site.dbg.skip(),
    decide: (option) => site.dbg.decide(option),
    kill: (cause) => site.dbg.kill(cause),
    // pin the twilight line at x (null lets it move again)
    sway(x) {
      pinned = Number.isFinite(x) ? x : null;
      return pinned;
    },
    dbg: site.dbg,
    site,
  };
}
