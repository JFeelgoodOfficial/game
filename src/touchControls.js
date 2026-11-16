// On-foot touch controls (user mechanic). Flight already has a touch pass — the
// 3D dashboard in cockpit3d.js raycasts fingers directly — but on foot there was
// nothing: movement is keyboard-only and looking needs pointer lock, which a
// phone never grants. This module is the missing half: a movement stick under
// the left thumb, a look stick under the right, and buttons for the keys a
// touch player otherwise cannot reach. Only what applies right now is shown:
// a context button wearing the prompt's verb (TALK, READ, SIT...), BOARD by
// the ship, combat buttons in a warzone; the rest sits behind the ≡ panel
// (VIEW, CAMERA, EQUIPMENT, PAUSE) and the ✦ fan (RELOAD, SWAP, RIDE).
//
// Everything writes into the same `input` object the keyboard writes into, so
// every walker (planet, cottage, freighter interior) gets the sticks for free. The look
// stick injects into input.mouseX/mouseY — the same accumulator mouse-look uses
// — so sensitivity, invert and the fixed-timestep consume all behave identically.
//
// Built only on touch devices; on desktop initTouchControls() returns before it
// touches the DOM and updateTouchControls() is a no-op.

import { input } from './input.js';
import { settings } from './settings.js';
import { C } from './constants.js';
import { walkCombatActive, coinActive, currentBoardable } from './walkLazy.js';
import { promptActions, ACTION_KEYS } from './touchText.js';
import { toggleCameraBar } from './capture.js';
import { toggleVehicleMenu } from './vehicleMenu.js';

// Same sniff the rest of the touch HUD uses (touchText.js).
import { isTouch } from './touchText.js';

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
/* Class-only base, so each button's own #id rule (round JUMP, the coloured
   context button, the big ≡) wins over it. */
.tc-btn {
  position: fixed; pointer-events: auto; touch-action: none;
  display: flex; align-items: center; justify-content: center; text-align: center;
  border-radius: 4px; font-size: 11px; letter-spacing: 0.2em; color: #a9f7ff;
  background: rgba(4,12,20,0.72); border: 1px solid rgba(130,247,255,0.5);
}
.tc-btn.held {
  background: rgba(130,247,255,0.24); color: #eaffff;
  border-color: rgba(130,247,255,0.9);
}
/* Owner's layout pass (Nov 2026): only what you need right now is on screen.
   Always there: the sticks, JUMP, the ≡ menu. Shown when it means something:
   the context button (wears the prompt's verb: TALK, SPEAK TO XAVIER, READ,
   SIT...), BOARD near the ship, the combat FIRE/AIM, and the ✦ fan when it
   has anything in it. VIEW / CAMERA / EQUIPMENT / PAUSE live in the ≡ panel. */
#touchUI .tc-hide { display: none !important; }
#tcJump {
  right: 162px; bottom: 24px; width: 76px; height: 76px; border-radius: 50%;
}
#tcAct {
  right: 162px; bottom: 112px; min-width: 76px; max-width: 240px; height: 50px;
  padding: 0 12px; box-sizing: border-box; white-space: nowrap; overflow: hidden;
  color: #ffd0ee; border-color: rgba(212,64,143,0.8); background: rgba(40,6,24,0.66);
  text-overflow: ellipsis;
}
#tcAct.held { background: rgba(212,64,143,0.4); color: #fff; border-color: #ff7ac0; }
#tcBoard { right: 250px; bottom: 24px; width: 76px; height: 50px; color: #ffe9a8; border-color: rgba(255,215,90,0.7); }
#tcMenu {
  left: 26px; bottom: 170px; width: 48px; height: 44px; font-size: 22px; letter-spacing: 0;
}
/* the ✦ fan: the toggle sits rightmost, its items open out to the left */
#tcFan {
  position: fixed; right: 210px; bottom: 180px; display: flex; flex-direction: row-reverse;
  gap: 8px; pointer-events: none;
}
#tcFan .tc-btn { position: static; height: 44px; }
#tcFanBtn { width: 46px; font-size: 20px; letter-spacing: 0; }
#tcFan.open #tcFanBtn { background: rgba(130,247,255,0.24); color: #eaffff; }
#tcFan .tc-fan-item { display: none; padding: 0 14px; }
#tcFan.open .tc-fan-item.avail { display: flex; }
#touchUI .tc-ship { display: none; }
#touchUI.interior #tcJump, #touchUI.interior #tcBoard { display: none; }
/* stevenlacey (src/coinWalk.js): a side-scroller. No look stick and no view to
   switch; a CLAW and a DASH where the look stick was. */
#touchUI .tc-coin { display: none; }
#touchUI.coin .tc-coin { display: flex; }
#touchUI.coin #tcLook { display: none; }
#tcClaw { right: 24px; bottom: 112px; width: 76px; height: 76px; border-radius: 50%; }
#tcDash { right: 24px; bottom: 24px; width: 76px; height: 76px; border-radius: 50%; }
#touchUI .tc-combat { display: none; }
#touchUI.combat .tc-combat { display: flex; }
#touchUI .tc-fire {
  width: 84px; height: 84px; border-radius: 50%; font-size: 12px;
  color: #ffd9d4; background: rgba(60,8,4,0.55); border-color: rgba(255,90,70,0.75);
}
#touchUI .tc-fire.held { background: rgba(255,70,50,0.45); color: #fff; border-color: #ff6a50; }
#tcFireR { right: 34px; bottom: 166px; }
#tcAim { right: 128px; bottom: 180px; width: 70px; height: 44px; }
#tcAim.on { background: rgba(255,210,63,0.28); border-color: #ffd23f; color: #fff4c8; }
/* the ≡ panel: everything that isn't an action, with a line saying what it
   does. The game keeps running behind it (PAUSE is one of its rows). */
#tcPanel {
  position: fixed; inset: 0; z-index: 30; display: none; pointer-events: auto;
  align-items: center; justify-content: center; background: rgba(0,4,8,0.45);
  font-family: 'Courier New', ui-monospace, monospace;
}
#tcPanel.open { display: flex; }
#tcPanel .tp-box {
  width: min(560px, 88vw); max-height: 86vh; overflow-y: auto; padding: 14px 16px;
  background: rgba(4,12,20,0.94); border: 1px solid rgba(130,247,255,0.5); border-radius: 6px;
  display: flex; flex-direction: column; gap: 8px; box-sizing: border-box;
}
#tcPanel .tp-rows { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
#tcPanel .tp-title { font-size: 11px; letter-spacing: 0.3em; color: #5da8b3; text-align: center; }
#tcPanel .tp-row {
  display: flex; flex-direction: column; align-items: flex-start; justify-content: center;
  gap: 4px; min-height: 52px; padding: 6px 12px; box-sizing: border-box;
  border: 1px solid rgba(130,247,255,0.35); border-radius: 4px; color: #a9f7ff;
  touch-action: manipulation;
}
#tcPanel .tp-row.held { background: rgba(130,247,255,0.2); }
#tcPanel .tp-row.off { opacity: 0.35; pointer-events: none; }
#tcPanel .tp-name { font-size: 13px; letter-spacing: 0.22em; }
#tcPanel .tp-what { font-size: 10px; letter-spacing: 0.12em; color: #5da8b3; }
#tcPanel .tp-close { min-height: 38px; align-items: center; color: #5da8b3; letter-spacing: 0.3em; font-size: 11px; }
/* The corner EQUIPMENT (vehicleMenu.js) and CAMERA (capture.js) buttons are
   desktop furniture; on touch both are rows in the ≡ panel. */
body.touch-ui #equipBtn, body.touch-ui #capBtn { display: none !important; }
/* Phones in landscape are short (~270px of game under the browser bar), so
   everything packs into the band below the top HUD. */
@media (max-height: 480px) {
  #touchUI .tc-stick { width: 112px; height: 112px; }
  #touchUI .tc-knob { width: 46px; height: 46px; margin: -23px 0 0 -23px; }
  #tcJump { right: 144px; bottom: 18px; width: 66px; height: 66px; }
  #tcAct { right: 144px; bottom: 94px; min-width: 66px; height: 44px; }
  #tcBoard { right: 220px; bottom: 18px; width: 66px; height: 44px; }
  #tcMenu { left: 26px; bottom: 146px; width: 44px; height: 40px; }
  #tcFireR { right: 26px; bottom: 142px; width: 74px; height: 74px; }
  #tcAim { right: 112px; bottom: 150px; width: 62px; height: 40px; }
  #tcFan { right: 186px; bottom: 150px; }
  #tcFan .tc-btn { height: 40px; }
  #tcFanBtn { width: 44px; }
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
let shipOn = false;
let combatOn = false;
let coinOn = false;
let aimBtn = null;
let actEl = null, boardEl = null, menuEl = null, fanEl = null, panelEl = null;
let fanItems = null; // { reload, swap, ride }
let actKey = null; // key of the prompt clause the context button presses
let actLabel = '';
let fanOpen = false;
let fanIdle = 0; // seconds since the last fan tap; it folds itself away
const FAN_LINGER = 4;
let panelRows = null; // { view, pics, equip }

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

// Each prompt key the context button can stand in for, as the input flag
// the keyboard key would have set (input.js).
function pressKey(key) {
  switch (key) {
    case 'E': input.interact = true; break;
    case 'G': input.toggleWalk = true; break;
    case 'C': input.toggleInterior = true; break;
    case 'R': input.reload = true; break;
    case 'B': input.toggleBoard = true; break;
  }
}

function setFan(open) {
  fanOpen = open;
  fanIdle = 0;
  fanEl.classList.toggle('open', open);
}

function panelRow(name, what, onTap) {
  const el = document.createElement('div');
  el.className = 'tp-row';
  const n = document.createElement('span');
  n.className = 'tp-name';
  n.textContent = name;
  const w = document.createElement('span');
  w.className = 'tp-what';
  w.textContent = what;
  el.append(n, w);
  bindButton(el, () => {}, () => {
    closePanel();
    onTap();
  });
  return el;
}

function openPanel() {
  setFan(false);
  // availability is read when the panel opens: VIEW means nothing in the
  // freighter or on the flat coin world; EQUIPMENT only once you own gear
  // (vehicleMenu.js shows its own corner button exactly then).
  panelRows.view.classList.toggle('off', shipOn || coinOn);
  const eq = document.getElementById('equipBtn');
  panelRows.equip.classList.toggle('off', !eq || !eq.classList.contains('on'));
  panelEl.classList.add('open');
}
function closePanel() {
  if (panelEl) panelEl.classList.remove('open');
}

export function initTouchControls() {
  if (!isTouch) return;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  document.body.classList.add('touch-ui');

  root = document.createElement('div');
  root.id = 'touchUI';
  root.setAttribute('data-nocapture', ''); // keep the sticks out of photos

  const moveEl = stick('tcMove', 'MOVE');
  const lookEl = stick('tcLook', 'LOOK');
  root.appendChild(moveEl);
  root.appendChild(lookEl);

  const jump = button('tcJump', 'JUMP');
  actEl = button('tcAct', '');
  actEl.classList.add('tc-hide');
  boardEl = button('tcBoard', 'BOARD');
  boardEl.classList.add('tc-hide');
  menuEl = button('tcMenu', '≡');
  root.append(jump, actEl, boardEl, menuEl);

  const claw = button('tcClaw', 'CLAW');
  const dash = button('tcDash', 'DASH');
  claw.classList.add('tc-coin');
  dash.classList.add('tc-coin');
  root.append(claw, dash);
  const fireR = button('tcFireR', 'FIRE');
  const aim = button('tcAim', 'AIM');
  for (const b of [fireR, aim]) {
    b.classList.add('tc-combat');
    root.appendChild(b);
  }
  fireR.classList.add('tc-fire');
  aimBtn = aim;

  // ✦ fan: the action items that aren't worth a permanent button.
  fanEl = document.createElement('div');
  fanEl.id = 'tcFan';
  fanEl.className = 'tc-hide';
  const fanBtn = button('tcFanBtn', '✦');
  fanItems = {
    reload: button('tcReload', 'RELOAD'),
    swap: button('tcSwap', 'SWAP'),
    ride: button('tcRide', 'RIDE'),
  };
  fanEl.appendChild(fanBtn);
  for (const k of ['reload', 'swap', 'ride']) {
    fanItems[k].classList.add('tc-fan-item');
    fanEl.appendChild(fanItems[k]);
  }
  root.appendChild(fanEl);

  document.body.appendChild(root);

  // ≡ panel: the non-action controls, each with what it does.
  panelEl = document.createElement('div');
  panelEl.id = 'tcPanel';
  panelEl.setAttribute('data-nocapture', '');
  const box = document.createElement('div');
  box.className = 'tp-box';
  const title = document.createElement('div');
  title.className = 'tp-title';
  title.textContent = 'MENU';
  panelRows = {
    view: panelRow('VIEW', 'SWITCH FIRST / THIRD PERSON', () => { input.toggleView = true; }),
    pics: panelRow('CAMERA', 'TAKE PHOTOS, RECORD VIDEO, SEE YOUR GALLERY', () => toggleCameraBar()),
    equip: panelRow('EQUIPMENT', 'CHOOSE A VEHICLE OR YOUR SNOWBOARD', () => toggleVehicleMenu()),
  };
  const pause = panelRow('PAUSE', 'FREEZE THE GAME', () => { input.togglePause = true; });
  const close = document.createElement('div');
  close.className = 'tp-row tp-close';
  close.textContent = 'CLOSE';
  bindButton(close, () => {}, closePanel);
  const rows = document.createElement('div');
  rows.className = 'tp-rows';
  rows.append(panelRows.view, panelRows.pics, panelRows.equip, pause);
  box.append(title, rows, close);
  panelEl.appendChild(box);
  // a tap on the dim backdrop closes it too
  panelEl.addEventListener('touchstart', (e) => {
    if (e.target === panelEl) {
      closePanel();
      e.preventDefault();
    }
  }, { passive: false });
  document.body.appendChild(panelEl);

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
  bindButton(actEl, () => {
    if (actKey) pressKey(actKey);
  });
  bindButton(boardEl, () => {
    input.toggleWalk = true;
  });
  bindButton(menuEl, () => {}, openPanel);
  bindButton(fanBtn, () => setFan(!fanOpen));
  bindButton(fanItems.reload, () => {
    fanIdle = 0;
    input.reload = true;
  });
  bindButton(fanItems.swap, () => {
    fanIdle = 0;
    input.weaponCycle = 1;
  });
  bindButton(fanItems.ride, () => {
    input.toggleBoard = true;
    setFan(false);
  });
  // FIRE, and CLAW on stevenlacey (the walker reads the same flag); DASH is
  // its own edge, because the stick's run threshold already owns `sprint`.
  let firing = 0;
  const fireDown = () => { firing++; input.fireTouch = true; };
  const fireUp = () => { firing = Math.max(0, firing - 1); input.fireTouch = firing > 0; };
  bindButton(fireR, fireDown, fireUp);
  bindButton(claw, fireDown, fireUp);
  bindButton(dash, () => {
    input.coinDash = true;
  });
  bindButton(aim, () => {
    input.adsTouch = !input.adsTouch;
    aim.classList.toggle('on', input.adsTouch);
  });
}

// The context button and BOARD follow the prompt line game.js wrote last
// frame. Text is only touched when it changes.
function updateContext(ctx) {
  let key = null, label = '';
  for (const a of promptActions(ctx.prompt)) {
    if (ACTION_KEYS.has(a.key)) {
      key = a.key;
      label = a.verb;
      break;
    }
  }
  if (label !== actLabel) {
    actLabel = label;
    actEl.textContent = label;
    actEl.classList.toggle('tc-hide', !label);
  }
  actKey = key;
  // BOARD near the ship, unless the context button already says it
  boardEl.classList.toggle('tc-hide', !(ctx.nearShip && key !== 'G') || shipOn);
}

function updateFan(dt) {
  const ride = !shipOn && !coinOn && (currentBoardable() || !!document.querySelector('#equipBtn.on'));
  fanItems.reload.classList.toggle('avail', combatOn);
  fanItems.swap.classList.toggle('avail', combatOn);
  fanItems.ride.classList.toggle('avail', ride);
  const any = combatOn || ride;
  fanEl.classList.toggle('tc-hide', !any);
  if (!any && fanOpen) setFan(false);
  if (fanOpen) {
    fanIdle += dt;
    if (fanIdle > FAN_LINGER) setFan(false);
  }
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
  input.fireTouch = false;
  input.adsTouch = false;
  if (aimBtn) aimBtn.classList.remove('on');
}

// Called every frame from game.js, before the walk physics step, so the look
// travel this injects is consumed by the same stepWalk tick that mouse deltas
// would have fed.
// `standing` is the freighter-interior walk (C out of the pilot seat): same
// sticks, and the context button carries SIT / READ / VIEW.
// `ctx` is { prompt, nearShip }: last frame's raw prompt line ("E — TALK")
// and whether BOARD would work here.
export function updateTouchControls(dt, phase, paused, standing = false, ctx = null) {
  if (!root) return;

  const on = (phase === 'walk' || (phase === 'fly' && standing)) && !paused;
  const inShip = on && phase === 'fly';
  if (inShip !== shipOn) {
    shipOn = inShip;
    root.classList.toggle('interior', inShip);
  }
  if (on !== uiOn) {
    uiOn = on;
    root.classList.toggle('on', on);
    if (!on) {
      clearHeld();
      closePanel();
      setFan(false);
    }
  }
  if (!on) return;

  const coin = !inShip && coinActive();
  if (coin !== coinOn) {
    coinOn = coin;
    root.classList.toggle('coin', coin);
  }
  const combat = !inShip && walkCombatActive();
  if (combat !== combatOn) {
    combatOn = combat;
    root.classList.toggle('combat', combat);
    if (!combat) {
      input.fireTouch = false;
      input.adsTouch = false;
      if (aimBtn) aimBtn.classList.remove('on');
    }
  }
  if (ctx) updateContext(ctx);
  updateFan(dt);

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
