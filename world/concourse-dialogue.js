// The free port (world/concourse-system.js, concourse-hub.js, concourse-tender.js;
// GDD 5.7.9): every word of Season 1's fourth chapter, and every name in it
// but the season's four placeholders, which come from world/season-names.js
// and are spelled nowhere here. Rename freely.
//
// A crew line is { by, text, other, solo } (world/sceneClock.js crewSay).
// Timed lines are [seconds, line]. Debrief lines are [captain id, text].

import { SEASON_NAMES as N } from './season-names.js';

const HUB = N.hub.toUpperCase();
const TICK = N.currency.toUpperCase();
const tick = N.currency;

export const CONC = {
  id: 'concourse',
  label: `THE ${HUB}`,
  unit: TICK, // what prices are written in: `12 ${unit}S`

  hub: {
    label: `THE ${HUB}`,
    approach: `THE ${HUB} — TRAFFIC HAS YOUR HELM. BERTH NINE, OUTER ARM`,
    welcome: `THE ${HUB} — A FREE PORT. A HUNDRED PEOPLES, ONE MONEY, NO FLAG`,
    dockLabel: `AUTO-LANDING · THE ${HUB}`,
    leaveHint: 'YOUR FREIGHTER IS IN BERTH NINE',
    city: `The ${N.hub}`,
  },
  tender: {
    label: 'THE LOW TENDER',
    approach: `THE LOW TENDER — A ${TICK} MINE'S TOP END HAS YOUR HELM`,
    welcome: 'THE LOW TENDER — THE CABLE GOES DOWN FROM HERE. DO NOT LOOK ALONG IT FOR LONG',
    dockLabel: 'AUTO-LANDING · THE LOW TENDER',
    leaveHint: 'YOUR FREIGHTER IS ON THE PAD',
    city: 'The Low Tender',
  },

  // --- the people ---
  dockmaster: { name: 'Dockmaster Tessaly Varn', species: 'port authority', cityId: `The ${N.hub}` },
  foreman: { name: 'Shift-boss Ruddock Ame', species: 'cable crew', cityId: 'The Low Tender' },
  barkeep: { name: 'Oss', species: 'keeps the bar', cityId: 'The Slow Second' },
  envoy: { name: N.envoy, species: `envoy of the ${N.rival}`, cityId: 'The Slow Second' },
  trader: { name: 'The market', species: 'open stalls', cityId: `The ${N.hub}` },
  bar: 'THE SLOW SECOND',

  // --- the screen ---
  hud: {
    purse: `${TICK}S   `,
    hold: 'HOLD    ',
    job: 'CARGO   COOLANT FOR THE LOW TENDER',
    seeVarn: 'SEE THE DOCKMASTER',
    fly: 'FLY THE COOLANT TO THE LOW TENDER',
    foreman: 'FIND THE SHIFT-BOSS',
    trade: 'BUY HERE, SELL DEAR AT THE PORT',
    sell: 'SELL IT AT THE MARKET',
    bar: 'THE DOCKMASTER SAID: THE SLOW SECOND',
    done: 'DONE — BACK TO THE LIGHT SHIP',
  },
  marks: { varn: 'VARN', market: 'MARKET', bar: 'BAR', foreman: 'RUDDOCK' },
  prompts: { market: 'E — MARKET', bar: 'E — GO IN', sit: 'E — SIT AT THE BAR' },
  skip: 'E — SKIP',

  // --- the market panel ---
  market: {
    title: 'THE MARKET',
    titleTender: 'THE TENDER\'S STORES',
    sub: `${TICK}S IN HAND: {ticks} · HOLD: {held} / {cap}`,
    foot: 'A NUMBER BUYS OR SELLS ONE · X CLOSES · PRICES MOVE',
    buy: 'BUY',
    sell: 'SELL',
    each: `{p} ${TICK}S`,
    poor: `NOT ENOUGH ${TICK}S`,
    full: 'HOLD IS FULL',
    none: 'NONE ABOARD',
    profit: `SOLD FOR MORE THAN YOU PAID. THAT IS THE WHOLE TRADE.`,
  },
  goods: {
    glass: 'VENT GLASS',
    fibre: 'GROWN FIBRE',
    cores: 'SLOW CORES',
    salt: 'COMET SALT',
  },

  // --- arriving ---
  hail: {
    from: 'TRAFFIC',
    lines: [
      `FREIGHTER, THIS IS ${HUB} TRAFFIC. YOU ARE OFF A SHIP WE CANNOT FIT. WE HAVE NEVER SAID THAT BEFORE.`,
      'BERTH NINE IS YOURS. FIRST DAY IS FREE. EVERYTHING AFTER THAT IS NOT.',
      'THE DOCKMASTER WANTS A WORD. SHE WANTS A WORD WITH EVERYONE.',
    ],
  },
  arrive: [
    [3, { by: 'lux', text: 'Oh. Oh, it is a mall. It is the biggest mall I have ever seen and it is in orbit.', other: { vask: 'Two stars. The port sits where their pulls balance. It costs nothing to stay here, so everyone does.', marrow: 'A hundred peoples and none of them is in charge. Listen to it.' }, solo: 'A FREE PORT, PARKED WHERE TWO STARS\' PULLS BALANCE. IT COSTS NOTHING TO STAY, SO EVERYONE DOES.' }],
    [12, { by: 'vask', text: 'Sixty degrees ahead of the small star, same orbit. A ship left here stays here. That is why it is here.', other: { lux: 'I know where everything is. I have never been here and I know where everything is.', marrow: 'The small star is the one that does not look like much. I would not go near it.' }, solo: 'IT KEEPS STATION SIXTY DEGREES AHEAD OF THE SMALLER STAR. NOTHING HAS TO HOLD IT THERE.' }],
  ],

  // --- the dockmaster: what a tick is, and the first job ---
  meet: [
    `Berth nine. You are the one off the ship that does not fit. Good. Sit down, I will not take long.`,
    `Everything here is priced in ${tick}s. One ${tick} is one second. Not one of yours. One that somebody took down a gravity well and brought back.`,
    'The small star is a neutron star. Down near it a clock runs slow. Run a machine down there and it has lived less time than you have when it comes up. The difference is banked. That is the money.',
    'It is slow to mine and it kills people. So there is never much of it. So it is worth something. That is the whole economy; anyone who tells you it is cleverer is selling.',
    `You have none. I have a load of coolant for the Low Tender and nobody free to fly it. Forty ${tick}s on delivery.`,
  ],
  meetOffer: { prompt: 'THE COOLANT RUN', take: `TAKE IT — FORTY ${TICK}S ON DELIVERY`, later: 'NOT YET' },
  meetTaken: ['It is in your hold already. I was fairly sure of you.', 'The Tender is down-orbit, toward the small star. Follow the chart. Do not go past it.'],
  meetAgain: ['The coolant is in your hold. The Tender is down-orbit. It does not deliver itself.'],
  meetAfter: [`Forty ${tick}s. Now you are somebody here. Buy low at the Tender, sell dear up here, and you will be somebody with more.`],
  meetBar: ['You can trade. Good. There is someone in the Slow Second who has been asking the bar when you would get round to coming in.', 'I do not like not knowing how they knew you were coming. Go and find out for me.'],
  meetCrew: { by: 'vask', text: 'Money you can only make by sending people somewhere dangerous. I have worked for that money.', other: { lux: 'A currency you cannot print. Somebody has to go and get it. I respect that. I would not go and get it.', marrow: 'They trade in seconds. I wonder if anyone here has ever simply had one.' }, solo: null },

  // --- the Low Tender ---
  tenderArrive: [
    [3, { by: 'vask', text: 'That cable goes two thousand kilometres down. The machines at the end of it are living slower than we are, right now.', other: { marrow: 'There is a line going down toward the star. I do not want to follow it with my eyes.', lux: 'Is that thing holding us up, or are we holding it up? Do not tell me.' }, solo: 'THE CABLE GOES DOWN TOWARD THE NEUTRON STAR. AT ITS END, CLOCKS RUN SLOW.' }],
  ],
  deliver: [
    'Coolant. About time. The low end has been running hot for two shifts.',
    `Here is your forty. Posted rate. Varn sets it; I only hand it over.`,
    `You want to know what my crew gets for a shift on the cable? Two. Two ${tick}s, for going where the clocks go wrong. The port takes the rest for the berth they sleep in.`,
    'I am not asking. I am telling you the price of what is in your hand.',
  ],
  fee: {
    prompt: `FORTY ${TICK}S, AND WHO MINED THEM`,
    keep: `KEEP THE FEE — IT IS THE POSTED RATE`,
    split: `SPLIT IT — HALF TO THE CREW WHO WENT DOWN FOR IT`,
  },
  kept: ['Posted rate. Nobody will say you did wrong.', 'The stores are open to you. Things are cheap down here. Nobody wants to come and get them.'],
  split: ['...Twenty. To the cable crew. Nobody has done that. I do not know what column it goes in.', 'The stores are open to you. And if you ever need a cable crew that owes you one: you have one.'],
  feeCrew: {
    keep: { by: 'vask', text: 'It is the posted rate. I am only noting who did the work.', other: { lux: 'Forty. That is ours. We flew it. ...It is ours, is it not?', marrow: 'He told you what it cost. He did not ask you for anything. I heard that.' }, solo: null },
    split: { by: 'vask', text: 'Twenty to the people who went down the well for it. That is the first fair price I have seen here.', other: { lux: 'Half! You gave away half! ...All right. It was the right half.', marrow: 'He did not ask. You heard him anyway.' }, solo: null },
  },
  foremanAfter: ['The stores are behind me. Buy what the port is short of. You will see which by the price.'],

  // --- the bar ---
  barScene: [
    [1.5, { by: null, text: 'THE SLOW SECOND.' }],
    [6, { by: 'lux', text: 'Somebody is haggling over there and somebody else is lying about a discount. I am home. I did not think I would be home again.', other: { vask: 'Forty tables. Every one of them a deal being made or regretted.', marrow: 'Every voice in here wants something. It is the most honest room I have been in.' }, solo: 'A ROOM FULL OF PEOPLE BARGAINING. NOBODY LOOKS UP.' }],
    [13, { by: null, text: 'ONE OF THEM LOOKS UP. SHE HAS BEEN WAITING.' }],
  ],
  envoyTalk: [
    'There you are. I have ordered for you. The pale one, no ice. You were going to ask what was good and then have that.',
    'You have no name on any manifest in this port. I know it anyway. I will not say it in here; you would rather I did not.',
    `I am ${N.envoy}. I speak for the ${N.rival}. We sell forecasts. A world buys one, and after that nothing surprises it.`,
    'You are thinking that is impossible. Then you are thinking of the drink. Go on, it is what you wanted.',
    'I am not here to sell you anything. We do not have a forecast for you. That is why I came to look.',
  ],
  envoyAgain: ['The pale one, no ice. I will be here. I usually know where I will be.'],
  barAfter: { by: 'lux', text: 'She knew what you would order. I have worked floors my whole life and I cannot do that. Nobody can do that.', other: { vask: 'She had the drink poured before we were through the door. I timed it.', marrow: 'She was not guessing. I could see her not guessing.' }, solo: 'THE DRINK WAS POURED BEFORE YOU CAME THROUGH THE DOOR.' },
  barkeepTalk: ['She paid for it an hour ago. Said you would be along.'],

  // --- the captains on the deck (E), by where the chapter is ---
  ground: {
    marrow: { early: ['A hundred peoples, and the thing they agreed on was a price. I am not sure whether that is sad.'], after: ['She looked at you the way I look at a bell I already know the note of.'] },
    lux: { early: ['Stall on the left is overcharging. Stall on the right knows it. I love it here.'], after: ['I want to know how she does it. I want to know so badly, and I do not want to know at all.'] },
    vask: { early: ['Every price on this deck is a count of somebody\'s seconds. I keep doing the sums.'], after: ['Someone knew our berth before we had one. I have started a list of who could.'] },
  },
  talk: {
    marrow: ['Two stars and a port between them that belongs to nobody. I would like to hear what a place like that sounds like.'],
    lux: ['A free port. Open stalls. Posted prices. Take me down there. I am asking nicely.'],
    vask: ['A stable point between two masses. You put a thing there and it stays. Sensible place to keep a market.'],
  },

  debrief: {
    title: `CHAPTER 4 — THE ${HUB}`,
    open: ['vask', 'Before anything else. What we learned down there, in plain words.'],
    body: [
      ['vask', `The port's money is the ${tick}: one second, banked by running machines deep in the neutron star's gravity, where clocks run slow. It is scarce because getting it is slow and dangerous.`],
      ['lux', 'We flew a cargo, got paid, bought cheap at the Tender and sold dear at the port. That is the trade. We can do it whenever we like now.'],
    ],
    kept: ['vask', `You kept the posted fee. The cable crew get two ${tick}s a shift. That is in the log, without comment.`],
    split: ['vask', `You gave half the fee to the cable crew who mined it. They will remember. So will I.`],
    tail: [
      ['marrow', `And a woman from the ${N.rival} knew your berth, your drink and your name before you had said a word. They sell forecasts. She said they have none for you.`],
    ],
    close: ['lux', 'I want to go back. Tomorrow. Every day. Just to look.'],
    complete: 'COMPLETE',
    nextCourse: 'SET A NEW COURSE FROM THE CHART AT THE HELM.',
    nextNone: `THE DOCKMASTER HAS SENT FOR YOU. GO BACK DOWN TO THE ${HUB}.`,
  },
};
