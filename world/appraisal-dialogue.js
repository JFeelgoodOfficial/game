// Appraisal (world/concourse-system.js, appraisal-archive.js, concourse-hold.js;
// GDD 5.7.9): every word of Season 1's fifth chapter. It is played at the free
// port of chapter 4 and aboard the light ship. The season's placeholder names
// come from world/season-names.js and are spelled nowhere here.
//
// A crew line is { by, text, other, solo }. Timed lines are [seconds, line].
// Debrief lines are [captain id, text].

import { SEASON_NAMES as N } from './season-names.js';

const HUB = N.hub.toUpperCase();
const TICK = N.currency.toUpperCase();
const tick = N.currency;

export const APPR = {
  assessor: { name: 'Assessor Pell Ondry', species: 'the port\'s valuers', cityId: `The ${N.hub}` },
  warden: { name: 'A dock warden', species: 'port authority', cityId: `The ${N.hub}` },
  ship: { name: 'The light ship', species: 'the archive', cityId: 'The light ship' },
  thief: { name: 'Coil', species: 'a cutter\'s hand', cityId: 'Berth forty, lower dock' },

  hud: {
    assessor: 'AN ASSESSOR IS WAITING AT YOUR BERTH',
    home: 'BACK TO THE LIGHT SHIP. THE ARCHIVE.',
    count: 'TOUCHED ',
    berth: 'BERTH FORTY, LOWER DOCK',
    case: 'THE SEALED CASE',
    out: 'BACK UP TO THE DECK',
    done: 'DONE — BACK TO THE LIGHT SHIP',
  },
  marks: { assessor: 'ASSESSOR', hatch: 'BERTH 40' },
  prompts: { check: 'E — LOOK AT THIS ONE', hatch: 'E — GO DOWN TO BERTH FORTY', case: 'E — OPEN THE SEALED CASE', out: 'E — BACK UP TO THE DECK' },
  skip: 'E — SKIP',

  // --- the valuation ---
  value: [
    'Assessor Ondry. The port values everything that berths here. It is not personal; it is how the insurance works.',
    'Your freighter: nine hundred. Your cargo: whatever you paid. Your ship, the one we cannot fit: we could not value the ship.',
    `So we valued what it carries. Three hundred and thirty civilizations, complete. And the method for mining time, which nobody here has in full.`,
    `The figure is larger than the ${N.hub}. Not this ring. The port. The books do not have a column that wide; I had to rule one.`,
    'There have been eleven offers since noon. I am required to tell you that. I am not required to tell you who.',
  ],
  valueCrew: { by: 'vask', text: 'They have put a number on three hundred and thirty peoples. I would like to see the working.', other: { marrow: 'They priced it. All of it. As if it were a thing you could carry out of a room.', lux: 'Bigger than the port. We are worth more than the port. Why does that feel like being followed?' }, solo: 'THE ARCHIVE HAS BEEN VALUED AT MORE THAN THE PORT ITSELF.' },
  valueAgain: ['Eleven offers. Twelve now. I would keep someone aboard, if I were you. I am not, and you did not.'],

  // --- the alarm ---
  alarm: {
    from: 'THE LIGHT SHIP',
    lines: [
      'ARCHIVE DOORS OPENED FROM OUTSIDE. NOBODY ABOARD AUTHORISED IT.',
      'THEY WERE IN THE WORLD ROOMS FOR FOUR MINUTES. THEY HAVE GONE.',
      'SOMETHING HAS BEEN TAKEN. I CANNOT TELL WHAT. I AM NOT USED TO THINGS BEING MISSING.',
    ],
  },
  alarmCrew: { by: 'vask', text: 'Then we count. Every room, every plinth. What is not there will tell us who.', other: { lux: 'We were ashore. All of us. They knew we would all be ashore.', marrow: 'Someone walked through all of that and took a piece. I want to see what they could not carry.' }, solo: 'SOMETHING IS MISSING FROM THE ARCHIVE. WALK THE ROOMS AND COUNT.' },

  // --- the archive, walked ---
  enter: 'SIX ROOMS. FIVE PLINTHS IN EACH. FIND THE ONES THAT WERE TOUCHED.',
  // on walking into a room: all there, or one short
  roomWhole: { by: 'vask', text: 'Five here. All five.', other: { marrow: 'Nothing has been moved in this one. It feels as it did.', lux: 'Five. Good. Five is good.' }, solo: 'FIVE PLINTHS. ALL FIVE AS THEY WERE.' },
  roomShort: { by: 'vask', text: 'Five plinths. Four as I left them. One of these has been handled.', other: { marrow: 'Someone has been in here. One of these is not sitting right.', lux: 'One of them is wrong. One of them is definitely wrong.' }, solo: 'FIVE PLINTHS. ONE OF THEM HAS BEEN HANDLED.' },
  untouched: 'THIS ONE IS AS IT WAS.',
  // the three that were touched, in the order they are found: what each one says about who
  clues: [
    { find: 'THE SEAL IS CUT. A CLEAN CUT, WITH A CABLE KNIFE.', line: { by: 'vask', text: 'A cable knife. Tender crew carry those. So does everyone who used to be tender crew.', other: { marrow: 'Cut by someone who cuts for a living.', lux: 'A work knife. Not a thief\'s tool. Somebody\'s actual job.' }, solo: 'CUT WITH A CABLE KNIFE: SOMEONE WHO HAS WORKED THE MINES.' } },
    { find: 'A BERTH TAG ON THE FLOOR. THE NUMBER IS WORN: FOUR, AND SOMETHING.', line: { by: 'vask', text: 'A berth tag. Forty-something. Lower dock; the upper berths are all single figures and teens.', other: { marrow: 'They dropped where they sleep. Lower dock, by the number.', lux: 'A berth tag! They dropped their own address! Forty-what?' }, solo: 'A DROPPED BERTH TAG: FORTY-SOMETHING, ON THE LOWER DOCK.' } },
    { find: 'THE COPY WAS TAKEN WITH A HAND RECORDER. IT HOLDS ONE WORLD\'S WORTH, NO MORE.', line: { by: 'vask', text: 'A hand recorder. One fragment each. Three plinths, three fragments. They took what two people could carry.', other: { marrow: 'They took copies. Small ones. They could not hold more than a piece each.', lux: 'They only took three. They could have taken thirty. Why only three?' }, solo: 'A HAND RECORDER: ONE FRAGMENT AT A TIME. THREE ARE GONE.' } },
  ],
  tracked: { by: 'vask', text: 'Three fragments. Two people. A cutter small enough for a forty-berth. There is one on the lower dock: berth forty.', other: { marrow: 'Two of them, in a small boat, on the lower dock. I can see them from here.', lux: 'Lower dock. Berth forty. I know exactly the sort of boat. Let us go and get our things.' }, solo: 'THREE FRAGMENTS, TWO THIEVES, A SMALL CUTTER. LOWER DOCK, BERTH FORTY.' },

  // --- the thieves' hold ---
  hold: [
    [1.5, { by: null, text: 'BERTH FORTY. THE WARDENS GOT HERE FIRST.' }],
    [7, { by: 'vask', text: 'One. Two. Three. All three fragments, still in the recorders. Nothing was sold.', other: { marrow: 'They are all here. They had not even unpacked them.', lux: 'Ours. Ours. Ours. All three. Oh, thank everything.' }, solo: 'ALL THREE FRAGMENTS ARE HERE, STILL IN THE RECORDERS.' }],
    [14, { by: 'marrow', text: 'There is something else in here. It is older than the boat.', other: { vask: 'One item not on any count of ours. A case. Sealed.', lux: 'What is that? That is not ours. Why is that in with our things?' }, solo: 'THERE IS A SEALED CASE IN WITH THEM. IT IS NOT YOURS.' }],
  ],
  // the sealed forecast: {crew} is whoever is aboard, by name; {n} how many
  sealed: {
    from: `${N.rival.toUpperCase()} · SEALED 400 YEARS`,
    speaker: { name: 'A sealed forecast', species: `of the ${N.rival}`, cityId: 'Berth forty, lower dock' },
    lines: [
      'FORECAST. COMMISSIONED BY NO ONE. SEALED FOUR HUNDRED YEARS BEFORE THE DATE ON IT.',
      `A SHIP TOO LARGE TO BERTH WILL COME TO THE ${HUB}. IT WILL CARRY THREE HUNDRED AND THIRTY WORLDS.`,
      '{crewLine}',
      'ON ITS SECOND VISIT TWO OF THE LOWER DOCK WILL TAKE THREE PIECES OF IT. THEY WILL BE FOUND IN BERTH FORTY WITH THIS CASE.',
      'ITS PILOT IS NOT FORECAST. EVERYTHING ROUND THE PILOT IS.',
    ],
    crewSome: 'ABOARD: {crew}. BY THOSE NAMES.',
    crewNone: 'ITS PILOT WILL COME ALONE. THE THREE WHO SAILED WITH HIM WILL NOT BE ABOARD.',
  },
  sealedCrew: { by: 'marrow', text: 'Four hundred years. Before any of us were born. Before our worlds had the names it uses.', other: { vask: 'Four centuries old. It has the berth number right.', lux: 'It has my name in it. It has my NAME in it. I want to leave.' }, solo: 'SEALED FOUR HUNDRED YEARS AGO. IT HAS THE BERTH NUMBER RIGHT.' },

  // --- the two who did it ---
  thieves: [
    'We did not know what it was. A buyer left the job at the bar with the recorders and that case. Said put the case in with it and wait.',
    `We owe the port four hundred ${tick}s of berth between us. You do not pay that off on the cable. You never pay that off on the cable.`,
    'The warden says it is up to you. Whose it was.',
  ],
  judge: {
    prompt: 'THE TWO FROM BERTH FORTY',
    hold: 'HAND THEM TO THE DOCKMASTER',
    free: 'LET THEM GO',
  },
  held: ['The warden takes them up. Debtors\' deck, outer ring, until it is paid.'],
  freed: ['...You mean it. We will not forget which ship. Nobody down here will.'],
  judgeCrew: {
    hold: { by: 'vask', text: 'They took what was not theirs. The outer ring holds debtors. It is the rule here.', other: { lux: 'They robbed us. They did. ...The outer ring is cold, they say.', marrow: 'They will be on the outer ring a long time. I wanted you to know I had thought of that.' }, solo: null },
    free: { by: 'vask', text: 'They were paid in a debt they could not carry. I count that against the buyer, not them.', other: { lux: 'You let them go! They robbed us! ...They looked so tired.', marrow: 'They did not know what they were holding. Now they know who let them walk.' }, solo: null },
  },
  thiefAgain: ['We did not know. That is all there is of it.'],

  debrief: {
    title: 'CHAPTER 5 — APPRAISAL',
    open: ['vask', 'Count it back, in plain words.'],
    body: [
      ['vask', 'The port valued the archive above the port itself. While we were all ashore, two people from the lower dock went aboard and copied three fragments.'],
      ['marrow', 'We found which ones by walking the rooms and seeing what had been handled. A cable knife, a berth tag, a hand recorder. It led to berth forty.'],
      ['lux', `And in with our things was a forecast from the ${N.rival}. Sealed four hundred years ago. It had the ship, the berth and the theft. It had our names.`],
      ['marrow', 'It did not have the pilot. Everything round him, and not him.'],
    ],
    held: ['vask', 'You handed the two of them to the dockmaster. They are on the debtors\' deck of the outer ring.'],
    freed: ['vask', 'You let the two of them go. The lower dock knows which ship did that.'],
    close: ['lux', 'Somebody saw us coming before there was an us. I would like to go somewhere they have not thought of.'],
    complete: 'COMPLETE',
    nextCourse: 'SET A NEW COURSE FROM THE CHART AT THE HELM.',
    nextNone: 'NOTHING NEW IS CHARTED YET. THE NEXT CHAPTER IS STILL BEING WRITTEN.',
  },
};
