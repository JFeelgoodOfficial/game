// Shore Leave (world/shore.js, world/concourse-system.js; GDD 5.7.9): every
// word of Season 1's fourteenth and last chapter. It is played at the free
// port and aboard the light ship. The season's placeholder names come from
// world/season-names.js and are spelled nowhere here.
//
// It reads how the season ended (the fixed event `merger`: 'blind' | 'curious';
// `ch13.ione`: 'aboard' | 'gone' | 'lost') and says nothing of how.

import { SEASON_NAMES as N } from './season-names.js';

const HUB = N.hub.toUpperCase();
const tick = N.currency;

export const SHORE = {
  barkeep: { name: 'Oss', species: 'keeps the bar', cityId: 'The Slow Second' },
  ship: { name: 'The light ship', species: 'the archive', cityId: 'The light ship' },
  envoyShort: N.envoy.toUpperCase(),

  hud: {
    bar: 'THE SLOW SECOND IS OPEN AGAIN',
    home: 'DINNER, ABOARD. THE LONG TABLE.',
    archive: 'THE ARCHIVE: WHAT IT HOLDS NOW',
    bridge: 'BACK TO THE BRIDGE',
    done: 'THE HELM CHART',
  },
  marks: { bar: 'BAR', archive: 'ARCHIVE' },
  prompts: { bar: 'E — GO IN', archive: 'E — WHAT THE ARCHIVE HOLDS NOW' },

  // --- the bar: the argument about what a second is worth ---
  bar: {
    open: [
      `They are rebuilding the outer ring with whatever floats. Half my stools are scaffold now. Sit on what is left.`,
      `The whole room is having one argument. What is a ${tick} worth now?`,
    ],
    blind: [
      `A ${tick} was a second somebody could promise you. The ${N.rival} promised a great many. They cannot see tomorrow any more, so nobody can promise anything.`,
      `Half the room says the ${tick} is finished. The other half says it is the first honest money we have had: a second nobody knows the end of.`,
    ],
    curious: [
      `A ${tick} was a second somebody could promise you. The ${N.rival} have stopped promising. They have started asking what will happen, like the rest of us.`,
      `They came in here yesterday, three of them, and asked me what was good. Asked. I gave them the pale one, no ice.`,
    ],
    close: [`I say a second is worth what you do with it. I have always said it. Nobody used to buy me a drink for it.`],
  },
  barCrew: { by: 'lux', text: 'Prices are moving again. Nobody knows where. Do you know, I think I can live with that.', other: { vask: 'The market has no forecast to lean on. It is counting for itself. Badly. It will improve.', marrow: 'Listen to them argue. Nobody in here knows how it comes out. It is the best sound I have heard in this port.' }, solo: 'THE WHOLE ROOM IS ARGUING, AND NOBODY KNOWS HOW IT COMES OUT.' },

  // --- dinner aboard: [seconds, who, line]; `who` a captain's line set, or 'envoy' ---
  dinnerT: 34,
  dinner: [
    [2.5, { by: 'vask', text: 'Places laid for everyone who is here. I counted twice. I am allowed.', other: { marrow: 'A place for everyone who is here. I have sung for the ones who are not.', lux: 'Everyone who is here is here. Let us not count the rest tonight. Tomorrow.' } }],
    [9, 'envoy', 'I was forecast to be somewhere else tonight. I have no idea what happens next. Pass the bread.'],
    [15.5, { by: 'marrow', text: 'When we came out of the dark I said nothing ahead of us had a name. Some of it has names now. We gave them.', other: { vask: 'We left with an empty chart. It has entries now. I wrote them.', lux: 'We have been to places. Actual places. And come back from them. I keep being surprised by that.' } }],
    [22, { by: 'lux', text: 'I am still frightened. I thought it would be gone by the end. It is just not in charge any more.', other: { vask: 'I have stopped keeping a count of what we lost against what we kept. It was never going to balance.', marrow: 'I see less than I thought I did. I see it better.' } }],
    [28.5, { by: 'vask', text: 'To whatever is next. I have no figure for it. Good.', other: { marrow: 'To what is next. I cannot see it. Good.', lux: 'To whatever is next. Do not tell me. I mean it this time.' } }],
  ],
  dinnerAlone: [[3, null, 'THE LONG TABLE. ONE PLACE LAID. YOU EAT, AND THE SHIP HUMS.'], [16, null, 'EVERY CABIN ON THIS DECK HAS A LIGHT LEFT ON.'], [27, null, 'YOU RAISE A GLASS TO THEM. THE HULL IS FULL OF THEIR COLOURS.']],
  dinnerEnd: 'THE TABLE IS CLEARED. THE ARCHIVE IS AFT.',

  // --- the archive: its gains and its losses, from what was done ---
  archive: {
    open: 'THE ARCHIVE, AS IT STANDS.',
    sold: 'ONE ROW IS DARK: A WORLD SOLD, TO HOUSE THE PEOPLE OF THE OUTER RING. IT WILL NOT BE WALKED AGAIN.',
    recompiled: 'ONE ROW IS DARK: A WORLD MADE REAL, AND LIVED IN. IT IS NOT A RECORD ANY MORE. IT IS A PLACE.',
    friend: 'EVERY ROW IS LIT. WHAT THE ARCHIVE GAVE UP WAS NOT A WORLD.',
    rest: 'EVERY ROW IS LIT. ONE RECORD WAS LEFT AS A RECORD. IT IS STILL HERE.',
    callers: 'ONE NEW ENTRY: A CALL, ON THE 21 CENTIMETRE BAND, FOR A SKY.',
    noCallers: 'ONE ENTRY IS EMPTY ON PURPOSE. A PEOPLE UNDER ICE, LEFT AS THEY WERE.',
    fed: 'AND ALL OF IT HAS BEEN GIVEN ONCE, WHOLE, TO SOMETHING THAT HAD NEVER BEEN SURPRISED. NOTHING WAS TAKEN. IT IS ALL STILL HERE.',
    kept: 'ALL OF IT IS STILL ONLY HERE. NOTHING ELSE IN THE SKY REMEMBERS THREE HUNDRED AND THIRTY WORLDS.',
    close: 'IT IS NOT WHAT IT WAS WHEN YOU SET OUT. NEITHER ARE YOU.',
  },

  // --- the helm, once, after it has all been talked over ---
  helm: ['THE CHART HAS FILLED AND EMPTIED AND FILLED.', 'THERE IS A PART OF IT WITH NOTHING ON IT YET.', 'IMAGINE SOMEWHERE.'],

  debrief: {
    title: 'SEASON 1 — THE VOYAGE',
    open: ['vask', 'One last count, and then I will stop.'],
    body: [
      ['vask', 'We came out of the dark with an empty chart and a full archive. We have been to a world of dusk, an ocean under ice, a city on a clock, a choir, a yard of machines, and this port, more than once.'],
      ['marrow', `Everything large that happened, was going to happen. The flare. The siege. The end of the engine. What was ours was how.`],
    ],
    blind: ['lux', `The ${N.rival} cannot see tomorrow any more. Neither can we. It turns out we are better at it than they are.`],
    curious: ['lux', `The ${N.rival} have started asking questions. I did not know you could teach an empire to be curious. You did it with a drawing.`],
    ione: {
      aboard: ['marrow', `${N.envoy} is aboard, and nobody forecast it. She says it is the best thing that ever happened to her schedule.`],
      gone: ['marrow', `${N.envoy} went her own way. Nobody forecast that either. I hope it is somewhere she did not expect.`],
      lost: ['marrow', `${N.envoy} is not at the table. She chose where to be, at the end, and it was not on anyone's page.`],
    },
    close: ['lux', 'Where next? Do not tell me. Imagine it, and I will find out when we get there.'],
    complete: 'COMPLETE',
    next: 'THE HELM CHART HAS A BLANK PART. STAND AT IT.',
  },
};
