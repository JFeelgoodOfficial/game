// Futures (world/futures-system.js, world/futures-city.js; GDD 5.7.9): every
// word of Season 1's sixth chapter, and every name in it but the season's four
// placeholders, which come from world/season-names.js. Rename freely.
//
// A crew line is { by, text, other, solo } (world/sceneClock.js crewSay).
// Timed lines are [seconds, line]. Debrief lines are [captain id, text].

import { SEASON_NAMES as N } from './season-names.js';

const RIVAL = N.rival.toUpperCase();
const HUB = N.hub.toUpperCase();
const TICK = N.currency.toUpperCase();

export const FUT = {
  id: 'futures',
  label: 'FUTURES',
  world: 'THE ORRERY',

  city: {
    label: 'THE ORRERY',
    approach: 'THE ORRERY — YOUR ARRIVAL IS ON THE BOARD. THE PAD HAS YOUR HELM',
    welcome: 'THE ORRERY — A WORLD THAT SOLD ITS FUTURE. NOTHING HERE HAS BEEN A SURPRISE IN THREE HUNDRED YEARS',
    dockLabel: 'AUTO-LANDING · THE ORRERY',
    leaveHint: 'YOUR FREIGHTER IS ON THE PAD',
    name: 'The Orrery',
  },
  keeper: { name: 'Keeper of Hours Amity Voss', species: `registrar for the ${N.rival}`, cityId: 'The Orrery' },
  late: { name: 'Derry Lome', species: 'a citizen, unscheduled', cityId: 'The Orrery' },
  citizen: { name: 'A citizen', species: 'on schedule', cityId: 'The Orrery' },

  hud: {
    keeper: 'THE KEEPER OF HOURS IS AT THE CLOCK',
    next: 'NEXT    ',
    in: '   IN ',
    stand: 'STAND WHERE IT SAYS, AND WATCH',
    seen: 'ON TIME ',
    late: 'LATE    ',
    find: 'SOMEONE DID NOT COME. FIND HER.',
    back: 'TELL THE KEEPER',
    done: 'DONE — BACK TO THE LIGHT SHIP',
  },
  marks: { keeper: 'KEEPER', spot: 'HERE' },
  skip: 'E — SKIP',
  // what the board says of the four it is watched for: who, where, and doing what
  board: [
    { who: 'THE LAMPLIGHTER', where: 'THE NORTH LAMP', does: 'lights the north lamp' },
    { who: 'THE TWO FROM THE MILL', where: 'THE EAST TABLE', does: 'sit down to eat' },
    { who: 'THE BELL-BOY', where: 'THE WEST STEP', does: 'rings the quarter' },
    { who: 'DERRY LOME', where: 'THE SOUTH BENCH', does: 'sits down, for the last time' },
  ],
  onTime: ['TO THE SECOND.', 'TO THE SECOND. AGAIN.', 'THREE FOR THREE. THE BOARD HAS NOT BEEN WRONG IN THREE HUNDRED YEARS.'],
  missedIt: 'YOU WERE NOT THERE TO SEE IT. THE BOARD SAYS IT WILL HAPPEN AGAIN.',
  nobody: 'THE SOUTH BENCH. THE HOUR. NOBODY.',

  arrive: [
    [3, { by: 'lux', text: 'Look at them. Nobody is hurrying. Nobody is looking over their shoulder. I did not know people could walk like that.', other: { vask: 'Every one of them is exactly where a timetable would put them. I have run shifts for forty years and never managed that.', marrow: 'They move as if they have heard the tune before. All of it. To the end.' }, solo: 'NOBODY IN THE SQUARE IS HURRYING. EVERY ONE OF THEM IS EXACTLY ON TIME.' }],
    [12, { by: 'vask', text: 'No locks on the doors. No guard on the granary. You do not need either when you know what everyone will do.', other: { lux: 'No prices on anything. They already know what everyone will buy.', marrow: 'No bells for alarm. Only for the hour.' }, solo: 'NO LOCKS, NO GUARDS. THEY KNOW WHAT EVERYONE WILL DO.' }],
  ],

  welcome: [
    'You are the freighter of the eleventh hour. You are four seconds early; the pad wind was kinder than forecast. It will be noted.',
    `Three hundred years ago this world bought a forecast from the ${N.rival}. All of it. Every harvest, every wedding, every death.`,
    'We paid with the right to be surprised. I have never missed it. Nobody is poor here. Nobody is afraid. We know.',
    'You do not believe me. Visitors never do. The board will give you the next few minutes of four people. Go and stand where it says.',
  ],
  keeperMissed: ['Nobody is late here. If the bench is empty, you are reading the board wrong. ...Go and look, if it troubles you.'],
  welcomeAgain: ['The board has your four. Stand where it says, and watch them be on time.'],
  clock: [
    [1.5, { by: null, text: 'THE HOUR.' }],
    [6, { by: 'lux', text: 'They all moved at once. Nobody looked at anybody. They all just knew.', other: { vask: 'Sixteen people, one tick. Not a step out.', marrow: 'It is a choir. They are singing with their feet.' }, solo: 'EVERY ONE OF THEM MOVED ON THE SAME TICK.' }],
    [13, { by: 'lux', text: 'Do you know what I would have given for one day of this? For one hour of knowing?', other: { vask: 'I can see why someone would buy it. I am trying to see what it cost.', marrow: 'It is beautiful. I keep waiting for a wrong note, and I do not think I am allowed one.' }, solo: 'IT IS BEAUTIFUL. NOTHING IN IT IS UNEXPECTED.' }],
  ],
  missed: { by: 'vask', text: 'The board said the south bench, on the hour. The bench is empty. That is the first wrong number I have seen here.', other: { lux: 'She is not there. The board said she would be there. The board is never wrong. Where is she?', marrow: 'An empty bench. In this city. Someone has stepped out of the song.' }, solo: 'THE BOARD WAS WRONG. SOMEONE IS NOT WHERE SHE WAS FORECAST TO BE.' },
  findHint: 'EVERYONE ON SCHEDULE WEARS A LIT BAND AT THE ANKLE. LOOK FOR THE ONE WHO DOES NOT.',

  found: [
    'You found me. Nobody else is looking; it has not occurred to them that I could be anywhere else.',
    'The board has me sitting down on the south bench at the hour and not getting up. That was to be all. Peacefully, it says. It says that for everyone.',
    'I got as far as the bench. And I thought: I have never once gone the other way round the square.',
    'So I did. It is the same square. It is the best walk I have ever had.',
    'They will come and put me right. They are kind about it. Tell the Keeper where I am, if you like. Or do not. I would like to know which you will do, and for once I cannot.',
  ],
  foundAgain: ['It is the same square, the other way round. You would not think it would matter.'],
  foundCrew: { by: 'lux', text: 'She was supposed to die an hour ago. She went for a walk. I do not know why that frightens me more than anything here.', other: { vask: 'One person, one hour off the timetable. Three hundred years of forecasts and that is the whole error.', marrow: 'She heard the last bar coming and sang something else.' }, solo: 'SHE WAS FORECAST TO DIE AT THE HOUR. SHE WENT FOR A WALK.' },

  offer: [
    'An unscheduled citizen. It happens, a few times in a century. She will be walked back to her bench. She will not mind.',
    `But you. Your ship has no forecast at all. The ${N.rival} have asked me to offer it one. Every arrival, every danger, every loss, known in advance.`,
    'The price is what ours was. You would not be surprised again.',
  ],
  // who the offer is really for: Lux, if she is aboard
  offerCrew: { by: 'lux', text: 'I want it. I am telling you now so you hear it from me. I have been afraid every day of my life and that woman is offering to make it stop.', other: { vask: 'For the log: it would have saved us people. I can count which ones.', marrow: 'To know every note before it sounds. I would never need to listen again. I am not sure that is a gift.' }, solo: null },
  sign: {
    prompt: `A FORECAST FOR THE LIGHT SHIP`,
    yes: 'LET IT BE SIGNED',
    no: 'TALK HER DOWN — THE SHIP STAYS UNFORECAST',
    yesSolo: 'SIGN IT',
    noSolo: 'REFUSE IT',
  },
  signed: ['It is signed. You will find it restful. Everyone does.'],
  refused: ['It is noted. You will be the only ship in this sky that does not know what tomorrow is.'],
  signCrew: {
    signed: { by: 'lux', text: 'It is done. I thought I would feel safe at once. I feel like I have sold something of yours.', other: { vask: 'Signed. We are on a schedule now. I would like to see the whole of it and I do not think we may.', marrow: 'We will know what is coming. I will try to go on listening anyway.' }, solo: null },
    refused: { by: 'lux', text: 'You said no. For me. I am still frightened. I think I am glad I am still frightened.', other: { vask: 'Unforecast. We go on counting as we go. I prefer it; I only wanted it said.', marrow: 'Then we keep not knowing. Good. That is where the music is.' }, solo: null },
  },
  correction: [
    [1.5, { by: null, text: 'TWO WARDENS, WALKING AT THE PACE OF THE CLOCK.' }],
    [7, { by: null, text: 'THEY TAKE HER ARM. SHE GOES WITH THEM, THE LONG WAY ROUND.' }],
    [14, { by: 'lux', text: 'She is smiling. She is still smiling. She got one walk.', other: { vask: 'One hour off schedule in three hundred years. They are correcting it. It will not be on the board.', marrow: 'She looked back at us. Nobody here looks back.' }, solo: 'SHE LOOKS BACK ONCE. NOBODY HERE LOOKS BACK.' }],
    [21, { by: null, text: `AT THE ${HUB}, THE ${TICK} HAS HALVED. THAT WAS ON SOMEBODY'S BOARD TOO.` }],
  ],
  keeperAfter: ['The south bench is occupied, as forecast. Good day. You will leave at eleven minutes past; you always were going to.'],

  ground: {
    marrow: { early: ['Every bell here rings on time. I have never heard bells sound so much like a wall.'], after: ['I keep thinking of her going the other way round the square.'] },
    lux: { early: ['Nobody here has ever had a bad surprise. I keep saying that to myself as if it were the whole of it.'], after: ['I still want it. I want you to know that I still want it.'] },
    vask: { early: ['Three hundred years with no overtime, no shortfall and no accident. I do not trust a count that clean.'], after: ['One error in three hundred years, and they erased it. So the count is not clean. It is tidied.'] },
  },
  talk: {
    marrow: ['A whole world that knows its own ending. I want to hear what they sing about.'],
    lux: ['A place where nothing goes wrong. Ever. Take me there. I only want to look.'],
    vask: ['A forecast is a contract on what has not happened. I would like to read the terms.'],
  },

  debrief: {
    title: 'CHAPTER 6 — FUTURES',
    open: ['vask', 'Plain words, before we go on.'],
    body: [
      ['lux', `That world sold its whole future to the ${N.rival} three hundred years ago. Nobody there is poor or afraid, and nothing has surprised anyone since.`],
      ['vask', 'The forecast was right about everyone but one. A woman forecast to die at the hour went for a walk instead. They walked her back.'],
    ],
    signed: ['lux', `And the light ship has a forecast now. I asked for it and you let me. Whatever is coming, the ${N.rival} have already read it.`],
    refused: ['lux', 'They offered the ship a forecast and I wanted it. You said no. We go into whatever is coming without one.'],
    tail: [
      ['vask', `One more thing. The ${N.rival} have opened a bigger mine. The ${N.hub} is flooded with cheap ${N.currency}s. Every price there has doubled, and everything we saved is worth half.`],
      ['marrow', 'That is not weather. Somebody decided it. I think it is the first move of something.'],
    ],
    close: ['lux', 'I am staying. I wanted you to hear that too.'],
    complete: 'COMPLETE',
    nextCourse: 'SET A NEW COURSE FROM THE CHART AT THE HELM.',
    nextNone: 'NOTHING NEW IS CHARTED YET. THE NEXT CHAPTER IS STILL BEING WRITTEN.',
  },
};
