// actuality-dialogue.js
//
// All authored text for the bespoke world `actuality` (world/actuality.js),
// adapted from "The Discourses of the Actuality" — the second half of
// *Comfort Zone* by J. Feelgood & Angelika Kollin (Chapters 1-10, pp.75-141).
//
// This is a plain data module: exported constants only, zero logic and no
// three.js. actuality.js assembles these into DialoguePayloads (the shared
// interaction contract in world/interaction.js). Kept out of CULTURES because
// every line here is hand-authored to a specific scene rather than procedural.
//
// Lines are kept short (the dialogue panel is ~620px wide). Multi-speaker
// scenes prefix each line with the speaker in caps ("ANDREI — ...").

/* --------------------------------------------------------------------------
 * SHE — the woman in the café (hub oracle). Delivers the ten-digit cipher.
 * ------------------------------------------------------------------------ */
export const SHE = { name: 'She', species: 'the actuality', cityId: null };

// First meeting (before `metCafeWoman`).
export const SHE_INTRO = [
  'You’re walking, one day, in a place you’ve never been. It may be a dream, it may be real life. It may be both.',
  'Sit with me. There is a language underneath all of it — ten characters that express the whole experience.',
  'Everything that could ever be already exists, each in its own cross-section of space and time. We only move between them.',
  'Nine of these characters are places you can walk into. Go and stand inside each one. Then come back to me for the tenth.',
];

// Idle greeting once she’s known but the cipher isn’t complete. The module
// appends the choice menu (SHE_MENU_PROMPT + digit options) after this line.
export const SHE_GREETING = [
  'Back again. Good. Ask me a number, and I’ll tell you what it holds.',
];

export const SHE_MENU_PROMPT = 'WHICH DIGIT?';

// Menu option labels, index 0 → digit 1 … index 8 → digit 9. Digit 0 is
// withheld until every zone is visited (dialogue.js maps keys 1–9 only).
export const SHE_MENU_OPTIONS = [
  '1 — Mind',
  '2 — Body',
  '3 — Soul',
  '4 — Self',
  '5 — Order',
  '6 — Life',
  '7 — Time',
  '8 — Eternity',
  '9 — Death / Rebirth',
];

// Teaching for each digit 1..9 (index by digit-1). The cipher lines are
// quoted from p.138; the second line is drawn from that digit’s chapter.
export const SHE_DIGITS = {
  1: [
    'One is the mind — the computer, the process.',
    'Thoughts invoke the imagination; the mind becomes rampant with anything we want to be. Follow the bird and see.',
  ],
  2: [
    'Two is the body — the construct, the assembly.',
    'It is the silent spoken language of souls that surrender to a moment, until the ceiling and the walls shoot off into extruding directions.',
  ],
  3: [
    'Three is the soul — the operator.',
    'Two friends over coffee, honest about the small and the shameful. That honesty is how realities reach consensus.',
  ],
  4: [
    'Four is one, two, and three as a single current self — the self that spans the hyper-holo-grid.',
    'The love of his life and his case study, at war in the same heart. The universe experiencing itself through him.',
  ],
  5: [
    'Five is order — the contiguous flow of the spiral of everything.',
    'The only order is the spiral. From where we stand it never looks contiguous, so we call the rest of it chaos.',
  ],
  6: [
    'Six is life — existence, perceived value.',
    'On the mountain you long for death and find it before you; go down into the dark water, and light breaks through to birth the self again.',
  ],
  7: [
    'Seven is time — the phases.',
    'There is no motion in time. No slowing, no speeding up. Everything that could ever be already exists in its own moment.',
  ],
  8: [
    'Eight is eternity — infinity, the eternal spiral itself.',
    'There has never been an off. Only the on, and a new on inside it, on and on. Even the fire burning down opens onto an open field.',
  ],
  9: [
    'Nine is death — the end of phases, and rebirth.',
    'Fall deep enough into yourself and a granite dragon waits with a black box on its chest. Surrender, and receive what it holds.',
  ],
};

// Closing "tea" line, appended to the end of a teaching so each visit lands
// gently. The module picks one by digit so repeats vary a little.
export const SHE_TEA = [
  'Join me for a tea, when you’re ready.',
  'The wind is gentle. Sit a moment longer.',
  'Go and stand inside it. Then we’ll talk again.',
];

// Final dialogue, unlocked only after all nine zones are visited. Ends on the
// book’s closing exchange (p.141) and, in-world, opens the mirror room door.
export const SHE_FINAL = [
  'You’ve walked all nine. Then here is the tenth character: zero. Repeat program.',
  'Unless you’re deaf to the voice, you never live the same life twice — but loop you will, always, forward along the spiral.',
  'Behind the café a door has opened. Every current self, stacked above and below your own, going on forever — a hyper-holo-grid. Go and see yourself in it.',
  'The wind is gentle with her hair as she looks off at nothing and everything, forever.',
  '“Join me for a tea?”',
];

// Spoken once the mirror room has been seen (SHE_FINAL already delivered).
export const SHE_AFTER = [
  '“Oh yes,” I said. “I’d like that very much.”',
];

/* --------------------------------------------------------------------------
 * ZONE 3 — Andrei & Mikey (Ch.3, consensus of honesty).
 * ------------------------------------------------------------------------ */
export const ANDREI_MIKEY = { name: 'Andrei & Mikey', species: 'a coffee shop', cityId: null };

export const ANDREI_MIKEY_SCENE = [
  'ANDREI — It’s all crazy right now. I really want a change, something different. Picking up the pieces of the mess I made.',
  'MIKEY — Fresh starts are always good. Sounds like you could use one.',
  'ANDREI — How’s it going with that girl?',
  'MIKEY — Great, man. She’s cautious still, but I’m patient. I went out with the guys the other night — strip club. Kind of over that scene.',
  'MIKEY — A girl comes over, wants to make out. The whole time I’m thinking of my girl at home, snuggled up with her daughter, and me here like some jerk.',
  'MIKEY — That’s not me. Not anymore. So I apologized to the stripper and left. Went home and laid in bed thinking about my girl.',
  'ANDREI — She’s in for a real treat when she lets you in. You’re a great guy, Mikey.',
  'MIKEY — If I’m not into them, I devalue her as a person. Kind of like a lie. They don’t deserve that.',
];

export const ANDREI_MIKEY_IDLE = [
  'ANDREI — Life is good, man. The day is beautiful.',
  'MIKEY — Sorry — got a call I have to take. Catch you in a minute.',
];

/* --------------------------------------------------------------------------
 * ZONE 4 — Joshua & Caitlynn (Ch.4, self spanning the grid).
 * ------------------------------------------------------------------------ */
export const JOSHUA_CAITLYNN = { name: 'Joshua & Caitlynn', species: 'the apartment', cityId: null };

export const JOSHUA_CAITLYNN_SCENE = [
  'CAITLYNN — Well, I had plans for us tonight and suddenly you’re just taking off. I wish you’d told me.',
  'JOSHUA — Where is this coming from? You’ve never minded before.',
  'CAITLYNN — I don’t know, Joshua. I don’t know. I just have this feeling. I don’t know what it is.',
  'JOSHUA — (One way she’s the love of my life. The other, my case study. Both at war, constantly.)',
  'CAITLYNN — It’s almost eight. I don’t want you to miss your meeting.',
  'JOSHUA — I know you had something planned. I’m sorry. Professor Aldrich is only in town tonight.',
  'CAITLYNN — Go. I mean it.',
  'JOSHUA — I love you. You know that.',
  'CAITLYNN — I love you too.',
];

export const JOSHUA_CAITLYNN_IDLE = [
  'CAITLYNN — He went to meet Professor Aldrich. He’ll be back.',
  'CAITLYNN — He always takes a moment, no matter how busy, to show he cares. It’s the little things.',
];

/* --------------------------------------------------------------------------
 * ZONE 1 — the woman in the light (Ch.1, mind).
 * ------------------------------------------------------------------------ */
export const Z1_WOMAN = { name: 'She', species: 'the forest', cityId: null };

export const Z1_WOMAN_LINES = [
  '“Hi.”',
  'The sun breaks through the leaves and shines on her like an angel. A breeze plays with her hair.',
  'I realize this world is not mine at all.',
];

/* --------------------------------------------------------------------------
 * ZONE 8 — grandmother’s bedside (Ch.8, eternity — quiet side vignette).
 * ------------------------------------------------------------------------ */
export const GRANDMOTHER = { name: 'Grandmother', species: 'a warm little room', cityId: null };

export const GRANDMOTHER_LINES = [
  'Won’t you step back from that ledge, my friend? No one really knows what’s going on here.',
  'To help others is to help yourself. The body is a machine, the mind a computer — and underneath, only the eternal on and on.',
];

/* --------------------------------------------------------------------------
 * ZONE 9 — the dragon & the black box (Ch.9, death/rebirth).
 * ------------------------------------------------------------------------ */
export const DRAGON = { name: 'The Dragon', species: 'granite, and a black box', cityId: null };

export const DRAGON_BEFORE = [
  'A beautiful granite dragon. Tall and majestic, its head high and looking down at you, a black box emboldened on its chest.',
  'Its eyes are empty, timeless, omnipotent — waiting for you to receive the contents of the box.',
  'Something you’d have to truly let go of, and surrender to its will, if you were to receive its gift. Are you afraid?',
];

export const DRAGON_AFTER = [
  'The hard work was the little things — done simply, for someone who’d have had more difficulty without you.',
  'That was how the black box opened.',
];

/* --------------------------------------------------------------------------
 * ZONE 7 — flickering television fragments (Ch.7, time). Displayed one at a
 * time as caption text, not a dialogue payload.
 * ------------------------------------------------------------------------ */
export const Z7_FRAGMENTS = [
  'I won’t remember this.',
  'We are all partly dreaming when we are awake.',
  'There is no motion in time.',
  'The voice is the current subconscious you.',
  'You already know everything that could ever happen.',
  'Unless you’re deaf to the voice…',
  'you are doomed to repeat everything,',
  'over and over and over.',
  'I won’t remember this.',
];
