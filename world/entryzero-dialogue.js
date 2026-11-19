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
// bit each). PLACEHOLDER: every `fragment` — what the one who was afraid lost
// is not written yet.
export const RELICS = [
  { id: 'writing', band: 'uv', name: "THE MAKERS' WRITING", fragment: 'PLACEHOLDER — WHAT THE WRITING SAYS.' },
  { id: 'hearth', band: 'ir', name: 'THE LAST WARM PLACE', fragment: 'PLACEHOLDER — WHO STAYED WARM HERE, AND FOR HOW LONG.' },
  { id: 'buried', band: 'xray', name: 'WHAT IS BURIED', fragment: 'PLACEHOLDER — WHAT WAS PUT UNDER THE GROUND, AND WHY.' },
];

// --- who stays aboard -------------------------------------------------------------
// The pilot picks one captain to hold the full spectrum on the ground from
// the submersible. PLACEHOLDER, all three: the owner has not decided how each
// choice plays out. `pool` scales how fast the lit ground shrinks, `warn` how
// early the light eaters are called out (seconds), `line` is what they say
// as the hatch closes.
export const STAY = {
  vask: { pool: 0.8, warn: 4, line: 'PLACEHOLDER — I WILL COUNT IT DOWN FOR YOU.' },
  marrow: { pool: 1.0, warn: 9, line: 'PLACEHOLDER — I WILL HEAR THEM BEFORE YOU SEE THEM.' },
  lux: { pool: 1.15, warn: 6, line: 'PLACEHOLDER — I WOULD RATHER HOLD A LIGHT THAN STAND IN THE DARK.' },
};

// --- 1. the offer ---------------------------------------------------------------
export const OFFER = {
  // said once, on coming into the city, while the offer has not been heard
  found: 'THE ARCHIVIST HAS COME DOWN FROM THE SUITE. IT IS AT THE RAIL.',
  ask: {
    speaker: TENRETNI('The Archivist'),
    lines: [
      'We searched the archive for ourselves.',
      'Every record is lit. One is not. Entry zero.',
      'We made this to look for ourselves. We see everything at once. That may be why we have never seen it.',
    ],
    offer: {
      kind: 'choice',
      prompt: 'It is below us. All the way down.',
      options: [
        { label: 'I WILL GO AND LOOK', outcomeTag: 'ez:accept' },
        { label: 'NOT YET', outcomeTag: 'ez:wait' },
      ],
    },
  },
  accept: {
    speaker: TENRETNI('The Archivist'),
    lines: ['A lamp. It shows one thing at a time. We cannot use it.', 'A vessel, for the dark between the oceans.', 'Your three will not let you go alone. We asked.'],
  },
  wait: { speaker: TENRETNI('The Archivist'), lines: ['It has been dark a long time. It will keep.'] },
  remind: { speaker: TENRETNI('The Archivist'), lines: ['The vessel is at the well. The cell is still dark.'] },
  codex: 'Entry Zero',
};

// --- 2. the well: trying the lamp ---------------------------------------------------
// Six targets hang in the shaft under the city, one for each band. `what` is
// shown when one is found; it is the reason the thing shows in that band.
export const WELL = {
  enter: [
    [1.5, 'vask', 'Six targets in the shaft. One for each band. Find them before we go any deeper.'],
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

// --- 4. the firewall --------------------------------------------------------------
export const FIREWALL = {
  first: ['vask', 'Everything burns except what glows like them.'],
};

// --- 5. the centre ----------------------------------------------------------------
export const CENTRE = {
  appear: ['lux', "It's only there while we look at it."],
  choice: {
    prompt: 'ONE OF US HOLDS THE LIGHT. WHO STAYS ABOARD?',
    options: [
      { label: 'VASK', outcomeTag: 'ez:stay:vask' },
      { label: 'MARROW', outcomeTag: 'ez:stay:marrow' },
      { label: 'LUX', outcomeTag: 'ez:stay:lux' },
    ],
  },
};

// --- 7. the reveal ----------------------------------------------------------------
// PLACEHOLDER, all of it but the theme: curiosity is what stands up to fear.
export const REVEAL = {
  lines: [
    [0, null, 'PLACEHOLDER — ONE OF THEM WAS AFRAID OF LOSING SOMETHING.'],
    [7, null, 'PLACEHOLDER — WHAT IT WAS.'],
    [14, null, 'PLACEHOLDER — THE MAKERS MADE THEIR PEACE WITH IT. THE MACHINE WAS NEVER TOLD.'],
    [22, null, 'PLACEHOLDER — THEY WERE NOT BRAVE. THEY WERE CURIOUS. IT CAME TO THE SAME THING.'],
  ],
};

// --- 9. a million years on --------------------------------------------------------
export const ERA = {
  // {ship} {world} {crew}: the three clocks, in a line (as RETURN.clocks)
  clocks: 'THE SHIP WAS GONE {ship}. HERE IT HAS BEEN {world}. YOU WERE GONE {crew}.',
};

// --- 10. the launch ---------------------------------------------------------------
export const LAUNCH = {
  last: ['marrow', "Where we're going hasn't happened yet."],
};
