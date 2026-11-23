// Appraisal: the archive, walked for what was touched (GDD 5.7.9; Season 1,
// chapter 5).
//
// The light ship's archive is its own place (world/lightship.js; six rooms,
// five plinths in each). While this chapter has it robbed, this is a guest in
// it: the archive asks the system the ship is in whether anyone is aboard
// (src/voyage.js `aboard`), and takes that guest's consoles before its own.
//
// Three plinths were handled (APPR_TOUCHED: room, plinth). On walking into a
// room the count is said: all five as they were, or one of them not. E at a
// plinth looks at it. A touched one has a broken seal that can be seen from
// across the room once it has been noticed, and gives up one thing about who
// did it. Three of them, and Vask has the berth.

import * as THREE from 'three';
import { APPR_TOUCHED } from '../src/constants.js';
import { chapterHud } from '../src/chapterHud.js';
import { isDialogueOpen } from '../src/dialogue.js';
import { logChime } from './entryzero-audio.js';
import { crewSay } from './sceneClock.js';
import { APPR } from './appraisal-dialogue.js';

const ROOM_NEAR = 9.5;

// ctx: the system's. S: its story (world/concourse-system.js).
export function createArchiveGuest(ctx, S) {
  const { chapter } = ctx;
  const marks = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(0.74, 0.05, 6, 28).rotateX(Math.PI / 2);
  let site = null, rooms = [], consoles = [], counted = [], panelText = null, entered = false;
  const later = [];
  const say = (line, sec) => crewSay(chapter, line, sec);
  const touchedIn = (r) => APPR_TOUCHED.map((t, i) => ({ t, i })).filter((o) => o.t[0] === r);
  const key = (r, k) => APPR_TOUCHED.findIndex((t) => t[0] === r && t[1] === k);

  function look(r, k) {
    const i = key(r, k);
    if (i < 0 || S.touched(i)) {
      chapterHud.say(APPR.untouched, 3.5);
      return null;
    }
    const n = S.findTouched(i); // how many have now been found
    const clue = APPR.clues[Math.min(n, APPR.clues.length) - 1];
    logChime();
    chapterHud.say(clue.find, 6);
    later.push(clue.line);
    marks.children[i].material.color.setRGB(1.6, 1.6, 1.7);
    if (n >= APPR_TOUCHED.length) {
      S.adv5('tracked');
      later.push(APPR.tracked);
    }
    return null;
  }

  return {
    // Is the archive this chapter's, just now?
    active: () => S.st5() === 'robbed',
    consoles: () => consoles,
    enter(archive) {
      site = archive;
      const frags = archive.info().frags; // [room][plinth] = [x, z]
      rooms = frags.map((ps) => ({ ps, cx: ps.reduce((a, p) => a + p[0], 0) / ps.length, cz: ps.reduce((a, p) => a + p[1], 0) / ps.length }));
      counted = rooms.map(() => false);
      consoles = [];
      rooms.forEach((room, r) => room.ps.forEach(([x, z], k) => consoles.push({ x, y: 0, z, r: 2.3, prompt: APPR.prompts.check, off: () => S.st5() !== 'robbed', use: () => look(r, k) })));
      // the broken seals: dull red, until each is looked at
      while (marks.children.length) marks.remove(marks.children[0]);
      APPR_TOUCHED.forEach(([r, k], i) => {
        const [x, z] = rooms[r].ps[k];
        const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: S.touched(i) ? new THREE.Color(1.6, 1.6, 1.7) : new THREE.Color(1.5, 0.22, 0.16), fog: false }));
        m.position.set(x, 1.34, z);
        marks.add(m);
      });
      archive.group.add(marks);
      later.length = 0;
      panelText = null;
      entered = false;
    },
    leave() {
      if (site) site.group.remove(marks);
      site = null;
      consoles = [];
      if (panelText != null) chapterHud.panel(null);
      panelText = null;
    },
    tick(dt, t, walker) {
      if (!site || !walker) return;
      const live = S.st5() === 'robbed';
      marks.visible = live || S.reached5('tracked');
      marks.children.forEach((m, i) => {
        if (!S.touched(i)) m.material.color.setRGB(1.5 * (0.55 + 0.45 * Math.sin(t * 5 + i)), 0.22, 0.16);
      });
      if (live && !entered && !isDialogueOpen()) {
        entered = true;
        chapterHud.say(APPR.enter, 8);
      }
      // the count, on walking into a room
      if (live) {
        rooms.forEach((room, r) => {
          if (counted[r] || Math.hypot(walker.x - room.cx, walker.z - room.cz) > ROOM_NEAR) return;
          counted[r] = true;
          later.push(touchedIn(r).some((o) => !S.touched(o.i)) ? APPR.roomShort : APPR.roomWhole);
        });
      }
      if (later.length && !isDialogueOpen() && chapterHud.state().line == null) say(later.shift(), 6);
      const text = live ? `${APPR.hud.count}${S.touchedCount()} / ${APPR_TOUCHED.length}` : S.st5() === 'tracked' ? APPR.hud.berth : null;
      if (text !== panelText) chapterHud.panel((panelText = text));
    },
    state: () => ({ rooms: rooms.map((r) => [+r.cx.toFixed(1), +r.cz.toFixed(1)]), touched: APPR_TOUCHED.map(([r, k]) => (rooms[r] ? rooms[r].ps[k] : null)), counted, panel: panelText }),
    look,
  };
}
