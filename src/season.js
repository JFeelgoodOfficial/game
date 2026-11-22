// The season record (GDD 5.7.9): what Season 1 remembers across its chapters.
//
// Each chapter keeps its own record under its own id (src/voyage.js). This is
// the one they share, so a decision made in one chapter can be read in a later
// one. It is saved inside `fgsf.voyage`, as `season`, and only once it holds
// something:
//
//   { v: 1,
//     facts:  { '<chapter>.<key>': scalar },          what was decided, counted, said
//     events: { '<fixed event id>': { seen, how, detail } }   src/fixedEvents.js
//     cp:     { key, to, snap } }                     a decision not yet survived
//
// The checkpoint is the rule every chapter of the season plays by: a decision
// is offered (the checkpoint is taken as it is shown), decided, and then either
// survived (the checkpoint is dropped: the choice stays made) or died of (the
// decision is undone and the pilot is stood back at the asking). It is the
// contract `chapter.hz` has in src/chapter.js, kept here for the chapters that
// come after it.
//
//   offer(key, to, snap)   `to`: the door back to the asking. `snap`: whatever
//                          the chapter wants handed back if this is died of
//                          (scalars only). Once per key; asking again is free.
//   decide(key, option)    the fact `key` is set to `option`
//   survive(key)           the next safe beat has been reached
//   pending()              { key, to, snap } | null
//   die()                  -> { key, to, snap } | null, with the decision unmade

const scalar = (v) => v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
const flat = (o) => {
  const out = {};
  if (o && typeof o === 'object') for (const k of Object.keys(o)) if (scalar(o[k])) out[k] = o[k];
  return out;
};

// o: { save() }
export function createSeason(o) {
  let facts = {};
  let events = {};
  let cp = null;
  const save = () => o.save && o.save();

  const api = {
    // --- facts ---
    get: (k) => (k in facts ? facts[k] : null),
    set(k, v) {
      if (typeof k !== 'string' || !scalar(v)) return false;
      if (v === null) {
        if (!(k in facts)) return false;
        delete facts[k];
      } else {
        if (facts[k] === v) return false;
        facts[k] = v;
      }
      save();
      return true;
    },
    // --- fixed events (src/fixedEvents.js reads and writes these) ---
    event: (id) => events[id] || null,
    setEvent(id, rec) {
      events[id] = { ...(events[id] || {}), ...rec };
      save();
    },
    clearEvent(id) {
      if (!events[id]) return;
      delete events[id];
      save();
    },
    eventIds: () => Object.keys(events),
    // --- the decision checkpoint ---
    offer(key, to, snap) {
      if (cp && cp.key === key) return false;
      if (key in facts) return false; // already decided, and survived
      cp = { key, to, snap: flat(snap) };
      save();
      return true;
    },
    decide(key, option) {
      if (!scalar(option) || option === null) return false;
      facts[key] = option;
      save();
      return true;
    },
    survive(key) {
      if (!cp || cp.key !== key) return false;
      cp = null;
      save();
      return true;
    },
    pending: () => (cp ? { key: cp.key, to: cp.to, snap: { ...cp.snap } } : null),
    die() {
      if (!cp) return null;
      const was = { key: cp.key, to: cp.to, snap: { ...cp.snap } };
      delete facts[cp.key];
      // (the checkpoint stays: the pilot is back at the asking, and it is still to be survived)
      save();
      return was;
    },
    // --- the save ---
    serialize() {
      const rec = { v: 1 };
      if (Object.keys(facts).length) rec.facts = { ...facts };
      if (Object.keys(events).length) rec.events = JSON.parse(JSON.stringify(events));
      if (cp) rec.cp = { key: cp.key, to: cp.to, snap: { ...cp.snap } };
      return Object.keys(rec).length > 1 ? rec : undefined;
    },
    // `known`: the event ids there are (anything else in a save is dropped)
    restore(raw, known) {
      facts = {};
      events = {};
      cp = null;
      if (!raw || typeof raw !== 'object') return;
      facts = flat(raw.facts);
      if (raw.events && typeof raw.events === 'object') {
        for (const id of Object.keys(raw.events)) {
          const e = raw.events[id];
          if ((known && !known.includes(id)) || !e || typeof e !== 'object') continue;
          events[id] = { seen: !!e.seen || undefined, how: typeof e.how === 'string' ? e.how : undefined, detail: Object.keys(flat(e.detail)).length ? flat(e.detail) : undefined };
        }
      }
      if (raw.cp && typeof raw.cp === 'object' && typeof raw.cp.key === 'string' && typeof raw.cp.to === 'string') {
        cp = { key: raw.cp.key, to: raw.cp.to, snap: flat(raw.cp.snap) };
      }
    },
    state: () => ({ facts: { ...facts }, events: JSON.parse(JSON.stringify(events)), cp: api.pending() }),
    // dev: everything forgotten
    clear() {
      facts = {};
      events = {};
      cp = null;
      save();
    },
  };
  return api;
}
