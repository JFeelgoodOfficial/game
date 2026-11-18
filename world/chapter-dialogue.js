// The megaworld chapter: every word of it, and the data its worlds are built
// from (src/chapter.js; GDD 5.7.4).
//
// This is the one file to edit for the writing. Nothing here is logic and
// nothing here imports THREE. Lines are short on purpose: the Tenretni say
// very little, and the panel is narrow.
//
//   CAPTAINS   the three who board the light ship, and how each one takes it
//   HOME       the pilot's lost world, as the archive holds it
//   WORLDS     the holo rooms: one per assimilated world, five fragments each
//   the rest   what is said, scene by scene, in the order it is heard

const TENRETNI = (name) => ({ name, species: 'Tenretni', cityId: 'The City of Light' });

// --- who is aboard -----------------------------------------------------------
// `takes`: 'sees' gets it straight away, 'fears' is the scared one, 'counts'
// works out what it costs. Rename freely; the scenes read these by `takes`.
export const CAPTAINS = [
  { id: 'marrow', name: 'Cantor Ilse Marrow', short: 'MARROW', species: 'Saturnia', takes: 'sees' },
  { id: 'lux', name: 'Floor Manager Brandi Lux', short: 'LUX', species: 'Wavemall Prime', takes: 'fears' },
  { id: 'vask', name: 'Shift-Captain Orrin Vask', short: 'VASK', species: 'Rustia', takes: 'counts' },
];

// --- the worlds ---------------------------------------------------------------
// A world is five layers, and a fragment fills one layer (world/layerplanet.js):
//
//   sky         a, b: the air's two colours        bands: cloud banding 0..1
//   ground      sea, land, high: three colours     scale: size of the continents
//                                                  level: how much is sea, 0..1
//   structures  col                                kind: 0 blocks 1 rings 2 lines 3 spires
//                                                  density 0..1
//   life        col                                kind: 0 flocks 1 a herd round the middle 2 drifters
//                                                  speed
//   light       col                                kind: 0 a moon 1 a ring 2 a crown at the pole
//
// `label` is what the fragment is called when it is taken; `tone` is the note
// it sounds, in Hz. Colours are 0xRRGGBB.

// The pilot's home, as it was. It has no name here yet: give it one.
export const HOME = {
  name: 'HOME',
  layers: {
    sky: { a: 0x7fc4ff, b: 0xfff1d0, bands: 0.45 },
    ground: { sea: 0x144a8a, land: 0x3f9a58, high: 0xe8dcb4, scale: 1.7, level: 0.52 },
    structures: { col: 0xffd58a, kind: 0, density: 0.3 },
    life: { col: 0xfff6c8, kind: 0, speed: 0.5 },
    light: { col: 0xffe9b0, kind: 0 },
  },
};

export const WORLDS = [
  {
    id: 'wyattmattoe', name: 'WYATTMATTOE', note: 'THE SKI HILL',
    layers: {
      sky: { label: 'A SKY BEFORE SNOW', tone: 392, a: 0x9fd8ff, b: 0xffffff, bands: 0.8 },
      ground: { label: 'A WHITE SLOPE', tone: 262, sea: 0x2a5f8f, land: 0xe9f2fb, high: 0xffffff, scale: 2.6, level: 0.4 },
      structures: { label: 'A LIFT LINE', tone: 523, col: 0xffb36b, kind: 2, density: 0.35 },
      life: { label: 'RIDERS', tone: 659, col: 0xff6fae, kind: 1, speed: 1.4 },
      light: { label: 'AN AURORA', tone: 784, col: 0x7dffc0, kind: 2 },
    },
  },
  {
    id: 'shadowreach', name: 'SHADOWREACH', note: 'THE DREAM',
    layers: {
      sky: { label: 'A VIOLET DUSK', tone: 311, a: 0x5a2f9e, b: 0xff7ad9, bands: 0.25 },
      ground: { label: 'DARK GLASS', tone: 208, sea: 0x0a0618, land: 0x2b1a4a, high: 0x8a5cff, scale: 3.4, level: 0.45 },
      structures: { label: 'A SPIRE', tone: 466, col: 0xc59bff, kind: 3, density: 0.4 },
      life: { label: 'A SLEEPER', tone: 622, col: 0xff9be8, kind: 2, speed: 0.25 },
      light: { label: 'A SECOND MOON', tone: 740, col: 0xd9c2ff, kind: 0 },
    },
  },
  {
    id: 'actuality', name: 'ACTUALITY', note: 'THE GROUNDS',
    layers: {
      sky: { label: 'A LONG AFTERNOON', tone: 349, a: 0x6fb7ff, b: 0xffd9a0, bands: 0.5 },
      ground: { label: 'CUT GRASS', tone: 233, sea: 0x1f5a7a, land: 0x5fae4a, high: 0xc9d47a, scale: 1.9, level: 0.38 },
      structures: { label: 'A HEDGE MAZE', tone: 494, col: 0xfff0a8, kind: 1, density: 0.5 },
      life: { label: 'A DRAGON', tone: 587, col: 0xff8a4a, kind: 0, speed: 0.8 },
      light: { label: 'A NOON SUN', tone: 698, col: 0xfff4c2, kind: 0 },
    },
  },
  {
    id: 'stevenlacey', name: 'STEVENLACEY', note: 'THE COIN',
    layers: {
      sky: { label: 'EIGHT BLUES', tone: 330, a: 0x3a7bff, b: 0x9fe0ff, bands: 0.0 },
      ground: { label: 'A GOLD FACE', tone: 220, sea: 0x7a4a10, land: 0xe9b63a, high: 0xfff0a0, scale: 4.2, level: 0.3 },
      structures: { label: 'A BRICK ROW', tone: 440, col: 0xff9340, kind: 0, density: 0.7 },
      life: { label: 'A SMALL MONSTER', tone: 554, col: 0x8dff6a, kind: 1, speed: 1.0 },
      light: { label: 'A COIN, TURNING', tone: 880, col: 0xffe066, kind: 1 },
    },
  },
  {
    id: 'saturnia', name: 'SATURNIA', note: 'THE BELLS',
    layers: {
      sky: { label: 'A GOLD CLOUD', tone: 370, a: 0xffc56e, b: 0xfff3d6, bands: 1.0 },
      ground: { label: 'A CLOUD DECK', tone: 247, sea: 0xb9783a, land: 0xe9c48a, high: 0xfff6e0, scale: 1.2, level: 0.55 },
      structures: { label: 'A CITY ON NOTHING', tone: 415, col: 0xbfe8ff, kind: 3, density: 0.25 },
      life: { label: 'A CHOIR', tone: 831, col: 0xfff2b8, kind: 0, speed: 0.4 },
      light: { label: 'THE RINGS', tone: 932, col: 0xffe2a0, kind: 1 },
    },
  },
  {
    id: 'wavemall prime', name: 'WAVEMALL PRIME', note: 'SATURDAY',
    layers: {
      sky: { label: 'A PINK HAZE', tone: 294, a: 0xff8fd0, b: 0x8ff7ff, bands: 0.35 },
      ground: { label: 'A TILED FLOOR', tone: 196, sea: 0x1b6f8f, land: 0xf2a6d8, high: 0xa8fff4, scale: 5.0, level: 0.42 },
      structures: { label: 'AN ESCALATOR', tone: 392, col: 0x82f7ff, kind: 2, density: 0.6 },
      life: { label: 'SHOPPERS', tone: 523, col: 0xffc9ec, kind: 1, speed: 0.7 },
      light: { label: 'A NEON SIGN', tone: 1047, col: 0xff5fc4, kind: 2 },
    },
  },
];

// --- 0. the suite ---------------------------------------------------------------
// The one who waits by the window, with the pilot's world turning outside it.
export const VISITOR = TENRETNI('The Archivist');

export const SUITE_OFFER = {
  speaker: VISITOR,
  lines: [
    'That is yours. We have all of it but the end.',
    'We can build it again. Every stone where it stood.',
    'We built a ship that goes where its pilot imagines. We cannot fly it.',
    'We have every answer. We lack a question.',
  ],
  offer: {
    kind: 'choice',
    prompt: 'FLY IT, AND WE BUILD YOUR WORLD.',
    options: [
      { label: 'SHOW ME THE SHIP', outcomeTag: 'ch:accept' },
      { label: 'NOT YET', outcomeTag: 'ch:wait' },
    ],
  },
};
export const SUITE_ACCEPT = {
  speaker: VISITOR,
  lines: ['The hangar. West of the terrace.', 'Watch one of us try.'],
};
export const SUITE_WAIT = {
  speaker: VISITOR,
  lines: ['It will keep turning. We are patient. It is most of what we are.'],
};
// said again if the pilot comes back before going to the hangar
export const SUITE_REMIND = {
  speaker: VISITOR,
  lines: ['The hangar. West of the terrace.'],
};

// --- 1. the hangar demo ---------------------------------------------------------
export const DEMO = {
  prompt: 'E — WATCH',
  // [seconds into the demo, line]
  lines: [
    [3, 'IT GOES WHERE THE PILOT IMAGINES.'],
    [27, 'WE ONLY REMEMBER.'],
  ],
  board: 'E — BOARD THE LIGHT SHIP',
};

// --- 2. the holodeck on the light ship ---------------------------------------
export const HOLO = {
  enter: 'THE ARCHIVE. TAKE ONE THING FROM EACH WORLD.',
  take: 'E — TAKE',
  swap: 'E — TAKE THIS INSTEAD',
  // {n} of {need}
  count: '{n} OF {need} WORLDS',
  ready: 'THE BRIDGE IS FORWARD.',
};

// The special assignment: heard once three rooms have been walked into.
export const ASSIGNMENT = {
  speaker: TENRETNI('The Archivist'),
  lines: [
    'One more thing. The ship cannot go deep enough.',
    'There is a shuttle. One seat. One tether.',
    'Below the ship, time nearly stops. We have never sent a mind there.',
    'We do not know what you will see. That is why it must be you.',
  ],
};

// --- 3. the dive -----------------------------------------------------------------
export const DIVE = {
  sync: 'E — SYNC THE CLOCKS',
  launch: 'E — TAKE THE HELM',
  clocks: { ship: 'SHIP', world: 'MEGAWORLD', shuttle: 'SHUTTLE' },
  // [seconds after the ship settles, captain id (see CAPTAINS) or null, line]
  lines: [
    [2, 'vask', 'OUR CLOCK IS FINE. LOOK AT THEIRS.'],
    [8, 'marrow', 'IT IS NOT BROKEN. WE ARE SLOW. THE HOLE IS HOLDING OUR TIME BACK.'],
    [15, 'vask', 'SO EVERY MINUTE DOWN HERE...'],
    [19, 'marrow', '...IS A YEAR UP THERE. THAT IS WHAT THEY ARE MINING.'],
    [27, 'lux', 'HOW DO WE KNOW ANY OF THIS IS REAL?'],
    // nobody answers
  ],
  hatch: 'E — TAKE THE SHUTTLE DOWN',
};

// --- 3b. the shuttle and the dream --------------------------------------------
// The captains' words come back in the dream with the order gone out of them.
export const DREAM = {
  lines: [
    [4, 'THE TETHER HOLDS.'],
    [14, 'A YEAR IS FINE. LOOK AT THE MINUTE.'],
    [24, 'WE ARE NOT BROKEN. THE CLOCK IS SLOW.'],
    [34, 'HOW DO WE KNOW ANY OF THIS IS OURS?'],
    [44, 'EVERY STONE WHERE IT NEVER STOOD.'],
  ],
};

// --- 4. the stall and the blank canvas ----------------------------------------
export const STALL = {
  line: 'WE HAVE THIS ONE.',
  canvas: {
    title: 'NOTHING HERE YET',
    hint: 'DRAW SOMETHING THAT HAS NEVER BEEN',
    undo: 'UNDO',
    clear: 'CLEAR',
    done: 'LET IT GO',
  },
  birth: [
    [6, 'WE DO NOT HAVE THIS ONE.'],
  ],
};

// --- 5. the return --------------------------------------------------------------
export const RETURN = {
  helm: 'E — TAKE THE SHIP HOME',
  // {ship}: minutes on the ship's clock; {world}: years on the megaworld's
  clocks: 'YOU WERE GONE {ship}. HERE IT HAS BEEN {world}.',
  keeper: {
    speaker: TENRETNI('The Keeper'),
    lines: [
      'We could have simulated you. We did, many times.',
      'Every copy flew home.',
      'You went somewhere that was not there.',
    ],
  },
  plinth: {
    speaker: TENRETNI('The Archivist'),
    lines: ['Entry one. Not taken. Given.', 'We have been looking at it. We do not know why.'],
  },
  codex: 'The First Entry',
};

// --- 6. a thousand years on -----------------------------------------------------
// In the suite, with the three captains, looking out at what was built in the
// shape of the pilot's drawing; then the light ship leaves again.
export const EPILOGUE = {
  // [seconds into the scene, captain id (see CAPTAINS), line]
  lines: [
    [5, 'lux', 'SO ANYTHING SOMEONE DOES IN THE LIGHT SHIP... PROFOUNDLY IMPACTS EVERYTHING HERE? WHO HAS IT NOW?'],
    [13, 'vask', 'TENRETNI DO.'],
    // (they all look at each other: lookAt, below)
    [22, 'marrow', 'IS THAT WHY THEY WERE MINING TIME? I THOUGHT THEY HAD JUST RUN OUT OF IDEAS.'],
    [30, 'vask', 'I THINK WE MAY HAVE GIVEN THEM A NEW ONE.'],
  ],
  lookAt: [15.5, 21], // seconds: from, to
  launchAt: 35, // the light ship lets go of its yard
  // what each of them says afterwards, walking the city with the pilot
  talk: {
    vask: [
      'Forty generations. I counted the names on the wall by the terrace. Some of them are mine.',
      'They kept the braziers. Nobody here has seen a mine, and they still bank the embers at night.',
    ],
    marrow: [
      'They ring the bells in the Pavilion at the hour we left. They do not know why. I do.',
      'Three peoples came off those ships. I cannot find the joins any more.',
    ],
    lux: [
      'They named a bridge after my ship. SATURDAY FOREVER. In lights. I may cry.',
      'A thousand years and the place never closed. Best run floor I ever saw.',
    ],
  },
  // signs over the bridges: the names the ships had
  signs: ['SATURDAY FOREVER', 'NINTH BELL', 'LAST SEAM', 'HALO OF MORNING', 'EMBERWRIGHT', 'BUY ONE GET ONE'],
};
