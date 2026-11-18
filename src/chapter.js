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
import { C } from './constants.js';
import { WORLDS, SUITE_OFFER, SUITE_ACCEPT, SUITE_WAIT, SUITE_REMIND, RETURN } from '../world/chapter-dialogue.js';

export const STAGES = ['suite', 'demo', 'holo', 'dive', 'shuttle', 'dream', 'stall', 'canvas', 'birth', 'return', 'done'];

// ctx: { onSave() — the story's one save (src/tenretni.js) }
export function createChapter(ctx) {
  let stage = 'suite';
  const picks = {};
  const seen = [];
  let assigned = false;
  let epilogue = false; // the captains have seen what was built, and the ship leave again
  let home = false; // the light ship is back in its hangar, a long time later
  const clock = { ship: 0, world: 0 }; // what the two clocks read when the ship was down

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
      if (home) return RETURN.plinth; // back, with something for the archive
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

    // --- the holodeck on the light ship (world/lightship.js) ---
    // A room has been walked into. True the first time for that room.
    see(id) {
      if (seen.includes(id)) return false;
      seen.push(id);
      ctx.onSave();
      return true;
    },
    seenCount: () => seen.length,
    // the shuttle is due to be spoken of / has been
    assignDue: () => !assigned && seen.length >= C.CH_ASSIGN_AFTER,
    assigned: () => assigned,
    setAssigned() {
      if (assigned) return;
      assigned = true;
      addCodex('The Shuttle');
      ctx.onSave();
    },
    // One fragment from a world: taking another from the same world swaps it.
    pick(id, layer) {
      if (picks[id] === layer) return false;
      delete picks[id]; // (so the newest pick is always last)
      picks[id] = layer;
      ctx.onSave();
      return true;
    },
    picked: (id) => picks[id] || null,
    count: () => Object.keys(picks).length,
    // enough worlds have given something, and the assignment has been heard
    ready: () => assigned && Object.keys(picks).length >= Math.min(C.CH_FRAGMENTS_NEEDED, WORLDS.length),
    // The planet the picks make, into `out` { sky, ground, ... } (fragment or
    // null): where two worlds gave the same layer, the later one is kept.
    compose(out) {
      for (const l of LAYERS) out[l] = null;
      for (const id of Object.keys(picks)) {
        const w = WORLDS.find((x) => x.id === id);
        if (w) out[picks[id]] = w.layers[picks[id]];
      }
      return out;
    },

    // --- the dive (world/divebridge.js) ---
    setClocks(ship, world) {
      clock.ship = ship;
      clock.world = world;
      ctx.onSave();
    },
    clocks: () => clock,

    // --- the return ---
    home: () => home,
    setHome() {
      if (home) return;
      home = true;
      ctx.onSave();
    },
    epilogue: () => epilogue,
    setEpilogue() {
      if (epilogue) return;
      epilogue = true;
      addCodex('A New Idea');
      ctx.onSave();
    },
    // what the two clocks came to, said once the pilot is back in the city
    returnLine() {
      const m = Math.max(1, Math.round(clock.ship / 60));
      const y = Math.max(1, Math.round(clock.world / (365 * 86400)));
      return RETURN.clocks.replace('{ship}', `${m} MINUTE${m === 1 ? '' : 'S'}`).replace('{world}', `${y} YEAR${y === 1 ? '' : 'S'}`);
    },
    // the Keeper, on the terrace, afterwards: the last thing in the chapter
    keeperTalk() {
      if (advance('done')) addCodex(RETURN.codex);
      return RETURN.keeper;
    },

    // --- the save: one small object inside src/tenretni.js's ---
    serialize() {
      if (stage === 'suite' && !seen.length) return undefined;
      return { stage, picks: { ...picks }, seen: seen.slice(), assigned: assigned || undefined, home: home || undefined, epilogue: epilogue || undefined, clock: clock.world ? [Math.round(clock.ship), Math.round(clock.world)] : undefined };
    },
    restore(raw) {
      if (!raw || typeof raw !== 'object') return;
      if (STAGES.includes(raw.stage)) stage = raw.stage;
      if (raw.picks && typeof raw.picks === 'object') {
        for (const id of Object.keys(raw.picks)) if (WORLDS.some((w) => w.id === id) && LAYERS.includes(raw.picks[id])) picks[id] = raw.picks[id];
      }
      if (Array.isArray(raw.seen)) for (const w of WORLDS) if (raw.seen.includes(w.id) && !seen.includes(w.id)) seen.push(w.id);
      if (raw.assigned) assigned = true;
      if (raw.home) home = true;
      if (raw.epilogue) epilogue = true;
      if (Array.isArray(raw.clock) && raw.clock.length === 2 && raw.clock.every(Number.isFinite)) [clock.ship, clock.world] = raw.clock;
    },

    // dev (__debug.tenretni.chapter()): jump the story to a stage, either way
    go(s) {
      if (!STAGES.includes(s)) return false;
      stage = s;
      ctx.onSave();
      return true;
    },
    state: () => ({ stage, home, epilogue, picks: { ...picks }, seen: seen.slice(), assigned, clock: { ...clock } }),
  };
}
