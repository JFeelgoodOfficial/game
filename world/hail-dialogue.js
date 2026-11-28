// Hails on the bridge's screen (world/basebridge.js), and the one who comes
// aboard in a lifepod (world/basedeck.js). Data only. Rename freely: the code
// reads these and spells none of them.
//
// A hail is played once, the first time the light ship arrives in a system
// that has one, as the passage ends: the screen lights, whoever is calling is
// on it, and their words are a transmission (src/cineTalk.js, kind 'comm').
// Then the chapter's card. Only chapters whose story is not sealed have one
// here: a sealed chapter's words never appear in an unsealed file.
//
//   from      the INCOMING TRANSMISSION header
//   speaker   { name, species, cityId } as any dialogue's
//   face      what the screen shows:
//               { kind: 'rig', seed, city, col }   a figure built as that place builds its people
//                                                  (world/aliens.js buildRig), lit in `col`
//               { kind: 'wave', col }              no face: a signal, drawn as it is heard
//               { kind: 'glyph', col }             no face: a mark, turning
//   lines     what is said
//   card      { word, note }: under the chapter's name on its card, after

import { SEASON_NAMES as N } from './season-names.js';

const HUB = N.hub.toUpperCase();

export const HAILS = {
  dusk: {
    from: 'THE WALKING CAMP',
    speaker: { name: 'Signal-Keeper Ilo Vant', species: 'Sillwalker', cityId: 'The Walking Camp' },
    face: { kind: 'rig', seed: 0x5ab1, city: 'dusk', col: 0xff7a4a },
    lines: [
      'A light that moves against the stars. If you can hear this, you are a ship, and nobody has been a ship here before.',
      'This is the signal mast of the Walking Camp. We live on the line between the burning face and the frozen one, and the line does not wait.',
      'Neither do we. Land ahead of the camp, not behind it. Behind us the ground is already cooling.',
      'The Pace-Keeper will want you. She wants anyone who has something that burns.',
    ],
    card: { word: 'CHAPTER 2', note: 'TAKE THE FREIGHTER DOWN FROM THE BAY' },
  },
  ice: {
    from: '1420 MHZ — NO CALLSIGN',
    speaker: { name: 'Under the ice', species: 'the hydrogen line', cityId: 'The Orphan' },
    face: { kind: 'wave', col: 0x7fd8ff },
    lines: [
      'NOT A HAIL. NOTHING DOWN THERE KNOWS THERE IS A SHIP UP HERE TO HAIL.',
      'THE LIGHT SHIP HAS CAUGHT IT ANYWAY: TONES ON THE HYDROGEN LINE, COMING UP THROUGH FOUR KILOMETRES OF ICE.',
      'THEY RISE, AND STOP, AND ARE ANSWERED. SOMEONE IS TALKING TO SOMEONE.',
      'THERE IS A BORE ON THE SURFACE, MELTED THROUGH. IT IS THE ONLY WAY DOWN.',
    ],
    card: { word: 'CHAPTER 3', note: 'TAKE THE FREIGHTER DOWN FROM THE BAY' },
  },
  concourse: {
    from: `${HUB} TRAFFIC`,
    speaker: { name: 'Port Traffic', species: 'port authority', cityId: `The ${N.hub}` },
    face: { kind: 'rig', seed: 0x7aff1c, city: 'concourse', col: 0xffc46a },
    lines: [
      `UNKNOWN VESSEL, THIS IS ${HUB} TRAFFIC. YOU ARE INSIDE OUR APPROACH, AND YOU ARE BIGGER THAN OUR BIGGEST BERTH.`,
      'HOLD STATION WHERE YOU ARE. NOTHING OUT HERE HAS TO PUSH TO STAY PUT. NEITHER WILL YOU.',
      'IF YOU HAVE ANYTHING SMALLER ABOARD, SEND IT IN. WE WILL FIND IT A BERTH.',
      'WELCOME TO THE FREE PORT. EVERYTHING HERE IS FOR SALE, THIS ADVICE INCLUDED. THE FIRST PIECE IS FREE.',
    ],
    card: { word: 'CHAPTER 4', note: 'TAKE THE FREIGHTER IN FROM THE BAY' },
  },
  futures: {
    from: 'THE ORRERY',
    speaker: { name: 'Keeper of Hours Amity Voss', species: `registrar for the ${N.rival}`, cityId: 'The Orrery' },
    face: { kind: 'rig', seed: 0x4e33, city: 'futures', col: 0xffe6a8 },
    lines: [
      'Light ship. You are on the board. You were on it before you set your course.',
      'Your freighter lands at the eleventh hour. There is no need to hurry. You will not be late.',
      'Nobody here will be surprised to see you. Please do not take it personally.',
    ],
    card: { word: 'CHAPTER 6', note: 'TAKE THE FREIGHTER DOWN FROM THE BAY' },
  },
  choir: {
    from: 'THE CHOIR HALL',
    speaker: { name: 'First Voice Anselm Corr', species: 'eldest of the Choir', cityId: 'The Choir Hall' },
    face: { kind: 'rig', seed: 0xe1de5, city: 'choir', col: 0xc8d8ff },
    lines: [
      'Ship of the light. We heard you come in. Everything that comes near the star is heard, here.',
      'Forgive the bells. They are not keeping the hour well. Nothing has, these forty days.',
      'Come down to the hall. A bell will toll you in. If it falters, follow it anyway.',
    ],
    card: { word: 'CHAPTER 7', note: 'TAKE THE FREIGHTER DOWN FROM THE BAY' },
  },
  swarm: {
    from: 'THE HIGH YARD — AUTOMATED',
    speaker: { name: 'Yard beacon', species: 'no operator', cityId: 'The High Yard' },
    face: { kind: 'glyph', col: 0xffa35a },
    lines: [
      'YARD BEACON. NO OPERATOR.',
      'ALL HANDS ARE ON SHIFT. KEEP CLEAR OF THE MIRROR LANES. A MIRROR ON ITS ORBIT DOES NOT STOP FOR ANYONE.',
      'VISITING CRAFT: ONE PAD IS KEPT FOR INSPECTION. INSPECTION IS OVERDUE.',
      'THIS MESSAGE HAS NOT CHANGED SINCE IT WAS WRITTEN.',
    ],
    card: { word: 'CHAPTER 8', note: 'TAKE THE FREIGHTER DOWN FROM THE BAY' },
  },
};

// The lifepod. Its beacon is heard on the bridge, once, a few seconds after
// the pilot walks onto it (once the voyage is under way); the light ship takes
// the pod in, and its one passenger is on the first bed of the medical bay,
// cooled almost to death on purpose. The pilot warms her and starts her heart.
//
// The medicine is real, simplified: in accidental hypothermia a heart below
// about 30 °C does not respond to a shock, rewarming too fast can send cold
// blood back to the core and drop its temperature (afterdrop), and "nobody is
// dead until they are warm and dead".
export const POD = {
  from: 'DISTRESS BEACON — AUTOMATED',
  speaker: { name: 'A lifepod', species: 'automated', cityId: 'adrift' },
  face: { kind: 'beacon', col: 0xff5a5a },
  lines: [
    'THIS POD CARRIES ONE. ITS SHIP IS LOST.',
    'OCCUPANT COOLED TO NINETEEN DEGREES TO MAKE THE AIR LAST. NO PULSE. THIS IS INTENDED.',
    'WHOEVER HEARS THIS: WARM THEM SLOWLY. A HEART THIS COLD WILL NOT TAKE A SHOCK UNTIL IT IS BACK TO THIRTY.',
    'THE BEACON WILL REPEAT UNTIL THE POD IS COLLECTED.',
  ],
  taken: 'THE LIGHT SHIP HAS TAKEN THE POD IN. ITS PASSENGER IS IN THE MEDICAL BAY',
  card: { title: 'ADRIFT', word: 'A LIFEPOD IS ABOARD', note: 'THE MEDICAL BAY IS ON THE CREW DECK: THE STARBOARD DOOR, AFT' },

  patient: { name: 'Courier Teodora Vell', species: `seconds-runner for the ${N.hub}`, cityId: 'The medical bay' },
  // the bed
  prompt: 'E — THE PATIENT',
  look: ['She is frosted at the hairline. Her skin is the colour of the ice in the pod.', 'The bed reads nineteen degrees at the core, and no pulse at all.'],
  begin: 'WARM HER?',
  go: 'START REWARMING',
  wait: 'NOT YET',
  // the procedure: chapterHud.panel rows, and what is said along the way
  core: 'CORE   ',
  rate: 'WARMING',
  heart: 'HEART  ',
  none: 'NO PULSE',
  vf: 'FIBRILLATING',
  sinus: 'BEATING',
  slow: 'TOO SLOW',
  good: 'STEADY',
  fast: 'TOO FAST',
  tap: 'E — WARM  (KEEP IT STEADY)',
  shockKey: 'E — SHOCK',
  charging: 'CHARGING…',
  say: {
    start: 'WARM HER A LITTLE AT A TIME. KEEP THE BAR IN THE MIDDLE.',
    afterdrop: 'TOO FAST — COLD BLOOD FROM HER LIMBS HIT THE CORE. IT DROPPED. GENTLER.',
    thirty: 'THIRTY DEGREES. HER HEART IS QUIVERING, NOT BEATING. IT WILL TAKE A SHOCK NOW.',
    shocked: 'A BEAT. ANOTHER. SHE HAS A PULSE.',
  },
  // over the intercom while it is being done, from whoever is aboard (one line)
  intercom: {
    marrow: 'Marrow, on the intercom: I am watching from the bridge. She is still in there. I can see it.',
    lux: 'Lux, on the intercom: I cannot watch this. I am watching this. Go slowly. Please go slowly.',
    vask: 'Vask, on the intercom: Nineteen degrees and no pulse. People have come back from colder. Count it up.',
  },
  // awake
  woke: [
    '…Cold. Still cold. That means it worked.',
    'You are not the dark, are you. You have a face.',
    `Teodora Vell. I run seconds for the ${N.hub}. Down a gravity well, back up again, and sell the difference.`,
    'My ship lost its core between two stars. The pod had air for one, for a week. So I stopped my own clock and let the beacon do the asking.',
    'They tell you on the course that nobody is dead until they are warm and dead. I never thought I would be the lesson.',
    'Thank you. I will be on my feet by the time you next arrive anywhere. Then I will get out of your bed.',
  ],
  after: [
    'Warmer every hour. My hands are mine again.',
    'Wherever you stop next, there will be traffic. I will thumb a ride home from there.',
  ],
  // the next arrival anywhere: she has gone, and left something
  goneSay: 'TEODORA VELL HAS GONE ASHORE WITH THE TRAFFIC. SHE LEFT SOMETHING ON THE PILLOW',
  pillowPrompt: 'E — THE PILLOW',
  pillow: [
    'A courier\'s coin on the pillow: one second, sealed in glass, taken down a gravity well and brought back up.',
    'A note under it, in a cold hand: FOR THE TIME YOU GAVE ME BACK. — T.V.',
  ],
};
