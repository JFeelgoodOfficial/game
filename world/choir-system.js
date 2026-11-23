// The Pulsar Choir: Season 1, chapter 7, as a system the light ship goes to
// (GDD 5.7.8 "Adding a chapter", 5.7.9; plans/season-1-arc.md). Marrow's chapter.
//
// A millisecond pulsar and the white dwarf it stripped to spin itself up (the
// system's star, as the chart draws it, is the dwarf; the pulsar is the hall's
// own to draw). The freighter sets down on the forecourt of the choir hall
// (world/choir-hall.js, a dock for src/game.js SYSTEM_DOCK), and the chapter
// is walked there. world/choir-dialogue.js is its words; this file is its
// stage machine, its save record, its door and its place on the chart.
//
// The stages, forward only:
//
//   arrived    the ship is here
//   docked     the hall has been seen, and its bells heard to stop part way
//   met        the First Voice has said what the star was, and what it has done
//   heard      the star has been listened to under the rose, on the radio band
//   sung       the old hymn has been sung back three times with the star's new
//              note in its gap, and the hall has taken it up
//   decided    KEEP YOUR OWN TIME or TAKE THE TABLE (season fact `ch7.choir`:
//              'free' | 'forecast')
//   done       the hall has answered
//
// There is no fixed event here, and nothing that can kill the pilot: the
// decision is offered, made and survived in one step (src/season.js).
//
// Door: `choir:nave` (the cantor's stand).

import { C } from '../src/constants.js';
import { createChoirHall } from './choir-hall.js';
import { CHOIR } from './choir-dialogue.js';

export const CHOIR_STAGES = ['arrived', 'docked', 'met', 'heard', 'sung', 'decided', 'done'];
const KEY = 'ch7.choir';

// ctx: { scene, camera, chapter, voyage, sunDir, save(), crewTalk(captain), season, fixed }
export function createChoirSystem(ctx) {
  const { season } = ctx;
  let stage = 'arrived';
  const at = (s) => CHOIR_STAGES.indexOf(s);
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
  const site = createChoirHall(ctx, story);

  return {
    docks: [{
      id: 'hall', label: CHOIR.hall.label, pos: [-12000, 4000, 18000], site, radius: 620, hover: C.BASE_DOCK_HOVER + 40,
      approach: CHOIR.hall.approach, welcome: CHOIR.hall.welcome, dockLabel: CHOIR.hall.dockLabel, color: '#9fc8ff',
    }],
    planets: [],
    hop(key) {
      if (key !== 'choir:nave') return null;
      ctx.voyage.place();
      return { site, spawn: site.atStand, yaw: Math.PI, out: true };
    },
    door() {
      if (!site.inside() || !site.portal) return null;
      const to = site.portal;
      site.portal = null;
      return to;
    },
    talk: (captainId) => (story.reached('decided') ? null : CHOIR.talk[captainId] || null),
    // back aboard with the hall's answer given: what the captains say on the bridge
    debrief() {
      if (stage !== 'done') return null;
      const D = CHOIR.debrief;
      const end = season.get(KEY) === 'forecast' ? D.forecast : D.free;
      return { title: D.title, complete: D.complete, lines: [D.open, ...D.body, ...end, D.close], nextCourse: D.nextCourse, nextNone: D.nextNone };
    },
    serialize: () => (stage === 'arrived' ? undefined : { stage }),
    restore(raw) {
      if (raw && CHOIR_STAGES.includes(raw.stage)) stage = raw.stage;
      // (a stage past the choice with no choice on record cannot be: back to the asking)
      if (at(stage) >= at('decided') && season.get(KEY) == null) stage = 'sung';
    },
    state: () => ({ stage, choir: season.get(KEY), pending: season.pending(), hall: site.info(), places: site.places }),
    // --- dev (through __debug.tenretni.voyage().instance('choir')) ---
    // jump the stage, either way, with the season's record made to agree.
    // `opt`: 'free' | 'forecast' for decided and done.
    go(s, opt) {
      if (!CHOIR_STAGES.includes(s)) return false;
      if (season.pending()?.key === KEY) season.survive(KEY);
      if (at(s) >= at('decided')) season.decide(KEY, opt === 'forecast' ? 'forecast' : opt === 'free' ? 'free' : season.get(KEY) || 'free');
      else season.set(KEY, null);
      if (s !== 'done') season.set('debrief.choir', null);
      stage = s;
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
