// The peoples of the worlds, and their captains.
//
// One rule: every person from a world carries that world's signature. A
// captain is the clearest example of their people; citizens vary inside the
// world's ranges and never outside them.
//
// Ranges are [min, max]; seeded draws pick inside them (world/aliens.js
// buildRig, with its mulberry32). A bare number is fixed for everyone.
//
//   SPECIES            the ranges and the signature of each people
//   CAPTAINS           the named figures: a species, then what is forced
//   SPECIES_BY_WORLD   which people a world's (or a city's) crowd is made of
//
// The signatures themselves are built in world/signatures.js.

export const SPECIES = {
  rustia: {
    people: 'Rustians', height: [1.95, 2.3], build: [1.1, 1.25], limb: [1.0, 1.15],
    headScale: [0.95, 1.1], headShape: 'angular', eyes: 2, eyeScale: 1.0, eyeColor: '#FFA860',
    skin: ['#8A4A2E', '#3E2E28'], skinRoughness: 0.85,
    signature: { type: 'emberSeams', color: '#FF8A3A', brightness: [0.6, 1.0] },
    antennae: false, crest: false, tail: false, gait: [0.75, 0.95],
    dress: ['#8A3F20', '#2A2420', '#4A4F57', '#C9A455'],
  },
  saturnia: {
    people: 'Saturnians', height: [1.45, 1.7], build: [0.8, 0.95], limb: [1.05, 1.2],
    headScale: [1.05, 1.2], headShape: 'elongated', eyes: 2, eyeScale: [1.4, 1.6], eyeColor: '#A9D8FF',
    skin: ['#EFE6D2', '#D9C08A'], skinRoughness: 0.55,
    signature: { type: 'headRing', color: '#FFD98A', tiltDeg: 16, width: [0.7, 1.4] },
    antennae: false, crest: false, tail: false, gait: [0.75, 0.9],
    dress: ['#F1ECDF', '#C9A455', '#2F4F86'],
  },
  wavemall: {
    people: 'Wavemallers', height: [1.55, 1.8], build: [1.0, 1.15], limb: [0.95, 1.1],
    headScale: [1.05, 1.15], headShape: 'block', eyes: 2, eyeScale: 1.0, eyeColor: 'followsLights',
    skin: ['#C9C3D6', '#6E6A86'], skinRoughness: 0.5,
    signature: { type: 'shiftLights', colors: ['#FF5FA8', '#82F7FF', '#F0A83C'], periodCalmS: 8, periodAfraidS: 0.8 },
    antennae: false, crest: false, tail: false, gait: [1.1, 1.35],
    dress: ['#FF5FA8', '#82F7FF', '#1A1622', '#F6F2F8'],
  },
  neptunia: {
    people: 'Neptunians', height: [1.7, 1.95], build: [1.05, 1.2], limb: [0.95, 1.05],
    headScale: [0.95, 1.05], headShape: 'round', eyes: 2, eyeScale: [1.2, 1.4], eyeColor: '#6FE3FF',
    skin: ['#2E3A7A', '#4A5C9E'], skinRoughness: 0.2,
    signature: { type: 'gillsWebbing', color: '#8FD9E8', slits: 3 },
    antennae: false, crest: false, tail: false, gait: [0.9, 1.1],
    dress: ['#1F4A52', '#E8C547', '#16252B'],
  },
  // The Foregone (plans/season-1-arc.md): no crowd of them is walked
  // anywhere, so no world names them in SPECIES_BY_WORLD. Their one figure is
  // the envoy (CAPTAINS.ione). Tall and narrow, a still face, no signature:
  // what marks one of them is the dress.
  foregone: {
    people: 'Foregone', height: [1.8, 1.9], build: [0.86, 0.94], limb: [1.06, 1.14],
    headScale: [1.0, 1.06], headShape: 'elongated', eyes: 2, eyeScale: 1.1, eyeColor: '#D8D2FF',
    skin: ['#CFC9DD', '#B9B3CB'], skinRoughness: 0.45,
    signature: null,
    antennae: false, crest: false, tail: false, gait: [0.8, 0.9],
    dress: ['#262A36', '#E9E6F2', '#BFC6D6'],
  },
  // Terra and Wyattmattoe: world/people.js crowds as they are. No signature.
  human: { people: 'Humans', worlds: ['terra', 'wyattmattoe'], builder: 'world/people.js', signature: null },
  // One body for all (world/capital.js buildRobot, 3.3 m), green on the
  // capital deck and on the far side alike. Only the eye bar changes, by role.
  // (There is no Keeper figure yet; its colour is kept here for when there is.)
  tenretni: {
    people: 'Tenretni', builder: 'world/capital.js buildRobot', height: 3.3,
    body: '#35A866', dark: '#1B5A36', farSide: 'green',
    eyeBarByRole: { warden: '#35FF8A', archivist: 'spectrum', keeper: '#FFB347' },
    archivistChest: '#5FD8FF',
  },
};

export const CAPTAINS = {
  vask: { species: 'rustia', height: 2.27, build: 1.24, skin: '#7A4530', seamBrightness: 1.0, extras: ['forearmTally5'], keepDress: true },
  // (a build above his people's range, on purpose; he has not worked a face in years)
  rynva: { species: 'rustia', height: 2.05, build: 1.32, skin: '#6B3E2C', seamBrightness: 0.3, extras: ['oreRing', 'oreChain', 'frockCoat#4A2326'] },
  marrow: { species: 'saturnia', height: 1.52, build: 0.86, skin: '#E9DDC2', eyeScale: 1.5, ringWidth: 1.4, extras: ['ringBells5', 'replaceCirclet'], keepDress: true },
  lux: { species: 'wavemall', height: 1.57, build: 1.12, skin: '#B8B2CC', lightSpeed: 3.0, extras: ['flicker'], keepDress: true },
  // Ione Vey (world/season-names.js `envoy`), envoy of the Foregone. Built
  // wherever she is met by her seed (world/aliens.js hands that seed here).
  ione: { species: 'foregone', height: 1.84, build: 0.9, skin: '#CBC5DA', eyeScale: 1.1 },
  // The governor of the Indigo Reach. In the town the office is held by
  // Madame Ossva (world/cityRegistry.js), who wears this body; the name here
  // is the owner's, and is not shown anywhere yet.
  governor: { species: 'neptunia', height: 1.88, build: 1.18, skin: '#3A4A8C', eyeScale: 1.3, name: 'Robin Parsons' },
};

// a world's name (world/cityRegistry.js `world`) or a walk site's cityId
export const SPECIES_BY_WORLD = {
  rustia: 'rustia',
  saturnia: 'saturnia',
  skycity: 'saturnia',
  'wavemall prime': 'wavemall',
  wavemall: 'wavemall',
  neptunia: 'neptunia',
};
