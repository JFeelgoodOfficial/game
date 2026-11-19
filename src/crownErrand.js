// The Crown errand: the one story thread that ties the worlds together.
// Patron Axilo (terra, Meridian Crown) welcomes the pilot home and sends them
// the long way round: a chair from the WaveMall, a race car to Saturnia, a
// race against Vex Halcyon, a night's sleep, and then Neptunia, where Madame
// Ossva holds the Crown Seal and wants a charge armed before she gives it up.
//
// This module owns the STAGE and nothing else. Every walker that takes part
// (walk.js, the mall, skyWalk, the wreck site) calls in here to move it on, so
// the order of the story lives in one file. The words live with the speakers
// (world/cityRegistry.js `errand`, world/wavemall-dialogue.js, skyWalk.js).
//
// Journal quest 'terra-errand':
//   undefined -> mall -> pick -> car -> race -> won -> rest -> morning
//             -> sent -> relic -> done
// 'neptunia-charge' (world/reachtube.js) stays the truth for the blast itself.

import { questStage, setQuestStage } from './journal.js';
import { grantCargo, hasCargo, takeCargo, grantDecor, ownedDecor, DECOR } from './inventory.js';

export const ERRAND_QUEST = 'terra-errand';
export const ALLY_WAVEMALL = 'ally-wavemall';
export const ALLY_SATURNIA = 'ally-saturnia';
// Mirrors of ids owned elsewhere, repeated so this file imports no world code.
const CHARGE_QUEST = 'neptunia-charge'; // world/reachtube.js
const EMBER_QUEST = 'rustia-emberdeep'; // src/mineWalk.js

const ORDER = ['mall', 'pick', 'car', 'race', 'won', 'rest', 'morning', 'sent', 'relic', 'done'];

export const errandStage = () => questStage(ERRAND_QUEST);
// True once the story has reached `stage` (or passed it).
export function errandAtLeast(stage) {
  return ORDER.indexOf(errandStage()) >= ORDER.indexOf(stage);
}
const set = (stage) => setQuestStage(ERRAND_QUEST, stage);

// What the story wants next, in one line: the on-foot objective and the
// codex both read this. Null when nothing is asked (not begun, or finished).
export function errandObjective() {
  const st = errandStage();
  const charge = questStage(CHARGE_QUEST);
  switch (st) {
    case 'mall': return 'Collect the Patron’s chair at the WaveMall Flagship: ask for Maribel';
    case 'pick': return ownedDecor().length
      ? 'Go back to Maribel at the WaveMall Flagship'
      : 'Pick one thing for your suite from the WaveMall shops';
    case 'car': return 'Deliver the race car to the Sky City over Saturnia';
    case 'race': return 'Beat Vex Halcyon on the Rim Circuit';
    case 'won': return 'Report to Patron Axilo in Meridian Crown';
    case 'rest': return 'Sleep in your suite: the tall tower in Meridian Crown';
    case 'morning': return 'See Patron Axilo';
    case 'sent':
      if (charge === 'blown') return 'Fly back to the wreck of the Indigo Reach: the Seal is on the bridge';
      if (charge === 'go') return 'Ride the riser down and arm the charge';
      return 'Go to Neptunia: Madame Ossva holds the Crown Seal';
    case 'relic': return 'Return the Crown Seal to Patron Axilo';
    default:
      // A save that broke Neptunia before this story existed.
      if (st === undefined && relicWaiting()) return 'Something still shines in the wreck of the Indigo Reach';
      return null;
  }
}
// Which world that line points at (codex).
export function errandWorld() {
  switch (errandStage()) {
    case 'mall': case 'pick': return 'wavemall prime';
    case 'car': case 'race': return 'saturnia';
    case 'won': case 'rest': case 'morning': case 'relic': return 'terra';
    case 'sent': return 'neptunia';
    default: return relicWaiting() ? 'neptunia' : null;
  }
}

// ---- terra: Patron Axilo ----------------------------------------------------

// His story lines, when he has any: { speaker, cine, lines } or null to let
// the wonder-tour dialogue run. `e` is the registry `errand` block.
export function errandTalk(def, speaker, fillLine) {
  const e = def?.errand;
  if (!e) return null;
  const say = (lines) => ({ speaker, cine: true, lines: lines.map(fillLine) });
  // The Seal outranks everything, whatever stage the save thinks it is at.
  if (hasCargo('crownSeal')) {
    takeCargo('crownSeal');
    set('done');
    return say(e.deliver);
  }
  const st = errandStage();
  if (st === undefined) {
    // A save that already went to Neptunia skips the long way round.
    if (questStage(CHARGE_QUEST) !== undefined) { set('sent'); return say(e.welcomeLate); }
    set('mall');
    return say(e.welcome);
  }
  if (st === 'won') {
    takeCargo('crownFurniture');
    set('rest');
    return say(e.debrief);
  }
  if (st === 'morning') { set('sent'); return say(e.mission); }
  return null;
}

// One line on top of his ordinary ones while the errand is open.
export function errandAside(def) {
  const e = def?.errand;
  if (!e) return [];
  const st = errandStage();
  if (st === 'done') return [e.after];
  if (st === 'rest') return [e.restRemind];
  const obj = errandObjective();
  return obj ? [`${e.remind} ${obj}.`] : [];
}

// The night in the suite. True if it moved the story on.
export function slept() {
  if (errandStage() !== 'rest') return false;
  set('morning');
  return true;
}

// What stands in the two penthouses (world/city.js setProps).
export function suiteProps() {
  const out = ownedDecor();
  if (errandStage() === 'done') out.push('crownSeal');
  if (errandAtLeast('rest')) out.push('crownFurniture');
  return out;
}

// ---- wavemall prime: Maribel ------------------------------------------------

// Her tour is walked: she hands over the Patron's chair and opens the shops.
export function mallTourDone() {
  if (errandStage() !== 'mall') return false;
  grantCargo('crownFurniture');
  set('pick');
  return true;
}
// The pilot may take exactly one piece, and only while she has the shops open.
export const canPickDecor = () => errandStage() === 'pick' && ownedDecor().length === 0;
export function pickDecor(id) {
  if (!canPickDecor() || !DECOR[id]) return false;
  return grantDecor(id);
}
// Back at Maribel with a piece chosen: the race car, and the mall's hand.
export const mallCarReady = () => errandStage() === 'pick' && ownedDecor().length > 0;
export function mallCarGiven() {
  if (!mallCarReady()) return false;
  grantCargo('raceCar');
  setQuestStage(ALLY_WAVEMALL, 'yes');
  set('car');
  return true;
}

// ---- saturnia: the Sky City -------------------------------------------------

export function deliverCar() {
  if (errandStage() !== 'car') return false;
  takeCargo('raceCar');
  set('race');
  return true;
}
export const storyRacePending = () => errandStage() === 'race';
export function raceWon() {
  if (errandStage() !== 'race') return false;
  setQuestStage(ALLY_SATURNIA, 'yes');
  set('won');
  return true;
}
export const isAlly = (id) => questStage(id) === 'yes';

// ---- neptunia and after -----------------------------------------------------

// Madame Ossva offers the charge to a pilot Axilo sent, tour or no tour.
export const chargeOpen = () => errandStage() === 'sent' && questStage(CHARGE_QUEST) === undefined;

// The Seal lies on the wrecked bridge until somebody carries it off.
export function relicWaiting() {
  const st = errandStage();
  return questStage(CHARGE_QUEST) === 'blown' && !hasCargo('crownSeal') && st !== 'relic' && st !== 'done';
}
export function sealTaken() {
  if (!relicWaiting()) return false;
  grantCargo('crownSeal');
  set('relic');
  return true;
}

// The Emberdeep cage stays chained until Neptunia has broken. A save that
// already rode it down keeps its mine.
export const emberdeepOpen = () =>
  questStage(CHARGE_QUEST) === 'blown' || questStage(EMBER_QUEST) !== undefined;
