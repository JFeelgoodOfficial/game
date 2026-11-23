// The Siege (world/siege-helm.js, world/concourse-system.js; GDD 5.7.9): every
// word of Season 1's tenth chapter. It is fought at the free port of chapter 4,
// from the light ship's helm chart. The season's placeholder names come from
// world/season-names.js and are spelled nowhere here.
//
// A crew line is { by, text, other, solo }. Timed lines are [seconds, line].
// Debrief lines are [captain id, text].

import { SEASON_NAMES as N } from './season-names.js';

const HUB = N.hub.toUpperCase();
const RIVAL = N.rival.toUpperCase();

export const SIEGE = {
  dockmaster: { name: 'Dockmaster Tessaly Varn', species: 'port authority', cityId: `The ${N.hub}` },
  helm: { name: 'The helm chart', species: 'the light ship', cityId: 'The light ship' },

  hud: {
    varn: 'THE DOCKMASTER IS CALLING EVERY BERTH',
    toHelm: 'TO THE LIGHT SHIP. THE HELM.',
    wave: 'PASS    ',
    ring: 'OUTER RING  ',
    lost: 'THE LIGHT SHIP WAS HIT. THE PASS IS DRAWN AGAIN.',
    done: 'DONE — BACK TO THE LIGHT SHIP',
  },
  prompts: { toHelm: 'E — TO THE LIGHT SHIP\'S HELM' },
  marks: { varn: 'VARN', berth: 'BERTH' },
  skip: 'E — SKIP',

  call: [
    `Every berth, listen. There is a fleet coming in. Grey ships. They are exactly where their own notice said they would be, to the second.`,
    `They sent the notice a year ago. Nobody read it. It gives today's date and says the outer ring.`,
    'We have forty hulls and whoever owes us a kindness. And one ship nobody has ever forecast. Get to your helm.',
  ],
  callAgain: ['Your helm. Go. The pad will run you up.'],

  // the chart, and the pad it is drawn on
  pad: {
    title: 'THE HELM CHART',
    hint: 'DRAW THE LIGHT SHIP\'S PASS. IT FLIES THE SHAPE. CROSS THEIR LINES, KEEP OUT OF THE RED.',
    undo: 'UNDO', clear: 'CLEAR', done: 'FLY IT',
  },
  intro: [
    [1.5, { by: null, text: `THE ${RIVAL} FLEET. EVERY SHIP ON A LINE DRAWN A YEAR AGO.` }],
    [7, { by: 'vask', text: 'They are not manoeuvring. They do not need to. They know where every one of our ships will be.', other: { marrow: 'They come like a hymn everyone already knows. No one has to look at the page.', lux: 'They are not even hurrying. Why would they? They have read the ending.' }, solo: 'THEY DO NOT MANOEUVRE. THEY ALREADY KNOW WHERE EVERY DEFENDER WILL BE.' }],
    [13, { by: 'marrow', text: 'Every defender but one. They cannot see us. Draw, pilot. The ship goes where you imagine.', other: { vask: 'One hull is not on their chart. Ours. Draw the pass and I will call it.', lux: 'They do not know where we will be. Nobody does. Draw something. Draw anything.' }, solo: 'THE LIGHT SHIP IS NOT ON THEIR CHART. IT GOES WHERE YOU DRAW.' }],
  ],
  // who came, by what was done in earlier chapters (said once, before the first pass)
  allies: {
    choir: { by: 'marrow', text: 'Bells on the hailing band. The Choir has come, in every ship that would fly.', other: { vask: 'Twelve ships from the pulsar. Unarmed, most of them. They came anyway.', lux: 'It is the bell people! They came! They do not even have guns!' }, solo: 'SHIPS FROM THE PULSAR HAVE COME. THEIR BELLS ARE ON THE HAILING BAND.' },
    builders: { by: 'vask', text: 'The builders. Nobody ordered them here. They have put themselves between the fleet and the ring.', other: { marrow: 'The makers of the mirrors are here. They chose it. Nobody told them to.', lux: 'Those are the machines from the swarm. They are in the way on purpose.' }, solo: 'THE SWARM\'S BUILDERS HAVE COME, UNASKED, AND STAND BEFORE THE RING.' },
    cable: { by: 'vask', text: 'Tender boats. Ruddock\'s cable crew. They said they owed us one.', other: { marrow: 'The cable crew has come up from the mine. They remembered.', lux: 'Those little boats are the mine crew. The ones we split the fee with.' }, solo: 'THE CABLE CREW HAS COME UP FROM THE MINE. THEY REMEMBERED THE FEE.' },
    none: { by: 'vask', text: 'Forty port hulls. Nobody else. I had hoped to count more.', other: { marrow: 'Only the port\'s own ships. Nobody has come for us.', lux: 'That is all? That is everyone? Oh.' }, solo: 'ONLY THE PORT\'S OWN SHIPS. NOBODY ELSE HAS COME.' },
  },
  after: [
    'THEIR LINE BROKE WHERE YOU CROSSED IT. THEY HAD NO FORECAST FOR THAT.',
    'AGAIN. THEY ARE REFORMING ON THE OLD LINES. THEY HAVE NOTHING ELSE TO REFORM ON.',
    'THE OUTER RING IS TAKING HITS. IT WAS ALWAYS GOING TO.',
    'THE LAST PASS.',
  ],
  flagship: { by: 'lux', text: 'The big one has guns that reach. Do not draw through the red. Please do not draw through the red.', other: { vask: 'Their flagship. Everything inside the red circle is inside its range.', marrow: 'That one sees further than the rest. Keep outside its circle.' }, solo: 'THE FLAGSHIP\'S GUNS REACH AS FAR AS THE RED CIRCLE. KEEP OUT OF IT.' },

  // the decision, before the last pass
  ask: {
    from: `${HUB} TRAFFIC`,
    lines: [
      'THE OUTER RING WILL NOT HOLD ANOTHER PASS. THERE ARE STILL PEOPLE IN IT.',
      'PULL THE DEFENDERS IN TO COVER THE LIFEBOATS, AND THE RING GOES AT ONCE BUT MOST GET OUT.',
      'KEEP THE LINE, AND THE RING MAY STAND A WHILE LONGER. WHOEVER IS STILL IN IT WHEN IT GOES, STAYS IN IT.',
    ],
    sides: [
      { by: 'lux', text: 'Get them out. I know when to run. This is when. Get them out.' },
      { by: 'vask', text: 'If the line folds they take the ring today. If it holds they may not. I cannot make the count come out.' },
      { by: 'marrow', text: 'There are people behind those lights. I can see every one of the lights.' },
    ],
    prompt: 'THE OUTER RING',
    evac: 'COVER THE LIFEBOATS — GIVE UP THE RING',
    hold: 'HOLD THE LINE',
  },
  chose: {
    evac: ['THE DEFENDERS ARE FALLING BACK ON THE RING. LIFEBOATS ARE AWAY. DRAW THEM A ROAD.'],
    hold: ['THE LINE HOLDS WHERE IT IS. ONE MORE PASS.'],
  },

  // the fixed event: the outer ring falls
  fall: {
    open: [
      [1.5, { by: null, text: 'THE OUTER RING.' }],
      [7, { by: null, text: 'IT GOES DARK ONE SECTION AT A TIME, AS FORECAST.' }],
    ],
    evac: [
      [14, { by: 'lux', text: 'The boats are out. Look at them all. I said run and they ran.', other: { vask: 'Lifeboats clear of the ring. I am counting them as they pass.', marrow: 'They are out. Every light that left is a light that is still lit.' }, solo: 'THE LIFEBOATS ARE CLEAR OF THE RING.' }],
    ],
    hold: [
      [14, { by: 'vask', text: 'The line held. The ring did not. There were people still in the sections that went.', other: { marrow: 'Some of those lights went out with people behind them.', lux: 'We held. We held, and it went anyway, and they were still inside.' }, solo: 'THE LINE HELD. THE RING DID NOT. NOT EVERYONE WAS OUT OF IT.' }],
    ],
    // the two from berth forty, if they were handed over: the debtors' deck is in the outer ring
    debtors: {
      out: { by: 'vask', text: 'The debtors\' deck got its boats away. The two from berth forty were on one. I checked.', other: { marrow: 'The two we handed over are out. I looked for them.', lux: 'The two thieves got out. I do not know why I am so glad.' }, solo: 'THE TWO FROM BERTH FORTY WERE ON A LIFEBOAT.' },
      lost: { by: 'vask', text: 'The debtors\' deck was in the third section. We put two people on that deck.', other: { marrow: 'The debtors\' deck is gone. We sent two people there.', lux: 'The two from berth forty. They were in there. We put them in there.' }, solo: 'THE DEBTORS\' DECK WENT WITH THE RING. THE TWO FROM BERTH FORTY WERE ON IT.' },
    },
    close: [
      [22, { by: null, text: `THE ${RIVAL} STOP AT THE OUTER RING. IT IS ALL THEIR FORECAST ASKED OF TODAY.` }],
      [28, { by: 'marrow', text: 'They did not see us. Not once. Every pass, they looked where we were not.', other: { vask: 'For the log: nothing they fired today was aimed at where we were.', lux: 'They never saw us coming. Not once. They cannot. They actually cannot.' }, solo: 'IN ALL OF IT, THEY NEVER ONCE KNEW WHERE THE LIGHT SHIP WOULD BE.' }],
    ],
  },
  death: 'THE FLAGSHIP HAD THE LIGHT SHIP IN ITS CIRCLE. DRAW THE PASS AGAIN.',
  deathAsk: 'THE LIGHT SHIP WAS LOST ON THE LAST PASS. THE RING IS STILL WAITING FOR AN ANSWER.',

  talk: {
    marrow: ['Something is coming to this port. I can hear the stalls going quiet.'],
    lux: ['The prices stopped moving this morning. Prices only stop when everyone knows something.'],
    vask: ['The envoy crossed to us. The grey ships will have had that on a schedule too.'],
  },

  debrief: {
    title: `CHAPTER 10 — THE SIEGE OF THE ${HUB}`,
    open: ['vask', 'The count, in plain words.'],
    body: [
      ['vask', `The ${N.rival} came for the port with every move already forecast. The port's ships were where the forecast said they would be, and lost.`],
      ['marrow', 'We were not. You drew each pass on the chart and the ship flew it, and they had no line for a thing that was drawn.'],
    ],
    evac: ['lux', 'The outer ring fell. You pulled the line in to cover the lifeboats, so most of the people in it are alive, and homeless.'],
    hold: ['vask', 'The outer ring fell. You held the line, and it fell later, with people still in it. The fleet is in better shape for it. I have both figures.'],
    close: ['lux', 'There are thousands of people on the inner decks with nowhere to go. Somebody is going to ask us for something.'],
    complete: 'COMPLETE',
    nextCourse: `THE ${HUB} HAS NOT FINISHED WITH YOU. GO BACK DOWN.`,
    nextNone: `THE ${HUB} HAS NOT FINISHED WITH YOU. GO BACK DOWN.`,
  },
};
