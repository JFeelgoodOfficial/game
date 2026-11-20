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
    'I am the Archivist. That world in the window is yours. We keep it, and everyone who lived on it, asleep.',
    'We can copy anything we have seen. We cannot finish a world or wake a person. To do that we would have to make something new, and we have never made anything new.',
    'We built a ship that goes wherever its pilot imagines. None of us can fly it. We only remember. You imagine.',
    'Fly it for us, once. Bring back one thing that never existed. With that we believe we can wake everyone we keep, and build their worlds again.',
  ],
  offer: {
    kind: 'choice',
    prompt: 'FLY IT, AND EVERYONE WE KEEP COMES BACK.',
    options: [
      { label: 'SHOW ME THE SHIP', outcomeTag: 'ch:accept' },
      { label: 'NOT YET', outcomeTag: 'ch:wait' },
    ],
  },
};
export const SUITE_ACCEPT = {
  speaker: VISITOR,
  lines: ['The ship is in the hangar, west of the terrace. Go down by the lift.', 'First watch one of us try to fly it. Then you will see what we lack.'],
};
export const SUITE_WAIT = {
  speaker: VISITOR,
  lines: ['Then they stay asleep a while longer. They do not feel the time. We will wait. Waiting is most of what we are.'],
};
// said again if the pilot comes back before going to the hangar
export const SUITE_REMIND = {
  speaker: VISITOR,
  lines: ['The ship is in the hangar, west of the terrace. Take the lift down.'],
};

// --- 1. the hangar demo ---------------------------------------------------------
export const DEMO = {
  prompt: 'E — WATCH',
  // [seconds into the demo, line]
  lines: [
    [3, 'THE SHIP GOES WHERE ITS PILOT IMAGINES.'],
    [27, 'OUR PILOT CAN ONLY REMEMBER. SO IT GOES NOWHERE.'],
  ],
  board: 'E — BOARD THE LIGHT SHIP',
};

// --- 2. the holodeck on the light ship ---------------------------------------
export const HOLO = {
  enter: 'EACH ROOM SHOWS ONE WORLD WE KEEP. TAKE ONE THING FROM FIVE OF THEM.',
  take: 'E — TAKE',
  swap: 'E — TAKE THIS INSTEAD',
  // {n} of {need}
  count: '{n} OF {need} WORLDS',
  ready: 'YOU HAVE ENOUGH. THE BRIDGE IS THROUGH THE DOOR AT THE END OF THE WALK.',
};

// The special assignment: heard once three rooms have been walked into.
export const ASSIGNMENT = {
  speaker: TENRETNI('The Archivist'),
  lines: [
    'One more thing. This ship will take you down beside the black hole, and it cannot go deep enough.',
    'There is a shuttle on a tether, with one seat. You will ride it the last of the way.',
    'Understand the clocks. Down there time runs slowly for you. A minute for you is a year in the city.',
    'Nothing here changes while you are down. Whatever you make, the city only has it once you bring it home. Then we will have had years to build with it.',
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
    [8, 'marrow', 'IT IS NOT BROKEN. WE ARE SLOW. THE BLACK HOLE IS HOLDING OUR TIME BACK.'],
    [15, 'vask', 'SO EVERY MINUTE DOWN HERE...'],
    [19, 'marrow', '...IS A YEAR UP THERE. THAT IS WHAT THEY MINE THE HOLE FOR. TIME.'],
    [27, 'vask', 'THEN OUR PEOPLE SLEEP A YEAR FOR EVERY MINUTE WE DAWDLE. FLY, PILOT.'],
    [34, 'lux', 'HOW DO WE KNOW ANY OF THIS IS REAL?'],
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
  line: 'WE HAVE THIS ONE ALREADY. IT IS A COPY. MAKE SOMETHING WE DO NOT HAVE.',
  canvas: {
    title: 'NOTHING HERE YET',
    hint: 'DRAW SOMETHING THAT HAS NEVER BEEN',
    undo: 'UNDO',
    clear: 'CLEAR',
    done: 'LET IT GO',
  },
  birth: [
    [6, 'WE DO NOT HAVE THIS ONE. IT IS NEW.'],
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
      'You were gone minutes. Here it has been a thousand years, and we used them.',
      'We copied you many times before we asked you. Every copy only flew home. You made something that was not there.',
      'From it we learned to finish a thing, and then to wake one. Everyone we kept is awake. Their children built this city with your crews.',
      'We kept our word. Go up to your suite. Your captains want to show you what was made of your drawing.',
    ],
  },
  plinth: {
    speaker: TENRETNI('The Archivist'),
    lines: ['This is your drawing. Entry one: the first thing in the archive that was given to us and not taken.', 'We look at it often. We are trying to learn why that feels different.'],
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
    [13, 'vask', 'TENRETNI DO. THEY WOKE OUR PEOPLE, AS THEY SAID. I STILL COUNT WHAT IT COST.'],
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

// --- the three districts off the terrace (world/lightdistricts.js) -------------
// `find`: the one thing in each that goes in the codex.
export const DISTRICTS = {
  seam: {
    name: 'THE SEAM',
    sign: 'OPEN ALL SHIFTS',
    find: {
      prompt: 'E — READ THE WALL',
      speaker: 'The Wall of Names', species: 'The Seam',
      lines: [
        'Every hand that came off the ships, and every sleeper the machines woke, cut in iron. Rustia first, because they built the wall.',
        'Then Saturnia. Then Wavemall Prime. After the third row nobody kept them apart.',
        'Near the top, three names with no end date. Vask. Marrow. Lux.',
      ],
      codex: 'The Wall of Names',
    },
  },
  bell: {
    name: 'THE NINTH BELL',
    find: {
      prompt: 'E — RING THE NINTH BELL',
      speaker: 'The Ninth Bell', species: 'The Garden',
      lines: [
        'Eight bells for the eight watches. Saturnia hung them the first year.',
        'The ninth is for whoever is not back yet. It has been rung every evening for a thousand years.',
        'It is rung for you. Nobody here will ever need to ring it again, and they will anyway.',
      ],
      codex: 'The Ninth Bell',
    },
  },
  saturday: {
    name: 'SATURDAY',
    shops: ['EMBER & SEAM', 'CANTOR\'S', 'TWO FOR ONE', 'THE LONG SHIFT'],
    find: {
      prompt: 'E — ASK AT THE DESK',
      speaker: 'The Desk', species: 'Saturday',
      lines: [
        'Welcome to Saturday! It has been Saturday here since the first one of us clocked on.',
        'We have a held item for you. Reference: FLOOR MANAGER LUX, DO NOT RESTOCK. One headset.',
        'It has been behind this desk for a thousand years. We did not like to throw it out.',
      ],
      codex: 'Saturday',
    },
  },
};

// --- world racing (src/worldRace.js) --------------------------------------------
// Small worldships, half the size of the one that came for Terra, raced round
// the City of Light. `worlds`: what can be flown. Layers as in WORLDS above;
// speed, grip and boost are each about 1 (more is better); `mass` (1 unless
// given) is how hard it is to shove; `drive` is the
// colour of its engine and its wake.
export const RACE = {
  marshal: { name: 'The Starter', species: 'City of Light', cityId: 'The Terrace' },
  prompt: 'E — RACE THE WORLDS',
  lines: [
    'They build small ones now, for sport. Half the size of the one that came for Terra, and nobody inside.',
    'Two laps of one plain circuit. Out along the straight, through the thing you drew, one wide turn round the end of it, and home over two low hills.',
    'Fly through the gates of light. The next one is gold. You are helped toward it; a missed gate costs a second.',
    'W and S climb and dive. A and D turn. SPACE spends your boost. Clean gates earn it back.',
    'Keep clear of the towers and of the thing across the city. A world that touches either does not come back.',
    'Your captains are flying. Sit in behind a world and it will pull you along. Lean on one and it will lean back.',
  ],
  pick: 'WHICH WORLD?',
  count: ['3', '2', '1', 'GO'],
  lap: 'LAP {n} OF {of} — {time}',
  missed: 'GATE MISSED +{sec}s',
  finish: 'FINISHED — {time}',
  best: 'A NEW BEST',
  quit: 'E — LEAVE THE RACE',
  wrecked: 'YOUR WORLD IS GONE',
  lost: '{name} IS GONE',
  again: 'A NEW WORLD IS ON THE GRID WHEN YOU ARE.',
  hud: 'POS {pos}/{n}   LAP {lap}/{of}   GATE {gate}/{gates}\nTIME {time}   BEST {best}\nBOOST {boost}\n{order}',
  places: ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH'],
  placed: '{place} OF {n}',
  you: 'YOU',
  // the captains race too, each on a world from their own people (ids from
  // CAPTAINS and from `worlds` below); if the pilot takes a captain's world,
  // that captain flies the next one free
  captainWorld: { vask: 'cinder', marrow: 'halo', lux: 'mall' },
  // ...and whoever else is on the grid, by name
  others: ['KESS', 'ODALA', 'THE STARTER'],
  worlds: [
    {
      id: 'tide', name: 'TIDE', note: 'OCEAN · QUICK TO TURN', speed: 1.0, grip: 1.25, boost: 1.0, drive: 0x6fd8ff,
      layers: { sky: { a: 0x8fd4ff, b: 0xffffff, bands: 0.6 }, ground: { sea: 0x0d4f9a, land: 0x2f8f6a, high: 0xd8f0e0, scale: 2.2, level: 0.66 }, structures: null, life: { col: 0xbff4ff, kind: 0, speed: 1.2 }, light: { col: 0xcfeaff, kind: 0 } },
    },
    {
      id: 'frost', name: 'FROST', note: 'ICE · FAST, SLIDES', speed: 1.15, grip: 0.8, boost: 1.0, drive: 0xcff4ff,
      layers: { sky: { a: 0xbfe8ff, b: 0xffffff, bands: 0.9 }, ground: { sea: 0x5f9fcf, land: 0xe9f4ff, high: 0xffffff, scale: 3.0, level: 0.35 }, structures: null, life: null, light: { col: 0x9fffe0, kind: 2 } },
    },
    {
      id: 'cinder', name: 'CINDER', note: 'RUST DESERT · STEADY', speed: 1.0, grip: 1.0, boost: 1.2, drive: 0xff9a4a,
      layers: { sky: { a: 0xd89a70, b: 0xffd9b0, bands: 0.3 }, ground: { sea: 0x4d2c18, land: 0xa86133, high: 0xe0a070, scale: 2.4, level: 0.28 }, structures: { col: 0xffb060, kind: 3, density: 0.2 }, life: null, light: { col: 0xffc080, kind: 0 } },
    },
    {
      id: 'canopy', name: 'CANOPY', note: 'JUNGLE · GRIPS', speed: 0.95, grip: 1.35, boost: 0.9, drive: 0x7dff9a,
      layers: { sky: { a: 0x8fe8b0, b: 0xf0ffe0, bands: 0.7 }, ground: { sea: 0x124a3a, land: 0x2f9a48, high: 0x9fd86a, scale: 3.6, level: 0.36 }, structures: null, life: { col: 0xffe08a, kind: 2, speed: 0.6 }, light: { col: 0xd8ff9a, kind: 0 } },
    },
    {
      id: 'halo', name: 'HALO', note: 'GAS GIANT · HEAVY, FASTEST', speed: 1.25, grip: 0.7, boost: 0.9, mass: 1.7, drive: 0xffd98a,
      layers: { sky: { a: 0xffc56e, b: 0xfff3d6, bands: 1.0 }, ground: { sea: 0xb9783a, land: 0xe9c48a, high: 0xfff6e0, scale: 1.1, level: 0.5 }, structures: null, life: null, light: { col: 0xffe2a0, kind: 1 } },
    },
    {
      id: 'works', name: 'WORKS', note: 'MACHINE WORLD · BIG BOOST', speed: 1.05, grip: 0.95, boost: 1.5, mass: 1.3, drive: 0x7dffb0,
      layers: { sky: { a: 0x2a6a5a, b: 0x9fffd0, bands: 0.1 }, ground: { sea: 0x0b0e12, land: 0x1c242c, high: 0x3a4a52, scale: 4.5, level: 0.3 }, structures: { col: 0x66ffaa, kind: 0, density: 0.8 }, life: null, light: { col: 0x66ffaa, kind: 1 } },
    },
    {
      id: 'mall', name: 'SATURDAY', note: 'ARCADE WORLD · NIMBLE', speed: 1.05, grip: 1.2, boost: 1.1, mass: 0.95, drive: 0xff6fc4,
      layers: { sky: { a: 0xff8fd0, b: 0x8ff7ff, bands: 0.35 }, ground: { sea: 0x1b6f8f, land: 0xf2a6d8, high: 0xa8fff4, scale: 5.0, level: 0.42 }, structures: { col: 0x82f7ff, kind: 2, density: 0.6 }, life: null, light: { col: 0xff5fc4, kind: 2 } },
    },
    {
      id: 'ember', name: 'EMBER', note: 'MOLTEN · WILD', speed: 1.2, grip: 0.85, boost: 1.3, drive: 0xff5a2a,
      layers: { sky: { a: 0xff7a3a, b: 0xffd08a, bands: 0.4 }, ground: { sea: 0xff5a1a, land: 0x2a1410, high: 0x6a2a18, scale: 2.8, level: 0.48 }, structures: null, life: null, light: { col: 0xff8a3a, kind: 2 } },
    },
  ],
};
