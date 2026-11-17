// A new cycle: the way the story ends is the way it begins again.
//
// The pilot has led what is left of three fleets into the wormhole
// (src/endgame.js). On the far side is the system as it was at the start:
// every world back in its place, terra dead ahead, nobody yet warned.
//
// The story is spread across the whole running game by then — worlds removed,
// the sun switched off, fleets, a star — and nothing in the code can put all
// of that back in place. So the cycle is a reload onto a save with the story
// taken out of it:
//
//   reset   fgsf.tenretni (the event, the war, the ending) and the two story
//           quests in the journal (the Baron's secret, Neptunia's charge)
//   kept    everything the pilot earned: inventory, upgrades, trophies, the
//           navigation log, codex, tours walked, settings, the other worlds'
//           own saves
//
// A flag in sessionStorage tells the next boot to skip the menu and put the
// pilot straight in the seat (src/game.js): the game restarts where it began,
// not at a title screen.

import { resetStory, addCodex } from './journal.js';
import { CHARGE_QUEST } from '../world/reachtube.js';

const FLAG = 'fgsf.newCycle';
const STORY_QUESTS = ['tenretni', CHARGE_QUEST];

// White, over everything: the inside of the wormhole, and what the reload
// happens behind.
function whiteOut(opacity) {
  let el = document.getElementById('cycleWhite');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cycleWhite';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;pointer-events:none;transition:opacity 1.6s ease';
    document.body.appendChild(el);
  }
  el.style.opacity = String(opacity);
  return el;
}

export function beginNewCycle() {
  whiteOut(1);
  addCodex('Through the Wormhole');
  resetStory(STORY_QUESTS);
  let flagged = false;
  try {
    localStorage.removeItem('fgsf.tenretni');
    sessionStorage.setItem(FLAG, '1');
    flagged = true;
  } catch {
    /* no storage: the reload lands on the menu, with the story as it was */
  }
  // let the white paint before the page goes
  setTimeout(() => location.reload(), flagged ? 500 : 900);
}

// Boot: true, once, if this load is the far side of the wormhole.
export function takeNewCycle() {
  try {
    if (sessionStorage.getItem(FLAG) !== '1') return false;
    sessionStorage.removeItem(FLAG);
  } catch {
    return false;
  }
  // arrive out of the same white, and let it clear
  const el = whiteOut(1);
  el.style.transition = 'opacity 2.4s ease';
  requestAnimationFrame(() => requestAnimationFrame(() => whiteOut(0)));
  setTimeout(() => el.remove(), 3200);
  return true;
}
