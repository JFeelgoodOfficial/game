// Close-up of the ship's terrarium — E at the glass in the stern lounge.
//
// The same tank (src/terrarium.js draws both, from one simulation), large, with
// each creature named. Opening and closing on E is owned by game.js, as for the
// paintings (src/artView.js); X closes from here, and so does a tap. Never
// Escape — that would drop pointer lock.

import { SPECIMEN_ORDER } from '../world/coin-bestiary.js';
import { drawTank } from './terrarium.js';

const CSS = `
#terrview {
  position: fixed; inset: 0; z-index: 22; display: none;
  flex-direction: column; align-items: center; justify-content: center;
  background: rgba(4,5,9,0.9); user-select: none;
  font-family: 'Courier New', ui-monospace, monospace;
}
#terrview.open { display: flex; }
#terrview canvas {
  width: min(88vw, 148vh); aspect-ratio: 2 / 1; image-rendering: pixelated;
  border: 1px solid rgba(200,168,106,0.55);
  box-shadow: 0 0 60px rgba(0,0,0,0.8), 0 0 34px rgba(200,168,106,0.16);
}
#terrview .tv-title {
  margin-top: 18px; font-size: 15px; letter-spacing: 0.38em; color: #e8d9b0;
  text-align: center; text-shadow: 0 0 10px rgba(200,168,106,0.5);
}
#terrview .tv-count {
  margin-top: 7px; font-size: 10px; letter-spacing: 0.34em; color: #c8a86a;
}
#terrview .tv-foot {
  margin-top: 14px; font-size: 10px; letter-spacing: 0.3em; color: #6f6650;
}
`;

let panel = null;
let canvas = null;
let g = null;
let countEl = null;
let open = false;
let shown = -1;

function onKey(e) {
  if (e.code === 'KeyX') closeTerrariumView();
}

export function initTerrariumView() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  panel = document.createElement('div');
  panel.id = 'terrview';
  canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 384;
  g = canvas.getContext('2d');
  const title = document.createElement('div');
  title.className = 'tv-title';
  title.textContent = 'FOR STEVEN & LACEY';
  countEl = document.createElement('div');
  countEl.className = 'tv-count';
  const foot = document.createElement('div');
  foot.className = 'tv-foot';
  foot.textContent = 'E / X — CLOSE';
  panel.append(canvas, title, countEl, foot);
  panel.addEventListener('click', closeTerrariumView);
  document.body.appendChild(panel);
}

export function openTerrariumView() {
  if (!panel || open) return;
  open = true;
  shown = -1;
  panel.classList.add('open');
  window.addEventListener('keydown', onKey);
}

export function closeTerrariumView() {
  if (!open) return;
  open = false;
  panel.classList.remove('open');
  window.removeEventListener('keydown', onKey);
}

export function isTerrariumViewOpen() {
  return open;
}

// Called by the terrarium every frame while this is open.
export function drawTerrariumView(state) {
  if (!open) return;
  drawTank(g, state, canvas.width, canvas.height, true);
  if (state.mons.length !== shown) {
    shown = state.mons.length;
    countEl.textContent = `${shown} / ${SPECIMEN_ORDER.length} BROUGHT HOME FROM STEVENLACEY`;
  }
}
