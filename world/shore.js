// Shore Leave: Season 1, chapter 14, the last (GDD 5.7.9; plans/season-1-arc.md).
//
// The season's ending, as places: the bar at the free port, arguing about what
// a second is worth now that nobody can forecast one; dinner at the light
// ship's long table with whoever made it; the archive, with what it has
// gained and lost; and the helm chart, with a blank part on it.
//
// A fifth chapter in the port's system (world/concourse-system.js): this file
// is its stage machine and its guests aboard (src/voyage.js `aboard`), and
// world/shore-dialogue.js its words. It opens once the season's finale has
// been played and talked over (`S.open14()`).
//
//   idle      not begun
//   bar       the argument at the bar has been heard
//   dinner    the long table (the crew deck's own SIT DOWN TO EAT, as this chapter's meal)
//   counted   the archive has been looked at: what it holds now
//   done      talked over on the bridge (derived: `counted`, and the season fact `debrief.shore`). The season is complete. At the helm, once: the next blank sky.
//
// It reads how the season went and decides nothing: no choice is offered here.

import * as THREE from 'three';
import { chapterHud } from '../src/chapterHud.js';
import { logChime } from './entryzero-audio.js';
import { buildRig } from './aliens.js';
import { measureRig } from './rigGround.js';
import { SHORE } from './shore-dialogue.js';

export const SHORE_STAGES = ['idle', 'bar', 'dinner', 'counted', 'done'];

// ctx: the system's. S: the port's story: st14(), adv14(s), open14().
export function createShore(ctx, S) {
  const { chapter, season, fixed } = ctx;
  let shown = false; // the helm's last lines have been said
  const how = () => (fixed.outcome('merger')?.how === 'curious' ? 'curious' : 'blind');
  const ione = () => season.get('ch13.ione') || 'gone';
  // her, at the table, if she is aboard (the figure the port's bar has: the same seed)
  let rig = null;
  const guestRig = () => {
    if (ione() !== 'aboard') return { group: new THREE.Group() };
    if (!rig) rig = measureRig(buildRig(0x10e7e, 'concourse'));
    return rig;
  };

  // --- the bar ---
  function barTalk() {
    if (!S.open14() || S.st14() !== 'idle') return null;
    S.adv14('bar');
    return { speaker: SHORE.barkeep, lines: [...SHORE.bar.open, ...SHORE.bar[how()], ...SHORE.bar.close], cine: true };
  }

  // --- aboard: the table, then the archive ---
  const deckGuest = {
    active: () => S.st14() === 'bar',
    consoles: () => [],
    enter() {},
    leave() {
      chapterHud.panel(null);
    },
    tick() {},
    dinner(here) {
      if (S.st14() !== 'bar') return null;
      const crew = chapter.crew().filter((c) => here.includes(c.id));
      const withHer = ione() === 'aboard';
      let lines = [];
      if (!crew.length && !withHer) lines = SHORE.dinnerAlone.map(([sec, , text]) => [sec, null, text]);
      else {
        for (const [sec, who, text] of SHORE.dinner) {
          if (who === 'envoy') {
            if (withHer) lines.push([sec, SHORE.envoyShort, text]);
          } else {
            const by = crew.find((c) => c.id === who.by) || crew[0];
            if (by) lines.push([sec, by.short, by.id !== who.by && who.other && who.other[by.id] ? who.other[by.id] : who.text]);
          }
        }
      }
      return {
        rig: guestRig(), T: SHORE.dinnerT, lines,
        done() {
          S.adv14('dinner');
          chapterHud.say(SHORE.dinnerEnd, 7);
          return null;
        },
      };
    },
  };
  function holds() {
    const A = SHORE.archive;
    const lines = [A.open];
    const c11 = season.get('ch11.choice');
    if (A[c11]) lines.push(A[c11]);
    const c3 = season.get('ch3.decision');
    if (c3) lines.push(c3 === 'show' ? A.callers : A.noCallers);
    lines.push(season.get('ch13.core') === 'fed' ? A.fed : A.kept, A.close);
    return lines;
  }
  let archiveConsoles = [], panelText = null, ring = null, ringSite = null;
  const ARCHIVE_AT = { x: -2.2, dz: -2 }; // across the hall from the holodeck, by the aft door
  const archiveGuest = {
    active: () => S.st14() === 'dinner',
    consoles: () => archiveConsoles,
    // the compass points here until it has been looked at
    mark: () => (S.st14() === 'dinner' && ringSite ? { x: ARCHIVE_AT.x, z: ringSite.places.aft[2] + ARCHIVE_AT.dz, label: SHORE.marks.archive } : null),
    enter(site) {
      const aft = site.places.aft;
      // a lit ring on the floor where to stand
      if (!ring) {
        ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.07, 6, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.35, 2.0), fog: false }));
      }
      ring.position.set(ARCHIVE_AT.x, 0.06, aft[2] + ARCHIVE_AT.dz);
      ring.visible = S.st14() === 'dinner';
      site.group.add(ring);
      ringSite = site;
      archiveConsoles = [{
        x: ARCHIVE_AT.x, y: 0, z: aft[2] + ARCHIVE_AT.dz, r: 2.0, prompt: SHORE.prompts.archive, off: () => S.st14() !== 'dinner',
        use() {
          S.adv14('counted');
          logChime();
          return { speaker: SHORE.ship, lines: holds(), cine: true };
        },
      }];
      panelText = null;
    },
    leave() {
      archiveConsoles = [];
      if (ring && ringSite) ringSite.group.remove(ring);
      ringSite = null;
      if (panelText != null) chapterHud.panel(null);
      panelText = null;
    },
    tick(dt, t) {
      if (ring) {
        ring.visible = S.st14() === 'dinner';
        ring.material.color.setRGB(1.5, 1.35, 2.0).multiplyScalar(0.75 + 0.25 * Math.sin((t || 0) * 2.4));
      }
      const text = S.st14() === 'dinner' ? SHORE.hud.archive : S.st14() === 'counted' ? SHORE.hud.bridge : null;
      if (text !== panelText) chapterHud.panel((panelText = text));
    },
  };
  // the helm, once it has all been talked over: the next blank sky
  const helm = {
    refuse: () => null,
    before() {
      if (S.st14() !== 'done' || shown) return [];
      shown = true;
      ctx.save();
      return SHORE.helm;
    },
  };

  return {
    barTalk,
    barOpen: () => S.open14() && S.st14() === 'idle',
    mark: () => (S.open14() && S.st14() === 'idle' ? SHORE.marks.bar : null),
    panel(place) {
      if (place !== 'hub' || !S.open14()) return null;
      const st = S.st14();
      return st === 'idle' ? SHORE.hud.bar : st === 'bar' ? SHORE.hud.home : st === 'dinner' ? SHORE.hud.archive : st === 'counted' ? SHORE.hud.bridge : null;
    },
    aboard: (room) => (room === 'deck' && deckGuest.active() ? deckGuest : room === 'archive' && (archiveGuest.active() || S.st14() === 'counted') ? archiveGuest : room === 'helm' && S.st14() === 'done' && !shown ? helm : null),
    // the season, talked over: the last debrief, and its card
    debrief() {
      if (S.st14() !== 'counted') return null;
      const D = SHORE.debrief;
      return { key: 'shore', title: D.title, complete: D.complete, lines: [D.open, ...D.body, D[how()], D.ione[ione()] || D.ione.gone, D.close], nextCourse: D.next, nextNone: D.next };
    },
    serialize: () => (shown ? { shown: true } : undefined),
    restore(raw) {
      shown = !!(raw && raw.shown);
    },
    state: () => ({ how: how(), ione: ione(), shown, holds: holds() }),
  };
}
