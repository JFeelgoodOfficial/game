// Settings dialog + pause overlay (audit fix). Follows the DOM-overlay
// pattern of menu.js / controls.js: injected CSS, monospace styling, opened
// from the start menu and from the P pause overlay. The dialog closes on X
// (key or button) — never Escape, which is reserved by pointer lock.

import { settings, saveSettings } from './settings.js';

const CSS = `
#pauseOverlay {
  position: fixed; inset: 0; z-index: 26;
  display: none; flex-direction: column; align-items: center; justify-content: center;
  gap: 24px; background: rgba(2,0,8,0.62);
  font-family: 'Courier New', ui-monospace, monospace; color: #a9f7ff;
  user-select: none;
}
#pauseOverlay.open { display: flex; }
#pauseOverlay .p-title {
  font-size: 26px; letter-spacing: 0.5em; color: #ffc9ec;
  text-shadow: 0 0 18px rgba(212,64,143,0.8);
}
#pauseOverlay .p-sub { font-size: 11px; letter-spacing: 0.3em; color: #5da8b3; }
#pauseOverlay button, #settingsPanel button {
  font-family: inherit; font-size: 13px; letter-spacing: 0.3em; padding: 10px 34px;
  background: rgba(130,247,255,0.06); color: #a9f7ff; cursor: pointer;
  border: 1px solid rgba(130,247,255,0.5); border-radius: 4px;
  text-shadow: 0 0 8px rgba(130,247,255,0.7);
  transition: background 0.15s;
}
#pauseOverlay button:hover, #settingsPanel button:hover {
  background: rgba(130,247,255,0.16);
}
#settingsPanel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  z-index: 34; display: none; flex-direction: column; gap: 14px;
  width: min(360px, 92vw); box-sizing: border-box;
  max-height: 86vh; overflow-y: auto;
  padding: 20px 26px 16px; border-radius: 6px;
  font-family: 'Courier New', ui-monospace, monospace; color: #a9f7ff;
  background: rgba(4,12,20,0.92); border: 1px solid rgba(130,247,255,0.55);
  box-shadow: 0 0 44px rgba(130,247,255,0.3), inset 0 0 30px rgba(130,247,255,0.06);
  user-select: none;
}
#settingsPanel.open { display: flex; }
#settingsPanel .s-title {
  font-size: 12px; letter-spacing: 0.42em; color: #7ad7e0; text-align: center;
  text-shadow: 0 0 8px rgba(130,247,255,0.6); margin-bottom: 4px;
}
#settingsPanel .s-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 18px; font-size: 11px; letter-spacing: 0.22em; color: #9fd8e8;
}
#settingsPanel .s-row input[type="range"] { width: 150px; accent-color: #d4408f; }
#settingsPanel .s-row input[type="checkbox"] {
  width: 16px; height: 16px; accent-color: #d4408f;
}
#settingsPanel .s-val { color: #82f7ff; min-width: 42px; text-align: right; }
#settingsPanel .s-quality { display: flex; gap: 8px; }
#settingsPanel .s-quality button { padding: 6px 16px; font-size: 11px; }
#settingsPanel .s-quality button.sel {
  background: rgba(212,64,143,0.28); color: #ffd0ee;
  border-color: rgba(212,64,143,0.8);
}
#settingsPanel .s-foot {
  font-size: 10px; letter-spacing: 0.26em; color: #5da8b3;
  margin-top: 4px; text-align: center;
}
@media (max-width: 640px) {
  #settingsPanel { padding: 16px 16px 12px; gap: 11px; }
  #settingsPanel .s-row { flex-wrap: wrap; }
  #settingsPanel .s-row input[type="range"] { width: min(150px, 42vw); }
}
@media (pointer: coarse) {
  #settingsPanel .s-row input[type="checkbox"] { width: 22px; height: 22px; }
  #settingsPanel .s-quality button { padding: 12px 16px; }
}
`;

let overlay, panel;
let settingsOpen = false;
let onResumeCb = null;
// live-updating widgets, refreshed when the panel opens
let volSlider, volVal, muteBox, sensSlider, sensVal, invertBox, qHigh, qLow;

function row(parent, label) {
  const r = document.createElement('div');
  r.className = 's-row';
  const l = document.createElement('div');
  l.textContent = label;
  r.appendChild(l);
  parent.appendChild(r);
  return r;
}

function refreshWidgets() {
  volSlider.value = String(Math.round(settings.musicVolume * 100));
  volVal.textContent = `${Math.round(settings.musicVolume * 100)}%`;
  muteBox.checked = settings.muted;
  sensSlider.value = String(Math.round(settings.sensitivity * 100));
  sensVal.textContent = `${Math.round(settings.sensitivity * 100)}%`;
  invertBox.checked = settings.invertY;
  qHigh.classList.toggle('sel', settings.quality === 'high');
  qLow.classList.toggle('sel', settings.quality === 'low');
}

function onPanelKey(e) {
  if (e.code === 'KeyX') closeSettings();
}

export function initSettingsPanel() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // --- pause overlay ---
  overlay = document.createElement('div');
  overlay.id = 'pauseOverlay';
  const t = document.createElement('div');
  t.className = 'p-title';
  t.textContent = 'PAUSED';
  overlay.appendChild(t);
  const resume = document.createElement('button');
  resume.textContent = 'RESUME';
  resume.addEventListener('click', () => onResumeCb && onResumeCb());
  overlay.appendChild(resume);
  const settingsBtn = document.createElement('button');
  settingsBtn.textContent = 'SETTINGS';
  settingsBtn.addEventListener('click', () => openSettings());
  overlay.appendChild(settingsBtn);
  const sub = document.createElement('div');
  sub.className = 'p-sub';
  sub.textContent = 'BACKSPACE — RESUME';
  overlay.appendChild(sub);
  document.body.appendChild(overlay);

  // --- settings dialog ---
  panel = document.createElement('div');
  panel.id = 'settingsPanel';
  const title = document.createElement('div');
  title.className = 's-title';
  title.textContent = 'SETTINGS';
  panel.appendChild(title);

  const volRow = row(panel, 'MUSIC VOLUME');
  volSlider = document.createElement('input');
  volSlider.type = 'range';
  volSlider.min = '0';
  volSlider.max = '100';
  volVal = document.createElement('div');
  volVal.className = 's-val';
  volSlider.addEventListener('input', () => {
    settings.musicVolume = volSlider.value / 100;
    volVal.textContent = `${volSlider.value}%`;
    saveSettings();
  });
  volRow.appendChild(volSlider);
  volRow.appendChild(volVal);

  const muteRow = row(panel, 'MUTE MUSIC');
  muteBox = document.createElement('input');
  muteBox.type = 'checkbox';
  muteBox.addEventListener('change', () => {
    settings.muted = muteBox.checked;
    saveSettings();
  });
  muteRow.appendChild(muteBox);

  const sensRow = row(panel, 'MOUSE SENSITIVITY');
  sensSlider = document.createElement('input');
  sensSlider.type = 'range';
  sensSlider.min = '25';
  sensSlider.max = '300';
  sensVal = document.createElement('div');
  sensVal.className = 's-val';
  sensSlider.addEventListener('input', () => {
    settings.sensitivity = sensSlider.value / 100;
    sensVal.textContent = `${sensSlider.value}%`;
    saveSettings();
  });
  sensRow.appendChild(sensSlider);
  sensRow.appendChild(sensVal);

  const invRow = row(panel, 'INVERT Y');
  invertBox = document.createElement('input');
  invertBox.type = 'checkbox';
  invertBox.addEventListener('change', () => {
    settings.invertY = invertBox.checked;
    saveSettings();
  });
  invRow.appendChild(invertBox);

  const qRow = row(panel, 'QUALITY');
  const qWrap = document.createElement('div');
  qWrap.className = 's-quality';
  qHigh = document.createElement('button');
  qHigh.textContent = 'HIGH';
  qLow = document.createElement('button');
  qLow.textContent = 'LOW';
  const setQ = (q) => {
    settings.quality = q;
    saveSettings();
    refreshWidgets();
  };
  qHigh.addEventListener('click', () => setQ('high'));
  qLow.addEventListener('click', () => setQ('low'));
  qWrap.appendChild(qHigh);
  qWrap.appendChild(qLow);
  qRow.appendChild(qWrap);

  const close = document.createElement('button');
  close.textContent = 'CLOSE';
  close.addEventListener('click', () => closeSettings());
  panel.appendChild(close);

  const foot = document.createElement('div');
  foot.className = 's-foot';
  foot.textContent = 'X — CLOSE';
  panel.appendChild(foot);

  document.body.appendChild(panel);
}

export function openSettings() {
  if (settingsOpen) return;
  settingsOpen = true;
  refreshWidgets();
  panel.classList.add('open');
  document.addEventListener('keydown', onPanelKey);
}

export function closeSettings() {
  if (!settingsOpen) return;
  settingsOpen = false;
  panel.classList.remove('open');
  document.removeEventListener('keydown', onPanelKey);
}

export function isSettingsOpen() {
  return settingsOpen;
}

// main.js owns the paused state; the overlay is just its face.
export function showPauseOverlay(onResume) {
  onResumeCb = onResume;
  overlay.classList.add('open');
}

export function hidePauseOverlay() {
  overlay.classList.remove('open');
  closeSettings();
}
