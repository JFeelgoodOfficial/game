// Equipment panel (I on foot, or the on-screen EQUIPMENT button) — the
// inventory the governors fill. Follows the radioPopup.js dialog pattern:
// injected CSS, `.open` class, closes on X/I (never Escape — reserved by
// pointer lock) and puts itself away if the pointer locks.
//
// Rows are the four quest vehicles plus the snowboard. Clicking a row SELECTS
// it; B then activates or stows the selection (walk.js). Clicking an
// already-selected row deploys it immediately, so the old one-tap flow still
// works for mouse users.
//
// The story total-conversions and the station refuse deployment inside
// walk.js — the footer explains instead of failing silently.

import { ITEMS, SNOWBOARD, hasItem, selectedItem, setSelectedItem } from './inventory.js';
import { deployVehicle, stowVehicle, vehicleState } from './walkLazy.js';

const CSS = `
#vehiclePanel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  z-index: 24; display: none; flex-direction: column; gap: 12px;
  width: min(400px, 92vw); box-sizing: border-box;
  max-height: min(70vh, 560px);
  padding: 18px 22px 14px; border-radius: 6px;
  font-family: 'Courier New', ui-monospace, monospace; color: #a9f7ff;
  background: rgba(4,12,20,0.92); border: 1px solid rgba(130,247,255,0.55);
  box-shadow: 0 0 44px rgba(130,247,255,0.3), inset 0 0 30px rgba(130,247,255,0.06);
  user-select: none;
}
#vehiclePanel.open { display: flex; }
#vehiclePanel .vp-title {
  font-size: 12px; letter-spacing: 0.42em; color: #7ad7e0; text-align: center;
  text-shadow: 0 0 8px rgba(130,247,255,0.6);
}
#vehiclePanel .vp-list {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 6px; padding: 2px;
  scrollbar-width: thin;
}
#vehiclePanel button {
  font-family: inherit; letter-spacing: 0.14em; cursor: pointer;
  background: rgba(130,247,255,0.06); color: #a9f7ff;
  border: 1px solid rgba(130,247,255,0.5); border-radius: 4px;
  text-shadow: 0 0 8px rgba(130,247,255,0.7);
  transition: background 0.15s;
}
#vehiclePanel button:hover { background: rgba(130,247,255,0.16); }
#vehiclePanel .vp-row {
  text-align: left; padding: 10px 12px; min-height: 48px;
  display: flex; flex-direction: column; gap: 4px;
}
#vehiclePanel .vp-row .vp-name { font-size: 11px; letter-spacing: 0.22em; }
#vehiclePanel .vp-row .vp-hint {
  font-size: 9px; letter-spacing: 0.1em; color: #5da8b3; line-height: 1.5;
}
#vehiclePanel .vp-row.locked {
  opacity: 0.38; cursor: default;
}
#vehiclePanel .vp-row.locked:hover { background: rgba(130,247,255,0.06); }
#vehiclePanel .vp-row.deployed {
  background: rgba(212,64,143,0.28); color: #ffd0ee;
  border-color: rgba(212,64,143,0.8);
}
#vehiclePanel .vp-row.selected {
  background: rgba(125,255,200,0.18); color: #c8ffe8;
  border-color: rgba(125,255,200,0.85);
}
#equipBtn {
  position: fixed; right: 152px; bottom: 22px; z-index: 12; display: none;
  padding: 10px 16px; border-radius: 4px; cursor: pointer;
  font-family: 'Courier New', ui-monospace, monospace;
  font-size: 11px; letter-spacing: 0.22em; color: #a9f7ff;
  background: rgba(4,12,20,0.72); border: 1px solid rgba(130,247,255,0.5);
  touch-action: none; user-select: none;
}
#equipBtn.on { display: block; }
#equipBtn:hover { background: rgba(130,247,255,0.16); }
@media (max-width: 640px) {
  #equipBtn { right: 12px; bottom: 70px; }
}
#vehiclePanel .vp-close { font-size: 13px; letter-spacing: 0.3em; padding: 10px 34px; }
#vehiclePanel .vp-foot {
  font-size: 10px; letter-spacing: 0.22em; color: #5da8b3; text-align: center;
  line-height: 1.7; min-height: 28px;
}
@media (max-width: 640px) {
  #vehiclePanel { width: 92vw; max-height: 78vh; padding: 14px; }
}
@media (pointer: coarse) {
  #vehiclePanel .vp-row { min-height: 52px; }
}
`;

const ORDER = ['motorcycle', 'hangglider', 'jetpack', 'plane'];

// The snowboard rides in the same list so B has one consistent meaning
// ("use my selected gear") rather than two.
const BOARD_ENTRY = {
  name: 'Snowboard',
  hint: 'Carve the snowfields. Boardable worlds only.',
};

let panel, listEl, footEl, equipBtn;
let menuOpen = false;

function activate(id) {
  if (id === SNOWBOARD) {
    closeVehicleMenu();
    return;
  }
  if (vehicleState().vehicle === id) {
    stowVehicle();
    refresh('Stowed.');
  } else if (deployVehicle(id)) {
    closeVehicleMenu();
  } else {
    refresh('Not here — vehicles stay stowed in story places and water.');
  }
}

function refresh(note) {
  const state = vehicleState();
  const sel = selectedItem();
  listEl.textContent = '';
  let owned = 0;
  for (const id of [...ORDER, SNOWBOARD]) {
    const isBoard = id === SNOWBOARD;
    const item = isBoard ? BOARD_ENTRY : ITEMS[id];
    const has = isBoard || hasItem(id);
    if (has && !isBoard) owned++;
    const row = document.createElement('button');
    row.className = 'vp-row' + (has ? '' : ' locked')
      + (state.vehicle === id ? ' deployed' : sel === id ? ' selected' : '');
    const name = document.createElement('div');
    name.className = 'vp-name';
    name.textContent = has
      ? (state.vehicle === id
        ? `${item.name.toUpperCase()} — DEPLOYED`
        : sel === id ? `${item.name.toUpperCase()} — SELECTED` : item.name.toUpperCase())
      : '???';
    row.appendChild(name);
    const hint = document.createElement('div');
    hint.className = 'vp-hint';
    hint.textContent = has ? item.hint : 'A governor still holds this one.';
    row.appendChild(hint);
    if (has) {
      row.addEventListener('click', () => {
        // Second click on the current selection acts on it; the first selects.
        if (selectedItem() === id) activate(id);
        else {
          setSelectedItem(id);
          refresh('SELECTED — PRESS B TO ACTIVATE');
        }
      });
    }
    listEl.appendChild(row);
  }
  footEl.textContent = note
    ?? (owned === 0
      ? 'NO QUEST ITEMS YET — THE GOVERNORS REWARD THEIR TOURS'
      : 'I / X — CLOSE · B — ACTIVATE SELECTED');
}

function onPanelKey(e) {
  if (e.code === 'KeyX' || e.code === 'KeyI') closeVehicleMenu();
}

export function initVehicleMenu() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  panel = document.createElement('div');
  panel.id = 'vehiclePanel';

  const title = document.createElement('div');
  title.className = 'vp-title';
  title.textContent = 'EQUIPMENT';
  panel.appendChild(title);

  listEl = document.createElement('div');
  listEl.className = 'vp-list';
  panel.appendChild(listEl);

  const close = document.createElement('button');
  close.className = 'vp-close';
  close.textContent = 'CLOSE';
  close.addEventListener('click', () => closeVehicleMenu());
  panel.appendChild(close);

  footEl = document.createElement('div');
  footEl.className = 'vp-foot';
  panel.appendChild(footEl);

  document.body.appendChild(panel);

  // On-screen opener, for touch and for players who never learn I.
  equipBtn = document.createElement('div');
  equipBtn.id = 'equipBtn';
  equipBtn.textContent = 'EQUIPMENT';
  equipBtn.addEventListener('click', () => toggleVehicleMenu());
  document.body.appendChild(equipBtn);

  // a click past the panel edge grabs pointer lock and hides the cursor —
  // treat it as "back to playing" and put the dialog away
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) closeVehicleMenu();
  });
}

// On-foot only — controls.js drives this alongside the walk hint.
export function setEquipButtonVisible(v) {
  if (equipBtn) equipBtn.classList.toggle('on', !!v);
}

export function openVehicleMenu() {
  if (menuOpen) return;
  menuOpen = true;
  refresh();
  panel.classList.add('open');
  document.addEventListener('keydown', onPanelKey);
  if (document.pointerLockElement) document.exitPointerLock();
}

export function closeVehicleMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  panel.classList.remove('open');
  document.removeEventListener('keydown', onPanelKey);
}

export function toggleVehicleMenu() {
  if (menuOpen) closeVehicleMenu();
  else openVehicleMenu();
}

export function isVehicleMenuOpen() {
  return menuOpen;
}
