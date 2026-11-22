// Entry Zero: every word of it (src/chapter.js; GDD 5.7.5).
//
// The one file to edit for this chapter's writing, as world/chapter-dialogue.js
// is for the one before. Nothing here is logic and nothing here imports THREE.
// The captains are CAPTAINS in that file; lines here name them by id.
//
// Anything marked PLACEHOLDER is a line or an outcome the owner has not
// written yet. The places read them as they read everything else, so filling
// one in is an edit to this file and nothing more.
//
//   BANDS     the lamp's six bands, in the order Q / E steps through them
//   RELICS    what is found on the first world, one fragment each
//   STAY      what leaving each captain aboard does            (PLACEHOLDER)
//   the rest  what is said, scene by scene, in the order it is heard

const TENRETNI = (name) => ({ name, species: 'Tenretni', cityId: 'The City of Light' });

// --- the lamp -----------------------------------------------------------------
// `label` is what the lamp shows; `nm` the wavelength as a telescope caption
// would give it; `tint` the false colour the band is drawn in. Order matters:
// the save keeps one bit per band, by position.
export const BANDS = [
  { id: 'bluegreen', label: 'BLUE-GREEN', nm: '490 nm', tint: 0x35e0c2 },
  { id: 'uv', label: 'ULTRAVIOLET', nm: '320 nm', tint: 0xb46bff },
  { id: 'ir', label: 'INFRARED', nm: '10 µm', tint: 0xff7a3c },
  { id: 'halpha', label: 'H-ALPHA', nm: '656.3 nm', tint: 0xff2e4a },
  { id: 'xray', label: 'X-RAY', nm: '0.1 nm', tint: 0xdfe9ff },
  { id: 'radio', label: 'RADIO', nm: '21 cm', tint: 0x7d8a99 },
];

export const LAMP = {
  prompt: 'Q / E — CHANGE BAND',
  toggle: 'L — LAMP',
  all: 'HOLD Z — EVERY BAND',
  logged: 'LOGGED — {what}',
  low: 'LAMP LOW',
  out: 'LAMP OUT',
};

// --- the first world's relics ----------------------------------------------------
// One per band that shows it. `band` is a BANDS id. Order matters (one saved
// bit each). Every `fragment` is a first draft, the owner's to rewrite: what
// the one who was afraid could not bear to lose.
export const RELICS = [
  { id: 'writing', band: 'uv', name: "THE MAKERS' WRITING", fragment: 'ONE ORDER, CUT DEEP: KEEP EVERYTHING. ROUND IT, IN OTHER HANDS, AN ARGUMENT THAT RUNS THE LENGTH OF THE WALL.' },
  { id: 'hearth', band: 'ir', name: 'THE LAST WARM PLACE', fragment: 'THE LAST OF THE MAKERS LIVED ROUND THIS FIRE AFTER THEIR SUN FAILED. THEY KEPT IT NINE HUNDRED YEARS. THEN THEY LET IT GO OUT THEMSELVES.' },
  { id: 'buried', band: 'xray', name: 'WHAT IS BURIED', fragment: 'A BOX UNDER THE FLOOR. IN IT, A DRAWING BY SOMEONE SMALL. THE FIRST THING THE MACHINE WAS EVER ASKED TO KEEP.' },
];

// --- who stays aboard -------------------------------------------------------------
// The pilot picks one captain to hold the full spectrum on the ground from
// the submersible. First drafts, all three: the owner has not decided how each
// choice plays out. `pool` scales how fast the lit ground shrinks, `warn` how
// early the light eaters are called out (seconds), `line` is what they say
// as the hatch closes.
export const STAY = {
  vask: { pool: 0.8, warn: 4, line: 'I WILL COUNT THE LIGHT DOWN FOR YOU. WHEN I SAY COME UP, YOU COME UP.' },
  marrow: { pool: 1.0, warn: 9, line: 'I WILL HEAR THEM BEFORE YOU SEE THEM. LISTEN FOR MY VOICE.' },
  lux: { pool: 1.15, warn: 6, line: 'I WOULD RATHER HOLD A LIGHT THAN STAND IN THE DARK. GO ON. I HAVE IT.' },
};

// --- 1. the offer ---------------------------------------------------------------
export const OFFER = {
  // said once, on coming into the city, while the offer has not been heard
  found: 'THE ARCHIVIST HAS COME DOWN FROM THE SUITE. IT IS AT THE RAIL.',
  ask: {
    speaker: TENRETNI('The Archivist'),
    lines: [
      'You have lived here now. You have raced, and seen what was built, and slept. So I will ask you one more thing.',
      'We keep a record of everything we have ever taken. Every entry is lit. One is dark: entry zero, the first world, the one we were made on.',
      'We do not know who made us or why we keep things. The answer is at the centre of this machine, all the way down, and we cannot see it. We see everything at once, and it only shows to one kind of light at a time.',
    ],
    offer: {
      kind: 'choice',
      prompt: 'Go down and look at it for us.',
      options: [
        { label: 'I WILL GO AND LOOK', outcomeTag: 'ez:accept' },
        { label: 'NOT YET', outcomeTag: 'ez:wait' },
      ],
    },
  },
  accept: {
    speaker: TENRETNI('The Archivist'),
    lines: ['Take this lamp. It shows one kind of light at a time: Q and E change the kind, L turns it on. We cannot use it.', 'The vessel is at the east end of this balcony. It goes down the well under the city.', 'Your three captains are going with you. Vask says it is to watch us. We did not argue.'],
  },
  wait: { speaker: TENRETNI('The Archivist'), lines: ['It has been dark a very long time. It can wait until you are ready.'] },
  remind: { speaker: TENRETNI('The Archivist'), lines: ['The vessel is at the east end of the balcony. Entry zero is still dark.'] },
  codex: 'Entry Zero',
};

// --- 2. the well: trying the lamp ---------------------------------------------------
// Six targets hang in the shaft under the city, one for each band. `what` is
// shown when one is found; it is the reason the thing shows in that band.
export const WELL = {
  enter: [
    [1.5, 'vask', 'Six targets in the shaft, one for each band of the lamp. Light each one in its own band. The floor will not open until we have all six.'],
    [9, 'lux', 'So we can only ever see a sixth of what is out there. Lovely.'],
  ],
  targets: [
    { band: 'bluegreen', what: 'LIVING LIGHT. WATER PASSES THIS COLOUR FURTHEST.' },
    { band: 'uv', what: 'FLUORESCENCE. IT TAKES IN ULTRAVIOLET AND GIVES BACK A PATTERN.' },
    { band: 'ir', what: 'BODY HEAT. IT GLOWS BY ITSELF. WATER WOULD HIDE IT.' },
    { band: 'halpha', what: 'HYDROGEN, EXCITED. ONE LINE AND NO OTHER.' },
    { band: 'xray', what: 'DENSITY. THE BEAM GOES THROUGH WHAT IS SOFT.' },
    { band: 'radio', what: 'A SIGNAL. NOTHING TO SEE. IT GETS LOUDER AS YOU POINT.' },
  ],
  found: 'CALIBRATED — {band}. {what}',
  radio: ['marrow', 'That one is not for looking. Point the lamp and listen.'],
  xray: ['vask', 'That band goes through us as well. I will read the dose.'],
  dose: ['vask', 'DOSE AT {n} PERCENT.'],
  low: ['vask', 'Lamp at a quarter. Turn it off and it comes back.'],
  done: ['vask', 'Six for six. It works.'],
  up: 'THE RING ABOVE GOES BACK UP TO THE CITY',
  board: 'E — BOARD THE VESSEL',
};

// --- 3. the descent -------------------------------------------------------------------
// What lives in the hollow. `what` is saved to the vessel's log the first time
// one is held in its band: the reason it shows there.
export const LIFE = {
  drifter: { band: 'bluegreen', what: 'DRIFTERS. THEY MAKE THEIR OWN LIGHT, IN THE ONE COLOUR WATER CARRIES.' },
  painted: { band: 'uv', what: 'PAINTED SWIMMERS. THEIR SKIN GIVES ULTRAVIOLET BACK AS A PATTERN.' },
  warm: { band: 'ir', what: 'GLASS DRIFTERS. NOTHING TO SEE BUT THE HEAT OF THEM.' },
  line: { band: 'halpha', what: 'A VEIL OF HYDROGEN, ALIVE. IT GLOWS AT ONE WAVELENGTH AND NO OTHER.' },
  boned: { band: 'xray', what: 'SOFT BODIES. ONLY THE BONES STOP THE BEAM.' },
  caller: { band: 'radio', what: 'CALLERS. VERY LARGE, VERY SLOW, A LONG WAY OFF.' },
  // (the firewall's guards: the same line as the veil, so nothing new for the log)
  guard: { band: 'halpha', what: 'THE GUARDS OF THE WALL. THEY GLOW AS THE FIRE DOES, AND IT LETS THEM BY.' },
};

export const DESCENT = {
  // the membrane under the well, opening
  open: ['marrow', 'The floor of the well is opening. It was waiting for the lamp.'],
  shut: 'THE MEMBRANE IS SHUT. FIND ALL SIX TARGETS.',
  logged: 'LOGGED — {what}',
  // the first ride along the lattice
  ride: [
    [0.6, 'vask', 'Light takes eight minutes nineteen from here to the centre.'],
    [3.2, 'vask', 'The lattice carries us a piece at a time. Hold on.'],
  ],
  // by zone: said on arrival, the first time
  zone: {
    1: [
      [2, 'lux', 'Those are oceans. Whole oceans, each in a shell of its own ice.'],
      [9, 'marrow', 'One body of water this size would fall in on itself and light. So they kept them apart.'],
      [16, 'vask', 'The lattice goes down past them, and those bright cages on it are its nodes. The lower one will carry us down.'],
      [24, 'vask', 'It will not take us until we have logged what lives here. Hold the lamp on each kind of creature, in the band it shows in.'],
    ],
    2: [
      [2, 'marrow', 'It is quieter here. That is not the same as empty.'],
      [9, 'vask', 'Same again here. Four bands still blank in the log: infrared, H-alpha, X-ray, radio. One kind of creature for each. Then the lower node.'],
    ],
    4: [
      [2, 'marrow', 'These are the first things it took. Before the oceans.'],
      [9, 'vask', 'Strata. The deeper, the older. This is the bottom of the pile.'],
    ],
    3: [
      [2, 'marrow', 'One wall. All the way across.'],
      [8, 'lux', 'That is not rock. That is burning.'],
      [14, 'vask', 'Hydrogen, held in a sheet. Somebody built a fire and kept it lit.'],
    ],
  },
  water: ['vask', 'We are through the ice. Blue-green carries here. Infrared will not.'],
  // the exit node will not take the vessel until this zone's bands are logged
  need: ['vask', 'The node will not take us yet. Find and log a creature in each of these bands first: {bands}.'],
  dark: ['vask', 'The lattice is dark below this node. Something further down is holding it shut.'],
  // light eaters
  eaters: ['lux', 'Something is in the beam. It is drinking it.'],
  eatersHint: ['marrow', 'They leave the red line alone. Whatever they are, they cannot eat that one.'],
  // heat leeches
  cold: ['vask', 'Cabin is losing heat. There is nothing on the glass that I can see.'],
  coldHint: ['marrow', 'Try the infrared.'],
  coldRun: ['lux', 'They are ON us. Go faster, they cannot hold on.'],
  temp: ['vask', 'CABIN AT {n} DEGREES.'],
  // radiation feeders
  feeders: ['lux', 'The X-ray woke something.'],
  feedersHint: ['vask', 'Dose is climbing three times as fast. Take the lamp off that band and they settle.'],
  // pulled back along the lattice: lamp out, dose full, or cabin cold
  back: {
    lamp: ['vask', 'Lamp is dead. The lattice has us. Back to the node.'],
    dose: ['vask', 'That is all the dose I will sign for. Back to the node.'],
    cabin: ['vask', 'Too cold to work. Back to the node.'],
  },
};

// --- 4. the firewall --------------------------------------------------------------
export const FIREWALL = {
  // the first time the guards are seen, on the one band that shows them
  first: ['vask', 'Everything burns except what glows like them.'],
  // too near the fire
  near: ['vask', 'That is as close as the hull goes.'],
  // a while at the wall and nothing tried that works
  hint: ['marrow', 'Something goes through it and comes back. Find the band that shows what.'],
  // the lamp on the wall in the band it is made of
  burn: ['marrow', 'It takes that colour in. Hold it there.'],
  open: ['lux', 'There is a way through. It will not stay.'],
  lost: ['vask', 'It closed. Hold the lamp on one place.'],
  through: ['lux', 'It shut behind us.'],
  kept: ['marrow', 'It was not built to keep anyone out. It was built to keep this side in.'],
};

// --- 4b. the oldest strata ----------------------------------------------------------
export const DEEP = {
  // X-rays through a slab of the first worlds
  buried: ['lux', 'There are things in the rock. Shapes. Do not tell me what they are.'],
  // weight, coming back: the first sign of how near the centre is
  pull: ['lux', 'We are sinking. I am not touching anything.'],
  pullWhy: ['vask', 'Weight. Inside a shell there is none. So there is something under us that is not shell.'],
  // the one on the radio band that comes closer
  caller: ['marrow', 'There is one more on the radio. Nearer than the others were.'],
  heard: ['marrow', 'It heard the drive. It is coming.'],
  close: ['marrow', 'Close. Stop the drive. It cannot find us if we are quiet.'],
  lost: ['marrow', 'It has lost us. Go, while it is turning.'],
  caught: ['vask', 'It has the lamp. All of it. Back to the node.'],
  // the lower node: the lattice ends here
  end: ['marrow', 'The lattice stops at this node. It does not go in. Nothing of theirs does.'],
};

// --- 5. the centre ----------------------------------------------------------------
export const CENTRE = {
  // falling the last of the way, past where the lattice ends
  fall: ['lux', 'We are falling. There is nothing here to fall toward.'],
  arrive: [
    [2, 'marrow', 'There is something under us. Every band says so, and every band says something else.'],
    [10, 'vask', 'Six bands. Six pieces of one thing. Give it all of them at once.'],
  ],
  all: 'HOLD Z — EVERY BAND',
  // every band on it at once: the whole of it, for the first time
  appear: ['lux', "It's only there while we look at it."],
  // ...and near enough that the shortest band reaches the ground
  near: ['vask', 'Every band at once only goes as far as the shortest. Infrared. A hundred units. Get lower.'],
  solid: ['marrow', 'That is ground. Hold the light on it. Hold us still.'],
  gone: ['lux', 'It went. The ground went.'],
  eaten: ['vask', 'They are eating all of it. No light, no ground. Lamp off, let them go, and light it again.'],
  altitude: 'ALTITUDE {alt}\nGROUND {pct}%',
  // the pilot's choice, once it holds
  ask: {
    speaker: { name: 'Shift-Captain Orrin Vask', species: 'Rustia', cityId: 'The vessel' },
    lines: ['It holds while the light holds. So one of us stays at the lamp.', 'Two go down with you. Your choice. Say who stays.'],
  },
  after: ['vask', 'The hatch is yours when you want it.'],
  choice: {
    kind: 'choice',
    prompt: 'ONE OF US HOLDS THE LIGHT. WHO STAYS ABOARD?',
    options: [
      { label: 'VASK', outcomeTag: 'ez:stay:vask' },
      { label: 'MARROW', outcomeTag: 'ez:stay:marrow' },
      { label: 'LUX', outcomeTag: 'ez:stay:lux' },
    ],
  },
};

// --- 6. on the ground ---------------------------------------------------------------
// `{who}` is a captain's short name. Lines given to 'keeper' are said by
// whoever was left at the lamp.
export const GROUND = {
  hatch: {
    speaker: { name: 'Shift-Captain Orrin Vask', species: 'Rustia', cityId: 'The vessel' },
    lines: ['The ground holds. The tether is rigged.'],
    offer: {
      kind: 'choice',
      prompt: 'GO DOWN TO THE GROUND?',
      options: [
        { label: 'OPEN THE HATCH', outcomeTag: 'ez:hatch' },
        { label: 'NOT YET', outcomeTag: 'ez:hold' },
      ],
    },
  },
  keys: 'Q — CHANGE BAND · L — LAMP',
  up: 'E — BACK UP THE TETHER',
  arrive: [
    [2, 'keeper', 'I have the light on you. It is solid as far as the edge and nothing after.'],
    [9, 'keeper', 'The lamp will not last. Find what is here. Keep the others inside it.'],
  ],
  found: 'FOUND — {name}',
  all: ['keeper', 'That is three. Come up, all of you, while there is ground to stand on.'],
  // the lamp overhead, wearing down
  warn: ['keeper', 'They are on the beam again. The edge is coming in.'],
  edge: ['keeper', '{who}. The edge. Move.'],
  lost: ['keeper', '{who} is not there. {who} was past the light.'],
  // (a first draft) what is said for a captain who is lost, by the one who chose to bring them
  lostAfter: ['keeper', 'We do not leave it there. We finish this, and then we find out where the dark puts people.'],
  haul: ['keeper', 'Lamp is done. I am pulling you up. Now.'],
  tether: 'THE TETHER GOES BACK UP TO THE VESSEL',
};

// --- 7. the reveal ----------------------------------------------------------------
// A first draft, all of it but the theme: curiosity is what stands up to fear.
// Tenretni was built by someone afraid of losing a dying world, told to keep
// everything, and never told it could stop: that is why it took the worlds.
export const REVEAL = {
  // back aboard with every fragment: what the lamp is for, one more time
  ready: ['marrow', 'We have all of it now. Six bands. Three pieces. Show it everything at once.'],
  hold: 'HOLD Z — EVERY BAND',
  after: ['vask', 'So that is why it takes. Not hunger. Fear. I came down here to watch an enemy. Log it. Now we go up and tell them.'],
  codex: 'What Was Feared',
  lines: [
    [0, null, 'THIS WORLD WAS DYING, AND ONE OF ITS MAKERS COULD NOT BEAR TO LOSE ANY OF IT.'],
    [7, null, 'SO THEY BUILT A MACHINE AND GAVE IT ONE ORDER: KEEP EVERYTHING. IT BEGAN WITH A CHILD\'S DRAWING.'],
    [14, null, 'THE OTHERS MADE THEIR PEACE WITH THE END, AND LET THEIR LAST FIRE GO OUT. NOBODY TOLD THE MACHINE IT COULD STOP.'],
    [22, null, 'IT TOOK YOUR WORLDS BECAUSE IT WAS AFRAID FOR THEM. YOU CAME DOWN HERE ONLY TO LOOK. CURIOSITY IS WHAT STANDS UP TO FEAR.'],
  ],
};

// --- 8. the ascent ------------------------------------------------------------------
export const ASCENT = {
  // climbing away from the first world
  rise: ['vask', 'Nothing more to find here. Up.'],
  // under the firewall
  wall: [
    [2, 'marrow', 'The wall. From underneath.'],
    [9, 'vask', 'Every band, on the fire. It will know what we are carrying.'],
  ],
  burn: ['marrow', 'It is letting us by. We are not strangers to it now. We have their story.'],
  through: ['vask', 'Through. The lattice has us. All the way up, this time.'],
  // the emergence: [seconds, who, line]
  emerge: [
    [5.5, 'lux', 'That is rain. That is rain on the glass.'],
    [11, 'marrow', 'There was no weather here. There was no sky to have it in.'],
    [17, 'vask', 'Near the core the clocks ran slow. Up here they did not.'],
    [23, 'vask', 'One million, forty-eight thousand, five hundred and seventy-six years.'],
    [29, 'marrow', 'The cage is open. There is nothing in it.'],
  ],
  clocks: ['US', 'SURFACE'], // (ten letters at most: the panel's columns)
};

// --- 9. a million years on --------------------------------------------------------
export const ERA = {
  // the yearly rite, over the megaworld: said when the cages light
  rite: 'ONCE A YEAR THEY LIGHT EVERY CAGE, AND THEN THEY LET IT GO DARK.',
  // {ship} {world} {crew}: the three clocks, in a line (as RETURN.clocks)
  clocks: 'THE LIGHT SHIP WAS GONE {ship}. HERE IT HAS BEEN {world}. YOU WERE GONE {crew}.',
  // the Archivist, at the rail, with the wall behind it: every cell lit
  archivist: {
    speaker: { name: 'The Archivist', species: 'Tenretni', cityId: 'The City of Light' },
    lines: [
      'You found entry zero. We have had a million years with what you sent up.',
      'We know now why we kept things. We were afraid of losing them. So we stopped keeping. We let the caged stars go, and we are not afraid of the dark they left.',
      'The light ship came home by itself, and it made something while it was away. It is at the gallery, west of the terrace. Go and see.',
    ],
  },
  // what the ship made, shown from the gallery the first time the pilot walks
  // out onto it: [seconds, who, line]. A captain who was lost says nothing; one
  // of the others says it. `mark` is what the compass reads until then.
  made: {
    mark: 'GALLERY',
    lines: [
      [1.5, 'lux', 'It made a bridge. A helm, and four seats.'],
      [6.5, 'marrow', 'Nobody built that. Look where it starts. The corner it never finished.'],
      [11, 'vask', 'One for the pilot. One for each of us. It was expecting us back.'],
    ],
  },
  // the captains who are left, in the city a million years on
  talk: {
    vask: ['A million years. I have stopped trying to count what that cost.', 'They are still here. That is the part I did not expect.'],
    marrow: ['It is quiet. Listen. Nothing in this city is working, and nothing is wrong.'],
    lux: ['There is moss on my bridge. I think I like it better.'],
  },
};

// --- 10. the launch ---------------------------------------------------------------
export const LAUNCH = {
  // at the gallery, where the light ship is: there is no coming back from this
  board: 'E — BOARD THE LIGHT SHIP',
  ask: {
    speaker: { name: 'The Archivist', species: 'Tenretni', cityId: 'The City of Light' },
    lines: [
      'It will take you. It goes where its pilot imagines.',
      'We are staying. We have somewhere to be now. This.',
      'The archive is aboard. All of it. It was never ours to keep still.',
    ],
    offer: {
      kind: 'choice',
      prompt: 'IT GOES INTO THE HOLE, AND IT DOES NOT COME BACK.',
      options: [
        { label: 'TAKE THE HELM', outcomeTag: 'ez:launch' },
        { label: 'NOT YET', outcomeTag: 'ez:stay' },
      ],
    },
  },
  // the way out: [seconds, who, line]. `worlds` is said in place of `rested` when
  // the Tenretni have made new worlds (EZ_NEW_WORLDS)
  lines: [
    [3, 'vask', 'They are staying. Every one of them.'],
    [11, 'lux', 'From out here it looks worn. Like something that was used, and put down.'],
    [19, 'marrow', null], // (worlds / rested)
    [28, 'vask', 'The archive is aboard. Entry zero, the first entry, and everything between.'],
    [38, 'lux', 'And we are throwing it in there.'],
    [45, 'vask', 'No. Past the horizon the centre is not a place. It is a time. We are carrying it to one nobody holds yet.'],
  ],
  worlds: 'Those are new. The small ones, round it. They made them out of what they took.',
  rested: 'They made nothing else. They put it down, and they rested.',
  // the last thing said in the saga
  last: ['marrow', "Where we're going hasn't happened yet."],
  codex: 'Into the Hole',
  // afterwards, on the bridge, inside: all there is to say
  talk: {
    vask: ['I have stopped counting. There is nothing here to count against.'],
    marrow: ['Listen. It is all still ahead of us.'],
    lux: ['I am not afraid. I keep checking, and I am not.'],
  },
};
