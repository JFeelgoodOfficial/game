// Futures: Season 1, chapter 6, as a system the light ship goes to (GDD 5.7.8
// "Adding a chapter", 5.7.9; plans/season-1-arc.md). Lux's chapter.
//
// A world that sold its future to the season's rival, three hundred years
// ago. world/futures-city.js is its square, world/futures-dialogue.js its
// words; this file is its stage machine, its record, its doors and its place
// on the chart (src/systems.js).
//
// The stages, forward only:
//   arrived     the ship is here
//   forecast    the fixed event's forecast has been shown: the port will flood
//   welcomed    the Keeper of Hours has explained, and the hour has been seen to strike
//   predicted   three citizens have been watched arriving to the second
//   missed      the fourth did not come
//   found       she has been found, and talked to
//   decided     the light ship's own forecast: signed, or refused (`ch6.signed`)
//   done        she has been walked back to her bench
//
// The fixed event `flood` (src/fixedEvents.js) is resolved by the decision:
// 'bound' if the ship is forecast going into the war, 'free' if not. From then
// on world/concourse-system.js doubles every price at the port.

import { createFuturesCity } from './futures-city.js';
import { FUT } from './futures-dialogue.js';

export const FUT_STAGES = ['arrived', 'forecast', 'welcomed', 'predicted', 'missed', 'found', 'decided', 'done'];
const KEY = 'ch6.signed';

// ctx: { scene, camera, chapter, voyage, sunDir, save(), crewTalk(captain), season, fixed }
export function createFuturesSystem(ctx) {
  const { season, fixed } = ctx;
  let stage = 'arrived';
  const at = (s) => FUT_STAGES.indexOf(s);
  const story = {
    stage: () => stage,
    reached: (s) => at(stage) >= at(s),
    advance(to) {
      if (at(to) <= at(stage)) return false;
      stage = to;
      ctx.save();
      return true;
    },
  };
  const site = createFuturesCity(ctx, story);
  return {
    docks: [{ id: 'square', label: FUT.city.label, pos: [12000, -9000, 21000], site, radius: 700, hover: 190, approach: FUT.city.approach, welcome: FUT.city.welcome, dockLabel: FUT.city.dockLabel, color: '#ffe8b0' }],
    planets: [],
    hop(key) {
      if (key !== 'futures:ask') return null;
      ctx.voyage.place();
      const to = site.askAt();
      return { site, spawn: to.spawn, yaw: to.yaw, out: true };
    },
    door() {
      if (!site.inside() || !site.portal) return null;
      const to = site.portal;
      site.portal = null;
      return to;
    },
    talk: (captainId) => (fixed.resolved('flood') ? null : FUT.talk[captainId] || null),
    debrief() {
      if (stage !== 'done') return null;
      const D = FUT.debrief;
      return { title: D.title, complete: D.complete, lines: [D.open, ...D.body, season.get(KEY) ? D.signed : D.refused, ...D.tail, D.close], nextCourse: D.nextCourse, nextNone: D.nextNone };
    },
    serialize: () => (stage === 'arrived' ? undefined : { stage }),
    restore(raw) {
      if (raw && FUT_STAGES.includes(raw.stage)) stage = raw.stage;
    },
    state: () => ({ stage, signed: season.get(KEY), flood: fixed.outcome('flood'), city: site.info(), places: site.places }),
    // dev: jump the stage, either way, with the season's record made to agree. `opt`: 'signed' | 'refused'
    go(s, opt) {
      if (!FUT_STAGES.includes(s)) return false;
      if (at(s) >= at('decided')) {
        const signed = opt ? opt === 'signed' : !!season.get(KEY);
        season.decide(KEY, signed);
        fixed.resolve('flood', signed ? 'bound' : 'free', { signed });
      } else {
        season.set(KEY, null);
        season.clearEvent('flood');
        if (at(s) >= at('forecast')) fixed.forecast('flood');
      }
      stage = s;
      ctx.save();
      return true;
    },
    skip: () => site.dbg.skip(),
    decide: (option) => site.dbg.decide(option),
    dbg: site.dbg,
    site,
  };
}
