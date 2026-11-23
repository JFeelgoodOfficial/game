// The Weight of Hands: Season 1, chapter 8, as a system the light ship goes to
// (GDD 5.7.8 "Adding a chapter", 5.7.9; plans/season-1-arc.md). Vask's chapter.
//
// A dim star with half a swarm of mirrors round it, and a yard where machines
// are still building the other half for makers who left ten thousand years
// ago. world/swarm-yard.js is the place, world/swarm-dialogue.js its words,
// and this file its stage machine, its save record, its doors and its place on
// the chart (src/systems.js).
//
// The stages, forward only:
//
//   arrived    the ship is here
//   docked     the swarm has been seen from the pad; the lamp is in hand
//   read       four builders have been held in the X-ray band, and what is
//              inside them has been understood
//   offered    two buyers have made their offers, to the pilot and not to the builders
//   decided    the work order has been ended (ch8.builders: 'freed') or its
//              output assigned ('contracted'); what follows is being watched
//   done       it has been watched
//
// Nothing here can kill the pilot, so the decision is offered, made and
// survived in one step (src/season.js). There is no fixed event in this
// chapter: what it leaves is the season fact `ch8.builders`, which chapter 10
// reads for who comes to the siege.
//
// Doors: `swarm:pad`, `swarm:post`.

import { C } from '../src/constants.js';
import { createSwarmYard } from './swarm-yard.js';
import { SWARM } from './swarm-dialogue.js';

export const SWARM_STAGES = ['arrived', 'docked', 'read', 'offered', 'decided', 'done'];
const KEY = 'ch8.builders';
const ALL = 15; // the four that are read, one bit each

// ctx: { scene, camera, chapter, voyage, sunDir, save(), crewTalk(captain), season, fixed }
export function createSwarmSystem(ctx) {
  const { season } = ctx;
  let stage = 'arrived';
  let seen = 0; // which of the four have been read
  const at = (s) => SWARM_STAGES.indexOf(s);
  const story = {
    stage: () => stage,
    reached: (s) => at(stage) >= at(s),
    advance(to) {
      if (at(to) <= at(stage)) return false;
      stage = to;
      ctx.save();
      return true;
    },
    seen: () => seen,
    see(i) {
      seen |= 1 << i;
      ctx.save();
    },
  };
  const site = createSwarmYard(ctx, story);

  return {
    docks: [{
      id: 'yard', label: SWARM.yard.label, pos: [-4000, 3000, -20000], site, radius: 520, hover: C.BASE_DOCK_HOVER,
      approach: SWARM.yard.approach, welcome: SWARM.yard.welcome, dockLabel: SWARM.yard.dockLabel, color: '#ffb060',
    }],
    planets: [],
    hop(key) {
      if (key !== 'swarm:pad' && key !== 'swarm:post') return null;
      ctx.voyage.place();
      return key === 'swarm:post' ? { site, spawn: site.atPost.clone(), yaw: Math.PI / 2, out: true } : { site, spawn: site.spawn.clone(), yaw: Math.PI, out: true };
    },
    door() {
      if (!site.inside() || !site.portal) return null;
      const to = site.portal;
      site.portal = null;
      return to;
    },
    talk: (captainId) => (at(stage) >= at('decided') ? null : SWARM.talk[captainId] || null),
    // back aboard with it settled: what the captains say on the bridge (world/basebridge.js plays it once)
    debrief() {
      if (stage !== 'done') return null;
      const D = SWARM.debrief;
      const body = season.get(KEY) === 'contracted' ? D.contracted : D.freed;
      return { title: D.title, complete: D.complete, lines: [D.open, ...D.body, ...body, D.close], nextCourse: D.nextCourse, nextNone: D.nextNone };
    },
    // the record: only once something has happened here
    serialize() {
      if (stage === 'arrived' && !seen) return undefined;
      // (the end, left while it was being watched, has happened)
      return { stage: stage === 'decided' ? 'done' : stage, seen: seen || undefined };
    },
    restore(raw) {
      if (!raw || typeof raw !== 'object') return;
      if (SWARM_STAGES.includes(raw.stage)) stage = raw.stage === 'decided' ? 'done' : raw.stage;
      if (Number.isFinite(raw.seen)) seen = raw.seen & ALL;
      if (at(stage) >= at('read')) seen = ALL;
      // a save that says it was decided, and a season that does not say how: back to the post
      if (at(stage) >= at('decided') && season.get(KEY) == null) stage = 'offered';
      site.settle();
    },
    state: () => ({ stage, seen, decision: season.get(KEY), pending: season.pending(), yard: site.info(), places: site.places }),
    // --- dev (through __debug.tenretni.voyage().instance('swarm')) ---
    // jump the stage, either way, with the season's record made to agree.
    // `opt`: 'freed' | 'contracted' for decided and done.
    go(s, opt) {
      if (!SWARM_STAGES.includes(s)) return false;
      if (season.pending()?.key === KEY) season.survive(KEY);
      if (at(s) >= at('decided')) season.decide(KEY, opt === 'contracted' || opt === 'freed' ? opt : season.get(KEY) || 'freed');
      else season.set(KEY, null);
      stage = s === 'decided' ? 'done' : s;
      seen = at(stage) >= at('read') ? ALL : 0;
      site.settle();
      ctx.save();
      return true;
    },
    seek: (u) => site.dbg.seek(u),
    skip: () => site.dbg.skip(),
    decide: (option) => site.dbg.decide(option),
    dbg: site.dbg,
    site,
  };
}
