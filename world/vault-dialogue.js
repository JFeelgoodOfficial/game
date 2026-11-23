// The Vault (world/vault.js, hooked into world/concourse-system.js; GDD 5.7.9):
// every word of Season 1's eleventh chapter. It is played at the free port and
// aboard the light ship. The season's placeholder names come from
// world/season-names.js and are spelled nowhere here.
//
// A crew line is { by, text, other, solo }. Timed lines are [seconds, line].
// Debrief lines are [captain id, text]. {world} is the archived world on the
// table, {friend} the lost captain's name.

import { SEASON_NAMES as N } from './season-names.js';

const HUB = N.hub.toUpperCase();
const tick = N.currency;

export const VAULT = {
  ship: { name: 'The light ship', species: 'the archive', cityId: 'The light ship' },
  record: { name: 'The archive', species: 'a record, complete', cityId: 'The light ship' },

  hud: {
    varn: 'THE DOCKMASTER HAS THE TWO OFFERS',
    walk: 'WALK {world} ONCE MORE — THE LIGHT SHIP\'S HOLODECK',
    record: 'READ THEIR RECORD — THE LIGHT SHIP\'S ARCHIVE',
    back: 'THE DOCKMASTER IS WAITING FOR AN ANSWER',
    done: 'DONE — BACK TO THE LIGHT SHIP',
    holo: 'THE HOLODECK IS BY THE AFT DOOR: {world}',
    plinth: 'THEIR RECORD IS BY THE AFT DOOR',
  },
  marks: { varn: 'VARN' },
  prompts: { record: 'E — READ THEIR RECORD' },
  skip: 'E — SKIP',

  arrive: { by: 'vask', text: 'Four thousand and some, off the outer ring. On the deck, on the stairs, in the berths. Nobody has counted the children separately.', other: { lux: 'They are sleeping in the market. In the MARKET. Somebody do something. Somebody with money.', marrow: 'Listen to how quiet they are. People who have lost a home do not make noise about it.' }, solo: 'THE DECK IS FULL OF PEOPLE FROM THE OUTER RING. THEY HAVE NOWHERE TO GO.' },

  // --- the dockmaster: two offers, both out of the archive ---
  ask: [
    'You see them. The outer ring held four thousand. The inner rings were built for the people already in them.',
    `The port cannot pay to house them. I have been through the books twice. There is not that much ${tick} in the vault.`,
    'There are two ways it can be paid for, and both of them come out of your archive. I did not arrange that. I only noticed it.',
    `One: the port buys an archived world from you, outright. That is ${tick}s enough to house every one of them. The world leaves your holodeck for good; it is the port's, to licence.`,
    'Two: your ship does what its makers once offered to do for you. It recompiles a world, whole, real, and they live on it. Then it is not a record any more. It is a place, and it is theirs.',
    'Either way it is one world, and you will not walk it again as you do now. Which one is on the table?',
  ],
  which: 'WHICH WORLD?',
  asked: ['{world}. Then go and walk it once more before you tell me which way. I would, and I do not even like scenery.', 'I will be here. So will they.'],
  askedAgain: ['{world} is on the table. Walk it once more, on your holodeck. Then come and tell me which way.'],
  // ...and with a captain lost: the question is a person
  askFriend: [
    'You see them. The outer ring held four thousand. The port cannot pay to house them; I have been through the books twice.',
    'Your ship says it can recompile a world for them. My assessors will not stake four thousand lives on a thing nobody here has seen done.',
    'There is one record aboard your ship that is complete, and small enough to prove it on. A person. {friend}.',
    'Recompile them. If it works, the port has seen it, the method is worth more than the housing, and I pay for every berth myself.',
    'And you have someone back. If it is them. I do not know how you would tell. I am a dockmaster.',
    'Their record is in your archive. Go and look at it before you answer me.',
  ],
  askedFriendAgain: ['{friend}\'s record is in your archive. Read it. Then come and tell me.'],
  walkedCrew: { by: 'marrow', text: 'You walked it as if you were counting the steps. I think you already know.', other: { vask: 'One world against four thousand people. I have run the numbers. They do not help.', lux: 'It is only a recording. It is only a recording. Why does it feel like selling the place itself?' }, solo: null },

  // --- the record of a lost captain, read aloud ---
  friendRecord: [
    'RECORD: {friend}. COMPLETE. EVERY WORD SAID ABOARD, EVERY STEP, EVERY HABIT.',
    'A RECOMPILE WOULD WALK, AND TALK, AND REMEMBER THE HORIZON AS FAR AS THE LAST THING THIS RECORD SAW.',
    'IT WOULD NOT REMEMBER DYING. THE RECORD STOPS BEFORE THAT.',
    'WHETHER THAT IS {friend} IS NOT A QUESTION AN ARCHIVE CAN ANSWER.',
  ],
  recordFrom: 'THE ARCHIVE',
  recordCrew: { by: 'vask', text: 'Every word and every step. It is a full count. I do not know that a full count is a person.', other: { lux: 'It would not know it had died. It would just come in and ask what it had missed. I could not bear it. I want it so much.', marrow: 'I can see everything they were in there. I cannot see whether they are.' }, solo: 'A COMPLETE RECORD. IT STOPS BEFORE THE END.' },

  // --- the decision ---
  decide: ['You have walked it. So. {world}.', `Sold: ${tick}s tonight, berths by morning, and the port owns it. Recompiled: it is real, and theirs, and gone from your ship.`, 'I am not going to tell you which is kinder. I do not think either is.'],
  decideFriend: ['You have read it. So.', 'Recompile {friend}, and four thousand people are housed on the strength of it. Or let them rest, and I put the ring\'s people on the lower docks, on credit, and hope.', 'I will not think less of you for either. I want that said.'],
  // each captain's side, said before the question (only by those aboard)
  sides: [
    { by: 'marrow', text: 'A world nobody lives on is a picture. Let them live on it.' },
    { by: 'lux', text: 'Sell it. Money is clean. A whole real world in the hands of frightened people is not.' },
    { by: 'vask', text: 'Either way one world leaves the manifest. I only ask that we write down which.' },
  ],
  sidesFriend: [
    { by: 'marrow', text: 'I would know them by how they listened. A record cannot listen. Let them rest.' },
    { by: 'lux', text: 'Bring them back. Please. I do not care what it is, if it walks in and says my name.' },
    { by: 'vask', text: 'Four thousand berths against one question nobody can answer. I will not pretend that is a sum.' },
  ],
  choice: {
    prompt: 'THE VAULT',
    sell: `SELL {world} TO THE ${HUB}`,
    recompile: 'RECOMPILE {world} — MAKE IT REAL, AND THEIRS',
    friend: 'RECOMPILE {friend}',
    rest: 'LET {friend} REST',
  },
  after: {
    sold: [`It is the port's. The ${tick}s are counted and the berths are being let now.`, 'Your holodeck has one door fewer. I am sorry for it. I would do it again.'],
    recompiled: ['Then look up, in a little while. There will be a light that was not there.', 'It is theirs. Go and see them, some day. They will not know how to thank a recording for becoming a place.'],
    friend: ['It is done? ...It is done. My assessors are white as sailcloth. I am paying for the berths.', 'Go home. See who is there.'],
    rest: ['Then they rest. I will find room on the lower docks. It will be bad, and it will be a roof.', 'You did not buy your friend back with strangers. I do not know many who would not have.'],
  },
  end: {
    sold: [
      [1.5, { by: null, text: 'BERTH CHITS, COUNTED OUT ONE FAMILY AT A TIME.' }],
      [8, { by: 'vask', text: 'Four thousand and some, housed, on the price of one world. It is the best trade I have seen here and I cannot look at it.', other: { lux: 'They have berths. Real ones. With doors. We did that. It cost a world and we did that.', marrow: 'They are going in to somewhere with a door. Listen: they have started talking.' }, solo: 'THEY ARE HOUSED, ON THE PRICE OF ONE WORLD.' }],
      [16, { by: null, text: '{world} IS THE PORT\'S NOW. IT WILL NOT OPEN FOR YOU AGAIN.' }],
    ],
    recompiled: [
      [1.5, { by: null, text: 'A LIGHT, WHERE THERE WAS NONE. IT HAS WEATHER ALREADY.' }],
      [8, { by: 'marrow', text: 'It is not a record any more. Somebody down there is going to be born on it.', other: { vask: 'One world, off the manifest and into the sky. First entry I have ever struck out for that reason.', lux: 'It is real. It is actually real. Oh, what have we given them? What have we given them?' }, solo: '{world}, REAL, IN THIS SKY. IT IS THEIRS.' }],
      [16, { by: null, text: 'THE BOATS ARE FILLING. {world} IS GONE FROM THE ARCHIVE.' }],
    ],
    friend: [
      [1.5, { by: null, text: 'THE ASSESSORS HAVE SEEN IT DONE. THE BERTHS ARE PAID FOR.' }],
      [8, { by: 'lux', text: 'They are housed. All of them. And somebody is waiting for us at home, and I am afraid to go and see.', other: { vask: 'Four thousand berths, paid. One more aboard than this morning. I have not written the name down yet.', marrow: 'They are housed. And there is someone on our ship I will have to listen to very carefully.' }, solo: 'THEY ARE HOUSED. AND SOMEONE IS ABOARD THE LIGHT SHIP WHO WAS NOT THIS MORNING.' }],
      [16, { by: null, text: 'WHETHER IT IS {friend} IS STILL NOT A QUESTION AN ARCHIVE CAN ANSWER.' }],
    ],
    rest: [
      [1.5, { by: null, text: 'DOWN THE STAIRS, TO THE LOWER DOCKS. THERE IS A ROOF.' }],
      [8, { by: 'marrow', text: 'They will be cold down there. And {friend} is still {friend}, and nobody else. I think that was the price.', other: { vask: 'Lower docks. Three to a berth. On credit. It holds. I will not call it good.', lux: 'We could have had them back. We could have. ...They would have hated what it cost.' }, solo: 'THEY ARE ON THE LOWER DOCKS, THREE TO A BERTH. {friend} RESTS.' }],
      [16, { by: null, text: 'THE RECORD STAYS A RECORD.' }],
    ],
  },
  varnAfter: ['They have a roof. That was always going to happen. How it happened was you.'],

  debrief: {
    title: 'CHAPTER 11 — THE VAULT',
    open: ['vask', 'In plain words. What it cost.'],
    lead: ['vask', 'The outer ring\'s people needed somewhere to live and the port could not pay. Both ways of paying came out of our archive.'],
    sold: [
      ['lux', `You sold {world} to the port. The ${tick}s housed every one of them.`],
      ['marrow', 'It is not ours to walk any more. The holodeck has one door fewer, and it will not come back.'],
    ],
    recompiled: [
      ['marrow', 'You had the ship recompile {world}. It is a real place now, in the port\'s sky, and the ring\'s people live on it.'],
      ['vask', 'It is gone from the archive. A thing cannot be a record and a world at once. We can visit. We cannot keep it.'],
    ],
    friend: [
      ['lux', 'You let the ship recompile {friend}, to prove it could be done. The port paid for every berth on the strength of it.'],
      ['marrow', 'There is someone aboard with {friend}\'s face and {friend}\'s voice. I do not know yet who they are. Neither do they.'],
    ],
    rest: [
      ['marrow', 'They offered you {friend} back, from the record, and you let {friend} rest.'],
      ['vask', 'The ring\'s people are on the lower docks, crowded, on credit. It is a roof. The record is still a record.'],
    ],
    close: ['lux', 'The Tenretni offered you exactly this once. Your whole world, rebuilt. I understand them a little better. I wish I did not.'],
    complete: 'COMPLETE',
    nextCourse: 'SET A NEW COURSE FROM THE CHART AT THE HELM.',
    nextNone: 'NOTHING NEW IS CHARTED YET. THE NEXT CHAPTER IS STILL BEING WRITTEN.',
  },
};
