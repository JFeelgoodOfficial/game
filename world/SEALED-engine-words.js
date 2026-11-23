// SEALED: the owner has not played this yet. Do not open.
//
// Every word of Season 1's chapters 12 and 13 (plans/season-1-arc.md: The
// Engine, The Unforecast), and every name in them but the season's four
// placeholders (world/season-names.js). Rename freely.
//
// A crew line is { by, text, other, solo } (world/sceneClock.js crewSay).
// Timed lines are [seconds, line]. Debrief lines are [captain id, text].

import { SEASON_NAMES as N } from './season-names.js';

const RIVAL = N.rival.toUpperCase();
const ENVOY = N.envoy;

export const ENW = {
  label: 'THE ENGINE',
  dock: {
    label: 'THE OLD GANTRY',
    approach: 'THE ENGINE — AN OLD GANTRY ON ITS RIM STILL ANSWERS. IT HAS YOUR HELM',
    welcome: 'THE OLD GANTRY — TWO BLACK HOLES, AND A MACHINE BUILT ROUND THEM TO SEE EVERYTHING COMING',
    dockLabel: 'AUTO-LANDING · THE OLD GANTRY',
    leaveHint: 'YOUR FREIGHTER IS ON THE GANTRY',
    board12: 'E — TAKE THE VESSEL IN',
    board13: 'E — TAKE THE VESSEL TO THE CORE',
    city: 'The Engine',
  },
  vessel: { name: 'The vessel', species: 'the submersible', cityId: 'The Engine' },
  envoy: { name: ENVOY, species: `once of the ${N.rival}`, cityId: 'The Engine' },
  core: { name: 'The core', species: 'the forecast engine', cityId: 'The Engine' },
  keys: 'Q / E — BAND · L — LAMP · W A S D · SPACE / SHIFT',
  skip: 'E — SKIP',

  hud: {
    board: 'THE VESSEL IS AT THE GANTRY\'S END',
    wave: 'NEXT WAVE  ',
    read: 'READ    ',
    find: 'ONE BAND AT A TIME. EACH SHOWS ONE THING HERE.',
    back: 'BACK OUT TO THE GANTRY',
    done: 'DONE — BACK TO THE LIGHT SHIP',
    gate: 'GAP     ',
    lee: 'IN THE LEE',
    open: 'IN THE OPEN',
    hop: 'SHELTER ',
    act: 'HOLD    ',
    run: 'MERGER  ',
    out: 'CLEAR IN ',
    wait: 'NOT YET',
    now: 'NOW',
  },

  // ---------------------------------------------------------------- chapter 12
  arrive: [
    [1.5, { by: null, text: 'TWO BLACK HOLES, GOING ROUND EACH OTHER. EVERY TURN IS A LITTLE SHORTER THAN THE LAST.' }],
    [8, { by: 'vask', text: 'Sixteen seconds a turn. It was seventeen when we came in. It is losing height the only way it can: by ringing.', other: { marrow: 'They are falling toward each other, and the falling makes a sound. I can feel it in the deck.', lux: 'They are getting closer. They are visibly getting closer. Who builds here?' }, solo: 'THEY CIRCLE EVERY SIXTEEN SECONDS, AND FASTER EACH TIME. THE ORBIT IS RINGING ITSELF AWAY.' }],
    [15, { by: 'marrow', text: 'And round them, that. A machine the size of a moon, built to know everything before it happens.', other: { vask: `The ring round them is the ${N.rival}'s engine. Every forecast they ever sold came out of that.`, lux: 'That is it. That is the thing that knew what I would order.' }, solo: `ROUND THEM, THE ${RIVAL}'S ENGINE: THE MACHINE EVERY FORECAST CAME FROM.` }],
    [22, { by: null, text: 'THE DECK STRETCHES, AND SQUEEZES. A WAVE HAS GONE THROUGH.' }],
  ],
  // she is aboard only if chapter 9 left her so; said once on the gantry
  envoyHere: ['The oldest part is on the inner face, where nobody goes now. I was taken there once, as a child. They do not take children any more.', 'Read it with your lamp. All of it. I only ever saw it in one light.'],
  envoyGone: 'THE OLDEST PART OF IT IS ON THE INNER FACE. NOBODY HAS LIT IT IN A LONG TIME.',
  approach: [
    [1.5, { by: null, text: 'IN, ALONG THE INNER FACE.' }],
    [7, { by: 'lux', text: 'Every sixteen seconds the whole ship gets longer and thinner and then it stops. I am not built for that.', other: { vask: 'One wave a turn. Strain about one part in twenty. The hull is rated for it. We are not rated at all.', marrow: 'It is like being a bell. Something strikes, and we ring, and it passes.' }, solo: 'ONCE A TURN THE HULL STRETCHES AND SQUEEZES. A GRAVITATIONAL WAVE, PASSING THROUGH.' }],
    [14, { by: 'vask', text: 'Older plating ahead. Different rivets. This part was a ship before it was a machine.', other: { marrow: 'This part is older than the rest. It was something else first.', lux: 'That bit does not match. That bit is old. Really old.' }, solo: 'THE PLATING AHEAD IS OLDER THAN THE REST. IT WAS A SHIP ONCE.' }],
  ],
  readHint: 'SIX THINGS HERE, ONE IN EACH BAND. HOLD THE LAMP ON EACH. THE WAVE WILL MOVE YOU: HOLD IT ANYWAY.',
  // what each band shows of the oldest part, in the lamp's own order
  bands: {
    bluegreen: { name: 'THE HULL', find: 'A SURVEY SHIP. SMALL. BUILT TO BE AWAY FOR A YEAR.', line: { by: 'vask', text: 'A survey ship. Crew of forty. They were away when it happened; that is the only reason there was anyone.', other: { marrow: 'A small ship, built to go out and look. It was out looking.', lux: 'It is tiny. This whole machine started as that?' }, solo: 'IT BEGAN AS ONE SMALL SURVEY SHIP, AWAY FROM HOME.' } },
    uv: { name: 'THE NAMES', find: 'NAMES, CUT INTO EVERY WALL. THE CUTS FLUORESCE. THERE IS NO BARE METAL LEFT.', line: { by: 'marrow', text: 'Names. Every wall. They wrote down everyone they could remember, and then they wrote small to fit more.', other: { vask: 'Names. I make it nine million in this compartment. The compartments go on.', lux: 'They are names. All of it. It is all names.' }, solo: 'EVERY WALL IS CUT WITH NAMES. MILLIONS OF THEM.' } },
    ir: { name: 'THE WARM ROOM', find: 'ONE COMPARTMENT IS KEPT AT THE WARMTH OF AN AFTERNOON. NOTHING IN IT NEEDS TO BE.', line: { by: 'lux', text: 'One room is warm. Just one. Somebody has kept one room the temperature of a nice day for a very long time.', other: { vask: 'One compartment held at twenty-two degrees. For centuries. Nothing in it requires it.', marrow: 'One room they kept warm. As you would keep a place at a table.' }, solo: 'ONE ROOM HAS BEEN KEPT WARM FOR CENTURIES, FOR NOBODY.' } },
    halpha: { name: 'THE CHART', find: 'A STAR CHART ON THE BULKHEAD. ONE STAR IS RINGED. IT IS NOT ON ANY CHART NOW.', line: { by: 'vask', text: 'A chart with one star ringed, four thousand light-years off. That star is gone. It went in one second and the light of it was all the warning there was.', other: { marrow: 'One star is marked. It is not in the sky any more.', lux: 'They circled a star. Why would you circle a star? ...Oh.' }, solo: 'ONE STAR IS RINGED ON THEIR CHART. IT DIED IN A SECOND, FOUR THOUSAND YEARS AWAY.' } },
    xray: { name: 'THE CLOCK', find: 'INSIDE THE WALL: THEIR FIRST MACHINE. A CLOCK, AND A SMALL ENGINE TO RUN IT FORWARD.', line: { by: 'marrow', text: 'Inside the wall. A clock, and something to wind it on ahead of itself. That was the first one. That was all it was.', other: { vask: 'In the wall: a clock that runs fast, on purpose. The first forecast was one hour.', lux: 'It is a clock. They built a clock that goes first. So they would never be late again.' }, solo: 'IN THE WALL, THE FIRST ENGINE: A CLOCK BUILT TO RUN AHEAD.' } },
    radio: { name: 'THE BROADCAST', find: 'STILL PLAYING, ON A LOOP: A WEATHER FORECAST. TOMORROW, FAIR. LIGHT WINDS.', line: { by: 'lux', text: 'It is the weather. It is tomorrow\'s weather, from home, from the last day. Fair. They have been playing it ever since.', other: { vask: 'A recording. The last ordinary broadcast from their world. A forecast for a day that did not come.', marrow: 'Listen. A voice saying tomorrow will be fine. It has been saying it for a very long time.' }, solo: 'A RECORDING, LOOPING: THE WEATHER FORECAST FOR A DAY THAT NEVER CAME.' } },
  },
  found: 'READ — {name}. {find}',
  reveal: [
    [1.5, { by: null, text: 'EVERY BAND AT ONCE.' }],
    [8, { by: 'vask', text: 'A burst from a dying star. It travels with its own light, so nothing can see it coming. It reached their world and that was the end of their world.', other: { marrow: 'A star died far away and the dying crossed to them at the speed of seeing. They looked up and it was already there.', lux: 'They never saw it coming. Nobody could have. It arrives at the same moment you can see it.' }, solo: 'A DISTANT STAR DIED, AND ITS LAST LIGHT STERILISED THEIR WORLD. NOTHING COULD HAVE SEEN IT COMING.' }],
    [17, { by: 'marrow', text: 'Forty people on a survey ship came home to that. And they swore one thing. Never again to be surprised.', other: { vask: 'Forty survivors. One resolution: nothing unforecast, ever. Everything since is that resolution, built larger.', lux: 'Forty of them. And they said: never again. I know that feeling. I know exactly that feeling.' }, solo: 'FORTY SURVIVORS CAME HOME TO IT, AND SWORE NEVER TO BE SURPRISED AGAIN.' }],
    [26, { by: 'lux', text: 'It is not greed. All of it, the contracts, the ticks, the fleet. It is one bad day and four thousand years of flinching.', other: { marrow: 'It is grief. All of this is grief, with rivets in.', vask: 'The megaworld was one maker afraid to lose things. This is forty people afraid to be caught out. Same sum.' }, solo: 'THE ENGINE IS THEIR GRIEF, AS THE MEGAWORLD WAS THE TENRETNI\'S.' }],
    [34, { by: 'vask', text: 'And they built it here because the waves from that pair are the cleanest clock there is. Which runs out. I make it days.', other: { marrow: 'They built on the steadiest beat they could find. And the beat is speeding up.', lux: 'They built it round two things that are about to hit each other. To be SAFE.' }, solo: 'THEY BUILT IT HERE FOR THE STEADIEST CLOCK IN NATURE. THE CLOCK IS RUNNING OUT.' }],
  ],
  afterReveal: { by: 'marrow', text: 'I do not know how to fight someone I understand this well.', other: { vask: 'For the log: I would have built it too.', lux: 'I would have signed. I nearly did sign. I am one bad day from being them.' }, solo: null },

  // ---------------------------------------------------------------- chapter 13
  open: [
    [1.5, { by: null, text: `THE ${RIVAL} FLEET HAS COME HOME TO DEFEND IT. EVERY SHIP ON ITS LINE.` }],
    [7, { by: 'vask', text: 'Four turns a second now and climbing. I have the merger at eleven minutes. I will keep the count; it is the one thing here I am sure of.', other: { marrow: 'The beat has become a note. It is rising. There is not long.', lux: 'It is so much faster. It was sixteen seconds. Now I cannot even count it.' }, solo: 'THE PAIR CIRCLE FOUR TIMES A SECOND NOW. MINUTES ARE LEFT, NOT DAYS.' }],
    [13, { by: 'marrow', text: 'Their lines have a pattern. A forecast always does. Fly where I say and you go through the one place it is not.', other: { vask: 'Their formation repeats. Where it repeats there is a gap, every time. I will call it.', lux: 'They are in rows. Rows have gaps. Go through the gaps. Go fast.' }, solo: 'THEIR LINES REPEAT. WHERE THEY REPEAT THERE IS A GAP.' }],
  ],
  gateHint: 'FLY THROUGH THE GAP IN EACH LINE. THE REST OF THE LINE IS SHIPS.',
  gateCall: [
    { by: 'marrow', text: 'There. Low and left. Their third rank always leaves it.', other: { vask: 'Gap, low left. Marked.', lux: 'There! The hole! Go!' }, solo: 'A GAP, LOW AND TO THE LEFT.' },
    { by: 'marrow', text: 'High now. They have covered where we were, not where we are.', other: { vask: 'Gap, high. They closed the last one a second late.', lux: 'Up! It is up now!' }, solo: 'THE NEXT GAP IS HIGH.' },
    { by: 'marrow', text: 'The last line. Straight through the middle. They did not forecast anyone that rude.', other: { vask: 'Last rank. Centre. It is open.', lux: 'The middle! Just go through the middle!' }, solo: 'THE LAST GAP IS IN THE MIDDLE.' },
  ],
  countHint: 'THE WAVES COME FASTER NOW. BE BEHIND A STRUT WHEN EACH ONE PASSES.',
  countCall: { by: 'vask', text: 'Wave in five. Behind the strut. Move between them, not during.', other: { marrow: 'I can hear the next one coming. Get behind something.', lux: 'Hide! Behind the big bit! Now!' }, solo: 'A WAVE IS COMING. GET INTO THE LEE OF A STRUT.' },
  countGo: ['GO. THE NEXT STRUT.', 'AGAIN. THEY ARE CLOSER TOGETHER NOW.', 'THE LAST GAP. THE CORE IS BEHIND THE NEXT ONE.'],

  // the core, and the choice
  coreArrive: [
    { by: 'marrow', text: 'This is the middle of it. It is looking at us and it has nothing to say. I do not think that has happened to it before.', other: { vask: 'The core. Everything else in here is wiring for this.', lux: 'It knows we are here. It did not know we would be. Look at it not knowing.' }, solo: 'THE CORE. IT HAS NO FORECAST FOR YOU BEING HERE.' },
  ],
  ask: {
    from: 'THE CORE',
    lines: [
      'THE LIGHT SHIP\'S LANCE WILL END IT. THE FLEET GOES BLIND, THE WAR STOPS, AND A PEOPLE LOSES THE ONE THING THAT HAS HELD IT TOGETHER.',
      'OR THE ARCHIVE CAN BE GIVEN TO IT. THREE HUNDRED AND THIRTY WORLDS\' WORTH OF THINGS NOBODY FORECAST, AND ONE DRAWING. MORE THAN IT CAN PREDICT.',
      'EITHER WAY THE PAIR MERGES IN MINUTES, AND EVERYTHING THIS CLOSE GOES WITH IT.',
    ],
    sides: [
      { by: 'vask', text: 'End it and the count is finished today. Feed it and I cannot tell you what it becomes. I can only tell you which one I can count.' },
      { by: 'marrow', text: 'It has never once been surprised. I would like to see its face.' },
      { by: 'lux', text: 'I do not care which. I care that we are gone before those two touch. I will tell you when.' },
    ],
    // she speaks last, if she is here
    envoy: `${ENVOY.toUpperCase()} — They are my people. I will not ask you for them. I came here unforecast; so can they.`,
    prompt: 'THE CORE',
    destroy: 'DESTROY IT',
    feed: 'FEED IT THE ARCHIVE',
  },
  chose: {
    destroyed: ['THE LANCE IS CHARGING. HOLD HERE UNTIL IT HAS FIRED.'],
    fed: ['THE ARCHIVE IS GOING ACROSS. HOLD HERE UNTIL IT HAS ALL GONE.'],
  },
  actHint: 'HOLD NEAR THE CORE UNTIL IT IS DONE. THEN RUN.',
  early: { by: 'lux', text: 'Not yet. Not yet. I will say. Not yet.', other: { vask: 'Not finished. Hold.', marrow: 'It is not done. Stay with it.' }, solo: 'IT IS NOT FINISHED. HOLD.' },
  now: { by: 'lux', text: 'NOW. Run. Now now now. This is the one thing I know how to do.', other: { vask: 'Done. Forty seconds to merger. Go.', marrow: 'It is finished. Go. Go while there is a way.' }, solo: 'IT IS DONE. RUN.' },
  runHint: 'OUT, THE WAY YOU CAME. THE WAVES WILL THROW YOU: KEEP THE NOSE ON THE LIGHT.',

  // the fixed event, and what the choice made of it
  end: {
    open: [
      [1.5, { by: null, text: 'THE MERGER.' }],
      [7, { by: 'vask', text: 'Zero. One hole. A few suns\' worth of mass went out of it as that ring you can feel. In a fifth of a second.', other: { marrow: 'One note, the highest it could reach, and then it stops. One bell where there were two.', lux: 'It is over. We are out. It is over and we are out.' }, solo: 'ONE BLACK HOLE WHERE THERE WERE TWO. THE REST LEFT AS A WAVE.' }],
    ],
    destroyed: [
      [15, { by: null, text: `THE ${RIVAL} FLEET HOLDS ITS LINES FOR A MOMENT. THEN THE LINES COME APART.` }],
      [22, { by: 'marrow', text: 'They are blind. Every ship. They are looking round as if the lights have gone out.', other: { vask: 'No forecasts. Four thousand years of schedule, ended. They do not know what the next minute is.', lux: 'They do not know what to do. Nobody has ever not told them what to do.' }, solo: 'THE FLEET IS BLIND. FOR THE FIRST TIME, NONE OF THEM KNOWS WHAT COMES NEXT.' }],
    ],
    fed: [
      [15, { by: null, text: 'THE CORE GOT CLEAR OF IT. IT IS STILL RUNNING. IT HAS STOPPED ISSUING FORECASTS.' }],
      [22, { by: 'marrow', text: 'It is looking at the drawing. It has been looking at the drawing since it arrived. It has no idea what happens next, and it has not looked away.', other: { vask: 'No forecast issued in ninety seconds. It has never gone nine. It is reading.', lux: 'It stopped. It is just... looking at things. Like you do.' }, solo: 'THE ENGINE HAS STOPPED FORECASTING. IT IS LOOKING AT WHAT IT WAS GIVEN.' }],
    ],
    // her, by what was chosen and by how she crossed in chapter 9
    ione: {
      aboardFed: [29, { by: null, text: `${ENVOY.toUpperCase()} IS AT THE GLASS. "IT IS CURIOUS," SHE SAYS. "SO AM I. I WILL STAY AND FIND OUT WHAT WE DO."` }],
      aboardDestroyed: [29, { by: null, text: `${ENVOY.toUpperCase()} IS AT THE GLASS, WATCHING HER PEOPLE'S SHIPS DRIFT. SHE DOES NOT TURN ROUND. SHE DOES NOT LEAVE.` }],
      gone: [29, { by: null, text: `${ENVOY.toUpperCase()} HAS STAYED WITH THE CORE. SOMEBODY HAS TO TEACH IT WHAT A SURPRISE IS FOR. SHE DID NOT ASK YOU FIRST.` }],
      lost: [29, { by: null, text: `${ENVOY.toUpperCase()} WENT BACK IN FOR HER PEOPLE AS IT CAME APART. NOBODY SAW HER COME OUT.` }],
      none: [29, { by: null, text: 'NOBODY ABOARD HAS A PEOPLE ON THOSE SHIPS. THE GLASS IS EMPTY.' }],
    },
    close: [
      [37, { by: 'lux', text: 'I said when. Did you hear me? I said when and it was right.', other: { vask: 'For the log: the call to run came inside one second of the last possible moment. I could not have made it.', marrow: 'We left exactly when we had to. I did not see it. Someone did.' }, solo: 'YOU LEFT WITH A SECOND TO SPARE.' }],
      [44, { by: null, text: 'IT WAS ALWAYS GOING TO MERGE. NOTHING ELSE TODAY WAS FORECAST.' }],
    ],
  },
  death: {
    wall: 'THE VESSEL MET THE LINE. THE GAP IS STILL WHERE IT WAS.',
    wave: 'THE WAVE CAUGHT THE VESSEL IN THE OPEN. BACK BEHIND THE LAST STRUT.',
    merger: 'THE PAIR MERGED WITH THE VESSEL STILL INSIDE. THE CORE IS STILL WAITING FOR AN ANSWER.',
    left: 'THE VESSEL LEFT BEFORE IT WAS DONE. THE CORE IS STILL WAITING FOR AN ANSWER.',
  },

  talk12: {
    marrow: ['Two things falling into each other for a billion years, and somebody built on them. I want to see what kind of fear does that.'],
    lux: ['That is where it comes from. Every forecast. I thought it would look more certain.'],
    vask: ['A binary that tight sheds its orbit as waves. You can time anything by it. Until you cannot.'],
  },
  talk13: {
    marrow: ['I know why they built it now. It does not make it easier. It makes it the only thing I can think about.'],
    lux: ['Their whole fleet is in there. And those two are about to touch. Tell me we have a way out. Then tell me again.'],
    vask: ['I have the merger to the second. It is the first forecast I have ever made and I hate that it is right.'],
  },

  debrief12: {
    title: 'CHAPTER 12 — THE ENGINE',
    open: ['vask', 'What we read in there, in plain words.'],
    body: [
      ['vask', `The ${N.rival}'s engine is built round two black holes that are spiralling together. Every turn sends a wave through everything near, and the turns are getting faster.`],
      ['marrow', 'Its oldest part was a survey ship. Its crew came home to a world a dying star had ended in a second, with no warning anyone could have had.'],
      ['lux', 'Forty of them. They swore never to be surprised again, and everything since is that. The contracts, the fleet, all of it. It is grief.'],
      ['vask', 'And the clock they built on is running out. The pair will merge. The engine is racing it.'],
    ],
    close: ['marrow', 'We are at war with people I would have been. I do not know what winning is now.'],
    complete: 'COMPLETE',
    nextCourse: 'THE ENGINE HAS NOT FINISHED WITH YOU. GO BACK TO THE GANTRY.',
    nextNone: 'THE ENGINE HAS NOT FINISHED WITH YOU. GO BACK TO THE GANTRY.',
  },
  debrief13: {
    title: 'CHAPTER 13 — THE UNFORECAST',
    open: ['vask', 'The last count of it, in plain words.'],
    body: [
      ['marrow', 'We went through their lines where the pattern left a gap, and in to the core between the waves.'],
    ],
    destroyed: [
      ['vask', `You destroyed the engine. The ${N.rival} fleet is blind and the war is over. So is the only thing that held those people together.`],
      ['marrow', 'They are afraid again, the way they were on the first day. We did that. I am not saying it was wrong.'],
    ],
    fed: [
      ['vask', 'You gave the engine the archive. Three hundred and thirty worlds and one drawing. It cannot forecast them, and it has stopped trying.'],
      ['marrow', 'It is curious. The Tenretni learned that from you, and now this has. I think it is the only thing you teach.'],
    ],
    ione: {
      aboardFed: ['lux', `${ENVOY} is still aboard. She says she wants to see what her people do next, and that for once she cannot guess.`],
      aboardDestroyed: ['lux', `${ENVOY} is still aboard. She has not said much. She has not left.`],
      gone: ['lux', `${ENVOY} stayed with the engine, to teach it. She did not say goodbye. I think she thought we knew.`],
      lost: ['lux', `${ENVOY} went back for her people when it broke up. We have not found her. We are still looking.`],
      none: ['lux', 'Nobody we knew was on those ships. I keep thinking somebody should have been.'],
    },
    tail: [
      ['vask', 'The pair merged, as it was always going to. We were clear by one second. Somebody called it, and I am glad it was not me.'],
    ],
    close: ['lux', 'I would like a week where nothing happens. I would like to not know what is in it.'],
    complete: 'COMPLETE',
    nextCourse: 'SET A NEW COURSE FROM THE CHART AT THE HELM.',
    nextNone: 'NOTHING NEW IS CHARTED YET. THE NEXT CHAPTER IS STILL BEING WRITTEN.',
  },
};
