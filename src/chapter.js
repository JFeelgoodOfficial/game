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
// The chapter after that (GDD 5.7.7) carries on from `ez_beyond`: the `hz_*`
// stages, ending at `hz_open` (the light ship and its crew in open space, the
// home base of GDD 5.7.8), and its record, `hz`:
//
//   d      what was decided and found: a small bag of scalars, by key
//   lost   captains lost in it, for good (counted with `ez.lost` by crew())
//   cp     the one pending checkpoint: the stage and record as they stood when
//          a decision was shown. Dying restores it; surviving the choice drops it.
//
// Every word comes from world/chapter-dialogue.js and world/entryzero-dialogue.js
// (and, for 5.7.7, a sealed file the chapter's own host reads).

import { addCodex, codexSubjects } from './journal.js';
import { uiSound } from './sfx.js';
import { LAYERS } from '../world/layerplanet.js';
import { C } from './constants.js';
import { WORLDS, CAPTAINS, HOME, SUITE_OFFER, SUITE_ACCEPT, SUITE_WAIT, SUITE_REMIND, RETURN, ARGUMENT, CARRIED } from '../world/chapter-dialogue.js';
import { BANDS, RELICS, OFFER, ERA, LAUNCH } from '../world/entryzero-dialogue.js';

// Append only: a saved stage this list does not hold loads as 'suite'.
export const STAGES = [
  'suite', 'demo', 'holo', 'dive', 'shuttle', 'dream', 'stall', 'canvas', 'birth', 'return', 'done',
  // Entry Zero. `ez_beyond`: inside the hole.
  'ez_offer', 'ez_descent', 'ez_firewall', 'ez_deep', 'ez_centre', 'ez_relics', 'ez_reveal', 'ez_ascent', 'ez_era', 'ez_launch', 'ez_beyond',
  // Past the horizon (GDD 5.7.7). `hz_open` is where it lets go: the light ship
  // and its crew in open space, and every later chapter a system it goes to (5.7.8).
  'hz_bell1', 'hz_bell2', 'hz_bell3', 'hz_bell4', 'hz_bell5', 'hz_bell6', 'hz_bell7', 'hz_bell8', 'hz_bell9', 'hz_bell10',
  'hz_open',
];

// the four sights of the City of Light: the three districts' finds, and the thing built from the drawing
export const SITES = ['seam', 'bell', 'saturday', 'monument'];
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
  const ez = { log: 0, frags: 0, stay: null, lost: [], node: 0, clock: 0, made: false };
  const hz = { d: {}, lost: [], cp: null };
  const scalar = (v) => v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
  const gone = (id) => ez.lost.includes(id) || hz.lost.includes(id);
  // What the pilot does with the city before the Archivist comes down with
  // Entry Zero: flies a race to the end, sees the four things worth seeing,
  // and sleeps a night in the suite. (It used to come the moment the ship had
  // been seen off, before the pilot had lived there at all.)
  let side = null; // whose part the pilot took in the captains' argument (a captain's id), once it is settled
  let raced = false, slept = false;
  const sites = [];
  const settled = () => raced && slept && SITES.every((s) => sites.includes(s));

  const at = (s) => STAGES.indexOf(s);
  function advance(to) {
    if (at(to) <= at(stage)) return false;
    stage = to;
    if (to === 'ez_descent') addCodex('The Lattice'); // what the nodes are, written down the first time one is ridden
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
      // the captains' argument, settled (world/lightpavilion.js asks)
      const sm = /^ch:side:(\w+)$/.exec(tag ?? '');
      if (sm) {
        if (!isCaptain(sm[1]) || side) return null;
        side = sm[1];
        addCodex('The Argument');
        uiSound('engage');
        ctx.onSave();
        const c = CAPTAINS.find((x) => x.id === side);
        return { speaker: { name: c.name, species: c.species, cityId: 'The Pavilion' }, lines: ARGUMENT.reply[side] };
      }
      if (tag === 'ez:accept') {
        if (at(stage) >= at('done') && epilogue && settled() && advance('ez_offer')) {
          uiSound('engage');
          addCodex(OFFER.codex);
        }
        return side ? { ...OFFER.accept, lines: [...OFFER.accept.lines.slice(0, -1), ARGUMENT.accept[side]] } : OFFER.accept;
      }
      if (tag === 'ez:wait') return OFFER.wait;
      // (the launch: the place it is asked at does the going, world/lightcity.js)
      if (tag === 'ez:launch' || tag === 'ez:stay') return null;
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

    // --- the argument (world/lightpavilion.js) ---
    side: () => side,
    // what a captain says in the Pavilion: the quarrel and the question, or what came after
    captainTalk(c, lines) {
      const speaker = { name: c.name, species: c.species, cityId: 'The Pavilion' };
      if (side) return { speaker, lines: ARGUMENT.after[side][c.id] || lines };
      return { speaker, lines, offer: { kind: 'choice', prompt: ARGUMENT.prompt, options: ARGUMENT.options } };
    },
    // the dive's lines, with the one the argument added
    diveLines: (base) => (side ? [...base, ARGUMENT.dive[side]].sort((a, b) => a[0] - b[0]) : base),
    revealAfter: (base) => (side ? ARGUMENT.reveal[side] : base),
    // --- what was carried ---
    // each pick as { world, layer, frag }, in the order taken
    carried: () => Object.keys(picks).map((id) => ({ world: id, layer: picks[id], frag: WORLDS.find((w) => w.id === id).layers[picks[id]], layers: WORLDS.find((w) => w.id === id).layers })),
    // what a captain says of the thing taken from their own world, or null
    carriedLine(capId) {
      const home = { marrow: 'saturnia', lux: 'wavemall prime' }[capId];
      const frag = home && picks[home] ? WORLDS.find((w) => w.id === home).layers[picks[home]] : null;
      return frag && CARRIED.talk[capId] ? CARRIED.talk[capId].replace('{thing}', frag.label.toLowerCase()) : null;
    },
    // The world the picks add up to, as something to race (src/worldRace.js):
    // its sky and its light make it quick, its ground and what is built on it
    // make it hold a line, its life gives it boost. null with nothing taken.
    racer() {
      if (!Object.keys(picks).length) return null;
      const made = {};
      for (const l of LAYERS) made[l] = null;
      for (const id of Object.keys(picks)) made[picks[id]] = WORLDS.find((w) => w.id === id).layers[picks[id]];
      const layers = {};
      for (const l of LAYERS) layers[l] = made[l] || HOME.layers[l];
      return {
        ...CARRIED.racer, layers,
        speed: 0.97 + (made.sky ? 0.06 : 0) + (made.light ? 0.05 : 0),
        grip: 0.95 + (made.ground ? 0.15 : 0) + (made.structures ? 0.12 : 0),
        boost: 0.95 + (made.life ? 0.25 : 0),
        mass: 1 + (made.ground ? 0.1 : 0),
      };
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
      if (Object.keys(picks).length) addCodex(CARRIED.codex);
      // ...and it names what was carried, and whose part the pilot took
      const lines = RETURN.keeper.lines.slice();
      const list = Object.keys(picks).map((id) => WORLDS.find((w) => w.id === id)?.layers[picks[id]]?.label).filter(Boolean);
      if (list.length) lines.splice(lines.length - 1, 0, CARRIED.keeper.replace('{list}', list.join(', ').toLowerCase()));
      if (side) lines.splice(lines.length - 1, 0, ARGUMENT.keeper[side]);
      return { ...RETURN.keeper, lines };
    },

    // --- Entry Zero (GDD 5.7.5) ---
    // The offer can be made: the Keeper has been heard and the ship seen off
    // (the two happen in either order).
    // ...and the pilot has settled in: see `settled`.
    ezOpen: () => at(stage) >= at('done') && epilogue && (settled() || at(stage) >= at('ez_offer')),
    // the three things asked of the pilot first
    markRaced() {
      if (raced) return;
      raced = true;
      ctx.onSave();
    },
    markSlept() {
      if (slept) return;
      slept = true;
      ctx.onSave();
    },
    markSite(id) {
      if (!SITES.includes(id) || sites.includes(id)) return false;
      sites.push(id);
      ctx.onSave();
      return true;
    },
    settling: () => ({ raced, slept, sites: sites.slice(), need: SITES.length, due: at(stage) >= at('done') && epilogue && at(stage) < at('ez_offer') }),
    // the Archivist, at the rail (world/entryoffer.js)
    archivistTalk: () => (at(stage) >= at('ez_era') ? ERA.archivist : at(stage) < at('ez_offer') ? OFFER.ask : OFFER.remind),
    // the light ship, at the gallery, a million years on: the last question
    launchTalk: () => LAUNCH.ask,
    // Entry Zero's last stage: inside the hole (the chapter of GDD 5.7.7 carries on from it)
    setBeyond() {
      if (advance('ez_beyond')) addCodex(LAUNCH.codex);
    },
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
      // What the light ship made has been shown, from the gallery. True the first time.
      madeSeen: () => ez.made,
      seeMade() {
        if (ez.made) return false;
        ez.made = true;
        ctx.onSave();
        return true;
      },
      // the crew's own clock: counted by the places, saved when a stage turns
      clock: () => ez.clock,
      addClock(dt) {
        ez.clock += dt;
      },
    },

    // --- the chapter after (GDD 5.7.7) and the voyage (GDD 5.7.8) ---
    // the captains still aboard, in CAPTAINS order: none at all is a crew too
    crew: () => CAPTAINS.filter((c) => !gone(c.id)),
    lost: gone,
    // the light ship is out in the open: every later chapter starts from here
    open: () => at(stage) >= at('hz_open'),
    setOpen: () => advance('hz_open'),
    hz: {
      get: (k) => (k in hz.d ? hz.d[k] : null),
      set(k, v) {
        if (typeof k !== 'string' || !scalar(v) || hz.d[k] === v) return false;
        hz.d[k] = v;
        ctx.onSave();
        return true;
      },
      lose(id) {
        if (!isCaptain(id) || gone(id)) return false;
        hz.lost.push(id);
        ctx.onSave();
        return true;
      },
      // A decision is being shown. What stands now is what a death puts back;
      // `to` is the door that leads back to the asking (a hop key). Shown
      // again after a death, it is the same checkpoint.
      offer(key, to) {
        if (hz.cp && hz.cp.key === key) return false;
        hz.cp = { key, to: to || null, stage, d: { ...hz.d }, lost: hz.lost.slice() };
        ctx.onSave();
        return true;
      },
      decide(key, option) {
        if (!scalar(option) || hz.d[key] === option) return false;
        hz.d[key] = option;
        ctx.onSave();
        return true;
      },
      // The choice was lived through: it stays made.
      survive(key) {
        if (!hz.cp || (key && hz.cp.key !== key)) return false;
        hz.cp = null;
        ctx.onSave();
        return true;
      },
      pending: () => (hz.cp ? hz.cp.key : null),
      // Died of it: the story is put back to the asking (the one place a
      // stage goes backwards). Returns the door to walk back through, or null
      // when nothing was pending.
      die() {
        const cp = hz.cp;
        if (!cp) return null;
        stage = cp.stage;
        hz.d = { ...cp.d };
        hz.lost = cp.lost.slice();
        ctx.onSave();
        return cp.to;
      },
      state: () => ({ d: { ...hz.d }, lost: hz.lost.slice(), cp: hz.cp ? { key: hz.cp.key, to: hz.cp.to, stage: hz.cp.stage } : null }),
    },

    // --- the save: one small object inside src/tenretni.js's ---
    serialize() {
      if (stage === 'suite' && !seen.length && !side) return undefined;
      const z = ez.log || ez.frags || ez.stay || ez.lost.length || ez.node || ez.clock >= 1 || ez.made
        ? { log: ez.log || undefined, frags: ez.frags || undefined, stay: ez.stay || undefined, lost: ez.lost.length ? ez.lost.slice() : undefined, node: ez.node || undefined, clock: Math.round(ez.clock) || undefined, made: ez.made || undefined }
        : undefined;
      const h = Object.keys(hz.d).length || hz.lost.length || hz.cp
        ? { d: Object.keys(hz.d).length ? { ...hz.d } : undefined, lost: hz.lost.length ? hz.lost.slice() : undefined, cp: hz.cp ? { ...hz.cp, d: { ...hz.cp.d }, lost: hz.cp.lost.slice() } : undefined }
        : undefined;
      return { stage, picks: { ...picks }, seen: seen.slice(), assigned: assigned || undefined, home: home || undefined, epilogue: epilogue || undefined, side: side || undefined, raced: raced || undefined, slept: slept || undefined, sites: sites.length ? sites.slice() : undefined, clock: clock.world ? [Math.round(clock.ship), Math.round(clock.world)] : undefined, ez: z, hz: h };
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
      if (isCaptain(raw.side)) side = raw.side;
      if (raw.raced) raced = true;
      if (raw.slept) slept = true;
      if (Array.isArray(raw.sites)) for (const s of SITES) if (raw.sites.includes(s) && !sites.includes(s)) sites.push(s);
      // saves from before any of this was asked: what can be told was done, was done
      try {
        const best = JSON.parse(localStorage.getItem('fgsf.worldrace') || 'null');
        if (best && best.best && Object.keys(best.best).length) raced = true;
      } catch { /* no record: not raced */ }
      const known = codexSubjects();
      for (const [id, subject] of [['seam', 'The Wall of Names'], ['bell', 'The Ninth Bell'], ['saturday', 'Saturday']]) if (known.includes(subject) && !sites.includes(id)) sites.push(id);
      if (Array.isArray(raw.clock) && raw.clock.length === 2 && raw.clock.every(Number.isFinite)) [clock.ship, clock.world] = raw.clock;
      const z = raw.ez;
      if (z && typeof z === 'object') {
        if (Number.isInteger(z.log)) ez.log = z.log & ALL_BANDS;
        if (Number.isInteger(z.frags)) ez.frags = z.frags & ALL_RELICS;
        if (isCaptain(z.stay)) ez.stay = z.stay;
        if (Array.isArray(z.lost)) for (const c of CAPTAINS) if (z.lost.includes(c.id) && c.id !== ez.stay && !ez.lost.includes(c.id)) ez.lost.push(c.id);
        if (Number.isFinite(z.node) && z.node > 0) ez.node = Math.floor(z.node);
        if (Number.isFinite(z.clock) && z.clock > 0) ez.clock = z.clock;
        if (z.made) ez.made = true;
      }
      const h = raw.hz;
      if (h && typeof h === 'object') {
        const bag = (o, out) => {
          if (o && typeof o === 'object') for (const k of Object.keys(o)) if (scalar(o[k])) out[k] = o[k];
          return out;
        };
        const lostIn = (a) => (Array.isArray(a) ? CAPTAINS.filter((c) => a.includes(c.id) && !ez.lost.includes(c.id)).map((c) => c.id) : []);
        bag(h.d, hz.d);
        hz.lost = lostIn(h.lost);
        const cp = h.cp;
        if (cp && typeof cp === 'object' && typeof cp.key === 'string' && STAGES.includes(cp.stage)) {
          hz.cp = { key: cp.key, to: typeof cp.to === 'string' ? cp.to : null, stage: cp.stage, d: bag(cp.d, {}), lost: lostIn(cp.lost) };
          // (left in the middle of what a choice led to: a scene is not come
          // back into half-way, so it is the asking that is come back to)
          stage = cp.stage;
          hz.d = { ...hz.cp.d };
          hz.lost = hz.cp.lost.slice();
        }
      }
    },

    // dev: who is aboard, whatever the save says (every crew from all three to none can be tried)
    setCrewDebug(ids) {
      ez.lost = [];
      hz.lost = CAPTAINS.filter((c) => !ids.includes(c.id)).map((c) => c.id);
      ctx.onSave();
      return CAPTAINS.filter((c) => !gone(c.id)).map((c) => c.id);
    },
    // dev (__debug.tenretni.chapter()): jump the story to a stage, either way
    go(s) {
      if (!STAGES.includes(s)) return false;
      stage = s;
      ctx.onSave();
      return true;
    },
    state: () => ({ stage, home, epilogue, side, raced, slept, sites: sites.slice(), picks: { ...picks }, seen: seen.slice(), assigned, clock: { ...clock }, ez: { ...ez, lost: ez.lost.slice() }, hz: { d: { ...hz.d }, lost: hz.lost.slice(), cp: hz.cp ? hz.cp.key : null } }),
  };
}
