// The Forecast of Love (world/love.js, world/love-places.js; GDD 5.7.9): every
// word of Season 1's ninth chapter. It is played at the free port of chapter 4
// and aboard the light ship. The season's placeholder names come from
// world/season-names.js and are spelled nowhere here.
//
// It is the first chapter that is all conversation and place, so the talks are
// kept short: nothing here is longer than the dockmaster's.
//
// A crew line is { by, text, other, solo } (world/sceneClock.js crewSay).
// Timed lines are [seconds, line]. Debrief lines are [captain id, text].

import { SEASON_NAMES as N } from './season-names.js';

const RIVAL = N.rival.toUpperCase();
const FIRST = N.envoy.split(' ')[0];

export const LOVE = {
  short: FIRST.toUpperCase(), // how she is named on a subtitle line
  envoy: { name: N.envoy, species: `envoy of the ${N.rival}`, cityId: 'The Slow Second' },
  aboard: { name: N.envoy, species: `envoy of the ${N.rival}`, cityId: 'The light ship' },

  hud: {
    bar: `${FIRST.toUpperCase()} IS ASKING FOR YOU AT THE SLOW SECOND`,
    home: 'SHE HAS GONE ABOARD. THE HOLODECK, IN THE ARCHIVE.',
    edge: 'WALK TO THE EDGE WITH HER',
    run: 'A / D — STEER · E — SKIP',
    gates: 'GATES   ',
    bottom: 'SHE IS WAITING AT THE BOTTOM',
    end: 'END THE PROGRAM',
    dinner: 'DINNER. THE CREW DECK, THE LONG TABLE.',
    rail: 'SHE IS AT THE RAIL',
    in: 'GO IN',
    done: 'DONE — THE BRIDGE',
  },
  marks: { bar: 'BAR', her: FIRST.toUpperCase(), edge: 'EDGE' },
  prompts: {
    holo: 'E — WYATTMATTOE, THE SKI HILL. WITH HER.',
    ski: 'E — SKI DOWN, WITH HER',
    end: 'E — END THE PROGRAM',
    in: 'E — GO IN',
  },
  skip: 'E — SKIP',

  // --- the bar: she asks ---
  ask: [
    'The pale one, no ice. I did not order it this time. I wanted to see whether you would.',
    'I have a request, and it is not my people\'s. They do not know I am making it.',
    'Your ship keeps three hundred and thirty worlds. I have read forecasts of ten thousand. I have never stood on one that nobody forecast.',
    'Show me one. Any one. I will go aboard now and wait where you keep them.',
  ],
  askCrew: { by: 'lux', text: 'She wants aboard. The one who knew your drink wants to be shown round the ship. I am going to be calm about this.', other: { vask: 'An envoy of theirs, aboard, in the archive. I will count what she touches.', marrow: 'She did not know whether you would order it. I think that is the first thing she has not known in a long time.' }, solo: null },

  // --- the hill: the top ---
  top: [
    'It is cold. I knew it would be cold; I had the temperature. I did not have this.',
    'Nobody forecast this hill. A people skied it for the joy of it and a machine kept the copy. I am standing in something nobody saw coming.',
    'Walk to the edge with me. Then we go down it. I have never done anything I had not read first.',
  ],
  topAgain: ['The edge. Then down. Do not tell me how it goes.'],
  // said on the way down, by how far down it is (0..1): hers, and short
  run: [
    [0.06, 'I do not know where the next turn is!'],
    [0.3, 'I am going to fall. I do not know that. I think it!'],
    [0.55, 'Nobody has this on a page. Nobody!'],
    [0.82, 'Again. I want to go again and not know again.'],
  ],
  gate: 'THROUGH.',
  // --- the hill: the bottom. What she came to say. ---
  told: [
    'I have to tell you something, and I have to do it here, where nothing is on a page.',
    'Before I ever came to the port, the engine ran a forecast on me. They run one on every envoy. Mine said I would meet a pilot and love him.',
    'It gave the bar. It gave the drink. It gave tonight, more or less. I read it eleven months ago.',
    'So I have been asking myself, all the way down that hill: if it was written first, is it mine?',
    'I came anyway. I want that counted. I knew what it said and I came anyway.',
  ],
  toldAgain: ['I came anyway. End the program when you like. I am hungry, and I did not have that forecast either.'],
  toldCrew: { by: 'marrow', text: 'She read it eleven months ago and walked toward it with her eyes open. That is not obeying. I do not know the word for what it is.', other: { vask: 'Forecast eleven months out, to the drink. And she is telling you. That part was not in it, or she would not look like that.', lux: 'They forecast her falling in love. They wrote it down. I would never get out of bed.' }, solo: null },

  // --- dinner: the long table, and whoever is aboard ---
  // [seconds, who]: who is the string 'envoy' with her line after it, or a crew line said by whoever is aboard
  dinner: [
    [2.2, 'envoy', 'Nobody told me what this would taste like. I keep being surprised by a meal.'],
    [8, { by: 'lux', text: 'So you know what we will do before we do it. All of us. Right now.', other: { vask: 'For the log: can you forecast this table? Now?', marrow: 'Do you know what any of us will say next?' }, solo: null }],
    [13.5, 'envoy', 'Not aboard this ship. That is why the engine wants it. That is why I like it.'],
    [19.5, { by: 'vask', text: 'She has eaten everything. Envoys do not, as a rule. They taste and they leave. I counted.', other: { lux: 'She had seconds. I was watching. Spies do not have seconds.', marrow: 'She is not performing this. Look at her hands.' }, solo: null }],
    [25, 'envoy', 'My shuttle leaves at first bell. The forecast has me on it. It has had me on it for eleven months.'],
  ],
  dinnerAlone: 'It is a long table for two. I find I do not mind.',
  dinnerEnd: 'THE TABLE IS CLEARED. SHE HAS GONE AFT, TO THE FREIGHTER\'S PATIO.',

  // --- the patio, at night ---
  patio: [
    'This is yours. This small deck. Not the archive, not the ship. I wanted to see something that was only yours.',
    'First bell is in an hour. The engine has me walking down your ramp and not looking back. It is very sure.',
    'I am not going to. I decided on the hill. I have never decided anything it had not already written, and I would like to start with this.',
    'By morning they will know it was wrong about me. They do not forgive being wrong. There will be a cost and it will not only be mine.',
    'So, before I stay. I can tell you everything I know about the engine, tonight, all of it. Or you can ask me for nothing at all.',
  ],
  choice: {
    prompt: 'BEFORE SHE STAYS',
    nothing: 'ASK HER FOR NOTHING',
    engine: 'ASK WHAT SHE KNOWS ABOUT THE ENGINE',
  },
  trusts: ['...Nothing. You are the first person who has ever wanted nothing I could forecast.', 'Then I am staying because I want to. Write that down somewhere it cannot be read in advance.'],
  wary: ['Of course. It is what I would ask. I will tell you all of it; you will have it by morning.', 'I am still staying. I only know now what I am staying as.'],
  stay: [
    [1.5, { by: null, text: 'FIRST BELL.' }],
    [7, { by: null, text: 'A SHUTTLE LEAVES THE PORT WITH AN EMPTY SEAT. IT WAS FORECAST FULL.' }],
    [14, { by: 'lux', text: 'She stayed. They said she would go and she stayed. Somebody out there is looking at a wrong page right now.', other: { vask: 'One seat empty on that shuttle. That is the whole of the error. They will not treat it as small.', marrow: 'She is watching it go. She is the only one of her people who has ever watched something not happen.' }, solo: 'SHE WATCHES IT GO. SHE IS STILL HERE.' }],
    [21, { by: null, text: `THE ${RIVAL} HAVE BEEN WRONG ABOUT ONE OF THEIR OWN. THEY WILL COME AND CORRECT IT.` }],
  ],
  after: { trusts: ['Go in. I want to stay out here a little and not know what happens next.'], wary: ['Go in. I will write it all out for you. Then I would like to stand here a while as nobody\'s source.'] },

  // --- the captains aboard, while she is ---
  talk: {
    marrow: ['She watches us the way I watch a hall before the first note. As if she does not know the tune. I think she does not.'],
    lux: ['An envoy of theirs is aboard and I am being very normal about it.'],
    vask: ['She has touched nothing in the archive. I checked. She only looked, for a long time.'],
  },

  debrief: {
    title: 'CHAPTER 9 — THE FORECAST OF LOVE',
    open: ['vask', 'In plain words. It matters that we have this one straight.'],
    body: [
      ['marrow', `${N.envoy} asked to stand on a world nobody had forecast. You showed her the ski hill. She told you there that the engine forecast, eleven months ago, that she would love you.`],
      ['lux', 'It also forecast her leaving on the morning shuttle. She did not. She is aboard. She is staying.'],
    ],
    trusts: ['marrow', 'She offered you everything she knows about the engine, and you asked for nothing. She stayed because she wanted to. She trusts you.'],
    wary: ['vask', 'She offered what she knows about the engine and you took it. We have it. She stayed all the same, and she knows now what she is to us.'],
    tail: [
      ['vask', `One of their own did something they had not written. The ${N.rival} do not let that stand. They will come for her, and for the port that took her in.`],
    ],
    close: ['lux', 'So that is how a war starts. With somebody staying for dinner.'],
    complete: 'COMPLETE',
    nextCourse: 'SET A NEW COURSE FROM THE CHART AT THE HELM.',
    nextNone: 'NOTHING NEW IS CHARTED YET. THE NEXT CHAPTER IS STILL BEING WRITTEN.',
  },
};
