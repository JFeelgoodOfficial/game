// SEALED: the owner has not played this yet. Do not open.
//
// Every word of the chapter past the horizon (GDD 5.7.7), and its data tables.
// Nothing here is logic and nothing here imports THREE.
//
// A line is { at, by, text, solo, own, needs, when }:
//   at     seconds into its scene
//   by     a captain's id, 'first' (the first pilot) or null (the ship, or
//          what is seen: always a plain subtitle)
//   solo   what is shown instead with no captain aboard (null: nothing)
//   own    said by that captain or not at all
//   needs  ids who must all be aboard
//   when   a key into the facts the place gives (see sceneLines in
//          world/SEALED-horizon-ship.js): the line is kept only if it is true
// {who} {WHO} {name} {NAME} {n} are filled in by the place.

const L = (at, by, text, solo = null, more = null) => ({ at, by, text, solo, ...(more || {}) });
const SHIP = { name: 'The Light Ship', species: 'Tenretni', cityId: 'Inside' };

// The seven records in the hall, in the order the save counts them: the six
// of WORLDS (world/chapter-dialogue.js) and, last, HOME. `room` is the
// holodeck program that goes dark with it on the home base.
export const RECORDS = [
  { id: 'wyattmattoe', name: 'WYATTMATTOE', room: 'wyattmattoe' },
  { id: 'shadowreach', name: 'SHADOWREACH', room: 'shadowreach' },
  { id: 'actuality', name: 'ACTUALITY', room: 'actuality' },
  { id: 'stevenlacey', name: 'STEVENLACEY', room: 'stevenlacey' },
  { id: 'saturnia', name: 'SATURNIA', room: 'saturnia' },
  { id: 'wavemall prime', name: 'WAVEMALL PRIME', room: 'wavemall prime' },
  { id: 'home', name: 'HOME', room: 'terra' },
];

export const CLOCKS = { ship: 'SHIP', home: 'HOME SEEN', left: 'LEFT', roof: 'TO ROOF' };
export const ENTRY = 'E — THE HELM';
export const SKIP = 'E — SKIP';

// --- bell1: the glass ---------------------------------------------------------
export const S1 = {
  stops: [22, 38],
  lines: [
    L(3, 'lux', "It didn't go out. Look. It is all still there.", 'THE SKY DID NOT GO OUT.'),
    L(10, 'marrow', 'Behind us and beside us. Only ahead is dark, and that is not even half.', 'THE DARK AHEAD COVERS LESS THAN HALF THE SKY.'),
    L(17, 'vask', 'Old light. It fell in with us. We can see out. Nothing we send goes back.', 'LIGHT STILL FALLS IN. NOTHING GOES BACK OUT.'),
    L(24, 'vask', 'Three clocks. Ours. Home, as we see it: half speed, and slowing. And what is left.', "THREE CLOCKS. THE SHIP'S. HOME, AS SEEN. TIME LEFT."),
    L(32, 'lux', 'Seven hours. You measured the end of everything and it is seven hours.', null, { own: true }),
    L(40, 'vask', 'Those lights are loose. Nothing holds them. When that ring stops being round, we have one second.', 'A RING OF LOOSE LIGHTS. WHEN IT STRETCHES, ONE SECOND IS LEFT.'),
    L(48, 'marrow', 'No wall. No fire. We crossed, and felt nothing at all.'),
  ],
};

// --- bell2: the lamp, at the stern --------------------------------------------
// `band` is a BANDS id (world/entryzero-dialogue.js). Order matters: one saved bit each.
export const LAMP = {
  use: 'E — THE LAMP',
  keys: 'MOUSE — AIM · Q / E — BAND · L — LAMP',
  all: 'HOLD Z — EVERY BAND, ON WHAT IS AHEAD',
  sights: [
    {
      id: 'home', band: 'ir', log: 'HOME. EVERY CAGE IS LIT.',
      say: [
        L(0, 'marrow', 'The rite. They timed it for us. They knew how long their light could still catch us.'),
        L(7, 'vask', 'Their clock will never pass three hours four. They do not end there. It is only that nothing later can catch us.', 'HOME, AS SEEN, WILL STOP AT 03:04:07. LATER LIGHT CANNOT CATCH THE SHIP.'),
      ],
    },
    { id: 'belt', band: 'bluegreen', log: 'THE WHOLE SKY, PRESSED INTO A BAND. BLUE AT ITS EDGE.', say: [L(0, 'lux', 'It is brighter at the edge. Like it is leaning in to watch.')] },
    { id: 'gas', band: 'xray', log: 'GAS, FALLING IN AFTER THE SHIP. HOT.', say: [L(0, 'vask', 'That band costs dose. Do not hold it.')] },
    {
      id: 'ahead', band: 'radio', log: 'AHEAD, IN THE DARK: SOMETHING ON THE RADIO BAND. VERY OLD.',
      say: [
        L(0, 'marrow', 'Ahead. Listen. The longer the wave, the longer ago it crossed.', 'THE LONGER THE WAVE, THE LONGER AGO IT CROSSED.'),
        L(7, 'vask', 'Everything that ever fell in left its last light at the door. It is all still hanging there.', 'EVERYTHING THAT EVER FELL IN LEFT ITS LAST LIGHT HERE.'),
        L(14, 'lux', 'So it keeps everything too.', null, { own: true }),
        L(18, 'marrow', 'And it was never afraid to.', null, { needs: ['lux', 'marrow'] }),
      ],
    },
  ],
};
export const S2 = {
  stops: [16, 32],
  lines: [
    L(2, 'lux', 'That is this ship.', 'THE SHAPE AHEAD IS THIS SHIP.'),
    L(9, 'vask', "A million years ago, by home's clock. One Tenretni at the helm.", 'IT CROSSED A MILLION YEARS AGO, WITH ONE TENRETNI ABOARD.'),
    L(17, 'marrow', 'And it came home by itself.', 'IT CAME HOME WITH NOBODY ABOARD.'),
    L(25, 'vask', 'So there is a way out. And it cost a pilot.', 'THERE IS A WAY OUT. IT TOOK THE PILOT.'),
    L(33, 'lux', 'Nobody look at the pilot. ...We are all looking at the pilot.', null, { own: true }),
  ],
};

// --- bell3: the count, and the turn -------------------------------------------
export const COUNT = {
  use: 'E — THE COUNT',
  burn: 'HOLD SPACE — BURN',
  below: 'E — BELOW',
  nudge: L(0, 'vask', 'Try it. I want it seen.', 'HOLD SPACE.'),
  best: L(0, 'vask', 'One burn, and then nothing. Seventeen hours is the most anyone gets. Every push after it takes time away.', 'ONE BURN, THEN NOTHING, GIVES THE MOST THERE IS. EVERY PUSH AFTER TAKES TIME AWAY.'),
  long: L(0, 'vask', 'Too long. You passed the best of it and burned hours off. The engine is not the way.', 'TOO LONG. PAST THE BEST, EVERY PUSH TAKES TIME AWAY.'),
  none: L(0, 'vask', 'You did not touch it. Seven hours, then. You may be ahead of me.', 'SEVEN HOURS, UNTOUCHED.'),
  fight: L(0, 'lux', 'So the harder I fight it, the sooner it comes. I know this one. I have had this one my whole life.', null, { own: true }),
};
export const S3A = {
  lines: [
    L(2, 'vask', 'A chart. Up is later. The slanted lines are light. Nothing leans past them.', 'UP IS LATER. THE SLANTED LINES ARE LIGHT. NOTHING LEANS PAST THEM.'),
    L(10, 'vask', 'The line across the top is the end. It is not a place. It is a time. Every line reaches it.', 'THE LINE ACROSS THE TOP IS THE END. IT IS A TIME, NOT A PLACE.'),
    L(18, 'lux', 'Then burn. Turn us round and burn.', 'THE ENGINES ARE YOURS.'),
  ],
};
export const S3B = {
  stops: [14, 28],
  lines: [
    L(1, 'marrow', 'The stars are turning. Slowly. All one way.', 'THE SKY IS TURNING, ALL ONE WAY.'),
    L(7, 'vask', 'The hole spins. It drags everything round with it. Then my chart is wrong.', 'THE HOLE SPINS. THE CHART IS WRONG.'),
    L(15, 'marrow', 'The end stood up. It is not across our way any more. It is beside it.', 'THE END IS NO LONGER ACROSS THE WAY. IT STANDS TO ONE SIDE.'),
    L(22, 'vask', 'Two roofs before it. Starboard: everything that will ever fall in after us, landing at once. Nothing crosses that.', 'STARBOARD ROOF: ALL THAT FALLS IN AFTER, AT ONCE. NOTHING CROSSES IT.'),
    L(29, 'vask', 'Port: only what fell before. The ship crossed there. Past it I have no numbers. Nobody has.', 'PORT ROOF: ONLY WHAT FELL BEFORE. THE SHIP CROSSED THERE. PAST IT, NOBODY HAS NUMBERS.'),
    L(36, null, 'THE SHIP CAN CARRY WHAT IS ABOARD THROUGH THE PORT ROOF AS LIGHT. ITS HULL IS FULL.'),
  ],
};

// --- bell4: the hall ----------------------------------------------------------
export const S4 = {
  stops: [9, 17],
  lines: [
    L(2, 'marrow', 'Light goes through light. So it will turn the decks to light, and your freighter, and us, and write us in its skin.', 'LIGHT PASSES THROUGH LIGHT. THE SHIP WILL WRITE EVERYTHING ABOARD INTO ITS HULL.'),
    L(10, 'vask', 'What a hull can hold goes by its skin, not its hold. Every cell has a record in it. The corner it grew is full too.', 'A HULL HOLDS WHAT ITS SURFACE CAN. EVERY CELL IS FULL.'),
    L(18, 'vask', 'One record has to be put down. No copy can be kept. What we put down, falls.', 'ONE RECORD MUST BE PUT DOWN. NO COPY CAN BE KEPT. IT WILL FALL.'),
    L(25, 'lux', "Seven worlds. And one of them is the pilot's.", 'SEVEN WORLDS HANG HERE. ONE IS YOURS.'),
  ],
};
export const HALL = {
  stand: 'E — {NAME}',
  well: 'E — THE WELL',
  wellEmpty: 'THE WELL. BRING A RECORD TO IT.',
  door: 'E — THE HELM',
  back: 'E — PUT IT BACK',
  speaker: SHIP,
  // what is said at each stand (the first whose conditions hold), in RECORDS order
  look: [
    [L(0, 'lux', 'Snow. Lifts. People falling down a hill on purpose. I never understood it and I would miss it.', 'WYATTMATTOE. A WHITE SLOPE, AND RIDERS.')],
    [L(0, 'marrow', 'The dream. Nobody lived there. Somebody slept there.', 'SHADOWREACH. A VIOLET DUSK. A SLEEPER.')],
    [L(0, 'vask', 'Cut grass, and a dragon. Somebody kept this one tidy.', 'ACTUALITY. A LONG AFTERNOON.')],
    [L(0, 'lux', 'Coins. A whole world of small change. Somebody counted all of that.', 'STEVENLACEY. THE COIN.')],
    [
      L(0, 'marrow', 'Mine. The bells are in there. I can sing every one of them without it. I think.', null, { own: true }),
      L(0, 'vask', 'The Cantor’s. She is not here to speak for it.', 'SATURNIA. THE BELLS.'),
    ],
    [
      L(0, 'lux', 'That is Saturday. Every Saturday there ever was. Do not look at me while you decide.', null, { own: true }),
      L(0, 'marrow', 'Her floor. She would have made a joke of it, and meant none of the joke.', 'WAVEMALL PRIME. SATURDAY.'),
    ],
    [L(0, 'vask', 'Yours. It exists nowhere but in there. Nobody here will ask it of you.', 'HOME. IT EXISTS NOWHERE ELSE.')],
  ],
  lift: { prompt: 'LIFT {NAME} OFF ITS STAND?', options: [{ label: 'LIFT IT', outcomeTag: 'hz:lift' }, { label: 'LEAVE IT', outcomeTag: 'hz:leave' }] },
  lifted: 'CARRY IT TO THE WELL, OR BACK TO ITS STAND.',
  // D1, at the well
  put: {
    lines: ["ONE RECORD'S ROOM. NO COPY."],
    prompt: 'PUT DOWN {NAME}. IT WILL NOT COME BACK.',
    options: [{ label: 'LET IT FALL', outcomeTag: 'hz:c1:fall' }, { label: 'PUT IT BACK', outcomeTag: 'hz:c1:none' }],
  },
  // the helm door, with nothing put down
  full: {
    lines: ['THE HULL IS FULL.'],
    prompt: 'CROSS AS IT IS?',
    options: [{ label: 'KEEP EVERYTHING. CROSS FULL.', outcomeTag: 'hz:c1:keep' }, { label: 'NOT YET', outcomeTag: 'hz:c1:wait' }],
  },
};
export const S4B = {
  lines: [
    L(2, 'marrow', 'It is ahead of us now. With everything else that went before.', 'IT FALLS AHEAD, TO JOIN WHAT WENT BEFORE.'),
    L(8, 'marrow', 'Then I am the only place it is kept. Good. I shall have to keep singing.', null, { own: true, when: 'fellSaturnia' }),
    L(8, 'lux', 'It is fine. It is fine. It was always closing time somewhere.', null, { own: true, when: 'fellWavemall' }),
    L(8, 'vask', 'You put down your own. I will count that for the rest of my life.', 'YOU PUT DOWN YOUR OWN.', { when: 'fellHome' }),
    L(8, 'vask', 'One gap in the hull. That is our room.', 'ONE CELL IS DARK. THERE IS ROOM.', { when: 'fellOther' }),
  ],
};
export const DX1 = {
  lines: [L(2, null, 'EVERY CELL HOLDS A RECORD. NOTHING ABOARD HAS BEEN MADE LIGHT.'), L(7, null, 'WHAT IS NOT LIGHT MEETS THE ROOF.')],
};
// said once on being put back, by what killed
export const AFTER_DEATH = {
  full: L(0, 'vask', 'Keep everything. That was the first order they were ever given. Look where it took them.', 'KEEP EVERYTHING WAS THE FIRST ORDER. IT ENDS THE SAME WAY EVERY TIME.'),
  chart: L(0, 'marrow', 'Again. Lean less. Let it carry us.', 'AGAIN. LEAN LESS.'),
  ring: L(0, 'vask', 'The line is the ring. The gaps are its middle. Wait for one.', 'WAIT FOR A GAP.'),
};

// --- bell5, bell6: the chart ----------------------------------------------------
export const S5 = {
  stops: [7, 14],
  lines: [
    L(1, 'vask', 'Our line so far. The cone is everywhere we can still reach.', "THE LINE IS THE SHIP'S PAST. THE CONE IS EVERYWHERE IT CAN STILL REACH."),
    L(8, 'vask', 'The bright lines are other things falling. Here you can see where they will be. Do not let our line touch theirs.', "BRIGHT LINES ARE OTHER THINGS FALLING. DO NOT LET THE SHIP'S LINE TOUCH THEM."),
    L(15, 'marrow', "The faint one is the ship's own, from before. It knew where the roof was thin.", "THE FAINT LINE IS THE SHIP'S OLD COURSE."),
  ],
};
export const CHART = {
  keys: 'A / D — LEAN · Q / E — HULL BAND',
  hands: 'HANDS OFF',
  // the other things falling: where each starts, its slope, its width, and
  // the band it shows in. Fixed. The first is dead ahead of a ship that does
  // nothing, in the band the hull starts on, so doing nothing shows the rule.
  streams: [
    { x0: 0.34, t0: 0.62, slope: 0.25, len: 0.34, width: 0.16, band: 'bluegreen' },
    { x0: 0.12, t0: 0.76, slope: 0.55, len: 0.42, width: 0.2, band: 'uv' },
    { x0: -0.02, t0: 0.9, slope: -0.62, len: 0.3, width: 0.22, band: 'ir' },
    { x0: -0.34, t0: 0.98, slope: 0.5, len: 0.36, width: 0.2, band: 'halpha' },
    { x0: 0.3, t0: 1.05, slope: -0.1, len: 0.3, width: 0.18, band: 'xray' },
    { x0: -0.52, t0: 1.16, slope: 0.6, len: 0.34, width: 0.22, band: 'uv' },
    { x0: -0.1, t0: 1.24, slope: 0.3, len: 0.3, width: 0.2, band: 'bluegreen' },
    { x0: -0.62, t0: 1.3, slope: 0.7, len: 0.26, width: 0.24, band: 'ir' },
    { x0: 0.06, t0: 1.42, slope: -0.3, len: 0.34, width: 0.2, band: 'halpha' },
  ],
  // the port roof's five lengths, from its left corner to the top
  roof: ['ir', 'halpha', 'bluegreen', 'uv', 'xray'],
  barks: {
    through: L(0, 'marrow', 'It went through us. We were wearing its colour.', "THE HULL WAS IN THAT LINE'S BAND. IT PASSED THROUGH."),
    hit: L(0, 'vask', 'DOSE AT {n} PERCENT. Go round them, or wear their colour.', 'DOSE {n}%. GO ROUND A LINE, OR MATCH ITS BAND.'),
    starboard: L(0, 'lux', 'Not that way. I know it is toward home. Not that way.', 'STARBOARD IS THE FIRE.'),
    lean: L(0, 'vask', 'Every lean is time off the clock. Watch it run.', 'LEANING COSTS TIME.'),
    spent: L(0, 'vask', 'Drive is nearly spent. After that we only fall.', 'DRIVE NEARLY SPENT.'),
    roof: L(0, 'marrow', 'The roof changes colour along its length. Wear the colour where we cross.', 'MATCH THE HULL TO THE ROOF WHERE THE SHIP WILL CROSS.'),
    ten: L(0, 'vask', 'Ten seconds. Let go of it.', 'LET GO OF THE HELM.'),
    four: L(0, 'lux', 'Hands off. Hands OFF. This is the hardest thing I have ever not done.', null, { own: true }),
  },
};
export const S6 = {
  stops: [13, 22],
  lines: [
    L(0, 'marrow', 'It is starting with the decks.', 'THE DECKS GO FIRST.'),
    L(6, 'lux', 'Will it be me that comes out? Somebody say yes.', null, { own: true }),
    L(9, 'vask', 'It will be every cell of you. I will count them.', null, { needs: ['lux', 'vask'], own: true }),
    L(14, 'marrow', 'Pilot. You stay as you are. It can shade one seat. Somebody has to be awake on the other side.', 'THE SHIP CAN SHADE ONE SEAT. YOURS.'),
    L(21, 'marrow', 'Every band, on each of us. You know how. It is only there while you look at it.', 'ON THE OTHER SIDE: EVERY BAND, ON EACH THING, UNTIL IT IS THERE.'),
    L(27, null, 'THE ROOF.'),
  ],
};
export const DX2 = { lines: [L(1, null, 'THE HULL IS GOING WHITE, CELL BY CELL.')] };

// --- bell7: the hull ------------------------------------------------------------
export const S7A = {
  lines: [
    L(2, null, 'THEY ARE IN THE HULL, WHERE THEIR COLOURS ARE.', null, { when: 'crew' }),
    L(2, null, 'THE FREIGHTER AND THE DECKS ARE IN THE HULL.', null, { when: 'alone' }),
    L(7, null, 'HOLD Z ON EACH. EVERY BAND, UNTIL IT IS THERE.'),
  ],
};
export const HULL = {
  keys: 'HOLD Z — EVERY BAND · L — LAMP',
  freighter: L(0, null, 'THE HANGAR. YOUR FREIGHTER IS IN IT.'),
  timer: L(0, null, 'THE CELLS ARE LETTING GO.'),
  stolen: L(0, null, 'A LIGHT FROM THE RING IS IN THE BEAM. IT TAKES THE LOOK. MOVE.'),
  left: '{n} S',
  back: {
    lux: L(0, 'lux', 'Is it me? ...I checked. I am frightened. Oh, good. It is me.', null, { own: true }),
    vask: L(0, 'vask', 'Five seams on the arm. Two hundred and six in the head. All there. I half hoped it would lose the number. I am glad it did not.', null, { own: true }),
    marrow: L(0, 'marrow', 'I was everywhere in the ship at once. Every order I ever gave, with no before and no after. That is how they see. It is not wisdom. It is only never having to choose.', null, { own: true }),
  },
  help: {
    lux: L(0, 'lux', 'I will hold the lamp steady with you. Go.', null, { own: true }),
    vask: L(0, 'vask', '{n} seconds on the others. Move.', null, { own: true }),
    marrow: L(0, 'marrow', 'There, along the hull. That one is going fastest.', null, { own: true }),
  },
  lost: [
    L(0, 'vask', '{who} is in the hull. All through it. There is no one place left to look.', '{WHO} IS IN THE HULL NOW. IN EVERY CELL, AND NO ONE PLACE.'),
    L(8, 'marrow', 'Kept. Not gone. That is not the comfort it sounds like.'),
  ],
  near: {
    marrow: L(0, 'marrow', 'A choir, with no song before it.', null, { own: true }),
    vask: L(0, 'vask', 'I have counted them four times. Four answers.', null, { own: true }),
    lux: L(0, 'lux', 'It looked at me. No, it did not. ...It did.', null, { own: true }),
  },
  corner: 'E — THE CORNER',
  listen: 'Q — CHANGE BAND TO RADIO, AND LISTEN',
  wake: 'HOLD Z — EVERY BAND, ON THE CORNER',
  hatch: 'E — THE HELM',
  talk: {
    vask: ['It is a place again. I keep looking for the edge of it.'],
    marrow: ['Listen. Nothing here is on its way to anything.'],
    lux: ['I am standing on the outside of a ship inside a hole. I would like that noted.'],
    first: ['The gaps in the ring. I will call them.'],
  },
};
export const S7 = {
  stops: [16, 31],
  lines: [
    L(2, 'lux', 'That ring. That is the end. And it is just... over there.', 'THE END IS A RING OF LIGHT, OFF TO ONE SIDE.'),
    L(9, 'vask', 'It is a place again. We can go round it. And the clock... I have nothing to count down from.', 'THE COUNT HAS STOPPED. NOTHING HERE HAS TO END.'),
    L(17, 'marrow', 'Things are coming out of it. Nothing sent them. There is nothing behind them at all.', 'LIGHTS COME OUT OF THE RING. NOTHING CAUSED THEM.'),
    L(24, 'vask', 'In here, nothing that happened before decides what happens next. The numbers said so. I did not believe them.', 'PAST THE ROOF, WHAT CAME BEFORE NO LONGER DECIDES WHAT COMES NEXT.'),
    L(32, 'vask', 'Then in here the Last Seam decides nothing. I owe it no answer, and you owe me none.', null, { own: true, when: 'pair' }),
    L(37, 'marrow', 'I will owe it anyway. I am taking it out with me.', null, { own: true, when: 'pair' }),
    L(42, 'vask', '...Good.', null, { own: true, when: 'pair' }),
    L(32, 'vask', 'Then in here I owe my brother nothing. I find I want to owe it. I am taking it out with me.', null, { own: true, when: 'vaskOnly' }),
    L(32, 'marrow', 'Then in here I never gave the order. No. I gave it. I am taking it out with me.', null, { own: true, when: 'marrowOnly' }),
    L(32, 'lux', 'Then in here I was never frightened. ...No. I was. I would like to keep that. It was mine.', null, { own: true, when: 'luxOnly' }),
    L(44, 'lux', 'Every one of them is different. I planned to be scared of them. I am only looking.', null, { own: true, when: 'luxMore' }),
  ],
};
export const S8 = {
  stops: [7, 13],
  lines: [
    L(2, 'marrow', 'The round cells. The corner it grew while it was away.', 'THE CORNER OF ROUND CELLS.'),
    L(8, 'vask', 'It had room, then. It wrote its pilot there, and came out here with nobody awake to look.', 'THE SHIP HAD ROOM, THEN. IT WROTE ITS PILOT HERE. NOBODY WAS AWAKE TO LOOK.'),
    L(14, 'lux', 'It has been in the wall. The whole time. We walked past it.', 'THE FIRST PILOT IS STILL IN THE HULL.'),
    L(18, 'vask', 'It kept {who} the same way. But {who} is in all of it. This one it wrote in one place.', 'THE SHIP KEPT {WHO} THE SAME WAY. THIS ONE IT WROTE IN ONE PLACE.', { when: 'lostHere' }),
  ],
};
// what each hears in the tone, and what is shown with nobody to hear it
export const TONE = [
  L(0, 'marrow', 'It says: leave me.', null, { own: true }),
  L(5, 'lux', 'It says: help.', null, { own: true }),
  L(10, 'vask', 'It is a tone. It says nothing. You are hearing yourselves.', null, { own: true }),
  L(0, null, 'A TONE. IT RISES AND FALLS. IT DOES NOT SAY.', null, { when: 'alone' }),
];
export const D2 = {
  speaker: { name: 'The Corner', species: 'Tenretni', cityId: 'The hull' },
  lines: ['A TONE.'],
  prompt: 'EVERY BAND, HELD ON THE CORNER, WOULD BRING IT BACK TO ONE PLACE.',
  options: [{ label: 'LOOK IT BACK', outcomeTag: 'hz:c2:a' }, { label: 'LEAVE IT IN THE LIGHT', outcomeTag: 'hz:c2:b' }],
};
export const FIRST = { name: 'The First Pilot', short: 'THE FIRST PILOT', species: 'Tenretni', cityId: 'The light ship' };
export const S8A = {
  stops: [8, 17, 25],
  lines: [
    L(3, 'first', 'You looked.'),
    L(9, 'first', 'I was in every cell. I saw the whole ship at once, and wanted nothing. It is what we were built to be. I had only just stopped.'),
    L(18, 'first', 'Now I am in one place, and I do not know what is behind me. It is terrible. Thank you.'),
    L(26, 'first', 'The way out is through the ring, not round it. I will call the gaps.'),
    L(30, 'vask', 'Tenretni stay. Everybody says so.', null, { when: 'crew' }),
    L(33, 'first', 'I am the one that went.', null, { when: 'crew' }),
  ],
};
export const S8B = {
  stops: [9, 15],
  lines: [
    L(3, 'marrow', 'Then it stays whole. Everywhere at once, and wanting nothing.', 'THE CORNER STAYS LIT.'),
    L(10, 'lux', 'Or it stays stuck. We will never know which we did.', null, { own: true }),
    L(16, 'vask', 'The helm moved. Nobody touched it.', 'THE SHIP IS TURNING TOWARD THE RING. NOBODY TOUCHED THE HELM.'),
    L(21, 'marrow', 'It goes where its pilot imagines. It still has one.', 'IT GOES WHERE ITS PILOT IMAGINES. IT STILL HAS ONE.'),
  ],
};

// --- bell9, bell10: the ring, and out ---------------------------------------------
export const S9 = {
  stops: [9],
  lines: [
    L(2, 'first', 'The broken line is the ring. The gaps are its middle. Go through a gap. Do not touch the line.', null, { when: 'woke' }),
    L(2, 'vask', 'The broken line is the ring. The gaps are its middle. Go through a gap. Do not touch the line.', 'THE BROKEN LINE IS THE RING. PASS THROUGH A GAP. DO NOT TOUCH THE LINE.', { when: 'kept' }),
    L(10, 'lux', 'And if we touch it?', null, { own: true }),
    L(13, 'vask', 'The lights stop being round. One second.', null, { own: true, needs: ['lux', 'vask'] }),
  ],
};
export const KEEL = {
  keys: 'A / D — LEAN',
  now: L(0, 'first', 'NOW.'),
  leans: L(0, null, 'THE SHIP LEANS.'),
  miss: L(0, 'vask', 'Missed. Round again. Drive at {n}.', 'MISSED. ROUND AGAIN.'),
};
export const DX3 = { lines: [L(1, null, 'THE RING OF LIGHTS IS NOT ROUND.')] };
export const S10 = {
  stops: [12, 30, 50],
  // the first twelve seconds are out of order on purpose: what is said at 4 is seen at 6
  lines: [
    L(1, 'lux', 'Did I already say this?', 'FOR A MOMENT, THINGS HAPPEN BEFORE WHAT CAUSES THEM.'),
    L(4, 'lux', 'We are through.', 'THROUGH.'),
    L(8, 'vask', 'Effect, and then cause. Do not get used to it.'),
    L(14, 'marrow', 'It is pushing us. The same ring. From this side, it pushes.', 'FROM THIS SIDE THE RING PUSHES AWAY.'),
    L(20, 'lux', 'Let it. Nobody touch anything.', 'LET GO OF THE HELM.'),
    L(28, 'marrow', '...I can hear it.', null, { own: true, when: 'fellSaturnia' }),
    L(28, 'lux', 'That is Saturday. That is Saturday, going past. Hello!', null, { own: true, when: 'fellWavemall' }),
    L(28, 'vask', 'Pilot. Yours got out before we did.', 'ONE OF THE LIGHTS HAS THE COLOURS OF HOME. IT GOT OUT FIRST.', { when: 'fellHome' }),
    L(28, 'marrow', "That one, among the others. Those are {name}'s colours.", "ONE OF THE LIGHTS HAS {NAME}'S COLOURS.", { when: 'fellPlain' }),
    L(38, 'vask', 'Stars. Plain ones. Nothing bent.', 'PLAIN STARS. NOTHING BENT.'),
    L(44, 'vask', 'The ship was gone one thousand and twenty-four years, by its own clock. That is how far home is from here. It is out there. So is everything else.', 'THE SHIP ONCE TOOK 1,024 YEARS TO FLY HOME FROM HERE. HOME IS OUT THERE. SO IS EVERYTHING ELSE.'),
    L(52, 'lux', 'The clock that says how long we have left. It is blank.', 'TIME LEFT: UNKNOWN.'),
    L(57, 'marrow', 'It was always blank. We only had a number for one afternoon.', 'AS IT ALWAYS WAS.'),
    L(61, 'marrow', "{who}'s colours are still in the hull. {who} is coming too.", "{WHO}'S COLOURS ARE STILL IN THE HULL.", { when: 'lostHere' }),
    L(65, 'first', 'I have never been anywhere I had not already kept. Show me.', null, { when: 'woke' }),
    L(65, 'vask', 'It has picked a star.', 'THE SHIP HAS CHOSEN A STAR.', { when: 'kept' }),
    L(69, 'marrow', 'Then let us go and see what it imagined.', 'YOU ARE NOT ALONE ABOARD.', { when: 'kept' }),
  ],
};

// --- afterwards, on the home base (src/horizon.js effects()) ---------------------
export const AFTER = {
  talk: {
    vask: { any: ['No count. I keep reaching for one.', 'I owe a debt I chose to bring. It is lighter than the one I was handed.'], home: 'You put down your own world. I have not forgotten whose turn it is.' },
    marrow: { any: ['It is quiet, and nothing is ahead of us but what we pick.'], saturnia: 'I am still singing the bells. I have lost none yet.', other: 'Listen. Plain stars make no sound at all. I like it.' },
    lux: { any: ['I checked again. Still me. Still a bit scared. It is nice to have a spare.'], 'wavemall prime': 'Saturday is out there somewhere, for real this time. I want to go shopping.', other: 'Where to? I do not mind. I mean it. Listen to me, not minding.' },
  },
  first: ['One place at a time. I am practising.', 'Pick somewhere I have not kept. That is anywhere.'],
};
// the colours a captain kept in the hull is drawn in (and marked with on the home base)
export const COLOURS = { vask: 0xff7a3c, marrow: 0xffe9a8, lux: 0xff5fc4, first: 0x66ffaa, freighter: 0xbfd4e6 };
