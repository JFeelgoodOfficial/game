// Close-up viewer for a gallery painting — E in front of a canvas in the
// freighter's hall. Opening/closing on E is owned by game.js (via
// input.interact, so it can't double-fire); X also closes from here. Never
// Escape — that would drop pointer lock.

import { galleryUrl } from './gallery.js';

const CSS = `
#artview {
  position: fixed; inset: 0; z-index: 22; display: none;
  flex-direction: column; align-items: center; justify-content: center;
  background: rgba(4,5,9,0.9); user-select: none;
  font-family: 'Courier New', ui-monospace, monospace;
}
#artview.open { display: flex; }
#artview img {
  max-width: 88vw; max-height: 74vh; object-fit: contain;
  border: 1px solid rgba(200,168,106,0.55);
  box-shadow: 0 0 60px rgba(0,0,0,0.8), 0 0 34px rgba(200,168,106,0.16);
}
#artview .av-title {
  margin-top: 18px; font-size: 15px; letter-spacing: 0.38em; color: #e8d9b0;
  text-align: center; text-shadow: 0 0 10px rgba(200,168,106,0.5);
}
#artview .av-by {
  margin-top: 7px; font-size: 10px; letter-spacing: 0.34em; color: #c8a86a;
}
#artview .av-foot {
  margin-top: 14px; font-size: 10px; letter-spacing: 0.3em; color: #6f6650;
}
`;

let panel = null;
let img = null;
let titleEl = null;
let open = false;

function onKey(e) {
  if (e.code === 'KeyX') closeArtView();
}

export function initArtView() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  panel = document.createElement('div');
  panel.id = 'artview';
  img = document.createElement('img');
  img.alt = '';
  titleEl = document.createElement('div');
  titleEl.className = 'av-title';
  const by = document.createElement('div');
  by.className = 'av-by';
  by.textContent = 'JFEELGOOD';
  const foot = document.createElement('div');
  foot.className = 'av-foot';
  foot.textContent = 'E / X — CLOSE';
  panel.append(img, titleEl, by, foot);
  // a tap anywhere closes it — touch players have no X key
  panel.addEventListener('click', closeArtView);
  document.body.appendChild(panel);
}

export function openArtView(file, title) {
  if (!panel || open) return;
  open = true;
  img.src = galleryUrl(file); // already in the HTTP cache: the hall fetched it
  titleEl.textContent = title.toUpperCase();
  panel.classList.add('open');
  window.addEventListener('keydown', onKey);
}

export function closeArtView() {
  if (!open) return;
  open = false;
  panel.classList.remove('open');
  window.removeEventListener('keydown', onKey);
}

export function isArtViewOpen() {
  return open;
}
