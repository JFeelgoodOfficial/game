// First-flight coaching. The title screen used to list every key in two lines
// of small type and then leave the pilot alone in the dark. This walks a new
// player through the five things that make the game playable, one at a time,
// each shown until it has actually been DONE — not timed, not clicked away.
//
// Progress is a step index in localStorage, so a returning pilot is not
// coached again and one who quit halfway resumes where they stopped. One
// element, text written only when the step changes; the per-frame cost after
// the last step is a single comparison.

import { input } from './input.js';

const KEY = 'nova7.coach';

const CSS = `
#coach {
  position: fixed; left: 50%; bottom: 17%; transform: translateX(-50%);
  z-index: 12; pointer-events: none; opacity: 0; transition: opacity 0.4s;
  display: flex; align-items: center; gap: 14px;
  padding: 10px 22px; border-radius: 4px;
  border: 1px solid rgba(130,247,255,0.45); background: rgba(4,14,20,0.62);
  font-family: 'Courier New', ui-monospace, monospace; font-size: 13px;
  letter-spacing: 0.24em; color: #c8fbff; white-space: nowrap;
  text-shadow: 0 0 8px rgba(130,247,255,0.5);
}
#coach.on { opacity: 1; }
#coach .co-key {
  padding: 3px 10px; border-radius: 3px; color: #ffd0ee;
  border: 1px solid rgba(212,64,143,0.75); background: rgba(212,64,143,0.18);
  text-shadow: 0 0 8px rgba(255,120,200,0.6);
}
#coach .co-count { opacity: 0.5; font-size: 10px; }
@media (max-width: 720px) {
  #coach { font-size: 10px; letter-spacing: 0.14em; padding: 8px 12px; gap: 8px; }
}
`;

const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

// `need` seconds of the condition holding completes a step (0 = on first true).
const STEPS = [
  {
    key: touch ? 'DRAG' : 'MOUSE',
    text: touch ? 'DRAG THE VIEW TO STEER' : 'CLICK THE VIEW, THEN MOVE TO STEER',
    need: 0.6,
    done: (s) => s.turning,
  },
  { key: 'W', text: touch ? 'THRUST — HOLD THE W KEY ON THE DASH' : 'HOLD TO THRUST', need: 1.0, done: () => input.forward },
  { key: touch ? 'WARP' : 'F', text: 'HOLD TO WARP — AIM AT THE PLANET AHEAD', need: 1.5, done: () => input.warp },
  { key: touch ? 'BRAKE' : 'SPACE', text: 'HOLD TO BRAKE', need: 0.5, done: () => input.brake },
  { key: touch ? 'NAV' : 'N', text: 'OPEN THE NAV CHART', need: 0, done: (s) => s.navOpen },
  { key: touch ? 'LAND' : 'G', text: 'FLY LOW AND SLOW OVER A WORLD, THEN LAND', need: 0, done: (s) => s.landed },
];

let el = null;
let keyEl, textEl, countEl;
let step = 0;
let shown = -1;
let held = 0;

export function initCoach() {
  try {
    step = Math.min(Math.max(parseInt(localStorage.getItem(KEY), 10) || 0, 0), STEPS.length);
  } catch {
    step = 0; // no storage: coach this session, then forget
  }
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  el = document.createElement('div');
  el.id = 'coach';
  keyEl = document.createElement('span');
  keyEl.className = 'co-key';
  textEl = document.createElement('span');
  countEl = document.createElement('span');
  countEl.className = 'co-count';
  el.append(keyEl, textEl, countEl);
  document.body.appendChild(el);
}

// Per frame. `s` is a reused state object: { flying, turning, navOpen, landed }.
// `flying` is false on the menu, on foot, paused, or standing in the ship —
// the prompt hides and progress holds.
export function updateCoach(dt, s) {
  if (step >= STEPS.length) return;
  const on = s.flying;
  if (!on) {
    if (shown !== -1) {
      shown = -1;
      el.classList.remove('on');
    }
    return;
  }
  const st = STEPS[step];
  if (shown !== step) {
    shown = step;
    held = 0;
    keyEl.textContent = st.key;
    textEl.textContent = st.text;
    countEl.textContent = `${step + 1}/${STEPS.length}`;
    el.classList.add('on');
  }
  if (st.done(s)) held += dt;
  else if (st.need > 0 && held > 0) held = Math.max(held - dt * 0.5, 0); // tolerate a slip, not a tap
  if (st.done(s) && held >= st.need) {
    step++;
    try {
      localStorage.setItem(KEY, String(step));
    } catch {
      // session-only
    }
    if (step >= STEPS.length) el.classList.remove('on');
  }
}

export function coachState() {
  return { step, total: STEPS.length, visible: !!el && el.classList.contains('on'), text: textEl ? textEl.textContent : '' };
}

// Settings panel: run the coaching again from the top.
export function resetCoach() {
  step = 0;
  shown = -1;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // session-only
  }
}
