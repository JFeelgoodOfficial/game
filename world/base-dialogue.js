// Aboard the light ship, between chapters (GDD 5.7.8): everything said on the
// home base that is not part of a chapter's story. Data only.
//
// The three captains are the same people they were (world/chapter-dialogue.js):
// Marrow sees, Lux fears, Vask counts. What they say here is small talk about
// the ship and the trip in hand; a chapter that wants them to say something
// about itself gives its own lines (src/systems.js `talk`).

import { SEASON_NAMES as N } from './season-names.js';

const FIRST = N.envoy.split(' ')[0];

export const BASE = {
  // toasts and prompts
  aboard: 'THE LIGHT SHIP — YOUR FREIGHTER IS IN THE BAY',
  bayApproach: 'THE LIGHT SHIP — THE BAY HAS YOUR HELM',
  bayWelcome: 'THE LIGHT SHIP — BAY DECK. WELCOME BACK',
  bayDebrief: 'WELCOME BACK — THE CAPTAINS ARE WAITING ON THE BRIDGE. TAKE THE LIFT UP',
  bayLabel: 'AUTO-LANDING · THE BAY',
  bayLeave: 'YOUR FREIGHTER IS ON THE PAD, BEHIND YOU',
  toBridge: 'E — LIFT TO THE BRIDGE',
  toArchive: 'E — LIFT TO THE ARCHIVE',
  toBay: 'E — LIFT DOWN TO THE BAY',
  bridgeAft: 'E — AFT TO THE ARCHIVE',
  archiveFore: 'E — FORWARD TO THE BRIDGE',
  holodeck: 'E — THE HOLODECK',
  roster: 'E — WHO COMES ALONG',
  chart: 'E — THE CHART',
  sit: 'E — SIT AT THE HELM',
  seated: 'E — THE CHART · MOVE — STAND UP',
  // the holodeck's panel
  holoTitle: 'THE ARCHIVE',
  holoSub: 'EVERY WORLD IT KEEPS · G ENDS A PROGRAM',
  holoLocked: 'A RECORD NOT YET OPENED',
  // the roster
  rosterTitle: 'THE TRIP',
  rosterSub: 'WHO RIDES IN THE FREIGHTER · PICK TO CHANGE',
  rosterFoot: 'NUMBER — CHANGE · X — CLOSE',
  rosterAlong: 'COMING ALONG',
  rosterStay: 'STAYING ABOARD',
  rosterNone: 'NOBODY IS LEFT TO ASK',
  // the chart
  chartSpeaker: { name: 'The chart', species: 'the light ship', cityId: 'The bridge' },
  chartHere: 'THE SHIP IS HERE: {here}.',
  chartPrompt: 'SET A COURSE?',
  chartStay: 'STAY HERE',
  chartNowhere: 'NOTHING ELSE IS CHARTED YET.',
  chartNeedShuttle: 'THE FREIGHTER IS NOT IN THE BAY. THE SHIP WILL NOT LEAVE WITHOUT IT.',
  travelSay: 'COURSE SET — {to}',
  // a place of the megaworld's, as a holodeck program: whoever is spoken to there
  programGreet: { speaker: { name: 'A record', species: 'the archive', cityId: 'The City of Light' }, lines: ['THIS IS THE CITY AS THE ARCHIVE KEPT IT.', 'NOBODY IN IT CAN SEE YOU. G ENDS THE PROGRAM.'] },
  guestPrompt: 'E — TALK',
  toDeck: 'E — CREW DECK',
  arriveSay: '{to}',
};

// The crew deck (world/basedeck.js): quarters, the dining lounge, the medical
// bay. Plain on purpose: nothing here is part of a story.
export const DECK = {
  where: 'The crew deck',
  toBridge: 'E — BACK TO THE BRIDGE',
  platePilot: 'PILOT',
  plateBridge: 'BRIDGE',
  plateLounge: 'DINING',
  plateMed: 'MEDICAL',
  plateGuest: 'GUEST',
  rest: 'E — REST',
  restSay: 'YOU SLEEP FOR A WHILE. THE SHIP KEEPS GOING.',
  eat: 'E — SIT DOWN TO EAT',
  eatWith: 'YOU EAT WITH {who}.',
  eatAlone: 'YOU EAT ALONE, BY THE WINDOW.',
  // said across the table, while eating with them: two of these, from whoever is there
  dinner: {
    marrow: [
      'Every place we stop, I save one thing to tell you at dinner. Today it is the light. I will tell you later.',
      'This is better than the quiet of the archive. I like hearing forks.',
      'You look tired. Good tired, I think.',
    ],
    lux: [
      'Do not tell Vask, but I like it when the ship is quiet and we are all in one room.',
      'I made the dessert. Do not ask what is in it. It is fine. It is mostly fine.',
      'After the last one I did not think I would be hungry. I am starving.',
    ],
    vask: [
      'I count the meals since we left the hole. I am not going to tell you the number. It is a good number.',
      'Pass the salt. No. The other salt.',
      'Eat. Whatever is next, it goes better on a full stomach.',
    ],
  },
  scan: 'E — CHECK-UP',
  scanSay: 'CHECK-UP DONE. NO INJURIES. YOU ARE FIT TO FLY.',
  look: 'E — LOOK AROUND',
  // a captain's quarters, looked round with them out of it
  room: {
    marrow: ["Marrow's quarters. A stand of tuning bells by the window.", 'They ring by themselves when the ship turns. Marrow says that is the point.'],
    lux: ["Lux's quarters. Plants on every surface, and more lamps than anyone needs.", 'Lux does not like the dark. This room never has any.'],
    vask: ["Vask's quarters. A piece of ore from Rustia on a stand, still warm.", 'Scratched into the desk: a tally mark for every trip the ship has made.'],
  },
  // the guest quarters: empty, or hers while she is aboard
  guestRoom: ['The guest quarters. The bed is made and nobody has slept in it.', 'Whoever comes aboard next gets the window.'],
  guestHers: [`${FIRST}'s coat is on the stand. The bed is made very neatly, and she has not slept in it much.`, 'She has turned the chair to face the window. Nobody forecast that view for her.'],
  // what the pilot keeps of her, by the window in the pilot's quarters
  keepPrompt: `E — ${FIRST.toUpperCase()}`,
  keepName: N.envoy,
  keepGone: [`A small figure of ${FIRST}, in her long coat, and the glass from the bar. She ordered that drink for you before you had said a word.`, 'She went her own way. It was not on anyone\'s page.'],
  keepLost: [`A small figure of ${FIRST}, in her long coat, and the glass from the bar. She ordered that drink for you before you had said a word.`, 'She chose where to be, at the end. Somebody keeps a light on beside her.'],
  // ...and kept for one who is not coming back
  lostRoom: ['{NAME} is not coming back. The room is kept as they left it.', 'Someone leaves a small light on in here.'],
};

// What each captain has to say on the bridge, by where the ship is. `any` is
// said anywhere; a system's own `talk` (src/systems.js) is said first there.
export const CREW_TALK = {
  marrow: {
    any: [
      'The archive is quieter under way. It listens when we move.',
      'Every place we stop, something is looking back. I would rather know it than not.',
    ],
    trip: ['I will come. I see more from a small window than from a large one.'],
    stay: ['I will keep the bridge. Someone should watch the ship while you watch the world.'],
    ride: ['Fly it gently. I am looking out of your windows, not at your instruments.'],
  },
  lux: {
    any: [
      'I have walked this ship end to end. No tills, no doors that lock, no closing time. It is unnerving.',
      'Tell me where we are going before we get there. That is all I ask. That is all I ever ask.',
    ],
    trip: ['Fine. Yes. I am coming. Somebody on this crew should be frightened on purpose.'],
    stay: ['I will stay with the ship, thank you. The ship has walls.'],
    ride: ['Is this thing meant to creak? It creaks. I am only reporting it.'],
  },
  vask: {
    any: [
      'One ship. One freighter. One bay. I keep the count short so I can keep it right.',
      'A million years of archive and no manifest. I have started one.',
    ],
    trip: ['I will ride along. Somebody should log what you bring back.'],
    stay: ['I will hold the bay. Call the approach and I will have the deck clear.'],
    ride: ['Fuel, air, hull. All three read sound. Carry on.'],
  },
};
