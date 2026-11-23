// The Forecast of Love: Season 1, chapter 9 (GDD 5.7.9; plans/season-1-arc.md).
// The pilot's chapter.
//
// It is played where chapters 4 and 5 are, the free port, and aboard the light
// ship, so it is a third stage machine of that system (world/concourse-system.js
// keeps its stage in the same record and offers its debrief by `key`). This
// file is the chapter itself: what the envoy says at the bar, where she is
// aboard, and the doors to its two places of its own (world/love-places.js).
// Its words are world/love-dialogue.js.
//
// The stages, forward only (it opens once chapter 5 has been talked over):
//   idle       not begun
//   forecast   the fixed event's forecast has been shown, on the port's deck:
//              she will leave her people (src/fixedEvents.js `defection`)
//   asked      at the bar she has asked to be shown a world, and gone aboard
//   hill       the holodeck: the ski hill has been skied, with her
//   told       at the bottom she has said what the engine forecast for her
//   dinner     the long table on the crew deck, with whoever is aboard
//   patio      on the freighter's patio: asked for nothing, or for what she knows
//   done       first bell; the shuttle has gone without her
//
// Aboard, she is a guest (src/voyage.js `aboard(room)`): in the archive she
// waits by the holodeck and its console opens the hill; on the crew deck she
// sits at the table for the meal (world/basedeck.js `ctx.guest`), and
// afterwards there is a way aft to the patio.
//
// Nothing here can kill the pilot, so the one decision is offered, made and
// survived in one step (src/season.js). The fixed event is resolved by it:
// 'trusts' or 'wary'. Either way she stays (`ch9.ione`: 'stayed').

import { C } from '../src/constants.js';
import { chapterHud } from '../src/chapterHud.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { uiSound } from '../src/sfx.js';
import { poseRig } from './aliens.js';
import { standRig } from './rigGround.js';
import { createLoveHill, createLovePatio, envoyRig } from './love-places.js';
import { LOVE } from './love-dialogue.js';

export const LOVE_STAGES = ['idle', 'forecast', 'asked', 'hill', 'told', 'dinner', 'patio', 'done'];
const KEY = 'ch9.why';

// ctx: the system's. S: the port's story (world/concourse-system.js): st9(), reached9(s), adv9(s), open9().
export function createLove(ctx, S) {
  const { chapter, season, fixed } = ctx;
  const L = {
    stage: () => S.st9(),
    reached: (s) => S.reached9(s),
    advance: (s) => S.adv9(s),
    how: () => fixed.outcome('defection')?.how || null,
    offer: () => season.offer(KEY, 'love:patio', { stage: 'dinner' }),
    decide(how) {
      if (S.st9() !== 'dinner' || (how !== 'trusts' && how !== 'wary')) return false;
      season.offer(KEY, 'love:patio', { stage: 'dinner' });
      season.decide(KEY, how === 'trusts' ? 'nothing' : 'engine');
      season.survive(KEY); // (nothing here can kill: the choice is lived through as it is made)
      fixed.resolve('defection', how, { asked: how === 'trusts' ? 'nothing' : 'engine' });
      season.set('ch9.ione', 'stayed');
      uiSound('engage');
      return S.adv9('patio');
    },
  };
  let hill = null, patio = null, broken = false;
  const build = (make) => {
    try {
      return make(ctx, L);
    } catch (err) {
      broken = true;
      console.warn('[voyage] a place of chapter 9 could not be built', err);
      return null;
    }
  };
  const getHill = () => hill || (broken ? null : (hill = build(createLoveHill)));
  const getPatio = () => patio || (broken ? null : (patio = build(createLovePatio)));

  // --- the port's deck: the forecast, and her at the bar ---
  let forecastOpen = false;
  function onDeck(queue) {
    if (!S.open9() || S.st9() !== 'idle' || forecastOpen || isDialogueOpen()) return;
    forecastOpen = true;
    openDialogue(fixed.forecast('defection'), {
      onClose: () => {
        forecastOpen = false;
        S.adv9('forecast');
      },
    });
    void queue;
  }
  // what she says at the bar, in this chapter (null: the port's own line)
  function envoyTalk(queue) {
    if (S.st9() !== 'forecast') return null;
    S.adv9('asked');
    if (queue) queue(LOVE.askCrew);
    return { speaker: LOVE.envoy, lines: LOVE.ask, cine: true };
  }

  // --- aboard: the archive, by the holodeck ---
  const archiveRig = envoyRig();
  let archive = null, archiveConsoles = [], archivePanel = null;
  const archiveGuest = {
    active: () => S.reached9('asked') && !S.reached9('dinner'),
    consoles: () => archiveConsoles,
    enter(site) {
      archive = site;
      // a few steps into the hall from the holodeck's plinth, where she has been looking at the rooms
      const at = site.atHolo ? [site.atHolo.x + 2.6, site.atHolo.z - 3.4] : [3, 20];
      archiveRig.group.position.set(at[0], 0, at[1]);
      site.group.add(archiveRig.group);
      archiveConsoles = [{ x: at[0] - 1.6, y: 0, z: at[1], r: 2.2, prompt: LOVE.prompts.holo, off: () => S.reached9('told'), use: () => ((site.portal = 'love:hill'), null) }];
      archivePanel = null;
    },
    leave() {
      if (archive) archive.group.remove(archiveRig.group);
      archive = null;
      archiveConsoles = [];
      if (archivePanel != null) chapterHud.panel(null);
      archivePanel = null;
    },
    tick(dt, t, walker) {
      if (!archive) return;
      const g = archiveRig.group.position;
      if (walker) archiveRig.group.rotation.y = Math.atan2(walker.x - g.x, walker.z - g.z);
      poseRig(archiveRig, Math.min(dt, 0.1), t, 'idle', 0);
      standRig(archiveRig, 0);
      const text = S.reached9('told') ? LOVE.hud.dinner : null;
      if (text !== archivePanel) chapterHud.panel((archivePanel = text));
    },
    at: () => (archive ? [archiveRig.group.position.x, archiveRig.group.position.z] : null),
  };

  // --- aboard: the crew deck. She sits down to eat; afterwards there is a way aft. ---
  const deckRig = envoyRig();
  let deckConsoles = [], deckSite = null;
  const deckGuest = {
    active: () => S.reached9('told') && !S.reached9('done'),
    consoles: () => deckConsoles,
    enter(site) {
      deckSite = site;
      deckConsoles = [{ x: site.spawn.x + 3.2, y: 0, z: site.spawn.z + 1.5, r: 1.7, prompt: 'E — AFT, TO THE PATIO', off: () => !S.reached9('dinner'), use: () => ((site.portal = 'love:patio'), null) }];
    },
    leave() {
      deckSite = null;
      deckConsoles = [];
    },
    tick() {},
    // The meal, with her at the table: { rig, T, lines: [[seconds, who | null, text]], done() -> a door | null } | null.
    // `here`: the ids of the captains sat down.
    dinner(here) {
      if (S.st9() !== 'told') return null;
      const crew = chapter.crew().filter((c) => here.includes(c.id));
      const lines = [];
      for (const [sec, who, text] of LOVE.dinner) {
        if (who === 'envoy') lines.push([sec, LOVE.short, text]);
        else {
          const by = crew.find((c) => c.id === who.by) || crew[0];
          if (by) lines.push([sec, by.short, by.id !== who.by && who.other && who.other[by.id] ? who.other[by.id] : who.text]);
        }
      }
      // (a table of two: one more thing of hers in the quiet where the captains would have spoken)
      if (!crew.length) lines.splice(1, 0, [10, LOVE.short, LOVE.dinnerAlone]);
      return {
        rig: deckRig, T: C.LOVE_DINNER_T, lines,
        done() {
          S.adv9('dinner');
          chapterHud.say(LOVE.dinnerEnd, 7);
          return 'love:patio';
        },
      };
    },
  };

  return {
    L,
    onDeck,
    envoyTalk,
    // she has left the bar for good once she has gone aboard
    envoyAway: () => S.reached9('asked'),
    mark: (place) => (place === 'hub' && S.st9() === 'forecast' ? LOVE.marks.bar : null),
    panel(place) {
      const st = S.st9();
      if (place !== 'hub') return null;
      return st === 'forecast' ? LOVE.hud.bar : st === 'asked' || st === 'hill' ? LOVE.hud.home : st === 'told' ? LOVE.hud.dinner : null;
    },
    aboard: (room) => (room === 'archive' && archiveGuest.active() ? archiveGuest : room === 'deck' && deckGuest.active() ? deckGuest : null),
    hop(key) {
      if (key === 'love:hill') {
        const s = getHill();
        return s ? { site: s, spawn: s.spawn, yaw: s.spawnYaw, look: 'dive' } : null;
      }
      if (key === 'love:patio') {
        const s = getPatio();
        return s ? { site: s, spawn: s.spawn, yaw: s.spawnYaw, look: 'dive' } : null;
      }
      return null;
    },
    door() {
      for (const s of [hill, patio]) {
        if (!s || !s.inside() || !s.portal) continue;
        const to = s.portal;
        s.portal = null;
        return to;
      }
      return null;
    },
    talk: (captainId) => (S.reached9('asked') && !S.reached9('done') ? LOVE.talk[captainId] || null : null),
    debrief() {
      const D = LOVE.debrief;
      const how = L.how() === 'wary' ? D.wary : D.trusts;
      return { key: 'love', title: D.title, complete: D.complete, lines: [D.open, ...D.body, how, ...D.tail, D.close], nextCourse: D.nextCourse, nextNone: D.nextNone };
    },
    state: () => ({ how: L.how(), ione: season.get('ch9.ione'), hill: hill ? hill.info() : null, patio: patio ? patio.info() : null, archive: archiveGuest.at(), places: { hill: hill ? hill.places : null, patio: patio ? patio.places : null } }),
    hill: () => hill,
    patio: () => patio,
    deckGuest,
    archiveGuest,
  };
}
