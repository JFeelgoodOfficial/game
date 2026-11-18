// The megaworld chapter (GDD 5.7.4): what happens to the pilot after the suite.
//
// The far side (src/farside.js) ends with the pilot given a room at the top of
// a tower. This is the story from there: an offer, a ship that goes where its
// pilot imagines, an archive walked a room at a time, a dive to the edge of
// the black hole, and something made that was never in the archive.
//
// One small state machine, owned by src/tenretni.js (which saves it with the
// rest of the story). The places ask it what to say and tell it what happened;
// it knows nothing about how anything is drawn.
//
//   stage      where the story is (STAGES, in order; it only goes forward)
//   picks      { worldId: layer } the fragment taken in each holo room
//   seen       holo rooms walked into
//   assigned   the shuttle has been spoken of
//
// Every word comes from world/chapter-dialogue.js.

import { addCodex } from './journal.js';
import { uiSound } from './sfx.js';
import { LAYERS } from '../world/layerplanet.js';
import { WORLDS, SUITE_OFFER, SUITE_ACCEPT, SUITE_WAIT, SUITE_REMIND } from '../world/chapter-dialogue.js';

export const STAGES = ['suite', 'demo', 'holo', 'dive', 'shuttle', 'dream', 'stall', 'canvas', 'birth', 'return', 'done'];

// ctx: { onSave() — the story's one save (src/tenretni.js) }
export function createChapter(ctx) {
  let stage = 'suite';
  const picks = {};
  const seen = [];
  let assigned = false;

  const at = (s) => STAGES.indexOf(s);
  function advance(to) {
    if (at(to) <= at(stage)) return false;
    stage = to;
    ctx.onSave();
    return true;
  }

  return {
    stage: () => stage,
    before: (s) => at(stage) < at(s),
    reached: (s) => at(stage) >= at(s),
    advance,

    // --- the suite: the one who waits by the window ---
    visitorTalk() {
      if (stage === 'suite') return SUITE_OFFER;
      return SUITE_REMIND;
    },
    // A picked option, from any City of Light dialogue (world/lightcity.js).
    onChoice(tag) {
      if (tag === 'ch:accept') {
        if (advance('demo')) {
          uiSound('engage');
          addCodex('The Offer');
        }
        return SUITE_ACCEPT;
      }
      if (tag === 'ch:wait') return SUITE_WAIT;
      return null;
    },

    // --- the save: one small object inside src/tenretni.js's ---
    serialize() {
      if (stage === 'suite' && !seen.length) return undefined;
      return { stage, picks: { ...picks }, seen: seen.slice(), assigned: assigned || undefined };
    },
    restore(raw) {
      if (!raw || typeof raw !== 'object') return;
      if (STAGES.includes(raw.stage)) stage = raw.stage;
      if (raw.picks && typeof raw.picks === 'object') {
        for (const w of WORLDS) if (LAYERS.includes(raw.picks[w.id])) picks[w.id] = raw.picks[w.id];
      }
      if (Array.isArray(raw.seen)) for (const w of WORLDS) if (raw.seen.includes(w.id) && !seen.includes(w.id)) seen.push(w.id);
      if (raw.assigned) assigned = true;
    },

    // dev (__debug.tenretni.chapter()): jump the story to a stage, either way
    go(s) {
      if (!STAGES.includes(s)) return false;
      stage = s;
      ctx.onSave();
      return true;
    },
    state: () => ({ stage, picks: { ...picks }, seen: seen.slice(), assigned }),
  };
}
