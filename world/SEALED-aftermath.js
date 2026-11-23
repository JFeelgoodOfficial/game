// SEALED. Chapter one of the voyage (plans/season-1-arc.md: "Aftermath"), as
// what the first system has in it (src/systems.js: the entry whose place is
// world/SEALED-horizon-place.js). It answers the chapter of GDD 5.7.7, so its
// words are sealed with that chapter's: world/SEALED-aftermath-words.js.
//
// Nothing is flown to and nobody is met. The ship is where that chapter left
// it, and what there is to do is count what is left aboard:
//
//   a cabin      on the crew deck: the first lost captain's, or the pilot's own
//   the table    on the crew deck: how many places are laid
//   the dark row in the archive: the record that was put down
//
// (guests of those rooms, through src/voyage.js `aboard`). Counted, the next
// time the pilot is on the bridge it is talked over (`debrief()`), and only
// then will the helm chart show anything (`aboard('helm')`: src/homebase.js).
//
// Stages: a1 (nothing counted) -> a2 (all three) -> a3 (talked over; the chart
// is open). A save that has already been somewhere else when this chapter
// first exists is taken as a3 and never asked for any of it.
//
// It reads the record of the chapter before it through that chapter's own
// `facts()` (world/SEALED-horizon-ship.js) and `chapter.hz`.

import { chapterHud } from '../src/chapterHud.js';
import { logChime } from './entryzero-audio.js';
import { CAPTAINS } from './chapter-dialogue.js';
import { facts } from './SEALED-horizon-ship.js';
import { AFTER1 } from './SEALED-aftermath-words.js';

export const AFTERMATH_STAGES = ['a1', 'a2', 'a3'];

// ctx: { scene, camera, chapter, voyage, sunDir, save(), crewTalk(captain), season, fixed }
export function createAftermath(ctx) {
  const { chapter, season } = ctx;
  let seen = 0; // one bit for each of the three things counted
  let shown = false; // the chart has filled once
  // (a voyage already under way when this chapter first exists: nothing is asked of it)
  const skipped = ctx.voyage.visited().length > 1;
  const stage = () => (skipped || season.get('debrief.horizon') ? 'a3' : seen === 7 ? 'a2' : 'a1');
  const count = () => [1, 2, 4].filter((b) => seen & b).length;

  // --- what the record says, in this chapter's words ---
  const lostId = () => CAPTAINS.map((c) => c.id).find((id) => chapter.lost(id)) || null;
  const fill = (l, v) => l.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
  function vars() {
    const f = facts(chapter);
    const id = lostId();
    const who = id ? CAPTAINS.find((c) => c.id === id) : null;
    return { f, who: who ? who.short : '', whoId: id, here: !!id && chapter.hz.state().lost.includes(id), name: f.name || 'A WORLD', n: chapter.crew().length + 1 };
  }
  function linesOf(i) {
    const v = vars();
    let l;
    if (i === 0) l = v.whoId ? (v.here ? AFTER1.cabin.lostHere : AFTER1.cabin.lostBefore) : AFTER1.cabin.none;
    else if (i === 1) l = [...(chapter.crew().length ? AFTER1.table.crew : AFTER1.table.alone), ...(v.f.woke ? AFTER1.table.woke : AFTER1.table.kept)];
    else l = v.f.fellHome ? AFTER1.row.home : AFTER1.row.plain;
    return l.map((x) => fill(x, v));
  }
  function look(i) {
    if (!(seen & (1 << i))) {
      seen |= 1 << i;
      logChime();
      ctx.save();
    }
    return { speaker: AFTER1.speaker, lines: linesOf(i), cine: true };
  }

  // --- a guest in a room of the ship: its consoles, and the corner of the screen ---
  function guest(room) {
    let consoles = [], panelText = null;
    return {
      active: () => stage() !== 'a3',
      consoles: () => consoles,
      enter(site) {
        consoles = [];
        if (room === 'deck') {
          const q = site.places.quarters, id = lostId() || 'pilot';
          const at = q[id] || q.pilot, t = site.places.lounge;
          // (in the corridor at the cabin's door, and at the table's end: clear of the deck's own consoles)
          consoles.push({ x: at[0], y: 0, z: -1.2, r: 1.5, prompt: AFTER1.prompts[0], off: () => stage() === 'a3', use: () => look(0) });
          consoles.push({ x: t[0] + 4.2, y: 0, z: t[2] - 1.6, r: 1.5, prompt: AFTER1.prompts[1], off: () => stage() === 'a3' || !!(seen & 2), use: () => look(1) });
        } else {
          const aft = site.places.aft;
          consoles.push({ x: -2.2, y: 0, z: aft[2] - 2, r: 2.0, prompt: AFTER1.prompts[2], off: () => stage() === 'a3', use: () => look(2) });
        }
        panelText = null;
      },
      leave() {
        consoles = [];
        if (panelText != null) chapterHud.panel(null);
        panelText = null;
      },
      tick() {
        const st = stage();
        const left = [0, 1, 2].filter((i) => !(seen & (1 << i))).map((i) => AFTER1.hud.where[i]);
        const text = st === 'a1' ? `${AFTER1.hud.stock}${count()} / 3\n${left.join('\n')}` : st === 'a2' ? AFTER1.hud.bridge : null;
        if (text !== panelText) chapterHud.panel((panelText = text));
      },
      places: () => consoles.map((c) => [c.x, c.z]),
    };
  }
  const guests = { deck: guest('deck'), archive: guest('archive') };
  // the helm: nothing to chart until it has been talked over; and then, once, the chart filling
  const helm = {
    refuse: () => (stage() === 'a3' ? null : AFTER1.notYet),
    before() {
      if (skipped || shown) return [];
      shown = true;
      ctx.save();
      return AFTER1.first;
    },
  };

  return {
    docks: [],
    planets: [],
    aboard: (room) => (room === 'helm' ? helm : guests[room] && guests[room].active() ? guests[room] : null),
    talk: () => null,
    // counted: the captains talk it over, the first time the pilot is on the bridge
    debrief() {
      if (stage() !== 'a2') return null;
      const v = vars(), D = AFTER1.debrief;
      const burn = chapter.hz.get('n4');
      const lines = [D.open, D.clock, typeof burn === 'number' && burn < 26269 ? D.burnLong : D.burnGood, v.f.fellHome ? D.fellHome : D.fell];
      if (v.whoId && v.here) lines.push(D.lost);
      lines.push(v.f.woke ? D.woke : D.kept, D.awe, D.close);
      return { title: AFTER1.title, complete: D.complete, lines: lines.map(([id, text]) => [id, fill(text, v)]), nextCourse: D.next, nextNone: D.next };
    },
    serialize: () => (seen || shown ? { seen, shown: shown || undefined } : undefined),
    restore(raw) {
      if (!raw || typeof raw !== 'object') return;
      if (Number.isFinite(raw.seen)) seen = raw.seen & 7;
      shown = !!raw.shown;
    },
    state: () => ({ stage: stage(), seen, shown, skipped, lost: lostId(), places: { deck: guests.deck.places(), archive: guests.archive.places() } }),
    // dev: jump the stage
    go(s) {
      if (!AFTERMATH_STAGES.includes(s)) return false;
      seen = s === 'a1' ? 0 : 7;
      shown = false;
      season.set('debrief.horizon', s === 'a3' ? true : null);
      ctx.save();
      return true;
    },
    look,
  };
}
