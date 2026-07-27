// On-foot touch controls (user mechanic). Flight already has a touch pass — the
// 3D dashboard in cockpit3d.js raycasts fingers directly — but on foot there was
// nothing: movement is keyboard-only and looking needs pointer lock, which a
// phone never grants. This module is the missing half: a movement stick under
// the left thumb, a look stick under the right, and buttons for the four keys a
// touch player otherwise cannot reach (jump, talk, view, board).
//
// Everything writes into the same `input` object the keyboard writes into, so
// all three walkers (planet, station, cottage) get the sticks for free. The look
// stick injects into input.mouseX/mouseY — the same accumulator mouse-look uses
// — so sensitivity, invert and the fixed-timestep consume all behave identically.
//
// Built only on touch devices; on desktop initTouchControls() returns before it
// touches the DOM and updateTouchControls() is a no-op.

import { input } from './input.js';
import { settings } from './settings.js';
import { C } from './constants.js';

// Same sniff cockpit3d.js uses, widened with the media query so a coarse-pointer
// device that reports no ontouchstart still gets the sticks.
const isTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));

const CSS = `
#touchUI {
  position: fixed; inset: 0; z-index: 12; display: none;
  pointer-events: none; user-select: none;
  font-family: 'Courier New', ui-monospace, monospace;
}
#touchUI.on { display: block; }
#touchUI .tc-stick {
  position: fixed; width: 130px; height: 130px; border-radius: 50%;
  pointer-events: auto; touch-action: none;
  background: rgba(4,12,20,0.42); border: 1px solid rgba(130,247,255,0.35);
  box-shadow: 0 0 16px rgba(130,247,255,0.12);
  opacity: 0.72; transition: opacity 0.15s;
}
#touchUI .tc-stick.held { opacity: 1; }
#touchUI .tc-knob {
  position: absolute; left: 50%; top: 50%; width: 54px; height: 54px;
  margin: -27px 0 0 -27px; border-radius: 50%;
  background: rgba(130,247,255,0.18); border: 1px solid rgba(130,247,255,0.7);
  box-shadow: 0 0 12px rgba(130,247,255,0.35);
}
#touchUI .tc-label {
  position: absolute; left: 0; right: 0; bottom: -16px; text-align: center;
  font-size: 9px; letter-spacing: 0.22em; color: #5da8b3;
}
#tcMove { left: 20px; bottom: 20px; }
#tcLook { right: 20px; bottom: 20px; }
#touchUI .tc-btn {
  position: fixed; pointer-events: auto; touch-action: none;
  display: flex; align-items: center; justify-content: center; text-align: center;
  border-radius: 4px; font-size: 11px; letter-spacing: 0.2em; color: #a9f7ff;
  background: rgba(4,12,20,0.72); border: 1px solid rgba(130,247,255,0.5);
}
#touchUI .tc-btn.held {
  background: rgba(130,247,255,0.24); color: #eaffff;
  border-color: rgba(130,247,255,0.9);
}
#tcJump {
  right: 162px; bottom: 24px; width: 76px; height: 76px; border-radius: 50%;
}
#tcTalk { right: 162px; bottom: 112px; width: 76px; height: 50px; }
#tcView { right: 250px; bottom: 24px; width: 76px; height: 50px; }
#tcBoard { right: 250px; bottom: 86px; width: 76px; height: 50px; }
/* The two pre-existing on-foot buttons live where the sticks now go — EQUIPMENT
   (vehicleMenu.js) lands under the look stick on narrow screens, and PICS
   (capture.js) sits right on top of VIEW. Fold them into the same cluster.
   The body prefix out-specifies their own rules regardless of which
   stylesheet is appended last. */
@media (pointer: coarse) {
  body #equipBtn { right: 250px; bottom: 148px; }
  body #capBtn {
    right: 162px; bottom: 174px; padding: 10px 16px;
    font-size: 12px; letter-spacing: 0.2em;
  }
}
/* Phones in landscape are short: tuck everything in so the cluster still fits
   above the browser chrome. */
@media (max-height: 480px) {
  #touchUI .tc-stick { width: 112px; height: 112px; }
  #touchUI .tc-knob { width: 46px; height: 46px; margin: -23px 0 0 -23px; }
  #tcJump { right: 144px; bottom: 18px; width: 66px; height: 66px; }
  #tcTalk { right: 144px; bottom: 94px; width: 66px; height: 44px; }
  #tcView { right: 220px; bottom: 18px; width: 66px; height: 44px; }
  #tcBoard { right: 220px; bottom: 72px; width: 66px; height: 44px; }
}
@media (pointer: coarse) and (max-height: 480px) {
  body #equipBtn { right: 220px; bottom: 126px; padding: 8px 10px; }
  body #capBtn { right: 144px; bottom: 148px; padding: 8px 12px; font-size: 11px; }
}
`;

// A stick tracks the finger that grabbed it plus where it landed: the grab point
// is the origin, not the ring's center, so the stick works wherever the thumb
// falls. `x/y` is the current position; the offset between them is the axis.
function makeStick() {
  return { id: null, ox: 0, oy: 0, x: 0, y: 0, el: null, knob: null };
}
const move = makeStick();
const look = makeStick();

let root = null;
// Touch-held state for the two flags shared with the keyboard. We only write
// input.sprint / input.brake when OUR state changes, so a held Shift or Space
// on a hybrid device isn't stamped false every frame.
let tcSprint = false;
let tcJump = false;
let uiOn = false;

function axis(stick) {
  const dx = stick.x - stick.ox;
  const dy = stick.y - stick.oy;
  const span = C.TOUCH_STICK_SPAN;
  let mag = Math.hypot(dx, dy) / span;
  if (mag < C.TOUCH_STICK_DEADZONE) return { x: 0, y: 0, mag: 0 };
  if (mag > 1) mag = 1;
  const len = Math.hypot(dx, dy) || 1;
  return { x: (dx / len) * mag, y: (dy / len) * mag, mag };
}

function drawKnob(stick) {
  if (!stick.knob) return;
  if (stick.id === null) {
    stick.knob.style.transform = '';
    return;
  }
  const a = axis(stick);
  const span = C.TOUCH_STICK_SPAN;
  stick.knob.style.transform = `translate(${a.x * span}px, ${a.y * span}px)`;
}

function bindStick(stick, el) {
  stick.el = el;
  stick.knob = el.querySelector('.tc-knob');
  el.addEventListener(
    'touchstart',
    (e) => {
      if (stick.id !== null) return;
      const t = e.changedTouches[0];
      stick.id = t.identifier;
      stick.ox = stick.x = t.clientX;
      stick.oy = stick.y = t.clientY;
      el.classList.add('held');
      drawKnob(stick);
      e.preventDefault();
    },
    { passive: false },
  );
  // move/end land on window: a thumb that slides off the ring should keep
  // steering, and touchend fires wherever the finger happens to be.
  window.addEventListener(
    'touchmove',
    (e) => {
      if (stick.id === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== stick.id) continue;
        stick.x = t.clientX;
        stick.y = t.clientY;
        drawKnob(stick);
        e.preventDefault();
      }
    },
    { passive: false },
  );
  const release = (e) => {
    if (stick.id === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== stick.id) continue;
      stick.id = null;
      el.classList.remove('held');
      drawKnob(stick);
    }
  };
  window.addEventListener('touchend', release);
  window.addEventListener('touchcancel', release);
}

// `hold` buttons mirror a key you can keep down (jump); the rest are the same
// edge triggers the keyboard sets, consumed and zeroed by game.js each frame.
function bindButton(el, onDown, onUp) {
  el.addEventListener(
    'touchstart',
    (e) => {
      el.classList.add('held');
      onDown();
      e.preventDefault();
    },
    { passive: false },
  );
  const up = () => {
    if (!el.classList.contains('held')) return;
    el.classList.remove('held');
    if (onUp) onUp();
  };
  el.addEventListener('touchend', up);
  el.addEventListener('touchcancel', up);
}

function stick(id, label) {
  const el = document.createElement('div');
  el.id = id;
  el.className = 'tc-stick';
  const knob = document.createElement('div');
  knob.className = 'tc-knob';
  el.appendChild(knob);
  const cap = document.createElement('div');
  cap.className = 'tc-label';
  cap.textContent = label;
  el.appendChild(cap);
  return el;
}

function button(id, label) {
  const el = document.createElement('div');
  el.id = id;
  el.className = 'tc-btn';
  el.textContent = label;
  return el;
}

export function initTouchControls() {
  if (!isTouch) return;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  root = document.createElement('div');
  root.id = 'touchUI';

  const moveEl = stick('tcMove', 'MOVE');
  const lookEl = stick('tcLook', 'LOOK');
  root.appendChild(moveEl);
  root.appendChild(lookEl);

  const jump = button('tcJump', 'JUMP');
  const talk = button('tcTalk', 'TALK');
  const view = button('tcView', 'VIEW');
  const board = button('tcBoard', 'BOARD');
  root.appendChild(jump);
  root.appendChild(talk);
  root.appendChild(view);
  root.appendChild(board);

  document.body.appendChild(root);

  bindStick(move, moveEl);
  bindStick(look, lookEl);
  bindButton(
    jump,
    () => {
      tcJump = true;
      input.brake = true;
    },
    () => {
      tcJump = false;
      input.brake = false;
    },
  );
  bindButton(talk, () => {
    input.interact = true;
  });
  bindButton(view, () => {
    input.toggleView = true;
  });
  bindButton(board, () => {
    input.toggleWalk = true;
  });
}

// Release everything we are holding. Called when the sticks go away (leaving
// walk, or pausing) so a finger down at the transition can't leave a flag stuck.
function clearHeld() {
  input.moveX = 0;
  input.moveY = 0;
  if (tcSprint) {
    tcSprint = false;
    input.sprint = false;
  }
  if (tcJump) {
    tcJump = false;
    input.brake = false;
  }
}

// Called every frame from game.js, before the walk physics step, so the look
// travel this injects is consumed by the same stepWalk tick that mouse deltas
// would have fed.
export function updateTouchControls(dt, phase, paused) {
  if (!root) return;

  const on = phase === 'walk' && !paused;
  if (on !== uiOn) {
    uiOn = on;
    root.classList.toggle('on', on);
    if (!on) clearHeld();
  }
  if (!on) return;

  // --- movement stick: analog axes the walkers read instead of WASD ---
  if (move.id !== null) {
    const a = axis(move);
    input.moveX = a.x;
    input.moveY = -a.y; // screen Y grows downward; pushing up means forward
    const run = a.mag > C.TOUCH_RUN_THRESHOLD;
    if (run !== tcSprint) {
      tcSprint = run;
      input.sprint = run;
    }
  } else if (input.moveX !== 0 || input.moveY !== 0 || tcSprint) {
    input.moveX = 0;
    input.moveY = 0;
    if (tcSprint) {
      tcSprint = false;
      input.sprint = false;
    }
  }

  // --- look stick: a held deflection is a turn RATE, converted to the pixel
  // travel mouse-look would have produced over this frame. Sensitivity and
  // invert are applied here, at the source, exactly as input.js does. ---
  if (look.id !== null) {
    const a = axis(look);
    const rate = C.TOUCH_LOOK_RATE * dt * settings.sensitivity;
    input.mouseX += a.x * rate;
    input.mouseY += a.y * rate * (settings.invertY ? -1 : 1);
  }
}
