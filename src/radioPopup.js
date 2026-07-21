// Ship radio pop-up (user mechanic) — opened from the RADIO button on the 3D
// dashboard (cockpit3d.js). Follows the settingsPanel.js dialog pattern:
// injected CSS, `.open` class, closes on X (key or button) — never Escape,
// which is reserved by pointer lock. Unlike settings it floats over live
// flight, so it also closes itself if the pointer locks (a canvas click
// beside the panel would hide the cursor it needs).
//
// `,` and `.` still switch tracks from the keyboard, popup open or not.

import {
  nextTrack,
  prevTrack,
  currentTitle,
  onTrackChange,
  trackTitles,
  getCurrentIndex,
  playTrackAt,
  isMusicPlaying,
  toggleMusicPlayback,
  onPlayStateChange,
} from './music.js';

const CSS = `
#radioPanel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  z-index: 24; display: none; flex-direction: column; gap: 12px;
  width: min(360px, 92vw); box-sizing: border-box;
  max-height: min(70vh, 540px);
  padding: 18px 22px 14px; border-radius: 6px;
  font-family: 'Courier New', ui-monospace, monospace; color: #a9f7ff;
  background: rgba(4,12,20,0.92); border: 1px solid rgba(130,247,255,0.55);
  box-shadow: 0 0 44px rgba(130,247,255,0.3), inset 0 0 30px rgba(130,247,255,0.06);
  user-select: none;
}
#radioPanel.open { display: flex; }
#radioPanel .rp-title {
  font-size: 12px; letter-spacing: 0.42em; color: #7ad7e0; text-align: center;
  text-shadow: 0 0 8px rgba(130,247,255,0.6);
}
#radioPanel .rp-now {
  font-size: 11px; letter-spacing: 0.18em; text-align: center; line-height: 1.7;
  color: #82f7ff; text-shadow: 0 0 8px rgba(130,247,255,0.8);
  padding: 7px 10px; border-radius: 2px;
  background: rgba(4,10,16,0.85); border: 1px solid rgba(130,247,255,0.3);
  box-shadow: inset 0 0 10px rgba(0,0,0,0.6);
}
#radioPanel button {
  font-family: inherit; letter-spacing: 0.2em; cursor: pointer;
  background: rgba(130,247,255,0.06); color: #a9f7ff;
  border: 1px solid rgba(130,247,255,0.5); border-radius: 4px;
  text-shadow: 0 0 8px rgba(130,247,255,0.7);
  transition: background 0.15s;
}
#radioPanel button:hover { background: rgba(130,247,255,0.16); }
#radioPanel .rp-controls { display: flex; justify-content: center; gap: 12px; }
#radioPanel .rp-controls button {
  font-size: 17px; line-height: 1; min-width: 52px; min-height: 44px;
  color: #ffc9ec; border-color: rgba(212,64,143,0.55);
  background: rgba(212,64,143,0.12);
  text-shadow: 0 0 8px rgba(255,120,200,0.6);
}
#radioPanel .rp-controls button:hover { background: rgba(212,64,143,0.32); }
#radioPanel .rp-list {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 5px;
  padding: 2px; scrollbar-width: thin;
}
#radioPanel .rp-track {
  font-size: 10px; letter-spacing: 0.14em; text-align: left;
  padding: 9px 10px; min-height: 36px;
}
#radioPanel .rp-track.sel {
  background: rgba(212,64,143,0.28); color: #ffd0ee;
  border-color: rgba(212,64,143,0.8);
}
#radioPanel .rp-close { font-size: 13px; letter-spacing: 0.3em; padding: 10px 34px; }
#radioPanel .rp-foot {
  font-size: 10px; letter-spacing: 0.26em; color: #5da8b3; text-align: center;
}
@media (max-width: 640px) {
  #radioPanel { width: 92vw; max-height: 78vh; padding: 14px; }
}
@media (pointer: coarse) {
  #radioPanel .rp-track { min-height: 44px; }
}
`;

let panel, nowLine, playBtn;
let trackRows = [];
let popupOpen = false;

function refresh() {
  nowLine.textContent = currentTitle();
  playBtn.textContent = isMusicPlaying() ? '⏸' : '⏵';
  const cur = getCurrentIndex();
  trackRows.forEach((row, i) => row.classList.toggle('sel', i === cur));
  if (popupOpen && trackRows[cur]) trackRows[cur].scrollIntoView({ block: 'nearest' });
}

function onPanelKey(e) {
  if (e.code === 'KeyX') closeRadioPopup();
}

export function initRadioPopup() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  panel = document.createElement('div');
  panel.id = 'radioPanel';

  const title = document.createElement('div');
  title.className = 'rp-title';
  title.textContent = 'SHIP RADIO';
  panel.appendChild(title);

  nowLine = document.createElement('div');
  nowLine.className = 'rp-now';
  panel.appendChild(nowLine);

  const controls = document.createElement('div');
  controls.className = 'rp-controls';
  const prev = document.createElement('button');
  prev.textContent = '⏮';
  prev.addEventListener('click', prevTrack);
  controls.appendChild(prev);
  playBtn = document.createElement('button');
  playBtn.addEventListener('click', toggleMusicPlayback);
  controls.appendChild(playBtn);
  const next = document.createElement('button');
  next.textContent = '⏭';
  next.addEventListener('click', nextTrack);
  controls.appendChild(next);
  panel.appendChild(controls);

  const list = document.createElement('div');
  list.className = 'rp-list';
  trackRows = trackTitles().map((t, i) => {
    const row = document.createElement('button');
    row.className = 'rp-track';
    row.textContent = t;
    row.addEventListener('click', () => playTrackAt(i));
    list.appendChild(row);
    return row;
  });
  panel.appendChild(list);

  const close = document.createElement('button');
  close.className = 'rp-close';
  close.textContent = 'CLOSE';
  close.addEventListener('click', () => closeRadioPopup());
  panel.appendChild(close);

  const foot = document.createElement('div');
  foot.className = 'rp-foot';
  foot.textContent = 'X — CLOSE';
  panel.appendChild(foot);

  document.body.appendChild(panel);
  onTrackChange(refresh);
  onPlayStateChange(refresh);
  refresh();

  // a click past the panel edge grabs pointer lock and hides the cursor —
  // treat it as "back to flying" and put the dialog away
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) closeRadioPopup();
  });

  // keyboard track switching works even when the pointer is locked
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Comma') prevTrack();
    if (e.code === 'Period') nextTrack();
  });
}

export function openRadioPopup() {
  if (popupOpen) return;
  popupOpen = true;
  refresh();
  panel.classList.add('open');
  document.addEventListener('keydown', onPanelKey);
}

export function closeRadioPopup() {
  if (!popupOpen) return;
  popupOpen = false;
  panel.classList.remove('open');
  document.removeEventListener('keydown', onPanelKey);
}

export function toggleRadioPopup() {
  if (popupOpen) closeRadioPopup();
  else openRadioPopup();
}

export function isRadioPopupOpen() {
  return popupOpen;
}
