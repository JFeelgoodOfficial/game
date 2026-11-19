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
//
// Entry Zero (GDD 5.7.5) carries on from `done` once the epilogue has played:
// the `ez_*` stages, and one more small record, `ez`:
//
//   log     bands of the lamp something has been looked at in (a bitmask)
//   frags   relics found on the first world (a bitmask)
//   stay    the captain left aboard over the first world
//   lost    captains who stepped out of the light there, for good
//   node    the lattice node the submersible last rode in on
//   clock   the crew's own seconds below
//
// Every word comes from world/chapter-dialogue.js and world/entryzero-dialogue.js.

import { addCodex } from './journal.js';
import { uiSound } from './sfx.js';
import { LAYERS } from '../world/layerplanet.js';
import { C } from './constants.js';
import { WORLDS, CAPTAINS, SUITE_OFFER, SUITE_ACCEPT, SUITE_WAIT, SUITE_REMIND, RETURN } from '../world/chapter-dialogue.js';
import { BANDS, RELICS, OFFER, ERA } from '../world/entryzero-dialogue.js';

// Append only: a saved stage this list does not hold loads as 'suite'.
export const STAGES = [
  'suite', 'demo', 'holo', 'dive', 'shuttle', 'dream', 'stall', 'canvas', 'birth', 'return', 'done',
  // Entry Zero. `ez_beyond` is the open end: inside the hole, nothing built past it.
  'ez_offer', 'ez_descent', 'ez_firewall', 'ez_deep', 'ez_centre', 'ez_relics', 'ez_reveal', 'ez_ascent', 'ez_era', 'ez_launch', 'ez_beyond',
];

const ALL_BANDS = (1 << BANDS.length) - 1;
const ALL_RELICS = (1 << RELICS.length) - 1;
const isCaptain = (id) => CAPTAINS.some((c) => c.id === id);

// ctx: { onSave() — the story's one save (src/tenretni.js) }
export function createChapter(ctx) {
  let stage = 'suite';
  const picks = {};
  const seen = [];
  let assigned = false;
  let epilogue = false; // the captains have seen what was built, and the ship leave again
  let home = false; // the light ship is back in its hangar, a long time later
  const clock = { ship: 0, world: 0 }; // what the two clocks read when the ship was down
  const ez = { log: 0, frags: 0, stay: null, lost: [], node: 0, clock: 0 };

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
      if (tag === 'ez:accept') {
        if (at(stage) >= at('done') && epilogue && advance('ez_offer')) {
          uiSound('engage');
          addCodex(OFFER.codex);
        }
        return OFFER.accept;
      }
      if (tag === 'ez:wait') return OFFER.wait;
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

    // --- Entry Zero (GDD 5.7.5) ---
    // The offer can be made: the Keeper has been heard and the ship seen off
    // (the two happen in either order).
    ezOpen: () => at(stage) >= at('done') && epilogue,
    // the Archivist, at the rail (world/entryoffer.js)
    archivistTalk: () => (at(stage) >= at('ez_era') ? ERA.archivist : at(stage) < at('ez_offer') ? OFFER.ask : OFFER.remind),
    // the three clocks, in a line, said on coming back into the city a million years on
    eraLine() {
      const m = Math.max(1, Math.round(ez.clock / 60));
      return ERA.clocks.replace('{ship}', `${C.EZ_SHIP_YEARS.toLocaleString('en-US')} YEARS`).replace('{world}', `${C.EZ_YEARS_GONE.toLocaleString('en-US')} YEARS`).replace('{crew}', `${m} MINUTE${m === 1 ? '' : 'S'}`);
    },
    ez: {
      // Something has been looked at in band `i` (BANDS). True the first time.
      log(i) {
        const bit = 1 << i;
        if (!(bit & ALL_BANDS) || ez.log & bit) return false;
        ez.log |= bit;
        ctx.onSave();
        return true;
      },
      logged: (i) => !!(ez.log & (1 << i)),
      logFull: () => ez.log === ALL_BANDS,
      // A relic's fragment of the story has been saved. True the first time.
      find(i) {
        const bit = 1 << i;
        if (!(bit & ALL_RELICS) || ez.frags & bit) return false;
        ez.frags |= bit;
        ctx.onSave();
        return true;
      },
      found: (i) => !!(ez.frags & (1 << i)),
      foundAll: () => ez.frags === ALL_RELICS,
      foundCount() {
        let n = 0;
        for (let i = 0; i < RELICS.length; i++) if (ez.frags & (1 << i)) n++;
        return n;
      },
      // The pilot's choice over the first world: one captain, once.
      stay: () => ez.stay,
      setStay(id) {
        if (ez.stay || !isCaptain(id)) return false;
        ez.stay = id;
        ctx.onSave();
        return true;
      },
      // A captain outside the light is gone for good.
      lose(id) {
        if (!isCaptain(id) || ez.lost.includes(id)) return false;
        ez.lost.push(id);
        ctx.onSave();
        return true;
      },
      isLost: (id) => ez.lost.includes(id),
      lostCount: () => ez.lost.length,
      node: () => ez.node,
      setNode(n) {
        if (!Number.isFinite(n) || n <= ez.node) return;
        ez.node = Math.floor(n);
        ctx.onSave();
      },
      // the crew's own clock: counted by the places, saved when a stage turns
      clock: () => ez.clock,
      addClock(dt) {
        ez.clock += dt;
      },
    },

    // --- the save: one small object inside src/tenretni.js's ---
    serialize() {
      if (stage === 'suite' && !seen.length) return undefined;
      const z = ez.log || ez.frags || ez.stay || ez.lost.length || ez.node || ez.clock >= 1
        ? { log: ez.log || undefined, frags: ez.frags || undefined, stay: ez.stay || undefined, lost: ez.lost.length ? ez.lost.slice() : undefined, node: ez.node || undefined, clock: Math.round(ez.clock) || undefined }
        : undefined;
      return { stage, picks: { ...picks }, seen: seen.slice(), assigned: assigned || undefined, home: home || undefined, epilogue: epilogue || undefined, clock: clock.world ? [Math.round(clock.ship), Math.round(clock.world)] : undefined, ez: z };
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
      const z = raw.ez;
      if (z && typeof z === 'object') {
        if (Number.isInteger(z.log)) ez.log = z.log & ALL_BANDS;
        if (Number.isInteger(z.frags)) ez.frags = z.frags & ALL_RELICS;
        if (isCaptain(z.stay)) ez.stay = z.stay;
        if (Array.isArray(z.lost)) for (const c of CAPTAINS) if (z.lost.includes(c.id) && c.id !== ez.stay && !ez.lost.includes(c.id)) ez.lost.push(c.id);
        if (Number.isFinite(z.node) && z.node > 0) ez.node = Math.floor(z.node);
        if (Number.isFinite(z.clock) && z.clock > 0) ez.clock = z.clock;
      }
    },

    // dev (__debug.tenretni.chapter()): jump the story to a stage, either way
    go(s) {
      if (!STAGES.includes(s)) return false;
      stage = s;
      ctx.onSave();
      return true;
    },
    state: () => ({ stage, home, epilogue, picks: { ...picks }, seen: seen.slice(), assigned, clock: { ...clock }, ez: { ...ez, lost: ez.lost.slice() } }),
  };
}
