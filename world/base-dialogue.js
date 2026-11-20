// Aboard the light ship, between chapters (GDD 5.7.8): everything said on the
// home base that is not part of a chapter's story. Data only.
//
// The three captains are the same people they were (world/chapter-dialogue.js):
// Marrow sees, Lux fears, Vask counts. What they say here is small talk about
// the ship and the trip in hand; a chapter that wants them to say something
// about itself gives its own lines (src/systems.js `talk`).

export const BASE = {
  // toasts and prompts
  aboard: 'THE LIGHT SHIP — YOUR FREIGHTER IS IN THE BAY',
  bayApproach: 'THE LIGHT SHIP — THE BAY HAS YOUR HELM',
  bayWelcome: 'THE LIGHT SHIP — BAY DECK. WELCOME BACK',
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
  arriveSay: '{to}',
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
