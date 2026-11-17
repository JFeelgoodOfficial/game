// Touch wording (user mechanic). The HUD speaks keyboard: prompts are written
// "E — TALK", "G — STEP OUT · W — LIFT OFF", toasts "T — TOGGLE VIEW". On a
// phone those letters mean nothing, so every prompt and toast passes through
// here on its way to the screen and the key half is rewritten:
//
//  - on foot (and standing in the freighter) the key is dropped and only the
//    verb is left. The context button in touchControls.js wears that verb, so
//    the text and the button say the same thing.
//  - in the pilot seat the key becomes the dash button that does the job
//    ("LAND — STEP OUT · THRUST — LIFT OFF"), or just the verb when the button
//    already has that name ("G — LAND" -> "LAND").
//
// Lines that are keyboard instructions top to bottom have hand-written touch
// versions in TOUCH_LINES. Desktop never takes either path.

export const isTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window ||
    (!!window.matchMedia && window.matchMedia('(pointer: coarse)').matches));

// The flight dash (cockpit3d.js), key -> button name.
const DASH = {
  W: 'THROTTLE UP',
  S: 'THROTTLE DOWN',
  F: 'WARP',
  G: 'LAND',
  C: 'STAND',
  N: 'NAV',
};

// Whole lines with no sensible key-for-button swap.
const TOUCH_LINES = {
  'COMBAT ZONE — LMB FIRE · RMB AIM · R RELOAD': 'COMBAT ZONE — RELOAD AND SWAP ARE IN THE ✦ FAN',
  'THE LANCE — MOUSE AIMS · CLICK, SPACE OR E FIRES · G STEPS BACK':
    'THE LANCE — LOOK TO AIM · FIRE TO SHOOT · STEP BACK TO LEAVE',
  'THE DASH IS YOURS — SHIFT TO DASH': 'THE DASH IS YOURS — TAP DASH',
  'T — TOGGLE VIEW': 'VIEW — IN THE ≡ MENU',
  'I — VEHICLES': 'EQUIPMENT — IN THE ≡ MENU',
  'B — SNOWBOARD': 'SNOWBOARD — TAP RIDE IN THE ✦ FAN',
};

// One "KEY — VERB" segment. Keys are a single letter (or SPACE / SHIFT);
// anything longer before the dash is a heading ("WAYPOINT — THE MILL").
const SEG = /^([A-Z]|SPACE|SHIFT) — (.+)$/;

// Split on the middle dot the HUD uses between clauses; rewrite each keyed
// clause; leave every other clause (a painting's title, "AUTO-LANDING") alone.
// `seated`: name the dash button. `drop`: remove the clauses the context
// button already shows (on-foot prompts), so text and button don't repeat.
export function touchify(text, { seated = false, drop = false } = {}) {
  if (!isTouch || !text) return text;
  if (TOUCH_LINES[text]) return TOUCH_LINES[text];
  const out = text
    .split(' · ')
    .map((part) => {
      const m = SEG.exec(part);
      if (!m) return part;
      const [, key, verb] = m;
      if (drop && ACTION_KEYS.has(key)) return null;
      if (!seated) return verb;
      const btn = DASH[key];
      if (!btn || btn === verb) return verb;
      return `${btn} — ${verb}`;
    })
    .filter(Boolean)
    .join(' · ');
  return out || null;
}

// Keys the on-foot context button can press (touchControls.js maps each to
// its input flag).
export const ACTION_KEYS = new Set(['E', 'G', 'C', 'R', 'B']);

// The keyed clauses of a prompt, for the on-foot context button:
// [{ key, verb }] in order. "THE TERRARIUM · E — LOOK CLOSER" gives one.
export function promptActions(text) {
  if (!text) return [];
  const out = [];
  for (const part of text.split(' · ')) {
    const m = SEG.exec(part);
    if (m) out.push({ key: m[1], verb: m[2] });
  }
  return out;
}
