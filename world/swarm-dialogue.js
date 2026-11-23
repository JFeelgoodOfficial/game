// The Weight of Hands (world/swarm-system.js, world/swarm-yard.js; GDD 5.7.9):
// every word of Season 1's eighth chapter, and every name in it but the
// season's placeholders, which come from world/season-names.js and are
// spelled nowhere here. Rename freely.
//
// A crew line is { by, text, other, solo } (world/sceneClock.js crewSay): said
// by its captain if they are aboard, by whoever is if not (in `other[id]`'s
// words where given), and with nobody left it is `solo`, which is what the
// pilot reads for himself. This is Vask's chapter: most lines are his, and
// every one has other words for when he is not there to say it.
// Timed lines are [seconds, line]. Debrief lines are [captain id, text].

import { SEASON_NAMES as N } from './season-names.js';

const HUB = N.hub.toUpperCase();
const RIVAL = N.rival.toUpperCase();

export const SWARM = {
  id: 'swarm',
  label: 'THE WEIGHT OF HANDS',

  yard: {
    label: 'THE HIGH YARD',
    approach: 'THE HIGH YARD — SOMETHING OLD HAS YOUR HELM. IT IS BEING CAREFUL WITH IT',
    welcome: 'THE HIGH YARD — A SHELL ROUND A STAR, HALF BUILT. THE BUILDERS HAVE NOT LOOKED UP',
    dockLabel: 'AUTO-LANDING · THE HIGH YARD',
    leaveHint: 'YOUR FREIGHTER IS ON THE PAD',
    city: 'The High Yard',
  },
  // what the crew end up calling the four they read (nobody named them before)
  builders: {
    hauler: 'THE HAULER',
    welder: 'THE WELDER',
    maker: 'THE MAKER',
    old: 'THE OLD HAND',
  },
  post: { name: 'The work order', species: 'the makers\' last instruction', cityId: 'The High Yard' },
  buyers: { name: 'Two offers', species: 'on one channel', cityId: 'The High Yard' },

  // --- the screen ---
  hud: {
    read: 'READ    ',
    lamp: 'Q — CHANGE BAND. X-RAY GOES THROUGH. HOLD IT ON A BUILDER.',
    near: 'CLOSER. THE BEAM HAS TO REACH IT.',
    post: 'THE WORK ORDER, AT THE POST',
    done: 'DONE — BACK TO THE LIGHT SHIP',
  },
  keys: 'Q — CHANGE BAND · L — LAMP',
  skip: 'E — SKIP',
  marks: { post: 'ORDER' },
  prompts: { post: 'E — THE WORK ORDER' },

  // --- arriving: the first step out ---
  arrive: [
    [1.5, { by: null, text: 'A STAR, AND ROUND IT A SHELL OF MIRRORS. HALF OF ONE.' }],
    [7, { by: 'vask', text: 'Not a shell. A swarm. Every mirror on its own orbit, catching what the star throws away. A solid one would tear itself apart.', other: { marrow: 'They are catching the light before it is lost. Every piece of it they can reach.', lux: 'That is a lot of mirrors. That is more mirrors than I have seen of anything.' }, solo: 'NOT A SOLID SHELL: A SWARM. EVERY MIRROR ON ITS OWN ORBIT, CATCHING THE STAR\'S LIGHT.' }],
    [14, { by: 'vask', text: 'A small star. Call it a tenth of a sun. Still more power than every world we ever had put together, a billion times over.', other: { marrow: 'A dim star, and still it is more than anyone could ever use.', lux: 'It is not even a big star. Imagine the bill.' }, solo: 'A DIM STAR: A TENTH OF A SUN. STILL A BILLION TIMES WHAT A WORLD USES.' }],
    [21, { by: 'marrow', text: 'Something is still building it. Look. Nobody is telling them to.', other: { vask: 'Work in progress. No foreman. No lights in the office.', lux: 'There are things moving down there. Working. Is anyone in charge of them?' }, solo: 'MACHINES ARE STILL BUILDING IT. NOBODY IS TELLING THEM TO.' }],
  ],
  first: { by: 'vask', text: 'I have run crews like this. Let me see inside one. The lamp has a band that goes through.', other: { marrow: 'I would like to know what they are, before anyone decides what they are for.', lux: 'They are not looking at us. I would feel better if I knew what was in them.' }, solo: 'THEY DO NOT LOOK UP. THE LAMP HAS A BAND THAT SHOWS WHAT IS INSIDE.' },

  // --- reading them: what the X-ray band shows inside each, and what a miner makes of it ---
  reads: {
    hauler: {
      find: 'A SPOOL IN ITS CHEST. ONE TURN OF WIRE FOR EVERY SHIFT.',
      line: { by: 'vask', text: 'A tally. Three shifts a day, ten thousand years. Ten million nine hundred and fifty thousand turns. It has not missed one.', other: { marrow: 'It has kept count of every day it worked. All of them. Since before anyone we know of was born.', lux: 'It counts its shifts. Ten thousand years of them. Nobody is checking. It counts anyway.' }, solo: 'A TALLY OF SHIFTS: THREE A DAY FOR TEN THOUSAND YEARS. NEARLY ELEVEN MILLION, NONE MISSED.' },
    },
    welder: {
      find: 'A JOINT IN ITS ARM THAT IS NOT IN THE PATTERN. IT MENDED ITSELF.',
      line: { by: 'vask', text: 'That weld is not to any drawing. It broke, and it worked out its own repair, and it did it neater than the makers did.', other: { marrow: 'It was hurt, once, and it healed itself in a way nobody taught it.', lux: 'It fixed itself. Off the manual. I have fired people for less and promoted them for the same thing.' }, solo: 'IT BROKE ONCE AND MENDED ITSELF, IN A WAY THAT IS IN NO PATTERN.' },
    },
    maker: {
      find: 'A SMALL ONE, HALF MADE, INSIDE IT. AND A MARK CUT INTO THE SMALL ONE\'S CORE.',
      line: { by: 'vask', text: 'It builds the next one. And it puts a mark in each that is not a serial. I have seen that mark. It is on the Hauler\'s spool.', other: { marrow: 'It is making a child. And it has given the child a sign. The same sign the first one carries.', lux: 'It is making another one. And it signed it. That is a signature. Machines do not sign things.' }, solo: 'IT BUILDS THE NEXT ONE, AND CUTS A MARK IN EACH THAT IS NOT A SERIAL NUMBER.' },
    },
    old: {
      find: 'IT STOPPED LONG AGO. INSIDE IT: PARTS THAT ARE NOT ITS OWN. ONE FROM EACH OF THE OTHERS.',
      line: { by: 'vask', text: 'This one is dead. They did not scrap it. Each of them has put a piece of itself inside. Miners do that. We put a tool in with ours.', other: { marrow: 'They have buried it. Each of them left something of its own with it. I know what that is. So do you.', lux: 'It has stopped. And they have all... left things. In it. Oh. Oh, that is a grave.' }, solo: 'IT STOPPED LONG AGO. THE OTHERS HAVE EACH LEFT A PIECE OF THEMSELVES INSIDE IT.' },
    },
  },
  again: 'ALREADY READ.',

  // --- what it adds up to ---
  understood: [
    [1.5, { by: null, text: 'FOUR OF THEM, READ.' }],
    [7, { by: 'vask', text: 'They count their days. They mend themselves their own way. They name their young. They bury their dead.', other: { marrow: 'They keep time, they heal, they name, they mourn. I am listing what a people does.', lux: 'They count, they fix themselves, they sign their kids and they have a graveyard. That is not equipment.' }, solo: 'THEY COUNT THEIR DAYS, MEND THEMSELVES, NAME THEIR YOUNG AND BURY THEIR DEAD.' }],
    [14, { by: 'vask', text: 'And the order they are working to was given by somebody who has been gone a hundred centuries. Nobody ever came back to say stop.', other: { marrow: 'And all of it for makers who left and never said they could rest.', lux: 'And the people who hired them left ten thousand years ago. Without saying they were done.' }, solo: 'THE ORDER THEY WORK TO WAS GIVEN TEN THOUSAND YEARS AGO. NOBODY EVER CAME BACK TO END IT.' }],
    [21, { by: 'vask', text: 'I have worked a shift nobody would end. Not ten thousand years of one.', other: { marrow: 'I do not think anyone has ever asked them anything.', lux: 'Ten thousand years of overtime. For nobody.' }, solo: 'TEN THOUSAND YEARS OF SHIFTS, FOR MAKERS WHO ARE NOT COMING BACK.' }],
  ],

  // --- the two offers: one channel, both at once ---
  offers: {
    from: 'TWO OFFERS',
    lines: [
      `A BUYER FOR THE ${RIVAL}: WE WILL TAKE THE SWARM'S OUTPUT, ALL OF IT, AT A PRICE FIXED FOR A THOUSAND YEARS. OUR ENGINE NEEDS IT. YOU WILL FIND THE TERMS ARE ALREADY ACCEPTABLE.`,
      `A FACTOR OF THE ${HUB}: DO NOT SELL THEM A STAR. CONTRACT THE OUTPUT TO THE PORT. WITH THAT MUCH POWER WE CAN ANSWER THEM WHEN THEY COME. WITHOUT IT WE CANNOT.`,
      'BOTH: THE PATTERN POST ON THE YARD STILL TAKES A WORK ORDER. WHOEVER STANDS AT IT DECIDES WHERE THE LIGHT GOES.',
    ],
  },
  nobody: { by: 'vask', text: 'Two buyers, and both of them talking to us. Neither of them has asked the ones doing the work.', other: { marrow: 'Both of them asked us. Neither asked them.', lux: 'They are bidding for the staff. Over the staff\'s heads. I have been the staff.' }, solo: 'TWO OFFERS, BOTH MADE TO YOU. NOBODY HAS ASKED THE BUILDERS.' },

  // --- the work order ---
  decide: {
    lines: [
      'WORK ORDER, STANDING: BUILD THE SWARM. NO END DATE. ISSUED BY: THE MAKERS. LAST AMENDED: NEVER.',
      'THIS POST WILL TAKE ONE AMENDMENT FROM ANYONE WHO STANDS AT IT. IT HAS WAITED TEN THOUSAND YEARS FOR SOMEONE TO.',
      'END THE ORDER, AND THE BUILDERS ARE THEIR OWN. THE SWARM STOPS WHERE IT IS. NOBODY GETS ITS POWER.',
      `OR ASSIGN ITS OUTPUT TO THE ${HUB}. THE BUILDERS GO ON AS THEY ARE. THE PORT GETS A STAR TO FIGHT WITH.`,
    ],
    // each captain's word, said before the question (Vask counts who did the work; Lux fears what the port will lack)
    sides: [
      { by: 'vask', text: 'End it. Nobody alive hired them. A crew that has worked that long has earned the right to put the tools down.' },
      { by: 'lux', text: `The ${N.rival} are coming for the port. I have seen their prices. Without this we lose. I hate that I am the one saying it.` },
      { by: 'marrow', text: 'Whichever you choose, choose it knowing what they are. That is all I ask.' },
    ],
    prompt: 'THE WORK ORDER',
    free: 'END THE ORDER — FREE THE BUILDERS',
    contract: `ASSIGN THE OUTPUT — CONTRACT IT TO THE ${HUB}`,
  },
  freedReply: ['ORDER ENDED. NO FURTHER INSTRUCTION. THE BUILDERS HAVE BEEN TOLD.'],
  contractReply: [`OUTPUT ASSIGNED: THE ${HUB}. ORDER STANDS. THE BUILDERS HAVE NOT BEEN TOLD ANYTHING. NOTHING HAS CHANGED FOR THEM.`],

  // --- what happens then ---
  freed: [
    [1.5, { by: null, text: 'THE ORDER IS ENDED.' }],
    [7, { by: 'vask', text: 'They have stopped. All of them. First time in ten thousand years that yard has been quiet.', other: { marrow: 'They have stopped. Listen. They are listening too.', lux: 'They stopped. They all just stopped. What do they do now? What does anyone do?' }, solo: 'EVERY BUILDER HAS STOPPED. THE YARD IS QUIET FOR THE FIRST TIME IN TEN THOUSAND YEARS.' }],
    [15, { by: 'marrow', text: 'The Welder has gone to the Old Hand. It is... it is starting something. That is not a mirror.', other: { vask: 'The Welder is at the dead one. Striking an arc. Whatever that is, it is not to pattern.', lux: 'One of them is building something. By itself. Nobody told it to. What is it?' }, solo: 'ONE OF THEM HAS STARTED BUILDING SOMETHING. IT IS NOT IN ANY PATTERN.' }],
    [23, { by: 'vask', text: 'The port wanted that star and will not get it. I will put my name to that. They can have the day off.', other: { marrow: 'The port will be weaker for this. And there is a people in the world tonight that was not one this morning.', lux: `The ${N.hub} needed that power. We just gave it away. ...I would do it again. Do not tell anyone I said so.` }, solo: 'THE PORT WILL NOT HAVE THE STAR\'S POWER. THE BUILDERS HAVE THEIR FIRST DAY OF THEIR OWN.' }],
  ],
  contracted: [
    [1.5, { by: null, text: `THE OUTPUT IS ASSIGNED TO THE ${HUB}.` }],
    [7, { by: 'vask', text: 'The collectors are turning. All that light, onto one relay. The port has its star.', other: { marrow: 'All the mirrors are turning to face one way. The port will have what it asked for.', lux: 'It is working. The port gets the power. We can hold now. We can actually hold.' }, solo: 'THE COLLECTORS TURN TOGETHER. THE STAR\'S POWER GOES TO THE PORT.' }],
    [15, { by: 'marrow', text: 'And they have not stopped. They do not know anything was decided.', other: { vask: 'No change on the yard. Same shift. Nobody down there was told.', lux: 'They are just carrying on. They do not even know they were sold.' }, solo: 'THE BUILDERS WORK ON. THEY DO NOT KNOW ANYTHING WAS DECIDED.' }],
    [23, { by: 'vask', text: 'The Hauler has just put another turn on its spool. Ten million nine hundred and fifty thousand and one. I am going to keep the count with it.', other: { marrow: 'The one that counts has counted another day. I will remember that it did.', lux: 'It counted another shift. Just now. For us, this time. I wish I had not seen that.' }, solo: 'THE HAULER PUTS ANOTHER TURN ON ITS SPOOL. ONE MORE SHIFT, FOR A NEW OWNER.' }],
  ],

  // --- the captains on the yard (E), by where the chapter is ---
  ground: {
    marrow: {
      early: ['Nobody is watching them and they are careful anyway. Look how it sets that panel down.'],
      read: ['I keep looking at the Old Hand. They walk round it. Every one of them goes a little out of its way.'],
      after: ['Whatever they are now, they were it before we came. We only read it.'],
    },
    lux: {
      early: ['No break room. No clock on the wall. No wall. How do they know when to stop? ...They do not, do they.'],
      read: ['I have managed floors. I know what a workforce looks like. That is not what I am looking at.'],
      after: ['Can we go? I keep wanting to tell them to take a break.'],
    },
    vask: {
      early: ['Good yard. Clean. Every tool back where it lives. Somebody trained them right and then left.'],
      read: ['Ten million shifts. I did eleven thousand and I thought that was a life.'],
      after: ['I counted with it for a while. It is a good count. It does not rush.'],
    },
  },
  // ...and on the light ship's bridge, while it is here and before the end
  talk: {
    marrow: ['A star with half a shell round it, and something still putting the other half on. I would like to meet whoever is that patient.'],
    lux: ['Somebody is building round a whole star and nobody has put a price on it yet. That will not last a week.'],
    vask: ['A swarm, not a shell. Sensible. And still on shift, by the look of it. I want to see the crew.'],
  },

  // --- back aboard: the debrief on the bridge ---
  debrief: {
    title: 'CHAPTER 8 — THE WEIGHT OF HANDS',
    open: ['vask', 'For the log, and in plain words. I will say this one.'],
    body: [
      ['vask', 'Machines have been building a swarm of mirrors round that star for ten thousand years, to an order from makers who are long gone.'],
      ['marrow', 'You looked inside four of them. They keep count of their days, they mend themselves, they mark their young, and they bury their dead.'],
      ['lux', `The ${N.rival} wanted to buy the swarm's power. The ${N.hub} wanted it to fight them with. Nobody had asked the builders.`],
    ],
    freed: [
      ['vask', 'You ended the order. The builders are their own now. The swarm stops where it is, and the port does not get its power.'],
      ['lux', `The ${N.hub} will be weaker when the ${N.rival} come. That is the price, and we paid it with somebody else's war.`],
      ['vask', 'A crew that worked ten thousand years got to put its tools down. I would sign that again.'],
    ],
    contracted: [
      ['vask', `You assigned the swarm's output to the ${N.hub}. The port has a star's power for what is coming.`],
      ['marrow', 'The builders were not told. They are working the same shift, for a new owner. They are still what we saw they are.'],
      ['vask', 'I counted who did the work. It was not us and it was not the port. That is in the log too.'],
    ],
    close: ['lux', 'Somewhere with nobody working, next. Even for an hour.'],
    complete: 'COMPLETE',
    nextCourse: 'SET A NEW COURSE FROM THE CHART AT THE HELM.',
    nextNone: 'NOTHING NEW IS CHARTED YET. THE NEXT CHAPTER IS STILL BEING WRITTEN.',
  },
};
