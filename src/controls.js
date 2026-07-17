// Per-mode control hints (user mechanic). On foot: a compact ON FOOT key
// panel sits bottom-left (the radio's corner — the radio hides on foot).
// In flight: a CTRL button beside NAV opens a popup listing the ship
// controls, including how to change the song. Closes on X (never Escape —
// that would drop pointer lock), on click, or automatically when the phase
// changes. Driven per frame from main.js via updateControls().

import { currentGravityScale } from './walk.js';

const CSS = `
#walkHint {
  position: fixed; left: 16px; bottom: 16px; z-index: 12;
  pointer-events: none; user-select: none;
  padding: 10px 14px; border-radius: 4px;
  font-family: 'Courier New', ui-monospace, monospace; font-size: 11px;
  line-height: 1.75; letter-spacing: 0.18em; color: #9fd8e8;
  background: rgba(4,12,20,0.55); border: 1px solid rgba(130,247,255,0.35);
  box-shadow: 0 0 16px rgba(130,247,255,0.15);
  transition: opacity 0.3s; opacity: 0;
}
#walkHint.on { opacity: 1; }
#walkHint .wh-title {
  color: #82f7ff; letter-spacing: 0.34em; margin-bottom: 2px;
  text-shadow: 0 0 8px rgba(130,247,255,0.6);
}
#walkHint .wh-grav {
  color: #ffd06a; letter-spacing: 0.3em; margin-top: 2px;
  text-shadow: 0 0 8px rgba(255,208,106,0.6);
}
#ctrlBtn {
  position: fixed; right: 152px; bottom: 22px; z-index: 12;
  padding: 11px 24px; cursor: pointer; user-select: none;
  font-family: 'Courier New', ui-monospace, monospace; font-size: 14px;
  letter-spacing: 0.34em; color: #a9f7ff;
  background: rgba(130,247,255,0.06); border: 1px solid rgba(130,247,255,0.5);
  border-radius: 4px; text-shadow: 0 0 8px rgba(130,247,255,0.7);
  box-shadow: 0 0 20px rgba(130,247,255,0.22), inset 0 0 16px rgba(130,247,255,0.06);
  transition: opacity 0.2s, background 0.15s;
}
#ctrlBtn:hover { background: rgba(130,247,255,0.16); }
#ctrlBtn.hidden { opacity: 0 !important; pointer-events: none; }
#ctrlPopup {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  z-index: 20; display: none; flex-direction: column;
  padding: 16px 22px 12px; border-radius: 6px; user-select: none;
  font-family: 'Courier New', ui-monospace, monospace; color: #a9f7ff;
  background: rgba(4,12,20,0.88); border: 1px solid rgba(130,247,255,0.55);
  box-shadow: 0 0 44px rgba(130,247,255,0.3), inset 0 0 30px rgba(130,247,255,0.06);
}
#ctrlPopup.open { display: flex; }
#ctrlPopup .cp-title {
  font-size: 12px; letter-spacing: 0.42em; color: #7ad7e0;
  margin-bottom: 10px; text-align: center;
  text-shadow: 0 0 8px rgba(130,247,255,0.6);
}
#ctrlPopup .cp-row {
  font-size: 12px; line-height: 2.0; letter-spacing: 0.14em;
  display: flex; gap: 14px;
}
#ctrlPopup .cp-key { color: #82f7ff; min-width: 168px; }
#ctrlPopup .cp-what { color: #9fd8e8; }
#ctrlPopup .cp-foot {
  font-size: 10px; letter-spacing: 0.26em; color: #5da8b3;
  margin-top: 10px; text-align: center;
}
`;

const SHIP_CONTROLS = [
  ['W / S', 'THRUST / REVERSE'],
  ['MOUSE', 'STEER'],
  ['Q / E', 'ROLL'],
  ['SHIFT', 'BOOST'],
  ['SPACE', 'BRAKE'],
  ['F / J (HOLD)', 'WARP — OR HOLD THE WARP BUTTON'],
  ['V (HOLD)', 'LOOK UP'],
  ['C', 'STAND UP / SIT BACK DOWN'],
  ['G', 'LAND & STEP OUT (LOW + SLOW OVER A ROCKY WORLD)'],
  ['N', 'NAV MAP'],
  ['P / R', 'PHOTO / RECORD — REVIEW IN THE PICS GALLERY'],
  [', / .', 'CHANGE SONG — OR ⏮ ⏭ ON THE RADIO, BOTTOM LEFT'],
];

const WALK_LINES = [
  'W A S D — MOVE · MOUSE — LOOK',
  'SHIFT — RUN · SPACE — JUMP',
  'E — TALK · T — VIEW · SCROLL — ZOOM',
  'G — BOARD (AT YOUR SHIP) · , . — MUSIC',
  'P — PHOTO · R — RECORD (PICS)',
];

let walkHint, gravLine, ctrlBtn, popup;
let popupOpen = false;
let lastWalkOn = null;
let lastBtnShown = null;

function setPopup(open) {
  if (open === popupOpen) return;
  popupOpen = open;
  popup.classList.toggle('open', open);
  if (open) document.addEventListener('keydown', onPopupKey);
  else document.removeEventListener('keydown', onPopupKey);
}

function onPopupKey(e) {
  if (e.code === 'KeyX') setPopup(false);
}

export function initControls() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  walkHint = document.createElement('div');
  walkHint.id = 'walkHint';
  const title = document.createElement('div');
  title.className = 'wh-title';
  title.textContent = 'ON FOOT';
  walkHint.appendChild(title);
  for (const line of WALK_LINES) {
    const el = document.createElement('div');
    el.textContent = line;
    walkHint.appendChild(el);
  }
  gravLine = document.createElement('div');
  gravLine.className = 'wh-grav';
  gravLine.textContent = 'LOW GRAVITY';
  gravLine.style.display = 'none';
  walkHint.appendChild(gravLine);
  document.body.appendChild(walkHint);

  ctrlBtn = document.createElement('div');
  ctrlBtn.id = 'ctrlBtn';
  ctrlBtn.classList.add('hidden');
  ctrlBtn.textContent = 'CTRL';
  ctrlBtn.addEventListener('click', () => setPopup(!popupOpen));
  document.body.appendChild(ctrlBtn);

  popup = document.createElement('div');
  popup.id = 'ctrlPopup';
  const pTitle = document.createElement('div');
  pTitle.className = 'cp-title';
  pTitle.textContent = 'SHIP CONTROLS';
  popup.appendChild(pTitle);
  for (const [key, what] of SHIP_CONTROLS) {
    const row = document.createElement('div');
    row.className = 'cp-row';
    const k = document.createElement('div');
    k.className = 'cp-key';
    k.textContent = key;
    const w = document.createElement('div');
    w.className = 'cp-what';
    w.textContent = what;
    row.appendChild(k);
    row.appendChild(w);
    popup.appendChild(row);
  }
  const foot = document.createElement('div');
  foot.className = 'cp-foot';
  foot.textContent = 'X — CLOSE';
  popup.appendChild(foot);
  document.body.appendChild(popup);
}

export function updateControls(phase, frameBlend) {
  // walk hint: on-foot only
  const walkOn = phase === 'walk';
  if (walkOn !== lastWalkOn) {
    walkHint.classList.toggle('on', walkOn);
    lastWalkOn = walkOn;
    if (walkOn) {
      gravLine.style.display = currentGravityScale() < 0.7 ? '' : 'none';
    }
  }

  // CTRL button: rides the dashboard fade exactly like NAV
  const btnShown = phase === 'fly' && frameBlend > 0.15;
  if (btnShown !== lastBtnShown) {
    ctrlBtn.classList.toggle('hidden', !btnShown);
    lastBtnShown = btnShown;
  }
  if (btnShown) ctrlBtn.style.opacity = Math.min(frameBlend * 1.4, 1).toFixed(3);

  // the popup never survives leaving the cockpit
  if (popupOpen && phase !== 'fly') setPopup(false);
}
