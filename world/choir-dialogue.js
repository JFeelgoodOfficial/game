// The Pulsar Choir (world/choir-system.js, world/choir-hall.js; GDD 5.7.9):
// every word of Season 1's seventh chapter, and every name in it but the
// season's placeholders, which come from world/season-names.js and are spelled
// nowhere here. Rename freely: the code reads these and spells none of them.
//
// A crew line is { by, text, other, solo } (world/sceneClock.js crewSay): said
// by its captain if they are aboard, by whoever is if not (in `other[id]`'s
// words where given), and with nobody left it is `solo`. This is Marrow's
// chapter: her lines carry the teaching, another captain's `other` carries it
// where she is lost, and with nobody aboard the `solo` is the hall's own
// eldest, or what the pilot hears for himself. Timed lines are [seconds, line].
// Debrief lines are [captain id, text].

import { SEASON_NAMES as N } from './season-names.js';

const RIVAL = N.rival.toUpperCase();

export const CHOIR = {
  id: 'choir',
  label: 'THE PULSAR CHOIR',
  people: 'THE CHOIR',

  hall: {
    label: 'THE CHOIR HALL',
    approach: 'THE CHOIR HALL — A BELL IS TOLLING YOU IN. IT HAS YOUR HELM',
    welcome: 'THE CHOIR HALL — BUILT TO ONE NOTE, AND THE NOTE HAS MOVED',
    dockLabel: 'AUTO-LANDING · THE CHOIR HALL',
    leaveHint: 'YOUR FREIGHTER IS ON THE FORECOURT',
    city: 'The Choir Hall',
  },
  eldest: { name: 'First Voice Anselm Corr', species: 'eldest of the Choir', cityId: 'The Choir Hall' },
  actuary: { name: 'An actuary', species: `of the ${N.rival}`, cityId: 'The Choir Hall' },

  // --- the screen ---
  hud: {
    eldest: 'FIND THE FIRST VOICE, AT THE ALTAR',
    listen: 'STAND ON THE LISTENING RING. LAMP TO RADIO. POINT IT AT THE STAR, THROUGH THE ROSE.',
    signal: 'THE STAR ',
    noRadio: 'THE STAR — SWITCH THE LAMP TO RADIO TO HEAR IT',
    stand: 'TAKE THE CANTOR\'S STAND',
    hymn: 'HYMN    ',
    hear: 'LISTEN…',
    yours: 'YOUR TURN  1 · 2 · 3 · AND 4 WHERE IT BREAKS',
    starPad: 'THE STAR\'S NOTE NEEDS THE LAMP ON RADIO',
    back: 'STEP BACK TO THE STAND',
    ask: 'THE FIRST VOICE IS WAITING',
    done: 'DONE — BACK TO THE LIGHT SHIP',
  },
  keys: 'Q — CHANGE BAND · L — LAMP',
  skip: 'E — SKIP',
  pads: ['LOW BELL', 'MID BELL', 'HIGH BELL', 'THE STAR'],
  marks: { eldest: 'CORR', rose: 'THE RING', stand: 'THE STAND' },
  prompts: { stand: 'E — TAKE THE CANTOR\'S STAND' },

  // --- arriving: the hall, and the bells going wrong in it ---
  arrive: [
    [1.5, { by: null, text: 'THE CHOIR HALL.' }],
    [6, { by: 'marrow', text: 'Every rib of it is cut to one length. One note. They built a cathedral you could tune a star by.', other: { vask: 'Every span the same length. To the hair. It is built to a wavelength.', lux: 'It is enormous. Why is everything in it exactly the same size as everything else?' }, solo: 'EVERY RIB OF THE HALL IS CUT TO THE SAME LENGTH. IT IS BUILT TO ONE NOTE.' }],
    [12, { by: null, text: 'THE BELLS BEGIN THE HOUR. THEY DO NOT FINISH IT.' }],
    [17, { by: 'marrow', text: 'They stopped. Mid-phrase. Nobody stops a bell mid-phrase.', other: { vask: 'Eleven strokes of what should be twelve. They gave up on the twelfth.', lux: 'They just stopped. Everyone in there is standing very still.' }, solo: 'THE BELLS STOP PART WAY THROUGH. NOBODY IN THE HALL MOVES.' }],
  ],

  // --- the First Voice: what the star was to them, and what it has done ---
  meet: [
    'You heard that. Then you have heard all of it. Come in under the ribs.',
    'The star turns three hundred times in a breath, and has done since before we had breath. Each turn is a pulse. So many, so fast, that what we hear is not a beat. It is a note.',
    'Our hours are counted in it. Our law is dated by it. Every bell in this hall is cast to sing with it. In nine thousand years it never moved by a hair.',
    'Forty days ago it moved. It sped up. All at once, between one pulse and the next. Every bell we own is flat, and every hour since has been the wrong length.',
    'Some here say the star has broken. Some say we have. Go and stand on the listening ring, look through the rose, and hear it for yourself. Your lamp has an ear, I am told.',
  ],
  meetAgain: ['The listening ring, on the floor behind you. Point your lamp\'s ear at the star, through the rose, and listen to what it has done.'],
  meetCrew: { by: 'marrow', text: 'A whole faith with one fixed point. I know how that feels. I know how it feels when it moves, too.', other: { vask: 'One reference clock for everything. No second source. I would not have signed that off.', lux: 'They bet everything on one thing never changing. That is the bravest thing I have ever heard of. Or the other thing.' }, solo: null },

  // --- on the listening ring: the star, heard ---
  heard: [
    { by: 'marrow', text: 'There. That is it. And that is not the note this hall is cut to. It is sharp of it. Only a little.', other: { vask: 'Got it. It reads high against the ribs. A small step, and steady.', lux: 'I can hear it. It is higher than the bells. It is definitely higher than the bells.' }, solo: 'THE STAR\'S NOTE. IT IS A LITTLE HIGHER THAN THE NOTE THE HALL IS BUILT TO.' },
    { by: 'marrow', text: 'It is not broken. Listen to how even it is. It took one step and it is as steady on the new stair as it was on the old.', other: { vask: 'No drift. It stepped once and held. A glitch: the crust slips, the star spins up, and that is the end of it.', lux: 'It is not wobbling or anything. It just... moved up one. And stayed.' }, solo: 'IT IS STEADY. IT STEPPED UP ONCE, AND IT HAS HELD THE NEW NOTE EVER SINCE.' },
  ],
  standHint: 'THE CANTOR\'S STAND IS IN THE MIDDLE OF THE NAVE. NOBODY HAS STOOD AT IT IN FORTY DAYS.',

  // --- the stand: the old hymn, and where it breaks ---
  teach: [
    { by: 'marrow', text: 'They will sing you the old hymn. It will stop where the star\'s note used to go. Do not mend it. Sing theirs back, and put the star\'s own note in the gap.', other: { vask: 'They sing; it breaks at the star\'s part. Repeat what they sang. Where it breaks, give them the star as it is now.', lux: 'They are going to sing and then stop. Sing it back. In the stop, play them the real star. The new one.' }, solo: 'THEY WILL SING THE OLD HYMN, AND STOP WHERE THE STAR\'S NOTE WENT. SING IT BACK: 1, 2, 3 FOR THE BELLS, AND 4, THE STAR AS IT IS NOW, IN THE GAP.' },
  ],
  wrong: 'NOT THE HYMN. THEY SING IT AGAIN.',
  right: [
    'A VOICE IN THE NAVE TAKES IT UP.',
    'MORE OF THEM. THE NEW NOTE DOES NOT SOUND WRONG IN IT.',
    'THE WHOLE HALL HAS IT.',
  ],
  chorus: [
    [1.5, { by: null, text: 'THE BELLS COME IN. ALL OF THEM.' }],
    [8, { by: 'marrow', text: 'Hear it? The step is in the tune now. Where the star moved, the hymn moves. It was never a wrong note. It was the next one.', other: { vask: 'They have written the glitch into the count. The hour comes out even again. I checked it twice.', lux: 'They are singing the wrong note on purpose and it is the best part. How is it the best part?' }, solo: 'THE HYMN NOW STEPS WHERE THE STAR STEPPED. IT IS NOT A WRONG NOTE ANY MORE. IT IS THE NEXT ONE.' }],
    [17, { by: null, text: 'EVERY RIB IN THE HALL IS RINGING WITH IT.' }],
    [24, { by: 'marrow', text: 'I used to think seeing clearly meant knowing what came next. Look at them. They do not know when it will move again, and they are singing.', other: { vask: 'Nobody here can say when the next one comes. They have stopped needing to. I am writing that down.', lux: 'They still do not know when it will happen again. They are not even scared. I am taking notes.' }, solo: 'NOBODY HERE KNOWS WHEN THE STAR WILL MOVE AGAIN. THEY ARE SINGING ANYWAY.' }],
  ],

  // --- the actuary, by the altar: courteous, and already sure ---
  actuaryTalk: [
    `Good hour. I am here for the ${N.rival}. You will ask me what we are offering. A table.`,
    'Every glitch this star will have for nine thousand years: the day, the pulse, the size of the step. Their bells could be recast in advance. No hour would ever be the wrong length again.',
    'You will ask the price. Their allegiance, and the hall. It is a fair price. They will say so themselves, in time; I have the date.',
  ],
  actuaryAfter: {
    free: ['No table, then. That was one of two outcomes. I will say it was the less likely, and I would like you to know that surprised nobody but me.'],
    forecast: ['The first table is on the altar. The next step is in two hundred and six years. They need not listen for it now.'],
  },

  // --- the decision ---
  decide: {
    lines: [
      'You gave us our hymn back with the wound still in it, and it holds. I did not think it would hold.',
      'And there is the table. Every step the star will ever take, written down, for the price of this hall and our word.',
      'Half my people want never to be caught out again. Half heard what happened in the nave just now. I am First Voice. I do not have a casting vote; I have yours.',
    ],
    prompt: 'THE FIRST VOICE IS ASKING',
    free: 'KEEP YOUR OWN TIME — LISTEN FOR THE NEXT STEP, AND SING IT',
    forecast: 'TAKE THE TABLE — NEVER BE CAUGHT OUT AGAIN',
  },
  free: {
    lines: ['Then we listen. Every hour, as we always did, and when it moves we will move.', 'If you ever need a people who are not afraid of the next note: ring for us.'],
    crew: { by: 'marrow', text: 'They chose not to know. On purpose. I have never seen anyone do that with their eyes open.', other: { vask: 'No table. They will count the star themselves and take what comes. It is slower. It is theirs.', lux: 'They turned down never being surprised. I could not have. I am glad I was here to watch someone do it.' }, solo: null },
    scene: [
      [1.5, { by: null, text: 'THE HALL RINGS THE HOUR. THE WHOLE HOUR.' }],
      [8, { by: null, text: 'THE ACTUARY CLOSES HIS CASE.' }],
    ],
  },
  forecast: {
    lines: ['Then we take the table. No child here will be frightened by the sky again.', 'The bells will be still until the hour it names. It is strange to hear them still.'],
    crew: { by: 'marrow', text: 'They will never be wrong about the star again. They will never listen to it again either. I could see both, and I could not tell them which was the larger.', other: { vask: 'Every step for nine thousand years, on one sheet. And the hall signed over. I have the count of what it cost; they do not yet.', lux: 'I would have taken it. I want you to know I would have taken it, and I am not sure they were right.' }, solo: null },
    scene: [
      [1.5, { by: null, text: 'THE TABLE IS SET ON THE ALTAR. THE BELLS ARE TIED.' }],
      [8, { by: null, text: 'THE NEXT HOUR IS RUNG ON SCHEDULE. NOBODY LOOKS UP FOR IT.' }],
    ],
  },
  after: ['The star keeps its note. Go well, listener.'],

  // --- the captains in the hall (E), by where the chapter is ---
  ground: {
    marrow: {
      early: ['I was a Cantor. I have rung a wrong hour. I know that silence in there; I have stood in it.'],
      mid: ['They do not need a new star. They need someone to tell them the old one is allowed to move.'],
      after: ['I came to teach them something. I think it was the other way about.'],
    },
    lux: {
      early: ['It is so quiet. Nobody is selling anything. I do not know where to stand.'],
      mid: ['A table of every bad day in advance. Do you know what I would pay for that? Do not answer.'],
      after: ['I keep humming it. The bit with the wrong note. It is stuck in my head.'],
    },
    vask: {
      early: ['Three hundred and thirty-three ribs a side. I counted on the way in. It is the star\'s old number.'],
      mid: ['The star slipped by one part in sixteen. For a pulsar that is enormous. I have never read of one that large.'],
      after: ['Their hour is a different length now. They changed the length of an hour. I am still thinking about that.'],
    },
  },
  // ...and on the light ship's bridge, while it is here and before the end
  talk: {
    marrow: ['There is a note coming from that star. I can nearly hear it from here. I would like to go and stand in it.'],
    lux: ['A whole people who set their clocks by one thing. I hope it is a reliable thing. For their sake.'],
    vask: ['A millisecond pulsar. Steadier than any clock we carry. If one of those is off, I want to see by how much.'],
  },

  // --- back aboard: the debrief on the bridge ---
  debrief: {
    title: 'CHAPTER 7 — THE PULSAR CHOIR',
    open: ['marrow', 'Let me say this one. What happened in the hall, in plain words.'],
    body: [
      ['marrow', 'The Choir set every hour, law and hymn by a pulsar that had not changed in nine thousand years. Forty days ago it sped up, all at once. A glitch. Their faith was breaking over it.'],
      ['vask', 'You stood on the listening ring and heard the star was steady on its new note. Then you sang their hymn back with the new note in the gap, and the hall took it up.'],
    ],
    free: [
      ['marrow', `The ${N.rival} offered a table of every glitch to come, for the hall and their word. You told them to keep their own time. They will listen for the next step and sing it.`],
      ['lux', 'They said to ring for them if we ever need a people who are not afraid of the next note. I think they meant it.'],
    ],
    forecast: [
      ['marrow', `The ${N.rival} offered a table of every glitch to come, for the hall and their word. You told them to take it. They will never be caught out again, and they have stopped listening.`],
      ['lux', 'I would have chosen the same. I keep saying that. The hall belongs to somebody else now.'],
    ],
    close: ['vask', 'For the log: the hymn is a different length than it was. I have both versions.'],
    complete: 'COMPLETE',
    nextCourse: 'SET A NEW COURSE FROM THE CHART AT THE HELM.',
    nextNone: 'NOTHING NEW IS CHARTED YET. THE NEXT CHAPTER IS STILL BEING WRITTEN.',
    rival: RIVAL,
  },
};
